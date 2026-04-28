import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Upscale the cover-generator's current hero image via Replicate's Real-ESRGAN.
// The page POSTs `{ sourceUrl }` — whatever heroSrc is currently rendering.
// Two source shapes are supported:
//   - http(s):// URL (typical: Curator Airtable lead image) → passed straight
//     to Replicate; no Blob round-trip.
//   - /public-relative path (initial fallback before any Curator fetch) →
//     read from disk, uploaded to Blob with a basename-derived key, then the
//     Blob URL is passed to Replicate.

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN missing" },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    sourceUrl?: unknown;
  };
  const rawUrl = typeof body.sourceUrl === "string" ? body.sourceUrl : "";
  if (!rawUrl) {
    return NextResponse.json(
      { error: "sourceUrl is required (POST { sourceUrl: string })" },
      { status: 400 },
    );
  }

  // Step 1 — resolve the source to a public URL Replicate can fetch.
  let sourceUrl: string;
  if (/^https?:\/\//i.test(rawUrl)) {
    sourceUrl = rawUrl;
  } else if (rawUrl.startsWith("/")) {
    try {
      const filePath = path.join(process.cwd(), "public", rawUrl);
      const file = await readFile(filePath);
      const basename = path.basename(rawUrl);
      const ext = path.extname(basename).toLowerCase();
      const contentType = ext === ".png" ? "image/png" : "image/jpeg";
      const blob = await put(`dev-assets/upscale-source-${basename}`, file, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      sourceUrl = blob.url;
    } catch (e) {
      return NextResponse.json(
        { error: `Source upload failed: ${(e as Error).message}` },
        { status: 500 },
      );
    }
  } else {
    return NextResponse.json(
      {
        error:
          "sourceUrl must be an http(s) URL or a /public-relative path",
      },
      { status: 400 },
    );
  }

  // Step 2 — start the prediction
  let prediction: { id: string; urls?: { get: string }; status: string };
  try {
    const startResp = await fetch(
      "https://api.replicate.com/v1/models/nightmareai/real-esrgan/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { image: sourceUrl, scale: 2, face_enhance: false },
        }),
      },
    );
    if (!startResp.ok) {
      const txt = await startResp.text();
      return NextResponse.json(
        { error: `Replicate start failed: ${startResp.status} ${txt}` },
        { status: 500 },
      );
    }
    prediction = await startResp.json();
  } catch (e) {
    return NextResponse.json(
      { error: `Replicate start error: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  // Step 3 — poll until done (cap at ~90s)
  const pollUrl = prediction.urls?.get;
  if (!pollUrl) {
    return NextResponse.json(
      { error: "No poll URL from Replicate" },
      { status: 500 },
    );
  }

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const pollResp = await fetch(pollUrl, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!pollResp.ok) {
      return NextResponse.json(
        { error: `Poll failed: ${pollResp.status}` },
        { status: 500 },
      );
    }
    const pred: {
      status: string;
      output?: string;
      error?: string;
    } = await pollResp.json();

    if (pred.status === "succeeded") {
      return NextResponse.json({ url: pred.output, sourceUrl });
    }
    if (pred.status === "failed" || pred.status === "canceled") {
      return NextResponse.json(
        { error: pred.error || "Replicate prediction failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "Timed out after 90s" },
    { status: 504 },
  );
}
