#!/usr/bin/env npx tsx
/**
 * Render actual preview images for each card template using the cover slide engine.
 * Uses a sample background image + placeholder content to create realistic previews.
 *
 * Run: npx tsx scripts/render-template-previews.ts
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

// Generic sample content — short, brand-neutral
const COVER_CONTENT: CoverSlideContent = {
  primaryImage: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=1080&q=80",
  campaignTypeLabel: "YOUR BRAND",
  headline: "Your Headline Goes Here",
  description: "A short description that gives readers a reason to keep reading.",
  handle: "@yourbrand",
  brandLogoUrl: null,
};

const QUOTE_CONTENT: CoverSlideContent = {
  primaryImage: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=1080&q=80",
  campaignTypeLabel: "FEATURED",
  headline: '"Great ideas start as questions."',
  description: "— Author Name",
  handle: "@yourbrand",
  brandLogoUrl: null,
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

  // Use multiple sample images for variety
  const sampleImages = [
    "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=1080&q=80", // abstract art
    "https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=1080&q=80", // gallery
    "https://images.unsplash.com/photo-1459908676235-d5f02a50184b?w=1080&q=80", // modern art
  ];

  for (const record of records) {
    const template = parseTemplate(record);
    const isQuotable = template.slug.includes("quotable") || template.slug.includes("quote");
    const baseContent = isQuotable ? QUOTE_CONTENT : COVER_CONTENT;

    console.log(`Rendering: ${template.name} (${template.slug})`);

    // Render each template with each sample image
    for (let imgIdx = 0; imgIdx < sampleImages.length; imgIdx++) {
      const content = { ...baseContent, primaryImage: sampleImages[imgIdx] };

      try {
        // Render at 4:5
        const result = await renderCoverSlide({
          template,
          content,
          width: 540,
          height: 675,
          imageOffset: 30,
          showLinkInBio: true,
        });

        const filename = `${template.slug}-v${imgIdx + 1}.jpg`;
        const outPath = path.join(outDir, filename);
        fs.writeFileSync(outPath, result.buffer);
        console.log(`  ✓ ${filename} (${result.buffer.length} bytes)`);
      } catch (err) {
        console.error(`  ✗ Failed with image ${imgIdx + 1}:`, (err as Error).message);
      }
    }

    // Also render at 1:1 with the first image
    try {
      const content = { ...baseContent, primaryImage: sampleImages[0] };
      const result = await renderCoverSlide({
        template,
        content,
        width: 540,
        height: 540,
        imageOffset: 30,
        showLinkInBio: false,
      });

      const filename = `${template.slug}-square.jpg`;
      const outPath = path.join(outDir, filename);
      fs.writeFileSync(outPath, result.buffer);
      console.log(`  ✓ ${filename} (1:1)`);
    } catch (err) {
      console.error(`  ✗ Failed square:`, (err as Error).message);
    }

    // For quotable templates, also render with overlay opacity variations
    if (isQuotable) {
      for (const opacity of [20, 40, 60]) {
        try {
          const content = { ...baseContent, primaryImage: sampleImages[0] };
          const result = await renderCoverSlide({
            template,
            content,
            width: 540,
            height: 675,
            imageOffset: 30,
            showLinkInBio: true,
            overlayOpacity: opacity,
          });

          const filename = `${template.slug}-opacity${opacity}.jpg`;
          const outPath = path.join(outDir, filename);
          fs.writeFileSync(outPath, result.buffer);
          console.log(`  ✓ ${filename} (overlay ${opacity}%)`);
        } catch (err) {
          console.error(`  ✗ Failed opacity ${opacity}:`, (err as Error).message);
        }
      }
    }

    console.log("");
  }

  console.log(`\nAll previews saved to: ${outDir}`);
  console.log("Open them to pick your favorites for the template gallery.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
