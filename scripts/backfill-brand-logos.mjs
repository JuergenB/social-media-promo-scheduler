/**
 * Backfill brand-logo slots from docs/brand-logos/ → Vercel Blob → Airtable.
 *
 * Slot mapping per brand (only uploads when the source file exists locally):
 *   light-square  → square logo for LIGHT bg (dark logo art)
 *   dark-square   → square logo for DARK bg  (light logo art)
 *   light-rect    → wordmark/rect for LIGHT bg
 *   dark-rect     → wordmark/rect for DARK bg
 *
 * Idempotent: skips slots that already have a Vercel Blob URL set.
 * Pass --force to overwrite existing values.
 */

import { readFileSync, existsSync } from "node:fs";
import { extname, basename } from "node:path";
import { put, del } from "@vercel/blob";
import { randomBytes } from "node:crypto";

// Load .env.local
const env = readFileSync(".env.local", "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .reduce((acc, l) => {
    const i = l.indexOf("=");
    const k = l.slice(0, i).trim();
    let v = l.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    acc[k] = v;
    return acc;
  }, {});
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v;

const force = process.argv.includes("--force");

const SLOT_TO_FIELD = {
  "light-square": "Logo Transparent Dark",
  "dark-square": "Logo Transparent Light",
  "light-rect": "Logo Rectangular Light",
  "dark-rect": "Logo Rectangular Dark",
};

// Brand record IDs (already verified live on the base)
const BRANDS = [
  // NOTE on file naming convention: in docs/brand-logos/, "*-light.png"
  // contains WHITE logo art (for dark backgrounds) and "*-dark.png" contains
  // BLACK logo art (for light backgrounds). Our slot names use the opposite
  // convention (slot "light-square" = the BACKGROUND is light), so we swap.
  {
    name: "The Intersect",
    id: "recQ69SHPps9W5z0U",
    files: {
      "light-square": "docs/brand-logos/the-intersect-dark-square.png", // black art for light bg
      "dark-square": "docs/brand-logos/the-intersect-light-square.png", // white art for dark bg
      "light-rect": "docs/brand-logos/the-intersect-dark.png",
      "dark-rect": "docs/brand-logos/the-intersect-light.png",
    },
  },
  {
    name: "Not Real Art",
    id: "recC3FgykeXrRzId1",
    files: {
      "light-square": "docs/brand-logos/not-real-art-dark.png",
      "dark-square": "docs/brand-logos/not-real-art-light.png",
      // No rectangular variants in repo
    },
  },
  {
    name: "Artsville USA",
    id: "recRzyM8RWgN433uv",
    files: {
      "light-square": "docs/brand-logos/artsville-usa-dark-large.png",
      "dark-square": "docs/brand-logos/artsville-usa-light-large.png",
      "light-rect": "docs/brand-logos/artsville-usa-dark.png",
      "dark-rect": "docs/brand-logos/artsville-usa-light.png",
    },
  },
];

function contentTypeFor(p) {
  const ext = extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

async function fetchExistingBrand(id) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Brands/${id}`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch brand ${id}: ${res.status}`);
  return res.json();
}

async function patchBrand(id, fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Brands/${id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`Failed PATCH ${id}: ${res.status} ${JSON.stringify(j)}`);
  }
  return res.json();
}

function isBlobUrl(u) {
  return typeof u === "string" && u.includes(".public.blob.vercel-storage.com/");
}

async function uploadOne(brandId, slot, filePath) {
  const buf = readFileSync(filePath);
  const ct = contentTypeFor(filePath);
  const ext = extname(filePath).slice(1).toLowerCase() || "png";
  const stamp = Date.now();
  const hex = randomBytes(3).toString("hex");
  const blobPath = `images/brands/${brandId}/logo-${slot}-${stamp}-${hex}.${ext}`;
  const blob = await put(blobPath, buf, {
    access: "public",
    contentType: ct,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return blob.url;
}

const summary = [];

for (const brand of BRANDS) {
  console.log(`\n── ${brand.name} (${brand.id})`);
  const record = await fetchExistingBrand(brand.id);
  const existing = record.fields || {};

  const updates = {};

  for (const [slot, filePath] of Object.entries(brand.files)) {
    if (!existsSync(filePath)) {
      console.log(`  ${slot}: source missing (${filePath}) — skip`);
      continue;
    }
    const fieldName = SLOT_TO_FIELD[slot];
    const current = existing[fieldName];
    if (current && !force) {
      console.log(`  ${slot}: already set → skip (use --force to overwrite)`);
      summary.push({ brand: brand.name, slot, action: "skip", reason: "already set" });
      continue;
    }

    if (current && force && isBlobUrl(current)) {
      try {
        await del(current, { token: process.env.BLOB_READ_WRITE_TOKEN });
      } catch (e) {
        console.log(`  ${slot}: prev blob delete failed (ignored): ${e?.message}`);
      }
    }

    process.stdout.write(`  ${slot}: uploading ${basename(filePath)}…`);
    try {
      const url = await uploadOne(brand.id, slot, filePath);
      updates[fieldName] = url;
      console.log(` OK\n    → ${url}`);
      summary.push({ brand: brand.name, slot, action: "uploaded", url });
    } catch (e) {
      console.log(` FAIL: ${e?.message || e}`);
      summary.push({ brand: brand.name, slot, action: "failed", error: e?.message });
    }
  }

  if (Object.keys(updates).length > 0) {
    await patchBrand(brand.id, updates);
    console.log(`  Airtable updated: ${Object.keys(updates).join(", ")}`);
  } else {
    console.log(`  No Airtable updates needed.`);
  }
}

console.log("\n=== Summary ===");
for (const s of summary) {
  console.log(JSON.stringify(s));
}
