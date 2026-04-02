import sharp from "sharp";
import { readFileSync } from "fs";
import { join } from "path";
import type { MediaItem } from "@/lib/media-items";

/**
 * Load and base64-encode the embedded font for SVG text rendering.
 * Sharp's librsvg on Vercel/Lambda has NO system fonts — text renders as Xs
 * without an embedded font. We bundle Noto Sans Regular (28KB) and embed it
 * as a data URI in each SVG.
 */
let _fontBase64: string | null = null;
function getEmbeddedFontBase64(): string {
  if (_fontBase64) return _fontBase64;
  try {
    const fontPath = join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf");
    _fontBase64 = readFileSync(fontPath).toString("base64");
  } catch {
    // Fallback: try node_modules path (dev environment)
    try {
      const altPath = join(process.cwd(), "node_modules", "next", "dist", "compiled", "@vercel", "og", "noto-sans-v27-latin-regular.ttf");
      _fontBase64 = readFileSync(altPath).toString("base64");
    } catch {
      _fontBase64 = "";
    }
  }
  return _fontBase64;
}

/** Platform-specific slide dimensions. */
const SLIDE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  instagram: { width: 1080, height: 1350 }, // 4:5 portrait
  linkedin:  { width: 1080, height: 1080 }, // 1:1 square
};
const DEFAULT_DIMENSIONS = SLIDE_DIMENSIONS.instagram;

/** Margin around the source image as a fraction of slide width. */
const SIDE_MARGIN_FRAC = 0.05;
/** Caption area height scales with slide height. */
const CAPTION_AREA_FRAC = 0.09;
/** Edge sample thickness in pixels for dominant color detection. */
const EDGE_SAMPLE_PX = 5;

export type SlideTheme = "dark" | "light";

export interface RGB { r: number; g: number; b: number }

/** Per-slide options for rendering. */
export interface SlideOptions {
  /** Explicit frame color (overrides auto-detection). Picked from artwork via eyedropper. */
  frameColor?: RGB;
  /** Color to remove from the image (chroma key). Makes matching pixels transparent. */
  removeColor?: RGB;
  /** Tolerance for chroma key removal (0-255 Euclidean distance). Default 50. */
  removeTolerance?: number;
}

interface HSL {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = h / 360;
  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  };
}

/**
 * Sample the dominant color from the edges of an image buffer.
 */
async function sampleEdgeColor(imgBuffer: Buffer): Promise<RGB> {
  const meta = await sharp(imgBuffer).metadata();
  const w = meta.width || 100;
  const h = meta.height || 100;

  const regions = [
    { left: 0, top: 0, width: w, height: Math.min(EDGE_SAMPLE_PX, h) },
    { left: 0, top: Math.max(0, h - EDGE_SAMPLE_PX), width: w, height: Math.min(EDGE_SAMPLE_PX, h) },
    { left: 0, top: 0, width: Math.min(EDGE_SAMPLE_PX, w), height: h },
    { left: Math.max(0, w - EDGE_SAMPLE_PX), top: 0, width: Math.min(EDGE_SAMPLE_PX, w), height: h },
  ];

  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (const region of regions) {
    const pixel = await sharp(imgBuffer)
      .extract(region)
      .removeAlpha()
      .resize(1, 1, { fit: "cover" })
      .raw()
      .toBuffer();
    if (pixel.length >= 3) {
      rSum += pixel[0];
      gSum += pixel[1];
      bSum += pixel[2];
      count++;
    }
  }

  if (count === 0) return { r: 128, g: 128, b: 128 };
  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

/**
 * Derive frame color and caption text color from a base color.
 * Auto-detected colors get heavy transformation; user-picked colors stay close to original.
 */
function deriveFrameAndText(baseRgb: RGB, userPicked: boolean): {
  frame: RGB;
  textColor: string;
} {
  const hsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);

  if (userPicked) {
    // User explicitly picked this color — use it with minimal adjustment.
    // Just slightly desaturate and shift lightness toward a usable frame color.
    const frame = hslToRgb({
      h: hsl.h,
      s: Math.min(hsl.s, 0.6), // cap saturation so it doesn't scream
      l: hsl.l < 0.3 ? hsl.l * 1.2 : hsl.l > 0.85 ? hsl.l * 0.95 : hsl.l,
    });
    // Text color: white on dark frames, dark on light frames
    const textColor = hsl.l < 0.55 ? "rgba(255,255,255,0.92)" : "rgba(25,25,25,0.88)";
    return { frame, textColor };
  }

  // Auto-detected: apply heavier transformation
  if (hsl.l < 0.45) {
    const frame = hslToRgb({
      h: hsl.h,
      s: hsl.s * 0.3,
      l: Math.min(hsl.l * 0.3, 0.12),
    });
    return { frame, textColor: "rgba(255,255,255,0.92)" };
  } else {
    const targetL = hsl.l > 0.7 ? 0.97 : 0.93;
    const targetS = hsl.l > 0.7 ? hsl.s * 0.08 : hsl.s * 0.15;
    const frame = hslToRgb({
      h: hsl.h,
      s: targetS,
      l: targetL,
    });
    return { frame, textColor: "rgba(25,25,25,0.88)" };
  }
}

