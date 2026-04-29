import { NextRequest, NextResponse } from "next/server";
import { listRecords, getRecord } from "@/lib/airtable/client";
import type { Campaign, Post, PlatformCadenceConfig } from "@/lib/airtable/types";

interface PostFields {
  Title: string;
  Campaign: string[];
  Platform: string;
  Content: string;
  "Media URLs": string;
  "Media Captions": string;
  "Image URL": string;
  "Short URL": string;
  "Link URL": string;
  "Scheduled Date": string;
  Status: string;
  "Content Variant": string;
  "Approved By": string;
  "Approved At": string;
  "Zernio Post ID": string;
  Notes: string;
  "Original Media": string;
  "Cover Slide Data": string;
  "First Comment": string;
  "Sort Order": number | null;
  "Platform Post URL": string;
  Collaborators: string;
  "User Tags": string;
  "Lnk.Bio Sync Pending"?: boolean;
  "Carousel PDF URL": string;
}

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
  Status: string;
  "Created At": string;
  "Created By": string;
  "Event Date": string;
  "Event Details": string;
  "Additional URLs": string;
  "Start Date": string;
  "Target Platforms": string;
  "Max Variants Per Platform": number;
  "Platform Cadence": string;
  Tone: number;
  "Scraped Images": string;
}

function parseCadenceJson(raw: string | undefined | null): PlatformCadenceConfig | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformCadenceConfig;
  } catch {
    return null;
  }
}

function mapPostFields(id: string, fields: PostFields): Post {
  return {
    id,
    title: fields.Title || "",
    campaignIds: fields.Campaign || [],
    platform: fields.Platform || "",
    content: fields.Content || "",
    mediaUrls: fields["Media URLs"] || "",
    mediaCaptions: fields["Media Captions"] || "",
    imageUrl: fields["Image URL"] || "",
    shortUrl: fields["Short URL"] || "",
    linkUrl: fields["Link URL"] || "",
    scheduledDate: fields["Scheduled Date"] || "",
    status: (fields.Status as Post["status"]) || "Pending",
    contentVariant: fields["Content Variant"] || "",
    approvedBy: fields["Approved By"] || "",
    approvedAt: fields["Approved At"] || "",
    zernioPostId: fields["Zernio Post ID"] || "",
    notes: fields.Notes || "",
    originalMedia: fields["Original Media"] || "",
    coverSlideData: fields["Cover Slide Data"] || "",
    firstComment: fields["First Comment"] || "",
    sortOrder: fields["Sort Order"] ?? null,
    platformPostUrl: fields["Platform Post URL"] || "",
    collaborators: fields["Collaborators"] || "",
    userTags: fields["User Tags"] || "",
    lnkBioSyncPending: !!fields["Lnk.Bio Sync Pending"],
    carouselPdfUrl: fields["Carousel PDF URL"] || "",
  };
}

function mapCampaignFields(id: string, fields: CampaignFields): Campaign {
  return {
    id,
    name: fields.Name || "",
    description: fields.Description || "",
    url: fields.URL || "",
    type: fields.Type as Campaign["type"],
    brandIds: fields.Brand || [],
    durationDays: fields["Duration Days"] || 0,
    distributionBias: fields["Distribution Bias"] as Campaign["distributionBias"],
    editorialDirection: fields["Editorial Direction"] || "",
    imageUrl: fields["Image URL"] || "",
    status: fields.Status as Campaign["status"],
    createdAt: fields["Created At"] || "",
    createdBy: fields["Created By"] || "",
    eventDate: fields["Event Date"] || undefined,
    eventDetails: fields["Event Details"] || undefined,
    additionalUrls: fields["Additional URLs"] || undefined,
    startDate: fields["Start Date"] || undefined,
    targetPlatforms: fields["Target Platforms"] ? fields["Target Platforms"].split(",") : undefined,
    maxVariantsPerPlatform: fields["Max Variants Per Platform"] ?? undefined,
    platformCadence: parseCadenceJson(fields["Platform Cadence"]),
    voiceIntensity: fields.Tone ?? undefined,
    scrapedImages: (() => {
      try {
        if (!fields["Scraped Images"]) return undefined;
        const parsed = JSON.parse(fields["Scraped Images"]);
        return Array.isArray(parsed) ? parsed : undefined;
      } catch { return undefined; }
    })(),
  };
}

/**
 * GET /api/posts/lookup/[zernioPostId]
 *
 * Look up an Airtable Post record (and its linked Campaign) by Zernio Post ID.
 * Used by the calendar page to bridge Zernio API data → Airtable records
 * for full editing via CampaignPostDetail.
 *
 * Returns: { post: Post, campaign: Campaign, siblingPosts: Post[] }
 *   - siblingPosts: all posts in the same campaign (for prev/next navigation)
 * Returns 404 if no Airtable record exists for this Zernio Post ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ zernioPostId: string }> }
) {
  try {
    const { zernioPostId } = await params;

    if (!zernioPostId) {
      return NextResponse.json(
        { error: "Missing zernioPostId parameter" },
        { status: 400 }
      );
    }

    // Find the Airtable post by Zernio Post ID
    const posts = await listRecords<PostFields>("Posts", {
      filterByFormula: `{Zernio Post ID} = '${zernioPostId.replace(/'/g, "\\'")}'`,
    });

    if (posts.length === 0) {
      return NextResponse.json(
        { error: "No Airtable record found for this Zernio Post ID" },
        { status: 404 }
      );
    }

    const postRecord = posts[0];
    const post = mapPostFields(postRecord.id, postRecord.fields);

    // Follow the Campaign linked record
    const campaignId = postRecord.fields.Campaign?.[0];
    let campaign: Campaign | null = null;
    let siblingPosts: Post[] = [post];

    if (campaignId) {
      try {
        const campaignRecord = await getRecord<CampaignFields>("Campaigns", campaignId);
        campaign = mapCampaignFields(campaignRecord.id, campaignRecord.fields);

        // Fetch sibling posts in the same campaign for prev/next navigation
        const campaignPostRecords = await listRecords<PostFields>("Posts", {
          filterByFormula: `FIND("${campaignId}", ARRAYJOIN(Campaign))`,
        });
        siblingPosts = campaignPostRecords.map((r) => mapPostFields(r.id, r.fields));
      } catch (err) {
        console.warn(`[lookup] Failed to fetch campaign ${campaignId}:`, err);
      }
    }

    return NextResponse.json({
      post,
      campaign,
      siblingPosts,
    });
  } catch (error) {
    console.error("[lookup] Failed to look up post by Zernio ID:", error);
    return NextResponse.json(
      { error: "Failed to look up post" },
      { status: 500 }
    );
  }
}
