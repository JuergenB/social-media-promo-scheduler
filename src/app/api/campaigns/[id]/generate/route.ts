import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, listRecords, createRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { getCampaignTypeRule, getGenerationRules } from "@/lib/airtable/campaign-type-rules";
import { scrapeBlogPost, scrapeNewsletter, scrapeEvent, scrapeExhibition, scrapeSupplemental, extractArtistMetadata, type ContentSection, type ScrapedEventBlogData, type ScrapedExhibitionBlogData } from "@/lib/firecrawl";
import { mirrorRemoteImageToBlob } from "@/lib/blob-storage";
import { generatePosts, resolveAnthropicConfig } from "@/lib/anthropic";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  formatPlatformSettings,
  type PlatformSetting,
} from "@/lib/prompts/blog-post-generator";
import { composeSystemPrompt, composeUserPrompt } from "@/lib/prompts/compose-prompt";
import { createPlatformShortLink } from "@/lib/short-io";
import { resolvePublicationUrl } from "@/lib/publication-url";
import { stripMarkdownFormatting } from "@/lib/text-sanitizer";
import type { PlatformCadenceConfig } from "@/lib/airtable/types";
import { getEffectiveCadence } from "@/lib/platform-cadence-defaults";

// ── Image matching helpers ────────────────────────────────────────────

import type { ScrapedImage } from "@/lib/firecrawl";

/**
 * Find an image whose alt text matches the given subject.
 * Tries artwork title first (most specific), then artist name (less specific).
 * When multiple images match the same artist, prefers the one whose alt text
 * also contains the artwork title from the post text.
 */
function findImageBySubject(
  subject: string,
  images: ScrapedImage[],
  postText?: string
): ScrapedImage | null {
  if (!subject) return null;
  const lowerSubject = subject.toLowerCase();

  // Strategy 1: If subject contains artwork title + artist name, match on artwork title
  // (more specific than artist name alone — "Bee Geometric" is unique, "Shepard Fairey" isn't)
  // Extract potential artwork titles from post text (quoted or title-case phrases)
  const artworkHints = extractArtworkTitles(postText || "", lowerSubject);

  // Helper: get the best searchable text for an image (caption preferred over alt)
  const imageText = (img: ScrapedImage) => (img.caption || img.alt || "").toLowerCase();

  // Try matching artwork title in caption/alt text first (most specific match)
  if (artworkHints.length > 0) {
    for (const title of artworkHints) {
      for (const img of images) {
        if (imageText(img).includes(title)) {
          return img;
        }
      }
    }
  }

  // Strategy 2: Find all images matching the subject (artist name), then disambiguate
  const lowerSubjectWords = lowerSubject.split(/\s+/).filter((w) => w.length > 2);
  const candidates: ScrapedImage[] = [];

  for (const img of images) {
    const text = imageText(img);
    if (!text) continue;

    // Full substring match
    if (text.includes(lowerSubject)) {
      candidates.push(img);
      continue;
    }

    // Word overlap match (at least 2 words)
    if (lowerSubjectWords.length >= 2) {
      const matchCount = lowerSubjectWords.filter((w) => text.includes(w)).length;
      if (matchCount >= 2) {
        candidates.push(img);
      }
    }
  }

  if (candidates.length === 0) {
    // Try filename matching as last resort
    for (const img of images) {
      const filename = (img.url.split("/").pop()?.split("?")[0] || "")
        .toLowerCase().replace(/[-_.]/g, " ").replace(/\d+/g, " ").trim();
      if (filename && lowerSubjectWords.length >= 2) {
        const matchCount = lowerSubjectWords.filter((w) => filename.includes(w)).length;
        if (matchCount >= 2) return img;
      }
    }
    return null;
  }

  if (candidates.length === 1) return candidates[0];

  // Multiple candidates (e.g., artist has several works) — disambiguate using post text
  if (postText) {
    const lowerPost = postText.toLowerCase();
    for (const img of candidates) {
      const textParts = imageText(img).split(/\s+by\s+/);
      const artworkTitle = textParts[0]?.trim();
      if (artworkTitle && artworkTitle.length > 3 && lowerPost.includes(artworkTitle)) {
        return img;
      }
    }
  }

  // Still ambiguous — return the first candidate rather than a random unrelated image
  return candidates[0];
}

/**
 * Extract potential artwork titles from post text for precise image matching.
 * Looks for title patterns like "Title by Artist" or quoted titles.
 */
