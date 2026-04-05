import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, deleteRecord } from "@/lib/airtable/client";
import { deleteShortLink } from "@/lib/short-io";
import { deleteImage, isBlobUrl } from "@/lib/blob-storage";
import { createBrandClient } from "@/lib/late-api/client";

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
          fields["Scheduled Date"] = "";
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

    // Scheduled date
    if (body.scheduledDate !== undefined) {
      fields["Scheduled Date"] = body.scheduledDate;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    await updateRecord("Posts", id, fields);

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
    }>("Posts", id);

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
