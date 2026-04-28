import { loadCreds, loginPuppeteerCookies } from "./lib/puppeteer-auth.mjs";
import { writeFile } from "node:fs/promises";

// End-to-end download verifier. Hits /api/tools/download-slide directly with
// query params that mirror what the cover-generator page would send for a
// given issue's hero on a permanent Blob URL. Saves the PNG so we can
// eyeball the rendered slide.
//
//   node scripts/verify-cover-download.mjs <issueNumber> <heroBlobUrl> <date> <tagline>
//
// All four args required so the script stays parameterized — no hardcoded
// per-issue values.

const [issueNum, heroUrl, date, tagline] = process.argv.slice(2);
if (!issueNum || !heroUrl || !date || !tagline) {
  console.error(
    'usage: node scripts/verify-cover-download.mjs <num> <heroUrl> "<DATE>" "<tagline>"',
  );
  process.exit(1);
}

const BASE = "http://localhost:3025";
const creds = loadCreds();
const cookies = await loginPuppeteerCookies(BASE, creds);
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

const sp = new URLSearchParams();
sp.set("slide", "A");
sp.set("fmt", "ig");
sp.set("n", issueNum);
sp.set("dt", date);
sp.set("br", "THE INTERSECT");
sp.set("bln", "The Intersect");
sp.set("tg", tagline);
sp.set("hero", heroUrl);
sp.set("ax", "50");
sp.set("ay", "50");
sp.set("az", "1");
sp.set("bl", "0");
sp.set("bb", "0");

const url = `${BASE}/api/tools/download-slide?${sp.toString()}`;
console.log(`download endpoint: ${url}`);
console.log("rendering (~10-15s)…");

const resp = await fetch(url, { headers: { Cookie: cookieHeader } });
console.log(`status: ${resp.status}`);
if (!resp.ok) {
  const txt = await resp.text();
  console.log(`error body: ${txt.slice(0, 500)}`);
  process.exit(1);
}
const buf = Buffer.from(await resp.arrayBuffer());
const out = `/tmp/verify-cover-download-${issueNum}-slide-A.png`;
await writeFile(out, buf);
console.log(`saved: ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
