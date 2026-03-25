/**
 * Firecrawl client — web scraping for campaign content extraction
 *
 * Extracts title, description, images, and main content from blog posts
 * and other content URLs for the post generation pipeline.
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
 * Scrape a blog post URL and extract structured content + all images.
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
      onlyMainContent: true,
      // Exclude known non-content elements (popups, widgets, ads, navigation)
      // These selectors work across WordPress, Squarespace, Webflow, custom sites
      excludeTags: [
        "nav", "footer", "header",
        ".sidebar", ".widget", ".ad", ".popup",
        ".convertbox", ".cb-widget", ".cb-overlay",
        ".share-buttons", ".social-share", ".related-posts",
        ".comments", "#comments",
      ],
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

  // Extract images from markdown content — only content images from the same domain
  const blogDomain = new URL(url).hostname;
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const allImages: ScrapedImage[] = [];
  let match;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const imgUrl = match[2].split("?")[0]; // Strip query params for filtering
    const fullUrl = match[2];
    const alt = match[1] || "";

    // Skip non-content images
    const lowerUrl = imgUrl.toLowerCase();
    const lowerAlt = alt.toLowerCase();
    // Check if image is from the same domain as the blog post
    let imgDomain = "";
    try { imgDomain = new URL(fullUrl).hostname; } catch { /* skip */ }
    const isSameDomain = imgDomain === blogDomain || imgDomain.endsWith("." + blogDomain);

    const isNonContent =
      // External domain images (ads, widgets, popups, brand logos)
      (!isSameDomain && !fullUrl.includes("wp-content")) ||
      // Icons and tiny images
      lowerUrl.includes("favicon") ||
      lowerUrl.includes("pixel") ||
      lowerUrl.includes("tracking") ||
      lowerUrl.includes("1x1") ||
      lowerUrl.endsWith(".svg") ||
      lowerUrl.endsWith(".gif") ||
      // Logos and branding
      lowerUrl.includes("logo") ||
      lowerUrl.includes("brand") ||
      lowerUrl.includes("badge") ||
      // Avatars and profiles
      lowerUrl.includes("gravatar") ||
      lowerUrl.includes("avatar") ||
      lowerUrl.includes("profile-pic") ||
      lowerUrl.includes("author") ||
      // Social/sharing icons
      lowerUrl.includes("share") ||
      lowerUrl.includes("social") ||
      lowerUrl.includes("icon") ||
      lowerUrl.includes("button") ||
      // WordPress/CMS widgets
      lowerUrl.includes("widget") ||
      lowerUrl.includes("sidebar") ||
      lowerUrl.includes("banner-ad") ||
      lowerUrl.includes("sponsor") ||
      // Common ad/tracking domains
      lowerUrl.includes("doubleclick") ||
      lowerUrl.includes("googleads") ||
      lowerUrl.includes("facebook.com/tr") ||
      // Alt text signals for non-content
      lowerAlt.includes("logo") ||
      lowerAlt.includes("icon") ||
      lowerAlt.includes("avatar") ||
      lowerAlt.includes("share");

    if (!isNonContent && fullUrl) {
      allImages.push({ url: fullUrl, alt });
    }
  }

  // Deduplicate by URL (some images appear multiple times at different sizes)
  const seen = new Set<string>();
  const images: ScrapedImage[] = [];
  for (const img of allImages) {
    const key = img.url.split("?")[0]; // Dedupe ignoring query params
    if (!seen.has(key)) {
      seen.add(key);
      images.push(img);
    }
  }

  // Add og:image if not already in the list
  const ogImage = metadata.ogImage || metadata["og:image"] || null;
  if (ogImage && !images.some((img) => img.url === ogImage)) {
    images.unshift({ url: ogImage, alt: metadata.ogTitle || metadata.title || "" });
  }

  // Truncate content to ~4000 chars for prompt efficiency
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
