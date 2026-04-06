#!/usr/bin/env node
/**
 * Quick carousel preview screenshot with extra delay for image painting.
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3025';
const CAMPAIGN_ID = 'recNOknn765LjOlp3';
const DIR = '/tmp/carousel-preview-test';

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();

  // Sign in
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[name="email"], input[type="email"]', 'juergen@polymash.com');
  await page.type('input[name="password"], input[type="password"]', 'AAex123');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});

  // Go to campaign, open post
  await page.goto(`${BASE}/dashboard/campaigns/${CAMPAIGN_ID}`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Click Kenny's post
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if ((walker.currentNode.textContent || '').includes('Kenny Pieper')) {
        let el = walker.currentNode.parentElement;
        while (el) {
          if (el.classList.contains('cursor-pointer') || el.onclick) { el.click(); return; }
          el = el.parentElement;
        }
      }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Click Slides
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Slides');
    if (btn) btn.click();
  });

  // Wait longer for render + paint
  console.log('Waiting 8s for full render...');
  await new Promise(r => setTimeout(r, 8000));
  await page.screenshot({ path: `${DIR}/05-delayed-render.png` });
  console.log('Screenshot: 05-delayed-render.png');

  await browser.close();
}

main().catch(console.error);
