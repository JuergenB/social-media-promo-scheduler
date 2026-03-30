import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { MediaItem } from "@/lib/media-items";

const CAPTION_BAR_HEIGHT = 48;
const CAPTION_FONT_SIZE = 16;
const CAPTION_PADDING = 16;

/**
 * Assemble multiple images into a PDF document for LinkedIn carousel posts.
 *
 * Each image becomes one full-bleed page. If a caption is provided,
 * a dark gradient bar with white text is rendered at the bottom of the page.
 *
 * Accepts either:
 *   - MediaItem[] (with captions)
 *   - string[] (URLs only, backward compatible)
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
    const pageHeight = item.caption
      ? image.height + CAPTION_BAR_HEIGHT
      : image.height;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Draw image (positioned at top when caption present, full page when not)
    page.drawImage(image, {
      x: 0,
      y: item.caption ? CAPTION_BAR_HEIGHT : 0,
      width: image.width,
      height: image.height,
    });

    // Draw caption bar at bottom
    if (item.caption) {
      // Dark background bar
      page.drawRectangle({
        x: 0,
        y: 0,
        width: pageWidth,
        height: CAPTION_BAR_HEIGHT,
        color: rgb(0.12, 0.12, 0.12),
      });

      // Truncate caption to fit width
      const maxWidth = pageWidth - CAPTION_PADDING * 2;
      let displayText = item.caption;
      const textFont = displayText.length > 60 ? font : fontBold;
      const fontSize = displayText.length > 80 ? CAPTION_FONT_SIZE - 2 : CAPTION_FONT_SIZE;

      while (textFont.widthOfTextAtSize(displayText, fontSize) > maxWidth && displayText.length > 3) {
        displayText = displayText.slice(0, -4) + "...";
      }

      const textWidth = textFont.widthOfTextAtSize(displayText, fontSize);
      const textX = (pageWidth - textWidth) / 2; // center
      const textY = (CAPTION_BAR_HEIGHT - fontSize) / 2;

      page.drawText(displayText, {
        x: textX,
        y: textY,
        size: fontSize,
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
