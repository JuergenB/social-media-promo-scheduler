import { getRecord, updateRecord } from "@/lib/airtable/client";
import { createBrandClient } from "@/lib/late-api/client";
import { parseMediaItems } from "@/lib/media-items";

export interface SyncResult {
  zernio: "skipped" | "ok" | "error";
  lnkBio: "skipped" | "ok" | "error";
}

interface PostFields {
  "Zernio Post ID": string;
  "Lnk.Bio Entry ID": string;
  "Short URL": string;
  "Scheduled Date": string;
  Campaign: string[];
  Content: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
  "First Comment": string;
  Platform: string;
  Collaborators: string;
  "User Tags": string;
  "Carousel PDF URL"?: string;
}

interface CampaignFieldsForSync {
  Name?: string;
}

interface CampaignFields {
  Brand: string[];
}

interface BrandFields {
  "Zernio API Key Label": string;
  "Lnk.Bio Enabled": boolean;
  "Lnk.Bio Group ID": string;
  "Lnk.Bio Client ID Label": string;
  "Lnk.Bio Client Secret Label": string;
  Timezone: string;
}

// Any route that writes post content/media/schedule fields is expected to call
// this immediately after the Airtable write — otherwise downstream services
// (Zernio, lnk.bio) silently drift from the source of truth. Callers should
// fire-and-forget so the response isn't blocked on external APIs. Never throws.
export async function syncPostDownstream(postId: string): Promise<SyncResult> {
  const result: SyncResult = { zernio: "skipped", lnkBio: "skipped" };

  try {
    const post = await getRecord<PostFields>("Posts", postId);
    const campaignId = post.fields.Campaign?.[0];
    if (!campaignId) return result;

    const campaign = await getRecord<CampaignFields & CampaignFieldsForSync>(
      "Campaigns",
      campaignId,
    );
    const brandId = campaign.fields.Brand?.[0];
    if (!brandId) return result;

    const brand = await getRecord<BrandFields>("Brands", brandId);

    await Promise.allSettled([
      syncZernio(postId, post.fields, brand.fields, campaign.fields.Name).then(
        (ok) => { result.zernio = ok ? "ok" : "skipped"; },
        (err) => {
          console.warn(`[post-sync] Zernio failed for ${postId}:`, err);
          result.zernio = "error";
        }
      ),
      syncLnkBio(postId, post.fields, brand.fields).then(
        (ok) => { result.lnkBio = ok ? "ok" : "skipped"; },
        (err) => {
          console.warn(`[post-sync] lnk.bio failed for ${postId}:`, err);
          result.lnkBio = "error";
        }
      ),
    ]);
  } catch (err) {
    console.warn(`[post-sync] Failed to resolve post/campaign/brand for ${postId}:`, err);
  }

  return result;
}

async function syncZernio(
  postId: string,
  post: PostFields,
  brand: BrandFields,
  campaignName?: string
): Promise<boolean> {
  const zernioPostId = post["Zernio Post ID"];
  if (!zernioPostId) return false;

  const client = createBrandClient({
    zernioApiKeyLabel: brand["Zernio API Key Label"] || null,
  });

  // scheduledFor is REQUIRED on every update — omitting it reverts Zernio
  // from "scheduled" to "draft" status.
  const platformLower = (post.Platform || "").toLowerCase();
  const userPdfUrl = post["Carousel PDF URL"];
  const updateBody: Record<string, unknown> = {};
  if (post.Content) updateBody.content = post.Content;
  if (platformLower === "linkedin" && userPdfUrl) {
    // User-supplied PDF override — single document item, image grid ignored.
    // Mirrors the publish-route logic at /api/posts/[id]/publish.
    const filename = `${(campaignName || "Carousel").slice(0, 60)}.pdf`;
    updateBody.mediaItems = [
      { type: "document" as const, url: userPdfUrl, filename },
    ];
  } else {
    const mediaItems = parseMediaItems(post);
    if (mediaItems.length > 0) {
      updateBody.mediaItems = mediaItems.map((m) => ({
        type: "image" as const,
        url: m.url,
      }));
    }
  }
  if (post["Scheduled Date"]) updateBody.scheduledFor = post["Scheduled Date"];

  // Platform-specific data (firstComment for IG/FB/LI, collaborators + userTags for IG).
  // Must be nested inside platforms[] entry AND include accountId — otherwise
  // it is either silently ignored or nullifies the account link.
  const platform = platformLower;
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

  if (Object.keys(psd).length > 0) {
    const { data: existing } = await client.posts.getPost({ path: { postId: zernioPostId } });
    const platforms = (existing as {
      post?: { platforms?: Array<{ platform?: string; accountId?: string | { _id: string } }> };
    })?.post?.platforms;
    const existingPlatform = platforms?.find((p) => p.platform === platform);
    const accountId = typeof existingPlatform?.accountId === "string"
      ? existingPlatform.accountId
      : existingPlatform?.accountId?._id;
    if (accountId) {
      updateBody.platforms = [{ platform, accountId, platformSpecificData: psd }];
    } else {
      console.warn(`[post-sync] ${postId}: could not resolve accountId; skipping platformSpecificData`);
    }
  }

  const { error } = await client.posts.updatePost({
    path: { postId: zernioPostId },
    body: updateBody,
  });
  if (error) throw new Error(`updatePost: ${JSON.stringify(error)}`);

  console.log(`[post-sync] Synced Zernio ${zernioPostId} for ${postId}`);
  return true;
}

async function syncLnkBio(
  postId: string,
  post: PostFields,
  brand: BrandFields
): Promise<boolean> {
  const entryId = post["Lnk.Bio Entry ID"];
  if (!entryId) return false;
  if (post.Platform !== "Instagram") return false;
  if (!brand["Lnk.Bio Enabled"]) return false;

  const { deleteLnkBioEntry, createLnkBioEntry, resolveCredentials, resolveConfig } =
    await import("@/lib/lnk-bio");

  const creds = resolveCredentials({
    lnkBioEnabled: brand["Lnk.Bio Enabled"],
    lnkBioClientIdLabel: brand["Lnk.Bio Client ID Label"] || null,
    lnkBioClientSecretLabel: brand["Lnk.Bio Client Secret Label"] || null,
  });
  if (!creds) return false;

  const cfg = resolveConfig({
    lnkBioEnabled: brand["Lnk.Bio Enabled"],
    lnkBioGroupId: brand["Lnk.Bio Group ID"] || null,
    lnkBioClientIdLabel: brand["Lnk.Bio Client ID Label"] || null,
    lnkBioClientSecretLabel: brand["Lnk.Bio Client Secret Label"] || null,
  });
  const shortUrl = post["Short URL"];
  if (!cfg || !shortUrl) return false;

  await deleteLnkBioEntry(creds, entryId);

  try {
    const newId = await createLnkBioEntry(cfg, {
      title: (post.Content || "").split("\n")[0].slice(0, 100) || "Link",
      link: shortUrl,
      image: post["Image URL"] || "",
      scheduledDate: post["Scheduled Date"],
      timezone: brand.Timezone || "America/New_York",
    });
    await updateRecord("Posts", postId, { "Lnk.Bio Entry ID": newId || "" });
    console.log(`[post-sync] lnk.bio recreated ${entryId} → ${newId} for ${postId}`);
    return true;
  } catch (err) {
    console.warn(`[post-sync] lnk.bio recreate failed for ${postId}, clearing entry id:`, err);
    await updateRecord("Posts", postId, { "Lnk.Bio Entry ID": "" });
    throw err;
  }
}
