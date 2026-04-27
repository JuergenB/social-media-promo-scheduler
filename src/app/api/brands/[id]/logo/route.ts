import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { updateRecord, getRecord } from "@/lib/airtable/client";
import { isBlobUrl } from "@/lib/blob-storage";

/**
 * Logo upload endpoint — supports four slots per brand:
 *   - light-square / dark-square — square (1:1) logos
 *   - light-rect / dark-rect     — rectangular/wordmark logos
 *
 * "light" / "dark" refers to the BACKGROUND the logo is placed on:
 *   - light-* = logo for light backgrounds (dark/black logo art)
 *   - dark-*  = logo for dark backgrounds (white/light logo art)
 *
 * Each slot maps to one Airtable URL field.
 */

const SLOT_TO_FIELD = {
  "light-square": "Logo Transparent Dark", // logo art is DARK, lives on LIGHT bg
  "dark-square": "Logo Transparent Light", // logo art is LIGHT, lives on DARK bg
  "light-rect": "Logo Rectangular Light", // wordmark for use OVER light bg
  "dark-rect": "Logo Rectangular Dark", // wordmark for use OVER dark bg
} as const;

type Slot = keyof typeof SLOT_TO_FIELD;

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
]);

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function extFromContentType(ct: string): string {
  if (ct === "image/svg+xml") return "svg";
  if (ct === "image/jpeg" || ct === "image/jpg") return "jpg";
  if (ct === "image/webp") return "webp";
  return "png";
}

/**
 * Optimize raster logos via Sharp. PNG with alpha → kept as PNG (preserves
 * transparency). JPEG/WebP → JPEG. SVG → passthrough (vector).
 */
async function optimizeLogo(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  if (contentType === "image/svg+xml") {
    return { buffer, contentType, ext: "svg" };
  }

  try {
    const meta = await sharp(buffer).metadata();
    const hasAlpha = meta.hasAlpha && meta.channels === 4;

    if (hasAlpha || contentType === "image/png") {
      // Keep PNG to preserve transparency
      const out = await sharp(buffer).png({ quality: 90, compressionLevel: 9 }).toBuffer();
      return { buffer: out, contentType: "image/png", ext: "png" };
    }

    // JPEG/WebP without alpha → JPEG
    const out = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
    return { buffer: out, contentType: "image/jpeg", ext: "jpg" };
  } catch {
    // Sharp failed — upload as-is
    return { buffer, contentType, ext: extFromContentType(contentType) };
  }
}

async function uploadLogoToBlob(
  brandId: string,
  slot: Slot,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const optimized = await optimizeLogo(buffer, contentType);
  const stamp = Date.now();
  const hex = randomBytes(3).toString("hex");
  const path = `images/brands/${brandId}/logo-${slot}-${stamp}-${hex}.${optimized.ext}`;

  const blob = await put(path, optimized.buffer, {
    access: "public",
    contentType: optimized.contentType,
  });

  return blob.url;
}

interface BrandLogoFields {
  "Logo Transparent Light"?: string;
  "Logo Transparent Dark"?: string;
  "Logo Rectangular Light"?: string;
  "Logo Rectangular Dark"?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const slot = request.nextUrl.searchParams.get("slot") as Slot | null;

    if (!slot || !(slot in SLOT_TO_FIELD)) {
      return NextResponse.json(
        { error: "Invalid slot. Expected: light-square | dark-square | light-rect | dark-rect" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const contentType = file.type || "image/png";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${contentType}. Use PNG, JPG, WEBP, or SVG.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.` },
        { status: 400 }
      );
    }

    const fieldName = SLOT_TO_FIELD[slot];

    // Delete the previous blob if one exists in this slot
    const existing = await getRecord<BrandLogoFields>("Brands", id);
    const prevUrl = existing.fields[fieldName as keyof BrandLogoFields];
    if (prevUrl && isBlobUrl(prevUrl)) {
      await del(prevUrl).catch(() => {});
    }

    // Upload + persist
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadLogoToBlob(id, slot, buffer, contentType);
    await updateRecord("Brands", id, { [fieldName]: url });

    return NextResponse.json({ success: true, slot, url, field: fieldName });
  } catch (error) {
    console.error("[brands/logo POST] failed:", error);
    return NextResponse.json(
      { error: "Failed to upload logo" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const slot = request.nextUrl.searchParams.get("slot") as Slot | null;

    if (!slot || !(slot in SLOT_TO_FIELD)) {
      return NextResponse.json(
        { error: "Invalid slot" },
        { status: 400 }
      );
    }

    const fieldName = SLOT_TO_FIELD[slot];

    const existing = await getRecord<BrandLogoFields>("Brands", id);
    const prevUrl = existing.fields[fieldName as keyof BrandLogoFields];
    if (prevUrl && isBlobUrl(prevUrl)) {
      await del(prevUrl).catch(() => {});
    }

    await updateRecord("Brands", id, { [fieldName]: "" });
    return NextResponse.json({ success: true, slot, field: fieldName });
  } catch (error) {
    console.error("[brands/logo DELETE] failed:", error);
    return NextResponse.json(
      { error: "Failed to remove logo" },
      { status: 500 }
    );
  }
}
