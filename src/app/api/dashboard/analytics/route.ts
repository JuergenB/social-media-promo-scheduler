import { NextRequest, NextResponse } from "next/server";
import { getUserBrandAccess, hasBrandAccess } from "@/lib/brand-access";
import { createBrandClient, resolveZernioKey } from "@/lib/late-api/client";
import { listRecords } from "@/lib/airtable/client";

const ZERNIO_BASE_URL = "https://zernio.com/api";
const DISPLAY_TZ = "America/New_York";

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
  // Best posting times — (dayOfWeek, hour) already converted from UTC to ET.
  // 0 = Sunday, 6 = Saturday. hour is 0–23 in America/New_York.
  bestTimes: Array<{
    dayOfWeek: number;
    hour: number;
    avgEngagement: number;
    postCount: number;
  }>;
  lastUpdated: string;
}

interface BrandFields {
  Name: string;
  "Zernio API Key Label": string;
}

// Convert a (dayOfWeek, hour) slot from UTC to America/New_York, respecting DST.
// Uses the current week's Sunday as a reference so the Intl TZ math picks the
// correct offset for the season we're in right now.
function convertUtcSlotToDisplayTz(
  dayOfWeekUtc: number,
  hourUtc: number,
): { dayOfWeek: number; hour: number } {
  const ref = new Date();
  ref.setUTCHours(0, 0, 0, 0);
  ref.setUTCDate(ref.getUTCDate() - ref.getUTCDay());
  const utcMs = ref.getTime() + (dayOfWeekUtc * 24 + hourUtc) * 3_600_000;
  const utc = new Date(utcMs);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(utc);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    dayOfWeek: weekdayMap[weekday] ?? 0,
    hour: parseInt(hourStr, 10) % 24,
  };
}

interface BestTimeRawSlot {
  day_of_week: number;
  hour: number;
  avg_engagement: number;
  post_count: number;
}

async function fetchBestTimes(apiKey: string): Promise<
  AnalyticsResponse["bestTimes"]
> {
  const res = await fetch(`${ZERNIO_BASE_URL}/v1/analytics/best-time`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[analytics] best-time fetch failed:", res.status);
    return [];
  }
  const body = (await res.json()) as { slots?: BestTimeRawSlot[] };
  const slots = body.slots ?? [];

  // Collapse any collisions that could theoretically arise from TZ conversion
  // by summing post_count and weighting avg_engagement by post_count.
  const agg = new Map<
    string,
    { dayOfWeek: number; hour: number; weighted: number; postCount: number }
  >();
  for (const s of slots) {
    const { dayOfWeek, hour } = convertUtcSlotToDisplayTz(
      s.day_of_week,
      s.hour,
    );
    const key = `${dayOfWeek}-${hour}`;
    const existing = agg.get(key);
    if (existing) {
      existing.weighted += s.avg_engagement * s.post_count;
      existing.postCount += s.post_count;
    } else {
      agg.set(key, {
        dayOfWeek,
        hour,
        weighted: s.avg_engagement * s.post_count,
        postCount: s.post_count,
      });
    }
  }
  return Array.from(agg.values()).map((v) => ({
    dayOfWeek: v.dayOfWeek,
    hour: v.hour,
    avgEngagement: v.postCount > 0 ? v.weighted / v.postCount : 0,
    postCount: v.postCount,
  }));
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

    // ── Zernio best-time data (SDK doesn't cover this endpoint) ───────
    let bestTimes: AnalyticsResponse["bestTimes"] = [];
    try {
      const apiKey = resolveZernioKey({
        zernioApiKeyLabel: brand?.["Zernio API Key Label"] || null,
      });
      bestTimes = await fetchBestTimes(apiKey);
    } catch (err) {
      console.error("[analytics] best-time error:", err);
    }

    const response: AnalyticsResponse = {
      engagement,
      bestTimes,
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
