/**
 * Firecrawl client — web scraping for campaign content extraction
 *
 * Extracts title, description, images, and main content from blog posts
 * and other content URLs for the post generation pipeline.
 *
 * Strategy: Use markdown scrape (1 credit) with excludeTags to strip
 * non-content elements. onlyMainContent is set to false because it
 * silently disables excludeTags. Same-domain image filtering in code
 * catches anything that leaks through.
 *
 * API docs: https://docs.firecrawl.dev/introduction
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not configured");
  return key;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface ScrapedImage {
  url: string;
  alt: string;
  /** Caption extracted from <figcaption>, adjacent text, or similar HTML patterns.
   *  More specific than alt text — e.g., artwork title vs. generic article description.
   *  Preferred over `alt` for display labels and image catalog descriptions. */
  caption?: string;
  /** Anchor fragment for newsletters (e.g., "VSObpak" from Curated.co) */
  anchor?: string;
  /** Story title associated with this image (for newsletters) */
  storyTitle?: string;
}

export interface ContentSection {
  /** Heading text (e.g., "David Held") */
  heading: string;
  /** Heading level (2 for H2, 3 for H3) */
  level: 2 | 3;
  /** Markdown content for this section (excluding the heading itself) */
  content: string;
  /** Images that appear within this section's boundaries */
  images: ScrapedImage[];
  /** True for content that appears before the first heading */
  isPreamble?: boolean;
}

export interface ScrapedBlogData {
  title: string;
  description: string;
  content: string;
  images: ScrapedImage[];
  /** Structured sections parsed from H2/H3 headings — only present for multi-section posts */
  sections: ContentSection[];
  /** Post-level hero image (og:image or first image before any heading) */
  heroImage: ScrapedImage | null;
  ogImage: string | null;
  author: string | null;
  publishDate: string | null;
  url: string;
}

// ── Image filtering ───────────────────────────────────────────────────

/** Check if an image URL/alt represents a non-content element (nav, UI, decorative) */
function isNonContentImage(url: string, alt: string): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerAlt = alt.toLowerCase();

  // Detect thumbnail dimensions in URL paths (e.g., /50x50/, _50x50., -50x50/)
  // Reject images where both dimensions are below the minimum usable size
  if (isThumbnailByUrl(lowerUrl)) return true;

  return (
    // Tiny UI elements
    lowerUrl.includes("favicon") ||
    lowerUrl.includes("pixel") ||
    lowerUrl.includes("tracking") ||
    lowerUrl.includes("1x1") ||
    lowerUrl.endsWith(".svg") ||
    lowerUrl.endsWith(".gif") ||
    // Specific small UI images (Curated.co permalink icons, etc.)
    lowerUrl.includes("permalink.png") ||
    lowerUrl.includes("spacer") ||
    lowerUrl.includes("blank.") ||
    // Branding/navigation
    lowerUrl.includes("logo") ||
    lowerUrl.includes("avatar") ||
    lowerUrl.includes("gravatar") ||
    lowerUrl.includes("profile-pic") ||
    // Widgets and ads
    lowerUrl.includes("widget") ||
    lowerUrl.includes("banner-ad") ||
    lowerUrl.includes("sponsor") ||
    lowerUrl.includes("convertbox") ||
    // Social share buttons
    lowerUrl.includes("/share") ||
    lowerUrl.includes("social-icon") ||
    // Navigation / chrome elements
    lowerUrl.includes("/icons/") ||
    lowerUrl.includes("/ui/") ||
    lowerUrl.includes("/nav/") ||
    lowerUrl.includes("/buttons/") ||
    lowerUrl.includes("/assets/icons/") ||
    // Alt text signals for non-content images
    lowerAlt === "logo" ||
    lowerAlt === "icon" ||
    lowerAlt === "avatar" ||
    lowerAlt === "arrow" ||
    lowerAlt === "chevron" ||
    lowerAlt === "menu" ||
    lowerAlt === "close" ||
    lowerAlt === "search" ||
    lowerAlt === "hamburger" ||
    lowerAlt.includes("navigation") ||
    lowerAlt.includes("nav icon") ||
    lowerAlt.includes("button")
  );
}

const MIN_IMAGE_DIMENSION = 200;

/**
 * Detect thumbnail-sized images from URL dimension patterns.
 * Matches common CDN/CMS patterns: /50x50/, _100x100., -75x75/, stencil/50x50/
 * Returns true if BOTH dimensions are below the minimum usable size for social media.
 */
function isThumbnailByUrl(lowerUrl: string): boolean {
  // Match NxN dimension patterns in URL paths (various separators)
  // Patterns: /50x50/ | _50x50. | -50x50/ | /50x50_ | stencil/50x50/
  const dimensionPatterns = [
    /[/_\-.](\d{1,4})x(\d{1,4})[/_\-.]/,  // General: separator + WxH + separator
    /\/(\d{1,4})x(\d{1,4})\//,              // Path segment: /WxH/
    /[/_\-](\d{1,4})x(\d{1,4})\.[a-z]+$/,  // Before extension: _WxH.jpg
    /\/thumb[s]?\/(\d{1,4})x(\d{1,4})/,     // /thumbs/WxH or /thumb/WxH
    /[?&]w(?:idth)?=(\d{1,4})&h(?:eight)?=(\d{1,4})/,  // Query params: ?w=50&h=50
    /[?&](?:size|s)=(\d{1,4})x(\d{1,4})/,  // ?size=50x50
  ];

  for (const pattern of dimensionPatterns) {
    const match = lowerUrl.match(pattern);
    if (match) {
      const w = parseInt(match[1], 10);
      const h = parseInt(match[2], 10);
      if (w > 0 && h > 0 && w < MIN_IMAGE_DIMENSION && h < MIN_IMAGE_DIMENSION) {
        return true;
      }
    }
  }

  // Also catch single-dimension thumbnail indicators
  const singleDimPatterns = [
    /\/thumb[s]?\//,                         // /thumb/ or /thumbs/ directory
    /[/_\-]thumb[._]/,                       // _thumb. or -thumb_
    /[/_\-]small[._]/,                       // _small. or -small_
    /[/_\-]tiny[._]/,                        // _tiny. or -tiny_
    /\/mini\//,                              // /mini/ directory
  ];

  for (const pattern of singleDimPatterns) {
    if (pattern.test(lowerUrl)) return true;
  }

  return false;
}

/**
 * Normalize a URL for dedup by stripping dimension segments from the path.
 * This ensures the same image at different sizes (e.g., /500x659/ vs /50x50/)
 * is recognized as the same image regardless of CDN or CMS platform.
 */
