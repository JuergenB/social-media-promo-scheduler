#!/usr/bin/env node
/**
 * Test carousel preview specifically on a Threads post (short dialog).
 */
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3025';
const CAMPAIGN_ID = 'recNOknn765LjOlp3';
const DIR = '/tmp/carousel-preview-test';

async function main() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'juergen@polymash.com');
  await page.type('input[type="password"]', 'REDACTED_PASSWORD');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});

  await page.goto(`${BASE}/dashboard/campaigns/${CAMPAIGN_ID}`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));

  // Find a Threads post (Kenny's Threads post)
  console.log('Looking for a Threads post...');
  const found = await page.evaluate(() => {
    // Look for elements that contain "Threads" platform indicator near Kenny
    const allText = document.body.innerText;
    const cards = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const card of cards) {
      const text = card.textContent || '';
      if (text.includes('Kenny') && text.includes('Threads')) {
        card.click();
        return 'Kenny Threads post';
      }
    }
    // Fall back: just find any Threads post
    for (const card of cards) {
      const text = card.textContent || '';
      if (text.includes('Threads')) {
        card.click();
        return 'Some Threads post: ' + text.slice(0, 40);
      }
    }
    return null;
  });
  console.log('Found:', found);

  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: `${DIR}/07-threads-post.png` });

  // Measure the dialog height
  const dialogH = await page.evaluate(() => {
    const el = document.querySelector('[class*="max-h-"][class*="relative"]');
    return el?.getBoundingClientRect().height;
  });
  console.log('Dialog height:', dialogH);

  // Click Slides
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Slides');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log('Slides clicked:', clicked);

  // Wait for render
  await new Promise(r => setTimeout(r, 8000));
  await page.screenshot({ path: `${DIR}/08-threads-carousel.png` });

  // Measure
  const metrics = await page.evaluate(() => {
    const modal = document.querySelector('[class*="z-\\[60\\]"]') ||
                  Array.from(document.querySelectorAll('div')).find(d => d.className.includes('bg-zinc-900'));
    const modalRect = modal?.getBoundingClientRect();
    const imgs = Array.from(document.querySelectorAll('img')).filter(i => i.src.startsWith('data:image'));
    const imgRect = imgs[0]?.getBoundingClientRect();

    return {
      viewport: window.innerHeight,
      modal: modalRect ? { top: Math.round(modalRect.top), bottom: Math.round(modalRect.bottom), height: Math.round(modalRect.height) } : null,
      slide: imgRect ? { top: Math.round(imgRect.top), bottom: Math.round(imgRect.bottom), height: Math.round(imgRect.height), width: Math.round(imgRect.width) } : null,
      slideBottomClipped: imgRect && modalRect ? imgRect.bottom > modalRect.bottom : null,
    };
  });
  console.log('Metrics:', JSON.stringify(metrics, null, 2));

  await browser.close();
}

main().catch(console.error);
