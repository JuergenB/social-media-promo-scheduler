#!/usr/bin/env node
/**
 * Puppeteer test: Carousel slide preview layout
 * Verifies tools aren't clipped and slides use available vertical space.
 *
 * Run: node scripts/test-carousel-preview.mjs
 */

import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3025';
const CAMPAIGN_ID = 'recNOknn765LjOlp3';
const SCREENSHOT_DIR = '/tmp/carousel-preview-test';
const EMAIL = 'juergen@polymash.com';
const PASSWORD = 'AAex123';

async function main() {
  const fs = await import('fs');
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1400, height: 900 },
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Manifest'))
      console.log('[BROWSER ERROR]', msg.text());
  });

  try {
    // Sign in
    console.log('Step 1: Signing in...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
    const emailInput = await page.$('input[name="email"], input[type="email"]');
    const passwordInput = await page.$('input[name="password"], input[type="password"]');
    if (emailInput && passwordInput) {
      await emailInput.type(EMAIL);
      await passwordInput.type(PASSWORD);
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
    }
    console.log('  Signed in, URL:', page.url());

    // Navigate to campaign
    console.log('Step 2: Opening campaign...');
    await page.goto(`${BASE}/dashboard/campaigns/${CAMPAIGN_ID}`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Find Kenny's post
    console.log('Step 3: Opening Kenny Pieper post...');
    const postClicked = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent || '';
        if (text.includes('Kenny Pieper') || text.includes('blown glass') || text.includes('blowing glass')) {
          let el = walker.currentNode.parentElement;
          while (el) {
            if (el.onclick || el.classList.contains('cursor-pointer') || el.style.cursor === 'pointer' || el.getAttribute('role') === 'button') {
              el.click();
              return true;
            }
            el = el.parentElement;
          }
        }
      }
      return false;
    });
    console.log('  Post found:', postClicked);
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-post-detail.png` });

    // First check if slides need to be reset (if they were previously applied)
    const hasResetBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => b.textContent?.includes('Reset Slides'));
    });

    if (hasResetBtn) {
      console.log('Step 3b: Resetting existing slides first...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent?.includes('Reset Slides'));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 4000));
      await page.screenshot({ path: `${SCREENSHOT_DIR}/02-after-reset.png` });
    }

    // Click "Slides" button to generate carousel preview
    console.log('Step 4: Clicking Slides button...');
    const slidesClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      // Find the Slides button (not Reset Slides, not Cover)
      const btn = buttons.find(b => {
        const text = b.textContent?.trim() || '';
        return text === 'Slides' || (text.includes('Slides') && !text.includes('Reset') && !text.includes('Apply'));
      });
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log('  Slides button clicked:', slidesClicked);

    if (!slidesClicked) {
      console.log('  ERROR: Could not find Slides button');
      // Check what buttons are available
      const buttons = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
      });
      console.log('  Available buttons:', buttons.filter(b => b && b.length < 30));
      await page.screenshot({ path: `${SCREENSHOT_DIR}/02-no-slides-btn.png` });
      await browser.close();
      return;
    }

    // Wait for carousel preview to render (server-side rendering takes a few seconds)
    console.log('Step 5: Waiting for carousel preview...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const state = await page.evaluate(() => {
        // Check for the carousel preview modal (z-60 overlay)
        const hasSlideModal = document.body.innerText.includes('Apply Slides');
        const slideImages = Array.from(document.querySelectorAll('img')).filter(img => img.src.startsWith('data:image'));
        return { hasSlideModal, slideCount: slideImages.length };
      });
      console.log(`  ${i + 1}s: modal=${state.hasSlideModal}, slides=${state.slideCount}`);

      if (state.slideCount > 0) {
        console.log('  Slides rendered!');
        break;
      }
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-carousel-preview.png` });

    // Measure layout quality
    const layoutMetrics = await page.evaluate(() => {
      // Find the carousel container
      const slideImages = Array.from(document.querySelectorAll('img')).filter(img => img.src.startsWith('data:image'));
      if (slideImages.length === 0) return { error: 'No slide images found' };

      const firstSlide = slideImages[0];
      const slideRect = firstSlide.getBoundingClientRect();

      // Check if eyedropper tools are visible (not clipped)
      const pipetteButtons = Array.from(document.querySelectorAll('button')).filter(
        b => b.textContent?.includes('Color') && b.closest('[class*="absolute"]')
      );

      const toolsVisible = pipetteButtons.map(btn => {
        const rect = btn.getBoundingClientRect();
        return {
          text: btn.textContent?.trim(),
          top: rect.top,
          bottom: rect.bottom,
          visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
          withinViewport: rect.top > 0,
        };
      });

      return {
        slideHeight: slideRect.height,
        slideWidth: slideRect.width,
        slideTop: slideRect.top,
        slideBottom: slideRect.bottom,
        viewportHeight: window.innerHeight,
        slideHeightPercent: Math.round((slideRect.height / window.innerHeight) * 100),
        toolsVisible,
      };
    });

    console.log('\nLayout metrics:', JSON.stringify(layoutMetrics, null, 2));

    // Take a close-up of just the first slide area
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-final.png`, fullPage: false });

    console.log('\nDone! Screenshots in:', SCREENSHOT_DIR);

  } catch (err) {
    console.error('Test failed:', err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/error.png` });
  } finally {
    await browser.close();
  }
}

main();
