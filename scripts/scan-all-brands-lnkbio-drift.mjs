// Scan every lnk.bio-enabled brand for Instagram posts whose Lnk.Bio Entry ID was likely created
// with the drifted schedule_from format (bug in src/lib/lnk-bio.ts pre-fix).
// Read-only. Prints a repair-ready summary.
// Run: node --env-file=.env.local scripts/scan-all-brands-lnkbio-drift.mjs

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = "app5FPCG06huzh7hX";
const POSTS_TABLE = "tblyUEPOJXxpQDZNL";
const CAMPAIGNS_TABLE = "tbl4S3vdDR4JgBT1d";
const BRANDS_TABLE = "tblK6tDXvx8Qt0CXh";

async function atGet(path) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Airtable ${r.status}: ${await r.text()}`);
  return r.json();
}

async function atAll(path) {
  const out = [];
  let offset;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const url = offset ? `${path}${sep}offset=${offset}` : path;
    const data = await atGet(url);
    out.push(...data.records);
    offset = data.offset;
  } while (offset);
  return out;
}

const brands = await atAll(`${BRANDS_TABLE}?pageSize=100`);
const enabledBrands = brands.filter((b) => b.fields["Lnk.Bio Enabled"]);

const campaigns = await atAll(`${CAMPAIGNS_TABLE}?pageSize=100`);
const campaignToBrand = new Map();
for (const c of campaigns) {
  const b = c.fields.Brand?.[0];
  if (b) campaignToBrand.set(c.id, b);
}

const posts = await atAll(
  `${POSTS_TABLE}?filterByFormula=${encodeURIComponent(`{Lnk.Bio Entry ID} != ""`)}&pageSize=100`
);

const now = Date.now();
const byBrand = new Map();
for (const p of posts) {
  const cid = p.fields.Campaign?.[0];
  const bid = cid ? campaignToBrand.get(cid) : null;
  if (!bid) continue;
  if (!byBrand.has(bid)) byBrand.set(bid, []);
  byBrand.get(bid).push(p);
}

console.log("Scope of timezone drift (every Lnk.Bio entry created via the old code is off by 4h during EDT):\n");
for (const brand of enabledBrands) {
  const list = byBrand.get(brand.id) || [];
  const future = list.filter((p) => p.fields["Scheduled Date"] && new Date(p.fields["Scheduled Date"]).getTime() > now);
  const past = list.filter((p) => p.fields["Scheduled Date"] && new Date(p.fields["Scheduled Date"]).getTime() <= now);
  console.log(`── ${brand.fields.Name} (${brand.id}) ──`);
  console.log(`   total: ${list.length}  future: ${future.length}  past: ${past.length}`);
  for (const p of future) {
    const d = p.fields["Scheduled Date"];
    const et = new Date(d).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" });
    console.log(`   [future] ${p.id}  ${et} ET  lnkbio=${p.fields["Lnk.Bio Entry ID"]}  "${(p.fields.Content || "").split("\n")[0].slice(0, 50)}"`);
  }
  console.log("");
}
