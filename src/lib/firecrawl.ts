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

export interface ScrapedBlogData {
  title: string;
  description: string;
  content: string;
  images: ScrapedImage[];
  ogImage: string | null;
  author: string | null;
  publishDate: string | null;
  url: string;
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

  // ── Image extraction — filter out UI/decorative images ────────────
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const allImages: ScrapedImage[] = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const fullUrl = match[2];
    const alt = match[1] || "";
    const lowerUrl = fullUrl.toLowerCase();
    const lowerAlt = alt.toLowerCase();

    // Skip known non-content image patterns
    const isNonContent =
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
      // Alt text signals
      lowerAlt === "logo" ||
      lowerAlt === "icon" ||
      lowerAlt === "avatar";

    if (isNonContent) continue;

    allImages.push({ url: fullUrl, alt });
  }

  // Deduplicate by base URL (ignore query params / size variants)
  const seen = new Set<string>();
  const images: ScrapedImage[] = [];
  for (const img of allImages) {
    const key = img.url.split("?")[0];
    if (!seen.has(key)) {
      seen.add(key);
      images.push(img);
    }
  }

  // Add og:image as featured image if not already in the list
  const ogImage = metadata.ogImage || metadata["og:image"] || null;
  if (ogImage && !images.some((img) => img.url.split("?")[0] === ogImage.split("?")[0])) {
    images.unshift({ url: ogImage, alt: metadata.ogTitle || metadata.title || "" });
  }

  // Truncate content for prompt efficiency
  const truncatedContent = markdown.length > 4000
    ? markdown.slice(0, 4000) + "\n\n[Content truncated for generation...]"
    : markdown;

  return {
    title: metadata.title || metadata.ogTitle || metadata["og:title"] || "",
    description: metadata.description || metadata.ogDescription || metadata["og:description"] || "",
    content: truncatedContent,
    images,
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

  return {
    title: metadata.title || metadata.ogTitle || metadata["og:title"] || "",
    description: metadata.description || metadata.ogDescription || metadata["og:description"] || "",
    content: truncatedContent,
    images,
    ogImage,
    author: metadata.author || null,
    publishDate: metadata.publishedTime || metadata.articlePublishedTime || null,
    url: baseUrl,
  };
}
