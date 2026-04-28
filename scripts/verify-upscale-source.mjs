import { loadCreds, loginPuppeteerCookies } from "./lib/puppeteer-auth.mjs";

// Verify the upscale-hero endpoint accepts sourceUrl in the body and operates
// on whatever URL is passed (not a hardcoded asset). Bug fix verification for
// JuergenB/polywiz-app#193.
//
// Usage:
//   node scripts/verify-upscale-source.mjs
//   node scripts/verify-upscale-source.mjs <imageUrl>   # to actually upscale
//
// Without an image URL, runs validation-only checks (missing/bad sourceUrl).
// With one, runs the full Replicate flow (~15-30s) and prints the response so
// we can confirm the upscaled image was sourced from THAT URL.

const BASE = "http://localhost:3025";

const creds = loadCreds();
const cookies = await loginPuppeteerCookies(BASE, creds);
const cookieHeader = cookies
  .map((c) => `${c.name}=${c.value}`)
  .join("; ");

async function call(body) {
  const resp = await fetch(`${BASE}/api/tools/upscale-hero`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}

console.log("\n=== Validation: empty body ===");
console.log(await call({}));

console.log("\n=== Validation: unsupported scheme ===");
console.log(await call({ sourceUrl: "file:///etc/passwd" }));

const realUrl = process.argv[2];
if (realUrl) {
  console.log(`\n=== Real upscale: ${realUrl} (~15-30s) ===`);
  const result = await call({ sourceUrl: realUrl });
  console.log("status:", result.status);
  console.log("response:", JSON.stringify(result.data, null, 2));
  if (result.data?.sourceUrl === realUrl) {
    console.log("\nPASS: response.sourceUrl matches input — endpoint honored the request");
  } else if (
    result.data?.sourceUrl &&
    realUrl.startsWith("/") &&
    result.data.sourceUrl.startsWith("https://")
  ) {
    console.log(
      "\nPASS: relative input was uploaded to Blob; endpoint passed the Blob URL to Replicate",
    );
  } else if (result.data?.sourceUrl) {
    console.log(
      `\nFAIL: response.sourceUrl (${result.data.sourceUrl}) does not match input (${realUrl})`,
    );
  } else {
    console.log("\nFAIL: no sourceUrl in response — see error above");
  }
} else {
  console.log("\n(skip real upscale — pass an image URL as argv[2] to run it)");
}