function normalizeImageUrlForDedup(url: string): string {
  // Strip query params
  let normalized = url.split("?")[0];
  // Strip dimension segments from path: /123x456/ → /*/
  normalized = normalized.replace(/\/\d{1,4}x\d{1,4}\//g, "/*/");
  // Strip dimension suffixes: _123x456. or -123x456.
  normalized = normalized.replace(/[_-]\d{1,4}x\d{1,4}(?=\.[a-z]+$)/i, "");
  return normalized;
}

/** Extract images from a markdown string, filtering out non-content elements.
 *  Captures trailing text after `![alt](url)` as a markdown-derived caption.
 *  Firecrawl renders <figcaption> content as text immediately after the image
 *  (e.g., `![alt](url)'Jennifer'`). We capture this regardless of quoting style. */
function extractImagesFromMarkdown(markdown: string): ScrapedImage[] {
  // Capture: group 1 = alt, group 2 = url, group 3 = optional trailing caption text
  // Trailing caption: text on the same line after ), excluding markdown headings/links
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)([^\n#!\[]*)?/g;
  const allImages: ScrapedImage[] = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const fullUrl = match[2];
    const alt = match[1] || "";
    if (isNonContentImage(fullUrl, alt)) continue;
    // Clean trailing caption: strip surrounding quotes (single, double, smart quotes)
    const rawCaption = (match[3] || "").trim();
    const caption = rawCaption
      ? rawCaption.replace(/^[''""'"`\u2018\u2019\u201C\u201D]+|[''""'"`\u2018\u2019\u201C\u201D]+$/g, "").trim()
      : undefined;
    allImages.push({ url: fullUrl, alt, ...(caption ? { caption } : {}) });
  }

  // Deduplicate by normalized URL (collapses dimension variants into one entry).
  // When duplicates exist, prefer the largest image (longest URL path often = bigger).
  const seen = new Map<string, ScrapedImage>();
  for (const img of allImages) {
    const key = normalizeImageUrlForDedup(img.url);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, img);
    } else {
      // Keep the one with larger dimensions in URL, or the first one found
      const existingDims = extractDimensionsFromUrl(existing.url);
      const newDims = extractDimensionsFromUrl(img.url);
      if (newDims && (!existingDims || newDims.w * newDims.h > existingDims.w * existingDims.h)) {
        seen.set(key, img);
      }
    }
  }
  return [...seen.values()];
}

/** Extract captions from HTML by parsing <figure>/<figcaption> and similar patterns.
 *  Returns a Map of image URL → caption text. Matches by URL basename to handle
 *  srcset/responsive variants. Also handles non-figure captions (wp-caption, etc.). */
function extractCaptionsFromHtml(html: string): Map<string, string> {
  const captions = new Map<string, string>();
  if (!html) return captions;

  // Pattern 1: <figure> containing <img> and <figcaption>
  const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
  let figMatch;
  while ((figMatch = figureRegex.exec(html)) !== null) {
    const figureHtml = figMatch[1];
    // Extract image src(s) from within the figure
    const imgSrcRegex = /src="([^"]+)"/g;
    let srcMatch;
    const urls: string[] = [];
    while ((srcMatch = imgSrcRegex.exec(figureHtml)) !== null) {
      urls.push(srcMatch[1]);
    }
    // Extract figcaption text (strip HTML tags within it)
    const captionMatch = figureHtml.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
    if (captionMatch) {
      const captionText = captionMatch[1]
        .replace(/<[^>]+>/g, "") // strip nested HTML tags
        .replace(/&#?\w+;/g, (m) => { // decode common HTML entities
          const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
          return entities[m] || m;
        })
        .replace(/\s+/g, " ") // normalize whitespace (multi-line figcaptions)
        .replace(/^[''""'"`\u2018\u2019\u201C\u201D]+|[''""'"`\u2018\u2019\u201C\u201D]+$/g, "") // strip surrounding quotes (ASCII + smart quotes)
        .trim();
      if (captionText) {
        for (const url of urls) {
          captions.set(url, captionText);
        }
      }
    }
  }

  // Pattern 2: WordPress wp-caption / gallery-caption divs
  const wpCaptionRegex = /<div[^>]*class="[^"]*wp-caption[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let wpMatch;
  while ((wpMatch = wpCaptionRegex.exec(html)) !== null) {
    const block = wpMatch[1];
    const imgSrc = block.match(/src="([^"]+)"/);
    const captionP = block.match(/<p[^>]*class="[^"]*wp-caption-text[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (imgSrc && captionP) {
      const text = captionP[1].replace(/<[^>]+>/g, "").trim();
      if (text && !captions.has(imgSrc[1])) {
        captions.set(imgSrc[1], text);
      }
    }
  }

  return captions;
}

/** Enrich ScrapedImage array with captions from HTML figcaption extraction.
 *  Matches by URL basename to handle responsive/srcset variants. */
function enrichImagesWithHtmlCaptions(images: ScrapedImage[], htmlCaptions: Map<string, string>): void {
  if (htmlCaptions.size === 0) return;

  // Build a lookup by basename for fuzzy matching (responsive images have different dimensions)
  const basenameLookup = new Map<string, string>();
  for (const [url, caption] of htmlCaptions) {
    // Extract basename: last path segment without query string
    const basename = url.split("/").pop()?.split("?")[0] || "";
    // Also store without dimension suffixes for matching across srcset variants
    const normalized = basename.replace(/[_-]\d{1,4}x\d{1,4}(?=\.[a-z]+$)/i, "");
    basenameLookup.set(basename, caption);
    if (normalized !== basename) basenameLookup.set(normalized, caption);
    // Store full URL too for exact matches
    basenameLookup.set(url, caption);
  }

  for (const img of images) {
    if (img.caption) continue; // markdown-derived caption already set, but HTML takes priority below

    const imgBasename = img.url.split("/").pop()?.split("?")[0] || "";
    const imgNormalized = imgBasename.replace(/[_-]\d{1,4}x\d{1,4}(?=\.[a-z]+$)/i, "");

    // Try exact URL, then basename, then normalized basename
    const caption = basenameLookup.get(img.url)
      || basenameLookup.get(imgBasename)
      || basenameLookup.get(imgNormalized);

    if (caption) {
      img.caption = caption;
    }
  }
}

/** Extract width x height from a URL if dimension pattern is present */
function extractDimensionsFromUrl(url: string): { w: number; h: number } | null {
  const match = url.match(/[/_\-.](\d{1,4})x(\d{1,4})[/_\-.]/);
  if (!match) return null;
  return { w: parseInt(match[1], 10), h: parseInt(match[2], 10) };
}

// ── Section parsing ───────────────────────────────────────────────────

/**
 * Parse markdown into semantic sections delimited by H2/H3 headings.
 *
 * For multi-artist blog posts (e.g., Not Real Art), this ensures each
 * artist's images stay bound to their section. The key rules:
 *
 * 1. Split at H2 boundaries (H3 creates sub-sections within an H2)
 * 2. Content before the first heading is the preamble (hero/intro)
 * 3. Images between headings belong to that section
 * 4. If an image appears 1-2 lines before a heading, associate it with
 *    the section below (common blog pattern: image above its heading)
 */
