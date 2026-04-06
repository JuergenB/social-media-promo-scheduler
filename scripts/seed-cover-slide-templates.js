#!/usr/bin/env node
/**
 * Create and seed the Cover Slide Templates table in Airtable.
 *
 * Creates the table with all fields, then seeds 2 initial templates:
 *   - Editorial Cover — Light (based on NRA Q+Art Interview design)
 *   - Dark Editorial Cover (inverted version)
 *
 * Also adds "Cover Slide Data" field to the Posts table.
 *
 * Run: node scripts/seed-cover-slide-templates.js
 */

const BASE_ID = "app5FPCG06huzh7hX";
const PAT = process.env.AIRTABLE_API_KEY ||
  "patO7RElDWYl9bwLo.e5c0dfeb7767ac6e862c588bb02d3a948cae51c8aa35b7de0c6a2a1cd359f3c1";

const META_URL = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const DATA_URL = `https://api.airtable.com/v0/${BASE_ID}`;

const POSTS_TABLE_ID = "tblyUEPOJXxpQDZNL";
const BRANDS_TABLE_ID = "tblK6tDXvx8Qt0CXh";
const CAMPAIGN_TYPE_RULES_TABLE_ID = "tblh0R7a5PyNZXt2Y";

// ── Helpers ──────────────────────────────────────────────────────────────

async function apiCall(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("API error:", res.status, JSON.stringify(data, null, 2));
    throw new Error(`API ${res.status}: ${data.error?.message || res.statusText}`);
  }
  return data;
}

async function createTable(name, fields, description) {
  console.log(`\nCreating table: ${name}...`);
  const result = await apiCall(META_URL, {
    method: "POST",
    body: JSON.stringify({ name, fields, description }),
  });
  console.log(`  Created: ${result.id}`);
  return result;
}

async function addFieldToTable(tableId, field) {
  console.log(`  Adding field "${field.name}" to table ${tableId}...`);
  const url = `${META_URL}/${tableId}/fields`;
  const result = await apiCall(url, {
    method: "POST",
    body: JSON.stringify(field),
  });
  console.log(`    Created field: ${result.id}`);
  return result;
}

async function createRecords(tableId, records) {
  // Airtable limits to 10 records per batch
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    console.log(`  Creating ${batch.length} records (batch ${Math.floor(i / 10) + 1})...`);
    await apiCall(`${DATA_URL}/${tableId}`, {
      method: "POST",
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })) }),
    });
  }
}

// ── Template Band Layouts ────────────────────────────────────────────────

const EDITORIAL_LIGHT_BANDS = [
  {
    type: "image",
    height: "45%",
    contentSource: "primaryImage",
    objectFit: "cover",
    verticalOffset: 30,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "campaignTypeLabel",
    font: { family: "Noto Sans", weight: 700, sizeRange: [12, 16] },
    color: "{{scheme.accent}}",
    align: "center",
    maxLines: 1,
    transform: "uppercase",
    letterSpacing: 3,
    paddingTop: 20,
    paddingBottom: 8,
    paddingX: 48,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "headline",
    font: { family: "Noto Sans", weight: 700, sizeRange: [22, 36] },
    color: "{{scheme.primary}}",
    align: "center",
    maxLines: 4,
    paddingX: 48,
    paddingBottom: 12,
  },
  {
    type: "separator",
    height: 2,
    color: "{{scheme.accent}}",
    widthPercent: 25,
    align: "center",
    marginY: 4,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "description",
    font: { family: "Noto Sans", weight: 400, sizeRange: [14, 18] },
    color: "{{scheme.secondary}}",
    align: "center",
    maxLines: 3,
    paddingX: 60,
    paddingTop: 12,
    paddingBottom: 8,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "handle",
    font: { family: "Noto Sans", weight: 600, sizeRange: [13, 15] },
    color: "{{scheme.accent}}",
    align: "center",
    paddingBottom: 16,
    paddingX: 48,
  },
  {
    type: "branding",
    height: "8%",
    position: "bottom-left",
    contentSource: "brandLogo",
    logoVariant: "auto",
    padding: 20,
  },
];

