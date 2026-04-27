import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Dev-only endpoint to demo the upscale flow on the overview-covers mockup
// page. Reads the local hero image, ensures it's in Blob (Replicate needs a
// public URL), kicks off Real-ESRGAN, polls until done, returns the upscaled
// output URL.

export const maxDuration = 120;

const SOURCE_PATH = path.join(
  process.cwd(),
  "public/dev-assets/intersect-74-lead.jpg",
);
const BLOB_KEY = "dev-assets/intersect-74-lead-source.jpg";

export async function POST() {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "REPLICATE_API_TOKEN missing" },
      { status: 500 },
    );
  }

  // Step 1 — make sure the source image lives at a public URL Replicate can fetch
  let sourceUrl: string;
  try {
    const meta = await head(BLOB_KEY).catch(() => null);
    if (meta?.url) {
      sourceUrl = meta.url;
    } else {
      const file = await readFile(SOURCE_PATH);
      const blob = await put(BLOB_KEY, file, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      sourceUrl = blob.url;
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Source upload failed: ${(e as Error).message}` },
      { status: 500 },
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
