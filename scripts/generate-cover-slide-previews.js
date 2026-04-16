#!/usr/bin/env node
/**
 * Generate preview thumbnails for Cover Slide Templates.
 *
 * Uses the band layout renderer with placeholder content to create
 * representative preview images, then uploads them to Airtable.
 *
 * Run: npx tsx scripts/generate-cover-slide-previews.js
 *
 * (Uses tsx because we need to import TypeScript modules)
 */

// This script needs to be run via tsx to resolve @/ imports
// Re-implemented as a standalone Node script using fetch

const BASE_ID = "app5FPCG06huzh7hX";
const PAT = process.env.AIRTABLE_API_KEY ||
  "patO7RElDWYl9bwLo.e5c0dfeb7767ac6e862c588bb02d3a948cae51c8aa35b7de0c6a2a1cd359f3c1";

const TABLE_NAME = "Cover Slide Templates";
const DATA_URL = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;

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
    throw new Error(`API ${res.status}`);
  }
  return data;
}

async function main() {
  console.log("Fetching templates...");
  const { records } = await apiCall(DATA_URL);

  for (const record of records) {
    const name = record.fields.Name;
    const colorScheme = JSON.parse(record.fields["Color Scheme"] || "{}");
    const bands = JSON.parse(record.fields["Band Layout"] || "[]");

    console.log(`\nGenerating preview for: ${name}`);

    // We'll call our own API to render a preview with placeholder content
    // But since this is a standalone script, we'll generate a simple SVG preview instead
    // and upload it as an attachment

    const isQuotable = name.toLowerCase().includes("quotable");
    const isDark = colorScheme.background !== "#FFFFFF" && colorScheme.background !== "#FAF9F6";

    // Generate a simple HTML/SVG preview thumbnail
    const bgColor = colorScheme.background || "#FFFFFF";
    const primaryColor = colorScheme.primary || "#1A1A1A";
    const secondaryColor = colorScheme.secondary || "rgba(30,30,30,0.72)";
    const accentColor = colorScheme.accent || "rgba(30,30,30,0.55)";

    // Calculate image area percentage from bands
    const imageBand = bands.find(b => b.type === "image");
    const imageHeightPct = imageBand ? parseInt(imageBand.height) : 0;

    const width = 540;
    const height = 675; // 4:5 ratio
    const imageAreaH = Math.round(height * (imageHeightPct / 100));

    let svg;
    if (isQuotable) {
      // Quotable card: no image, large centered text
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="${bgColor}"/>
        <text x="${width/2}" y="80" text-anchor="middle" fill="${accentColor}" font-family="sans-serif" font-size="11" font-weight="700" letter-spacing="3">CATEGORY LABEL</text>
        <text x="${width/2}" y="200" text-anchor="middle" fill="${primaryColor}" font-family="serif" font-size="28" font-style="italic" opacity="0.9">
          <tspan x="${width/2}" dy="0">\u201CThe art of seeing is</tspan>
          <tspan x="${width/2}" dy="38">learning to notice what</tspan>
          <tspan x="${width/2}" dy="38">you haven\u2019t seen before.\u201D</tspan>
        </text>
        <line x1="${width*0.4}" y1="330" x2="${width*0.6}" y2="330" stroke="${accentColor}" stroke-width="2"/>
        <text x="${width/2}" y="370" text-anchor="middle" fill="${secondaryColor}" font-family="sans-serif" font-size="14" font-weight="600">\u2014 Artist Name</text>
        <text x="${width/2}" y="400" text-anchor="middle" fill="${accentColor}" font-family="sans-serif" font-size="12">@brandhandle</text>
        <rect x="20" y="${height-60}" width="60" height="20" rx="3" fill="${accentColor}" opacity="0.3"/>
        <text x="50" y="${height-46}" text-anchor="middle" fill="${primaryColor}" font-family="sans-serif" font-size="8" opacity="0.5">LOGO</text>
      </svg>`;
    } else {
      // Editorial cover: image area + text
      const imgPatternColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
      const imgBgColor = isDark ? "#2a2a2a" : "#e8e5e0";
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="${bgColor}"/>
        <!-- Image area -->
        <rect width="${width}" height="${imageAreaH}" fill="${imgBgColor}"/>
        <line x1="0" y1="0" x2="${width}" y2="${imageAreaH}" stroke="${imgPatternColor}" stroke-width="1"/>
        <line x1="${width}" y1="0" x2="0" y2="${imageAreaH}" stroke="${imgPatternColor}" stroke-width="1"/>
        <text x="${width/2}" y="${imageAreaH/2}" text-anchor="middle" fill="${imgPatternColor}" font-family="sans-serif" font-size="16" opacity="0.8">Image Area</text>
        <!-- Category label -->
        <text x="${width/2}" y="${imageAreaH + 35}" text-anchor="middle" fill="${accentColor}" font-family="sans-serif" font-size="11" font-weight="700" letter-spacing="3">CATEGORY LABEL</text>
        <!-- Headline -->
        <text x="${width/2}" y="${imageAreaH + 75}" text-anchor="middle" fill="${primaryColor}" font-family="sans-serif" font-size="22" font-weight="700">
          <tspan x="${width/2}" dy="0">Your Headline Goes</tspan>
          <tspan x="${width/2}" dy="30">Right Here</tspan>
        </text>
        <!-- Separator -->
        <line x1="${width*0.38}" y1="${imageAreaH + 120}" x2="${width*0.62}" y2="${imageAreaH + 120}" stroke="${accentColor}" stroke-width="2"/>
        <!-- Description -->
        <text x="${width/2}" y="${imageAreaH + 150}" text-anchor="middle" fill="${secondaryColor}" font-family="sans-serif" font-size="13">
          <tspan x="${width/2}" dy="0">A brief description of the content</tspan>
          <tspan x="${width/2}" dy="20">that gives readers a reason to swipe.</tspan>
        </text>
        <!-- Handle -->
        <text x="${width/2}" y="${imageAreaH + 205}" text-anchor="middle" fill="${accentColor}" font-family="sans-serif" font-size="12" font-weight="600">@brandhandle</text>
        <!-- Logo placeholder -->
        <rect x="20" y="${height-50}" width="60" height="20" rx="3" fill="${accentColor}" opacity="0.3"/>
        <text x="50" y="${height-36}" text-anchor="middle" fill="${primaryColor}" font-family="sans-serif" font-size="8" opacity="0.5">LOGO</text>
      </svg>`;
    }

    // Convert SVG to a data URI for Airtable attachment
    const svgBase64 = Buffer.from(svg).toString("base64");
    const dataUri = `data:image/svg+xml;base64,${svgBase64}`;

    // Upload SVG as an attachment to the Preview field
    // Airtable accepts URL-based attachments — we need to use a publicly accessible URL
    // Since we can't host directly, we'll use the SVG inline via a temporary endpoint approach
    // Instead, let's write to a local file and use Vercel Blob or a different approach

    // Actually, Airtable attachments can be set via URL. Let's write the SVGs to Vercel Blob
    // For simplicity, let's just write them to public/ and reference them, or use a simpler approach:
    // Write the SVG to a temp file, then note the path

    const fs = require("fs");
    const path = require("path");
    const outDir = path.join(process.cwd(), "docs", "design-templates", "carousel", "previews");
    fs.mkdirSync(outDir, { recursive: true });

    const slug = record.fields.Slug || name.toLowerCase().replace(/\s+/g, "-");
    const outPath = path.join(outDir, `${slug}.svg`);
    fs.writeFileSync(outPath, svg);
    console.log(`  Written: ${outPath}`);
  }

  console.log("\n=== SVG previews generated ===");
  console.log("To use as Airtable attachments, upload them to Vercel Blob or commit + reference from GitHub raw URL.");
  console.log("Or render them client-side in the gallery as inline SVG previews.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
