import sharp from "sharp";
import satori from "satori";
import { buildAllSatoriFonts } from "@/lib/fonts";
import type {
  Band,
  TextBand,
  SeparatorBand,
  BrandingBand,
  ImageBand,
  ColorScheme,
  CoverSlideContent,
  CoverSlideRenderOptions,
  CoverSlideRenderResult,
} from "@/lib/cover-slide-types";

// ---------------------------------------------------------------------------
// Eyedropper → auto scheme derivation
// ---------------------------------------------------------------------------

/**
 * Given a user-picked background color (from eyedropper), derive a full
 * color scheme with appropriate text colors. Dark backgrounds get white text,
 * light backgrounds get dark text. Same logic as the existing slide generator.
 */
export function deriveSchemeFromBackground(bgHex: string): ColorScheme {
  const rgb = hexToRgb(bgHex);
  // Relative luminance (simplified)
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const isDark = luminance < 0.5;

  return {
    background: bgHex,
    primary: isDark ? "#FFFFFF" : "#1A1A1A",
    secondary: isDark ? "rgba(255,255,255,0.80)" : "rgba(30,30,30,0.72)",
    accent: isDark ? "rgba(255,255,255,0.60)" : "rgba(30,30,30,0.55)",
  };
}

// ---------------------------------------------------------------------------
// Color scheme variable resolution
// ---------------------------------------------------------------------------

/**
 * Resolve template variables like "{{scheme.primary}}" to actual color values.
 */
function resolveColor(colorStr: string, scheme: ColorScheme): string {
  if (!colorStr.startsWith("{{")) return colorStr;
  const match = colorStr.match(/\{\{scheme\.(\w+)\}\}/);
  if (!match) return colorStr;
  const key = match[1] as keyof ColorScheme;
  return scheme[key] || colorStr;
}

// ---------------------------------------------------------------------------
// Layout measurement
// ---------------------------------------------------------------------------

interface ResolvedBand {
  band: Band;
  y: number;
  height: number;
}

/**
 * First pass: resolve band heights to actual pixel values.
 * - Percentage: fraction of total canvas height
 * - Fixed number: pixel value
 * - "auto": estimated from text content and font size
 */
function resolveBandHeights(
  bands: Band[],
  canvasWidth: number,
  canvasHeight: number,
  content: CoverSlideContent
): ResolvedBand[] {
  // First pass: resolve fixed and percentage heights, collect auto bands
  const preliminary: { band: Band; height: number | "auto" }[] = [];
  let usedHeight = 0;

  for (const band of bands) {
    if (typeof band.height === "number") {
      preliminary.push({ band, height: band.height });
      usedHeight += band.height;
    } else if (typeof band.height === "string" && band.height.endsWith("%")) {
      const pct = parseFloat(band.height) / 100;
      const h = Math.round(canvasHeight * pct);
      preliminary.push({ band, height: h });
      usedHeight += h;
    } else {
      // "auto" — measure from content
      preliminary.push({ band, height: "auto" });
    }
  }

  // Second pass: estimate auto heights
  const autoCount = preliminary.filter((p) => p.height === "auto").length;
  const remainingHeight = canvasHeight - usedHeight;

  const resolved: ResolvedBand[] = [];
  let currentY = 0;

  for (const item of preliminary) {
    let h: number;
    if (item.height === "auto") {
      h = estimateAutoHeight(item.band, canvasWidth, content, remainingHeight, autoCount);
    } else {
      h = item.height;
    }
    resolved.push({ band: item.band, y: currentY, height: h });
    currentY += h;
  }

  // Third pass: redistribute leftover space among auto-height text bands.
  // When headline shrinks (fewer lines), the saved space distributes evenly
  // to other text/separator/spacer bands so the layout stays balanced.
  const totalUsed = resolved.reduce((sum, rb) => sum + rb.height, 0);
  const leftover = canvasHeight - totalUsed;
  if (leftover > 10) {
    // Find redistributable bands (auto-height text, separator, spacer, branding)
    const redistributable = resolved.filter(
      (rb) => rb.band.type !== "image" &&
        (preliminary.find((p) => p.band === rb.band)?.height === "auto" ||
         rb.band.type === "branding" || rb.band.type === "spacer")
    );
    if (redistributable.length > 0) {
      const extra = Math.floor(leftover / redistributable.length);
      let offset = 0;
      for (const rb of resolved) {
        rb.y += offset;
        if (redistributable.includes(rb)) {
          rb.height += extra;
          offset += extra;
        }
      }
    }
  }

  return resolved;
}

