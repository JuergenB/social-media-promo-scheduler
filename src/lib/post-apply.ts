/**
 * Apply-Changes flow for already-scheduled posts.
 *
 * Reads the current Airtable state for a post and pushes it to Zernio + lnk.bio
 * in a single serial sequence. This is the only mutation path for downstream
 * services on scheduled posts — edit endpoints write Airtable but skip the
 * sync, eliminating the concurrent-mutation races that produced lnk.bio
 * orphans and Zernio drift.
 *
 * Idempotent: calling apply twice with no intervening edits sends the same
 * data both times. Calling apply on a draft (no Zernio Post ID) is a no-op.
 */
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { createBrandClient } from "@/lib/late-api/client";
import {
  assembleCarouselPDF,
  prepareLinkedInPdfMetadata,
} from "@/lib/pdf-carousel";
import { ensureAspectRatio } from "@/lib/image-crop";

interface PostFields {
  Platform: string;
  Content: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
  "Scheduled Date": string;
  "First Comment": string;
  Collaborators: string;
  "User Tags": string;
  "Carousel PDF URL"?: string;
  "Zernio Post ID": string;
  "Lnk.Bio Entry ID": string;
  "Short URL": string;
  Campaign: string[];
}

interface CampaignFields {
  Brand: string[];
  Description?: string;
  "Editorial Direction"?: string;
}

interface BrandFields {
  "Zernio API Key Label": string;
  Timezone?: string;
  "Outpaint Instead of Crop"?: boolean;
  "Anthropic API Key Label"?: string;
  "Lnk.Bio Enabled"?: boolean;
  "Lnk.Bio Group ID"?: string;
  "Lnk.Bio Client ID Label"?: string;
  "Lnk.Bio Client Secret Label"?: string;
}

export interface ApplyResult {
  zernio: "ok" | "skipped" | "error";
  lnkBio: "ok" | "skipped" | "error";
  error?: string;
}

/**
 * Build the mediaItems array from Airtable's Media Captions JSON when present,
 * or from Media URLs as a fallback. Does NOT mix in `Image URL` — that field
 * is a thumbnail cache, not a media source. (Including it caused Zernio to
 * receive N+1 images for posts where Image URL ≠ Media URLs[0].)
 */
function buildMediaItemsForSync(
  fields: Pick<PostFields, "Media URLs" | "Media Captions" | "Image URL">,
): Array<{ url: string; caption: string }> {
  if (fields["Media Captions"]) {
    try {
      const parsed = JSON.parse(fields["Media Captions"]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((item: { url?: string; caption?: string }) => ({
            url: (item.url || "").trim(),
            caption: item.caption || "",
          }))
          .filter((i) => i.url.length > 0);
      }
    } catch {
      /* fall through */
    }
  }

  const urls = (fields["Media URLs"] || "")
    .split("\n")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (urls.length > 0) {
    return urls.map((url) => ({ url, caption: "" }));
  }

  // Last resort: a post with only Image URL set (single-image draft promoted to scheduled).
  if (fields["Image URL"]) {
    return [{ url: fields["Image URL"], caption: "" }];
  }
  return [];
}

export interface ApplyOptions {
  /**
   * Skip lnk.bio recreate. Per-edit hooks pass true so they don't trigger
   * the lnk.bio race; only the user-driven Apply button (and Reschedule,
   * which chains Apply) refresh lnk.bio.
   */
  skipLnkBio?: boolean;
}

