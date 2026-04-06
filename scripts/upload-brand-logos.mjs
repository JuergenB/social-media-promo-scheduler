#!/usr/bin/env node
/**
 * Upload brand logos to Vercel Blob and update Airtable Brands table.
 * Run: node scripts/upload-brand-logos.mjs
 */

import { put } from '@vercel/blob';
import { readFileSync } from 'fs';
import { join } from 'path';

const PAT = "patO7RElDWYl9bwLo.e5c0dfeb7767ac6e862c588bb02d3a948cae51c8aa35b7de0c6a2a1cd359f3c1";
const BASE_ID = "app5FPCG06huzh7hX";
const LOGO_DIR = join(process.cwd(), "docs", "brand-logos");

const brands = [
  {
    name: "Not Real Art",
    airtableId: "recC3FgykeXrRzId1",
    lightFile: "not-real-art-light.png",
    darkFile: "not-real-art-dark.png",
  },
  {
    name: "The Intersect",
    airtableId: "rec0Sn3X3woADYlSE", // will verify
    lightFile: "the-intersect-light.png",
    darkFile: "the-intersect-dark.png",
  },
  {
    name: "Artsville USA",
    airtableId: "recRzyM8RWgN433uv",
    lightFile: "artsville-usa-light.png",
    darkFile: "artsville-usa-dark.png",
  },
];

async function uploadToBlob(filePath, blobPath) {
  const buffer = readFileSync(filePath);
  const blob = await put(blobPath, buffer, {
    access: 'public',
    contentType: 'image/png',
  });
  return blob.url;
}

async function updateAirtable(recordId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Brands/${recordId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Airtable error: ${JSON.stringify(err)}`);
  }
  return res.json();
}

async function main() {
  // First, get all brand IDs to verify
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/Brands`, {
    headers: { Authorization: `Bearer ${PAT}` },
  });
  const data = await res.json();
  console.log("Brands in Airtable:");
  for (const r of data.records) {
    console.log(`  ${r.id} — ${r.fields.Name}`);
  }

  // Update brand IDs from actual data
  for (const brand of brands) {
    const match = data.records.find(r => r.fields.Name === brand.name);
    if (match) {
      brand.airtableId = match.id;
    } else {
      console.log(`  WARNING: No match for "${brand.name}"`);
    }
  }

  for (const brand of brands) {
    console.log(`\nProcessing: ${brand.name} (${brand.airtableId})`);

    // Upload light logo
    const lightPath = join(LOGO_DIR, brand.lightFile);
    console.log(`  Uploading light logo: ${brand.lightFile}...`);
    const lightUrl = await uploadToBlob(lightPath, `images/brands/${brand.airtableId}/logo-light.png`);
    console.log(`  Light URL: ${lightUrl}`);

    // Upload dark logo
    const darkPath = join(LOGO_DIR, brand.darkFile);
    console.log(`  Uploading dark logo: ${brand.darkFile}...`);
    const darkUrl = await uploadToBlob(darkPath, `images/brands/${brand.airtableId}/logo-dark.png`);
    console.log(`  Dark URL: ${darkUrl}`);

    // Update Airtable
    console.log(`  Updating Airtable...`);
    await updateAirtable(brand.airtableId, {
      "Logo Transparent Light": lightUrl,
      "Logo Transparent Dark": darkUrl,
    });
    console.log(`  Done!`);
  }

  console.log("\n=== All logos uploaded and wired! ===");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
