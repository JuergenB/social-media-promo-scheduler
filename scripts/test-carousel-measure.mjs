#!/usr/bin/env node
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3025';
const CAMPAIGN_ID = 'recNOknn765LjOlp3';
const DIR = '/tmp/carousel-preview-test';

async function main() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();

  // Sign in
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'juergen@polymash.com');
  await page.type('input[type="password"]', 'AAex123');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});

  await page.goto(`${BASE}/dashboard/campaigns/${CAMPAIGN_ID}`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Open Kenny's post
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

  await new Promise(r => setTimeout(r, 8000));

  // Measure everything
  const metrics = await page.evaluate(() => {
    const modal = document.querySelector('[class*="bg-zinc-900"]');
    const modalRect = modal?.getBoundingClientRect();

    const slideImgs = Array.from(document.querySelectorAll('img')).filter(i => i.src.startsWith('data:image'));
    const firstSlide = slideImgs[0];
    const slideRect = firstSlide?.getBoundingClientRect();
    const slideParent = firstSlide?.parentElement?.getBoundingClientRect();

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      modal: modalRect ? { top: modalRect.top, bottom: modalRect.bottom, height: modalRect.height } : null,
      slideImg: slideRect ? { top: slideRect.top, bottom: slideRect.bottom, height: slideRect.height, width: slideRect.width } : null,
      slideContainer: slideParent ? { top: slideParent.top, bottom: slideParent.bottom, height: slideParent.height } : null,
      clippedAtBottom: slideRect ? slideRect.bottom > (modalRect?.bottom || window.innerHeight) : null,
    };
  });

  console.log('Layout measurements:', JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: `${DIR}/06-measure.png` });

  await browser.close();
}

main().catch(console.error);
