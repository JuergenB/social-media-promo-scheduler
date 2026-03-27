import { NextRequest, NextResponse } from "next/server";
import { updateRecord, getRecord } from "@/lib/airtable/client";

/**
 * POST /api/posts/[id]/image
 *
 * Upload an image file for a post. Accepts multipart/form-data with a "file" field.
 * Converts the file to a base64 data URL and writes it to Airtable's Image Upload
 * attachment field. Airtable will host the file and provide a CDN URL.
 *
 * After upload, reads back the record to get the Airtable-hosted URL
 * and updates the Image URL field with it.
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

    // Convert file to base64 for Airtable content upload
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const contentType = file.type || "image/png";

    // Write to Airtable attachment field using content upload
    await updateRecord("Posts", id, {
      "Image Upload": [
        {
          url: `data:${contentType};base64,${base64}`,
          filename: file.name,
        },
      ],
    });

    // Read back to get the Airtable-hosted URL
    const updated = await getRecord<{
      "Image Upload": Array<{ url: string; thumbnails?: { large?: { url: string } } }>;
    }>("Posts", id);

    const attachment = updated.fields["Image Upload"]?.[0];
    const hostedUrl =
      attachment?.thumbnails?.large?.url || attachment?.url || "";

    // Update Image URL with the hosted URL
    if (hostedUrl) {
      await updateRecord("Posts", id, { "Image URL": hostedUrl });
    }

    return NextResponse.json({
      success: true,
      imageUrl: hostedUrl,
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
 * Remove the image from a post (both Image URL and Image Upload).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await updateRecord("Posts", id, {
      "Image URL": "",
      "Image Upload": [],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove post image:", error);
    return NextResponse.json(
      { error: "Failed to remove image" },
      { status: 500 }
    );
  }
}
