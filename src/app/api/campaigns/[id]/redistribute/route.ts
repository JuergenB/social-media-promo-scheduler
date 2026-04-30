/**
 * POST /api/campaigns/[id]/redistribute
 *
 * Phase D of the scheduling-trust epic ([#178](https://github.com/JuergenB/polywiz-app/issues/178)).
 *
 * Re-spreads a campaign's surviving posts across a new date window using the
 * existing scheduler. Treats brand-wide other-campaign posts as collision
 * constraints (not as additive contributions to this campaign's curve).
 *
 * Modes:
 *   - `apply: false` (default) — preview. Returns the proposed mapping
 *     `{ postId, oldDate, newDate, platform }[]` without writing.
 *   - `apply: true` — commits Airtable updates, then fires Zernio + lnk.bio
 *     sync per Scheduled post. Approved posts only get an Airtable date
 *     update (no downstream until the campaign is scheduled).
 *
 * Participation:
 *   - Re-placed: Approved + Scheduled (both get new dates).
 *   - Reservations (collision-only): Pending posts with a Scheduled Date.
 *   - Excluded: Published (dates spent), Dismissed (irrelevant).
 *
 * Cross-campaign collisions: every Scheduled/Published post for the same
 * brand on other campaigns becomes part of `excludedDates`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRecord, listRecords, updateRecord } from "@/lib/airtable/client";
import { getUserBrandAccess, hasCampaignAccess } from "@/lib/brand-access";
import { schedulePostsAlgorithm, type ScheduleSlot } from "@/lib/scheduling";
import { applyPostChanges } from "@/lib/post-apply";
import type { DistributionBias, PlatformCadenceConfig } from "@/lib/airtable/types";

// Vercel: 60s max on Pro for serverless functions. Apply mode runs through
// a per-API-throttled chain (see src/lib/api-throttle.ts), so wall-clock
// scales with number of posts. For ~20 posts that's ~50s; for 25+ this
// will time out and Phase 3 (downstream sync) should be moved to SSE
// streaming. Tracked as a follow-up.
export const maxDuration = 60;

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
};

interface CampaignFields {
  Name: string;
  Brand: string[];
  "Duration Days": number;
  "Distribution Bias": string;
  "Start Date"?: string;
  "Platform Cadence"?: string;
}

interface PostFields {
  Campaign: string[];
  Platform: string;
  Status: string;
  "Scheduled Date"?: string;
  "Sort Order"?: number | null;
  "Zernio Post ID"?: string;
}

interface RedistributeBody {
  startDate?: unknown;
  endDate?: unknown;
  distributionBias?: unknown;
  apply?: unknown;
}

interface MappingEntry {
  postId: string;
  platform: string;
  oldDate: string | null;
  newDate: string;
  status: string;
}

const VALID_BIASES: DistributionBias[] = ["Front-loaded", "Balanced", "Back-loaded"];

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function diffDaysInclusive(start: Date, end: Date): number {
  const s = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const e = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((e - s) / 86_400_000) + 1;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campaignId } = await params;
    const body = (await request.json().catch(() => ({}))) as RedistributeBody;

    // ── Validate body ────────────────────────────────────────────────────
    if (!isYmd(body.startDate) || !isYmd(body.endDate)) {
      return NextResponse.json(
        { error: "startDate and endDate must be YYYY-MM-DD strings" },
        { status: 400 },
      );
    }
    if (typeof body.distributionBias !== "string" ||
        !VALID_BIASES.includes(body.distributionBias as DistributionBias)) {
      return NextResponse.json(
        { error: `distributionBias must be one of ${VALID_BIASES.join(", ")}` },
        { status: 400 },
      );
    }
    const apply = body.apply === true;
    const distributionBias = body.distributionBias as DistributionBias;

    const startDate = new Date(body.startDate + "T00:00:00");
    const endDate = new Date(body.endDate + "T00:00:00");
    if (endDate <= startDate) {
      return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });
    }
    const durationDays = diffDaysInclusive(startDate, endDate);

    // ── Auth + campaign ──────────────────────────────────────────────────
    const access = await getUserBrandAccess();
    const campaign = await getRecord<CampaignFields>("Campaigns", campaignId);
    if (access && !hasCampaignAccess(access, campaign.fields.Brand || [])) {
      return NextResponse.json(
        { error: "You do not have access to this campaign" },
        { status: 403 },
      );
    }
    const brandId = campaign.fields.Brand?.[0];
    if (!brandId) {
      return NextResponse.json({ error: "Campaign has no brand assigned" }, { status: 400 });
    }

    // ── Resolve cadence (campaign override → brand → globals) ────────────
    let cadence: PlatformCadenceConfig | null = null;
    if (campaign.fields["Platform Cadence"]) {
      try {
        cadence = JSON.parse(campaign.fields["Platform Cadence"]) as PlatformCadenceConfig;
      } catch { /* fall through */ }
    }
    if (!cadence) {
      try {
        const brand = await getRecord<{ "Platform Cadence"?: string }>("Brands", brandId);
        if (brand.fields["Platform Cadence"]) {
          cadence = JSON.parse(brand.fields["Platform Cadence"]) as PlatformCadenceConfig;
        }
      } catch { /* fall through */ }
    }

    // ── Fetch all posts; partition into participants / reservations / externals ─
    // The Airtable filter API can't easily express "linked record contains X",
    // so we paginate everything and filter in memory. Same pattern as
    // simulate-campaign-schedule.mts.
    const allPosts = await listRecords<PostFields>("Posts", {});

    const thisCampaignPosts = allPosts.filter(
      (p) => p.fields.Campaign?.includes(campaignId),
    );

    // Participants: re-placed in this run.
    const participants = thisCampaignPosts.filter(
      (p) => p.fields.Status === "Approved" || p.fields.Status === "Scheduled",
    );
    if (participants.length === 0) {
      return NextResponse.json(
        { error: "No Approved or Scheduled posts to redistribute" },
        { status: 400 },
      );
    }

    // Reservations: this campaign's Pending posts that have a Scheduled Date —
    // they hold their slot, contribute to collision-avoidance counts.
    const thisCampaignReservations = thisCampaignPosts.filter(
      (p) => p.fields.Status === "Pending" && p.fields["Scheduled Date"],
    );

    // Externals: brand-wide other-campaign Scheduled+Published posts.
    // Determine "this brand" by reading every campaign in the brand and
    // collecting their post IDs. Cheaper alternative: trust that posts'
    // Brand link (if any) matches campaign brand — but Posts table doesn't
    // carry a direct Brand field, so we go through Campaigns.
    const allCampaigns = await listRecords<{ Brand?: string[] }>("Campaigns", {});
    const sameBrandCampaignIds = new Set(
      allCampaigns
        .filter((c) => c.fields.Brand?.includes(brandId))
        .map((c) => c.id),
    );
    const externalPosts = allPosts.filter((p) => {
      const cIds = p.fields.Campaign || [];
      // Same brand, NOT this campaign, status takes a slot.
      const inSameBrand = cIds.some((id) => sameBrandCampaignIds.has(id));
      const inThisCampaign = cIds.includes(campaignId);
      const occupiesSlot =
        p.fields.Status === "Scheduled" || p.fields.Status === "Published";
      return inSameBrand && !inThisCampaign && occupiesSlot && !!p.fields["Scheduled Date"];
    });

    // Count externals that actually fall WITHIN the redistribute window — these
    // are the ones that will affect placement. Out-of-window externals are
    // silently dropped by the scheduler's per-day lookup; counting them in the
    // displayed stat would overstate collision pressure.
    const windowStartMs = startDate.getTime();
    const windowEndMs = new Date(startDate.getTime() + durationDays * 86_400_000).getTime();
    const inWindowExternalCount = externalPosts.reduce((acc, p) => {
      const t = new Date(p.fields["Scheduled Date"]!).getTime();
      return t >= windowStartMs && t < windowEndMs ? acc + 1 : acc;
    }, 0);
    const inWindowReservationCount = thisCampaignReservations.reduce((acc, p) => {
      const t = new Date(p.fields["Scheduled Date"]!).getTime();
      return t >= windowStartMs && t < windowEndMs ? acc + 1 : acc;
    }, 0);

    // Build excludedDates: per platform, count of slots taken per day key
    // (UTC component, to match what schedulePostsAlgorithm reads).
    const excludedDates = new Map<string, Map<string, number>>();
    const recordSlot = (platformAirtable: string, isoDate: string) => {
      const platform =
        PLATFORM_MAP[platformAirtable] || platformAirtable.toLowerCase();
      const dateStr = isoDate.split("T")[0];
      let perPlatform = excludedDates.get(platform);
      if (!perPlatform) {
        perPlatform = new Map<string, number>();
        excludedDates.set(platform, perPlatform);
      }
      perPlatform.set(dateStr, (perPlatform.get(dateStr) ?? 0) + 1);
    };
    for (const p of externalPosts) {
      recordSlot(p.fields.Platform, p.fields["Scheduled Date"]!);
    }
    for (const p of thisCampaignReservations) {
      recordSlot(p.fields.Platform, p.fields["Scheduled Date"]!);
    }

    // ── Run scheduler ────────────────────────────────────────────────────
    const algoPosts = participants.map((p) => ({
      id: p.id,
      platform: PLATFORM_MAP[p.fields.Platform] || p.fields.Platform.toLowerCase(),
      sortOrder: p.fields["Sort Order"] ?? null,
    }));

    const slots: ScheduleSlot[] = schedulePostsAlgorithm({
      posts: algoPosts,
      startDate,
      durationDays,
      bias: distributionBias,
      cadence,
      excludedDates,
      additiveMode: false,
    });

    const slotByPostId = new Map<string, ScheduleSlot>();
    for (const s of slots) slotByPostId.set(s.postId, s);

    const mapping: MappingEntry[] = participants.map((p) => {
      const slot = slotByPostId.get(p.id);
      return {
        postId: p.id,
        platform: PLATFORM_MAP[p.fields.Platform] || p.fields.Platform.toLowerCase(),
        oldDate: p.fields["Scheduled Date"] ?? null,
        newDate: slot?.scheduledDate ?? "",
        status: p.fields.Status,
      };
    });

    // ── Preview mode: return without writing ─────────────────────────────
    if (!apply) {
      return NextResponse.json({
        preview: true,
        campaignId,
        startDate: body.startDate,
        endDate: body.endDate,
        durationDays,
        distributionBias,
        participantCount: participants.length,
        // In-window collision counts are what the scheduler actually consults
        // and what affects placement. The full brand-wide totals are returned
        // separately for diagnostics.
        externalCollisionCount: inWindowExternalCount,
        reservationCount: inWindowReservationCount,
        diagnostics: {
          totalBrandWideExternalCount: externalPosts.length,
          totalReservationCount: thisCampaignReservations.length,
        },
        mapping,
      });
    }

    // ── Apply mode ───────────────────────────────────────────────────────
    const applyStartMs = Date.now();
    // Strategy (per spec's proposed default for partial-failure UX):
    // 1. Update all Airtable post dates first (atomic enough — Airtable does
    //    not give us a transaction, but per-record updates are independent).
    // 2. Update campaign Start Date / Duration Days / Distribution Bias.
    // 3. For each Scheduled post (has Zernio Post ID), call applyPostChanges
    //    to sync the new scheduledFor to Zernio + re-sync lnk.bio. Approved
    //    posts have no Zernio post yet, so just the Airtable date update.
    // 4. Collect per-post results; return summary so the UI can surface
    //    partial failures and offer retry.

    const results: Array<{
      postId: string;
      platform: string;
      airtable: "ok" | "error";
      downstream: "ok" | "skipped" | "error";
      error?: string;
    }> = [];

    for (const m of mapping) {
      if (!m.newDate) {
        results.push({
          postId: m.postId,
          platform: m.platform,
          airtable: "error",
          downstream: "skipped",
          error: "Scheduler returned no slot",
        });
        continue;
      }
      try {
        await updateRecord("Posts", m.postId, { "Scheduled Date": m.newDate });
        results.push({
          postId: m.postId,
          platform: m.platform,
          airtable: "ok",
          downstream: "skipped",
        });
      } catch (err) {
        results.push({
          postId: m.postId,
          platform: m.platform,
          airtable: "error",
          downstream: "skipped",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Update campaign window
    try {
      await updateRecord("Campaigns", campaignId, {
        "Start Date": body.startDate,
        "Duration Days": durationDays,
        "Distribution Bias": distributionBias,
      });
    } catch (err) {
      console.error(`[redistribute] Failed to update campaign window for ${campaignId}:`, err);
    }

    // Downstream sync: Scheduled posts get Zernio updatePost + lnk.bio re-sync.
    // Sequential rather than parallel so we don't blast Zernio's rate limit.
    for (const m of mapping) {
      const result = results.find((r) => r.postId === m.postId);
      if (!result || result.airtable !== "ok") continue;
      if (m.status !== "Scheduled") continue;
      try {
        const sync = await applyPostChanges(m.postId);
        if (sync.zernio === "ok" || sync.zernio === "skipped") {
          result.downstream = sync.lnkBio === "error" ? "error" : "ok";
        } else {
          result.downstream = "error";
        }
        if (sync.error) result.error = sync.error;
      } catch (err) {
        result.downstream = "error";
        result.error = err instanceof Error ? err.message : String(err);
      }
    }

    const summary = {
      total: results.length,
      airtableOk: results.filter((r) => r.airtable === "ok").length,
      downstreamOk: results.filter((r) => r.downstream === "ok").length,
      downstreamSkipped: results.filter((r) => r.downstream === "skipped").length,
      failures: results.filter((r) => r.airtable === "error" || r.downstream === "error").length,
      wallClockMs: Date.now() - applyStartMs,
    };

    console.log(`[redistribute] Campaign ${campaignId} applied:`, summary);

    return NextResponse.json({
      applied: true,
      campaignId,
      startDate: body.startDate,
      endDate: body.endDate,
      durationDays,
      distributionBias,
      summary,
      results,
    });
  } catch (error) {
    console.error("[redistribute] Failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to redistribute" },
      { status: 500 },
    );
  }
}