const DARK_EDITORIAL_BANDS = [
  {
    type: "image",
    height: "45%",
    contentSource: "primaryImage",
    objectFit: "cover",
    verticalOffset: 30,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "campaignTypeLabel",
    font: { family: "Noto Sans", weight: 700, sizeRange: [12, 16] },
    color: "{{scheme.accent}}",
    align: "center",
    maxLines: 1,
    transform: "uppercase",
    letterSpacing: 3,
    paddingTop: 20,
    paddingBottom: 8,
    paddingX: 48,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "headline",
    font: { family: "Noto Sans", weight: 700, sizeRange: [22, 36] },
    color: "{{scheme.primary}}",
    align: "center",
    maxLines: 4,
    paddingX: 48,
    paddingBottom: 12,
  },
  {
    type: "separator",
    height: 2,
    color: "{{scheme.accent}}",
    widthPercent: 25,
    align: "center",
    marginY: 4,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "description",
    font: { family: "Noto Sans", weight: 400, sizeRange: [14, 18] },
    color: "{{scheme.secondary}}",
    align: "center",
    maxLines: 3,
    paddingX: 60,
    paddingTop: 12,
    paddingBottom: 8,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "handle",
    font: { family: "Noto Sans", weight: 600, sizeRange: [13, 15] },
    color: "{{scheme.accent}}",
    align: "center",
    paddingBottom: 16,
    paddingX: 48,
  },
  {
    type: "branding",
    height: "8%",
    position: "bottom-left",
    contentSource: "brandLogo",
    logoVariant: "light",
    padding: 20,
  },
];

