// Probe lnk.bio to find the correct schedule_from format.
// For each format we:
//   1. create a test entry with the chosen schedule_from
//   2. list and read it back, capturing how lnk.bio echoes the schedule
//   3. delete the test entry
// Scheduled in the future so it stays hidden on the live profile while we test.
// Run: node --env-file=.env.local scripts/probe-lnkbio-timezone.mjs

const BASE = "https://lnk.bio/oauth/v1";
const BRAND = "ARTSVILLE";
const GROUP_ID = "75676";

const clientId = process.env[`LNKBIO_CLIENT_ID_${BRAND}`];
const secretB64 = process.env[`LNKBIO_CLIENT_SECRET_B64_${BRAND}`];
if (!clientId || !secretB64) {
  console.error(`Missing LNKBIO_CLIENT_ID_${BRAND} or LNKBIO_CLIENT_SECRET_B64_${BRAND}`);
  process.exit(1);
}
const secret = Buffer.from(secretB64, "base64").toString("utf8");

async function getToken() {
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch("https://lnk.bio/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token ${res.status}: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function api(token, path, method = "GET", formData = null) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  };
  if (formData) {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(formData).toString();
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  const body = ct.includes("application/json") ? JSON.parse(text) : text.slice(0, 300);
  return { status: res.status, body };
}

const token = await getToken();

// Snapshot: list existing entries first (we need this to see how schedule_from looks for real, already-scheduled items).
const listBefore = await api(token, `/lnk/list?group_id=${GROUP_ID}`);
const entries = listBefore.body?.data || [];
console.log(`=== ARTSVILLE: existing entries in group ${GROUP_ID}: ${entries.length} ===`);
// Show schedule-related fields for a handful of recent entries.
for (const e of entries.slice(0, 10)) {
  console.log(JSON.stringify({
    link_id: e.link_id,
    title: (e.title || "").slice(0, 50),
    created_at: e.created_at,
    schedule_from: e.schedule_from,
    schedule_to: e.schedule_to,
    group_id: e.group_id,
  }));
}

// Target wall-clock time for probes: tomorrow 1:00 PM ET.
// In April we are in EDT (UTC-4). 13:00 ET == 17:00 UTC.
// Build a target date deterministically.
const tomorrow = new Date();
tomorrow.setUTCDate(tomorrow.getUTCDate() + 2); // +2 days to be safe past any "today" edge
const y = tomorrow.getUTCFullYear();
const m = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
const d = String(tomorrow.getUTCDate()).padStart(2, "0");

// Four candidate formats — all representing the SAME instant: 1:00 PM ET / 17:00 UTC on that date.
const FORMATS = [
  { label: "A_utc_z",      value: `${y}-${m}-${d}T17:00:00Z` },
  { label: "B_edt_offset", value: `${y}-${m}-${d}T13:00:00-04:00` },
  { label: "C_naive_et",   value: `${y}-${m}-${d}T13:00:00` },
  { label: "D_naive_utc",  value: `${y}-${m}-${d}T17:00:00` },
];

console.log(`\n=== Probing schedule_from formats (target wall time = 1:00 PM ET on ${y}-${m}-${d}) ===\n`);

const createdIds = [];
for (const fmt of FORMATS) {
  const title = `TZ-PROBE-${fmt.label}-${Date.now()}`;
  const params = {
    title,
    link: "https://example.com/tz-probe",
    group_id: GROUP_ID,
    schedule_from: fmt.value,
  };
  const create = await api(token, "/lnk/add", "POST", params);
  const id = create.body?.data?.id || create.body?.info?.lnk_id;
  if (id) createdIds.push({ id, label: fmt.label, sent: fmt.value });
  console.log(`[CREATE ${fmt.label}] sent schedule_from="${fmt.value}" → status=${create.status} id=${id || "?"} body=${JSON.stringify(create.body).slice(0, 200)}`);
}

// Now list and find what lnk.bio echoes back for each created entry.
const listAfter = await api(token, `/lnk/list?group_id=${GROUP_ID}`);
const entriesAfter = listAfter.body?.data || [];
console.log(`\n=== Echoed schedule_from per format ===`);
for (const c of createdIds) {
  const entry = entriesAfter.find((e) => String(e.link_id) === String(c.id));
  if (!entry) {
    console.log(`[${c.label}] id=${c.id} — NOT FOUND in list`);
    continue;
  }
  console.log(`[${c.label}] sent="${c.sent}" → echoed schedule_from="${entry.schedule_from}" title="${(entry.title || "").slice(0, 40)}"`);
}

// Cleanup: delete all test entries.
console.log(`\n=== Cleanup ===`);
for (const c of createdIds) {
  const del = await api(token, "/lnk/delete", "POST", { link_id: c.id });
  console.log(`[DELETE ${c.label}] id=${c.id} → status=${del.status}`);
}
