#!/usr/bin/env node
/**
 * Puppeteer test: display each template preview on #808080 grey background
 * and take a screenshot for visual inspection.
 */
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const PREVIEW_DIR = path.join(__dirname, "..", "docs", "template-previews");
const OUTPUT_DIR = path.join(__dirname, "..", "docs", "template-previews", "puppeteer-tests");

const TEMPLATES = [
  "editorial-cover-light.jpg",
  "editorial-cover-dark.jpg",
  "quotable-card.jpg",
  "dark-quotable-card.jpg",
];

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 900 });

  for (const file of TEMPLATES) {
    const imgPath = path.join(PREVIEW_DIR, file);
    if (!fs.existsSync(imgPath)) {
      console.log(`SKIP: ${file} not found`);
      continue;
    }

    const imgBase64 = fs.readFileSync(imgPath).toString("base64");
    const imgSrc = `data:image/jpeg;base64,${imgBase64}`;

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: #808080;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 40px;
          }
          img {
            max-width: 540px;
            max-height: 675px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          }
          .label {
            position: fixed;
            top: 10px;
            left: 10px;
            color: white;
            font-family: monospace;
            font-size: 14px;
            background: rgba(0,0,0,0.5);
            padding: 4px 8px;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="label">${file}</div>
        <img src="${imgSrc}" />
      </body>
      </html>
    `);

    await page.waitForSelector("img");
    // Wait for image to load
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const img = document.querySelector("img");
        if (img.complete) return resolve();
        img.onload = resolve;
        img.onerror = resolve;
      });
    });

    const outName = `test-${file.replace(".jpg", ".png")}`;
    const outPath = path.join(OUTPUT_DIR, outName);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`OK: ${outName}`);
  }

  await browser.close();
  console.log(`\nScreenshots saved to: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
