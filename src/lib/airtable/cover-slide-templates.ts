/**
 * Airtable fetch functions for Cover Slide Templates table.
 */

import { listRecords, getRecord } from "./client";
import type { CoverSlideTemplate, Band, ColorScheme } from "@/lib/cover-slide-types";

const TABLE_NAME = "Cover Slide Templates";

// ── Airtable field shape ─────────────────────────────────────────────────

interface CoverSlideTemplateFields {
  Name: string;
  Slug: string;
  Preview: Array<{ url: string; thumbnails?: { large?: { url: string } } }>;
  "Band Layout": string;
  "Color Scheme": string;
  "Fonts Used": string[];
  Brands: string[];
  "Suggested Campaign Types": string[];
  "Aspect Ratios": string[];
  Active: boolean;
  "Sort Order": number;
}

// ── Mapper ───────────────────────────────────────────────────────────────

function mapTemplate(record: { id: string; fields: CoverSlideTemplateFields }): CoverSlideTemplate {
  const f = record.fields;

  let bands: Band[] = [];
  try {
    bands = JSON.parse(f["Band Layout"] || "[]");
  } catch {
    console.warn(`[cover-slide-templates] Invalid Band Layout JSON for "${f.Name}"`);
  }

  let colorScheme: ColorScheme = {
    primary: "#1A1A1A",
    secondary: "rgba(30,30,30,0.72)",
    accent: "rgba(30,30,30,0.55)",
    background: "#FFFFFF",
  };
  try {
    colorScheme = JSON.parse(f["Color Scheme"] || "{}");
  } catch {
    console.warn(`[cover-slide-templates] Invalid Color Scheme JSON for "${f.Name}"`);
  }

  // Preview: prefer large thumbnail, fall back to full URL
  const preview = f.Preview?.[0];
  const previewUrl = preview?.thumbnails?.large?.url || preview?.url || null;

  return {
    id: record.id,
    name: f.Name || "",
    slug: f.Slug || "",
    previewUrl,
    bands,
    colorScheme,
    fontsUsed: f["Fonts Used"] || [],
    brandIds: f.Brands || [],
    suggestedTypeIds: f["Suggested Campaign Types"] || [],
    aspectRatios: (f["Aspect Ratios"] || []) as ("4:5" | "1:1")[],
    active: f.Active ?? false,
    sortOrder: f["Sort Order"] ?? 999,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Fetch all active cover slide templates, optionally filtered by brand.
 * Returns templates sorted by Sort Order.
 */
export async function fetchCoverSlideTemplates(brandId?: string): Promise<CoverSlideTemplate[]> {
  const records = await listRecords<CoverSlideTemplateFields>(TABLE_NAME, {
    filterByFormula: "{Active} = TRUE()",
    sort: [{ field: "Sort Order", direction: "asc" }],
  });

  const templates = records.map(mapTemplate);

  // Filter: return global templates (no brand restriction) + brand-specific
  if (brandId) {
    return templates.filter(
      (t) => t.brandIds.length === 0 || t.brandIds.includes(brandId)
    );
  }

  return templates;
}

/**
 * Fetch a single template by record ID.
 */
export async function fetchCoverSlideTemplate(templateId: string): Promise<CoverSlideTemplate | null> {
  try {
    const record = await getRecord<CoverSlideTemplateFields>(TABLE_NAME, templateId);
    return mapTemplate(record);
  } catch {
    return null;
  }
}
