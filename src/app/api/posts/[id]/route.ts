import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/airtable/client";

/**
 * PATCH /api/posts/[id]
 *
 * Update a post record. Supports:
 * - imageUrl: Update the Image URL (hero/first image)
 * - mediaUrls: Update the Media URLs field (newline-separated, for carousel images)
 * - removeImage: Clear all image fields
 * - Both imageUrl + mediaUrls together for full gallery save
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
      fields["Media URLs"] = "";
      fields["Image Upload"] = [];
    } else {
      if (body.imageUrl !== undefined) {
        fields["Image URL"] = body.imageUrl;
      }
      if (body.mediaUrls !== undefined) {
        fields["Media URLs"] = body.mediaUrls;
      }
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
