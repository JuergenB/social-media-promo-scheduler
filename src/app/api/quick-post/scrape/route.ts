import { NextRequest, NextResponse } from "next/server";
import {
  scrapeBlogPost,
  scrapeNewsletter,
  scrapeEvent,
  scrapeExhibition,
  type ScrapedImage,
} from "@/lib/firecrawl";

/**
 * POST /api/quick-post/scrape
 *
 * Scrape-only endpoint: fetches images and metadata from a URL
 * without generating any AI content. Used by the Quick Post image
 * picker to let users choose images before generation.
 *
 * Request:  { url: string, type?: string }
 * Response: { title, ogImage, heroImage, images: Array<{ url, alt, featured? }> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, type } = body as { url: string; type?: string };

    if (!url?.trim()) {
      return NextResponse.json(
        { error: "URL is required" },
        { status: 400 }
      );
    }

    // Use the appropriate scraper based on campaign type
    const isNewsletter = type === "Newsletter";
    const isEventType = type === "Event" || type === "Open Call";
    const isExhibition = type === "Exhibition";

    const blogData = isExhibition
      ? await scrapeExhibition(url.trim())
      : isEventType
        ? await scrapeEvent(url.trim())
        : isNewsletter
          ? await scrapeNewsletter(url.trim())
          : await scrapeBlogPost(url.trim());

    // Build deduplicated image list
    const seen = new Set<string>();
    const images: Array<{ url: string; alt: string; caption?: string; featured: boolean }> = [];

    // og:image / hero first (marked as featured)
    const ogUrl = blogData.ogImage || blogData.heroImage?.url || "";
    if (ogUrl) {
      const key = ogUrl.split("?")[0];
      if (!seen.has(key)) {
        seen.add(key);
        images.push({
          url: ogUrl,
          alt: blogData.heroImage?.alt || blogData.title || "",
          featured: true,
        });
      }
    }

    // Hero image if different from og:image
    if (blogData.heroImage?.url && blogData.heroImage.url !== ogUrl) {
      const key = blogData.heroImage.url.split("?")[0];
      if (!seen.has(key)) {
        seen.add(key);
        images.push({
          url: blogData.heroImage.url,
          alt: blogData.heroImage.alt || "",
          featured: false,
        });
      }
    }

    // Content images (already filtered by firecrawl — no thumbnails <200px)
    for (const img of blogData.images) {
      const key = img.url.split("?")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({
        url: img.url,
        alt: img.alt || "",
        ...(img.caption ? { caption: img.caption } : {}),
        featured: false,
      });
    }

    // Cap at 20 images max
    const capped = images.slice(0, 20);

    return NextResponse.json({
      title: blogData.title || "",
      ogImage: blogData.ogImage || null,
      heroImage: blogData.heroImage
        ? { url: blogData.heroImage.url, alt: blogData.heroImage.alt }
        : null,
      images: capped,
      imageCount: capped.length,
    });
  } catch (error) {
    console.error("Quick post scrape failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scrape failed" },
      { status: 500 }
    );
  }
}
