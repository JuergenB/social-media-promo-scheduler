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

  // ── Image extraction with same-domain filtering ──────────────────
  const blogDomain = new URL(url).hostname;
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const allImages: ScrapedImage[] = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const fullUrl = match[2];
    const alt = match[1] || "";
    const lowerUrl = fullUrl.toLowerCase();

    // Parse image domain
    let imgDomain = "";
    try { imgDomain = new URL(fullUrl).hostname; } catch { continue; }
    const isSameDomain = imgDomain === blogDomain
      || imgDomain.endsWith("." + blogDomain);

    // Skip external domain images (ads, popups, third-party widgets)
    if (!isSameDomain) continue;

    // Skip non-content images by URL/alt patterns
    if (
      lowerUrl.includes("favicon") ||
      lowerUrl.includes("pixel") ||
      lowerUrl.includes("tracking") ||
      lowerUrl.includes("1x1") ||
      lowerUrl.endsWith(".svg") ||
      lowerUrl.endsWith(".gif") ||
      lowerUrl.includes("logo") ||
      lowerUrl.includes("icon") ||
      lowerUrl.includes("avatar") ||
      lowerUrl.includes("gravatar") ||
      lowerUrl.includes("widget") ||
      lowerUrl.includes("banner-ad")
    ) continue;

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
