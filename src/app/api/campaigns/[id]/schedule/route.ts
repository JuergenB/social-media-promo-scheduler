import { NextRequest, NextResponse } from "next/server";
import { getRecord, updateRecord, listRecords } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { schedulePostsAlgorithm, previewSchedule } from "@/lib/scheduling";
import type { DistributionBias, PlatformCadenceConfig } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
  Brand: string[];
  "Duration Days": number;
  "Distribution Bias": string;
  Status: string;
  "Event Date": string;
  "Start Date": string;
  "Platform Cadence": string;
}

interface PostFields {
  Campaign: string[];
  Platform: string;
  Status: string;
  "Scheduled Date": string;
}

/** Map Airtable platform names to Zernio platform IDs */
const PLATFORM_MAP: Record<string, string> = {
  Instagram: "instagram",
  "X/Twitter": "twitter",
  LinkedIn: "linkedin",
  Facebook: "facebook",
  Threads: "threads",
  Bluesky: "bluesky",
  Pinterest: "pinterest",
  TikTok: "tiktok",
  YouTube: "youtube",
  Reddit: "reddit",
  Telegram: "telegram",
  Snapchat: "snapchat",
  "Google Business": "googlebusiness",
};

/**
 * POST /api/campaigns/[id]/schedule
 *
 * Assigns scheduled dates to all approved posts in a campaign using
 * the tapering algorithm. Does NOT push to Zernio yet — that's a
 * separate step after the user previews and confirms.
 *
 * Query params:
 *   ?preview=true — return the schedule without applying it
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const isPreview = request.nextUrl.searchParams.get("preview") === "true";

    // Check brand access
    const access = await getUserBrandAccess();
    const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);

    if (access && !hasCampaignAccess(access, campaign.fields.Brand || [])) {
      return NextResponse.json(
        { error: "You do not have access to this campaign" },
        { status: 403 }
      );
    }

    const durationDays = campaign.fields["Duration Days"] || 90;
    const bias = (campaign.fields["Distribution Bias"] || "Front-loaded") as DistributionBias;

    // Resolve cadence: campaign-level first, then brand-level, then global defaults
    let cadence: PlatformCadenceConfig | null = null;
    if (campaign.fields["Platform Cadence"]) {
      try {
        cadence = JSON.parse(campaign.fields["Platform Cadence"]) as PlatformCadenceConfig;
      } catch { /* fall through */ }
    }
    if (!cadence) {
      const brandIds = campaign.fields.Brand || [];
      if (brandIds.length > 0) {
        try {
          const brandRecord = await getRecord<{ "Platform Cadence": string }>(
            "Brands",
            brandIds[0]
          );
          const raw = brandRecord.fields["Platform Cadence"];
          if (raw) {
            cadence = JSON.parse(raw) as PlatformCadenceConfig;
          }
        } catch {
          // Fall through to global defaults
        }
      }
    }

    // Start date: use campaign's Start Date if set, otherwise today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let startDate: Date;
    if (campaign.fields["Start Date"]) {
      const campaignStart = new Date(campaign.fields["Start Date"] + "T00:00:00");
      // If the stored start date is in the past, use today instead
      startDate = campaignStart > today ? campaignStart : today;
    } else {
      startDate = today;
    }

    // For event campaigns, if the event date is set, use it to define the end
    // and adjust duration accordingly
    if (campaign.fields["Event Date"]) {
      const eventDate = new Date(campaign.fields["Event Date"]);
      const daysUntilEvent = Math.ceil((eventDate.getTime() - startDate.getTime()) / 86400000);
      if (daysUntilEvent > 0 && daysUntilEvent < durationDays) {
        // Don't schedule past the event date
      }
    }

    // Fetch all posts for this campaign
    const allPosts = await listRecords<PostFields>("Posts", {});
    const campaignPosts = allPosts.filter(
      (p) => p.fields.Campaign?.includes(campaignId)
    );

    const approvedPosts = campaignPosts.filter((p) => p.fields.Status === "Approved");

    if (approvedPosts.length === 0) {
      return NextResponse.json(
        { error: "No approved posts to schedule" },
        { status: 400 }
      );
    }

    // Find already-scheduled dates to avoid collisions (for batch scheduling)
    const alreadyScheduledDates = new Map<string, Set<string>>(); // platform → set of date strings
    for (const p of campaignPosts) {
      if ((p.fields.Status === "Queued" || p.fields.Status === "Scheduled" || p.fields.Status === "Published") && p.fields["Scheduled Date"]) {
        const plat = PLATFORM_MAP[p.fields.Platform] || p.fields.Platform.toLowerCase();
        const dateStr = p.fields["Scheduled Date"].split("T")[0];
        if (!alreadyScheduledDates.has(plat)) alreadyScheduledDates.set(plat, new Set());
        alreadyScheduledDates.get(plat)!.add(dateStr);
      }
    }

    const posts = approvedPosts.map((p) => ({
      id: p.id,
      platform: PLATFORM_MAP[p.fields.Platform] || p.fields.Platform.toLowerCase(),
    }));

    if (isPreview) {
      // Preview mode: return schedule summary without applying
      const platformCounts: Record<string, number> = {};
      for (const post of posts) {
        platformCounts[post.platform] = (platformCounts[post.platform] || 0) + 1;
      }

      const preview = previewSchedule({
        platformCounts,
        startDate,
        durationDays,
        bias,
        cadence,
      });

      const slots = schedulePostsAlgorithm({
        posts,
        startDate,
        durationDays,
        bias,
        cadence,
        excludedDates: alreadyScheduledDates,
      });

      return NextResponse.json({
        preview: true,
        totalPosts: posts.length,
        durationDays,
        bias,
        weekSummary: preview,
        slots: slots.map((s) => ({
          postId: s.postId,
          platform: s.platform,
          scheduledDate: s.scheduledDate,
        })),
      });
    }

    // Apply mode: assign dates and update Airtable
    const slots = schedulePostsAlgorithm({
      posts,
      startDate,
      durationDays,
      bias,
      cadence,
      excludedDates: alreadyScheduledDates,
    });

    // Update each post with its scheduled date
    for (const slot of slots) {
      await updateRecord("Posts", slot.postId, {
        "Scheduled Date": slot.scheduledDate,
        Status: "Scheduled",
      });
    }

    // Update campaign status to Active
    await updateRecord("Campaigns", campaignId, { Status: "Active" });

    return NextResponse.json({
      success: true,
      scheduledPosts: slots.length,
      slots: slots.map((s) => ({
        postId: s.postId,
        platform: s.platform,
        scheduledDate: s.scheduledDate,
      })),
    });
  } catch (error) {
    console.error("Failed to schedule campaign:", error);
    const message = error instanceof Error ? error.message : "Failed to schedule campaign";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