export function parseSections(markdown: string): ContentSection[] {
  const lines = markdown.split("\n");
  const sections: ContentSection[] = [];

  let currentHeading = "";
  let currentLevel: 2 | 3 = 2;
  let currentLines: string[] = [];
  let isPreamble = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2Match = line.match(/^## (.+)$/);
    const h3Match = !h2Match ? line.match(/^### (.+)$/) : null;

    // Merge H3 sub-headings into the current H2 section when they appear
    // within the first few lines (common CMS pattern: H2=title, H3=location/subtitle)
    if (h3Match && !isPreamble && currentLines.length <= 2) {
      // Treat as content within the current section, not a new section
      currentLines.push(line);
      continue;
    }

    if (h2Match || h3Match) {
      // Flush previous section
      const sectionContent = currentLines.join("\n").trim();
      if (isPreamble) {
        // Check if the last 1-2 lines before this heading are images
        // If so, move them to the upcoming section (look-ahead rule)
        const { content: preambleContent, movedImages } = extractTrailingImages(currentLines);
        if (preambleContent || movedImages.length > 0) {
          sections.push({
            heading: "",
            level: 2,
            content: preambleContent,
            images: extractImagesFromMarkdown(preambleContent),
            isPreamble: true,
          });
        }
        // Start the new section with any moved image lines
        currentLines = movedImages;
      } else if (sectionContent || currentLines.length > 0) {
        // Check for trailing images that belong to the next section
        const { content: secContent, movedImages } = extractTrailingImages(currentLines);
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: secContent,
          images: extractImagesFromMarkdown(secContent),
        });
        currentLines = movedImages;
      }

      currentHeading = (h2Match ? h2Match[1] : h3Match![1]).trim();
      currentLevel = h2Match ? 2 : 3;
      isPreamble = false;
    } else {
      currentLines.push(line);
    }
  }

  // Flush final section
  const finalContent = currentLines.join("\n").trim();
  if (isPreamble && finalContent) {
    // Entire document has no headings — single section
    sections.push({
      heading: "",
      level: 2,
      content: finalContent,
      images: extractImagesFromMarkdown(finalContent),
      isPreamble: true,
    });
  } else if (!isPreamble && (finalContent || currentLines.length > 0)) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: finalContent,
      images: extractImagesFromMarkdown(finalContent),
    });
  }

  return sections;
}

/**
 * Check if the last 1-2 lines of a section are image-only lines.
 * If so, separate them — they likely belong to the next section
 * (common pattern: image placed just above its heading).
 */
function extractTrailingImages(lines: string[]): {
  content: string;
  movedImages: string[];
} {
  const imageLineRegex = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  const movedImages: string[] = [];
  let idx = lines.length - 1;

  // Walk backwards through trailing blank lines
  while (idx >= 0 && lines[idx].trim() === "") idx--;

  // Check up to 2 trailing image lines
  let imagesFound = 0;
  while (idx >= 0 && imagesFound < 2) {
    if (imageLineRegex.test(lines[idx])) {
      movedImages.unshift(lines[idx]);
      idx--;
      imagesFound++;
    } else {
      break;
    }
    // Skip blank lines between images
    while (idx >= 0 && lines[idx].trim() === "") idx--;
  }

  if (movedImages.length === 0) {
    return { content: lines.join("\n").trim(), movedImages: [] };
  }

  // Content is everything up to (but not including) the moved images
  const contentLines = lines.slice(0, idx + 1);
  return { content: contentLines.join("\n").trim(), movedImages };
}

// ── Scraping ───────────────────────────────────────────────────────────

/**
 * Scrape a blog post URL and extract structured content + article images only.
 *
 * Uses onlyMainContent: false + excludeTags to get precise content control.
 * Same-domain image filtering ensures only images hosted on the blog's domain
 * (or its CDN) are included — strips external popup/widget images.
 */
export async function scrapeBlogPost(url: string): Promise<ScrapedBlogData> {
  const apiKey = getApiKey();

  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "html"],
      // onlyMainContent: false because it silently disables excludeTags
      onlyMainContent: false,
      // Strip known non-content elements (works across CMS platforms)
      excludeTags: [
        "nav", "footer", "header",
        ".sidebar", ".widget", ".ad", ".popup",
        ".convertbox", ".cb-widget", ".cb-overlay",
        ".share-buttons", ".social-share", ".related-posts",
        ".comments", "#comments",
        "script", "style", "iframe",
        // Related/recommended content sections (Ghost, WordPress, etc.)
        ".recommended", ".read-next",
        ".post-feed", ".post-card", ".gh-post-feed",
        ".more-posts", ".further-reading", ".you-might-also-like",
        "aside",
      ],
      waitFor: 3000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl scrape failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const page = data?.data;

  if (!page) {
    throw new Error("Firecrawl returned no data");
  }

  const metadata = page.metadata || {};
  const markdown = page.markdown || "";
  const html = page.html || "";

  // ── Image extraction using shared utility ──────────────────────────
  const images = extractImagesFromMarkdown(markdown);

  // Enrich with HTML-based figcaptions (authoritative, overrides markdown-derived captions)
  const htmlCaptions = extractCaptionsFromHtml(html);
  enrichImagesWithHtmlCaptions(images, htmlCaptions);

  // Add og:image as featured image if not already in the list
  const ogImage = metadata.ogImage || metadata["og:image"] || null;
  if (ogImage && !images.some((img) => img.url.split("?")[0] === ogImage.split("?")[0])) {
    images.unshift({ url: ogImage, alt: metadata.ogTitle || metadata.title || "" });
  }

  // ── Parse into semantic sections ───────────────────────────────────
  // For multi-artist posts, increase content limit so sections aren't truncated
  const sections = parseSections(markdown);
  // Enrich section images with HTML captions too
  for (const section of sections) {
    enrichImagesWithHtmlCaptions(section.images, htmlCaptions);
  }
  const isMultiSection = sections.filter((s) => !s.isPreamble).length > 1;

  // Increase limit for multi-section posts so each section gets representation
  const contentLimit = isMultiSection ? 8000 : 4000;
  const truncatedContent = markdown.length > contentLimit
    ? markdown.slice(0, contentLimit) + "\n\n[Content truncated for generation...]"
    : markdown;

  // Hero image: first image from preamble, or og:image, or first image overall
  const preamble = sections.find((s) => s.isPreamble);
  const heroImage = preamble?.images[0]
    || (ogImage ? { url: ogImage, alt: metadata.ogTitle || metadata.title || "" } : null)
    || images[0] || null;

  return {
    title: metadata.title || metadata.ogTitle || metadata["og:title"] || "",
    description: metadata.description || metadata.ogDescription || metadata["og:description"] || "",
    content: truncatedContent,
    images,
    sections,
    heroImage,
    ogImage,
    author: metadata.author || null,
    publishDate: metadata.publishedTime || metadata.articlePublishedTime || null,
    url,
  };
}

/**
 * Scrape a Curated.co newsletter and extract stories with anchor links.
 *
 * Each story in a Curated.co newsletter has:
 *   <a name="ANCHOR"></a>
 *   <a href="..."><img src="STORY_IMAGE" ...></a>
 *   <h3>STORY_TITLE</h3>
 *
 * This extracts images with their story anchors so short links
 * can point to the specific story: newsletter-url#ANCHOR
 */
/**
 * Scrape an event/open call URL using Firecrawl JSON extraction.
 *
 * Attempts structured extraction (title, dates, venue, eligibility, etc.)
 * with a markdown fallback. Returns ScrapedBlogData with event-specific
 * structured data stored in the `eventData` field.
 */
