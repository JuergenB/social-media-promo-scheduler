import { loadCreds, loginPuppeteerCookies } from "./lib/puppeteer-auth.mjs";

// Print the leadImageUrl for an issue. Used as scratch input for verifying
// the upscale-source endpoint with a real Curator URL.
//   node scripts/get-issue-hero.mjs 76

const issueNum = process.argv[2];
if (!issueNum) {
  console.error("usage: node scripts/get-issue-hero.mjs <issueNumber>");
  process.exit(1);
}

const BASE = "http://localhost:3025";
const creds = loadCreds();
const cookies = await loginPuppeteerCookies(BASE, creds);
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const resp = await fetch(`${BASE}/api/tools/curator-issue/${issueNum}`, {
  headers: { Cookie: cookieHeader },
});
const data = await resp.json();
console.log(data.issue?.leadImageUrl ?? "no leadImageUrl");
