// Deeper probe. Goals:
//   1. Look at the FULL payload of a known Artsville entry so we see every field
//      that might hold schedule_from / schedule_to.
//   2. Create an entry scheduled 60 seconds in the future using 'Z' format,
//      wait ~90s for it to activate, then list and see how schedule_from comes back.
//   3. Do the same with '-04:00' offset format.
//   4. Clean up.
// Run: node --env-file=.env.local scripts/probe-lnkbio-timezone-v2.mjs

const BASE = "https://lnk.bio/oauth/v1";
const BRAND = "ARTSVILLE";
const GROUP_ID = "75676";

const clientId = process.env[`LNKBIO_CLIENT_ID_${BRAND}`];
const secretB64 = process.env[`LNKBIO_CLIENT_SECRET_B64_${BRAND}`];
const secret = Buffer.from(secretB64, "base64").toString("utf8");

async function getToken() {
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch("https://lnk.bio/oauth/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  return (await res.json()).access_token;
}

async function api(token, path, method = "GET", formData = null) {
  const opts = { method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } };
  if (formData) {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(formData).toString();
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body };
}

const token = await getToken();

// 1. Full payload of the first entry to see every available field.
const list1 = await api(token, `/lnk/list?group_id=${GROUP_ID}`);
const first = (list1.body?.data || [])[0];
console.log("=== FULL payload of one existing Artsville entry ===");
console.log(JSON.stringify(first, null, 2));
console.log("");

// 2. Dig for a schedule-specific list endpoint.
for (const path of ["/lnk/scheduled", "/lnk/list/scheduled", "/lnk/list?status=scheduled", "/lnk/list?scheduled=1", "/lnk/list_all", "/lnk/list?include_scheduled=1"]) {
  const r = await api(token, path);
  const hasErr = r.body?.errors?.length;
  const count = r.body?.data?.length ?? "?";
  console.log(`[${r.status}] ${path} — errors=${hasErr || 0}  count=${count}`);
}

// 3. Create two entries scheduled ~2 minutes in the future with different formats,
//    then wait and list to see what the echo looks like.
const inTwoMin = new Date(Date.now() + 2 * 60_000);
const y = inTwoMin.getUTCFullYear();
const mo = String(inTwoMin.getUTCMonth() + 1).padStart(2, "0");
const d = String(inTwoMin.getUTCDate()).padStart(2, "0");
const hh = String(inTwoMin.getUTCHours()).padStart(2, "0");
const mi = String(inTwoMin.getUTCMinutes()).padStart(2, "0");

// Compute the same instant expressed in ET (EDT = UTC-4 in April).
const etDate = new Date(inTwoMin.getTime() - 4 * 3600_000); // subtract 4h from UTC to get EDT wall clock
const eY = etDate.getUTCFullYear();
const eMo = String(etDate.getUTCMonth() + 1).padStart(2, "0");
const eD = String(etDate.getUTCDate()).padStart(2, "0");
const eHh = String(etDate.getUTCHours()).padStart(2, "0");
const eMi = String(etDate.getUTCMinutes()).padStart(2, "0");

const FORMATS = [
  { label: "Z_utc",    value: `${y}-${mo}-${d}T${hh}:${mi}:00Z` },
  { label: "ET_off",   value: `${eY}-${eMo}-${eD}T${eHh}:${eMi}:00-04:00` },
];

console.log(`\n=== Creating 2 entries scheduled for ~2min from now (${new Date(inTwoMin).toISOString()} UTC) ===`);
const created = [];
for (const f of FORMATS) {
  const res = await api(token, "/lnk/add", "POST", {
    title: `TZ-V2-${f.label}-${Date.now()}`,
    link: "https://example.com/tz-probe-v2",
    group_id: GROUP_ID,
    schedule_from: f.value,
  });
  const id = res.body?.data?.id;
  created.push({ ...f, id });
  console.log(`[${f.label}] sent="${f.value}" → id=${id} status=${res.status}`);
}

// 4. Wait ~3 min and list.
console.log(`\nWaiting 180s for schedule_from windows to become active...`);
await new Promise((r) => setTimeout(r, 180_000));

const listAfter = await api(token, `/lnk/list?group_id=${GROUP_ID}`);
const entries = listAfter.body?.data || [];
console.log(`\n=== Entries after wait: ${entries.length} ===`);
for (const c of created) {
  const e = entries.find((x) => String(x.link_id) === String(c.id));
  if (!e) {
    console.log(`[${c.label}] id=${c.id} — still not in list (maybe list excludes scheduled)`);
    continue;
  }
  console.log(`[${c.label}] id=${c.id}`);
  console.log(`  sent:    ${c.value}`);
  console.log(`  echoed:  ${JSON.stringify({ schedule_from: e.schedule_from, schedule_to: e.schedule_to, created_at: e.created_at })}`);
}

// 5. Cleanup.
console.log(`\n=== Cleanup ===`);
for (const c of created) {
  const r = await api(token, "/lnk/delete", "POST", { link_id: c.id });
  console.log(`[${c.label}] delete id=${c.id} → status=${r.status}`);
}
