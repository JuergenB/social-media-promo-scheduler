import { NextRequest, NextResponse } from "next/server";
import { updateRecord, getRecord } from "@/lib/airtable/client";
import { uploadImage, deleteImage, isBlobUrl } from "@/lib/blob-storage";
import { syncPostDownstream } from "@/lib/post-downstream-sync";

/**
 * POST /api/posts/[id]/image
 *
 * Upload an image file for a post. Accepts multipart/form-data with a "file" field.
 * Stores the image permanently in Vercel Blob and updates the Airtable Image URL field.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const contentType = file.type || "image/jpeg";

    // NOTE: We deliberately do NOT delete the existing Image URL's Blob here.
    // The carousel flow (use-post-media → setMediaItems → saveImagesMutation)
    // appends to the media array; what's currently in `Image URL` is usually
    // still in use as carousel position 0. Eager-deleting it on every upload
    // ate other carousel images and 404'd them at publish time. Orphan Blobs
    // get garbage-collected separately by the cleanupCampaignPosts helper.

    // Upload to Vercel Blob
    const imageUrl = await uploadImage("posts", id, buffer, contentType);

    // Update Airtable Image URL with the permanent Blob URL
    await updateRecord("Posts", id, { "Image URL": imageUrl });

    // Propagate to Zernio + lnk.bio if the post is scheduled. Fire-and-forget —
    // don't block the upload response on external APIs.
    syncPostDownstream(id).catch(() => {});

    return NextResponse.json({
      success: true,
      imageUrl,
    });
  } catch (error) {
    console.error("Failed to upload post image:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/posts/[id]/image
 *
 * Remove the image from a post.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete from Vercel Blob if it's a Blob URL
    const existing = await getRecord<{ "Image URL": string }>("Posts", id);
    const existingUrl = existing.fields["Image URL"];
    if (existingUrl && isBlobUrl(existingUrl)) {
      await deleteImage(existingUrl).catch(() => {});
    }

    await updateRecord("Posts", id, {
      "Image URL": "",
      "Image Upload": [],
    });

    // Fire-and-forget downstream sync — a scheduled post must reflect
    // that its image is gone (Zernio mediaItems clears, lnk.bio entry
    // recreates without an image).
    syncPostDownstream(id).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove post image:", error);
    return NextResponse.json(
      { error: "Failed to remove image" },
      { status: 500 }
    );
  }
}
