import { NextResponse } from "next/server";
import { applyPostChanges } from "@/lib/post-apply";

/**
 * POST /api/posts/[id]/apply
 *
 * Reads the current Airtable state for the post and pushes it to Zernio +
 * lnk.bio in a single serial sequence. The only mutation path for downstream
 * services on scheduled posts — eliminates concurrent-edit races by design.
 *
 * Idempotent. Returns 200 with per-service status; 500 if the helper itself
 * throws (e.g. Airtable read fails).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const result = await applyPostChanges(id);
    const httpStatus = result.zernio === "error" || result.lnkBio === "error" ? 500 : 200;
    return NextResponse.json({ ok: httpStatus === 200, ...result, syncedAt: new Date().toISOString() }, { status: httpStatus });
  } catch (err) {
    console.error("[apply] failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Apply failed" },
      { status: 500 },
    );
  }
}
