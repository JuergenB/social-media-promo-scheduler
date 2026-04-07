#!/usr/bin/env node
/**
 * Capture template preview images from the running app using Puppeteer.
 * Uses the actual production renderer by navigating to a post's card designer.
 *
 * Prerequisites:
 * - Dev server running on port 3025
 * - At least one campaign with posts that have images
 *
 * Run: node scripts/capture-template-previews.js
 */

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Not Real Art - Carmen Zella campaign (has multiple images)
const CAMPAIGN_ID = "rec1hEcznObrGPXUZ";
const BASE_URL = "http://localhost:3025";
const OUT_DIR = path.join(process.cwd(), "docs", "template-previews");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 });

  // Login first
  console.log("Logging in...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2", timeout: 15000 });
  await page.type('input[name="email"]', "kbviking@gmail.com");
  await page.type('input[name="password"]', "AAex123");
  await page.click('button[type="submit"]');
  await sleep(3000);
  console.log("Logged in");

  // Navigate to campaign
  console.log("Loading campaign page...");
  await page.goto(`${BASE_URL}/dashboard/campaigns/${CAMPAIGN_ID}`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  // Wait for campaign data to fully load
  await sleep(5000);
  await page.screenshot({ path: path.join(OUT_DIR, "debug-after-nav.png") });
  console.log("Debug screenshot saved");

  // Wait for post rows to appear
  try {
    await page.waitForSelector('[role="button"]', { timeout: 20000 });
  } catch {
    console.log("No post rows found after 20s - page may need brand switch");
    await page.screenshot({ path: path.join(OUT_DIR, "debug-no-posts.png") });
    await browser.close();
    return;
  }
  console.log("Campaign loaded");

  // Click first post row to open detail dialog
  const postRows = await page.$$('[role="button"]');
  if (postRows.length === 0) {
    console.error("No post rows found");
    await browser.close();
    return;
  }

  await postRows[0].click();
  console.log("Opened post detail");
  await sleep(2000);

  // Find and click the "Cards" button
  const cardsBtn = await findButtonByText(page, "Cards");
  if (!cardsBtn) {
    console.error("Cards button not found");
    await page.screenshot({ path: path.join(OUT_DIR, "debug-no-cards.png") });
    await browser.close();
    return;
  }

  await cardsBtn.click();
  console.log("Opened card template gallery");
  await sleep(2000);

  // Screenshot the gallery
  await page.screenshot({ path: path.join(OUT_DIR, "gallery.png") });
  console.log("Gallery screenshot saved");

  // Find all template card buttons in the gallery grid
  // They're inside a grid with class grid-cols-2 or grid-cols-3
  const templateCards = await page.$$("button.group");
  console.log(`Found ${templateCards.length} template cards`);

  for (let i = 0; i < templateCards.length; i++) {
    // Re-query because DOM may have changed after navigation
    const cards = await page.$$("button.group");
    if (i >= cards.length) break;

    const card = cards[i];
    const name = await page.evaluate((el) => {
      const p = el.querySelector("p");
      return p ? p.textContent.trim() : "unknown";
    }, card);

    console.log(`\nTemplate ${i + 1}: ${name}`);
    await card.click();

    // Wait for AI content generation + preview render
    console.log("  Waiting for generation...");
    await sleep(12000); // 12 seconds for AI + render

    // Check if preview image appeared
    const previewImg = await page.$('img[alt="Cover slide preview"]');
    if (previewImg) {
      // Get the preview image's bounding box and screenshot just that area
      const box = await previewImg.boundingBox();
      if (box) {
        const slug = name.toLowerCase().replace(/[·\s]+/g, "-").replace(/--+/g, "-").replace(/^-|-$/g, "");
        const outPath = path.join(OUT_DIR, `${slug}.png`);

        await page.screenshot({
          path: outPath,
          clip: {
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
          },
        });
        console.log(`  Saved: ${slug}.png (${Math.round(box.width)}x${Math.round(box.height)})`);
      } else {
        console.log("  Preview image has no bounding box");
        await page.screenshot({ path: path.join(OUT_DIR, `debug-${i}.png`) });
      }
    } else {
      console.log("  No preview image found - saving full screenshot");
      await page.screenshot({ path: path.join(OUT_DIR, `debug-${i}.png`) });
    }

    // Go back to gallery
    const backBtn = await page.$('button[title="Back to templates"]');
    if (backBtn) {
      await backBtn.click();
      await sleep(1500);
    } else {
      console.log("  Back button not found");
    }
  }

  await browser.close();
  console.log("\nDone! Previews saved to:", OUT_DIR);
}

async function findButtonByText(page, text) {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const btnText = await page.evaluate((el) => el.textContent, btn);
    if (btnText && btnText.includes(text)) return btn;
  }
  return null;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