function extractArtworkTitles(postText: string, subject: string): string[] {
  const titles: string[] = [];
  const lowerPost = postText.toLowerCase();

  // Pattern: "Title's <rest>" or "<Artist>'s <Title>"
  // e.g., "Shepard Fairey's Bee Geometric" → "bee geometric"
  const possessivePattern = new RegExp(
    subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "'s\\s+([^—–\\-,.!?]+)",
    "i"
  );
  const possessiveMatch = lowerPost.match(possessivePattern);
  if (possessiveMatch) {
    const title = possessiveMatch[1].trim();
    if (title.length > 3) titles.push(title);
  }

  // Pattern: "<Title> by <Artist>"
  const byPattern = /([a-z][a-z\s']+)\s+by\s+/gi;
  let byMatch;
  while ((byMatch = byPattern.exec(lowerPost)) !== null) {
    const title = byMatch[1].trim();
    if (title.length > 3 && !title.includes("hand") && !title.includes("edition")) {
      titles.push(title);
    }
  }

  return titles;
}

/**
 * Try to match a post's text content against image alt text.
 * Extracts proper nouns / capitalized multi-word phrases from the post
 * and checks them against image alt text.
 */
function findImageByPostText(postText: string, images: ScrapedImage[]): ScrapedImage | null {
  // Extract capitalized multi-word names (likely artist/person names)
  // Pattern: 2+ consecutive capitalized words that aren't common sentence starters
  const commonWords = new Set([
    "the", "this", "that", "these", "those", "what", "when", "where", "who",
    "how", "join", "come", "don't", "check", "see", "get", "new", "our",
    "your", "their", "from", "with", "for", "and", "but", "not", "are",
    "was", "been", "have", "has", "will", "can", "may", "all", "just",
    "more", "most", "some", "any", "each", "every", "here", "there",
  ]);

  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  const candidates: string[] = [];
  let match;

  while ((match = namePattern.exec(postText)) !== null) {
    const name = match[1];
    const firstWord = name.split(" ")[0].toLowerCase();
    if (!commonWords.has(firstWord)) {
      candidates.push(name);
    }
  }

  // Try each candidate against image alt text (pass full postText for disambiguation)
  for (const candidate of candidates) {
    const result = findImageBySubject(candidate, images, postText);
    if (result) return result;
  }

  return null;
}

// ── Supplemental image filtering ──────────────────────────────────────

import type { ScrapedBlogData } from "@/lib/firecrawl";

/**
 * Extract a set of entity names from the primary page content.
 * Sources: section headings, image alt text, and capitalized multi-word
 * names from the content. These represent the "what this page is about"
 * entities used to filter supplemental images.
 */
function extractEntitiesFromContent(blogData: ScrapedBlogData): Set<string> {
  const entities = new Set<string>();

  // Section headings (e.g., artist names in multi-section posts)
  for (const section of blogData.sections || []) {
    if (section.heading && !section.isPreamble) {
      entities.add(section.heading.toLowerCase().trim());
    }
  }

  // Image caption/alt text from primary page (prefer caption for entity extraction)
  for (const img of blogData.images) {
    const text = img.caption || img.alt || "";
    if (text && text.length > 3) {
      entities.add(text.toLowerCase().trim());
      // Also extract individual multi-word names from text
      // e.g., "Bee Geometric by Shepard Fairey" → "Shepard Fairey", "Bee Geometric"
      const byParts = text.split(/\s+by\s+/i);
      for (const part of byParts) {
        if (part.trim().length > 3) entities.add(part.trim().toLowerCase());
      }
    }
  }

  // Capitalized multi-word names from content (likely person/place names)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
  let match;
  while ((match = namePattern.exec(blogData.content)) !== null) {
    entities.add(match[1].toLowerCase());
  }

  // Event title itself
  if (blogData.title) {
    entities.add(blogData.title.toLowerCase().trim());
  }

  return entities;
}

/**
 * Check if a supplemental image is relevant to the primary page content.
 * Returns true if the image's alt text or filename overlaps with known entities.
 */
function imageMatchesPrimaryEntities(img: ScrapedImage, entities: Set<string>): boolean {
  const text = (img.caption || img.alt || "").toLowerCase().trim();
  const filename = (img.url.split("/").pop()?.split("?")[0] || "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\.[a-z]+$/, "");

  // Direct caption/alt text match
  if (text && entities.has(text)) return true;

  // Check if any entity appears within the caption/alt text
  for (const entity of entities) {
    if (entity.length > 4 && text.includes(entity)) return true;
    if (entity.length > 4 && filename.includes(entity)) return true;
  }

  // Check if caption/alt text words overlap significantly with any entity
  const textWords = text.split(/\s+/).filter((w) => w.length > 3);
  if (textWords.length >= 2) {
    for (const entity of entities) {
      const entityWords = entity.split(/\s+/).filter((w) => w.length > 3);
      if (entityWords.length < 2) continue;
      const overlap = textWords.filter((w) => entityWords.includes(w)).length;
      if (overlap >= 2) return true;
    }
  }

  return false;
}

// ── Types ──────────────────────────────────────────────────────────────

interface CampaignFields {
  Name: string;
  Description: string;
  URL: string;
  Type: string;
  Brand: string[];
  "Duration Days": number;
  "Distribution Bias": string;
  "Editorial Direction": string;
  "Image URL": string;
  "Scraped Content": string;
  "Scraped Images": string;
  Status: string;
  "Event Date": string;
  "Event Details": string;
  "Additional URLs": string;
  "Start Date": string;
  "Target Platforms": string;
  "Max Variants Per Platform": number;
  "Platform Cadence": string;
  Tone: number;
  "Archived At": string;
}

interface BrandFields {
  Name: string;
  "Website URL": string;
  "Voice Guidelines": string;
  "Short Domain": string;
  "Short API Key Label": string;
  "Anthropic API Key Label": string;
  "Zernio API Key Label": string;
  "Tone Dimensions": string;
  "Tone Notes": string;
}

// ── Config ─────────────────────────────────────────────────────────────

/** Map internal platform names to Airtable single-select values */
const PLATFORM_TO_AIRTABLE: Record<string, string> = {
  instagram: "Instagram",
  twitter: "X/Twitter",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  threads: "Threads",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
};

/** Target platforms (Zernio account names) */
const TARGET_PLATFORMS = [
  "instagram",
  "twitter",
  "linkedin",
  "facebook",
  "threads",
  "bluesky",
  "pinterest",
];

/** Posts per platform based on campaign duration */
function getPostsPerPlatform(durationDays: number): number {
  if (durationDays <= 14) return 1;   // Sprint
  if (durationDays <= 90) return 2;   // Standard
  if (durationDays <= 180) return 3;  // Evergreen
  return 4;                            // Marathon
}

/** Delay between API calls to avoid rate limits */
const DELAY_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── SSE Helpers ────────────────────────────────────────────────────────

function sendEvent(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  data: {
    step: number;
    totalSteps: number;
    status: "running" | "success" | "error";
    message: string;
    detail?: string;
  }
) {
  const json = JSON.stringify(data);
  controller.enqueue(encoder.encode(`data: ${json}\n\n`));
}

// ── Main Handler ───────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  // Check brand access before starting generation
  const access = await getUserBrandAccess();
  if (access) {
    try {
      const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
      if (!hasCampaignAccess(access, campaign.fields.Brand || [])) {
        return NextResponse.json(
          { error: "You do not have access to this campaign" },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }
  }

  // Parse generation options from query params
  const url = new URL(request.url);
  const platformsParam = url.searchParams.get("platforms"); // comma-separated
  const maxPerPlatformParam = url.searchParams.get("maxPerPlatform");

  const modeParam = url.searchParams.get("mode"); // "additive" or null
  const isAdditive = modeParam === "additive";

  const selectedPlatforms = platformsParam
    ? platformsParam.split(",").filter((p) => TARGET_PLATFORMS.includes(p))
    : TARGET_PLATFORMS;
  const maxPerPlatformOverride = maxPerPlatformParam
    ? Math.max(1, Math.min(10, parseInt(maxPerPlatformParam, 10) || 0))
    : null;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const totalSteps = 7;

      // SSE keepalive: send a comment every 15s to prevent connection timeout
      // during long Claude API calls
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream already closed
          clearInterval(keepalive);
        }
      }, 15_000);

      try {
        // ── Step 1: Load campaign ──────────────────────────────────
        sendEvent(controller, encoder, {
          step: 1, totalSteps, status: "running",
          message: "Loading campaign...",
        });

        const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
        const fields = campaign.fields;

        if (isAdditive) {
          if (fields.Status !== "Active" && fields.Status !== "Review") {
            sendEvent(controller, encoder, {
              step: 1, totalSteps, status: "error",
              message: `Campaign is in "${fields.Status}" status — additive generation requires Active or Review`,
            });
            controller.close();
            return;
          }
        } else {
          if (fields.Status !== "Draft") {
            sendEvent(controller, encoder, {
              step: 1, totalSteps, status: "error",
              message: `Campaign is in "${fields.Status}" status — can only generate from Draft`,
            });
            controller.close();
            return;
          }
        }

        // Update status to Scraping (skip in additive mode — campaign stays Active/Review)
        // Also clear Archived At: regenerating = re-engaging with the campaign.
        if (!isAdditive) {
          await updateRecord("Campaigns", campaignId, { Status: "Scraping", "Archived At": null });
        } else if (fields["Archived At"]) {
          await updateRecord("Campaigns", campaignId, { "Archived At": null });
        }

        sendEvent(controller, encoder, {
          step: 1, totalSteps, status: "success",
          message: `Loaded campaign: "${fields.Name}"`,
          detail: `URL: ${fields.URL}`,
        });

        // ── Step 2: Load brand voice ──────────────────────────────
        sendEvent(controller, encoder, {
          step: 2, totalSteps, status: "running",
          message: "Loading brand voice guidelines...",
        });

        let brandVoice = { name: "Default", voiceGuidelines: "", websiteUrl: "" };
        let brandForShortIo: { name?: string; shortDomain?: string | null; shortApiKeyLabel?: string | null } = {};
        let brandForAnthropic: { anthropicApiKeyLabel?: string | null } = {};
        let brandToneDimensions: import("@/lib/airtable/types").ToneDimensions | undefined;
        let brandToneNotes: string | undefined;

        if (fields.Brand && fields.Brand.length > 0) {
          const brand = await getRecord<BrandFields>("Brands", fields.Brand[0]);
          brandVoice = {
            name: brand.fields.Name || "Default",
            voiceGuidelines: brand.fields["Voice Guidelines"] || "",
            websiteUrl: brand.fields["Website URL"] || "",
          };
          brandForShortIo = {
            name: brand.fields.Name,
            shortDomain: brand.fields["Short Domain"] || null,
            shortApiKeyLabel: brand.fields["Short API Key Label"] || null,
          };
          brandForAnthropic = {
            anthropicApiKeyLabel: brand.fields["Anthropic API Key Label"] || null,
          };
          // Parse tone dimensions from brand record
          if (brand.fields["Tone Dimensions"]) {
            try {
              brandToneDimensions = JSON.parse(brand.fields["Tone Dimensions"]);
            } catch { /* fall through */ }
          }
          brandToneNotes = brand.fields["Tone Notes"] || undefined;
        }

        sendEvent(controller, encoder, {
          step: 2, totalSteps, status: "success",
          message: `Brand: ${brandVoice.name}`,
          detail: brandVoice.voiceGuidelines ? `Voice: ${brandVoice.voiceGuidelines.slice(0, 80)}...` : "No voice guidelines",
        });

        // ── Fetch campaign type rules from Airtable (non-blocking) ──
        let campaignTypeRule: Awaited<ReturnType<typeof getCampaignTypeRule>> = null;
        let generationRules: Awaited<ReturnType<typeof getGenerationRules>> = [];

        try {
          campaignTypeRule = await getCampaignTypeRule(fields.Type);
          if (campaignTypeRule) {
            generationRules = await getGenerationRules(campaignTypeRule.id);
            console.log(
              `[generate] Loaded ${generationRules.length} generation rules for type "${fields.Type}"`
            );
          } else {
            console.warn(
              `[generate] No Campaign Type Rule found for "${fields.Type}" — using hardcoded prompts`
            );
          }
        } catch (err) {
          console.warn(
            `[generate] Failed to fetch campaign type rules — falling back to hardcoded prompts:`,
            err
          );
        }

        // ── Step 3: Load platform settings ────────────────────────
        sendEvent(controller, encoder, {
          step: 3, totalSteps, status: "running",
          message: `Loading platform settings (${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? "s" : ""})...`,
        });

        const platformRecords = await listRecords<Record<string, unknown>>("Platform Settings", {});
        const platformSettings = platformRecords.map((r) => r.fields as unknown as PlatformSetting);
        const formattedSettings = formatPlatformSettings(platformSettings, selectedPlatforms);

        sendEvent(controller, encoder, {
          step: 3, totalSteps, status: "success",
          message: `Loaded settings for: ${selectedPlatforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}`,
        });

        // ── Step 4: Scrape content (or reuse cache in additive mode) ──
        const isNewsletter = fields.Type === "Newsletter";
        const isEventType = fields.Type === "Event" || fields.Type === "Open Call";
        const isExhibition = fields.Type === "Exhibition";
        const isArtistProfile = fields.Type === "Artist Profile";
        const isPodcast = fields.Type === "Podcast Episode";

        // Always re-scrape to preserve section structure for image-entity matching.
        // Cached scrape data doesn't include sections, which breaks per-story image assignment.
        const hasCachedScrape = false;

        let blogData: ScrapedBlogData;
        let supplementalContent = "";
        const additionalUrls = (fields["Additional URLs"] || "").split("\n").filter((u: string) => u.trim());

        if (hasCachedScrape) {
          sendEvent(controller, encoder, {
            step: 4, totalSteps, status: "running",
            message: "Using cached content (skipping scrape)...",
          });

          let cachedImages: ScrapedImage[] = [];
          try {
            cachedImages = JSON.parse(fields["Scraped Images"]);
          } catch { /* fall through to empty */ }

          blogData = {
            title: fields.Name || "",
            description: "",
            content: fields["Scraped Content"],
            images: cachedImages,
            sections: [],
            heroImage: null,
            ogImage: fields["Image URL"] || null,
            author: null,
            publishDate: null,
            url: fields.URL,
          };
        } else {
          sendEvent(controller, encoder, {
            step: 4, totalSteps, status: "running",
            message: `Scraping ${isExhibition ? "exhibition" : isEventType ? "event page" : isNewsletter ? "newsletter" : isArtistProfile ? "artist profile" : isPodcast ? "podcast episode" : "blog post"} content...`,
          });

          blogData = isExhibition
            ? await scrapeExhibition(fields.URL)
            : isEventType
              ? await scrapeEvent(fields.URL)
              : isNewsletter
                ? await scrapeNewsletter(fields.URL)
                : await scrapeBlogPost(fields.URL);

          // Scrape additional URLs if present
          if (additionalUrls.length > 0) {
            sendEvent(controller, encoder, {
              step: 4, totalSteps, status: "running",
              message: `Scraping ${additionalUrls.length} additional source${additionalUrls.length > 1 ? "s" : ""}...`,
            });

            // Build entity set from primary page for supplemental image filtering.
            // Only supplemental images whose alt text or filename matches an entity
            // from the primary page are merged — this prevents sponsor headshots,
            // venue stock photos, etc. from polluting the image pool.
            const primaryEntities = extractEntitiesFromContent(blogData);

            for (const addUrl of additionalUrls) {
              try {
                const supplemental = await scrapeSupplemental(addUrl.trim());
                supplementalContent += `\n\n<source url="${addUrl.trim()}" title="${supplemental.title}">\n${supplemental.content}\n</source>`;

                // Only merge supplemental images that match primary page entities
                for (const img of supplemental.images) {
                  const isDuplicate = blogData.images.some(
                    (existing) => existing.url.split("?")[0] === img.url.split("?")[0]
                  );
                  if (isDuplicate) continue;

                  if (imageMatchesPrimaryEntities(img, primaryEntities)) {
                    blogData.images.push(img);
                  }
                }
              } catch (err) {
                console.warn(`[generate] Failed to scrape supplemental URL ${addUrl}:`, err);
              }
            }
          }
        }

        // Store scraped data on campaign record (skip status change in additive mode)
        // Also set og:image as campaign image if none exists
        // For Quick Posts, also save the scraped title as description and update the name —
        // BUT only if the user hasn't manually renamed the campaign away from the
        // "Quick Post:" prefix (issue #221). Re-check at the conditional moment so
        // an inline-rename made between scrape start and this write is respected.
        const ogImageUrl = blogData.ogImage || blogData.heroImage?.url || "";
        const isQuickPostCampaign = fields.Name?.startsWith("Quick Post:");

        // For Artist Profile: extract artist name, Instagram handle, and series detection
        const artistMeta = isArtistProfile ? extractArtistMetadata(blogData) : null;
        const artistCampaignName = artistMeta?.campaignLabel || null;

        // Mirror the scraped hero into Vercel Blob so the campaign's
        // Image URL is permanent. CMS-served URLs (Substack, Airtable-backed
        // sites) can expire or move; saving the raw scrape URL leaves the
        // campaign thumbnail and downstream "use as social media campaign
        // hero" flows fragile. mirrorRemoteImageToBlob is a no-op when the
        // URL is already on Blob and returns "" on fetch failure so the
        // existing fall-through (no Image URL written) still applies.
        const mirroredOgImageUrl =
          !fields["Image URL"] && ogImageUrl
            ? await mirrorRemoteImageToBlob(ogImageUrl, "campaigns", campaignId)
            : "";

        // Re-check the latest Name at the conditional moment (issue #221).
        // The local `fields` snapshot was loaded at the top of generate; if the
        // user inline-renamed the campaign during the scrape, that rename must
        // not be clobbered. Refetch + skip the auto-rename if the user has
        // dropped the "Quick Post:" prefix.
        const latestCampaignForName = await getRecord<CampaignFields>("Campaigns", campaignId);
        const latestNameIsQuickPost =
          latestCampaignForName.fields.Name?.startsWith("Quick Post:") ?? false;
        const shouldAutoRenameQuickPost =
          isQuickPostCampaign && latestNameIsQuickPost && !!blogData.title;

        await updateRecord("Campaigns", campaignId, {
          ...(isAdditive ? {} : { Status: "Generating" }),
          "Scraped Content": blogData.content.slice(0, 10000),
          "Scraped Images": JSON.stringify(blogData.images),
          ...(mirroredOgImageUrl ? { "Image URL": mirroredOgImageUrl } : {}),
          ...(!fields.Description && blogData.title ? { Description: blogData.title } : {}),
          ...(shouldAutoRenameQuickPost ? { Name: `Quick Post: ${blogData.title}` } : {}),
          // Artist Profile: set descriptive campaign name and store artist handle
          ...(isArtistProfile && artistCampaignName ? { Name: artistCampaignName } : {}),
          ...(isArtistProfile && artistMeta?.instagramHandle ? { "Artist Handle": artistMeta.instagramHandle } : {}),
        });

        // Resolve publication URL (preview → canonical) once for this generation.
        // Used for Short.io shortening + Claude prompt URL references.
        // Scraping still uses blogData.url (may be a preview URL).
        const publicationUrl = resolvePublicationUrl(blogData.url, blogData.ogUrl);
        if (publicationUrl !== blogData.url) {
          console.log(
            `[campaigns] Detected preview URL — using production URL for short links + copy: ${publicationUrl}`
          );
        }
        blogData.publicationUrl = publicationUrl;

        // Analyze sections for section-aware generation
        const contentSections = blogData.sections?.filter((s: ContentSection) => !s.isPreamble) || [];
        const isMultiSection = contentSections.length > 1;

        // Extract event/exhibition data if available
        const eventData = isEventType ? (blogData as ScrapedEventBlogData).eventData : null;
        const exhibitionData = isExhibition ? (blogData as ScrapedExhibitionBlogData).exhibitionData : null;

        const scrapedImageCount = blogData.images.length;
        const sectionCount = contentSections.length;

        sendEvent(controller, encoder, {
          step: 4, totalSteps, status: "success",
          message: `Scraped: "${blogData.title}"${additionalUrls.length > 0 ? ` + ${additionalUrls.length} additional source${additionalUrls.length > 1 ? "s" : ""}` : ""}`,
          detail: isExhibition && exhibitionData
            ? `Found ${exhibitionData.artworks.length} artworks by ${new Set(exhibitionData.artworks.map((a) => a.artistName)).size} artists · ${scrapedImageCount} images`
            : isEventType && eventData
              ? `Found ${scrapedImageCount} images · Extracted event details: ${Object.entries(eventData).filter(([, v]) => v).map(([k]) => k).join(", ")}`
              : isArtistProfile && artistMeta?.artistName
              ? `Artist: ${artistMeta.artistName}${artistMeta.instagramHandle ? ` (@${artistMeta.instagramHandle})` : ""}${artistMeta.seriesName ? ` · ${artistMeta.seriesName}` : ""} · ${scrapedImageCount} images`
              : isMultiSection
              ? `Found ${scrapedImageCount} images across ${sectionCount} sections (${contentSections.slice(0, 6).map((s: ContentSection) => s.heading).join(", ")}${sectionCount > 6 ? `, +${sectionCount - 6} more` : ""})`
              : `Found ${scrapedImageCount} images, ${blogData.content.length} chars of content`,
        });

        await sleep(DELAY_MS);

        // ── Step 5: Generate posts per platform with Claude ──────
        const durationBasedCount = getPostsPerPlatform(fields["Duration Days"] || 90);
        const config = resolveAnthropicConfig(brandForAnthropic);
        const allGeneratedPosts: import("@/lib/anthropic").GeneratedPost[] = [];

        // Deduplicate images
        const contentImages = blogData.images.filter((_img, idx) => {
          if (idx === 0) return true;
          return !blogData.images.slice(0, idx).some(
            (prev) => prev.url.split("?")[0] === blogData.images[idx].url.split("?")[0]
          );
        });

        // Build catalog images — must match prompt catalog exactly.
        // For multi-section: images in section order (section-derived labels).
        // For single-section: images in page order, hero excluded.
        const heroUrl = blogData.heroImage?.url || blogData.ogImage || "";
        let catalogImages: typeof contentImages;
        if (isMultiSection) {
          // Build from sections in order — matches the prompt's section-derived catalog
          const sectionImgs: typeof contentImages = [];
          for (const s of contentSections.slice(0, 12)) {
            for (const img of s.images) {
              sectionImgs.push(img);
            }
          }
          catalogImages = sectionImgs;
        } else {
          catalogImages = contentImages.filter((img) => img.url !== heroUrl).slice(0, 20);
        }

        // ── Cadence-aware per-platform post counts ──────────────
        const durationDays = fields["Duration Days"] || 90;
        const durationWeeks = Math.max(1, durationDays / 7);

        // Parse campaign cadence (if set)
        let campaignCadence: PlatformCadenceConfig | null = null;
        if (fields["Platform Cadence"]) {
          try {
            campaignCadence = JSON.parse(fields["Platform Cadence"]) as PlatformCadenceConfig;
          } catch { /* fall through */ }
        }

        // Compute per-platform post counts based on cadence
        const perPlatformCounts: Record<string, number> = {};
        for (const platform of selectedPlatforms) {
          const cadenceEntry = getEffectiveCadence(platform, campaignCadence);
          // Cadence-based: postsPerWeek × weeks, capped reasonably
          const cadenceCount = Math.ceil(cadenceEntry.postsPerWeek * durationWeeks);
          // Content-based cap: don't exceed available sections/images
          const contentCap = isMultiSection
            ? Math.max(contentSections.length, durationBasedCount)
            : (contentImages.length > 1
                ? Math.max(contentImages.length, durationBasedCount)
                : durationBasedCount);
          // Take the smaller of cadence-based and content-based, but at least 1
          let count = Math.min(cadenceCount, contentCap);
          // Apply user override if set
          if (maxPerPlatformOverride) {
            count = Math.min(count, maxPerPlatformOverride);
          }
          perPlatformCounts[platform] = Math.max(1, count);
        }

        // For catalog trimming, use the max across all platforms
        const maxPostsAnyPlatform = Math.max(...Object.values(perPlatformCounts));

        // Trim catalog to match — page order = editorial priority
        if (catalogImages.length > maxPostsAnyPlatform) {
          catalogImages = catalogImages.slice(0, maxPostsAnyPlatform);
        }

        const testModeLabel = maxPerPlatformOverride ? ` (test mode: max ${maxPerPlatformOverride})` : "";
        const catalogLabel = isMultiSection
          ? `${sectionCount} sections, ${catalogImages.length} images in catalog`
          : `${catalogImages.length} images in catalog`;
        const filtered = scrapedImageCount - catalogImages.length;
        const countSummary = selectedPlatforms
          .map((p) => `${p.charAt(0).toUpperCase() + p.slice(1)}: ${perPlatformCounts[p]}`)
          .join(", ");
        sendEvent(controller, encoder, {
          step: 5, totalSteps, status: "running",
          message: `${catalogLabel}${filtered > 0 ? ` (${filtered} filtered)` : ""} — ${countSummary}${testModeLabel}`,
        });

        await sleep(1000);

        for (let i = 0; i < selectedPlatforms.length; i++) {
          const platform = selectedPlatforms[i];
          const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
          const postsPerPlatform = perPlatformCounts[platform] || 1;

          // Generate in batches to avoid API timeouts and show progress.
          // Normal generation: no batching (single call, proven reliable).
          // Additive generation: batch by 2 to avoid SSE connection timeout.
          const BATCH_SIZE = isAdditive ? 2 : postsPerPlatform;
          const totalBatches = Math.ceil(postsPerPlatform / BATCH_SIZE);
          const platformPosts: import("@/lib/anthropic").GeneratedPost[] = [];

          for (let batch = 0; batch < totalBatches; batch++) {
            const batchCount = Math.min(BATCH_SIZE, postsPerPlatform - platformPosts.length);

            sendEvent(controller, encoder, {
              step: 5, totalSteps, status: "running",
              message: `Generating ${platformName} posts (${platformPosts.length + 1}–${platformPosts.length + batchCount} of ${postsPerPlatform})${selectedPlatforms.length > 1 ? ` [platform ${i + 1}/${selectedPlatforms.length}]` : ""}...`,
              detail: `${allGeneratedPosts.length + platformPosts.length} posts generated so far`,
            });

            // Use dynamic prompt composition if Airtable rules are available,
            // otherwise fall back to hardcoded prompts from blog-post-generator.ts
            const systemPrompt = generationRules.length > 0
              ? composeSystemPrompt(generationRules)
              : SYSTEM_PROMPT;

            const variantOffset = platformPosts.length; // 0 for batch 1, 2 for batch 2, etc.
            const campaignVoiceIntensity = fields.Tone ?? null;

            const userPrompt = campaignTypeRule
              ? composeUserPrompt({
                  blogData,
                  brandVoice,
                  editorialDirection: fields["Editorial Direction"] || "",
                  platformSettings: formattedSettings,
                  platforms: [platform],
                  postsPerPlatform: batchCount,
                  imageCount: contentImages.length,
                  variantOffset,
                  campaignTypeRule,
                  eventDate: fields["Event Date"] || null,
                  eventDetails: fields["Event Details"] || null,
                  supplementalContent: supplementalContent || null,
                  eventData: eventData as Record<string, string | null> | null,
                  voiceIntensity: campaignVoiceIntensity,
                  brandName: brandVoice.name,
                  toneDimensions: brandToneDimensions,
                  toneNotes: brandToneNotes,
                })
              : buildUserPrompt({
                  blogData,
                  brandVoice,
                  editorialDirection: fields["Editorial Direction"] || "",
                  platformSettings: formattedSettings,
                  platforms: [platform],
                  postsPerPlatform: batchCount,
                  imageCount: contentImages.length,
                  variantOffset,
                  voiceIntensity: campaignVoiceIntensity,
                  brandName: brandVoice.name,
                  toneDimensions: brandToneDimensions,
                  toneNotes: brandToneNotes,
                });

            // Scale output tokens: ~400 tokens per post (content + JSON structure) + buffer
            const estimatedTokens = Math.max(8192, batchCount * 400 + 2000);
            const batchResult = await generatePosts(systemPrompt, userPrompt, config, { maxTokens: estimatedTokens });
            platformPosts.push(...batchResult.posts);
          }

          const result = { posts: platformPosts };

          // ── Image assignment via Claude's imageIndex ─────────
          // Claude selects from the numbered catalog (hero excluded).
          // imageIndex > 0 → catalogImages[imageIndex - 1]
          // imageIndex === 0 or missing → hero/og fallback
          // User-uploaded hero (in campaign "Image URL") takes precedence over scraped og:image
          const heroFallback = fields["Image URL"] || heroUrl || "";

          // For Quick Post campaigns (maxPerPlatform=1 with a URL), always use the
          // og:image/hero as the post image. The user can swap in the editor.
          const isQuickPost = fields.Name?.startsWith("Quick Post:") && maxPerPlatformOverride === 1;

          for (const post of result.posts) {
            if (isQuickPost && heroFallback) {
              post.imageUrl = heroFallback;
              continue;
            }

            // Deterministic section→image binding for multi-section posts:
            // If post has a sectionIndex and that section has an image, use it directly.
            // This bypasses Claude's imageIndex which is unreliable when alt text is poor.
            if (isMultiSection && post.sectionIndex && post.sectionIndex > 0) {
              const section = contentSections[post.sectionIndex - 1];
              if (section?.images?.length > 0) {
                post.imageUrl = section.images[0].url;
                // Carry over anchor if present
                const catalogMatch = catalogImages.find((c) => c.url === section.images[0].url);
                if (catalogMatch?.anchor) post.anchor = catalogMatch.anchor;
                continue; // Skip the imageIndex lookup
              }
            }

            const imgIdx = post.imageIndex ?? 0;

            // Unified catalog lookup — works for all campaign types including newsletters.
            // For newsletters, also carries over the anchor for story-specific short links.
            if (imgIdx > 0 && imgIdx <= catalogImages.length) {
              const catalogImg = catalogImages[imgIdx - 1];
              post.imageUrl = catalogImg.url;
              // Carry over anchor/storyTitle for newsletter deep links
              if (catalogImg.anchor) post.anchor = catalogImg.anchor;
            } else {
              // imageIndex 0 or out of range: hero/general image
              post.imageUrl = heroFallback;
            }
          }

          allGeneratedPosts.push(...result.posts);

          await sleep(DELAY_MS);
        }

        sendEvent(controller, encoder, {
          step: 5, totalSteps, status: "success",
          message: `Generated ${allGeneratedPosts.length} posts across ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? "s" : ""}`,
        });

        // Use allGeneratedPosts as the result from here
        const result = { posts: allGeneratedPosts };

        await sleep(DELAY_MS);

        // ── Step 6: Create short links ────────────────────────────
        sendEvent(controller, encoder, {
          step: 6, totalSteps, status: "running",
          message: `Creating short links for ${result.posts.length} posts...`,
        });

        const campaignSlug = (fields.Name || "campaign")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 40);

        const postsWithLinks = [];
        let shortLinkCount = 0;

        for (const post of result.posts) {
          let shortUrl = "";
          try {
            // For newsletters with story anchors, use story-specific URL.
            // Use resolved publication URL (preview → canonical) so short links
            // point at the production URL, not the preview token.
            const linkTarget = post.anchor
              ? `${publicationUrl}#${post.anchor}`
              : publicationUrl;

            const link = await createPlatformShortLink(
              linkTarget,
              post.platform,
              campaignSlug,
              brandForShortIo
            );
            shortUrl = link.secureShortURL || link.shortURL;
            shortLinkCount++;
          } catch (err) {
            // Short link creation is non-critical — continue without it
            console.warn(`Short link failed for ${post.platform}:`, err);
          }

          // Replace URL in post text with short URL.
          // Claude was prompted with publicationUrl, so that's what appears in postText;
          // also replace the original url as a safety net in case Claude echoed it.
          let postText = post.postText;
          if (shortUrl) {
            if (publicationUrl) {
              postText = postText.replace(publicationUrl, shortUrl);
            }
            if (blogData.url && blogData.url !== publicationUrl) {
              postText = postText.replace(blogData.url, shortUrl);
            }
          }

          postsWithLinks.push({ ...post, postText, shortUrl });
          await sleep(500); // Rate limit Short.io
        }

        const domain = brandForShortIo.shortDomain || process.env.SHORT_IO_DOMAIN || "";
        sendEvent(controller, encoder, {
          step: 6, totalSteps, status: "success",
          message: `Created ${shortLinkCount} short links via ${domain}`,
        });

        await sleep(DELAY_MS);

        // ── Step 7: Save posts to Airtable ────────────────────────
        sendEvent(controller, encoder, {
          step: 7, totalSteps, status: "running",
          message: `Saving ${postsWithLinks.length} posts to database...`,
        });

        let savedCount = 0;
        for (const post of postsWithLinks) {
          // Strip markdown italic/bold from generated text — none of the
          // target platforms render markdown. See #222.
          const sanitizedContent = stripMarkdownFormatting(post.postText);
          const sanitizedFirstComment = post.firstComment
            ? stripMarkdownFormatting(post.firstComment)
            : "";

          const postRecord: Record<string, unknown> = {
            Title: `${blogData.title} — ${post.platform}${post.variant > 1 ? ` (v${post.variant})` : ""}`,
            Campaign: [campaignId],
            Platform: PLATFORM_TO_AIRTABLE[post.platform] || post.platform,
            Content: sanitizedContent,
            "Image URL": post.imageUrl || "",
            "Link URL": publicationUrl,
            "Short URL": post.shortUrl || "",
            "Content Variant": String(post.variant),
            Status: "Pending",
          };
          if (sanitizedFirstComment) {
            postRecord["First Comment"] = sanitizedFirstComment;
          }
          await createRecord("Posts", postRecord);
          savedCount++;
        }

        // Update campaign status to Review (skip in additive mode — campaign stays Active/Review)
        if (!isAdditive) {
          await updateRecord("Campaigns", campaignId, {
            Status: "Review",
          });
        }

        sendEvent(controller, encoder, {
          step: 7, totalSteps, status: "success",
          message: isAdditive
            ? `Generated ${savedCount} additional posts — ready for review!`
            : `Saved ${savedCount} posts — campaign ready for review!`,
        });

        // Final complete event
        sendEvent(controller, encoder, {
          step: totalSteps, totalSteps, status: "success",
          message: "Generation complete!",
          detail: `${savedCount} posts across ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? "s" : ""}`,
        });

      } catch (error) {
        console.error("Generation pipeline error:", error);

        // Revert campaign status to Draft on error (skip in additive mode — keep existing status)
        if (!isAdditive) {
          try {
            await updateRecord("Campaigns", campaignId, { Status: "Draft" });
          } catch {
            // If even the revert fails, log and continue
            console.error("Failed to revert campaign status");
          }
        }

        sendEvent(controller, encoder, {
          step: 0, totalSteps: 7, status: "error",
          message: "Generation failed",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }

      clearInterval(keepalive);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
