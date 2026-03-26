import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/lib/airtable/client";
import { resolveZernioKey } from "@/lib/late-api/client";

interface BrandFields {
  "Zernio API Key Label": string;
}

/**
 * Returns the Zernio API key for the current brand (or global fallback).
 * Accepts optional ?brandId= query parameter for per-brand key resolution.
 */
export async function GET(request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId");

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
