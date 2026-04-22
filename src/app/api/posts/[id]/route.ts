import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, deleteRecord } from "@/lib/airtable/client";
import { deleteShortLink } from "@/lib/short-io";
import { deleteImage, isBlobUrl } from "@/lib/blob-storage";
import { createBrandClient } from "@/lib/late-api/client";
import { parseMediaItems } from "@/lib/media-items";

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
      if (body.imageUrl !== undefined) {
        fields["Image URL"] = body.imageUrl;
      }
      if (body.mediaUrls !== undefined) {
        fields["Media URLs"] = body.mediaUrls;
      }
      if (body.mediaCaptions !== undefined) {
        fields["Media Captions"] = body.mediaCaptions;
      }
      if (body.originalMedia !== undefined) {
        fields["Original Media"] = body.originalMedia;
      }
    }

    // Content
    if (body.content !== undefined) {
      fields["Content"] = body.content;
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

      // On dismiss, clean up Short.io link
      if (body.status === "Dismissed" && body.shortUrl) {
        try {
          await deleteShortLink(body.shortUrl, body.brand);
        } catch (err) {
          console.warn(`[posts] Failed to delete short link on dismiss:`, err);
        }
      }
    }

    // First comment (hashtags + engagement hook)
    if (body.firstComment !== undefined) {
      fields["First Comment"] = body.firstComment;
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

    // Status changes that should tear down a scheduled lnk.bio entry
    const statusChangedAwayFromScheduled =
      body.status !== undefined && body.status !== "Scheduled" && body.status !== "Published";

    // Reschedule / edit that should delete-then-recreate the lnk.bio entry
    const lnkBioShouldRecreate =
      body.scheduledDate !== undefined
      || body.content !== undefined
      || body.imageUrl !== undefined;

    if (statusChangedAwayFromScheduled || lnkBioShouldRecreate) {
      (async () => {
        try {
          const post = await getRecord<{
            "Lnk.Bio Entry ID": string;
            "Short URL": string;
            "Image URL": string;
            "Scheduled Date": string;
            Content: string;
            Platform: string;
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
            "Lnk.Bio Group ID": string;
            "Lnk.Bio Client ID Label": string;
            "Lnk.Bio Client Secret Label": string;
          }>("Brands", brandId);

          const { deleteLnkBioEntry, createLnkBioEntry, resolveCredentials, resolveConfig } =
            await import("@/lib/lnk-bio");

          const creds = resolveCredentials({
            lnkBioEnabled: brand.fields["Lnk.Bio Enabled"],
            lnkBioClientIdLabel: brand.fields["Lnk.Bio Client ID Label"] || null,
            lnkBioClientSecretLabel: brand.fields["Lnk.Bio Client Secret Label"] || null,
          });
          if (!creds) return;

          await deleteLnkBioEntry(creds, entryId);

          const isInstagram = post.fields.Platform === "Instagram";
          if (statusChangedAwayFromScheduled || !isInstagram) {
            await updateRecord("Posts", id, { "Lnk.Bio Entry ID": "" });
            return;
          }

          // Recreate with latest values
          const cfg = resolveConfig({
            lnkBioEnabled: brand.fields["Lnk.Bio Enabled"],
            lnkBioGroupId: brand.fields["Lnk.Bio Group ID"] || null,
            lnkBioClientIdLabel: brand.fields["Lnk.Bio Client ID Label"] || null,
            lnkBioClientSecretLabel: brand.fields["Lnk.Bio Client Secret Label"] || null,
          });
          const shortUrl = post.fields["Short URL"];
          if (!cfg || !shortUrl) {
            await updateRecord("Posts", id, { "Lnk.Bio Entry ID": "" });
            return;
          }

          try {
            const newId = await createLnkBioEntry(cfg, {
              title:
                (post.fields.Content || "").split("\n")[0].slice(0, 100) || "Link",
              link: shortUrl,
              image: post.fields["Image URL"] || "",
              scheduledDate: post.fields["Scheduled Date"],
            });
            await updateRecord("Posts", id, { "Lnk.Bio Entry ID": newId || "" });
          } catch (err) {
            console.warn("[posts] lnk.bio recreate failed:", err);
            await updateRecord("Posts", id, { "Lnk.Bio Entry ID": "" });
          }
        } catch (err) {
          console.warn("[posts] lnk.bio sync error:", err);
        }
      })();
    }

    // Sync content/media/firstComment changes to Zernio if the post is already scheduled
    const contentOrMediaChanged = fields["Content"] !== undefined
      || fields["Image URL"] !== undefined
      || fields["Media URLs"] !== undefined
      || fields["Media Captions"] !== undefined
      || fields["First Comment"] !== undefined
      || fields["Collaborators"] !== undefined
      || fields["User Tags"] !== undefined;

    if (contentOrMediaChanged) {
      // Fire-and-forget: don't block the response on Zernio sync
      (async () => {
        try {
          const post = await getRecord<{
            "Zernio Post ID": string;
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
          }>("Posts", id);

          const zernioPostId = post.fields["Zernio Post ID"];
          if (!zernioPostId) return; // Not scheduled on Zernio — nothing to sync

          // Resolve brand for API key
          const campaignId = post.fields.Campaign?.[0];
          if (!campaignId) return;
          const campaign = await getRecord<{ Brand: string[] }>("Campaigns", campaignId);
          const brandId = campaign.fields.Brand?.[0];
          if (!brandId) return;
          const brand = await getRecord<{ "Zernio API Key Label": string }>("Brands", brandId);
          const client = createBrandClient({
            zernioApiKeyLabel: brand.fields["Zernio API Key Label"] || null,
          });

          // Build update body with current content, media, AND scheduledFor
          // Including scheduledFor is critical — omitting it causes Zernio to
          // revert the post from "scheduled" to "draft" status.
          const mediaItems = parseMediaItems(post.fields);
          const updateBody: Record<string, unknown> = {};

          if (post.fields.Content) {
            updateBody.content = post.fields.Content;
          }
          if (mediaItems.length > 0) {
            updateBody.mediaItems = mediaItems.map((item) => ({
              type: "image" as const,
              url: item.url,
            }));
          }
          if (post.fields["Scheduled Date"]) {
            updateBody.scheduledFor = post.fields["Scheduled Date"];
          }

          // Sync firstComment + collaboration fields to Zernio (Instagram-specific)
          const platform = (post.fields.Platform || "").toLowerCase();
          if (platform === "instagram") {
            const psd: Record<string, unknown> = {};
            if (post.fields["First Comment"]) {
              psd.firstComment = post.fields["First Comment"];
            }
            // Collaborators: JSON array of usernames
            try {
              const collabs: string[] = post.fields.Collaborators
                ? JSON.parse(post.fields.Collaborators)
                : [];
              const cleaned = collabs.map((u) => u.replace(/^@/, ""));
              if (cleaned.length > 0) psd.collaborators = cleaned;
            } catch { /* ignore malformed JSON */ }
            // User Tags: JSON array of usernames → {username, x, y} objects
            try {
              const tags: string[] = post.fields["User Tags"]
                ? JSON.parse(post.fields["User Tags"])
                : [];
              if (tags.length > 0) {
                psd.userTags = tags.map((u) => ({ username: u.replace(/^@/, ""), x: 0.5, y: 0.5 }));
              }
            } catch { /* ignore malformed JSON */ }
            if (Object.keys(psd).length > 0) {
              updateBody.platformSpecificData = psd;
            }
          } else if (["facebook", "linkedin"].includes(platform)) {
            // Non-Instagram platforms: firstComment only
            if (post.fields["First Comment"]) {
              updateBody.platformSpecificData = {
                firstComment: post.fields["First Comment"],
              };
            }
          }

          const { error } = await client.posts.updatePost({
            path: { postId: zernioPostId },
            body: updateBody,
          });

          if (error) {
            console.warn(`[posts] Zernio sync failed for ${zernioPostId}:`, error);
          } else {
            console.log(`[posts] Synced changes to Zernio post ${zernioPostId}`);
          }
        } catch (err) {
          console.warn("[posts] Zernio sync error:", err);
        }
      })();
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

    // Clean up Short.io link
    if (post.fields["Short URL"]) {
      try {
        await deleteShortLink(post.fields["Short URL"]);
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
