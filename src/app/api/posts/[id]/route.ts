import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, deleteRecord } from "@/lib/airtable/client";
import { deleteShortLinkIfUnreferenced } from "@/lib/short-link-deletion";
import { deleteImage, isBlobUrl, mirrorRemoteImageToBlob } from "@/lib/blob-storage";
import { createBrandClient } from "@/lib/late-api/client";
import { stripMarkdownFormatting } from "@/lib/text-sanitizer";

/**
 * PATCH /api/posts/[id]
 *
 * Update a post record. Supports:
 * - status: Update post status (Pending → Approved/Dismissed)
 * - content: Update post text
 * - imageUrl / mediaUrls: Update images
 * - removeImage: Clear all image fields
 * - scheduledDate: Set the scheduled date/time
 * - approvedBy: Record who approved
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const fields: Record<string, unknown> = {};

    // Image handling
    if (body.removeImage) {
      fields["Image URL"] = "";
      fields["Media URLs"] = "";
      fields["Image Upload"] = [];
      fields["Original Media"] = ""; // Clear slide backup when images removed
    } else {
      // Mirror any non-Blob image URLs to Vercel Blob before persisting.
      // Without this, third-party URLs (Airtable signed URLs from the
      // Campaign Image Library, CMS-hosted scraped images, user-pasted
      // URLs) end up in Airtable verbatim and break when the source
      // expires or rotates. See #219.
      const urlsToMirror = new Set<string>();
      if (typeof body.imageUrl === "string" && body.imageUrl) {
        urlsToMirror.add(body.imageUrl);
      }
      if (typeof body.mediaUrls === "string" && body.mediaUrls) {
        for (const line of body.mediaUrls.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) urlsToMirror.add(trimmed);
        }
      }
      if (typeof body.mediaCaptions === "string" && body.mediaCaptions) {
        try {
          const items = JSON.parse(body.mediaCaptions) as Array<{ url?: string }>;
          for (const item of items) {
            if (item?.url) urlsToMirror.add(item.url);
          }
        } catch {
          // Ignore malformed captions JSON; pass through unchanged below.
        }
      }

      const mirrorMap = new Map<string, string>();
      await Promise.all(
        Array.from(urlsToMirror).map(async (url) => {
          if (isBlobUrl(url)) return;
          const mirrored = await mirrorRemoteImageToBlob(url, "posts", id);
          if (mirrored) mirrorMap.set(url, mirrored);
        }),
      );
      const remap = (url: string) => mirrorMap.get(url) ?? url;

      if (body.imageUrl !== undefined) {
        fields["Image URL"] = body.imageUrl ? remap(body.imageUrl) : "";
      }
      if (body.mediaUrls !== undefined) {
        fields["Media URLs"] = body.mediaUrls
          ? body.mediaUrls
              .split("\n")
              .map((line: string) => {
                const trimmed = line.trim();
                return trimmed ? remap(trimmed) : line;
              })
              .join("\n")
          : body.mediaUrls;
      }
      if (body.mediaCaptions !== undefined) {
        try {
          const items = JSON.parse(body.mediaCaptions) as Array<{ url?: string; caption?: string }>;
          for (const item of items) {
            if (item?.url) item.url = remap(item.url);
          }
          fields["Media Captions"] = JSON.stringify(items);
        } catch {
          fields["Media Captions"] = body.mediaCaptions;
        }
      }
      if (body.originalMedia !== undefined) {
        fields["Original Media"] = body.originalMedia;
      }
    }

    // Content — sanitize markdown italics/bolds (curly-quote replacement).
    // Idempotent: a user typing curly quotes directly is preserved as-is.
    // See #222.
    if (body.content !== undefined) {
      fields["Content"] = typeof body.content === "string"
        ? stripMarkdownFormatting(body.content)
        : body.content;
    }

    // Status changes
    if (body.status !== undefined) {
      fields["Status"] = body.status;

      if (body.status === "Approved") {
        fields["Approved By"] = body.approvedBy || "";
        fields["Approved At"] = new Date().toISOString();

        // If retrying a failed/scheduled post, clear Zernio state so it can be re-published
        if (body.clearZernioState) {
          // Capture current Zernio Post ID before clearing, for async cleanup
          let zernioPostIdToDelete: string | undefined;
          try {
            const post = await getRecord<{
              "Zernio Post ID": string;
              Campaign: string[];
            }>("Posts", id);
            zernioPostIdToDelete = post.fields["Zernio Post ID"] || undefined;
            // Store campaign chain for Zernio key resolution (used in fire-and-forget below)
            if (zernioPostIdToDelete) {
              const campaignId = post.fields.Campaign?.[0];
              // Fire-and-forget: delete from Zernio after Airtable update succeeds
              // This runs AFTER the response is sent (see afterZernioCleanup below)
              const cleanupFn = async () => {
                let brandConfig: { zernioApiKeyLabel?: string | null } | undefined;
                if (campaignId) {
                  const campaign = await getRecord<{ Brand: string[] }>("Campaigns", campaignId);
                  const brandId = campaign.fields.Brand?.[0];
                  if (brandId) {
                    const brand = await getRecord<{ "Zernio API Key Label": string }>("Brands", brandId);
                    brandConfig = { zernioApiKeyLabel: brand.fields["Zernio API Key Label"] || null };
                  }
                }
                const late = createBrandClient(brandConfig);
                await late.posts.deletePost({ path: { postId: zernioPostIdToDelete! } });
                console.log(`[posts] Deleted Zernio post ${zernioPostIdToDelete}`);
              };
              // Schedule cleanup but don't block the response
              cleanupFn().catch((err) => {
                console.warn("[posts] Zernio cleanup failed (post may already be removed):", err);
              });
            }
          } catch (err) {
            console.warn("[posts] Failed to read post for Zernio cleanup:", err);
          }
          fields["Zernio Post ID"] = "";
          fields["Scheduled Date"] = null;
        }
      }

      // On dismiss, clean up Short.io link (skip if shared with other posts)
      // and blank the Airtable field so a future re-approve forces a fresh link.
      if (body.status === "Dismissed" && body.shortUrl) {
        try {
          await deleteShortLinkIfUnreferenced(body.shortUrl, [id], body.brand);
        } catch (err) {
          console.warn(`[posts] Failed to delete short link on dismiss:`, err);
        }
        fields["Short URL"] = "";
      }
    }

    // First comment (hashtags + engagement hook) — same markdown sanitation
    // as Content. See #222.
    if (body.firstComment !== undefined) {
      fields["First Comment"] = typeof body.firstComment === "string"
        ? stripMarkdownFormatting(body.firstComment)
        : body.firstComment;
    }

    // Collaborators (Instagram collab invites — JSON string array)
    if (body.collaborators !== undefined) {
      fields["Collaborators"] = body.collaborators;
    }

    // User Tags (Instagram image tags — JSON string array)
    if (body.userTags !== undefined) {
      fields["User Tags"] = body.userTags;
    }

    // Scheduled date
    if (body.scheduledDate !== undefined) {
      fields["Scheduled Date"] = body.scheduledDate;
    }

    // Sort order (user-defined priority for approved posts)
    if (body.sortOrder !== undefined) {
      fields["Sort Order"] = body.sortOrder;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    await updateRecord("Posts", id, fields);

    // For Quick Post campaigns, mirror the post's primary image into the
    // campaign's Image URL so the "My Posts" thumbnail shows the user's
    // uploaded/attached image (Quick Posts often have no og:image on the
    // source page). Fire-and-forget. See #159.
    const imageChanged = fields["Image URL"] !== undefined || fields["Media URLs"] !== undefined;
    if (imageChanged) {
      (async () => {
        try {
          const post = await getRecord<{ Campaign: string[]; "Image URL": string; "Media URLs": string }>("Posts", id);
          const campaignId = post.fields.Campaign?.[0];
          if (!campaignId) return;
          const campaign = await getRecord<{ Name: string }>("Campaigns", campaignId);
          const name = campaign.fields.Name || "";
          if (!name.startsWith("Quick Post:")) return;
          // First URL in Media URLs (comma-separated) or fall back to Image URL
          const mediaUrls = post.fields["Media URLs"] || "";
          const firstMedia = mediaUrls.split(",").map((u) => u.trim()).filter(Boolean)[0] || "";
          const primaryUrl = firstMedia || post.fields["Image URL"] || "";
          await updateRecord("Campaigns", campaignId, { "Image URL": primaryUrl });
        } catch (err) {
          console.warn("[posts] Quick Post campaign image mirror failed:", err);
        }
      })();
    }

    // Status changes that should tear down a scheduled lnk.bio entry.
    // Edit-driven recreate (reschedule / content / image change) is now
    // handled by POST /api/posts/[id]/apply — see #205.
    const statusChangedAwayFromScheduled =
      body.status !== undefined && body.status !== "Scheduled" && body.status !== "Published";

    if (statusChangedAwayFromScheduled) {
      (async () => {
        try {
          const post = await getRecord<{
            "Lnk.Bio Entry ID": string;
            Campaign: string[];
          }>("Posts", id);

          const entryId = post.fields["Lnk.Bio Entry ID"];
          if (!entryId) return;

          const campaignId = post.fields.Campaign?.[0];
          if (!campaignId) return;
          const campaign = await getRecord<{ Brand: string[] }>("Campaigns", campaignId);
          const brandId = campaign.fields.Brand?.[0];
          if (!brandId) return;
          const brand = await getRecord<{
            "Lnk.Bio Enabled": boolean;
            "Lnk.Bio Client ID Label": string;
            "Lnk.Bio Client Secret Label": string;
          }>("Brands", brandId);

          const { deleteLnkBioEntry, resolveCredentials } = await import("@/lib/lnk-bio");

          const creds = resolveCredentials({
            lnkBioEnabled: brand.fields["Lnk.Bio Enabled"],
            lnkBioClientIdLabel: brand.fields["Lnk.Bio Client ID Label"] || null,
            lnkBioClientSecretLabel: brand.fields["Lnk.Bio Client Secret Label"] || null,
          });
          if (!creds) return;

          await deleteLnkBioEntry(creds, entryId);
          await updateRecord("Posts", id, { "Lnk.Bio Entry ID": "" });
        } catch (err) {
          console.warn("[posts] lnk.bio teardown error:", err);
        }
      })();
    }

    // Per-edit Zernio sync (idempotent, safe to race) + mark lnk.bio dirty
    // so the Apply Changes button surfaces. See #205. Note: scheduledDate
    // is included so reschedule via PATCH propagates to Zernio (was the bug
    // that prompted this whole refactor).
    const editAffectsDownstream = fields["Content"] !== undefined
      || fields["Image URL"] !== undefined
      || fields["Media URLs"] !== undefined
      || fields["Media Captions"] !== undefined
      || fields["First Comment"] !== undefined
      || fields["Collaborators"] !== undefined
      || fields["User Tags"] !== undefined
      || fields["Scheduled Date"] !== undefined;

    if (editAffectsDownstream) {
      const { markEdited } = await import("@/lib/post-apply");
      await markEdited(id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update post:", error);
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[id]
 *
 * Delete a post record. Cleans up associated Vercel Blob images and Short.io links.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch post to clean up associated resources
    const post = await getRecord<{
      "Image URL": string;
      "Media URLs": string;
      "Short URL": string;
      "Lnk.Bio Entry ID": string;
      "Zernio Post ID": string;
      Campaign: string[];
    }>("Posts", id);

    // Cancel on Zernio first — if this fails the post would still publish
    // on the scheduled date with broken media URLs (we're about to delete
    // the blobs below).
    const zernioPostId = post.fields["Zernio Post ID"];
    if (zernioPostId) {
      try {
        const campaignId = post.fields.Campaign?.[0];
        let brandConfig: { zernioApiKeyLabel?: string | null } | undefined;
        if (campaignId) {
          const campaign = await getRecord<{ Brand: string[] }>("Campaigns", campaignId);
          const brandId = campaign.fields.Brand?.[0];
          if (brandId) {
            const brand = await getRecord<{ "Zernio API Key Label": string }>("Brands", brandId);
            brandConfig = { zernioApiKeyLabel: brand.fields["Zernio API Key Label"] || null };
          }
        }
        const late = createBrandClient(brandConfig);
        await late.posts.deletePost({ path: { postId: zernioPostId } });
      } catch (err) {
        console.warn(`[posts] Failed to cancel Zernio post ${zernioPostId} on delete:`, err);
      }
    }

    // Clean up Vercel Blob images
    const imageUrl = post.fields["Image URL"] || "";
    const mediaUrls = (post.fields["Media URLs"] || "").split("\n").filter((u) => u.trim());
    const allUrls = [imageUrl, ...mediaUrls].filter((u) => u && isBlobUrl(u));

    for (const url of allUrls) {
      try {
        await deleteImage(url);
      } catch (err) {
        console.warn(`[posts] Failed to delete blob image: ${url}`, err);
      }
    }

    // Clean up Short.io link (skip if still referenced by any other post)
    if (post.fields["Short URL"]) {
      try {
        await deleteShortLinkIfUnreferenced(post.fields["Short URL"], [id]);
      } catch (err) {
        console.warn(`[posts] Failed to delete short link on delete:`, err);
      }
    }

    // Clean up lnk.bio entry (per-brand credentials)
    const lnkBioEntryId = post.fields["Lnk.Bio Entry ID"];
    if (lnkBioEntryId) {
      try {
        const campaignId = post.fields.Campaign?.[0];
        if (campaignId) {
          const campaign = await getRecord<{ Brand: string[] }>("Campaigns", campaignId);
          const brandId = campaign.fields.Brand?.[0];
          if (brandId) {
            const brand = await getRecord<{
              "Lnk.Bio Enabled": boolean;
              "Lnk.Bio Client ID Label": string;
              "Lnk.Bio Client Secret Label": string;
            }>("Brands", brandId);
            const { deleteLnkBioEntry, resolveCredentials } = await import("@/lib/lnk-bio");
            const creds = resolveCredentials({
              lnkBioEnabled: brand.fields["Lnk.Bio Enabled"],
              lnkBioClientIdLabel: brand.fields["Lnk.Bio Client ID Label"] || null,
              lnkBioClientSecretLabel: brand.fields["Lnk.Bio Client Secret Label"] || null,
            });
            if (creds) await deleteLnkBioEntry(creds, lnkBioEntryId);
          }
        }
      } catch (err) {
        console.warn(`[posts] Failed to delete lnk.bio entry on delete:`, err);
      }
    }

    await deleteRecord("Posts", id);

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error("Failed to delete post:", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 }
    );
  }
}
