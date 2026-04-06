import { NextRequest, NextResponse } from "next/server";
import { fetchCoverSlideTemplates } from "@/lib/airtable/cover-slide-templates";

/**
 * GET /api/cover-slide-templates
 *
 * Returns all active cover slide templates, optionally filtered by brand.
 * Query params:
 *   - brand: Airtable record ID to filter (returns global + brand-specific)
 */
export async function GET(request: NextRequest) {
  try {
    const brandId = request.nextUrl.searchParams.get("brand") || undefined;
    const templates = await fetchCoverSlideTemplates(brandId);
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[cover-slide-templates] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cover slide templates" },
      { status: 500 }
    );
  }
}