export interface ScrapedEventData {
  title: string | null;
  organization: string | null;
  description: string | null;
  eventDate: string | null;
  eventTime: string | null;
  endDate: string | null;
  venue: string | null;
  location: string | null;
  ticketUrl: string | null;
  price: string | null;
  theme: string | null;
  eligibility: string | null;
  submissionDeadline: string | null;
  submissionUrl: string | null;
}

export interface ScrapedEventBlogData extends ScrapedBlogData {
  eventData: ScrapedEventData | null;
}

export async function scrapeEvent(url: string): Promise<ScrapedEventBlogData> {
  const apiKey = getApiKey();

  // Try JSON extraction first (5 credits)
  let eventData: ScrapedEventData | null = null;
  try {
    const jsonRes = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["json", "markdown"],
        jsonOptions: {
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              organization: { type: "string" },
              description: { type: "string" },
              eventDate: { type: "string" },
              eventTime: { type: "string" },
              endDate: { type: "string" },
              venue: { type: "string" },
              location: { type: "string" },
              ticketUrl: { type: "string" },
              price: { type: "string" },
              theme: { type: "string" },
              eligibility: { type: "string" },
              submissionDeadline: { type: "string" },
              submissionUrl: { type: "string" },
            },
          },
          prompt: "Extract event details: title, hosting organization, description, event date, event time, end date, venue name, full location/address, ticket or RSVP URL, price/cost, theme, eligibility requirements, submission deadline, and submission URL.",
        },
        onlyMainContent: false,
        excludeTags: [
          "nav", "footer", "header",
          ".sidebar", ".widget", ".ad", ".popup",
          "script", "style", "iframe",
          // Related/recommended content sections (Ghost, WordPress, etc.)
          ".related-posts", ".recommended", ".read-next",
          ".post-feed", ".post-card", ".gh-post-feed",
          ".more-posts", ".further-reading", ".you-might-also-like",
          "aside",
        ],
        waitFor: 3000,
      }),
    });

    if (jsonRes.ok) {
      const jsonData = await jsonRes.json();
      const extracted = jsonData?.data?.json;
      if (extracted && typeof extracted === "object") {
        eventData = extracted as ScrapedEventData;
      }

      // Also get the markdown + metadata from the same response
      const page = jsonData?.data;
      if (page?.markdown) {
        const metadata = page.metadata || {};
        const markdown = page.markdown || "";
        const images = extractImagesFromMarkdown(markdown);
        const ogImage = metadata.ogImage || metadata["og:image"] || null;

        if (ogImage && !images.some((img) => img.url.split("?")[0] === ogImage.split("?")[0])) {
          images.unshift({ url: ogImage, alt: metadata.ogTitle || metadata.title || "" });
        }

        const truncatedContent = markdown.length > 6000
          ? markdown.slice(0, 6000) + "\n\n[Content truncated for generation...]"
          : markdown;

        const heroImage = ogImage
          ? { url: ogImage, alt: metadata.ogTitle || metadata.title || "" }
          : images[0] || null;

        // Parse sections from event markdown (enables section-aware image matching)
        const sections = parseSections(markdown);

        return {
          title: eventData?.title || metadata.title || metadata.ogTitle || "",
          description: eventData?.description || metadata.description || "",
          content: truncatedContent,
          images,
          sections,
          heroImage,
          ogImage,
          author: null,
          publishDate: null,
          url,
          eventData,
        };
      }
    }
  } catch (err) {
    console.warn("[scrapeEvent] JSON extraction failed, falling back to markdown:", err);
  }

  // Fallback: plain markdown scrape (1 credit)
  const blogData = await scrapeBlogPost(url);
  return { ...blogData, eventData };
}

// ── Exhibition scraper ─────────────────────────────────────────────────

export interface ScrapedArtwork {
  artistName: string;
  artworkTitle: string;
  medium: string | null;
  thumbnailUrl: string;
  detailLink: string | null;
  highResImageUrl: string | null;
  artworkDescription: string | null; // Artist's note about this specific piece
  additionalImages: string[];        // Extra images from the detail page
}

export interface ScrapedArtistProfile {
  name: string;
  bio: string | null;
  headshot: string | null;
  website: string | null;
  instagram: string | null;
}

export interface ScrapedExhibitionData {
  title: string | null;
  curator: string | null;
  description: string | null;
  dates: string | null;
  venue: string | null;
  artworks: ScrapedArtwork[];
  artistProfiles: ScrapedArtistProfile[];
}

export interface ScrapedExhibitionBlogData extends ScrapedBlogData {
  exhibitionData: ScrapedExhibitionData | null;
}

/**
 * Detect an Artwork Archive embed URL from a page's HTML.
 *
 * Looks for the embed_js.js script pattern used on WordPress/Ghost pages:
 *   s.src = "https://www.artworkarchive.com/profile/{org}/embed_js.js"
 *
 * Returns the direct exhibition embed URL if found, null otherwise.
 */
