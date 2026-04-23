// Repair lnk.bio entries whose schedule_from was stamped with `-04:00` but ran on a UTC server,
// shifting the intended wall-clock time forward by 4 hours.
//
// Usage:
//   node --env-file=.env.local scripts/repair-lnkbio-timezone-drift.mjs <postId1> [<postId2> ...]
//
// For each Airtable post:
//   1. Read the correct UTC scheduled time from Airtable ("Scheduled Date" — stored as ISO UTC).
//   2. Look up the brand's lnk.bio credentials and target group.
//   3. Delete the existing lnk.bio entry (referenced by "Lnk.Bio Entry ID").
//   4. Create a new entry with the correct RFC3339 UTC schedule_from (uses same format as the
//      now-fixed src/lib/lnk-bio.ts).
//   5. Write the new entry ID back to Airtable.

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = "app5FPCG06huzh7hX";
const POSTS_TABLE = "tblyUEPOJXxpQDZNL";
const CAMPAIGNS_TABLE = "tbl4S3vdDR4JgBT1d";
const BRANDS_TABLE = "tblK6tDXvx8Qt0CXh";

const LNK_BASE = "https://lnk.bio/oauth/v1";

const postIds = process.argv.slice(2);
if (postIds.length === 0) {
  console.error("Usage: node --env-file=.env.local scripts/repair-lnkbio-timezone-drift.mjs <postId> [<postId>...]");
  process.exit(1);
}

// ── Airtable helpers ────────────────────────────────────────────────────────
async function atGet(path) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Airtable GET ${r.status}: ${await r.text()}`);
  return r.json();
}

async function atPatch(table, id, fields) {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${table}/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Airtable PATCH ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── lnk.bio helpers (mirror the fixed src/lib/lnk-bio.ts) ───────────────────
async function lnkToken(clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://lnk.bio/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`lnk.bio token ${res.status}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function lnkApi(token, path, method = "GET", formData = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  };
  if (formData) {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(formData).toString();
  }
  const res = await fetch(`${LNK_BASE}${path}`, opts);
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

function toRfc3339Utc(scheduledDate) {
  // Matches the fix in src/lib/lnk-bio.ts: strict RFC3339 UTC with no fractional seconds.
  return new Date(scheduledDate).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ── Main ────────────────────────────────────────────────────────────────────
for (const postId of postIds) {
  console.log(`\n━━━━━━━━━━ ${postId} ━━━━━━━━━━`);
  const post = await atGet(`${POSTS_TABLE}/${postId}`);
  const pf = post.fields;
  const lnkbioId = pf["Lnk.Bio Entry ID"];
  const scheduledDate = pf["Scheduled Date"];
  const shortUrl = pf["Short URL"];
  const campaignId = pf.Campaign?.[0];
  if (!lnkbioId) {
    console.log(`  SKIP: no Lnk.Bio Entry ID`);
    continue;
  }
  if (!scheduledDate) {
    console.log(`  SKIP: no Scheduled Date`);
    continue;
  }
  if (!shortUrl) {
    console.log(`  SKIP: no Short URL`);
    continue;
  }
  if (!campaignId) {
    console.log(`  SKIP: not linked to a campaign`);
    continue;
  }

  // Resolve brand config via Campaign → Brand.
  const campaign = await atGet(`${CAMPAIGNS_TABLE}/${campaignId}`);
  const brandId = campaign.fields.Brand?.[0];
  if (!brandId) {
    console.log(`  SKIP: campaign has no brand`);
    continue;
  }
  const brand = await atGet(`${BRANDS_TABLE}/${brandId}`);
  const bf = brand.fields;
  if (!bf["Lnk.Bio Enabled"]) {
    console.log(`  SKIP: brand ${bf.Name} has lnk.bio disabled`);
    continue;
  }
  const groupId = bf["Lnk.Bio Group ID"];
  const clientIdLabel = bf["Lnk.Bio Client ID Label"];
  const clientSecretLabel = bf["Lnk.Bio Client Secret Label"];
  const clientId = (clientIdLabel && process.env[clientIdLabel]) || process.env.LNKBIO_CLIENT_ID;
  const secretB64 = (clientSecretLabel && process.env[clientSecretLabel]) || process.env.LNKBIO_CLIENT_SECRET_B64;
  if (!clientId || !secretB64 || !groupId) {
    console.log(`  SKIP: brand ${bf.Name} missing creds or groupId`);
    continue;
  }
  const clientSecret = Buffer.from(secretB64, "base64").toString("utf8");

  const token = await lnkToken(clientId, clientSecret);

  // Delete the existing entry.
  const del = await lnkApi(token, "/lnk/delete", "POST", { link_id: String(lnkbioId) });
  console.log(`  DELETE id=${lnkbioId} → status=${del.status}`);

  // Extract media: prefer "Image URL", else first "Media URLs" entry.
  let image = pf["Image URL"] || "";
  if (!image && pf["Media URLs"]) {
    const first = String(pf["Media URLs"]).split("\n").map((s) => s.trim()).filter(Boolean)[0];
    image = first || "";
  }

  const scheduleFrom = toRfc3339Utc(scheduledDate);
  const title = (pf.Content || "").split("\n")[0].slice(0, 100) || "Link";

  const payload = {
    title,
    link: shortUrl,
    group_id: String(groupId),
    schedule_from: scheduleFrom,
  };
  if (image) payload.image = image;

  console.log(`  CREATE schedule_from="${scheduleFrom}" (was '${scheduledDate}' UTC, should display 1 PM ET for a 17:00 UTC post)`);
  const create = await lnkApi(token, "/lnk/add", "POST", payload);
  const newId = create.body?.data?.id;
  console.log(`  CREATE status=${create.status} newId=${newId} body=${JSON.stringify(create.body).slice(0, 250)}`);

  if (!newId) {
    console.log(`  ERROR: creation failed; Airtable still points at old id ${lnkbioId}`);
    continue;
  }

  // Update Airtable with the new entry ID.
  await atPatch("Posts", postId, { "Lnk.Bio Entry ID": String(newId) });
  console.log(`  UPDATED Airtable: Lnk.Bio Entry ID ${lnkbioId} → ${newId}`);
}
