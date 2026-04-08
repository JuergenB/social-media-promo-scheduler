#!/usr/bin/env node
/**
 * Generate wireframe/schematic preview images for card templates.
 * Creates UX-style placeholder previews with:
 * - Wavy-line pattern for image areas with "Featured Image" label
 * - Rounded rectangle bars for text positions (no literal text)
 * - Correct proportions matching actual band layouts
 * - Light and dark variants
 *
 * Output: docs/template-previews/<slug>-wireframe.png (540x675, 4:5 aspect)
 *
 * Run: node scripts/generate-wireframe-previews.js
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "docs", "template-previews");
fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 540;
const H = 675;

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

/** Classic mountain + sun silhouette placeholder for image areas */
function mountainPlaceholder({ x, y, width, height, fillColor, fillOpacity = 0.15 }) {
  const cx = x + width / 2;
  const bottom = y + height;
  // Sun — circle in upper-left quadrant
  const sunCx = x + width * 0.28;
  const sunCy = y + height * 0.30;
  const sunR = height * 0.10;
  // Big mountain — peak right of center
  const peakX = x + width * 0.68;
  const peakY = y + height * 0.25;
  // Small mountain — left side, shorter
  const smallPeakX = x + width * 0.25;
  const smallPeakY = y + height * 0.55;
  // Valley between mountains
  const valleyX = x + width * 0.42;
  const valleyY = y + height * 0.68;

  return `
  <circle cx="${sunCx}" cy="${sunCy}" r="${sunR}" fill="${fillColor}" fill-opacity="${fillOpacity}" />
  <path d="M ${x} ${bottom}
           L ${smallPeakX} ${smallPeakY}
           Q ${valleyX - 10} ${valleyY} ${valleyX} ${valleyY}
           Q ${valleyX + 10} ${valleyY} ${valleyX + 20} ${valleyY - 8}
           L ${peakX} ${peakY}
           L ${x + width} ${bottom} Z"
        fill="${fillColor}" fill-opacity="${fillOpacity}" />`;
}

/** Rounded rectangle bar (text placeholder) */
function bar({ cx, y, width, height, color, opacity = 0.3, rx = 3 }) {
  const x = cx - width / 2;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${color}" fill-opacity="${opacity}" />`;
}

/** Thin separator line */
function separator({ cx, y, width, color, opacity = 0.15 }) {
  const x = cx - width / 2;
  return `<line x1="${x}" y1="${y}" x2="${x + width}" y2="${y}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1" />`;
}

// ---------------------------------------------------------------------------
// Template definitions — proportions match actual Airtable band layouts
// ---------------------------------------------------------------------------

