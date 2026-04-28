import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

// Dev-only: render a single Overview-cover slide at native 1080×1350 via
// Puppeteer and return it as a PNG attachment so the user can drag it into
// the regular post composer manually. No persistence — the PNG is streamed.

export const maxDuration = 60;

const PORT = 3025;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slide = url.searchParams.get("slide") ?? "A";
  if (!["A", "2a", "2b", "C"].includes(slide)) {
    return NextResponse.json({ error: "Invalid slide" }, { status: 400 });
  }

  // Auth: read TEST_EMAIL + matching password from AUTH_USERS in env
  const email = process.env.TEST_EMAIL;
  const usersStr = process.env.AUTH_USERS || "";
  const userEntry = usersStr
    .split(",")
    .map((s) => s.split(":"))
    .find((parts) => parts[1] === email);
  if (!email || !userEntry) {
    return NextResponse.json(
      { error: "TEST_EMAIL / AUTH_USERS not configured" },
      { status: 500 },
    );
  }
  const password = userEntry[2];

  // Forward all other query params (state) to the render URL.
  // Page reads `render=X`, so map slide → render and drop the slide param.
  const renderParams = new URLSearchParams(url.searchParams);
  renderParams.delete("slide");
  renderParams.set("render", slide);
  const renderUrl = `http://localhost:${PORT}/dashboard/tools/cover-generator?${renderParams.toString()}`;
  const fmt = url.searchParams.get("fmt") === "li" ? "li" : "ig";
  const W = 1080;
  const H = fmt === "li" ? 1080 : 1350;

  const browser = await puppeteer.launch({ headless: "new" as never });
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: W,
      height: H,
      deviceScaleFactor: 1,
    });

    // Login
    await page.goto(`http://localhost:${PORT}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForSelector('input[type="email"], input[name="email"]', {
      timeout: 10000,
    });
    await page.type('input[type="email"], input[name="email"]', email);
    await page.type(
      'input[type="password"], input[name="password"]',
      password,
    );
    await Promise.all([
      page
        .waitForNavigation({
          waitUntil: "domcontentloaded",
          timeout: 20000,
        })
        .catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    // Navigate to render mode
    await page.goto(renderUrl, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    await page.waitForSelector("#render-root", { timeout: 10000 });
    // Give font loading + image decode + bottom-band sampling a beat to settle
    await new Promise((r) => setTimeout(r, 1500));

    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: W, height: H },
    });

    const issueNum = url.searchParams.get("n") ?? "0";
    return new NextResponse(new Uint8Array(buf as Uint8Array), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="intersect-issue-${issueNum}-slide-${slide}-${fmt}.png"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Render failed: ${(e as Error).message}` },
      { status: 500 },
    );
  } finally {
    await browser.close();
  }
}
