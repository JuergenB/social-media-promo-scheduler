import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MediaItem } from "@/lib/media-items";
import { generateText, resolveAnthropicConfig } from "@/lib/anthropic";
import type { Brand } from "@/lib/airtable/types";

/**
 * Maximum visible filename / documentTitle length before LinkedIn truncates
 * the surface (Featured tile + feed card both clip near this bound). Leaves
 * a few chars of breathing room.
 */
const TITLE_MAX = 55;

/**
 * Generate a LinkedIn document title — the headline that surfaces on the
 * feed/Featured-tile attachment. Treats the surface as a magazine cover line:
 * no brand name, no issue number, no category label, no duplication of the
 * post body. AI-generated fresh per publish so titles stay tied to the
 * current content.
 *
 * The same string powers `platforms.linkedin.documentTitle` (Zernio's wire
 * field — primary signal LinkedIn surfaces) and the PDF filename (fallback,
 * also visible if a reader downloads the file).
 */
export async function generateLinkedInDocumentTitle(args: {
  campaignDescription: string | null | undefined;
  editorialDirection: string | null | undefined;
  postContent: string | null | undefined;
  brand: Pick<Brand, "anthropicApiKeyLabel"> | null | undefined;
}): Promise<string> {
  const description = (args.campaignDescription || "").trim();
  const direction = (args.editorialDirection || "").trim();
  const postBody = (args.postContent || "").trim();

  const fallback = description.split(/[.!?\n]/)[0].trim() || "Carousel";
  const fallbackClipped = clipToMaxChars(fallback, TITLE_MAX) || "Carousel";

  if (!description && !direction && !postBody) {
    return fallbackClipped;
  }

  try {
    const config = resolveAnthropicConfig(args.brand ?? undefined);
    const system = `You write LinkedIn carousel cover titles — the headline that appears as the visible filename on the post tile.

Rules:
- 6 to 10 words, MUST be ≤${TITLE_MAX} characters total (including spaces).
- Read like a magazine cover line: punchy, specific, makes a stranger want to click.
- Title Case or sentence case — never ALL CAPS.
- ASCII letters, digits, spaces, hyphens, colons, em-dashes, commas, question marks only. NO slashes, quotes, emojis, brackets.
- NEVER include the brand name, issue/episode number, "Quick Post", "Newsletter", or any category label.
- DO NOT paraphrase or duplicate the LinkedIn post body — the post is already visible separately. The title should complement, not repeat.
- No period at the end. No surrounding quotes.

Output ONLY the title text. No explanation, no preface, no quotes.`;

    const userParts: string[] = [];
    if (description) userParts.push(`Campaign topic:\n${description}`);
    if (direction) userParts.push(`Editorial direction:\n${direction}`);
    if (postBody) userParts.push(`Visible post body (DO NOT duplicate or paraphrase):\n${postBody}`);
    userParts.push("Write ONE compelling title.");

    const raw = await generateText(system, userParts.join("\n\n"), config, {
      maxTokens: 60,
      temperature: 0.8,
    });

    const cleaned = sanitizeTitle(raw);
    if (cleaned && cleaned.length <= TITLE_MAX) return cleaned;
    if (cleaned) return clipToMaxChars(cleaned, TITLE_MAX);
    return fallbackClipped;
  } catch (err) {
    console.warn("[pdf-carousel] generateLinkedInDocumentTitle fell back:", err);
    return fallbackClipped;
  }
}

/**
 * Convert a human-readable title to a filename-safe form, preserving case
 * and word spacing. ASCII letters/digits/spaces/hyphens only, with `.pdf`.
 */
export function toPdfFilename(title: string): string {
  const base =
    sanitizeFilename(title).slice(0, TITLE_MAX).replace(/\s+$/, "").trim() ||
    "Carousel";
  return `${base}.pdf`;
}

/**
 * Bundle: produce both the LinkedIn `documentTitle` (no extension) and the
 * matching PDF filename. Use at every LinkedIn carousel publish/sync site.
 */
export async function prepareLinkedInPdfMetadata(args: {
  campaignDescription: string | null | undefined;
  editorialDirection: string | null | undefined;
  postContent: string | null | undefined;
  brand: Pick<Brand, "anthropicApiKeyLabel"> | null | undefined;
}): Promise<{ documentTitle: string; filename: string }> {
  const documentTitle = await generateLinkedInDocumentTitle(args);
  return { documentTitle, filename: toPdfFilename(documentTitle) };
}