function editorialCover({ isDark }) {
  const bg = isDark ? "#1A1A1A" : "#FFFFFF";
  const textColor = isDark ? "#FFFFFF" : "#1A1A1A";
  const imgBg = isDark ? "#2A2A2A" : "#E8EDF2";
  const iconColor = isDark ? "#FFFFFF" : "#666666";

  // Image area: 45% of height
  const imgH = Math.round(H * 0.45);
  // Text area starts after image
  const textStart = imgH;
  const textAreaH = H - imgH;
  const cx = W / 2;

  // Text band positions (proportional within text area)
  const labelY = textStart + textAreaH * 0.12;
  const headlineY = textStart + textAreaH * 0.22;
  const headlineGap = 12;
  const sepY = textStart + textAreaH * 0.48;
  const descY = textStart + textAreaH * 0.56;
  const descGap = 10;
  const handleY = textStart + textAreaH * 0.72;
  const logoY = textStart + textAreaH * 0.88;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${bg}" />

  <!-- Image placeholder area with mountain + sun icon -->
  <rect x="0" y="0" width="${W}" height="${imgH}" fill="${imgBg}" />
  ${mountainPlaceholder({ x: 0, y: 0, width: W, height: imgH, fillColor: iconColor, fillOpacity: isDark ? 0.15 : 0.18 })}

  <!-- Category label bar -->
  ${bar({ cx, y: labelY, width: W * 0.28, height: 6, color: textColor, opacity: 0.2 })}

  <!-- Headline bars (3 lines, bold — all same dark shade) -->
  ${bar({ cx, y: headlineY, width: W * 0.72, height: 10, color: textColor, opacity: 0.55 })}
  ${bar({ cx, y: headlineY + headlineGap + 10, width: W * 0.68, height: 10, color: textColor, opacity: 0.55 })}
  ${bar({ cx, y: headlineY + (headlineGap + 10) * 2, width: W * 0.50, height: 10, color: textColor, opacity: 0.55 })}

  <!-- Separator -->
  ${separator({ cx, y: sepY, width: W * 0.18, color: textColor, opacity: 0.15 })}

  <!-- Description bars (2 lines, thinner) -->
  ${bar({ cx, y: descY, width: W * 0.65, height: 6, color: textColor, opacity: 0.2 })}
  ${bar({ cx, y: descY + descGap + 6, width: W * 0.50, height: 6, color: textColor, opacity: 0.2 })}

  <!-- Handle bar (same density as headline) -->
  ${bar({ cx, y: handleY, width: W * 0.25, height: 7, color: textColor, opacity: 0.55 })}
</svg>`;
}

function quotableCard({ isDark }) {
  const bg = isDark ? "#1A1A1A" : "#FAF9F6";
  const textColor = isDark ? "#FFFFFF" : "#1A1A1A";
  const imgBg = isDark ? "#2A2A2A" : "#E0E5EA";
  const iconColor = isDark ? "#FFFFFF" : "#666666";

  const cx = W / 2;

  // Quotable: full background image with overlay, centered text
  // Reduce overlay so texture shows through
  const overlayOpacity = isDark ? 0.65 : 0.55;
  const overlayColor = isDark ? "#1A1A1A" : "#FAF9F6";

  // Text positions (vertically centered)
  const centerY = H / 2;
  const labelY = centerY - 80;
  const quoteStartY = centerY - 40;
  const quoteGap = 14;
  const attrY = centerY + 50;
  const attrGap = 10;
  const handleY = centerY + 90;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Full background with subtle mountain hint (image is background with overlay) -->
  <rect width="${W}" height="${H}" fill="${imgBg}" />
  ${mountainPlaceholder({ x: W * 0.15, y: H * 0.55, width: W * 0.7, height: H * 0.45, fillColor: iconColor, fillOpacity: isDark ? 0.06 : 0.08 })}

  <!-- Overlay -->
  <rect width="${W}" height="${H}" fill="${overlayColor}" fill-opacity="${overlayOpacity}" />

  <!-- Category label (low contrast) -->
  ${bar({ cx, y: labelY, width: W * 0.22, height: 5, color: textColor, opacity: 0.12 })}

  <!-- Opening quote mark (low contrast) -->
  <text x="${cx}" y="${quoteStartY - 8}" text-anchor="middle" font-family="Georgia, serif" font-size="32" fill="${textColor}" fill-opacity="0.15">\u201C</text>

  <!-- Quote lines (high contrast — the dominant element) -->
  ${bar({ cx, y: quoteStartY, width: W * 0.78, height: 9, color: textColor, opacity: 0.55, rx: 4 })}
  ${bar({ cx, y: quoteStartY + quoteGap + 9, width: W * 0.72, height: 9, color: textColor, opacity: 0.55, rx: 4 })}
  ${bar({ cx, y: quoteStartY + (quoteGap + 9) * 2, width: W * 0.55, height: 9, color: textColor, opacity: 0.55, rx: 4 })}

  <!-- Attribution lines (low contrast) -->
  ${bar({ cx, y: attrY, width: W * 0.35, height: 6, color: textColor, opacity: 0.12 })}
  ${bar({ cx, y: attrY + attrGap + 6, width: W * 0.25, height: 6, color: textColor, opacity: 0.12 })}

  <!-- Handle (high contrast — same as quote) -->
  ${bar({ cx, y: handleY, width: W * 0.22, height: 6, color: textColor, opacity: 0.55 })}
</svg>`;
}

// ---------------------------------------------------------------------------
// Generate all variants
// ---------------------------------------------------------------------------

const templates = [
  { slug: "editorial-cover-light", label: "Cover \u00B7 Light", fn: () => editorialCover({ isDark: false }) },
  { slug: "editorial-cover-dark", label: "Cover \u00B7 Dark", fn: () => editorialCover({ isDark: true }) },
  { slug: "quotable-card", label: "Quote \u00B7 Light", fn: () => quotableCard({ isDark: false }) },
  { slug: "dark-quotable-card", label: "Quote \u00B7 Dark", fn: () => quotableCard({ isDark: true }) },
];

async function main() {
  // Dynamic import for Sharp (ESM)
  const sharp = (await import("sharp")).default;

  for (const t of templates) {
    const svg = t.fn();
    const svgBuffer = Buffer.from(svg);

    // Render SVG → PNG via Sharp
    const png = await sharp(svgBuffer)
      .png()
      .toBuffer();

    const filename = `${t.slug}-wireframe.png`;
    const outPath = path.join(OUT_DIR, filename);
    fs.writeFileSync(outPath, png);
    console.log(`  ${t.label} → ${filename} (${png.length} bytes)`);
  }

  console.log(`\nAll wireframe previews saved to: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
