import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/airtable/client";

/**
 * PATCH /api/posts/[id]
 *
 * Update a post record. Currently supports:
 * - imageUrl: Update the Image URL field
 * - imageUploadUrl: Upload an image by URL to the Image Upload attachment field
 * - removeImage: Clear both Image URL and Image Upload fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const fields: Record<string, unknown> = {};

    if (body.removeImage) {
      fields["Image URL"] = "";
      fields["Image Upload"] = [];
    } else if (body.imageUrl) {
      fields["Image URL"] = body.imageUrl;
      // Clear any previous upload since URL takes precedence
      fields["Image Upload"] = [];
    } else if (body.imageUploadUrl) {
      // Airtable accepts attachment URLs — it will download and host the file
      fields["Image Upload"] = [{ url: body.imageUploadUrl }];
      // Also set Image URL so the rest of the app can use it
      fields["Image URL"] = body.imageUploadUrl;
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
