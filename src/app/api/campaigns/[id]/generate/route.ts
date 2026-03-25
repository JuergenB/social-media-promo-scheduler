import { NextRequest } from "next/server";
import { getRecord, updateRecord, listRecords, createRecord } from "@/lib/airtable/client";
import { scrapeBlogPost } from "@/lib/firecrawl";
import { generatePosts, resolveAnthropicConfig } from "@/lib/anthropic";
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  formatPlatformSettings,
  type PlatformSetting,
} from "@/lib/prompts/blog-post-generator";
import { createPlatformShortLink } from "@/lib/short-io";

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
}

interface BrandFields {
  Name: string;
  "Website URL": string;
  "Voice Guidelines": string;
  "Short Domain": string;
  "Short API Key Label": string;
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const totalSteps = 7;

      try {
        // ── Step 1: Load campaign ──────────────────────────────────
        sendEvent(controller, encoder, {
          step: 1, totalSteps, status: "running",
          message: "Loading campaign...",
        });

        const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
        const fields = campaign.fields;

        if (fields.Status !== "Draft") {
          sendEvent(controller, encoder, {
            step: 1, totalSteps, status: "error",
            message: `Campaign is in "${fields.Status}" status — can only generate from Draft`,
          });
          controller.close();
          return;
        }

        // Update status to Scraping
        await updateRecord("Campaigns", campaignId, { Status: "Scraping" });

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
        }

        sendEvent(controller, encoder, {
          step: 2, totalSteps, status: "success",
          message: `Brand: ${brandVoice.name}`,
          detail: brandVoice.voiceGuidelines ? `Voice: ${brandVoice.voiceGuidelines.slice(0, 80)}...` : "No voice guidelines",
        });

        // ── Step 3: Load platform settings ────────────────────────
        sendEvent(controller, encoder, {
          step: 3, totalSteps, status: "running",
          message: `Loading platform settings (${TARGET_PLATFORMS.length} platforms)...`,
        });

        const platformRecords = await listRecords<Record<string, unknown>>("Platform Settings", {});
        const platformSettings = platformRecords.map((r) => r.fields as unknown as PlatformSetting);
        const formattedSettings = formatPlatformSettings(platformSettings, TARGET_PLATFORMS);

        sendEvent(controller, encoder, {
          step: 3, totalSteps, status: "success",
          message: `Loaded settings for: ${TARGET_PLATFORMS.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}`,
        });

        // ── Step 4: Scrape blog post ──────────────────────────────
        sendEvent(controller, encoder, {
          step: 4, totalSteps, status: "running",
          message: "Scraping blog post content...",
        });

        const blogData = await scrapeBlogPost(fields.URL);

        // Store scraped data on campaign record
        await updateRecord("Campaigns", campaignId, {
          Status: "Generating",
          "Scraped Content": blogData.content.slice(0, 10000),
          "Scraped Images": JSON.stringify(blogData.images),
        });

        sendEvent(controller, encoder, {
          step: 4, totalSteps, status: "success",
          message: `Scraped: "${blogData.title}"`,
          detail: `Found ${blogData.images.length} images, ${blogData.content.length} chars of content`,
        });

        await sleep(DELAY_MS);

        // ── Step 5: Generate posts with Claude ────────────────────
        const postsPerPlatform = getPostsPerPlatform(fields["Duration Days"] || 90);
        const totalPosts = TARGET_PLATFORMS.length * postsPerPlatform;

        sendEvent(controller, encoder, {
          step: 5, totalSteps, status: "running",
          message: `Generating ${totalPosts} posts across ${TARGET_PLATFORMS.length} platforms (${postsPerPlatform} per platform)...`,
        });

        const config = resolveAnthropicConfig(brandForAnthropic);
        const userPrompt = buildUserPrompt({
          blogData,
          brandVoice,
          editorialDirection: fields["Editorial Direction"] || "",
          platformSettings: formattedSettings,
          platforms: TARGET_PLATFORMS,
          postsPerPlatform,
          imageCount: blogData.images.length,
        });

        const result = await generatePosts(SYSTEM_PROMPT, userPrompt, config);

        sendEvent(controller, encoder, {
          step: 5, totalSteps, status: "success",
          message: `Generated ${result.posts.length} posts`,
          detail: `Platforms: ${[...new Set(result.posts.map((p) => p.platform))].join(", ")}`,
        });

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
            const link = await createPlatformShortLink(
              blogData.url,
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

          // Replace URL in post text with short URL
          let postText = post.postText;
          if (shortUrl && blogData.url) {
            postText = postText.replace(blogData.url, shortUrl);
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
          await createRecord("Posts", {
            Title: `${blogData.title} — ${post.platform}${post.variant > 1 ? ` (v${post.variant})` : ""}`,
            Campaign: [campaignId],
            Platform: PLATFORM_TO_AIRTABLE[post.platform] || post.platform,
            Content: post.postText,
            "Image URL": post.imageUrl || "",
            "Link URL": blogData.url,
            "Short URL": post.shortUrl || "",
            "Content Variant": String(post.variant),
            Status: "Pending",
          });
          savedCount++;
        }

        // Update campaign status to Review
        await updateRecord("Campaigns", campaignId, {
          Status: "Review",
        });

        sendEvent(controller, encoder, {
          step: 7, totalSteps, status: "success",
          message: `Saved ${savedCount} posts — campaign ready for review!`,
        });

        // Final complete event
        sendEvent(controller, encoder, {
          step: totalSteps, totalSteps, status: "success",
          message: "Generation complete!",
          detail: `${savedCount} posts across ${TARGET_PLATFORMS.length} platforms`,
        });

      } catch (error) {
        console.error("Generation pipeline error:", error);

        // Revert campaign status to Draft on error
        try {
          await updateRecord("Campaigns", campaignId, { Status: "Draft" });
        } catch {
          // If even the revert fails, log and continue
          console.error("Failed to revert campaign status");
        }

        sendEvent(controller, encoder, {
          step: 0, totalSteps: 7, status: "error",
          message: "Generation failed",
          detail: error instanceof Error ? error.message : "Unknown error",
        });
      }

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
