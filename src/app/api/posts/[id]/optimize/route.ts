import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord } from "@/lib/airtable/client";
import { outpaintImage, getTargetDimensions } from "@/lib/replicate-outpaint";
import { uploadImage } from "@/lib/blob-storage";
import { parseMediaItems, serializeMediaItems } from "@/lib/media-items";
import sharp from "sharp";

interface PostFields {
  Campaign: string[];
  Platform: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
}

const PLATFORM_MAP: Record<string, string> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
};

/**
 * POST /api/posts/[id]/optimize
 *
 * AI-outpaint the post's image to the optimal aspect ratio for its platform.
 * Uses Replicate's Flux outpainting model.
 *
 * Body: { imageIndex?: number } — defaults to 0 (primary image)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const body = await request.json().catch(() => ({}));
    const imageIndex = (body as { imageIndex?: number }).imageIndex ?? 0;

    const post = await getRecord<PostFields>("Posts", postId);
    const platform = PLATFORM_MAP[post.fields.Platform] || post.fields.Platform.toLowerCase();

    // Get target dimensions for this platform
    const target = getTargetDimensions(platform);
    if (!target) {
      return NextResponse.json(
        { error: `No optimization target defined for ${post.fields.Platform}` },
        { status: 400 }
      );
    }

    // Get current images
    const mediaItems = parseMediaItems(post.fields);
    if (imageIndex >= mediaItems.length || !mediaItems[imageIndex]?.url) {
      return NextResponse.json(
        { error: "No image at that index" },
        { status: 400 }
      );
    }

    const sourceUrl = mediaItems[imageIndex].url;

    // Check current dimensions — skip if already close to target ratio
    let currentWidth = 0;
    let currentHeight = 0;
    try {
      const imgRes = await fetch(sourceUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const metadata = await sharp(imgBuffer).metadata();
      currentWidth = metadata.width || 0;
      currentHeight = metadata.height || 0;
    } catch {
      // Can't read dimensions — proceed with outpainting anyway
    }

    if (currentWidth && currentHeight) {
      const currentRatio = currentWidth / currentHeight;
      const targetRatio = target.width / target.height;
      if (Math.abs(currentRatio - targetRatio) < 0.05) {
        return NextResponse.json({
          skipped: true,
          reason: `Image is already ${currentWidth}x${currentHeight} (ratio ${currentRatio.toFixed(2)}) — close to target ${target.width}x${target.height}`,
        });
      }
    }

    console.log(
      `[optimize] ${post.fields.Platform}: ${currentWidth}x${currentHeight} → ${target.width}x${target.height}`
    );

    // Outpaint via Replicate — pass source dimensions for proper positioning
    const result = await outpaintImage(
      sourceUrl, target.width, target.height, undefined,
      currentWidth || undefined, currentHeight || undefined
    );

    // Download the outpainted image
    const outpaintedRes = await fetch(result.url);
    let outpaintedBuffer: Buffer = Buffer.from(await outpaintedRes.arrayBuffer());

    // Verify output dimensions — models sometimes ignore target canvas size
    const outMeta = await sharp(outpaintedBuffer).metadata();
    const outW = outMeta.width || 0;
    const outH = outMeta.height || 0;
    const dimensionOk =
      Math.abs(outW - target.width) <= 10 && Math.abs(outH - target.height) <= 10;

    if (!dimensionOk && outW > 0 && outH > 0) {
      console.log(
        `[optimize] Model returned ${outW}x${outH}, expected ${target.width}x${target.height} — resizing with Sharp`
      );
      outpaintedBuffer = Buffer.from(
        await sharp(outpaintedBuffer)
          .resize(target.width, target.height, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer()
      );
    }

    // Upload to Vercel Blob
    const blobUrl = await uploadImage("posts", postId, outpaintedBuffer, "image/jpeg");

    // Update the media item with the new URL
    mediaItems[imageIndex] = { ...mediaItems[imageIndex], url: blobUrl };
    const serialized = serializeMediaItems(mediaItems);

    await updateRecord("Posts", postId, {
      "Image URL": serialized["Image URL"],
      "Media URLs": serialized["Media URLs"],
      "Media Captions": serialized["Media Captions"],
    });

    return NextResponse.json({
      success: true,
      optimizedUrl: blobUrl,
      originalUrl: sourceUrl,
      dimensions: `${target.width}x${target.height}`,
      modelOutput: dimensionOk ? undefined : `${outW}x${outH} (corrected)`,
      duration: result.duration,
    });
  } catch (error) {
    console.error("[optimize] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to optimize image" },
      { status: 500 }
    );
  }
}
