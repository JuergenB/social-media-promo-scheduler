import { loadCreds, loginPuppeteerCookies } from "./lib/puppeteer-auth.mjs";

// Find any non-Published LinkedIn post + its campaign id so the screenshot
// helper has something to target. Prints "<campaignId> <postId>" or exits 1.

const BASE = "http://localhost:3025";
const creds = loadCreds();
const cookies = await loginPuppeteerCookies(BASE, creds);
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

const resp = await fetch(`${BASE}/api/campaigns?status=all`, {
  headers: { Cookie: cookieHeader },
});
const { campaigns } = await resp.json();
for (const c of campaigns ?? []) {
  const r = await fetch(`${BASE}/api/campaigns/${c.id}`, {
    headers: { Cookie: cookieHeader },
  });
  const { posts } = await r.json();
  const li = (posts ?? []).find(
    (p) => p.platform === "LinkedIn" && p.status !== "Published",
  );
  if (li) {
    console.log(`${c.id} ${li.id}`);
    process.exit(0);
  }
}
console.error("No non-Published LinkedIn post found");
process.exit(1);
