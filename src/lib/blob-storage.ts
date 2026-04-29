import { put, del } from "@vercel/blob";
import { randomBytes } from "crypto";
import sharp from "sharp";

function generatePath(prefix: string, id: string, ext: string): string {
  const timestamp = Date.now();
  const hex = randomBytes(4).toString("hex");
  return `images/${prefix}/${id}/${timestamp}-${hex}.${ext}`;
}

/**
 * Upload an image to Vercel Blob with server-side optimization.
 *
 * PNG/WebP images are converted to JPEG (75% quality) unless they have
 * transparency. This is a safety net for when client-side compression
 * fails or is bypassed.
 */
export async function uploadImage(
  prefix: "campaigns" | "posts" | "brands",
  entityId: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  let finalBuffer = buffer;
  let finalContentType = contentType;
  let ext = "jpg";

  if (contentType === "image/gif") {
    // GIFs pass through unchanged (preserve animation)
    ext = "gif";
  } else if (contentType === "image/png" || contentType === "image/webp") {
    // Check for transparency before converting
    try {
      const metadata = await sharp(buffer).metadata();
      const hasAlpha = metadata.hasAlpha && metadata.channels === 4;

      if (hasAlpha) {
        // Keep PNG for transparent images, but optimize
        finalBuffer = await sharp(buffer).png({ quality: 80 }).toBuffer();
        finalContentType = "image/png";
        ext = "png";
      } else {
        // Convert to JPEG
        finalBuffer = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
        finalContentType = "image/jpeg";
        ext = "jpg";
      }
    } catch {
      // Sharp failed — convert to JPEG as best effort
      try {
        finalBuffer = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
        finalContentType = "image/jpeg";
      } catch {
        // Complete failure — upload as-is
        ext = contentType === "image/png" ? "png" : "webp";
        finalContentType = contentType;
      }
    }
  } else {
    // Already JPEG — optimize if over 500KB
    if (buffer.length > 500 * 1024) {
      try {
        finalBuffer = await sharp(buffer).jpeg({ quality: 75 }).toBuffer();
      } catch {
        // Use original
      }
    }
    finalContentType = "image/jpeg";
    ext = "jpg";
  }

  const sizeBefore = (buffer.length / 1024).toFixed(0);
  const sizeAfter = (finalBuffer.length / 1024).toFixed(0);
  if (finalBuffer !== buffer) {
    console.log(`[blob-storage] Optimized: ${sizeBefore}KB → ${sizeAfter}KB (${ext})`);
  }

  const path = generatePath(prefix, entityId, ext);
  const blob = await put(path, finalBuffer, {
    access: "public",
    contentType: finalContentType,
  });

  return blob.url;
}

export async function deleteImage(url: string): Promise<void> {
  await del(url);
}

/** Check if a URL is a Vercel Blob URL. */
export function isBlobUrl(url: string): boolean {
  return url.includes(".public.blob.vercel-storage.com/");
}

/**
 * Mirror an arbitrary remote image URL into Vercel Blob and return the new
 * permanent Blob URL. Skips the round-trip if the URL is already on Blob,
 * empty, or not http(s). Never throws — returns empty string on failure so
 * the caller can fall back to writing the original URL (or nothing) without
 * breaking the surrounding flow.
 *
 * Use this anywhere we'd otherwise persist a third-party-hosted image URL
 * (Airtable signed URLs, Substack/CMS hero images, og:image scrapes) into
 * a long-lived field — those URLs expire or get revoked.
 */
export async function mirrorRemoteImageToBlob(
  remoteUrl: string | null | undefined,
  prefix: "campaigns" | "posts" | "brands",
  entityId: string,
): Promise<string> {
  if (!remoteUrl) return "";
  if (isBlobUrl(remoteUrl)) return remoteUrl;
  if (!/^https?:\/\//i.test(remoteUrl)) return "";
  try {
    const resp = await fetch(remoteUrl);
    if (!resp.ok) {
      console.warn(
        `[mirror] ${prefix}/${entityId}: source fetch ${resp.status} for ${remoteUrl.slice(0, 120)}`,
      );
      return "";
    }
    const ct = resp.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await resp.arrayBuffer());
    return await uploadImage(prefix, entityId, buf, ct);
  } catch (e) {
    console.warn(
      `[mirror] ${prefix}/${entityId}: failed for ${remoteUrl.slice(0, 120)}:`,
      (e as Error).message,
    );
    return "";
  }
}