const QUOTABLE_BANDS = [
  {
    type: "spacer",
    height: "8%",
  },
  {
    type: "text",
    height: "auto",
    contentSource: "campaignTypeLabel",
    font: { family: "Noto Sans", weight: 700, sizeRange: [12, 14] },
    color: "{{scheme.accent}}",
    align: "center",
    maxLines: 1,
    transform: "uppercase",
    letterSpacing: 3,
    paddingTop: 12,
    paddingBottom: 16,
    paddingX: 48,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "headline",
    font: { family: "Noto Serif", weight: 400, style: "italic", sizeRange: [26, 42] },
    color: "{{scheme.primary}}",
    align: "center",
    maxLines: 6,
    paddingX: 72,
    paddingBottom: 20,
  },
  {
    type: "separator",
    height: 2,
    color: "{{scheme.accent}}",
    widthPercent: 20,
    align: "center",
    marginY: 6,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "description",
    font: { family: "Noto Sans", weight: 600, sizeRange: [14, 18] },
    color: "{{scheme.secondary}}",
    align: "center",
    maxLines: 2,
    paddingX: 60,
    paddingTop: 16,
    paddingBottom: 12,
  },
  {
    type: "text",
    height: "auto",
    contentSource: "handle",
    font: { family: "Noto Sans", weight: 400, sizeRange: [13, 15] },
    color: "{{scheme.accent}}",
    align: "center",
    paddingBottom: 20,
    paddingX: 48,
  },
  {
    type: "branding",
    height: "8%",
    position: "bottom-left",
    contentSource: "brandLogo",
    logoVariant: "auto",
    padding: 20,
  },
];

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Cover Slide Templates: Create table and seed data ===\n");

  // Step 1: Create the table
  const table = await createTable(
    "Cover Slide Templates",
    [
      { name: "Name", type: "singleLineText" },
      { name: "Slug", type: "singleLineText" },
      { name: "Band Layout", type: "multilineText", description: "JSON band array specification" },
      { name: "Color Scheme", type: "multilineText", description: "JSON color scheme object" },
      {
        name: "Fonts Used",
        type: "multipleSelects",
        options: {
          choices: [
            { name: "Noto Sans" },
            { name: "Noto Sans Bold" },
            { name: "Noto Sans SemiBold" },
            { name: "Noto Serif" },
            { name: "Noto Serif Bold" },
            { name: "Noto Serif Italic" },
          ],
        },
      },
      {
        name: "Aspect Ratios",
        type: "multipleSelects",
        options: {
          choices: [
            { name: "4:5" },
            { name: "1:1" },
          ],
        },
      },
      { name: "Active", type: "checkbox", options: { icon: "check", color: "greenBright" } },
      { name: "Sort Order", type: "number", options: { precision: 0 } },
    ],
    "Cover slide templates for carousel posts. Each template defines a horizontal band layout specification."
  );

  const tableId = table.id;
  console.log(`\nTable ID: ${tableId}`);

  // Step 2: Add linked record fields (must be done after table creation)
  await addFieldToTable(tableId, {
    name: "Brands",
    type: "multipleRecordLinks",
    options: { linkedTableId: BRANDS_TABLE_ID },
  });

  await addFieldToTable(tableId, {
    name: "Suggested Campaign Types",
    type: "multipleRecordLinks",
    options: { linkedTableId: CAMPAIGN_TYPE_RULES_TABLE_ID },
  });

  // Step 3: Add Preview attachment field
  await addFieldToTable(tableId, {
    name: "Preview",
    type: "multipleAttachments",
  });

  // Step 4: Seed template records
  console.log("\nSeeding templates...");
  await createRecords(tableId, [
    {
      Name: "Editorial Cover — Light",
      Slug: "editorial-cover-light",
      "Band Layout": JSON.stringify(EDITORIAL_LIGHT_BANDS, null, 2),
      "Color Scheme": JSON.stringify({
        primary: "#1A1A1A",
        secondary: "rgba(30,30,30,0.72)",
        accent: "rgba(30,30,30,0.55)",
        background: "#FFFFFF",
      }),
      "Fonts Used": ["Noto Sans", "Noto Sans Bold", "Noto Sans SemiBold"],
      "Aspect Ratios": ["4:5", "1:1"],
      Active: true,
      "Sort Order": 1,
    },
    {
      Name: "Dark Editorial Cover",
      Slug: "editorial-cover-dark",
      "Band Layout": JSON.stringify(DARK_EDITORIAL_BANDS, null, 2),
      "Color Scheme": JSON.stringify({
        primary: "#FFFFFF",
        secondary: "rgba(255,255,255,0.80)",
        accent: "rgba(255,255,255,0.60)",
        background: "#1A1A1A",
      }),
      "Fonts Used": ["Noto Sans", "Noto Sans Bold", "Noto Sans SemiBold"],
      "Aspect Ratios": ["4:5", "1:1"],
      Active: true,
      "Sort Order": 2,
    },
    {
      Name: "Quotable Card",
      Slug: "quotable-card",
      "Band Layout": JSON.stringify(QUOTABLE_BANDS, null, 2),
      "Color Scheme": JSON.stringify({
        primary: "#1A1A1A",
        secondary: "rgba(30,30,30,0.72)",
        accent: "rgba(30,30,30,0.55)",
        background: "#FAF9F6",
      }),
      "Fonts Used": ["Noto Sans", "Noto Sans Bold", "Noto Sans SemiBold", "Noto Serif", "Noto Serif Italic"],
      "Aspect Ratios": ["4:5", "1:1"],
      Active: true,
      "Sort Order": 3,
    },
  ]);

  // Step 5: Add "Cover Slide Data" field to Posts table
  console.log("\nAdding 'Cover Slide Data' field to Posts table...");
  await addFieldToTable(POSTS_TABLE_ID, {
    name: "Cover Slide Data",
    type: "multilineText",
    description: "JSON: template ID, text field values, image offset, applied URL",
  });

  console.log("\n=== Done! ===");
  console.log(`Cover Slide Templates table ID: ${tableId}`);
  console.log("Add this to CLAUDE.md under the Airtable Tables section.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