/**
 * Remove pixels matching a target color from an image (chroma key).
 * Returns a PNG buffer with transparency where the color was removed.
 */
async function chromaKeyRemove(
  imgBuffer: Buffer,
  targetColor: RGB,
  tolerance: number = 50
): Promise<Buffer> {
  const { data, info } = await sharp(imgBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data.buffer, data.byteOffset, data.length);
  const toleranceSq = tolerance * tolerance;

  for (let i = 0; i < pixels.length; i += 4) {
    const dr = pixels[i] - targetColor.r;
    const dg = pixels[i + 1] - targetColor.g;
    const db = pixels[i + 2] - targetColor.b;
    const distSq = dr * dr + dg * dg + db * db;

    if (distSq <= toleranceSq) {
      // Smooth edge: partial transparency for near-boundary pixels
      const dist = Math.sqrt(distSq);
      const alpha = dist < tolerance * 0.6 ? 0 : Math.round(((dist - tolerance * 0.6) / (tolerance * 0.4)) * 255);
      pixels[i + 3] = Math.min(pixels[i + 3], alpha);
    }
  }

  // Copy to a clean ArrayBuffer to satisfy TypeScript strict Buffer typing
  const cleanBuf = Buffer.from(pixels);
  return sharp(cleanBuf, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Render a single carousel slide for the given platform.
 *
 * - Platform-specific dimensions (Instagram 4:5, LinkedIn 1:1)
 * - Canvas filled with derived frame color
 * - Source image centered and scaled to fit with margins
 * - Optional chroma key removal before compositing
 * - Caption text at the bottom (SVG overlay)
 *
 * Returns a JPEG buffer + the frame color used.
 */
export async function renderCarouselSlide(
  imageUrl: string,
  caption: string,
  options?: SlideOptions,
  platform?: string
): Promise<{ buffer: Buffer; frameColor: RGB }> {
  const dims = SLIDE_DIMENSIONS[platform || "instagram"] || DEFAULT_DIMENSIONS;
  const slideW = dims.width;
  const slideH = dims.height;
  const captionAreaH = Math.round(slideH * CAPTION_AREA_FRAC);

  // Fetch the source image
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${imageUrl} (${response.status})`);
  let imgBuffer: Buffer = Buffer.from(await response.arrayBuffer());

  // Apply chroma key removal if requested
  if (options?.removeColor) {
    imgBuffer = Buffer.from(await chromaKeyRemove(
      imgBuffer,
      options.removeColor,
      options.removeTolerance ?? 50
    ));
  }

  // Determine frame color:
  //   1. User-picked frameColor (eyedropper) — use with minimal transformation
  //   2. removeColor was set but no frameColor — use the removed bg color as base (it was the background)
  //   3. Auto-detect from edges
  const userPicked = !!options?.frameColor;
  const baseColor = options?.frameColor
    || (options?.removeColor ? options.removeColor : await sampleEdgeColor(imgBuffer));
  const { frame, textColor } = deriveFrameAndText(baseColor, userPicked);

  // Calculate image placement
  const sideMargin = Math.round(slideW * SIDE_MARGIN_FRAC);
  const topMargin = sideMargin;
  const availWidth = slideW - sideMargin * 2;
  const availHeight = slideH - topMargin - captionAreaH - sideMargin;

  const meta = await sharp(imgBuffer).metadata();
  const srcW = meta.width || availWidth;
  const srcH = meta.height || availHeight;

  // Scale to fit within available area
  const scale = Math.min(availWidth / srcW, availHeight / srcH);
  const fitW = Math.round(srcW * scale);
  const fitH = Math.round(srcH * scale);

  // Center horizontally, vertically within the image area (above caption)
  const imgX = Math.round((slideW - fitW) / 2);
  const imgAreaTop = topMargin;
  const imgAreaBottom = slideH - captionAreaH;
  const imgY = Math.round(imgAreaTop + (imgAreaBottom - imgAreaTop - fitH) / 2);

  // Resize source image
  // Use PNG only when chroma key was applied (needs alpha). JPEG otherwise to avoid
  // transparent edge artifacts from PNG antialiasing that show as white fringe lines.
  const resizedImgPipeline = sharp(imgBuffer).resize(fitW, fitH, { fit: "inside" });
  const resizedImg = options?.removeColor
    ? await resizedImgPipeline.png().toBuffer()
    : await resizedImgPipeline.flatten({ background: frame }).jpeg({ quality: 95 }).toBuffer();

  // Build caption overlay — try Pango first (reliable on most Linux), fall back to SVG
  let captionOverlay: Buffer | null = null;
  if (caption) {
    try {
      captionOverlay = await buildCaptionPango(caption, textColor, slideW, captionAreaH);
    } catch {
      // Pango not available (Vercel pre-built Sharp may lack text support)
      // Fall back to SVG with embedded font
      const svg = buildCaptionSvg(caption, textColor, slideW, captionAreaH);
      captionOverlay = await sharp(Buffer.from(svg)).png().toBuffer();
    }
  }

  // Compose the slide
  const composites: sharp.OverlayOptions[] = [
    { input: resizedImg, left: imgX, top: imgY },
  ];

  if (captionOverlay) {
    composites.push({
      input: captionOverlay,
      left: 0,
      top: slideH - captionAreaH,
    });
  }

  const buffer = await sharp({
    create: {
      width: slideW,
      height: slideH,
      channels: 3,
      background: frame,
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer, frameColor: frame };
}

/**
 * Build a caption overlay using Sharp's Pango text rendering.
 * Pango uses system fontconfig which works reliably on Vercel/Lambda
 * (unlike SVG @font-face which requires librsvg font support).
 *
 * Returns a PNG buffer with transparent background + text.
 */
async function buildCaptionPango(
  caption: string,
  textColor: string,
  width: number,
  height: number
): Promise<Buffer> {
  const maxCharsPerLine = 42;

  // Word-wrap to max 2 lines
  const words = caption.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      if (lines.length >= 2) break;
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine && lines.length < 2) {
    lines.push(currentLine);
  }

  if (lines.length === 2 && words.length > lines.join(" ").split(/\s+/).length) {
    let last = lines[1];
    if (last.length > maxCharsPerLine - 1) {
      last = last.slice(0, maxCharsPerLine - 1).replace(/\s+\S*$/, "") + "\u2026";
    } else {
      last += "\u2026";
    }
    lines[1] = last;
  }

  const displayText = lines.join("\n");

  // Parse textColor rgba to hex for Pango markup
  const isLight = textColor.includes("255");
  const hexColor = isLight ? "#FFFFFFEB" : "#191919E0";

  // Use Sharp's text input with Pango markup
  const fontSize = 10;
  const fontWeight = lines.length === 1 ? "bold" : "normal";
  const sidePadding = 60;
  const pangoMarkup = `<span foreground="${hexColor}" font_desc="sans ${fontWeight} ${fontSize}">${displayText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;

  const textImage = await sharp({
    text: {
      text: pangoMarkup,
      rgba: true,
      width: width - sidePadding * 2, // padding
      height: height,
      align: "centre",
    },
  })
    .png()
    .toBuffer();

  // Get the rendered text dimensions and center it in the caption area
  const textMeta = await sharp(textImage).metadata();
  const textW = textMeta.width || width;
  const textH = textMeta.height || height;
  const offsetX = Math.max(0, Math.round((width - textW) / 2));
  const bottomPad = 12;
  const offsetY = Math.max(0, Math.round((height - textH) / 2) - bottomPad);

  // Composite text onto a transparent canvas of the correct caption area size
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: textImage, left: offsetX, top: offsetY }])
    .png()
    .toBuffer();
}

