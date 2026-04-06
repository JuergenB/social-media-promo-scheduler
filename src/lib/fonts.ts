import { readFileSync } from "fs";
import { join } from "path";

/**
 * Shared font registry for Satori-based image rendering.
 *
 * All fonts are bundled as TTF files in public/fonts/.
 * Satori requires raw ArrayBuffer data — no system fonts.
 * Fonts are lazy-loaded and cached in module-level variables.
 */

export interface FontSpec {
  family: string;
  weight: number;
  style: "normal" | "italic";
}

type SatoriWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface SatoriFont {
  name: string;
  data: ArrayBuffer;
  weight: SatoriWeight;
  style: "normal" | "italic";
}

/** Map of "family-weight-style" → file path relative to public/fonts/ */
const FONT_FILES: Record<string, string> = {
  "Noto Sans-400-normal":   "NotoSans-Regular.ttf",
  "Noto Sans-600-normal":   "NotoSans-SemiBold.ttf",
  "Noto Sans-700-normal":   "NotoSans-Bold.ttf",
  "Noto Serif-400-normal":  "NotoSerif-Regular.ttf",
  "Noto Serif-400-italic":  "NotoSerif-Italic.ttf",
  "Noto Serif-700-normal":  "NotoSerif-Bold.ttf",
  "Noto Serif-700-italic":  "NotoSerif-BoldItalic.ttf",
};

/** Cached font data by key */
const fontCache = new Map<string, ArrayBuffer>();

function fontKey(family: string, weight: number, style: string): string {
  return `${family}-${weight}-${style}`;
}

function loadFontFile(filename: string): ArrayBuffer {
  const fontPath = join(process.cwd(), "public", "fonts", filename);
  const buf = readFileSync(fontPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Get a single font's ArrayBuffer data.
 * Falls back to Noto Sans Regular if the requested variant isn't found.
 */
export function getFont(
  family: string = "Noto Sans",
  weight: number = 400,
  style: "normal" | "italic" = "normal"
): ArrayBuffer {
  const key = fontKey(family, weight, style);
  const cached = fontCache.get(key);
  if (cached) return cached;

  const filename = FONT_FILES[key];
  if (!filename) {
    // Fall back: try same family normal style, then Noto Sans Regular
    const fallbackKey = fontKey(family, 400, "normal");
    const fallbackFile = FONT_FILES[fallbackKey] || FONT_FILES["Noto Sans-400-normal"];
    const data = loadFontFile(fallbackFile);
    fontCache.set(key, data);
    return data;
  }

  try {
    const data = loadFontFile(filename);
    fontCache.set(key, data);
    return data;
  } catch {
    // Last resort: Next.js compiled OG font
    try {
      const altPath = join(
        process.cwd(), "node_modules", "next", "dist", "compiled",
        "@vercel", "og", "noto-sans-v27-latin-regular.ttf"
      );
      const buf = readFileSync(altPath);
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      fontCache.set(key, data);
      return data;
    } catch {
      const empty = new ArrayBuffer(0);
      fontCache.set(key, empty);
      return empty;
    }
  }
}

/**
 * Build a Satori-compatible font array from a list of font specs.
 * Use this when calling satori() to provide all fonts a template needs.
 */
export function buildSatoriFonts(specs: FontSpec[]): SatoriFont[] {
  return specs.map((spec) => ({
    name: spec.family,
    data: getFont(spec.family, spec.weight, spec.style),
    weight: spec.weight as SatoriWeight,
    style: spec.style,
  }));
}

/**
 * Build Satori fonts for all registered font variants.
 * Useful when a template may use any combination of fonts.
 */
export function buildAllSatoriFonts(): SatoriFont[] {
  return Object.entries(FONT_FILES).map(([key, _filename]) => {
    const [family, weightStr, style] = key.split("-");
    const weight = parseInt(weightStr, 10) as SatoriWeight;
    return {
      name: family,
      data: getFont(family, weight, style as "normal" | "italic"),
      weight,
      style: style as "normal" | "italic",
    };
  });
}

/** List all available font families. */
export function availableFontFamilies(): string[] {
  const families = new Set<string>();
  for (const key of Object.keys(FONT_FILES)) {
    families.add(key.split("-")[0]);
  }
  return Array.from(families);
}