function sanitizeTitle(raw: string): string {
  // Strip surrounding quotes, code fences, leading "Title:" prefixes, trailing periods.
  let s = raw.trim();
  s = s.replace(/^```[a-z]*\n?|```$/g, "").trim();
  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  s = s.replace(/^(?:title|headline|tagline)\s*:\s*/i, "").trim();
  s = s.replace(/\.+$/g, "").trim();
  // Collapse internal whitespace.
  s = s.replace(/\s+/g, " ");
  // Drop disallowed chars while keeping common punctuation.
  s = s.replace(/[\\\/"`~^*{}\[\]<>|=+@#$%]/g, "");
  // Normalise smart quotes / em-dashes that survived.
  s = s.replace(/[“”]/g, "").replace(/[‘’]/g, "'");
  return s.trim();
}

function sanitizeFilename(title: string): string {
  // Filename-friendly: drop punctuation that's hostile across filesystems &
  // URLs, but keep spaces and case to stay human-readable.
  return title
    .replace(/[\\\/:"*?<>|]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function clipToMaxChars(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.5) return cut.slice(0, lastSpace).replace(/[,;:\-—]+$/, "").trim();
  return cut.trim();
}

/**
 * Assemble multiple images into a PDF document for LinkedIn carousel posts.
 *
 * Each image becomes one full-bleed page. If a caption is provided,
 * a dark bar with white centered text (up to 2 lines, word-wrapped) is
 * rendered at the bottom of the page. Font size and bar height scale
 * proportionally to the image dimensions.
 */
export async function assembleCarouselPDF(
  items: MediaItem[] | string[]
): Promise<Buffer> {
  // Normalize to MediaItem[]
  const mediaItems: MediaItem[] = typeof items[0] === "string"
    ? (items as string[]).map((url) => ({ url, caption: "" }))
    : (items as MediaItem[]);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const item of mediaItems) {
    const response = await fetch(item.url);
    if (!response.ok) {
      console.warn(`[pdf-carousel] Failed to fetch image: ${item.url} (${response.status})`);
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "";

    let image;
    try {
      if (contentType.includes("png")) {
        image = await pdfDoc.embedPng(bytes);
      } else {
        image = await pdfDoc.embedJpg(bytes);
      }
    } catch (err) {
      console.warn(`[pdf-carousel] Failed to embed image: ${item.url}`, err);
      continue;
    }

    const pageWidth = image.width;

    // Pre-rendered slides from the carousel slide generator already have captions
    // baked in — use them full-bleed without adding a PDF caption bar.
    // Detects both Instagram (1080x1350) and LinkedIn (1080x1080) slide dimensions.
    const isPreRenderedSlide =
      (image.width === 1080 && image.height === 1350) ||
      (image.width === 1080 && image.height === 1080);

    if (!item.caption || isPreRenderedSlide) {
      // No caption or pre-rendered slide — full-bleed image only
      const page = pdfDoc.addPage([pageWidth, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      continue;
    }

    // --- Proportional caption sizing ---
    const fontSize = Math.round(pageWidth * 0.012);
    const clampedFontSize = Math.max(14, Math.min(fontSize, 36));
    const lineHeight = clampedFontSize * 1.35;
    const padding = Math.round(pageWidth * 0.03);
    const maxTextWidth = pageWidth - padding * 2;
    const textFont = item.caption.length > 60 ? font : fontBold;

    // Word-wrap to max 2 lines
    const lines = wordWrap(item.caption, textFont, clampedFontSize, maxTextWidth, 2);

    const barHeight = Math.round(lineHeight * lines.length + padding * 1.2);
    const pageHeight = image.height + barHeight;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Draw image at top
    page.drawImage(image, {
      x: 0,
      y: barHeight,
      width: image.width,
      height: image.height,
    });

    // Dark background bar
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: barHeight,
      color: rgb(0.12, 0.12, 0.12),
    });

    // Draw each line centered
    for (let i = 0; i < lines.length; i++) {
      const textWidth = textFont.widthOfTextAtSize(lines[i], clampedFontSize);
      const textX = (pageWidth - textWidth) / 2;
      // First line at top of bar, last line at bottom
      const textY = barHeight - padding * 0.6 - lineHeight * (i + 1) + lineHeight * 0.35;

      page.drawText(lines[i], {
        x: textX,
        y: textY,
        size: clampedFontSize,
        font: textFont,
        color: rgb(1, 1, 1),
      });
    }
  }

  if (pdfDoc.getPageCount() === 0) {
    throw new Error("No images could be embedded in the PDF");
  }

  return Buffer.from(await pdfDoc.save());
}

/**
 * Word-wrap text into up to `maxLines` lines that fit within `maxWidth`.
 * Truncates with ellipsis if the text doesn't fit in the allowed lines.
 */
function wordWrap(
  text: string,
  pdfFont: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (pdfFont.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        if (lines.length >= maxLines) break;
      }
      currentLine = word;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // If we ran out of lines but have remaining text, truncate the last line
  if (lines.length === maxLines) {
    const remainingWords = words.slice(
      words.indexOf(currentLine) !== -1 ? words.indexOf(currentLine) : words.length
    );
    // Check if there's text we didn't fit
    const allFitted = lines.join(" ").split(/\s+/).length >= words.length;
    if (!allFitted) {
      let lastLine = lines[maxLines - 1];
      // Add remaining words that fit, then ellipsis
      while (pdfFont.widthOfTextAtSize(lastLine + "…", fontSize) > maxWidth && lastLine.length > 3) {
        lastLine = lastLine.replace(/\s+\S+$/, "");
      }
      lines[maxLines - 1] = lastLine + "…";
    }
  }

  return lines.length > 0 ? lines : [text.slice(0, 20) + "…"];
}