function detectAaEmbedUrl(html: string): string | null {
  // Pattern 1: embed_js.js script src
  // AA embeds use either:
  //   .../profile/{org}/embed_js.js  (profile-level)
  //   .../profile/{org}/exhibition/{slug}/embed_js.js  (exhibition-level)
  const scriptMatch = html.match(
    /artworkarchive\.com\/profile\/([^/"]+)\/(?:exhibition\/([^/"]+)\/)?embed_js\.js/i
  );
  if (scriptMatch) {
    const org = scriptMatch[1];
    const exhibSlug = scriptMatch[2]; // May be undefined for profile-level embeds

    if (exhibSlug) {
      // Exhibition-specific embed script — use the slug directly
      return `https://www.artworkarchive.com/profile/${org}/embed/exhibition/${exhibSlug}`;
    }

    // Profile-level embed — look for exhibition slug elsewhere on the page
    const exhibMatch = html.match(
      /artworkarchive\.com\/profile\/[^/"]+\/embed\/exhibition\/([^/"?#]+)/i
    );
    if (exhibMatch) {
      return `https://www.artworkarchive.com/profile/${org}/embed/exhibition/${exhibMatch[1]}`;
    }
    // Fallback: just the profile embed (will contain all public exhibitions)
    return `https://www.artworkarchive.com/profile/${org}`;
  }

  // Pattern 2: direct embed URL in href or src
  const directMatch = html.match(
    /https?:\/\/(?:www\.)?artworkarchive\.com\/profile\/([^/"]+)\/embed\/exhibition\/([^/"?#\s]+)/i
  );
  if (directMatch) {
    return `https://www.artworkarchive.com/profile/${directMatch[1]}/embed/exhibition/${directMatch[2]}`;
  }

  // Pattern 3: non-embed exhibition URL (public page)
  const publicMatch = html.match(
    /https?:\/\/(?:www\.)?artworkarchive\.com\/profile\/([^/"]+)\/exhibition\/([^/"?#\s]+)/i
  );
  if (publicMatch) {
    return `https://www.artworkarchive.com/profile/${publicMatch[1]}/embed/exhibition/${publicMatch[2]}`;
  }

  return null;
}

/**
 * Run promises with controlled concurrency.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext())
  );
  return results;
}

/**
 * Shallow crawl: enrich exhibition data with artwork detail pages and optionally artist profiles.
 * Uses markdown-only scrapes (1 credit each) to keep costs low.
 * Concurrency capped at 5 to respect Firecrawl rate limits.
 *
 * Default: artwork-focused (detail pages only, ~20 credits for 20 artworks).
 * Set includeArtistProfiles=true for artist bios, headshots, website/Instagram links.
 */
async function enrichExhibitionData(
  exhibitionData: ScrapedExhibitionData,
  embedUrl: string,
  apiKey: string,
  includeArtistProfiles = false,
): Promise<void> {
  const MAX_PAGES = 25;
  const CONCURRENCY = 5;

  // ── 1. Optionally scrape artist profile pages ───────────────
  if (includeArtistProfiles) {
  // Build unique artist slugs from the embed URL pattern
  const artistSlugs = new Map<string, string>(); // name → slug
  for (const artwork of exhibitionData.artworks) {
    if (artistSlugs.has(artwork.artistName)) continue;
    // Derive slug from artist name (AA uses lowercase-hyphenated)
    const slug = artwork.artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    artistSlugs.set(artwork.artistName, slug);
  }

  // Build the base URL for artist pages: embed URL + /pieces?artist=slug
  const baseUrl = embedUrl.replace(/\/$/, "");

  const artistTasks = [...artistSlugs.entries()].slice(0, MAX_PAGES).map(
    ([artistName, slug]) => async (): Promise<ScrapedArtistProfile | null> => {
      try {
        const url = `${baseUrl}/pieces?artist=${slug}`;
        console.log(`[scrapeExhibition] Enriching artist: ${artistName}`);
        const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            waitFor: 3000,
          }),
        });

        if (!res.ok) return null;
        const data = await res.json();
        const md = data?.data?.markdown || "";
        const metadata = data?.data?.metadata || {};

        // Parse bio: text block between the artist name heading and the artwork listings
        // AA artist pages have: heading, links, bio text, then artwork cards
        let bio: string | null = null;
        const bioMatch = md.match(/##\s+.+?\n(?:.*?\n)*?\n([\s\S]+?)(?=\n\[!\[|\nCopyright|\n---|\n$)/);
        if (bioMatch) {
          // Clean up: remove link lines and get the prose
          const rawBio = bioMatch[1]
            .split("\n")
            .filter((line: string) => !line.startsWith("[") && !line.startsWith("- [") && line.trim().length > 20)
            .join(" ")
            .trim();
          if (rawBio.length > 30) bio = rawBio;
        }

        // Parse website and Instagram from markdown links
        let website: string | null = null;
        let instagram: string | null = null;
        const websiteMatch = md.match(/\[Artist Website\]\((https?:\/\/[^)]+)\)/);
        if (websiteMatch) website = websiteMatch[1];
        const instaMatch = md.match(/\[Instagram\]\(https?:\/\/(?:www\.)?instagram\.com\/([^)"]+)/);
        if (instaMatch) instagram = instaMatch[1];

        // Headshot: look for artist image in the markdown
        let headshot: string | null = null;
        const headshotMatch = md.match(/!\[Artists? Image\]\((https?:\/\/[^)]+)\)/i);
        if (headshotMatch) headshot = headshotMatch[1];

        return { name: artistName, bio, headshot, website, instagram };
      } catch (err) {
        console.warn(`[scrapeExhibition] Failed to enrich artist ${artistName}:`, err);
        return null;
      }
    }
  );

  console.log(`[scrapeExhibition] Enriching ${artistTasks.length} artist profiles (${CONCURRENCY} concurrent)...`);
  const artistResults = await runWithConcurrency(artistTasks, CONCURRENCY);
  for (const profile of artistResults) {
    if (profile) exhibitionData.artistProfiles.push(profile);
  }
  console.log(`[scrapeExhibition] Enriched ${exhibitionData.artistProfiles.length} artist profiles`);
  } // end includeArtistProfiles

  // ── 2. Scrape artwork detail pages (always on) ──────────────
  const artworksWithLinks = exhibitionData.artworks.filter((a) => a.detailLink);
  const artworkTasks = artworksWithLinks.slice(0, MAX_PAGES).map(
    (artwork) => async (): Promise<void> => {
      try {
        console.log(`[scrapeExhibition] Enriching artwork: ${artwork.artworkTitle}`);
        const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: artwork.detailLink,
            formats: ["markdown"],
            waitFor: 3000,
          }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const md = data?.data?.markdown || "";

        // Extract high-res image URL (profile_2000 or jpg_large links in the markdown)
        const hiResMatch = md.match(/\(https:\/\/assets\.artworkarchive\.com\/image\/upload\/t_jpg_(?:profile_2000|large)\/[^)]+\)/g);
        if (hiResMatch && hiResMatch.length > 0) {
          artwork.highResImageUrl = hiResMatch[0].slice(1, -1); // Remove parens
          // Additional images beyond the first
          artwork.additionalImages = hiResMatch.slice(1).map((m: string) => m.slice(1, -1));
        }

        // Extract artwork description / artist's note
        // It appears as a quoted block near the bottom, before "— Artist Name"
        const descMatch = md.match(/\n\n"([^"]+)"\s*\n\n—\s/);
        if (descMatch) {
          artwork.artworkDescription = descMatch[1].trim();
        } else {
          // Try unquoted block: paragraph between medium line and "— Artist" attribution
          const altDescMatch = md.match(/\n\n([A-Z][^[\n]{30,})\n\n—\s/);
          if (altDescMatch) {
            artwork.artworkDescription = altDescMatch[1].trim();
          }
        }
      } catch (err) {
        console.warn(`[scrapeExhibition] Failed to enrich artwork ${artwork.artworkTitle}:`, err);
      }
    }
  );

  console.log(`[scrapeExhibition] Enriching ${artworkTasks.length} artwork detail pages (${CONCURRENCY} concurrent)...`);
  await runWithConcurrency(artworkTasks, CONCURRENCY);
  const enrichedCount = exhibitionData.artworks.filter((a) => a.highResImageUrl || a.artworkDescription).length;
  console.log(`[scrapeExhibition] Enriched ${enrichedCount} artworks with detail data`);
}

/**
 * Scrape an exhibition page with Artwork Archive embed auto-detection.
 *
 * Flow:
 * 1. Scrape the gallery page HTML (WordPress, Ghost, etc.) — do NOT exclude scripts
 * 2. Detect AA embed URL from the HTML
 * 3. If found: scrape AA embed with Firecrawl JSON extraction (artwork schema)
 * 4. Synthesize sections from artworks (one per artist)
 * 5. Fall back to blog post scraper if no AA embed detected
 */
