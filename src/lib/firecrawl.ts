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

/** Extract images from a markdown string, filtering out non-content elements */
function extractImagesFromMarkdown(markdown: string): ScrapedImage[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const allImages: ScrapedImage[] = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const fullUrl = match[2];
    const alt = match[1] || "";
    if (isNonContentImage(fullUrl, alt)) continue;
    allImages.push({ url: fullUrl, alt });
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
      formats: ["markdown"],
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

  // ── Image extraction using shared utility ──────────────────────────
  const images = extractImagesFromMarkdown(markdown);

  // Add og:image as featured image if not already in the list
  const ogImage = metadata.ogImage || metadata["og:image"] || null;
  if (ogImage && !images.some((img) => img.url.split("?")[0] === ogImage.split("?")[0])) {
    images.unshift({ url: ogImage, alt: metadata.ogTitle || metadata.title || "" });
  }

  // ── Parse into semantic sections ───────────────────────────────────
  // For multi-artist posts, increase content limit so sections aren't truncated
  const sections = parseSections(markdown);
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
  const storyRegex = /<a\s+name="([^"]+)"><\/a>\s*(?:<a[^>]*>)?\s*<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>/g;
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

  // Newsletters use story-level extraction (anchor/storyTitle on each image),
  // not heading-based sectioning. Return empty sections array.
  const heroImage = ogImage
    ? { url: ogImage, alt: metadata.ogTitle || metadata.title || "" }
    : images[0] || null;

  return {
    title: metadata.title || metadata.ogTitle || metadata["og:title"] || "",
    description: metadata.description || metadata.ogDescription || metadata["og:description"] || "",
    content: truncatedContent,
    images,
    sections: [],
    heroImage,
    ogImage,
    author: metadata.author || null,
    publishDate: metadata.publishedTime || metadata.articlePublishedTime || null,
    url: baseUrl,
  };
}
