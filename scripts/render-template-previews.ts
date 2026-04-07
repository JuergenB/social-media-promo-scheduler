#!/usr/bin/env npx tsx
/**
 * Render actual preview images for each card template using the cover slide engine.
 * Uses a sample background image + placeholder content to create realistic previews.
 *
 * Run: source .env.local && AIRTABLE_API_KEY="$AIRTABLE_API_KEY" npx tsx scripts/render-template-previews.ts
 *
 * Output: docs/template-previews/<slug>.jpg
 */

import fs from "fs";
import path from "path";
import { renderCoverSlide } from "../src/lib/cover-slide-renderer";
import type { CoverSlideTemplate, CoverSlideContent } from "../src/lib/cover-slide-types";

// Airtable config
const BASE_ID = "app5FPCG06huzh7hX";
const PAT = process.env.AIRTABLE_API_KEY!;
const TABLE = "Cover Slide Templates";

interface AirtableRecord {
  id: string;
  fields: {
    Name: string;
    Slug: string;
    "Band Layout": string;
    "Color Scheme": string;
    "Aspect Ratios": string;
    Active: boolean;
    "Logo Variant"?: string;
  };
}

// Very short sample content to avoid text overflow
const COVER_CONTENT: CoverSlideContent = {
  primaryImage: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=1080&q=80",
  campaignTypeLabel: "YOUR BRAND",
  headline: "Your Story, Amplified",
  description: "Swipe to discover what's next.",
  handle: "@yourbrand",
  brandLogoUrl: null,
};

const QUOTE_CONTENT: CoverSlideContent = {
  primaryImage: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=1080&q=80",
  campaignTypeLabel: "FEATURED",
  headline: '"Ideas worth sharing."',
  description: "— Your Name",
  handle: "@yourbrand",
  brandLogoUrl: null,
};

// Font size adjustments for quote templates — the default [40,64] range
// is too large for preview cards. Pull the headline down significantly.
const QUOTE_FONT_DELTAS: Record<string, number> = {
  headline: -20,
};

async function fetchTemplates(): Promise<AirtableRecord[]> {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${PAT}` },
  });
  if (!res.ok) throw new Error(`Airtable API error: ${res.status}`);
  const data = await res.json();
  return data.records;
}

function parseTemplate(record: AirtableRecord): CoverSlideTemplate {
  return {
    id: record.id,
    name: record.fields.Name,
    slug: record.fields.Slug,
    bands: JSON.parse(record.fields["Band Layout"] || "[]"),
    colorScheme: JSON.parse(record.fields["Color Scheme"] || "{}"),
    aspectRatios: Array.isArray(record.fields["Aspect Ratios"]) ? record.fields["Aspect Ratios"] : ["4:5", "1:1"],
    active: record.fields.Active !== false,
    logoVariant: record.fields["Logo Variant"] as "light" | "dark" | undefined,
  };
}

async function main() {
  if (!PAT) {
    console.error("Set AIRTABLE_API_KEY env var");
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "docs", "template-previews");
  fs.mkdirSync(outDir, { recursive: true });

  const records = await fetchTemplates();
  console.log(`Found ${records.length} templates\n`);

  for (const record of records) {
    const template = parseTemplate(record);
    const isQuotable = template.slug.includes("quotable") || template.slug.includes("quote");
    const content = isQuotable ? { ...QUOTE_CONTENT } : { ...COVER_CONTENT };

    console.log(`Rendering: ${template.name} (${template.slug})`);

    try {
      // Render at 4:5 only — one version per template
      const result = await renderCoverSlide({
        template,
        content,
        width: 540,
        height: 675,
        imageOffset: 30,
        showLinkInBio: false,
        ...(isQuotable ? { fontSizeDeltas: QUOTE_FONT_DELTAS } : {}),
      });

      const filename = `${template.slug}.jpg`;
      const outPath = path.join(outDir, filename);
      fs.writeFileSync(outPath, result.buffer);
      console.log(`  OK ${filename} (${result.buffer.length} bytes)`);
    } catch (err) {
      console.error(`  FAIL:`, (err as Error).message);
    }

    console.log("");
  }

  console.log(`\nAll previews saved to: ${outDir}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
