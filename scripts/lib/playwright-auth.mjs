// Playwright auth helper — saves a logged-in browser session to .auth/state.json
// so subsequent scripts skip the login round-trip entirely.
//
// First run: invoke `loginAndSaveState(base)` interactively. It opens a real
// browser, posts credentials via the NextAuth POST flow, persists cookies.
//
// Every run after: scripts call `withAuthedContext(callback)` which loads
// the saved state and reuses it. No credentials touch the script code.
//
// .auth/state.json is gitignored. If it expires (NextAuth session JWT lifetime),
// rerun loginAndSaveState. The error message will be "no session" or 302 to
// /login on the first navigation.

import { chromium } from "playwright";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR = ".auth";
const STATE_FILE = join(STATE_DIR, "state.json");

function loadDotenv(path = ".env.local") {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

function loadCreds() {
  const env = loadDotenv();
  const email = env.TEST_EMAIL;
  if (!email) throw new Error("TEST_EMAIL missing in .env.local");
  const userEntry = (env.AUTH_USERS ?? "")
    .split(",")
    .map((s) => s.split(":"))
    .find((parts) => parts[1] === email);
  if (!userEntry) throw new Error(`No AUTH_USERS entry for ${email}`);
  return { email, password: userEntry[2] };
}

/**
 * One-time login. Run this manually (once per session lifetime) to refresh
 * the saved auth state. Subsequent script runs reuse it.
 *
 *   node -e "import('./scripts/lib/playwright-auth.mjs').then(m => m.loginAndSaveState('http://localhost:3025'))"
 */
export async function loginAndSaveState(base = "http://localhost:3025") {
  const { email, password } = loadCreds();
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // POST to NextAuth's credentials callback (avoids form-method=GET URL leak).
  const csrfResp = await page.request.get(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();

  const authResp = await page.request.post(`${base}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email,
      password,
      callbackUrl: `${base}/dashboard`,
      json: "true",
    },
    maxRedirects: 0,
    failOnStatusCode: false,
  });

  if (authResp.status() !== 302 && !authResp.ok()) {
    throw new Error(`Auth POST failed: ${authResp.status()}`);
  }

  // Confirm the session cookie landed.
  const cookies = await context.cookies();
  const hasSession = cookies.some((c) => /session-token|authjs\.session/i.test(c.name));
  if (!hasSession) throw new Error("Auth completed but no session cookie was set");

  await context.storageState({ path: STATE_FILE });
  await browser.close();
  console.log(`[playwright-auth] Session saved to ${STATE_FILE}`);
}

/**
 * Run a script body with an authed Playwright context. Loads the saved state
 * if present; throws if it isn't (caller should run loginAndSaveState first).
 *
 *   await withAuthedContext(async (page) => {
 *     await page.goto("http://localhost:3025/dashboard/campaigns/...");
 *     await page.screenshot({ path: "/tmp/foo.png" });
 *   });
 */
export async function withAuthedContext(callback, { viewport, ...contextOptions } = {}) {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      `${STATE_FILE} not found. Run loginAndSaveState() once first.`,
    );
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: STATE_FILE,
    viewport: viewport ?? { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    ...contextOptions,
  });
  const page = await context.newPage();

  try {
    await callback(page, context);
  } finally {
    await browser.close();
  }
}
