import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasBrandAccess } from "@/lib/brand-access";
import { resolveZernioKey } from "@/lib/late-api/client";

interface BrandFields {
  "Zernio API Key Label": string;
}

/**
 * Returns the Zernio API key for the current brand (or global fallback).
 * Accepts optional ?brandId= query parameter for per-brand key resolution.
 * Validates that the user has access to the requested brand.
 */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId");

  // Validate brand access
  if (brandId) {
    const access = await getUserBrandAccess();
    if (access && !hasBrandAccess(access, brandId)) {
      return NextResponse.json({ apiKey: null });
    }
  }

  let brand: { zernioApiKeyLabel?: string | null } | undefined;

  if (brandId) {
    try {
      const record = await getRecord<BrandFields>("Brands", brandId);
      brand = {
        zernioApiKeyLabel: record.fields["Zernio API Key Label"] || null,
      };
    } catch (err) {
      console.warn(`[auto-auth] Failed to look up brand ${brandId}:`, err);
      // Fall through to global key
    }
  }

  try {
    const apiKey = resolveZernioKey(brand);
    return NextResponse.json({ apiKey });
  } catch {
    return NextResponse.json({ apiKey: null });
  }
}
