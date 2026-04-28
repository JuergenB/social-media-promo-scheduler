import puppeteer from "puppeteer";
import { loadCreds, loginPuppeteerCookies } from "./lib/puppeteer-auth.mjs";

// Verify the cover-generator's issue-data-driven rewrite by:
//   1. Loading the page in a fresh browser (empty localStorage → DEFAULT_ISSUE).
//   2. Optionally typing an issue number into the input + clicking "Fetch issue
//      + stories" to drive the page state to that issue.
//   3. Capturing the toolbar + Slide 1 + Slide 2a regions and dumping the
//      visible text of each slide so we can check (without a human in the loop)
//      that Slide 1's masthead, numeral, tagline, date, and Slide 2a's data
//      reflect the requested issue.
//
// Usage:
//   node scripts/verify-cover-issue.mjs            # default state (Issue 75)
//   node scripts/verify-cover-issue.mjs 76         # fetch Issue 76 and verify
//
// Outputs: /tmp/verify-cover-issue-<n>-overview.png and per-slide PNGs.

const BASE = "http://localhost:3025";
const PATH = "/dashboard/tools/cover-generator";

const targetIssue = process.argv[2] ? Number(process.argv[2]) : null;
const tag = targetIssue ?? "default";

const creds = loadCreds();
const cookies = await loginPuppeteerCookies(BASE, creds);

const browser = await puppeteer.launch({ headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 1 });
  await page.setCookie(...cookies);

  // Fresh-tab semantics: blow away any persisted issueData / heroSrc /
  // storyPicks so each verification run starts from DEFAULT_ISSUE.
  await page.goto(`${BASE}/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  });
  await page.evaluate(() => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("overview-cover-"))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {}
  });

  await page.goto(`${BASE}${PATH}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 1500));

  if (targetIssue !== null) {
    // Type the issue number, click Fetch, wait for the entries grid to render.
    const input = await page.$('input[type="number"]');
    if (!input) throw new Error("issue input not found");
    await input.click({ clickCount: 3 });
    await input.type(String(targetIssue));
    const buttons = await page.$$("button");
    let fetchBtn = null;
    for (const b of buttons) {
      const txt = (await page.evaluate((el) => el.textContent, b)) ?? "";
      if (txt.includes("Fetch issue")) {
        fetchBtn = b;
        break;
      }
    }
    if (!fetchBtn) throw new Error("Fetch button not found");
    await fetchBtn.click();

    // Wait for fetch to complete: the loaded badge appears as
    // "· <issue name> · <n> entries"
    await page.waitForFunction(
      () => document.body.innerText.includes("entries"),
      { timeout: 30000 },
    );
    // Give state propagation + image decode a beat to settle
    await new Promise((r) => setTimeout(r, 2500));
  }

  // Dump what each slide actually shows
  const slideTexts = await page.evaluate(() => {
    const frames = Array.from(
      document.querySelectorAll(".relative.overflow-hidden.border"),
    );
    return frames.map((f) => (f.textContent ?? "").replace(/\s+/g, " ").trim());
  });
  console.log(`\n=== Slide text for issue=${tag} ===`);
  slideTexts.forEach((t, i) => {
    const label = ["Slide 1 (A)", "Slide 2a", "Slide 2b", "Slide 3 (C)"][i] ?? `Slide ${i}`;
    console.log(`${label}: ${t.slice(0, 250)}${t.length > 250 ? "…" : ""}`);
  });

  // Overview screenshot (toolbar + first row)
  const fullHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  const overviewClip = Math.min(fullHeight, 1500);
  const overviewPath = `/tmp/verify-cover-issue-${tag}-overview.png`;
  await page.screenshot({
    path: overviewPath,
    clip: { x: 0, y: 0, width: 1600, height: overviewClip },
  });
  console.log(`\noverview: ${overviewPath} 1600x${overviewClip}`);

  // Per-slide screenshots, scrolled into view
  const frames = await page.$$(".relative.overflow-hidden.border");
  for (let i = 0; i < frames.length; i++) {
    await page.evaluate((idx) => {
      document
        .querySelectorAll(".relative.overflow-hidden.border")[idx]
        ?.scrollIntoView({ block: "center" });
    }, i);
    await new Promise((r) => setTimeout(r, 350));
    const rect = await page.$$eval(
      ".relative.overflow-hidden.border",
      (els, idx) => {
        const r = els[idx].getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      },
      i,
    );
    const out = `/tmp/verify-cover-issue-${tag}-slide-${String.fromCharCode(65 + i)}.png`;
    await page.screenshot({
      path: out,
      clip: {
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        width: Math.min(1600, Math.floor(rect.w)),
        height: Math.min(1600, Math.floor(rect.h)),
      },
    });
    console.log(`slide ${i}: ${out} ${Math.floor(rect.w)}x${Math.floor(rect.h)}`);
  }

  const broken = await page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.src),
  );
  console.log(broken.length ? `BROKEN: ${broken.join(", ")}` : "no broken images");
} finally {
  await browser.close();
}