export async function scrapeExhibition(url: string): Promise<ScrapedExhibitionBlogData> {
  const apiKey = getApiKey();

  // Step 1: Scrape the gallery page HTML to detect AA embed
  // IMPORTANT: Do NOT exclude script/iframe tags — we need to find the embed
  let aaEmbedUrl: string | null = null;

  // Check if the URL itself is already an AA URL
  if (url.includes("artworkarchive.com")) {
    aaEmbedUrl = url;
    // Ensure it's an embed URL
    if (!aaEmbedUrl.includes("/embed/")) {
      aaEmbedUrl = aaEmbedUrl.replace(/\/exhibition\//, "/embed/exhibition/");
    }
  } else {
    // Fetch the gallery page HTML to find the embed
    try {
      const htmlRes = await fetch(`${FIRECRAWL_BASE}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["html", "markdown"],
          onlyMainContent: false,
          // Do NOT exclude scripts — we need to detect the AA embed
          excludeTags: [
            "nav", "footer", "header",
            ".sidebar", ".widget", ".ad", ".popup",
            "style",
            ".related-posts", ".recommended", ".read-next",
            ".post-feed", ".post-card", ".gh-post-feed",
          ],
          waitFor: 3000,
        }),
      });

      if (htmlRes.ok) {
        const htmlData = await htmlRes.json();
        const pageHtml = htmlData?.data?.html || "";
        aaEmbedUrl = detectAaEmbedUrl(pageHtml);

        if (aaEmbedUrl) {
          console.log(`[scrapeExhibition] Auto-detected AA embed: ${aaEmbedUrl}`);
        } else {
          console.log("[scrapeExhibition] No AA embed detected, falling back to blog post scraper");
        }
      }
    } catch (err) {
      console.warn("[scrapeExhibition] HTML scrape failed for embed detection:", err);
    }
  }

  // Step 2: If we found an AA embed URL, scrape it with JSON extraction
  let exhibitionData: ScrapedExhibitionData | null = null;

  if (aaEmbedUrl) {
    try {
      const jsonRes = await fetch(`${FIRECRAWL_BASE}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: aaEmbedUrl,
          formats: ["json", "markdown"],
          jsonOptions: {
            schema: {
              type: "object",
              properties: {
                title: { type: "string", description: "Exhibition title" },
                curator: { type: "string", description: "Curator name" },
                description: { type: "string", description: "Exhibition description or curator statement" },
                dates: { type: "string", description: "Exhibition dates (opening and closing)" },
                venue: { type: "string", description: "Gallery or venue name" },
                artworks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      artist_name: { type: "string" },
                      artwork_title: { type: "string" },
                      medium: { type: "string" },
                      artwork_thumbnail_URL: { type: "string" },
                      artwork_detail_link: { type: "string" },
                    },
                  },
                },
              },
            },
            prompt: "Extract the exhibition title, curator, description, dates, venue, and all artworks. For each artwork, extract the artist name, artwork title, medium/materials, the image URL (thumbnail or full), and the detail page link.",
          },
          onlyMainContent: false,
          waitFor: 5000,
        }),
      });

      if (jsonRes.ok) {
        const jsonData = await jsonRes.json();
        const extracted = jsonData?.data?.json;

        if (extracted && typeof extracted === "object") {
          const rawArtworks = Array.isArray(extracted.artworks) ? extracted.artworks : [];
          const artworks: ScrapedArtwork[] = rawArtworks
            .filter((a: Record<string, unknown>) => a.artist_name || a.artwork_title)
            .map((a: Record<string, unknown>) => ({
              artistName: String(a.artist_name || "Unknown Artist"),
              artworkTitle: String(a.artwork_title || "Untitled"),
              medium: a.medium ? String(a.medium) : null,
              thumbnailUrl: String(a.artwork_thumbnail_URL || ""),
              detailLink: a.artwork_detail_link ? String(a.artwork_detail_link) : null,
              highResImageUrl: null,
              artworkDescription: null,
              additionalImages: [],
            }));

          exhibitionData = {
            title: extracted.title ? String(extracted.title) : null,
            curator: extracted.curator ? String(extracted.curator) : null,
            description: extracted.description ? String(extracted.description) : null,
            dates: extracted.dates ? String(extracted.dates) : null,
            venue: extracted.venue ? String(extracted.venue) : null,
            artworks,
            artistProfiles: [],
          };

          console.log(`[scrapeExhibition] Extracted ${artworks.length} artworks from AA embed`);

          // ── Shallow crawl: artwork detail pages + artist profiles ──
          await enrichExhibitionData(exhibitionData, aaEmbedUrl, apiKey);

          // Build images and sections from the artworks
          const images: ScrapedImage[] = [];
          const sections: ContentSection[] = [];

          // Group artworks by artist for sections
          const artistGroups = new Map<string, ScrapedArtwork[]>();
          for (const artwork of artworks) {
            const group = artistGroups.get(artwork.artistName) || [];
            group.push(artwork);
            artistGroups.set(artwork.artistName, group);
          }

          // Build a profile lookup for enriched content
          const profileMap = new Map<string, ScrapedArtistProfile>();
          for (const p of exhibitionData.artistProfiles) {
            profileMap.set(p.name, p);
          }

          for (const [artistName, works] of artistGroups) {
            const sectionImages: ScrapedImage[] = [];
            const profile = profileMap.get(artistName);

            // Add headshot first if available
            if (profile?.headshot) {
              sectionImages.push({ url: profile.headshot, alt: `${artistName} headshot` });
              images.push({ url: profile.headshot, alt: `${artistName} headshot` });
            }

            for (const work of works) {
              // Prefer high-res image from detail page
              const imgUrl = work.highResImageUrl || work.thumbnailUrl;
              if (imgUrl) {
                const img: ScrapedImage = {
                  url: imgUrl,
                  alt: `${work.artworkTitle} by ${artistName}${work.medium ? ` — ${work.medium}` : ""}`,
                };
                images.push(img);
                sectionImages.push(img);
              }
              // Add additional images from detail page
              for (const addUrl of work.additionalImages) {
                const addImg: ScrapedImage = { url: addUrl, alt: `${work.artworkTitle} by ${artistName}` };
                images.push(addImg);
                sectionImages.push(addImg);
              }
            }

            const contentParts: string[] = [];

            // Artist bio from profile
            if (profile?.bio) {
              contentParts.push(profile.bio);
              contentParts.push("");
            }

            // Artist links
            const links: string[] = [];
            if (profile?.website) links.push(`[Website](${profile.website})`);
            if (profile?.instagram) links.push(`[Instagram](https://instagram.com/${profile.instagram.replace(/^@/, "")})`);
            if (links.length > 0) contentParts.push(links.join(" · "));

            // Artworks
            for (const w of works) {
              let line = `**${w.artworkTitle}**`;
              if (w.medium) line += ` — ${w.medium}`;
              contentParts.push(line);
              if (w.artworkDescription) {
                contentParts.push(`> ${w.artworkDescription}`);
              }
            }

            sections.push({
              heading: artistName,
              level: 2,
              content: contentParts.join("\n"),
              images: sectionImages,
            });
          }

          // Also get markdown from the response for supplemental content
          const page = jsonData?.data;
          const markdown = page?.markdown || "";
          const metadata = page?.metadata || {};
          const ogImage = metadata.ogImage || metadata["og:image"] || null;

          // Add og:image as hero if not already in artwork images
          if (ogImage && !images.some((img) => img.url.split("?")[0] === ogImage.split("?")[0])) {
            images.unshift({ url: ogImage, alt: exhibitionData.title || "" });
          }

          const heroImage = ogImage
            ? { url: ogImage, alt: exhibitionData.title || "" }
            : images[0] || null;

          // Build a rich content string from exhibition data for the prompt
          const exhibContentParts = [
            exhibitionData.title ? `# ${exhibitionData.title}` : "",
            exhibitionData.venue ? `**Venue:** ${exhibitionData.venue}` : "",
            exhibitionData.dates ? `**Dates:** ${exhibitionData.dates}` : "",
            exhibitionData.curator ? `**Curator:** ${exhibitionData.curator}` : "",
            exhibitionData.description || "",
            "",
            `## Featured Artists (${artworks.length} works)`,
          ];

          for (const [artistName, works] of artistGroups) {
            const profile = profileMap.get(artistName);
            exhibContentParts.push(`\n### ${artistName}`);
            if (profile?.bio) exhibContentParts.push(profile.bio);
            const links: string[] = [];
            if (profile?.website) links.push(`Website: ${profile.website}`);
            if (profile?.instagram) links.push(`Instagram: @${profile.instagram.replace(/^@/, "")}`);
            if (links.length > 0) exhibContentParts.push(links.join(" | "));

            for (const w of works) {
              let line = `- **${w.artworkTitle}**`;
              if (w.medium) line += ` (${w.medium})`;
              exhibContentParts.push(line);
              if (w.artworkDescription) exhibContentParts.push(`  "${w.artworkDescription}"`);
            }
          }

          const exhibContent = exhibContentParts.filter(Boolean).join("\n");

          return {
            title: exhibitionData.title || metadata.title || "",
            description: exhibitionData.description || metadata.description || "",
            content: exhibContent,
            images,
            sections,
            heroImage,
            ogImage,
            author: exhibitionData.curator,
            publishDate: null,
            url,
            exhibitionData,
          };
        }
      }
    } catch (err) {
      console.warn("[scrapeExhibition] JSON extraction from AA embed failed:", err);
    }
  }

  // Fallback: plain blog post scraper (works for non-AA exhibition pages)
  console.log("[scrapeExhibition] Falling back to blog post scraper");
  const blogData = await scrapeBlogPost(url);
  return { ...blogData, exhibitionData };
}

