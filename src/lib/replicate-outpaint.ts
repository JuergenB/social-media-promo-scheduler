/**
 * Replicate AI outpainting — extend images to target aspect ratios.
 *
 * Primary: bria/expand-image (360K+ runs, always warm, purpose-built for aspect ratio expansion)
 * Fallback: alexgenovese/flux-outpainting
 *
 * Cost: ~$0.02-0.04 per image, 5-15 seconds for Bria.
 */

const REPLICATE_API = "https://api.replicate.com/v1";
const MAX_POLL_TIME = 120_000; // 2 minutes
const POLL_INTERVAL = 2_000;

// Primary: Bria expand-image — fast, always warm, accepts aspect_ratio or canvas_size
const BRIA_EXPAND = "0d8d951a482d1f94125a7adbde188d7aa280a13fe0a444b9e786fce905e2af9a";
// Fallback: alexgenovese/flux-outpainting — slower but flexible
const FLUX_OUTPAINTING = "efce3edc0c02d7f7f6c4a2a3a66fb4bea4e96c0aaac4e84ba2fd4cedadb2364f";

function getToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");
  return token;
}

interface OutpaintResult {
  url: string;
  duration: number;
  model: string;
}

async function createAndPoll(
  token: string,
  version: string,
  input: Record<string, unknown>
): Promise<{ output: unknown; duration: number }> {
  const startTime = Date.now();

  const createRes = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version, input }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Replicate create failed (${createRes.status}): ${err}`);
  }

  let prediction = await createRes.json();

  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    if (Date.now() - startTime > MAX_POLL_TIME) {
      throw new Error("Outpainting timed out — model may be cold-starting. Try again in a minute.");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const pollRes = await fetch(`${REPLICATE_API}/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    prediction = await pollRes.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(`Outpainting ${prediction.status}: ${prediction.error || "Unknown error"}`);
  }

  return {
    output: prediction.output,
    duration: Math.round((Date.now() - startTime) / 1000),
  };
}

function extractUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  throw new Error("No output URL from Replicate");
}

/**
 * Outpaint an image to target dimensions.
 * Tries Bria expand-image first (fast, always warm), falls back to flux-outpainting.
 */
export async function outpaintImage(
  imageUrl: string,
  targetWidth: number,
  targetHeight: number,
  prompt?: string,
  sourceWidth?: number,
  sourceHeight?: number
): Promise<OutpaintResult> {
  const token = getToken();

  // Try Bria expand-image (primary — fast, purpose-built)
  try {
    console.log(`[outpaint] Trying bria/expand-image: ${targetWidth}x${targetHeight}`);

    // Scale source image to fit within target canvas while preserving aspect ratio
    let imgW = sourceWidth || targetWidth;
    let imgH = sourceHeight || targetHeight;

    // Scale down to fit within target canvas
    const scaleW = targetWidth / imgW;
    const scaleH = targetHeight / imgH;
    const scale = Math.min(scaleW, scaleH);
    imgW = Math.round(imgW * scale);
    imgH = Math.round(imgH * scale);

    // Center the original image in the canvas
    const offsetX = Math.round((targetWidth - imgW) / 2);
    const offsetY = Math.round((targetHeight - imgH) / 2);

    console.log(`[outpaint] Bria: canvas ${targetWidth}x${targetHeight}, image ${imgW}x${imgH} at (${offsetX},${offsetY})`);

    const result = await createAndPoll(token, BRIA_EXPAND, {
      image_url: imageUrl,
      canvas_size: [targetWidth, targetHeight],
      original_image_size: [imgW, imgH],
      original_image_location: [offsetX, offsetY],
      prompt: prompt || "extend the image naturally, maintaining the same style and content",
    });

    const url = extractUrl(result.output);
    console.log(`[outpaint] bria/expand-image completed in ${result.duration}s`);
    return { url, duration: result.duration, model: "bria-expand" };
  } catch (err) {
    console.warn(`[outpaint] bria/expand-image failed, trying fallback:`, err);
  }

  // Fallback: flux-outpainting
  console.log(`[outpaint] Trying flux-outpainting: ${targetWidth}x${targetHeight}`);

  const result = await createAndPoll(token, FLUX_OUTPAINTING, {
    image: imageUrl,
    width: targetWidth,
    height: targetHeight,
    prompt_input: prompt || "",
    num_inference_steps: 28,
    resize_option: "Full",
    alignment: "Middle",
  });

  const url = extractUrl(result.output);
  console.log(`[outpaint] flux-outpainting completed in ${result.duration}s`);
  return { url, duration: result.duration, model: "flux-outpainting" };
}

/**
 * Platform-specific optimal dimensions for outpainting.
 */
export function getTargetDimensions(platform: string): { width: number; height: number } | null {
  const targets: Record<string, { width: number; height: number }> = {
    instagram: { width: 1080, height: 1350 },  // 4:5 portrait
    pinterest: { width: 1000, height: 1500 },   // 2:3 tall pin
    threads: { width: 1440, height: 1920 },     // 3:4
    tiktok: { width: 1080, height: 1920 },      // 9:16
    bluesky: { width: 1000, height: 1000 },     // 1:1 square
    facebook: { width: 1080, height: 1350 },    // 4:5 portrait
    linkedin: { width: 1200, height: 1200 },    // 1:1 square
  };
  return targets[platform] || null;
}
