import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/airtable/client";
import { deleteShortLink } from "@/lib/short-io";

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