/**
 * Estimate the height of an "auto" band based on its content.
 */
function estimateAutoHeight(
  band: Band,
  canvasWidth: number,
  content: CoverSlideContent,
  remainingHeight: number,
  autoCount: number
): number {
  if (band.type === "text") {
    const text = getTextContent(band, content);
    const maxFontSize = band.font.sizeRange[1];
    const maxLines = band.maxLines || 1;
    const lhMultiplier = band.lineHeight || 1.3;
    const lineHeight = maxFontSize * lhMultiplier;
    const paddingV = (band.paddingTop || 0) + (band.paddingBottom || 0);

    // Estimate line count from text length and available width
    const paddingX = band.paddingX || 0;
    const availWidth = canvasWidth - paddingX * 2;
    const charsPerLine = Math.floor(availWidth / (maxFontSize * 0.55));
    const textLines = Math.min(Math.ceil(text.length / Math.max(charsPerLine, 1)), maxLines);

    return Math.round(lineHeight * textLines + paddingV);
  }

  if (band.type === "separator") {
    const sep = band as SeparatorBand;
    return (typeof band.height === "number" ? band.height : 2) + (sep.marginY || 0) * 2;
  }

  // Fallback: divide remaining space equally
  return Math.round(remainingHeight / Math.max(autoCount, 1));
}

/**
 * Get the text content for a text band from the content values.
 */
function getTextContent(band: TextBand, content: CoverSlideContent): string {
  switch (band.contentSource) {
    case "campaignTypeLabel": return content.campaignTypeLabel || "";
    case "headline": return content.headline || "";
    case "description": return content.description || "";
    case "handle": return content.handle || "";
    case "custom": return content.custom?.[band.customKey || ""] || "";
    default: return "";
  }
}

// ---------------------------------------------------------------------------
// Character budget estimation
// ---------------------------------------------------------------------------

/**
 * Derive character budgets from a template's band specs.
 * Used by AI content generation to know how much text to produce.
 */
export function deriveCharBudgets(
  bands: Band[],
  canvasWidth: number
): Record<string, number> {
  const budgets: Record<string, number> = {};
  for (const band of bands) {
    if (band.type !== "text") continue;
    const paddingX = band.paddingX || 0;
    const availWidth = canvasWidth - paddingX * 2;
    const maxFontSize = band.font.sizeRange[1];
    const charsPerLine = Math.floor(availWidth / (maxFontSize * 0.55));
    const maxLines = band.maxLines || 1;
    budgets[band.contentSource] = charsPerLine * maxLines;
  }
  return budgets;
}

// ---------------------------------------------------------------------------
// Satori element builders
// ---------------------------------------------------------------------------

/**
 * Build a Satori JSX element for a text band.
 * Satori uses React-like JSX objects — not actual React.
 */
function buildTextElement(
  band: TextBand,
  text: string,
  scheme: ColorScheme,
  bandWidth: number,
  bandHeight: number,
  fontSize: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const color = resolveColor(band.color, scheme);
  const paddingX = band.paddingX || 0;
  const paddingTop = band.paddingTop || 0;
  const paddingBottom = band.paddingBottom || 0;

  let displayText = text;
  if (band.transform === "uppercase") displayText = text.toUpperCase();
  else if (band.transform === "lowercase") displayText = text.toLowerCase();
  else if (band.transform === "capitalize") {
    displayText = text.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent:
          band.align === "center" ? "center" :
          band.align === "right" ? "flex-end" : "flex-start",
        width: bandWidth,
        height: bandHeight,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingTop,
        paddingBottom,
        color,
        fontSize,
        fontFamily: band.font.family,
        fontWeight: band.font.weight,
        fontStyle: band.font.style || "normal",
        textAlign: band.align,
        lineHeight: band.lineHeight || 1.3,
        letterSpacing: band.letterSpacing || 0,
        overflow: "hidden",
      },
      children: displayText,
    },
  };
}

