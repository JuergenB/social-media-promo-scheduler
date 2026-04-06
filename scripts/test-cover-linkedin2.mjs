#!/usr/bin/env node
import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3025';
const CAMPAIGN_ID = 'recQGqt86UoWZDORi'; // Campaign with LinkedIn posts
const DIR = '/tmp/cover-slide-test';

async function main() {
  const fs = await import('fs');
  fs.mkdirSync(DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: false, defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('input[type="email"]', 'juergen@polymash.com');
  await page.type('input[type="password"]', 'AAex123');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});

  await page.goto(`${BASE}/dashboard/campaigns/${CAMPAIGN_ID}`, { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));

  // Find a LinkedIn post
  console.log('Looking for LinkedIn post...');
  const found = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[class*="cursor-pointer"]'));
    for (const card of cards) {
      const text = card.textContent || '';
      if (text.includes('LinkedIn')) {
        card.click();
        return text.slice(0, 60);
      }
    }
    return null;
  });
  console.log('Found:', found);

  if (!found) {
    console.log('No LinkedIn post found');
    await page.screenshot({ path: `${DIR}/12-no-linkedin.png` });
    await browser.close();
    return;
  }

  await new Promise(r => setTimeout(r, 2000));

  // Click Cover
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim().includes('Cover'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Select template
  const hasGallery = await page.evaluate(() => document.body.innerText.includes('Choose a cover slide template'));
  if (hasGallery) {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Editorial Cover'));
      if (btn) btn.click();
    });

    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const state = await page.evaluate(() => ({
        hasPreview: Array.from(document.querySelectorAll('img')).some(i => i.src.startsWith('data:image')),
      }));
      console.log(`  ${i+1}s: preview=${state.hasPreview}`);
      if (state.hasPreview) break;
    }
  }

  await page.screenshot({ path: `${DIR}/12-linkedin-cover.png` });

  // Check dimensions
  const metrics = await page.evaluate(() => {
    const img = Array.from(document.querySelectorAll('img')).find(i => i.src.startsWith('data:image'));
    if (!img) return null;
    return { naturalW: img.naturalWidth, naturalH: img.naturalHeight, ratio: (img.naturalWidth / img.naturalHeight).toFixed(2) };
  });
  console.log('Preview:', metrics);

  // Check handle/website label
  const label = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'));
    const handleLabel = spans.find(s => s.textContent === 'Handle' || s.textContent === 'Website');
    return handleLabel?.textContent || 'not found';
  });
  console.log('Label:', label);

  await browser.close();
}

main().catch(console.error);
