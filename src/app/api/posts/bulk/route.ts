import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/airtable/client";

/**
 * PATCH /api/posts/bulk
 *
 * Bulk update post statuses. Used for "Approve All" and "Dismiss All" actions.
 * Accepts: { postIds: string[], status: string, approvedBy?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { postIds, status, approvedBy } = body;

    if (!postIds?.length || !status) {
      return NextResponse.json(
        { error: "postIds and status are required" },
        { status: 400 }
      );
    }

    let updated = 0;
    for (const postId of postIds) {
      const fields: Record<string, unknown> = { Status: status };
      if (status === "Approved") {
        fields["Approved By"] = approvedBy || "";
        fields["Approved At"] = new Date().toISOString();
      }
      await updateRecord("Posts", postId, fields);
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("Failed to bulk update posts:", error);
    return NextResponse.json(
      { error: "Failed to bulk update posts" },
      { status: 500 }
    );
  }
}
