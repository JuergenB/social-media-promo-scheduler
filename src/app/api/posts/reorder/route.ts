import { NextRequest, NextResponse } from "next/server";
import { updateRecord } from "@/lib/airtable/client";

/**
 * POST /api/posts/reorder
 *
 * Bulk-update sort order for a list of posts.
 * Body: { postIds: string[] } — array of post IDs in desired order.
 * Each post gets a Sort Order value equal to its index (0, 1, 2, ...).
 */
export async function POST(request: NextRequest) {
  try {
    const { postIds } = (await request.json()) as { postIds: string[] };

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json(
        { error: "postIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Update each post's Sort Order in parallel
    await Promise.all(
      postIds.map((id, index) =>
        updateRecord("Posts", id, { "Sort Order": index })
      )
    );

    return NextResponse.json({ success: true, updated: postIds.length });
  } catch (error) {
    console.error("Failed to reorder posts:", error);
    return NextResponse.json(
      { error: "Failed to reorder posts" },
      { status: 500 }
    );
  }
}