/**
 * Scrape a supplemental URL for additional context (lightweight).
 * Returns just the markdown content and images — no section parsing.
 */
export async function scrapeSupplemental(url: string): Promise<{ content: string; images: ScrapedImage[]; title: string }> {
  const apiKey = getApiKey();

  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      waitFor: 3000,
    }),
  });

  if (!res.ok) {
    console.warn(`[scrapeSupplemental] Failed to scrape ${url}: ${res.status}`);
    return { content: "", images: [], title: url };
  }

  const data = await res.json();
  const page = data?.data;
  const markdown = page?.markdown || "";
  const metadata = page?.metadata || {};
  const images = extractImagesFromMarkdown(markdown);

  const truncated = markdown.length > 3000
    ? markdown.slice(0, 3000) + "\n\n[Content truncated...]"
    : markdown;

  return {
    content: truncated,
    images,
    title: metadata.title || metadata.ogTitle || url,
  };
}

export async function scrapeNewsletter(url: string): Promise<ScrapedBlogData> {
  const apiKey = getApiKey();

  // Request both HTML (for anchors) and markdown (for content)
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["html", "markdown"],
      onlyMainContent: false,
      excludeTags: [
        "nav", "footer", "header",
        ".sidebar", ".widget",
        "script", "style", "iframe",
      ],
      waitFor: 3000,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl scrape failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const page = data?.data;

  if (!page) {
    throw new Error("Firecrawl returned no data");
  }

  const metadata = page.metadata || {};
  const html = page.html || "";
  const markdown = page.markdown || "";

  // ── Extract stories with anchors from Curated.co HTML ───────────
  // Pattern: <a name="ANCHOR"></a> ... <img src="IMAGE"> ... <h3><a>TITLE</a></h3>
  // The negative lookahead (?!<a\s+name=) prevents matching across story boundaries
  // (fixes cross-story bleed when a non-story item like a podcast promo has no <h3>)
  const storyRegex = /<a\s+name="([^"]+)"><\/a>\s*(?:<a[^>]*>)?\s*<img[^>]+src="([^"]+)"[^>]*>(?:(?!<a\s+name=)[\s\S])*?<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g;
  const stories: ScrapedImage[] = [];
  let storyMatch;

  while ((storyMatch = storyRegex.exec(html)) !== null) {
    const anchor = storyMatch[1];
    const imageUrl = storyMatch[2];
    const storyTitle = storyMatch[3].trim();
    const lowerUrl = imageUrl.toLowerCase();

    // Skip non-content images
    if (
      lowerUrl.includes("permalink.png") ||
      lowerUrl.includes("spacer") ||
      lowerUrl.includes("favicon") ||
      lowerUrl.endsWith(".svg") ||
      lowerUrl.endsWith(".gif")
    ) continue;

    stories.push({
      url: imageUrl,
      alt: storyTitle,
      anchor,
      storyTitle,
    });
  }

  // If HTML parsing found stories, use those; otherwise fall back to markdown extraction
  let images: ScrapedImage[];
  if (stories.length > 0) {
    // Deduplicate
    const seen = new Set<string>();
    images = [];
    for (const img of stories) {
      const key = img.url.split("?")[0];
      if (!seen.has(key)) {
        seen.add(key);
        images.push(img);
      }
    }
  } else {
    // Fallback: extract from markdown (no anchor info)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const allImages: ScrapedImage[] = [];
    let match;
    while ((match = imageRegex.exec(markdown)) !== null) {
      const fullUrl = match[2];
      const alt = match[1] || "";
      const lowerUrl = fullUrl.toLowerCase();
      if (
        lowerUrl.includes("permalink.png") ||
        lowerUrl.includes("spacer") ||
        lowerUrl.includes("favicon") ||
        lowerUrl.endsWith(".svg") ||
        lowerUrl.endsWith(".gif")
      ) continue;
      allImages.push({ url: fullUrl, alt });
    }
    const seen = new Set<string>();
    images = [];
    for (const img of allImages) {
      const key = img.url.split("?")[0];
      if (!seen.has(key)) {
        seen.add(key);
        images.push(img);
      }
    }
  }

  // Add og:image if not already present
  const ogImage = metadata.ogImage || metadata["og:image"] || null;
  if (ogImage && !images.some((img) => img.url.split("?")[0] === ogImage.split("?")[0])) {
    images.unshift({ url: ogImage, alt: metadata.ogTitle || metadata.title || "" });
  }

  // Truncate content for prompt efficiency
  const truncatedContent = markdown.length > 4000
    ? markdown.slice(0, 4000) + "\n\n[Content truncated for generation...]"
    : markdown;

  // Strip #start or other fragments from the base URL for clean anchor links
  const baseUrl = url.split("#")[0];

  // Synthesize sections from newsletter stories so the unified image catalog
  // and multi-section prompt paths work for newsletters too.
  // Each story becomes a section with heading = storyTitle + excerpt from markdown.
  // The excerpt helps Claude distinguish between thematically similar stories.
  const sections: ContentSection[] = [];
  if (stories.length > 0) {
    for (const story of stories) {
      const title = story.storyTitle || story.alt || "";
      // Extract story content from the markdown by finding text near the story title
      let storyContent = "";
      if (title && markdown) {
        const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const titleMatch = markdown.match(new RegExp(escapedTitle, "i"));
        if (titleMatch && titleMatch.index !== undefined) {
          // Grab up to 400 chars after the title (skip the title line itself)
          const afterTitle = markdown.slice(titleMatch.index + titleMatch[0].length);
          const nextLine = afterTitle.indexOf("\n");
          const contentStart = nextLine >= 0 ? nextLine + 1 : 0;
          const excerpt = afterTitle.slice(contentStart, contentStart + 400).trim();
          // Trim at the last complete sentence or paragraph break
          const sentenceEnd = excerpt.search(/[.!?]\s|\n\n/);
          storyContent = sentenceEnd > 50 ? excerpt.slice(0, sentenceEnd + 1).trim() : excerpt.split("\n")[0].trim();
        }
      }
      sections.push({
        heading: title,
        level: 2,
        content: storyContent,
        images: [story],
      });
    }
  }

  const heroImage = ogImage
    ? { url: ogImage, alt: metadata.ogTitle || metadata.title || "" }
    : images[0] || null;

  return {
    title: metadata.title || metadata.ogTitle || metadata["og:title"] || "",
    description: metadata.description || metadata.ogDescription || metadata["og:description"] || "",
    content: truncatedContent,
    images,
    sections,
    heroImage,
    ogImage,
    author: metadata.author || null,
    publishDate: metadata.publishedTime || metadata.articlePublishedTime || null,
    url: baseUrl,
  };
}

// ── Artist metadata extraction ──────────────────────────────────────

export interface ArtistMetadata {
  /** Detected artist name from page title/content */
  artistName: string | null;
  /** Instagram handle (without @) extracted from page links */
  instagramHandle: string | null;
  /** Content series name (e.g., "Q+Art Interview") if detected */
  seriesName: string | null;
  /** Suggested campaign label (e.g., "Q+Art Interview — Suzy González") */
  campaignLabel: string | null;
}

/**
 * Extract artist metadata from scraped content for Artist Profile campaigns.
 *
 * Detects:
 * - Artist name from the page title (patterns like "Name's ..." or "... with Name")
 * - Instagram handle from instagram.com links in the content
 * - Content series (Q+Art, interview patterns) for smarter campaign labels
 */
export function extractArtistMetadata(blogData: ScrapedBlogData): ArtistMetadata {
  const title = blogData.title || "";
  const content = blogData.content || "";

  // ── Detect content series ──
  const lowerContent = content.toLowerCase();
  const lowerTitle = title.toLowerCase();
  let seriesName: string | null = null;

  if (lowerContent.includes("q+art") || lowerTitle.includes("q+art") || lowerContent.includes("q + art")) {
    seriesName = "Q+Art Interview";
  } else if (
    lowerTitle.includes("interview") || lowerTitle.includes("conversation with") ||
    lowerTitle.includes("talking with") || lowerTitle.includes("in conversation")
  ) {
    seriesName = "Artist Interview";
  }

  // ── Extract artist name from title ──
  let artistName = extractArtistNameFromTitle(title);

  // Fallback: try og:description or first H2 section heading
  if (!artistName && blogData.sections?.length) {
    const firstNonPreamble = blogData.sections.find((s) => !s.isPreamble);
    if (firstNonPreamble?.heading) {
      // Section headings in interview articles are often the artist's name
      const heading = firstNonPreamble.heading.replace(/[*#]/g, "").trim();
      if (heading.split(/\s+/).length <= 4 && /^[A-Z]/.test(heading)) {
        artistName = heading;
      }
    }
  }

  // ── Extract Instagram handle from links ──
  let instagramHandle: string | null = null;
  // Match instagram.com/username links in markdown
  const instaMatches = content.match(/instagram\.com\/([a-zA-Z0-9_.]+)/g);
  if (instaMatches) {
    // Filter out generic brand/publication handles — prefer handles that don't
    // match common non-artist patterns. Take the last non-generic match, as
    // article-level IG links often appear after the artist content.
    const handles = instaMatches
      .map((m) => {
        const match = m.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
        return match ? match[1] : null;
      })
      .filter((h): h is string => !!h && h !== "p" && h !== "reel" && h !== "explore");

    if (handles.length === 1) {
      instagramHandle = handles[0];
    } else if (handles.length > 1) {
      // If we found the artist name, try to find a handle that resembles it
      if (artistName) {
        const nameParts = artistName.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
        const artistHandle = handles.find((h) => {
          const lh = h.toLowerCase();
          return nameParts.some((part) => part.length > 2 && lh.includes(part));
        });
        instagramHandle = artistHandle || handles[handles.length - 1];
      } else {
        // Take the last unique handle (most likely the featured artist)
        instagramHandle = handles[handles.length - 1];
      }
    }
  }

  // ── Build campaign label ──
  let campaignLabel: string | null = null;
  if (seriesName && artistName) {
    campaignLabel = `${seriesName} — ${artistName}`;
  } else if (artistName) {
    campaignLabel = `Artist Profile — ${artistName}`;
  }

  return { artistName, instagramHandle, seriesName, campaignLabel };
}

/**
 * Extract an artist name from a page title.
 *
 * Handles common title patterns:
 * - "Corn Is More Than a Crop in Suzy González's Visionary Portraits"
 * - "Interview with Jane Doe: Her Latest Exhibition"
 * - "Meet Artist John Smith"
 * - "Jane Doe on Art, Identity, and Community"
 */
function extractArtistNameFromTitle(title: string): string | null {
  // Pattern: "Name's ..." (possessive — very reliable)
  const possessiveMatch = title.match(/\b([A-Z][a-záéíóúñü]+(?:\s+[A-Z][a-záéíóúñü]+)+)'s\b/);
  if (possessiveMatch) return possessiveMatch[1];

  // Pattern: "Interview with Name" / "Conversation with Name" / "Talking with Name"
  const withMatch = title.match(/(?:interview|conversation|talking)\s+with\s+([A-Z][a-záéíóúñü]+(?:\s+[A-Z][a-záéíóúñü]+)+)/i);
  if (withMatch) return withMatch[1];

  // Pattern: "Meet [Artist] Name" or "Spotlight: Name"
  const meetMatch = title.match(/(?:meet(?:\s+artist)?|spotlight:?)\s+([A-Z][a-záéíóúñü]+(?:\s+[A-Z][a-záéíóúñü]+)+)/i);
  if (meetMatch) return meetMatch[1];

  // Pattern: "Name on Art..." / "Name: Her Latest..." (name at start, followed by context)
  const nameColonMatch = title.match(/^([A-Z][a-záéíóúñü]+(?:\s+[A-Z][a-záéíóúñü]+)+)\s*(?:on\b|:)/);
  if (nameColonMatch) return nameColonMatch[1];

  // Pattern: "... in Name's ..." (name embedded with possessive)
  const embeddedPossessive = title.match(/in\s+([A-Z][a-záéíóúñü]+(?:\s+[A-Z][a-záéíóúñü]+)+)'s\b/i);
  if (embeddedPossessive) return embeddedPossessive[1];

  return null;
}
