import { NextRequest, NextResponse } from "next/server";
import { getUserBrandAccess, hasBrandAccess } from "@/lib/brand-access";
import { createBrandClient } from "@/lib/late-api/client";
import { listRecords } from "@/lib/airtable/client";

// ── In-memory cache (5-minute TTL) ─────────────────────────────────────
interface CacheEntry {
  data: AnalyticsResponse;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

interface AnalyticsResponse {
  engagement: {
    totalImpressions: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalViews: number;
    totalClicks: number;
    postsTracked: number;
    byPlatform: Record<
      string,
      {
        impressions: number;
        likes: number;
        comments: number;
        shares: number;
        views: number;
        posts: number;
      }
    >;
    topPosts: Array<{
      content: string;
      platform: string;
      impressions: number;
      likes: number;
      comments: number;
      engagementRate: number;
      publishedAt: string;
    }>;
  };
  lastUpdated: string;
}

interface BrandFields {
  Name: string;
  "Zernio API Key Label": string;
}

/**
 * GET /api/dashboard/analytics?brandId=recXXX
 *
 * Returns aggregated analytics: Zernio engagement + Short.io link clicks.
 * Cached for 5 minutes to avoid rate-limiting external APIs.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await getUserBrandAccess();
    const brandId = request.nextUrl.searchParams.get("brandId");

    if (!brandId) {
      return NextResponse.json(
        { error: "brandId is required" },
        { status: 400 }
      );
    }

    if (access && !hasBrandAccess(access, brandId)) {
      return NextResponse.json(
        { error: "Unauthorized for this brand" },
        { status: 403 }
      );
    }

    // Check cache
    const cacheKey = `analytics-${brandId}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return NextResponse.json(cached.data);
    }

    // Fetch brand config for API key resolution
    const brandRecords = await listRecords<BrandFields>("Brands", {
      filterByFormula: `RECORD_ID() = "${brandId}"`,
      fields: ["Name", "Zernio API Key Label"],
    });
    const brand = brandRecords[0]?.fields;

    // ── Zernio engagement data ────────────────────────────────────────
    const zernioClient = createBrandClient({
      zernioApiKeyLabel: brand?.["Zernio API Key Label"] || null,
    });

    let engagement: AnalyticsResponse["engagement"] = {
      totalImpressions: 0,
      totalLikes: 0,
      totalComments: 0,
      totalShares: 0,
      totalViews: 0,
      totalClicks: 0,
      postsTracked: 0,
      byPlatform: {},
      topPosts: [],
    };

    try {
      const result = await zernioClient.analytics.getAnalytics();
      const posts = result.data?.posts || [];

      engagement.postsTracked = posts.length;

      const allPosts: Array<{
        content: string;
        platform: string;
        impressions: number;
        likes: number;
        comments: number;
        engagementRate: number;
        publishedAt: string;
      }> = [];

      for (const post of posts) {
        const a = post.analytics;
        if (a) {
          engagement.totalImpressions += a.impressions || 0;
          engagement.totalLikes += a.likes || 0;
          engagement.totalComments += a.comments || 0;
          engagement.totalShares += a.shares || 0;
          engagement.totalViews += a.views || 0;
          engagement.totalClicks += a.clicks || 0;
        }

        for (const plat of post.platforms || []) {
          const name = plat.platform || "unknown";
          if (!engagement.byPlatform[name]) {
            engagement.byPlatform[name] = {
              impressions: 0,
              likes: 0,
              comments: 0,
              shares: 0,
              views: 0,
              posts: 0,
            };
          }
          const bp = engagement.byPlatform[name];
          bp.posts++;
          const pa = plat.analytics;
          if (pa) {
            bp.impressions += pa.impressions || 0;
            bp.likes += pa.likes || 0;
            bp.comments += pa.comments || 0;
            bp.shares += pa.shares || 0;
            bp.views += pa.views || 0;
          }

          if (pa && (pa.impressions || 0) > 0) {
            allPosts.push({
              content: (post.content || "").slice(0, 100),
              platform: name,
              impressions: pa.impressions || 0,
              likes: pa.likes || 0,
              comments: pa.comments || 0,
              engagementRate: pa.engagementRate || 0,
              publishedAt: post.publishedAt || "",
            });
          }
        }
      }

      // Top 5 posts by impressions
      engagement.topPosts = allPosts
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 5);
    } catch (err) {
      console.error("[analytics] Zernio analytics error:", err);
      // Continue with empty engagement data
    }

    const response: AnalyticsResponse = {
      engagement,
      lastUpdated: new Date().toISOString(),
    };

    // Cache the result
    cache.set(cacheKey, {
      data: response,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error("[analytics] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load analytics",
      },
      { status: 500 }
    );
  }
}