export async function applyPostChanges(
  postId: string,
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const result: ApplyResult = { zernio: "skipped", lnkBio: "skipped" };

  const post = await getRecord<PostFields>("Posts", postId);
  const zernioPostId = post.fields["Zernio Post ID"];
  if (!zernioPostId) return result;

  const campaignId = post.fields.Campaign?.[0];
  if (!campaignId) {
    result.error = "Post has no campaign";
    return result;
  }
  const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
  const brandId = campaign.fields.Brand?.[0];
  if (!brandId) {
    result.error = "Campaign has no brand";
    return result;
  }
  const brand = await getRecord<BrandFields>("Brands", brandId);

  // ─── Zernio ────────────────────────────────────────────────────────────
  // Always sync. updatePost is idempotent (last-write-wins); concurrent
  // edits converge on whichever sync was last to read Airtable.
  try {
    await syncZernio(post.fields, campaign.fields, brand.fields, postId);
    result.zernio = "ok";
  } catch (err) {
    result.zernio = "error";
    result.error = `Zernio: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`[apply] Zernio failed for ${postId}:`, err);
  }

  // ─── lnk.bio ───────────────────────────────────────────────────────────
  // Skipped on per-edit syncs because the API has no idempotent update —
  // we delete-then-create, and concurrent creates produce duplicates.
  // Only the user-driven Apply button refreshes lnk.bio.
  if (opts.skipLnkBio) {
    return result;
  }
  try {
    const status = await syncLnkBio(post.fields, brand.fields, postId);
    result.lnkBio = status;
    if (status === "skipped") {
      // Non-Instagram or no lnk.bio enabled — clear the dirty flag anyway
      // so the Apply button hides.
      await updateRecord("Posts", postId, { "Lnk.Bio Sync Pending": false }).catch(() => {});
    }
  } catch (err) {
    result.lnkBio = "error";
    const msg = err instanceof Error ? err.message : String(err);
    result.error = result.error ? `${result.error}; lnk.bio: ${msg}` : `lnk.bio: ${msg}`;
    console.warn(`[apply] lnk.bio failed for ${postId}:`, err);
  }

  return result;
}

async function syncZernio(
  post: PostFields,
  campaign: CampaignFields,
  brand: BrandFields,
  postId: string,
): Promise<void> {
  const zernioPostId = post["Zernio Post ID"];
  const platform = (post.Platform || "").toLowerCase();

  const client = createBrandClient({
    zernioApiKeyLabel: brand["Zernio API Key Label"] || null,
  });

  // Build mediaItems strictly from Media Captions / Media URLs. No Image URL drift.
  const baseMediaItems = buildMediaItemsForSync(post);

  // Outpaint / crop to platform aspect ratio.
  const outpaintInsteadOfCrop = !!brand["Outpaint Instead of Crop"];
  const adjustedItems = await Promise.all(
    baseMediaItems.map(async (m) => {
      const url = await ensureAspectRatio(m.url, platform, postId, { outpaintInsteadOfCrop });
      return { ...m, url };
    }),
  );

  // Build the Zernio mediaItems. LinkedIn carousels (≥2 images) get assembled
  // into a single PDF document with the AI-generated documentTitle.
  let zernioMedia: Array<{ type: "image" | "document"; url: string; filename?: string }> = [];
  let linkedInDocumentTitle: string | undefined;
  const userPdfUrl = post["Carousel PDF URL"];

  if (platform === "linkedin" && (userPdfUrl || adjustedItems.length > 1)) {
    const meta = await prepareLinkedInPdfMetadata({
      campaignDescription: campaign.Description,
      editorialDirection: campaign["Editorial Direction"],
      postContent: post.Content,
      brand: { anthropicApiKeyLabel: brand["Anthropic API Key Label"] || null },
    });
    linkedInDocumentTitle = meta.documentTitle;

    let pdfUrl: string;
    if (userPdfUrl) {
      pdfUrl = userPdfUrl;
    } else {
      const pdfBuffer = await assembleCarouselPDF(adjustedItems);
      const { data: presignData } = await client.media.getMediaPresignedUrl({
        body: {
          filename: meta.filename,
          contentType: "application/pdf",
          size: pdfBuffer.length,
        },
      });
      if (!presignData?.uploadUrl || !presignData?.publicUrl) {
        throw new Error("PDF presign failed");
      }
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        body: new Uint8Array(pdfBuffer),
        headers: { "Content-Type": "application/pdf" },
      });
      if (!uploadRes.ok) throw new Error(`PDF upload failed: ${uploadRes.status}`);
      pdfUrl = presignData.publicUrl;
    }
    zernioMedia = [{ type: "document", url: pdfUrl, filename: meta.filename }];
  } else {
    zernioMedia = adjustedItems.map((m) => ({ type: "image" as const, url: m.url }));
  }

  // Per-platform data. Always send arrays (even empty) for collaborators/userTags
  // so clearing them in the UI propagates.
  const psd: Record<string, unknown> = {};
  if (platform === "instagram") {
    if (post["First Comment"]) psd.firstComment = post["First Comment"];
    try {
      const collabs: string[] = post.Collaborators ? JSON.parse(post.Collaborators) : [];
      psd.collaborators = collabs.map((u) => u.replace(/^@/, ""));
    } catch {
      psd.collaborators = [];
    }
    try {
      const tags: string[] = post["User Tags"] ? JSON.parse(post["User Tags"]) : [];
      psd.userTags = tags.map((u) => ({ username: u.replace(/^@/, ""), x: 0.5, y: 0.5 }));
    } catch {
      psd.userTags = [];
    }
  } else if (platform === "facebook" || platform === "linkedin") {
    if (post["First Comment"]) psd.firstComment = post["First Comment"];
  }
  if (platform === "linkedin" && linkedInDocumentTitle) {
    psd.documentTitle = linkedInDocumentTitle;
  }

  // Resolve accountId from the live Zernio post — replacing platforms[]
  // without it nullifies the account link.
  const { data: existing } = await client.posts.getPost({ path: { postId: zernioPostId } });
  const existingPlatform = (
    existing as { post?: { platforms?: Array<{ platform?: string; accountId?: string | { _id: string } }> } }
  )?.post?.platforms?.find((p) => p.platform === platform);
  const accountId = typeof existingPlatform?.accountId === "string"
    ? existingPlatform.accountId
    : existingPlatform?.accountId?._id;

  const updateBody: Record<string, unknown> = {
    content: post.Content || "",
    mediaItems: zernioMedia.length > 0 ? zernioMedia : undefined,
    scheduledFor: post["Scheduled Date"], // always include — omitting reverts to draft
  };
  if (accountId && Object.keys(psd).length > 0) {
    updateBody.platforms = [{ platform, accountId, platformSpecificData: psd }];
  }

  const { error } = await client.posts.updatePost({
    path: { postId: zernioPostId },
    body: updateBody,
  });
  if (error) throw new Error(`updatePost: ${JSON.stringify(error)}`);

  console.log(
    `[apply] Zernio ${zernioPostId} synced (${platform}, ${zernioMedia.length} media, scheduledFor=${post["Scheduled Date"]})`,
  );
}

/**
 * Per-edit sync. Two phases:
 *
 *   1. **Awaited (fast):** if the post is scheduled, set `Lnk.Bio Sync Pending`
 *      so the UI can show the Apply Changes button on the next refetch.
 *      Without awaiting, the client's React Query invalidation runs before
 *      the flag write lands and the button stays hidden.
 *
 *   2. **Fire-and-forget (slow):** push current Airtable state to Zernio
 *      (idempotent — safe to race). This is ~1-2s and shouldn't block the
 *      response that triggered the edit.
 *
 * Callers should `await markEdited(id)` so the flag is set before they
 * respond to the client.
 */
export async function markEdited(postId: string): Promise<void> {
  let isScheduled = false;
  try {
    const post = await getRecord<{ "Zernio Post ID": string }>("Posts", postId);
    isScheduled = !!post.fields["Zernio Post ID"];
    if (!isScheduled) return;
    await updateRecord("Posts", postId, { "Lnk.Bio Sync Pending": true });
  } catch (err) {
    console.warn(`[markEdited] flag write failed for ${postId}:`, err);
    return;
  }

  // Background Zernio sync — don't block the caller.
  applyPostChanges(postId, { skipLnkBio: true }).catch((err) => {
    console.warn(`[markEdited] zernio sync failed for ${postId}:`, err);
  });
}

async function syncLnkBio(
  post: PostFields,
  brand: BrandFields,
  postId: string,
): Promise<"ok" | "skipped"> {
  if (post.Platform !== "Instagram") return "skipped";
  if (!brand["Lnk.Bio Enabled"]) return "skipped";

  const entryId = post["Lnk.Bio Entry ID"];
  const shortUrl = post["Short URL"];
  if (!shortUrl) return "skipped";

  const { deleteLnkBioEntry, createLnkBioEntry, resolveCredentials, resolveConfig } =
    await import("@/lib/lnk-bio");

  const creds = resolveCredentials({
    lnkBioEnabled: brand["Lnk.Bio Enabled"],
    lnkBioClientIdLabel: brand["Lnk.Bio Client ID Label"] || null,
    lnkBioClientSecretLabel: brand["Lnk.Bio Client Secret Label"] || null,
  });
  if (!creds) return "skipped";

  const cfg = resolveConfig({
    lnkBioEnabled: brand["Lnk.Bio Enabled"],
    lnkBioGroupId: brand["Lnk.Bio Group ID"] || null,
    lnkBioClientIdLabel: brand["Lnk.Bio Client ID Label"] || null,
    lnkBioClientSecretLabel: brand["Lnk.Bio Client Secret Label"] || null,
  });
  if (!cfg) return "skipped";

  if (entryId) {
    await deleteLnkBioEntry(creds, entryId);
  }

  const newId = await createLnkBioEntry(cfg, {
    title: (post.Content || "").split("\n")[0].slice(0, 100) || "Link",
    link: shortUrl,
    image: post["Image URL"] || "",
    scheduledDate: post["Scheduled Date"],
    timezone: brand.Timezone || "America/New_York",
  });
  await updateRecord("Posts", postId, {
    "Lnk.Bio Entry ID": newId || "",
    "Lnk.Bio Sync Pending": false,
  });
  console.log(`[apply] lnk.bio recreated ${entryId || "(none)"} → ${newId} for ${postId}`);
  return "ok";
}
