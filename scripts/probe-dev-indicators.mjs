import { loadCreds, loginPuppeteerCookies } from "./lib/puppeteer-auth.mjs";
import puppeteer from "puppeteer";

const BASE = "http://localhost:3025";
const creds = loadCreds();
const cookies = await loginPuppeteerCookies(BASE, creds);
const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
await page.setCookie(...cookies);
await page.goto(
  `${BASE}/dashboard/tools/cover-generator?render=A&n=76&dt=MAY%205,%202026&br=THE%20INTERSECT&bln=The%20Intersect&tg=Test&hero=https://placehold.co/1080x720/black/white.png`,
  { waitUntil: "networkidle2" },
);
await new Promise((r) => setTimeout(r, 1500));

// Identify every fixed/absolute-positioned element OUTSIDE #render-root that
// could appear in the screenshot.
const out = await page.evaluate(() => {
  const renderRoot = document.getElementById("render-root");
  const all = document.querySelectorAll("*");
  const floating = [];
  for (const el of all) {
    if (renderRoot && (el === renderRoot || renderRoot.contains(el))) continue;
    const cs = window.getComputedStyle(el);
    if ((cs.position === "fixed" || cs.position === "absolute") && cs.display !== "none") {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        floating.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || "",
          cls: el.className?.toString?.()?.slice(0, 80) ?? "",
          pos: cs.position,
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          z: cs.zIndex,
        });
      }
    }
  }
  return floating.slice(0, 30);
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