/**
 * SVG fallback for caption rendering when Pango is not available.
 * Embeds Noto Sans as base64 @font-face for serverless compatibility.
 */
function buildCaptionSvg(caption: string, textColor: string, width: number, height: number): string {
  const fontSize = 10;
  const lineHeight = 16;
  const maxCharsPerLine = 52;
  const sidePadding = 60;

  const words = caption.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      if (lines.length >= 2) break;
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine && lines.length < 2) lines.push(currentLine);
  if (lines.length === 2 && words.length > lines.join(" ").split(/\s+/).length) {
    lines[1] = lines[1].slice(0, maxCharsPerLine - 1).replace(/\s+\S*$/, "") + "\u2026";
  }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const totalTextHeight = lines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2 + fontSize * 0.8 - 6;

  const fontB64 = getEmbeddedFontBase64();
  const fontFace = fontB64
    ? `<defs><style>@font-face{font-family:"CF";src:url("data:font/truetype;base64,${fontB64}")format("truetype")}</style></defs>`
    : "";
  const ff = fontB64 ? "CF" : "sans-serif";

  const textEls = lines
    .map((line, i) => `<text x="${width / 2}" y="${startY + i * lineHeight}" text-anchor="middle" font-family="${ff}" font-size="${fontSize}" fill="${esc(textColor)}">${esc(line)}</text>`)
    .join("");

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${fontFace}${textEls}</svg>`;
}

/**
 * Render all slides for a carousel post.
 * Accepts optional per-slide options (frame color, chroma key) and platform for dimensions.
 */
export async function renderCarouselSlides(
  items: MediaItem[],
  slideOptions?: (SlideOptions | undefined)[],
  platform?: string
): Promise<Array<{ buffer: Buffer; frameColor: RGB }>> {
  const results: Array<{ buffer: Buffer; frameColor: RGB }> = [];
  for (let i = 0; i < items.length; i++) {
    const result = await renderCarouselSlide(
      items[i].url,
      items[i].caption,
      slideOptions?.[i],
      platform
    );
    results.push(result);
  }
  return results;
}

/** Exported for PDF assembler to detect pre-rendered slides. */
export { SLIDE_DIMENSIONS };
