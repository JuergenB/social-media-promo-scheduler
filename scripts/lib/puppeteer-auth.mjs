// Shared NextAuth credentials login for Puppeteer scripts.
// Avoids form submission entirely (which previously leaked the password into
// the dev server access log via a GET URL when Puppeteer's submit click was
// interpreted as form-method=GET). Uses the proper POST flow:
//   1. GET  /api/auth/csrf            → csrfToken + initial cookies
//   2. POST /api/auth/callback/credentials → 302 + session cookie
//   3. Inject cookies into Puppeteer page so subsequent navigation is authed.

import { readFileSync } from "node:fs";

function loadDotenv(path) {
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

export function loadCreds() {
  const env = loadDotenv(".env.local");
  const email = env.TEST_EMAIL;
  if (!email) throw new Error("TEST_EMAIL missing in .env.local");
  const userEntry = (env.AUTH_USERS ?? "")
    .split(",")
    .map((s) => s.split(":"))
    .find((parts) => parts[1] === email);
  if (!userEntry) throw new Error(`No AUTH_USERS entry for ${email}`);
  return { email, password: userEntry[2] };
}

function parseCookies(setCookies) {
  return setCookies.map((raw) => {
    const [nameValue, ...attrs] = raw.split(";").map((s) => s.trim());
    const eq = nameValue.indexOf("=");
    const name = nameValue.slice(0, eq);
    const value = nameValue.slice(eq + 1);
    const out = {
      name,
      value,
      domain: "localhost",
      path: "/",
    };
    for (const attr of attrs) {
      const ai = attr.indexOf("=");
      const k = (ai < 0 ? attr : attr.slice(0, ai)).toLowerCase();
      const v = ai < 0 ? "" : attr.slice(ai + 1);
      if (k === "httponly") out.httpOnly = true;
      else if (k === "secure") out.secure = true;
      else if (k === "samesite")
        out.sameSite = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
      else if (k === "path") out.path = v;
    }
    return out;
  });
}

/**
 * Login via NextAuth credentials POST flow and return the cookies as
 * Puppeteer cookie objects. Pass them to `page.setCookie(...cookies)`.
 *
 * @param {string} base e.g. "http://localhost:3025"
 * @param {{email: string, password: string}} creds
 */
export async function loginPuppeteerCookies(base, creds) {
  // 1. CSRF
  const csrfResp = await fetch(`${base}/api/auth/csrf`);
  if (!csrfResp.ok) {
    throw new Error(`CSRF fetch failed: ${csrfResp.status}`);
  }
  const csrfCookies = csrfResp.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await csrfResp.json();

  // 2. Auth POST (form-encoded body, NOT URL params)
  const body = new URLSearchParams();
  body.set("csrfToken", csrfToken);
  body.set("email", creds.email);
  body.set("password", creds.password);
  body.set("callbackUrl", `${base}/dashboard`);
  body.set("json", "true");

  const cookieHeader = csrfCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  const authResp = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    },
    body,
    redirect: "manual",
  });

  // NextAuth typically returns 302 on success
  if (authResp.status !== 302 && !authResp.ok) {
    throw new Error(`Auth POST failed: ${authResp.status}`);
  }

  const authCookies = authResp.headers.getSetCookie?.() ?? [];
  const allCookies = [...csrfCookies, ...authCookies];
  const parsed = parseCookies(allCookies);

  // Sanity check: must have a session cookie
  const hasSession = parsed.some((c) =>
    /session-token|authjs\.session/i.test(c.name),
  );
  if (!hasSession) {
    throw new Error(
      "Auth completed without session cookie (check creds / NextAuth version)",
    );
  }
  return parsed;
}
