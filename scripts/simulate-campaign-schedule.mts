/**
 * Simulate a campaign reschedule with the current scheduling algorithm and
 * render the resulting timeline as a standalone SVG/HTML for visual review.
 *
 * Usage:
 *   CAMPAIGN_ID=recXXXX BRAND_ID=recYYYY npx tsx scripts/simulate-campaign-schedule.mts
 *
 * Required env: CAMPAIGN_ID. Optional: BRAND_ID (used to resolve cadence; falls
 * back to the campaign's first brand). Reads Airtable fields (Name, Duration
 * Days, Distribution Bias, Start Date, Brand, Platform Cadence) and the campaign's
 * posts (counted per platform), then dry-runs `schedulePostsAlgorithm` against
 * those counts. Outputs:
 *   - /tmp/sim-<campaign>.html — open in browser
 *   - /tmp/sim-<campaign>.json — raw distribution per day per platform
 */

import { readFileSync, writeFileSync } from "node:fs";
// Without "type": "module" in package.json, tsx loads .ts as CJS and ESM .mts
// imports get the named exports under .default. Use namespace import to handle.
import * as schedulingMod from "../src/lib/scheduling";
import type { DistributionBias, PlatformCadenceConfig } from "../src/lib/airtable/types";

type Algo = typeof import("../src/lib/scheduling").schedulePostsAlgorithm;
const modAny = schedulingMod as unknown as { schedulePostsAlgorithm?: Algo; default?: { schedulePostsAlgorithm?: Algo } };
const resolvedAlgo = modAny.schedulePostsAlgorithm ?? modAny.default?.schedulePostsAlgorithm;
if (!resolvedAlgo) throw new Error("Could not resolve schedulePostsAlgorithm export");
const schedulePostsAlgorithm: Algo = resolvedAlgo;

function loadDotenv(path = ".env.local"): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadDotenv();
const AT_KEY = env.AIRTABLE_API_KEY;
const AT_BASE = env.AIRTABLE_BASE_ID;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;
if (!CAMPAIGN_ID) throw new Error("CAMPAIGN_ID env var required");

