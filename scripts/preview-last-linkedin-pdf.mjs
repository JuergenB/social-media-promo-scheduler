/**
 * Preview the LinkedIn document title + PDF filename that would be generated
 * for a LinkedIn carousel post. Shows before-vs-after vs. the legacy slug.
 *
 * Usage:
 *   npx tsx scripts/preview-last-linkedin-pdf.mjs                      # most recent carousel
 *   npx tsx scripts/preview-last-linkedin-pdf.mjs "Issue No.75"        # matches campaign name substring
 *   npx tsx scripts/preview-last-linkedin-pdf.mjs --post recXXXXXXXX   # specific post id
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const envFile = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.AIRTABLE_BASE_ID;
const KEY = process.env.AIRTABLE_API_KEY;
if (!BASE || !KEY) throw new Error("Missing Airtable env");

async function airtable(query) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE}/${query}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

const args = process.argv.slice(2);
const postIdArgIdx = args.indexOf("--post");
const explicitPostId = postIdArgIdx >= 0 ? args[postIdArgIdx + 1] : null;
const searchTerm = !explicitPostId && args[0] && !args[0].startsWith("--")
  ? args[0]
  : null;

let post = null;

if (explicitPostId) {
  post = await airtable(`Posts/${explicitPostId}`);
} else if (searchTerm) {
  // Find a LinkedIn carousel post in a campaign whose name contains the search term.
  const campaignFilter = encodeURIComponent(
    `FIND(LOWER("${searchTerm}"), LOWER({Name}))`
  );
  const camp = await airtable(`Campaigns?filterByFormula=${campaignFilter}&maxRecords=10`);
  if (!camp.records.length) {
    console.error(`No campaign matched "${searchTerm}".`);
    process.exit(1);
  }
  console.log(`Matched ${camp.records.length} campaign(s) for "${searchTerm}":`);
  for (const c of camp.records) console.log(`  ${c.id}  ${c.fields.Name}`);

  // For each matched campaign, scan that campaign's posts (paginated) and find a LinkedIn one.
  let fallbackPost = null;
  const campaignIds = new Set(camp.records.map((c) => c.id));

  // List all posts for these campaigns by paginating until exhausted.
  // (Linked-record FIND() inside filterByFormula is unreliable; client-filter instead.)
  let offset = "";
  outer: for (let page = 0; page < 30; page++) {
    const params = new URLSearchParams({
      "filterByFormula": `{Platform} = "LinkedIn"`,
      "sort[0][field]": "Scheduled Date",
      "sort[0][direction]": "desc",
      "pageSize": "100",
    });
    if (offset) params.set("offset", offset);
    const data = await airtable(`Posts?${params.toString()}`);
    for (const r of data.records) {
      const linked = r.fields.Campaign || [];
      if (!linked.some((id) => campaignIds.has(id))) continue;
      const mediaUrls = r.fields["Media URLs"];
      const count = mediaUrls
        ? mediaUrls.split(/\r?\n/).filter((s) => s.trim().length > 0).length
        : 0;
      const userPdf = r.fields["Carousel PDF URL"];
      if (count >= 2 || userPdf) {
        post = r;
        post._mediaCount = count;
        post._userPdf = !!userPdf;
        break outer;
      }
      if (!fallbackPost) {
        fallbackPost = r;
        fallbackPost._mediaCount = count;
      }
    }
    if (!data.offset) break;
    offset = data.offset;
  }

  if (!post && fallbackPost) {
    post = fallbackPost;
    console.log("(no carousel — using single-image LinkedIn post for the title preview)");
  }
  if (!post) {
    console.error(`Found campaigns but no LinkedIn post in them.`);
    process.exit(1);
  }
} else {
  // Most recent LinkedIn carousel anywhere
  const filter = encodeURIComponent(
    'AND({Platform} = "LinkedIn", {Zernio Post ID} != "")'
  );
  const url =
    `Posts?filterByFormula=${filter}` +
    `&sort%5B0%5D%5Bfield%5D=Scheduled%20Date&sort%5B0%5D%5Bdirection%5D=desc` +
    `&maxRecords=8`;
  const { records } = await airtable(url);
  if (records.length === 0) {
    console.log("No published LinkedIn posts found.");
    process.exit(0);
  }
  for (const r of records) {
    const mediaUrls = r.fields["Media URLs"];
    const count = mediaUrls
      ? mediaUrls.split(/\r?\n/).filter((s) => s.trim().length > 0).length
      : 0;
    const userPdf = r.fields["Carousel PDF URL"];
    if (count >= 2 || userPdf) {
      post = r;
      post._mediaCount = count;
      post._userPdf = !!userPdf;
      break;
    }
  }
  if (!post) {
    post = records[0];
    post._mediaCount = 1;
  }
}

const campaignId = post.fields.Campaign?.[0];
if (!campaignId) {
  console.error("Post has no campaign linked.");
  process.exit(1);
}
const campaign = await airtable(`Campaigns/${campaignId}`);
const brandId = campaign.fields.Brand?.[0];
const brand = brandId ? await airtable(`Brands/${brandId}`) : null;

console.log(`\n=== Most recent LinkedIn carousel post ===`);
console.log(`Post ID:       ${post.id}`);
console.log(`Scheduled:     ${post.fields["Scheduled Date"] || "(none)"}`);
console.log(`Status:        ${post.fields.Status}`);
console.log(`Media items:   ${post._mediaCount}${post._userPdf ? " (user-supplied PDF)" : ""}`);
console.log(`Zernio post:   ${post.fields["Zernio Post ID"] || "(none)"}`);
console.log(`\nCampaign:      ${campaign.fields.Name}`);
console.log(`Brand:         ${brand?.fields.Name || "(none)"}`);
console.log(
  `\nPost content (first 200 chars):\n  ${(post.fields.Content || "").slice(0, 200).replace(/\n/g, "\n  ")}`
);
console.log(
  `\nCampaign description (first 300 chars):\n  ${(campaign.fields.Description || "").slice(0, 300).replace(/\n/g, "\n  ")}`
);
console.log(
  `\nEditorial direction (first 300 chars):\n  ${(campaign.fields["Editorial Direction"] || "").slice(0, 300).replace(/\n/g, "\n  ")}`
);

const { prepareLinkedInPdfMetadata } = await import("../src/lib/pdf-carousel.ts");

console.log(`\n=== Generating new title (Claude Sonnet 4.6) ===`);
const t0 = Date.now();
const meta = await prepareLinkedInPdfMetadata({
  campaignDescription: campaign.fields.Description || "",
  editorialDirection: campaign.fields["Editorial Direction"] || "",
  postContent: post.fields.Content || "",
  brand: { anthropicApiKeyLabel: brand?.fields["Anthropic API Key Label"] || null },
});
const ms = Date.now() - t0;
console.log(`\nNEW documentTitle:  "${meta.documentTitle}"  (${meta.documentTitle.length} chars, ${ms}ms)`);
console.log(`NEW filename:        "${meta.filename}"  (${meta.filename.length} chars)`);

// For comparison: what the OLD slugified filename would have been
function legacySlug(name, postId) {
  const slug = (name || "carousel")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60)
    .replace(/-+$/, "");
  const suffix = postId ? `-${postId.slice(-6).toLowerCase()}` : "";
  const head =
    slug.length + suffix.length > 60
      ? slug.slice(0, Math.max(1, 60 - suffix.length)).replace(/-+$/, "")
      : slug;
  return `${head}${suffix}.pdf`;
}
console.log(`\nOLD filename (legacy slug, for comparison): "${legacySlug(campaign.fields.Name, post.id)}"`);
