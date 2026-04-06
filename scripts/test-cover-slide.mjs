#!/usr/bin/env node
/**
 * Puppeteer test: Cover Slide Designer flow
 * Run: node scripts/test-cover-slide.mjs
 */

import puppeteer from 'puppeteer';

const BASE = 'http://localhost:3025';
const CAMPAIGN_ID = 'recNOknn765LjOlp3';
const SCREENSHOT_DIR = '/tmp/cover-slide-test';
const EMAIL = 'juergen@polymash.com';
const PASSWORD = 'REDACTED_PASSWORD';

async function main() {
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
  page.on('response', res => {
    if (res.url().includes('cover-slide') && res.status() !== 200)
      console.log('[API ERROR]', res.status(), res.url());
  });

  try {
    // Step 1: Sign in via credentials
    console.log('Step 1: Signing in...');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });

    // Try to find and fill the login form
    const emailInput = await page.$('input[name="email"], input[type="email"]');
    const passwordInput = await page.$('input[name="password"], input[type="password"]');

    if (emailInput && passwordInput) {
      await emailInput.type(EMAIL);
      await passwordInput.type(PASSWORD);
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }).catch(() => {});
      console.log('  Signed in, current URL:', page.url());
    } else {
      console.log('  Login form not found, trying direct CSRF approach...');
      // Try NextAuth credentials sign-in via POST
      await page.evaluate(async (email, password) => {
        const csrfRes = await fetch('/api/auth/csrf');
        const { csrfToken } = await csrfRes.json();
        await fetch('/api/auth/callback/credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `csrfToken=${csrfToken}&email=${email}&password=${password}`,
          redirect: 'follow',
        });
      }, EMAIL, PASSWORD);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-after-login.png` });

    // Step 2: Navigate to campaign
    console.log('Step 2: Navigating to campaign...');
    await page.goto(`${BASE}/dashboard/campaigns/${CAMPAIGN_ID}`, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-campaign-page.png` });
    console.log('  Current URL:', page.url());

    // Check if we're still on login
    if (page.url().includes('login')) {
      console.log('  ERROR: Still on login page. Auth failed.');
      await browser.close();
      return;
    }

    // Step 3: Wait for posts to load, find Kenny's post
    console.log('Step 3: Finding Kenny Pieper post...');
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-posts-loaded.png` });

    // Look for any clickable post text mentioning "Kenny" or "glass"
    const postClicked = await page.evaluate(() => {
      // Find all text elements and click the one with Kenny
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent || '';
        if (text.includes('Kenny') || text.includes('glass')) {
          // Find the closest clickable parent
          let el = walker.currentNode.parentElement;
          while (el) {
            if (el.onclick || el.getAttribute('role') === 'button' || el.tagName === 'BUTTON' ||
                el.classList.contains('cursor-pointer') || el.style.cursor === 'pointer') {
              el.click();
              return { found: true, text: text.slice(0, 50) };
            }
            el = el.parentElement;
          }
        }
      }
      return { found: false };
    });
    console.log('  Post click result:', postClicked);

    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-post-detail.png` });

    // Step 4: Click Cover button
    console.log('Step 4: Clicking Cover button...');
    const coverClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const coverBtn = buttons.find(b => b.textContent?.trim().includes('Cover'));
      if (coverBtn) {
        coverBtn.click();
        return true;
      }
      return false;
    });
    console.log('  Cover button clicked:', coverClicked);

    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-after-cover-click.png` });

    // Check what we see
    const pageState = await page.evaluate(() => {
      const hasGallery = document.body.innerText.includes('Choose a cover slide template');
      const hasEditor = document.body.innerText.includes('Editorial Cover');
      const hasPreview = Array.from(document.querySelectorAll('img')).some(i => i.src.startsWith('data:image'));
      return { hasGallery, hasEditor, hasPreview };
    });
    console.log('  Page state:', pageState);

    // Step 5: If gallery is showing, select a template
    if (pageState.hasGallery) {
      console.log('Step 5: Selecting Editorial Cover — Light...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const tmplBtn = buttons.find(b => b.textContent?.includes('Editorial Cover'));
        if (tmplBtn) tmplBtn.click();
      });

      // Wait for AI generation + preview
      console.log('  Waiting for AI content generation...');
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const state = await page.evaluate(() => {
          const hasPreview = Array.from(document.querySelectorAll('img')).some(i => i.src.startsWith('data:image'));
          const headlineField = document.querySelector('textarea');
          const headlineValue = headlineField?.value || '';
          return { hasPreview, headlineValue: headlineValue.slice(0, 50) };
        });
        console.log(`  ${i + 1}s: preview=${state.hasPreview}, headline="${state.headlineValue}"`);

        if (state.hasPreview) {
          console.log('  Preview rendered!');
          break;
        }
      }

      await page.screenshot({ path: `${SCREENSHOT_DIR}/06-template-selected.png` });
    } else if (pageState.hasEditor) {
      console.log('  PROBLEM: Jumped straight to editor (skipped gallery)');
      await page.screenshot({ path: `${SCREENSHOT_DIR}/06-skipped-gallery.png` });
    }

    // Final screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-final.png` });
    console.log('\nDone! Screenshots in:', SCREENSHOT_DIR);

  } catch (err) {
    console.error('Test failed:', err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/error.png` });
  } finally {
    await browser.close();
  }
}

main();
