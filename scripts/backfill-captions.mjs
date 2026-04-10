#!/usr/bin/env node
/**
 * Backfill image captions for existing campaigns and their posts.
 *
 * For each campaign with a source URL and stored Scraped Images:
 *   1. Re-scrapes the URL via Firecrawl to extract <figcaption> text
 *   2. Merges new captions into the campaign's Scraped Images JSON
 *   3. Updates each campaign post's Media Captions with the new captions
 *
 * Usage:
 *   node scripts/backfill-captions.mjs                  # dry run (report only)
 *   node scripts/backfill-captions.mjs --apply          # write changes to Airtable
 *   node scripts/backfill-captions.mjs --campaign recXYZ # single campaign
 *
 * Requires: AIRTABLE_API_KEY, FIRECRAWL_API_KEY in .env.local
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load env ────────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
const envText = readFileSync(envPath, "utf-8");
for (const line of envText.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) process.env[match[1]] = match[2];
}

const AIRTABLE_PAT = process.env.AIRTABLE_API_KEY;
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
const BASE_ID = "app5FPCG06huzh7hX";
const CAMPAIGNS_TABLE = "Campaigns";
const POSTS_TABLE = "Posts";

if (!AIRTABLE_PAT || !FIRECRAWL_KEY) {
  console.error("Missing AIRTABLE_API_KEY or FIRECRAWL_API_KEY in .env.local");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const singleCampaignId = args.find((a, i) => args[i - 1] === "--campaign") || null;

if (dryRun) {
  console.log("🔍 DRY RUN — no changes will be written. Pass --apply to update Airtable.\n");
}

// ── Airtable helpers ────────────────────────────────────────────────────

async function airtableGet(path) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}${path}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
  });
  if (!res.ok) throw new Error(`Airtable GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function airtablePatch(table, recordId, fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
  if (!res.ok) throw new Error(`Airtable PATCH ${table}/${recordId}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function listAllRecords(table, fields, filter) {
  const all = [];
  let offset;
  do {
    const params = new URLSearchParams();
    for (const f of fields) params.append("fields[]", f);
    if (filter) params.set("filterByFormula", filter);
    if (offset) params.set("offset", offset);
    const data = await airtableGet(`/${encodeURIComponent(table)}?${params}`);
    all.push(...data.records);
    offset = data.offset;
  } while (offset);
  return all;
}

// ── Firecrawl scrape ────────────────────────────────────────────────────

async function scrapeWithCaptions(url) {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "html"],
      onlyMainContent: false,
      excludeTags: [
        "nav", "footer", "header",
        ".sidebar", ".widget", ".ad", ".popup",
        ".convertbox", ".cb-widget", ".cb-overlay",
        ".share-buttons", ".social-share", ".related-posts",
        ".comments", "#comments",
        "script", "style", "iframe",
        ".recommended", ".read-next",
        ".post-feed", ".post-card", ".gh-post-feed",
        ".more-posts", ".further-reading", ".you-might-also-like",
        "aside",
      ],
      waitFor: 3000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl scrape failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const page = data?.data;
  if (!page) throw new Error("Firecrawl returned no data");

  const html = page.html || "";
  const markdown = page.markdown || "";

  // Extract figcaptions from HTML (authoritative source)
  const htmlCaptions = extractCaptionsFromHtml(html);

  // Extract trailing captions from markdown (fallback)
  const mdCaptions = extractCaptionsFromMarkdown(markdown);

  // Merge: HTML takes priority
  const merged = new Map([...mdCaptions, ...htmlCaptions]);
  return merged;
}

// ── Caption extraction ──────────────────────────────────────────────────

const SMART_QUOTE_STRIP = /^[''""'"`\u2018\u2019\u201C\u201D]+|[''""'"`\u2018\u2019\u201C\u201D]+$/g;

function extractCaptionsFromHtml(html) {
  const captions = new Map();
  if (!html) return captions;

  // <figure> containing <img> and <figcaption>
  const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
  let figMatch;
  while ((figMatch = figureRegex.exec(html)) !== null) {
    const figureHtml = figMatch[1];
    const imgSrcRegex = /src="([^"]+)"/g;
    let srcMatch;
    const urls = [];
    while ((srcMatch = imgSrcRegex.exec(figureHtml)) !== null) {
      urls.push(srcMatch[1]);
    }
    const captionMatch = figureHtml.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
    if (captionMatch) {
      const entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
      const captionText = captionMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&#?\w+;/g, (m) => entities[m] || m)
        .replace(/\s+/g, " ") // normalize whitespace (multi-line figcaptions)
        .replace(SMART_QUOTE_STRIP, "")
        .trim();
      if (captionText) {
        for (const url of urls) captions.set(url, captionText);
      }
    }
  }

  // WordPress wp-caption divs
  const wpRegex = /<div[^>]*class="[^"]*wp-caption[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let wpMatch;
  while ((wpMatch = wpRegex.exec(html)) !== null) {
    const block = wpMatch[1];
    const imgSrc = block.match(/src="([^"]+)"/);
    const captionP = block.match(/<p[^>]*class="[^"]*wp-caption-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (imgSrc && captionP) {
      const text = captionP[1].replace(/<[^>]+>/g, "").replace(SMART_QUOTE_STRIP, "").trim();
      if (text && !captions.has(imgSrc[1])) captions.set(imgSrc[1], text);
    }
  }

  return captions;
}

function extractCaptionsFromMarkdown(markdown) {
  const captions = new Map();
  if (!markdown) return captions;

  const regex = /!\[[^\]]*\]\(([^)]+)\)([^\n#!\[]*)?/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const url = match[1];
    const raw = (match[2] || "").trim();
    const caption = raw ? raw.replace(SMART_QUOTE_STRIP, "").trim() : "";
    if (!caption) continue;
    // Skip markdown artifacts: link syntax, backslashes, very short fragments
    if (caption.startsWith("](") || caption.startsWith("[") || /^\\+$/.test(caption) || caption.length < 2) continue;
    // Skip if it looks like a URL or file extension fragment
    if (caption.startsWith("http://") || caption.startsWith("https://")) continue;
    if (/\.(jpg|jpeg|png|gif|webp|svg)\)?$/i.test(caption)) continue;
    captions.set(url, caption);
  }
  return captions;
}

// ── URL matching helpers ────────────────────────────────────────────────

function urlBasename(url) {
  return (url || "").split("/").pop()?.split("?")[0] || "";
}

function normalizeBasename(basename) {
  return basename.replace(/[_-]\d{1,4}x\d{1,4}(?=\.[a-z]+$)/i, "");
}

/** Find caption for an image URL from the scraped caption map.
 *  Matches by exact URL, basename, or normalized basename (responsive variants). */
