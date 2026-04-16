#!/usr/bin/env node
/**
 * Upload template preview images to Vercel Blob and update Airtable Preview fields.
 */
const { put } = require("@vercel/blob");
const fs = require("fs");
const path = require("path");

const PREVIEW_DIR = path.join(__dirname, "..", "docs", "template-previews");
const BASE_ID = "app5FPCG06huzh7hX";
const TABLE = "Cover Slide Templates";

const TEMPLATES = [
  { slug: "editorial-cover-light", file: "editorial-cover-light.jpg", airtableId: "recv3HAcbVc5XngKs" },
  { slug: "editorial-cover-dark", file: "editorial-cover-dark.jpg", airtableId: "recYpbf6rgP9anJYu" },
  { slug: "quotable-card", file: "quotable-card.jpg", airtableId: "recbM7BFeuxZWvp6q" },
  { slug: "dark-quotable-card", file: "dark-quotable-card.jpg", airtableId: "rec51OMgfwx9Htp0S" },
];

async function main() {
  const PAT = process.env.AIRTABLE_API_KEY;
  if (!PAT) {
    console.error("Set AIRTABLE_API_KEY env var");
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("Set BLOB_READ_WRITE_TOKEN env var");
    process.exit(1);
  }

  for (const tmpl of TEMPLATES) {
    const filePath = path.join(PREVIEW_DIR, tmpl.file);
    if (!fs.existsSync(filePath)) {
      console.log(`SKIP: ${tmpl.file} not found`);
      continue;
    }

    const buffer = fs.readFileSync(filePath);
    const blobPath = `images/template-previews/${tmpl.slug}.jpg`;

    console.log(`Uploading ${tmpl.file} to Vercel Blob...`);
    const { url } = await put(blobPath, buffer, {
      access: "public",
      contentType: "image/jpeg",
      allowOverwrite: true,
    });
    console.log(`  Blob URL: ${url}`);

    // Update Airtable Preview field (attachment)
    console.log(`  Updating Airtable record ${tmpl.airtableId}...`);
    const airtableUrl = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}/${tmpl.airtableId}`;
    const res = await fetch(airtableUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          Preview: [{ url }],
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`  FAIL: Airtable update failed: ${res.status} ${text}`);
    } else {
      console.log(`  OK: Airtable updated`);
    }
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
