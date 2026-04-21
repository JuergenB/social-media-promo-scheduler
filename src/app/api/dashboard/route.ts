import { NextRequest, NextResponse } from "next/server";
import { listRecords } from "@/lib/airtable/client";
import { getUserBrandAccess, hasBrandAccess } from "@/lib/brand-access";
import type { CampaignStatus, CampaignType, PostStatus } from "@/lib/airtable/types";

interface CampaignFields {
  Name: string;
  Type: CampaignType;
  Status: CampaignStatus;
  Brand: string[];
  "Duration Days": number;
  "Target Platforms": string;
  URL: string;
  "Archived At": string;
}

interface PostFields {
  Content: string;
  Platform: string;
  Status: PostStatus;
  "Scheduled Date": string;
  "Image URL": string;
  "Short URL": string;
  Campaign: string[];
  "Zernio Post ID": string;
  "Media URLs": string;
  "Original Media": string;
  "Cover Slide Data": string;
}

/**
 * GET /api/dashboard
 *
 * Returns aggregated dashboard stats for the requested brand.
 * Query: ?brandId=recXXX (required)
 */
export async function GET(request: NextRequest) {
  try {
    const access = await getUserBrandAccess();
    const brandId = request.nextUrl.searchParams.get("brandId");

    if (!brandId) {
      return NextResponse.json({ error: "brandId is required" }, { status: 400 });
    }

    if (access && !hasBrandAccess(access, brandId)) {
      return NextResponse.json({ error: "Unauthorized for this brand" }, { status: 403 });
    }

    // Fetch all campaigns and filter by brand ID in memory.
    // ARRAYJOIN(Brand) returns brand names (not IDs), so we match on the Brand linked record array.
    const allCampaigns = await listRecords<CampaignFields>("Campaigns", {
      fields: ["Name", "Type", "Status", "Brand", "Duration Days", "Target Platforms", "URL", "Archived At"],
    });
    // Exclude archived campaigns from all dashboard surfaces — they shouldn't
    // appear in the Campaigns panel, and their posts shouldn't appear in
    // "Needs Your Attention" either.
    const campaigns = allCampaigns.filter((c) =>
      (c.fields.Brand || []).includes(brandId) && !c.fields["Archived At"]
    );

    const campaignIds = new Set(campaigns.map((c) => c.id));

    // Fetch all posts (we'll filter by campaign IDs in memory)
    // Airtable doesn't support efficient IN-list filtering, so fetch all non-archived posts
    const allPosts = await listRecords<PostFields>("Posts", {
      fields: ["Content", "Platform", "Status", "Scheduled Date", "Image URL", "Short URL", "Campaign", "Zernio Post ID", "Media URLs", "Original Media", "Cover Slide Data"],
    });

    // Filter to posts belonging to this brand's campaigns
    const posts = allPosts.filter((p) =>
      p.fields.Campaign?.some((cId) => campaignIds.has(cId))
    );

    // Build campaign summaries with post counts
    const campaignPostCounts = new Map<string, Record<string, number>>();
    for (const post of posts) {
      for (const cId of post.fields.Campaign || []) {
        if (!campaignIds.has(cId)) continue;
        const counts = campaignPostCounts.get(cId) || { total: 0, pending: 0, approved: 0, queued: 0, scheduled: 0, published: 0, failed: 0, dismissed: 0 };
        counts.total++;
        const status = (post.fields.Status || "Pending").toLowerCase().replace(/ /g, "");
        if (status === "pending" || status === "modified") counts.pending++;
        else if (status === "approved") counts.approved++;
        else if (status === "queued") counts.queued++;
        else if (status === "scheduled") counts.scheduled++;
        else if (status === "published") counts.published++;
        else if (status === "failed") counts.failed++;
        else if (status === "dismissed") counts.dismissed++;
        campaignPostCounts.set(cId, counts);
      }
    }

    const activeCampaigns = campaigns
      .map((c) => ({
        id: c.id,
        name: c.fields.Name || "Untitled",
        type: c.fields.Type,
        status: c.fields.Status,
        url: c.fields.URL,
        postCounts: campaignPostCounts.get(c.id) || { total: 0, pending: 0, approved: 0, queued: 0, scheduled: 0, published: 0, failed: 0, dismissed: 0 },
      }));

    // Pipeline window: filter posts by scheduled date for the pipeline bar
    // Values: "30d", "90d" (default), "ytd", "all"
    const pipelineWindow = request.nextUrl.searchParams.get("pipelineWindow") || "90d";
    const now = new Date();
    let pipelineStart: Date | null = null;
    let pipelineEnd: Date | null = null;

    if (pipelineWindow === "30d") {
      pipelineStart = new Date(now.getTime() - 30 * 86400000);
      pipelineEnd = new Date(now.getTime() + 30 * 86400000);
    } else if (pipelineWindow === "90d") {
      pipelineStart = new Date(now.getTime() - 30 * 86400000);
      pipelineEnd = new Date(now.getTime() + 60 * 86400000);
    } else if (pipelineWindow === "ytd") {
      pipelineStart = new Date(now.getFullYear(), 0, 1);
      pipelineEnd = new Date(now.getTime() + 90 * 86400000);
    }
    // "all" → no date filter

    const pipelinePosts = (pipelineStart && pipelineEnd)
      ? posts.filter((p) => {
          // Posts without a scheduled date (Pending, Approved) are always included
          const d = p.fields["Scheduled Date"];
          if (!d) return true;
          const date = new Date(d);
          return date >= pipelineStart! && date <= pipelineEnd!;
        })
      : posts;

    // Status counts within the pipeline window
    const postsByStatus: Record<string, number> = {
      Pending: 0, Approved: 0, Modified: 0, Queued: 0, Scheduled: 0, Published: 0, Failed: 0, Dismissed: 0,
    };
    for (const p of pipelinePosts) {
      const s = p.fields.Status || "Pending";
      postsByStatus[s] = (postsByStatus[s] || 0) + 1;
    }

    // Posts needing review (Pending or Modified)
    const pendingReview = posts
      .filter((p) => p.fields.Status === "Pending" || p.fields.Status === "Modified")
      .sort((a, b) => {
        const da = a.fields["Scheduled Date"] || "9999";
        const db = b.fields["Scheduled Date"] || "9999";
        return da.localeCompare(db);
      })
      .slice(0, 10)
      .map((p) => {
        const campaign = campaigns.find((c) => p.fields.Campaign?.includes(c.id));
        return {
          id: p.id,
          platform: p.fields.Platform,
          content: (p.fields.Content || "").slice(0, 120),
          scheduledDate: p.fields["Scheduled Date"],
          imageUrl: p.fields["Image URL"],
          campaignId: campaign?.id,
          campaignName: campaign?.fields.Name || "Unknown",
        };
      });

    // Failed posts
    const failedPosts = posts
      .filter((p) => p.fields.Status === "Failed")
      .slice(0, 5)
      .map((p) => {
        const campaign = campaigns.find((c) => p.fields.Campaign?.includes(c.id));
        return {
          id: p.id,
          platform: p.fields.Platform,
          content: (p.fields.Content || "").slice(0, 80),
          campaignId: campaign?.id,
          campaignName: campaign?.fields.Name || "Unknown",
          zernioPostId: p.fields["Zernio Post ID"],
        };
      });

    // ── Attention buckets (Issue #146) ───────────────────────────────────
    // Helper to build a row payload (consistent shape across all attention tabs)
    const buildAttentionRow = (p: typeof posts[number]) => {
      const campaign = campaigns.find((c) => p.fields.Campaign?.includes(c.id));
      return {
        id: p.id,
        platform: p.fields.Platform,
        content: (p.fields.Content || "").slice(0, 120),
        scheduledDate: p.fields["Scheduled Date"] || "",
        imageUrl: p.fields["Image URL"] || "",
        campaignId: campaign?.id || "",
        campaignName: campaign?.fields.Name || "Unknown",
        status: p.fields.Status,
        createdTime: (p as { createdTime?: string }).createdTime || "",
      };
    };

    // Newest-first sort by Airtable createdTime, with id as a stable tiebreaker
    const sortByCreatedDesc = (a: typeof posts[number], b: typeof posts[number]) => {
      const ta = (a as { createdTime?: string }).createdTime || "";
      const tb = (b as { createdTime?: string }).createdTime || "";
      if (ta !== tb) return tb.localeCompare(ta);
      return b.id.localeCompare(a.id);
    };

    // 1. Approved → not scheduled (the killer view)
    const approvedUnscheduledPosts = posts.filter(
      (p) =>
        p.fields.Status === "Approved" &&
        !p.fields["Scheduled Date"]
    );
    const approvedUnscheduled = [...approvedUnscheduledPosts]
      .sort(sortByCreatedDesc)
      .slice(0, 50)
      .map(buildAttentionRow);

    // 2. Failed (full list, separate from the 5-post failedPosts above)
    const failedAllPosts = posts.filter((p) => p.fields.Status === "Failed");
    const failedAttention = [...failedAllPosts]
      .sort(sortByCreatedDesc)
      .slice(0, 50)
      .map(buildAttentionRow);

    // 3. Modified (literal — text edits not re-approved)
    const modifiedPosts = posts.filter((p) => p.fields.Status === "Modified");
    const modified = [...modifiedPosts]
      .sort(sortByCreatedDesc)
      .slice(0, 50)
      .map(buildAttentionRow);

    // 4. Rich-asset work in flight — derived signal
    //    has carousel (Media URLs has 2+ entries) OR cover slide data OR original media (image swap)
    //    AND status is NOT Scheduled or Published
    const TERMINAL_STATUSES: PostStatus[] = ["Scheduled", "Published"];
    const richAssetPosts = posts.filter((p) => {
      if (TERMINAL_STATUSES.includes(p.fields.Status)) return false;
      const mediaUrls = (p.fields["Media URLs"] || "")
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const hasCarousel = mediaUrls.length > 1;
      const hasCoverSlide = !!(p.fields["Cover Slide Data"] || "").trim();
      const hasOriginalMedia = !!(p.fields["Original Media"] || "").trim();
      return hasCarousel || hasCoverSlide || hasOriginalMedia;
    });
    const richAssetInFlight = [...richAssetPosts]
      .sort(sortByCreatedDesc)
      .slice(0, 50)
      .map(buildAttentionRow);

    const attentionCounts = {
      approvedUnscheduled: approvedUnscheduledPosts.length,
      failed: failedAllPosts.length,
      modified: modifiedPosts.length,
      richAssetInFlight: richAssetPosts.length,
    };

    // Time-based stats
    const weekFromNow = new Date(now.getTime() + 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const scheduledThisWeek = posts.filter((p) => {
      const d = p.fields["Scheduled Date"];
      if (!d) return false;
      const date = new Date(d);
      return date >= now && date <= weekFromNow && ["Queued", "Scheduled", "Approved"].includes(p.fields.Status);
    }).length;

    const publishedThisMonth = posts.filter((p) => {
      const d = p.fields["Scheduled Date"];
      if (!d) return false;
      return new Date(d) >= monthStart && p.fields.Status === "Published";
    }).length;

    // Timeline data for heatmap (posts with dates, last 90 days + next 90 days)
    const timelineStart = new Date(now.getTime() - 90 * 86400000);
    const timelineEnd = new Date(now.getTime() + 90 * 86400000);
    const timeline = posts
      .filter((p) => {
        const d = p.fields["Scheduled Date"];
        if (!d) return false;
        const date = new Date(d);
        return date >= timelineStart && date <= timelineEnd;
      })
      .map((p) => ({
        date: p.fields["Scheduled Date"],
        platform: p.fields.Platform,
        status: p.fields.Status,
      }));

    // Platform distribution (non-dismissed posts)
    const platformCounts: Record<string, number> = {};
    for (const p of posts) {
      if (p.fields.Status === "Dismissed") continue;
      const plat = p.fields.Platform || "Unknown";
      platformCounts[plat] = (platformCounts[plat] || 0) + 1;
    }

    // Summary stats for hero section
    const totalPostsAllTime = posts.filter((p) => p.fields.Status !== "Dismissed").length;
    const totalPublished = posts.filter((p) => p.fields.Status === "Published").length;
    const platformsUsed = Object.keys(platformCounts).length;

    // Upcoming scheduled posts (next 5, sorted by date)
    const upcomingPosts = posts
      .filter((p) => {
        const d = p.fields["Scheduled Date"];
        if (!d) return false;
        return new Date(d) >= now && ["Approved", "Queued", "Scheduled"].includes(p.fields.Status);
      })
      .sort((a, b) => (a.fields["Scheduled Date"] || "").localeCompare(b.fields["Scheduled Date"] || ""))
      .slice(0, 5)
      .map((p) => {
        const campaign = campaigns.find((c) => p.fields.Campaign?.includes(c.id));
        return {
          id: p.id,
          platform: p.fields.Platform,
          content: (p.fields.Content || "").slice(0, 80),
          scheduledDate: p.fields["Scheduled Date"],
          imageUrl: p.fields["Image URL"],
          campaignName: campaign?.fields.Name || "Unknown",
        };
      });

    // Dates with posts (for calendar dot indicators)
    const postDates: Record<string, { scheduled: number; published: number; pending: number }> = {};
    for (const p of posts) {
      const d = p.fields["Scheduled Date"]?.split("T")[0];
      if (!d) continue;
      if (!postDates[d]) postDates[d] = { scheduled: 0, published: 0, pending: 0 };
      if (p.fields.Status === "Published") postDates[d].published++;
      else if (p.fields.Status === "Pending" || p.fields.Status === "Modified") postDates[d].pending++;
      else if (["Approved", "Queued", "Scheduled"].includes(p.fields.Status)) postDates[d].scheduled++;
    }

    return NextResponse.json({
      campaigns: {
        total: campaigns.length,
        byStatus: campaigns.reduce((acc, c) => {
          acc[c.fields.Status] = (acc[c.fields.Status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        active: activeCampaigns,
      },
      pipelineWindow,
      posts: {
        byStatus: postsByStatus,
        pendingReview,
        failedPosts,
        approvedUnscheduled,
        modified,
        richAssetInFlight,
        failed: failedAttention,
        attentionCounts,
        scheduledThisWeek,
        publishedThisMonth,
      },
      timeline,
      summary: {
        totalPosts: totalPostsAllTime,
        totalPublished,
        totalCampaigns: campaigns.length,
        platformsUsed,
        platformCounts,
      },
      upcoming: upcomingPosts,
      postDates,
    });
  } catch (err) {
    console.error("[dashboard] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
