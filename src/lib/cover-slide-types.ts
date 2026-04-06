/**
 * Cover Slide Designer — Type Definitions
 *
 * Templates are vertical stacks of horizontal bands. Each band has a type,
 * height specification, and type-specific properties (font, color, content source).
 * Templates are stored in Airtable and interpreted by the band layout renderer.
 */

// ---------------------------------------------------------------------------
// Color scheme
// ---------------------------------------------------------------------------

/** Color scheme for a template. Values can be hex strings or "auto" for image-derived. */
export interface ColorScheme {
  /** Main text color (headlines) */
  primary: string;
  /** Body text color */
  secondary: string;
  /** Accent color (labels, separators) */
  accent: string;
  /** Background color for text area */
  background: string;
}

// ---------------------------------------------------------------------------
// Font specification
// ---------------------------------------------------------------------------

export interface BandFontSpec {
  /** Font family name as registered in the font registry */
  family: string;
  /** Font weight: 400 (regular), 600 (semibold), 700 (bold) */
  weight: number;
  /** Font style */
  style?: "normal" | "italic";
  /**
   * Adaptive font size range [minPx, maxPx].
   * Renderer starts at max and steps down until text fits within maxLines.
   */
  sizeRange: [number, number];
}

// ---------------------------------------------------------------------------
// Band types
// ---------------------------------------------------------------------------

interface BandBase {
  type: string;
  /** Height: percentage string ("45%"), pixel number, or "auto" (measured from content) */
  height: string | number;
}

/** Full-bleed image window band */
export interface ImageBand extends BandBase {
  type: "image";
  /** Which content field provides the image URL */
  contentSource: "primaryImage";
  /** How the image fills the band */
  objectFit: "cover" | "contain";
  /** Vertical offset (0-100) for repositioning the visible portion */
  verticalOffset?: number;
}

/** Text block band */
export interface TextBand extends BandBase {
  type: "text";
  /** Which content field provides the text */
  contentSource: "campaignTypeLabel" | "headline" | "description" | "handle" | "custom";
  /** Custom key when contentSource is "custom" */
  customKey?: string;
  /** Font specification */
  font: BandFontSpec;
  /** Text color — hex string or template variable like "{{scheme.primary}}" */
  color: string;
  /** Horizontal text alignment */
  align: "left" | "center" | "right";
  /** Maximum number of lines before truncation */
  maxLines?: number;
  /** Text transform */
  transform?: "uppercase" | "lowercase" | "capitalize" | "none";
  /** Letter spacing in pixels */
  letterSpacing?: number;
  /** Padding in pixels */
  paddingTop?: number;
  paddingBottom?: number;
  paddingX?: number;
}

/** Horizontal separator line */
export interface SeparatorBand extends BandBase {
  type: "separator";
  /** Line color — hex or template variable */
  color: string;
  /** Width as percentage of slide width */
  widthPercent: number;
  /** Horizontal alignment of the line */
  align: "left" | "center" | "right";
  /** Vertical margin above and below the line */
  marginY?: number;
}

/** Brand logo band */
export interface BrandingBand extends BandBase {
  type: "branding";
  /** Where to place the logo within the band */
  position: "bottom-left" | "bottom-right" | "center";
  /** Which content field provides the logo */
  contentSource: "brandLogo";
  /** Logo variant selection */
  logoVariant: "light" | "dark" | "auto";
  /** Padding around the logo in pixels */
  padding: number;
}

/** Empty spacer band */
export interface SpacerBand extends BandBase {
  type: "spacer";
}

export type Band = ImageBand | TextBand | SeparatorBand | BrandingBand | SpacerBand;

// ---------------------------------------------------------------------------
// Template definition (maps to Airtable record)
// ---------------------------------------------------------------------------

export interface CoverSlideTemplate {
  id: string;
  name: string;
  slug: string;
  /** Thumbnail preview URL (Airtable attachment) */
  previewUrl: string | null;
  /** The band layout specification */
  bands: Band[];
  /** Color scheme with optional "auto" values */
  colorScheme: ColorScheme;
  /** Which font families this template uses */
  fontsUsed: string[];
  /** Brand IDs this template is restricted to (empty = global) */
  brandIds: string[];
  /** Campaign type rule IDs this template is suggested for */
  suggestedTypeIds: string[];
  /** Supported aspect ratios */
  aspectRatios: ("4:5" | "1:1")[];
  /** Whether visible in template gallery */
  active: boolean;
  /** Display order */
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Content values (passed to renderer)
// ---------------------------------------------------------------------------

/** The resolved text/image values that fill a template's bands */
export interface CoverSlideContent {
  primaryImage: string;
  campaignTypeLabel: string;
  headline: string;
  description: string;
  handle: string;
  brandLogoUrl: string | null;
  /** For custom contentSource fields */
  custom?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Render options
// ---------------------------------------------------------------------------

export interface CoverSlideRenderOptions {
  /** Template to render */
  template: CoverSlideTemplate;
  /** Content values */
  content: CoverSlideContent;
  /** Target dimensions */
  width: number;
  height: number;
  /** Override vertical offset for the image band (0-100) */
  imageOffset?: number;
  /** Override color scheme (e.g., user-picked colors) */
  colorSchemeOverrides?: Partial<ColorScheme>;
  /** Per-field font size overrides (delta from template default, e.g., +4 or -2) */
  fontSizeDeltas?: Record<string, number>;
  /** Show a subtle "Link in bio" text in the bottom-right corner */
  showLinkInBio?: boolean;
}

/** Result from the renderer */
export interface CoverSlideRenderResult {
  /** Rendered image as JPEG buffer */
  buffer: Buffer;
  /** Resolved color scheme used */
  colorScheme: ColorScheme;
  /** Character budgets derived from template (for AI content generation) */
  charBudgets: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Persisted cover slide data (stored on Post record)
// ---------------------------------------------------------------------------

export interface CoverSlideData {
  templateId: string;
  fields: {
    campaignTypeLabel: string;
    headline: string;
    description: string;
    handle: string;
    [key: string]: string;
  };
  imageOffset: number;
  /** Per-field font size deltas from template default */
  fontSizeDeltas?: Record<string, number>;
  showLinkInBio?: boolean;
  appliedUrl?: string;
}
