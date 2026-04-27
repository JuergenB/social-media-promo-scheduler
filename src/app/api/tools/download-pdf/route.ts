import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

// Dev-only: render N slides via Puppeteer at native size and assemble them
// into a single PDF (LinkedIn document carousel friendly). Reuses the same
// render-mode URL the PNG download endpoint uses.

export const maxDuration = 90;

const PORT = 3025;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // slides comes as a comma-separated list, e.g. "A,2a,C"
  const slides = (url.searchParams.get("slides") ?? "A,2a,C")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ["A", "2a", "2b", "C"].includes(s));
  if (slides.length === 0) {
    return NextResponse.json({ error: "no slides" }, { status: 400 });
  }
  const fmt = url.searchParams.get("fmt") === "li" ? "li" : "ig";
  const W = 1080;
  const H = fmt === "li" ? 1080 : 1350;

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

  const browser = await puppeteer.launch({ headless: "new" as never });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

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

    const pngs: Buffer[] = [];
    for (const slide of slides) {
      const renderParams = new URLSearchParams(url.searchParams);
      renderParams.delete("slides");
      renderParams.set("render", slide);
      renderParams.set("fmt", fmt);
      const renderUrl = `http://localhost:${PORT}/dashboard/tools/cover-generator?${renderParams.toString()}`;
      await page.goto(renderUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      await page.waitForSelector("#render-root", { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 1500));
      const buf = await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: W, height: H },
      });
      pngs.push(buf as Buffer);
    }

    // Assemble into PDF — one slide per page at native size
    const pdf = await PDFDocument.create();
    for (const pngBuf of pngs) {
      const img = await pdf.embedPng(pngBuf);
      const pdfPage = pdf.addPage([W, H]);
      pdfPage.drawImage(img, { x: 0, y: 0, width: W, height: H });
    }
    const pdfBytes = await pdf.save();

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="intersect-issue-overview-${fmt}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `PDF render failed: ${(e as Error).message}` },
      { status: 500 },
    );
  } finally {
    await browser.close();
  }
}