/**
 * Build a Satori element for a separator band.
 */
function buildSeparatorElement(
  band: SeparatorBand,
  scheme: ColorScheme,
  bandWidth: number,
  bandHeight: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const color = resolveColor(band.color, scheme);
  const lineWidth = Math.round(bandWidth * (band.widthPercent / 100));
  const lineHeight = typeof band.height === "number" ? band.height : 2;
  const marginY = band.marginY || 0;

  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent:
          band.align === "center" ? "center" :
          band.align === "right" ? "flex-end" : "flex-start",
        width: bandWidth,
        height: bandHeight,
        paddingTop: marginY,
        paddingBottom: marginY,
      },
      children: {
        type: "div",
        props: {
          style: {
            width: lineWidth,
            height: lineHeight,
            backgroundColor: color,
          },
          children: "",
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Adaptive font sizing
// ---------------------------------------------------------------------------

/**
 * Find the largest font size in the band's sizeRange that fits the text
 * within maxLines at the given width.
 */
function findOptimalFontSize(
  text: string,
  band: TextBand,
  availWidth: number
): number {
  const [minSize, maxSize] = band.font.sizeRange;
  const maxLines = band.maxLines || 1;

  // Binary search for optimal size
  let lo = minSize;
  let hi = maxSize;
  let best = minSize;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const charsPerLine = Math.floor(availWidth / (mid * 0.55));
    const neededLines = Math.ceil(text.length / Math.max(charsPerLine, 1));

    if (neededLines <= maxLines) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

/**
 * Truncate text with ellipsis if it exceeds maxLines at the given font size.
 */
function truncateToFit(
  text: string,
  fontSize: number,
  maxLines: number,
  availWidth: number
): string {
  const charsPerLine = Math.floor(availWidth / (fontSize * 0.55));
  const maxChars = charsPerLine * maxLines;
  if (text.length <= maxChars) return text;

  // Truncate at word boundary
  let truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.6) {
    truncated = truncated.slice(0, lastSpace);
  }
  return truncated.trimEnd() + "\u2026";
}

// ---------------------------------------------------------------------------
// High-key / Low-key image processing
// ---------------------------------------------------------------------------

/**
 * Create a high-key (very light, low contrast) version of an image.
 * Used as a subtle background texture behind text on quote cards.
 * Optional tint shifts the high-key toward a specific color.
 */
/**
 * Create a high-key (light, low contrast) version of an image.
 *
 * Two-step approach to avoid blown-out highlights:
 *   1. Gamma compression — flattens the tonal range so highlights don't clip
 *      when we brighten. Higher gamma values compress more aggressively.
 *   2. High-key wash — brightness lift + white offset on the compressed image,
 *      producing an even, readable background without harsh clipping.
 *
 * @param intensity 0-100: 0 = original image, 100 = near-solid white. Default 70.
 * @param keepColors When true, preserve original color saturation instead of desaturating to B&W.
 */
async function applyHighKey(
  buffer: Buffer,
  tint?: { r: number; g: number; b: number },
  intensity: number = 70,
  keepColors: boolean = false,
  sourceLuminance: number = 0.3
): Promise<Buffer> {
  // Scale parameters by intensity (0-100)
  const t = Math.max(0, Math.min(100, intensity)) / 100;

  // Use an ease-out curve (sqrt) so the wash builds gradually through the
  // mid-range and only goes solid white near 90-100%.
  const tEased = Math.sqrt(t);

  // Scale gamma and brightness by source darkness. Dark images (lum ~0.1)
  // need heavy gamma to lift; light images (lum ~0.8) need almost none.
  // darkness: 1.0 for black, 0.0 for white
  const darkness = 1.0 - Math.min(1, Math.max(0, sourceLuminance));

  // Step 1: Gamma compression — scaled by source darkness.
  // Dark source (darkness=1): gamma 1.8 → 3.0 (heavy lift needed)
  // Light source (darkness=0): gamma 1.0 → 1.6 (minimal — already light)
  const gammaBase = 1.0 + darkness * 0.8;        // 1.0 – 1.8
  const gammaRange = 0.4 + darkness * 0.8;        // 0.4 – 1.2
  const gammaValue = gammaBase + tEased * gammaRange;
  const compressed = await sharp(buffer)
    .gamma(gammaValue)
    .toBuffer();

  // Step 2: High-key wash — also scaled by source darkness.
  // Dark source: brightness 1.0→2.6, offset 0→240 (aggressive wash)
  // Light source: brightness 1.0→1.6, offset 0→100 (gentle wash)
  const brightnessRange = 0.6 + darkness * 1.0;   // 0.6 – 1.6
  const offsetRange = 100 + darkness * 140;        // 100 – 240
  const brightness = 1.0 + tEased * brightnessRange;
  const saturation = keepColors ? 1.0 : 1.0 - tEased * 0.9;
  const contrast = 1.0 - tEased * (0.4 + darkness * 0.35);  // 0.6–0.25 at max
  const offset = tEased * offsetRange;

  let pipeline = sharp(compressed)
    .modulate({ brightness, saturation });

  // Skip tint when preserving original colors — tint() replaces colors with the tint hue
  if (tint && !keepColors) {
    pipeline = pipeline.tint(tint);
  }

  const pass1 = await pipeline.toBuffer();

  return sharp(pass1)
    .linear(contrast, offset)
    .blur(1 + t)
    .toBuffer();
}

/**
 * Create a low-key (dark, low contrast) version of an image.
 * @param intensity 0-100: 0 = original image, 100 = near-solid black. Default 70.
 * @param keepColors When true, preserve original color saturation instead of desaturating to B&W.
 */
async function applyLowKey(
  buffer: Buffer,
  tint?: { r: number; g: number; b: number },
  intensity: number = 70,
  keepColors: boolean = false
): Promise<Buffer> {
  const t = Math.max(0, Math.min(100, intensity)) / 100;
  const brightness = 1.0 - t * 0.7;       // 1.0 → 0.3
  const saturation = keepColors ? 1.0 : 1.0 - t * 0.8;       // keepColors: full sat; default: 1.0 → 0.2
  const contrast = 1.0 - t * 0.7;         // 1.0 → 0.3
  const offset = t * 15;                  // 0 → 15

  let pipeline = sharp(buffer)
    .modulate({ brightness, saturation });

  // Skip tint when preserving original colors — tint() replaces colors with the tint hue
  if (tint && !keepColors) {
    pipeline = pipeline.tint(tint);
  }

  const pass1 = await pipeline.toBuffer();

  return sharp(pass1)
    .linear(contrast, offset)
    .blur(1 + t)
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

/**
 * Render a cover slide from a template specification and content values.
 *
 * Pipeline:
 * 1. Resolve band heights (layout pass)
 * 2. Fetch and crop the background image for the image band
 * 3. Render all text/separator bands as a single SVG overlay via Satori
 * 4. Composite: canvas → image → text overlay → logo
 * 5. Output JPEG buffer
 */
export async function renderCoverSlide(
  options: CoverSlideRenderOptions
): Promise<CoverSlideRenderResult> {
  const { template, content, width, height, imageOffset, colorSchemeOverrides, fontSizeDeltas, overlayOpacity, overlayTint, keepOriginalColors, blurBackground, logoScale, logoOpacity: logoOpacityOverride } = options;

  // Resolve color scheme
  const scheme: ColorScheme = {
    ...template.colorScheme,
    ...colorSchemeOverrides,
  };

  // Resolve band layout
  const resolvedBands = resolveBandHeights(template.bands, width, height, content);

  // Find image band and non-image bands
  const imageBandEntry = resolvedBands.find((rb) => rb.band.type === "image");
  const brandingBandEntry = resolvedBands.find((rb) => rb.band.type === "branding");

  // --- Step 1: Create base canvas with background color ---
  const bgColor = scheme.background;
  const bgRgb = hexToRgb(bgColor);
  const bgLum = (0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b) / 255;

  // --- Step 2: Fetch and process the background image ---
  let imageComposite: sharp.OverlayOptions | null = null;

  // For templates WITHOUT an image band (e.g., Quotable Card):
  // Use the primary image as a full-bleed high-key/low-key background
  if (!imageBandEntry && content.primaryImage) {
    try {
      const response = await fetch(content.primaryImage);
      if (response.ok) {
        const imgBuffer = Buffer.from(await response.arrayBuffer());

        // Scale to fill entire canvas, optionally blur for even backgrounds
        let resized = await sharp(imgBuffer)
          .resize(width, height, { fit: "cover" })
          .toBuffer();

        if (blurBackground) {
          resized = await sharp(resized).blur(4).toBuffer();
        }

        // Apply high-key or low-key based on background luminance.
        // High-key (light cards): slider 0-100 maps to intensity 40-100 — text is dark,
        //   so even the lightest setting must wash the image enough for readability.
        // Low-key (dark cards): slider 0-100 maps to intensity 15-100 — white text is
        //   more forgiving on dark images, so a lower floor works.
        const tintRgb = overlayTint ? hexToRgb(overlayTint) : bgRgb;
        const isHighKey = bgLum > 0.5;
        const sliderVal = typeof overlayOpacity === "number"
          ? Math.max(0, Math.min(100, overlayOpacity))
          : 50;

        // Measure source image brightness for adaptive processing.
        const { dominant } = await sharp(resized).stats();
        const imgLum = (0.299 * dominant.r + 0.587 * dominant.g + 0.114 * dominant.b) / 255;

        // For high-key: adaptive floor based on source brightness.
        // Dark images (lum ~0.1) → floor 55; light images (lum ~0.8) → floor 15.
        // The applyHighKey function also uses imgLum to scale gamma/brightness.
        let intensity: number;
        if (isHighKey) {
          const adaptiveFloor = Math.round(55 - imgLum * 40);  // 55 → 15
          intensity = adaptiveFloor + (sliderVal / 100) * (100 - adaptiveFloor);
        } else {
          intensity = 15 + (sliderVal / 100) * 85;
        }

        const preserveColors = keepOriginalColors === true;
        const processed = isHighKey
          ? await applyHighKey(resized, tintRgb, intensity, preserveColors, imgLum)
          : await applyLowKey(resized, tintRgb, intensity, preserveColors);

        imageComposite = { input: processed, left: 0, top: 0 };
      }
    } catch {
      // Image fetch failed — fall back to solid background
    }
  }

  // For templates WITH an image band: crop to fit the band
  if (imageBandEntry && content.primaryImage) {
    const imgBand = imageBandEntry.band as ImageBand;
    const offset = imageOffset ?? imgBand.verticalOffset ?? 0;

    const response = await fetch(content.primaryImage);
    if (response.ok) {
      const imgBuffer = Buffer.from(await response.arrayBuffer());
      const meta = await sharp(imgBuffer).metadata();
      const srcW = meta.width || width;
      const srcH = meta.height || height;

      // Scale image to fill band width, then crop vertically
      const bandW = width;
      const bandH = imageBandEntry.height;
      const scale = Math.max(bandW / srcW, bandH / srcH);
      const scaledW = Math.round(srcW * scale);
      const scaledH = Math.round(srcH * scale);

      // Vertical offset: 0 = top, 50 = center, 100 = bottom
      const maxOffsetY = Math.max(0, scaledH - bandH);
      const offsetY = Math.round((offset / 100) * maxOffsetY);

      const croppedImg = await sharp(imgBuffer)
        .resize(scaledW, scaledH, { fit: "fill" })
        .extract({
          left: Math.round((scaledW - bandW) / 2),
          top: offsetY,
          width: bandW,
          height: bandH,
        })
        .jpeg({ quality: 95 })
        .toBuffer();

      imageComposite = {
        input: croppedImg,
        left: 0,
        top: imageBandEntry.y,
      };
    }
  }

  // --- Step 3: Build Satori overlay ---
  // Strategy: image band and branding band get fixed heights.
  // The content zone (label, headline, sep, description, handle) is a single
  // Satori flex column that fills the remaining space. Satori's flexbox handles
  // natural vertical distribution — when headline shrinks, description gets more room.

  const charBudgets: Record<string, number> = {};

  // Calculate fixed zone heights
  const imageH = imageBandEntry?.height || 0;
  const brandingH = brandingBandEntry?.height || 0;
  const contentZoneH = height - imageH - brandingH;

  // Build content zone children (everything except image and branding)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentChildren: any[] = [];

  for (const rb of resolvedBands) {
    if (rb.band.type === "image" || rb.band.type === "branding") continue;

    if (rb.band.type === "text") {
      const textBand = rb.band as TextBand;
      let text = getTextContent(textBand, content);
      const paddingX = textBand.paddingX || 0;
      const availWidth = width - paddingX * 2;

      // Apply user font size delta if provided
      const delta = fontSizeDeltas?.[textBand.contentSource] || 0;
      const adjustedBand = delta !== 0 ? {
        ...textBand,
        font: {
          ...textBand.font,
          sizeRange: [
            Math.max(8, textBand.font.sizeRange[0] + delta),
            Math.max(10, textBand.font.sizeRange[1] + delta),
          ] as [number, number],
        },
      } : textBand;

      const fontSize = findOptimalFontSize(text, adjustedBand, availWidth);
      // Don't hard-truncate — let Satori's overflow handle it naturally
      // Only truncate if text is extremely long (> 2x budget)
      const charsPerLine = Math.floor(availWidth / (fontSize * 0.55));
      const maxChars = charsPerLine * (adjustedBand.maxLines || 4);
      charBudgets[textBand.contentSource] = maxChars;
      if (text.length > maxChars * 2) {
        text = truncateToFit(text, fontSize, (adjustedBand.maxLines || 4) * 2, availWidth);
      }

      // Use flexShrink so text bands compress when space is tight
      const color = resolveColor(textBand.color, scheme);
      const paddingTop = textBand.paddingTop || 0;
      const paddingBottom = textBand.paddingBottom || 0;

      let displayText = text;
      if (textBand.transform === "uppercase") displayText = text.toUpperCase();
      else if (textBand.transform === "lowercase") displayText = text.toLowerCase();
      else if (textBand.transform === "capitalize") {
        displayText = text.replace(/\b\w/g, (c) => c.toUpperCase());
      }

      const bandBg = textBand.backgroundColor ? resolveColor(textBand.backgroundColor, scheme) : undefined;
      contentChildren.push({
        type: "div",
        props: {
          style: {
            display: "flex",
            justifyContent:
              textBand.align === "center" ? "center" :
              textBand.align === "right" ? "flex-end" : "flex-start",
            width,
            paddingLeft: paddingX,
            paddingRight: paddingX,
            paddingTop,
            paddingBottom,
            color,
            fontSize,
            fontFamily: textBand.font.family,
            fontWeight: textBand.font.weight,
            fontStyle: textBand.font.style || "normal",
            textAlign: textBand.align,
            lineHeight: textBand.lineHeight || 1.3,
            letterSpacing: textBand.letterSpacing || 0,
            flexShrink: 1,
            ...(bandBg ? { backgroundColor: bandBg } : {}),
          },
          children: displayText,
        },
      });
    } else if (rb.band.type === "separator") {
      const sepBand = rb.band as SeparatorBand;
      contentChildren.push(
        buildSeparatorElement(sepBand, scheme, width, (typeof sepBand.height === "number" ? sepBand.height : 2) + (sepBand.marginY || 0) * 2)
      );
    } else if (rb.band.type === "spacer") {
      const spacerH = typeof rb.band.height === "string" && rb.band.height.endsWith("%")
        ? Math.round(height * parseFloat(rb.band.height) / 100)
        : typeof rb.band.height === "number" ? rb.band.height : 20;
      const spacerBg = rb.band.backgroundColor ? resolveColor(rb.band.backgroundColor, scheme) : undefined;
      contentChildren.push({
        type: "div",
        props: {
          style: { width, height: spacerH, flexShrink: 0, ...(spacerBg ? { backgroundColor: spacerBg } : {}) },
          children: "",
        },
      });
    }
  }

  // Assemble the full overlay: image spacer + content zone + branding spacer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootElement: any = {
    type: "div",
    props: {
      style: {
        display: "flex",
        flexDirection: "column",
        width,
        height,
      },
      children: [
        // Image band spacer (transparent — image composited via Sharp)
        {
          type: "div",
          props: {
            style: { width, height: imageH, flexShrink: 0 },
            children: "",
          },
        },
        // Content zone — flex column that fills remaining space
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              width,
              height: contentZoneH,
              flexGrow: 1,
              flexShrink: 0,
              overflow: "hidden",
            },
            children: contentChildren,
          },
        },
        // Branding band spacer
        {
          type: "div",
          props: {
            style: { width, height: brandingH, flexShrink: 0 },
            children: "",
          },
        },
      ],
    },
  };

  const fonts = buildAllSatoriFonts();

  const satoriSvg = await satori(rootElement, {
    width,
    height,
    fonts,
  });

  const textOverlay = await sharp(Buffer.from(satoriSvg)).png().toBuffer();

  // --- Step 4: Compose everything ---
  const composites: sharp.OverlayOptions[] = [];

  // Background image
  if (imageComposite) {
    composites.push(imageComposite);
  }

  // Text overlay (transparent PNG over the entire canvas)
  composites.push({ input: textOverlay, left: 0, top: 0 });

  // Brand logo (if available)
  if (brandingBandEntry && content.brandLogoUrl) {
    try {
      const logoResponse = await fetch(content.brandLogoUrl);
      if (logoResponse.ok) {
        const logoBuffer = Buffer.from(await logoResponse.arrayBuffer());
        const brandBand = brandingBandEntry.band as BrandingBand;
        const padding = brandBand.padding;
        const maxLogoH = Math.round(brandingBandEntry.height - padding * 2);
        const maxLogoW = Math.round(width * (logoScale ?? 0.15));

        // Subtle logo: light enough to read as a watermark, not a stamp
        const logoOpacity = logoOpacityOverride ?? (bgLum > 0.5 ? 0.35 : 0.40);

        const resizedLogo = await sharp(logoBuffer)
          .resize(maxLogoW, maxLogoH, { fit: "inside" })
          .ensureAlpha()
          .composite([{
            input: Buffer.from([0, 0, 0, Math.round(255 * logoOpacity)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: "dest-in",
          }])
          .png()
          .toBuffer();

        const logoMeta = await sharp(resizedLogo).metadata();
        const logoW = logoMeta.width || maxLogoW;

        let logoX: number;
        if (brandBand.position === "bottom-right") {
          logoX = width - logoW - padding;
        } else if (brandBand.position === "center") {
          logoX = Math.round((width - logoW) / 2);
        } else {
          logoX = padding;
        }

        const logoY = brandingBandEntry.y + padding;

        composites.push({ input: resizedLogo, left: logoX, top: logoY });
      }
    } catch {
      // Logo fetch failed — skip silently
    }
  }

  // "Link in bio" subtle text in bottom-right corner
  if (options.showLinkInBio) {
    const libText = "Link in bio";
    const libFontSize = 24;
    const libPadding = 24;
    // Use scheme-aware color at very low opacity
    const libColor = bgLum > 0.5 ? "rgba(0,0,0,0.30)" : "rgba(255,255,255,0.30)";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const libElement: any = {
      type: "div",
      props: {
        style: {
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-end",
          width,
          height,
          paddingRight: libPadding,
          paddingBottom: libPadding,
          color: libColor,
          fontSize: libFontSize,
          fontFamily: "Noto Sans",
          fontWeight: 400,
          letterSpacing: 0.5,
        },
        children: libText,
      },
    };

    const libSvg = await satori(libElement, { width, height, fonts });
    const libOverlay = await sharp(Buffer.from(libSvg)).png().toBuffer();
    composites.push({ input: libOverlay, left: 0, top: 0 });
  }

  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: bgRgb,
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  return { buffer, colorScheme: scheme, charBudgets };
}

// ---------------------------------------------------------------------------
// Utility: hex color parsing
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