function findCaption(imageUrl, captionMap) {
  if (captionMap.has(imageUrl)) return captionMap.get(imageUrl);

  const basename = urlBasename(imageUrl);
  const normalized = normalizeBasename(basename);

  for (const [captionUrl, caption] of captionMap) {
    const cBasename = urlBasename(captionUrl);
    const cNormalized = normalizeBasename(cBasename);
    if (basename === cBasename || normalized === cNormalized || basename === cNormalized || normalized === cBasename) {
      return caption;
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  // Step 1: Fetch campaigns with Scraped Images
  console.log("Fetching campaigns...");
  const filter = singleCampaignId
    ? `RECORD_ID() = '${singleCampaignId}'`
    : "NOT({Scraped Images} = '')";
  const campaigns = await listAllRecords(CAMPAIGNS_TABLE, ["Name", "URL", "Scraped Images"], filter);
  console.log(`Found ${campaigns.length} campaign(s) with Scraped Images.\n`);

  let totalCampaignsUpdated = 0;
  let totalPostsUpdated = 0;
  let totalCaptionsAdded = 0;

  for (const campaign of campaigns) {
    const { Name: name, URL: sourceUrl, "Scraped Images": scrapedJson } = campaign.fields;

    if (!sourceUrl) {
      console.log(`⏭  ${name || campaign.id} — no source URL, skipping`);
      continue;
    }

    let existingImages;
    try {
      existingImages = JSON.parse(scrapedJson);
      if (!Array.isArray(existingImages)) throw new Error("not an array");
    } catch {
      console.log(`⏭  ${name || campaign.id} — invalid Scraped Images JSON, skipping`);
      continue;
    }

    // Check if captions already exist
    const alreadyHasCaptions = existingImages.some((img) => img.caption);
    if (alreadyHasCaptions) {
      console.log(`✅ ${name} — already has captions, skipping`);
      continue;
    }

    // Step 2: Re-scrape the source URL
    console.log(`🔄 ${name}`);
    console.log(`   URL: ${sourceUrl}`);
    let captionMap;
    try {
      captionMap = await scrapeWithCaptions(sourceUrl);
    } catch (err) {
      console.log(`   ❌ Scrape failed: ${err.message}`);
      continue;
    }

    if (captionMap.size === 0) {
      console.log(`   ℹ  No captions found on page, skipping`);
      continue;
    }

    // Step 3: Merge captions into existing images
    let captionsAdded = 0;
    for (const img of existingImages) {
      if (img.caption) continue; // don't overwrite existing
      const caption = findCaption(img.url, captionMap);
      if (caption) {
        img.caption = caption;
        captionsAdded++;
      }
    }

    if (captionsAdded === 0) {
      console.log(`   ℹ  No new captions matched existing images`);
      continue;
    }

    console.log(`   📝 ${captionsAdded} caption(s) matched:`);
    for (const img of existingImages) {
      if (img.caption) {
        const file = urlBasename(img.url).slice(0, 30);
        console.log(`      ${file}... → "${img.caption}"`);
      }
    }

    // Step 4: Update campaign in Airtable
    if (!dryRun) {
      await airtablePatch(CAMPAIGNS_TABLE, campaign.id, {
        "Scraped Images": JSON.stringify(existingImages),
      });
      console.log(`   ✅ Campaign updated`);
    }
    totalCampaignsUpdated++;
    totalCaptionsAdded += captionsAdded;

    // Step 5: Cascade to posts — update Media Captions where image URLs match
    // Build a caption lookup from the campaign's enriched images
    const captionByBasename = new Map();
    for (const img of existingImages) {
      if (!img.caption) continue;
      const bn = normalizeBasename(urlBasename(img.url));
      if (bn) captionByBasename.set(bn, img.caption);
      // Also store the full basename (before normalization)
      const fullBn = urlBasename(img.url);
      if (fullBn) captionByBasename.set(fullBn, img.caption);
    }

    const posts = await listAllRecords(
      POSTS_TABLE,
      ["Campaign", "Image URL", "Media URLs", "Media Captions"],
      `SEARCH("${campaign.id}", ARRAYJOIN({Campaign}))`
    );

    let postsUpdatedForCampaign = 0;
    for (const post of posts) {
      const fields = post.fields;
      const imageUrl = fields["Image URL"] || "";
      const mediaUrls = (fields["Media URLs"] || "").split("\n").map((u) => u.trim()).filter(Boolean);
      const allPostUrls = [imageUrl, ...mediaUrls].filter(Boolean);

      if (allPostUrls.length === 0) continue;

      // Parse existing Media Captions or build from URLs
      let mediaItems;
      try {
        mediaItems = fields["Media Captions"]
          ? JSON.parse(fields["Media Captions"])
          : allPostUrls.map((url) => ({ url, caption: "" }));
      } catch {
        mediaItems = allPostUrls.map((url) => ({ url, caption: "" }));
      }

      // Merge captions from campaign images
      let postUpdated = false;
      for (const item of mediaItems) {
        if (item.caption) continue; // don't overwrite user-set captions
        // Match by basename (works for original URLs, Vercel Blob URLs won't match — that's OK)
        const itemBn = urlBasename(item.url);
        const itemNorm = normalizeBasename(itemBn);
        const caption = captionByBasename.get(itemBn) || captionByBasename.get(itemNorm);
        if (caption) {
          item.caption = caption;
          postUpdated = true;
        }
      }

      if (postUpdated) {
        if (!dryRun) {
          await airtablePatch(POSTS_TABLE, post.id, {
            "Media Captions": JSON.stringify(mediaItems),
          });
        }
        postsUpdatedForCampaign++;
      }
    }

    if (postsUpdatedForCampaign > 0) {
      console.log(`   📬 ${postsUpdatedForCampaign} post(s) updated with captions`);
      totalPostsUpdated += postsUpdatedForCampaign;
    }

    // Rate limit: 5 Firecrawl requests per minute max
    await new Promise((r) => setTimeout(r, 1500));
    console.log();
  }

  // Summary
  console.log("═══════════════════════════════════════");
  console.log(`${dryRun ? "DRY RUN " : ""}SUMMARY:`);
  console.log(`  Campaigns scanned:  ${campaigns.length}`);
  console.log(`  Campaigns updated:  ${totalCampaignsUpdated}`);
  console.log(`  Captions added:     ${totalCaptionsAdded}`);
  console.log(`  Posts updated:      ${totalPostsUpdated}`);
  if (dryRun) {
    console.log(`\nRun with --apply to write these changes to Airtable.`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
