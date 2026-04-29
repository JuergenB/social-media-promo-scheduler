import { NextRequest, NextResponse } from "next/server";
import { updateRecord, getRecord } from "@/lib/airtable/client";
import { uploadImage, deleteImage, isBlobUrl } from "@/lib/blob-storage";

/**
 * POST /api/campaigns/[id]/image
 *
 * Upload a hero image for a campaign. Accepts multipart/form-data with a "file" field.
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

    // NOTE: Do NOT eagerly delete the previous Image URL Blob here. That
    // pattern was destructive once the carousel-append flow started keeping
    // the prior URL alive in the post's media array. Orphan cleanup is
    // handled separately by cleanupCampaignPosts.

    // Upload to Vercel Blob
    const imageUrl = await uploadImage("campaigns", id, buffer, contentType);

    // Update Airtable campaign record
    await updateRecord("Campaigns", id, { "Image URL": imageUrl });

    return NextResponse.json({ success: true, imageUrl });
  } catch (error) {
    console.error("Failed to upload campaign image:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]/image
 *
 * Remove the hero image from a campaign.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await getRecord<{ "Image URL": string }>("Campaigns", id);
    const existingUrl = existing.fields["Image URL"];

    // Delete from Vercel Blob if it's a Blob URL
    if (existingUrl && isBlobUrl(existingUrl)) {
      await deleteImage(existingUrl).catch(() => {});
    }

    // Clear Airtable field
    await updateRecord("Campaigns", id, { "Image URL": "" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove campaign image:", error);
    return NextResponse.json(
      { error: "Failed to remove image" },
      { status: 500 }
    );
  }
}
