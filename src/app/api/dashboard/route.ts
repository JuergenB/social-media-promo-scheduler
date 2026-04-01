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

    // Fetch campaigns for this brand
    const campaigns = await listRecords<CampaignFields>("Campaigns", {
      filterByFormula: `FIND("${brandId}", ARRAYJOIN(Brand))`,
      fields: ["Name", "Type", "Status", "Brand", "Duration Days", "Target Platforms", "URL"],
    });

    const campaignIds = new Set(campaigns.map((c) => c.id));

    // Fetch all posts (we'll filter by campaign IDs in memory)
    // Airtable doesn't support efficient IN-list filtering, so fetch all non-archived posts
    const allPosts = await listRecords<PostFields>("Posts", {
      fields: ["Content", "Platform", "Status", "Scheduled Date", "Image URL", "Short URL", "Campaign", "Zernio Post ID"],
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
      .filter((c) => c.fields.Status !== "Archived")
      .map((c) => ({
        id: c.id,
        name: c.fields.Name || "Untitled",
        type: c.fields.Type,
        status: c.fields.Status,
        url: c.fields.URL,
        postCounts: campaignPostCounts.get(c.id) || { total: 0, pending: 0, approved: 0, queued: 0, scheduled: 0, published: 0, failed: 0, dismissed: 0 },
      }));

    // Status counts across all posts
    const postsByStatus: Record<string, number> = {
      Pending: 0, Approved: 0, Modified: 0, Queued: 0, Scheduled: 0, Published: 0, Failed: 0, Dismissed: 0,
    };
    for (const p of posts) {
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
          campaignName: campaign?.fields.Name || "Unknown",
          zernioPostId: p.fields["Zernio Post ID"],
        };
      });

    // Time-based stats
    const now = new Date();
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

    return NextResponse.json({
      campaigns: {
        total: campaigns.length,
        byStatus: campaigns.reduce((acc, c) => {
          acc[c.fields.Status] = (acc[c.fields.Status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        active: activeCampaigns,
      },
      posts: {
        byStatus: postsByStatus,
        pendingReview,
        failedPosts,
        scheduledThisWeek,
        publishedThisMonth,
      },
      timeline,
    });
  } catch (err) {
    console.error("[dashboard] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