async function airtable<T>(path: string): Promise<T> {
  const r = await fetch(`https://api.airtable.com/v0/${AT_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${AT_KEY}` },
  });
  if (!r.ok) throw new Error(`Airtable ${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

const PLATFORM_MAP: Record<string, string> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E4405F",
  twitter: "#1DA1F2",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  threads: "#000000",
  bluesky: "#1185FE",
  pinterest: "#E60023",
  tiktok: "#000000",
};

interface AirtableRecord<F> { id: string; fields: F }
interface Page<F> { records: AirtableRecord<F>[]; offset?: string }

async function main() {
  const campaign = await airtable<AirtableRecord<{
    Name: string;
    Brand: string[];
    "Duration Days": number;
    "Distribution Bias": DistributionBias;
    "Start Date"?: string;
    "Platform Cadence"?: string;
  }>>(`Campaigns/${CAMPAIGN_ID}`);
  const f = campaign.fields;
  console.log(`Campaign: ${f.Name}`);
  console.log(`  Duration: ${f["Duration Days"]} days, Bias: ${f["Distribution Bias"]}`);

  // Resolve cadence
  let cadence: PlatformCadenceConfig | null = null;
  if (f["Platform Cadence"]) {
    try { cadence = JSON.parse(f["Platform Cadence"]); } catch {}
  }
  if (!cadence && f.Brand?.length) {
    const brand = await airtable<AirtableRecord<{ "Platform Cadence"?: string }>>(`Brands/${f.Brand[0]}`);
    if (brand.fields["Platform Cadence"]) {
      try { cadence = JSON.parse(brand.fields["Platform Cadence"]); } catch {}
    }
  }

  // Fetch all posts for this campaign (paginate)
  const matched: Array<{ platform: string; status: string; sortOrder?: number | null }> = [];
  let offset: string | undefined;
  do {
    const qs = new URLSearchParams();
    qs.append("fields[]", "Campaign");
    qs.append("fields[]", "Platform");
    qs.append("fields[]", "Status");
    qs.append("fields[]", "Sort Order");
    qs.set("pageSize", "100");
    if (offset) qs.set("offset", offset);
    const page = await airtable<Page<{ Campaign?: string[]; Platform: string; Status: string; "Sort Order"?: number | null }>>(`Posts?${qs}`);
    for (const r of page.records) {
      if (r.fields.Campaign?.includes(CAMPAIGN_ID!)) {
        matched.push({
          platform: PLATFORM_MAP[r.fields.Platform] || r.fields.Platform.toLowerCase(),
          status: r.fields.Status,
          sortOrder: r.fields["Sort Order"] ?? null,
        });
      }
    }
    offset = page.offset;
  } while (offset);

  // Treat all non-Dismissed posts as candidates for rescheduling — published
  // posts wouldn't move in reality, but we want to see what the SHAPE would be
  // if the same total-post count were rescheduled with the new algorithm.
  const candidates = matched.filter((p) => p.status !== "Dismissed");
  console.log(`  Posts to schedule: ${candidates.length} (excluding Dismissed)`);
  const byPlatform = new Map<string, number>();
  for (const p of candidates) byPlatform.set(p.platform, (byPlatform.get(p.platform) || 0) + 1);
  for (const [plat, count] of byPlatform) console.log(`    ${plat}: ${count}`);

  // Build synthetic post records (just need id + platform + sortOrder)
  const posts = candidates.map((p, i) => ({
    id: `sim-${i}`,
    platform: p.platform,
    sortOrder: p.sortOrder ?? null,
  }));

  // Start date: today at local midnight (or campaign Start Date)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = f["Start Date"]
    ? new Date(f["Start Date"] + "T00:00:00")
    : today;

  const slots = schedulePostsAlgorithm({
    posts,
    startDate,
    durationDays: f["Duration Days"],
    bias: f["Distribution Bias"],
    cadence,
  });

  // Build per-day per-platform counts
  const dayMap = new Map<string, Map<string, number>>();
  for (const s of slots) {
    const d = new Date(s.scheduledDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let perDay = dayMap.get(key);
    if (!perDay) { perDay = new Map(); dayMap.set(key, perDay); }
    perDay.set(s.platform, (perDay.get(s.platform) || 0) + 1);
  }

  // Render an HTML file modeled on CampaignTimeline's layout
  const startMid = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const sortedDays = [...dayMap.entries()].sort();
  const W = 1200;
  const lpx = (offset: number) => Math.round((offset / f["Duration Days"]) * W);

  const dotsHtml = sortedDays.map(([dayStr, plat]) => {
    const [y, m, day] = dayStr.split("-").map(Number);
    const dt = new Date(y, m - 1, day).getTime();
    const offset = Math.round((dt - startMid) / 86_400_000);
    const x = lpx(offset);
    const dots = [...plat.entries()].map(([p, count]) => {
      const color = PLATFORM_COLORS[p] || "#6b7280";
      return Array.from({ length: count }).map(() =>
        `<div class="dot" style="background:${color}"></div>`
      ).join("");
    }).join("");
    return `<div class="cell" style="left:${x}px"><div class="row">${dots}</div></div>`;
  }).join("");

  const monthMarks: string[] = [];
  let lastMonth = -1;
  for (let d = 0; d <= f["Duration Days"]; d++) {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + d);
    const m = dt.getMonth();
    if (m !== lastMonth) {
      const label = d === 0
        ? dt.toLocaleString("en-US", { month: "short", day: "numeric" })
        : dt.toLocaleString("en-US", { month: "short" });
      monthMarks.push(`<span class="mark" style="left:${lpx(d)}px">${label}</span>`);
      lastMonth = m;
    }
  }
  const endLabel = (() => {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + f["Duration Days"]);
    return dt.toLocaleString("en-US", { month: "short", day: "numeric" });
  })();

  const totals = candidates.length;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Schedule simulation</title>
<style>
  body { font-family: -apple-system, "SF Pro Text", system-ui; margin: 24px; color: #111; }
  .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; max-width: ${W + 40}px; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: baseline; }
  h4 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
  .meta { font-size: 11px; color: #6b7280; margin-left: 8px; }
  .track-area { position: relative; margin-top: 16px; width: ${W}px; }
  .marks { position: relative; height: 18px; }
  .mark { position: absolute; font-size: 10px; color: #6b7280; transform: translateX(-50%); }
  .mark:first-child { transform: none; }
  .end { position: absolute; right: 0; font-size: 10px; color: #6b7280; }
  .ticks { position: relative; height: 6px; }
  .tick { position: absolute; top: 0; width: 1px; height: 6px; background: #e5e7eb; }
  .track { position: relative; height: 40px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
  .cell { position: absolute; top: 50%; transform: translate(-50%, -50%); }
  .row { display: flex; gap: 2px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; opacity: 0.85; }
  .legend { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 4px; font-size: 10px; color: #6b7280; text-transform: capitalize; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
</style></head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <h4 style="display:inline">Campaign Timeline</h4>
        <span class="meta">${totals} posts across ${f["Duration Days"]} days · ${f["Distribution Bias"]} (simulated)</span>
      </div>
    </div>
    <div class="track-area">
      <div class="marks">
        ${monthMarks.join("")}
        <span class="end">${endLabel}</span>
      </div>
      <div class="ticks">
        ${monthMarks.map((_, i) => `<div class="tick" style="left:${lpx(0) + i * (W / 4)}px"></div>`).join("")}
      </div>
      <div class="track">
        ${dotsHtml}
      </div>
    </div>
    <div class="legend">
      ${[...new Set(candidates.map((c) => c.platform))].sort().map((p) =>
        `<div class="legend-item"><div class="legend-dot" style="background:${PLATFORM_COLORS[p] || "#6b7280"}"></div>${p}</div>`
      ).join("")}
    </div>
  </div>
</body></html>`;

  const outHtml = `/tmp/sim-${CAMPAIGN_ID}.html`;
  const outJson = `/tmp/sim-${CAMPAIGN_ID}.json`;
  writeFileSync(outHtml, html);
  writeFileSync(outJson, JSON.stringify({
    campaign: f.Name,
    durationDays: f["Duration Days"],
    bias: f["Distribution Bias"],
    totalPosts: totals,
    perPlatform: Object.fromEntries(byPlatform),
    perDay: Object.fromEntries([...dayMap.entries()].map(([k, v]) => [k, Object.fromEntries(v)])),
  }, null, 2));
  console.log(`HTML: ${outHtml}`);
  console.log(`JSON: ${outJson}`);

  // Also print a textual summary
  console.log("\nDistribution per day:");
  for (let d = 0; d < f["Duration Days"]; d++) {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + d);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const perDay = dayMap.get(key);
    const total = perDay ? [...perDay.values()].reduce((a, b) => a + b, 0) : 0;
    const bar = "█".repeat(total);
    console.log(`  ${key} (d=${d}): ${total.toString().padStart(2)} ${bar}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
