/**
 * Campaign scheduling engine — distributes posts across a timeline
 * with configurable tapering based on distribution bias.
 *
 * The algorithm assigns date/time slots to approved posts based on:
 * - Campaign duration (days)
 * - Distribution bias (front-loaded, balanced, back-loaded)
 * - Per-brand, per-platform cadence preferences (with global defaults)
 * - Organic timing (randomized minutes within windows)
 *
 * Reference: Missinglettr-inspired exponential curve
 *
 * Phase A (issue #207): midpoint quantile sampling, maxPerDay enforcement,
 * minSpacingHours enforcement, count-aware excludedDates.
 * Phase B (issue #84 Phase 2): density-aware additive scheduling — when a
 * platform already has scheduled posts, new approved posts fill the curve's
 * residual deficits rather than piling into whatever days happen to be free.
 */

import type { DistributionBias, PlatformCadenceConfig } from "@/lib/airtable/types";
import {
  getEffectiveCadence,
  resolveTimeWindows,
} from "@/lib/platform-cadence-defaults";

// ── Types ──────────────────────────────────────────────────────────────

export interface ScheduleSlot {
  postId: string;
  platform: string;
  scheduledDate: string; // ISO datetime
}

export interface ScheduleInput {
  posts: Array<{
    id: string;
    platform: string;
    sortOrder?: number | null;
  }>;
  startDate: Date;
  durationDays: number;
  bias: DistributionBias;
  timezone?: string;
  /** Brand-level per-platform cadence overrides. Merged over global defaults. */
  cadence?: PlatformCadenceConfig | null;
  /**
   * Per-platform existing-post counts per day. The algorithm treats these as
   * already-placed when applying maxPerDay caps — a day with cadence allowing 2
   * posts and 1 already scheduled has 1 free slot, not 0.
   *
   * Outer key: platform (e.g. "instagram"). Inner key: "YYYY-MM-DD" matching the
   * UTC date component of `Scheduled Date` ISO strings (the route stores these
   * via `.split("T")[0]`). Inner value: number of posts already on that day.
   */
  excludedDates?: Map<string, Map<string, number>>;
  /**
   * How to interpret existing posts in `excludedDates`.
   *
   * - `true` (additive — same-campaign expansion, #84 Phase 2): existing posts
   *   contribute to the curve's total target distribution. New posts use
   *   greedy deficit-fill so the combined existing+new shape approximates
   *   scheduling totalPostCount from scratch.
   * - `false` (default — external collisions, #178 redistribute): existing
   *   posts are treated as pure collision constraints (other campaigns'
   *   posts, reserved slots). They count toward `maxPerDay` caps but do
   *   NOT shape the curve. Phase A midpoint-quantile sampling is used.
   */
  additiveMode?: boolean;
}

// ── Resolved cadence (internal) ───────────────────────────────────────

interface ResolvedCadence {
  maxPerDay: number;
  minSpacingHours: number;
  windows: number[];
  activeDays: number[];
}

/**
 * Resolve brand cadence entry → internal scheduling cadence.
 * Converts postsPerWeek to maxPerDay and maps time windows to hours.
 */
function resolveCadence(
  platform: string,
  cadence?: PlatformCadenceConfig | null,
): ResolvedCadence {
  const entry = getEffectiveCadence(platform, cadence);

  // Convert postsPerWeek → maxPerDay
  // Calculate based on active days per week
  const activeDaysPerWeek = entry.activeDays.length || 7;
  const maxPerDay = Math.max(1, Math.ceil(entry.postsPerWeek / activeDaysPerWeek));

  // Min spacing: if more than 1/day, space them out; otherwise 24h
  const minSpacingHours = maxPerDay > 1
    ? Math.max(2, Math.floor(24 / (maxPerDay + 1)))
    : 24;

  // Resolve time-of-day toggles to concrete hours
  const windows = resolveTimeWindows(platform, entry.timeWindows);

  return {
    maxPerDay,
    minSpacingHours,
    windows: windows.length > 0 ? windows : [10, 14],
    activeDays: entry.activeDays,
  };
}

// ── Tapering curve ─────────────────────────────────────────────────────

/**
 * Generate a tapering curve: an array of "weight" values for each day
 * in the campaign, where higher weight = more posts on that day.
 *
 * Front-loaded: exponential decay (heavy early, light later)
 * Balanced: uniform distribution
 * Back-loaded: exponential growth (light early, heavy later)
 */
function generateCurve(durationDays: number, bias: DistributionBias): number[] {
  const weights: number[] = [];

  for (let day = 0; day < durationDays; day++) {
    const t = durationDays > 1 ? day / (durationDays - 1) : 0; // 0 to 1

    let w: number;
    switch (bias) {
      case "Front-loaded":
        // Exponential decay: e^(-3t) gives ~20x weight at start vs end
        w = Math.exp(-3 * t);
        break;
      case "Back-loaded":
        // Exponential growth: e^(3(t-1)) gives ~20x weight at end vs start
        w = Math.exp(3 * (t - 1));
        break;
      case "Balanced":
      default:
        w = 1;
        break;
    }
    weights.push(w);
  }

  // Normalize so weights sum to 1
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => w / sum);
}

// ── Organic timing ─────────────────────────────────────────────────────

/**
 * Pick a random time from the platform's posting windows that satisfies
 * `minSpacingHours` against `existingHours` already placed on the same day
 * for the same platform. Falls back to a window pick if no slot fits — the
 * caller has already committed via `maxPerDay`, so a violation is preferable
 * to dropping the post.
 */
function pickTimeWithSpacing(
  cadence: ResolvedCadence,
  existingHours: number[],
): { hour: number; minute: number; decimal: number } {
  const tooClose = (decimalHour: number) =>
    existingHours.some(
      (existing) => Math.abs(existing - decimalHour) < cadence.minSpacingHours,
    );

  const candidate = (baseHour: number) => {
    const minuteOffset = Math.floor(Math.random() * 60) - 30;
    let hour = baseHour;
    let minute = minuteOffset;
    if (minute < 0) {
      minute = 60 + minute;
      hour = Math.max(0, hour - 1);
    } else if (minute > 59) {
      minute = minute - 60;
      hour = Math.min(23, hour + 1);
    }
    return { hour, minute, decimal: hour + minute / 60 };
  };

  // Shuffle the window hours and try each. Multiple attempts per hour cover
  // jitter that may push into a forbidden gap.
  const shuffled = [...cadence.windows].sort(() => Math.random() - 0.5);
  for (const baseHour of shuffled) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const c = candidate(baseHour);
      if (!tooClose(c.decimal)) return c;
    }
  }

  // No window+jitter combo satisfies spacing — the day is over-packed for
  // the cadence. Place anyway at a random window (best-effort fallback).
  return candidate(cadence.windows[Math.floor(Math.random() * cadence.windows.length)]);
}

/**
 * Check if a day of week is active for a platform.
 */
function isDayActive(date: Date, cadence: ResolvedCadence): boolean {
  if (cadence.activeDays.length === 0) return true;
  return cadence.activeDays.includes(date.getDay());
}

// ── Main scheduling function ──────────────────────────────────────────

interface PlatformState {
  cadence: ResolvedCadence;
  posts: Array<{ id: string; platform: string; sortOrder?: number | null }>;
  /** True if this day-offset is active for this platform. Length === durationDays. */
  activeMask: boolean[];
  /** Per day-offset: count of posts on this day (existing + placed-this-run). */
  dayCounts: Map<number, number>;
  /** Per day-offset: decimal hours already placed (for minSpacing checks). */
  dayTimes: Map<number, number[]>;
  /** Day-offsets where this run has placed a post (in placement order). */
  placedDayOffsets: number[];
}

/**
 * Distribute approved posts across the campaign timeline.
 *
 * Uses **global cross-platform greedy deficit-fill** rather than per-platform
 * independent quantile sampling. Each iteration picks the (platform, day)
 * pair with the largest deficit (`ideal[d] − placed[d]` aggregate) subject
 * to per-platform constraints. Avoids the synchronized-clustering pattern
 * that pure per-platform sampling produces — every platform sharing the
 * same curve no longer drives every platform's last quantile onto the same
 * tail-end days.
 *
 * Steps:
 * 1. Group posts by platform; preserve user `sortOrder` within each group.
 * 2. Generate aggregate ideal curve (one curve, scaled to total post count).
 * 3. For each placement, scan all (platform, day) pairs and pick the one
 *    that fills the most deficit. Tie-break by the platform that has placed
 *    the fewest posts so far (round-robin fairness), then earliest day,
 *    then deterministic platform name.
 * 4. After all placements, zip each platform's day-list (sorted ascending)
 *    with its sortOrder-sorted posts so post[sortOrder=0] gets the earliest
 *    day for that platform, post[sortOrder=1] the next, etc.
 * 5. Pick a time-of-day per slot using cadence windows + minSpacing.
 */
export function schedulePostsAlgorithm(input: ScheduleInput): ScheduleSlot[] {
  const {
    posts,
    startDate,
    durationDays,
    bias,
    cadence: cadenceConfig,
    excludedDates,
    additiveMode = false,
  } = input;

  if (posts.length === 0 || durationDays <= 0) return [];

  // ── 1. Group + sort posts per platform by sortOrder ────────────────
  const byPlatform = new Map<
    string,
    Array<{ id: string; platform: string; sortOrder?: number | null }>
  >();
  for (const post of posts) {
    const list = byPlatform.get(post.platform) ?? [];
    list.push(post);
    byPlatform.set(post.platform, list);
  }
  for (const [, list] of byPlatform) {
    list.sort((a, b) => {
      const ao = a.sortOrder ?? Infinity;
      const bo = b.sortOrder ?? Infinity;
      return ao - bo;
    });
  }

  // Curve over the full durationDays — single aggregate target shared across
  // all platforms (the key change vs. the previous per-platform approach).
  const curve = generateCurve(durationDays, bias);

  // ── 2. Build per-platform state ─────────────────────────────────────
  const states = new Map<string, PlatformState>();
  for (const [platform, platformPosts] of byPlatform) {
    const cadence = resolveCadence(platform, cadenceConfig);
    const platformExcluded = excludedDates?.get(platform);
    const activeMask: boolean[] = [];
    const dayCounts = new Map<number, number>();

    for (let d = 0; d < durationDays; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      const isActive = isDayActive(date, cadence);
      activeMask.push(isActive);
      if (isActive && platformExcluded) {
        const dateStr = date.toISOString().split("T")[0];
        const existing = platformExcluded.get(dateStr) ?? 0;
        if (existing > 0) dayCounts.set(d, existing);
      }
    }

    states.set(platform, {
      cadence,
      posts: platformPosts,
      activeMask,
      dayCounts,
      dayTimes: new Map(),
      placedDayOffsets: [],
    });
  }

  // ── 3. Compute global ideal curve ───────────────────────────────────
  // Aggregate target = curve × (newPostCount + existing-counted-toward-curve).
  // additiveMode: true → existing posts are part of the same campaign's
  //   distribution target, so they contribute to total. (#84 Phase 2)
  // additiveMode: false → existing in excludedDates are external collisions
  //   (other-campaign posts, reservations) — they constrain caps but do NOT
  //   reshape this campaign's curve target. (#178 redistribute)
  let curveTotalCount = posts.length;
  if (additiveMode) {
    for (const [, s] of states) {
      for (const [, count] of s.dayCounts) curveTotalCount += count;
    }
  }
  const idealPerDay = curve.map((w) => w * curveTotalCount);

  // Aggregate placed-per-day (across platforms). In additiveMode, pre-load
  // with existing counts so deficit reflects only what's still missing.
  const placedPerDay = new Array<number>(durationDays).fill(0);
  if (additiveMode) {
    for (const [, s] of states) {
      for (const [d, count] of s.dayCounts) placedPerDay[d] += count;
    }
  }

  // Stable platform ordering for deterministic tie-breaks
  const platformOrder = [...states.keys()].sort();
  const platformIndex = new Map(platformOrder.map((p, i) => [p, i] as const));

  // Track per-platform "placed-this-run" count for round-robin tie-break
  const placedThisRun = new Map<string, number>();
  for (const p of platformOrder) placedThisRun.set(p, 0);

  // ── 4. Greedy deficit-fill loop ─────────────────────────────────────
  const totalPostsToPlace = posts.length;
  let totalPlaced = 0;

  while (totalPlaced < totalPostsToPlace) {
    let bestPlatform: string | null = null;
    let bestDay = -1;
    let bestDeficit = -Infinity;
    let bestPlacedThisRun = Infinity;
    let bestPlatformIdx = Infinity;

    for (const platform of platformOrder) {
      const s = states.get(platform)!;
      if (s.placedDayOffsets.length >= s.posts.length) continue;
      const platPlaced = placedThisRun.get(platform)!;
      const platIdx = platformIndex.get(platform)!;

      for (let d = 0; d < durationDays; d++) {
        if (!s.activeMask[d]) continue;
        if ((s.dayCounts.get(d) ?? 0) >= s.cadence.maxPerDay) continue;
        const deficit = idealPerDay[d] - placedPerDay[d];
        // Lexicographic tie-break: (deficit desc, placedThisRun asc, day asc, platformIdx asc)
        if (
          deficit > bestDeficit ||
          (deficit === bestDeficit && platPlaced < bestPlacedThisRun) ||
          (deficit === bestDeficit && platPlaced === bestPlacedThisRun && d < bestDay) ||
          (deficit === bestDeficit && platPlaced === bestPlacedThisRun && d === bestDay && platIdx < bestPlatformIdx)
        ) {
          bestDeficit = deficit;
          bestPlatform = platform;
          bestDay = d;
          bestPlacedThisRun = platPlaced;
          bestPlatformIdx = platIdx;
        }
      }
    }

    if (bestPlatform === null || bestDay < 0) {
      // No platform has cap room on any active day — degraded mode.
      // Find any (platform, day) where the platform still has posts and
      // the day is active, ignoring maxPerDay (best-effort over-allocation).
      for (const platform of platformOrder) {
        const s = states.get(platform)!;
        if (s.placedDayOffsets.length >= s.posts.length) continue;
        for (let d = 0; d < durationDays; d++) {
          if (!s.activeMask[d]) continue;
          const deficit = idealPerDay[d] - placedPerDay[d];
          if (deficit > bestDeficit) {
            bestDeficit = deficit;
            bestPlatform = platform;
            bestDay = d;
          }
        }
      }
      if (bestPlatform === null || bestDay < 0) break; // truly stuck
    }

    // Place
    const s = states.get(bestPlatform)!;
    s.dayCounts.set(bestDay, (s.dayCounts.get(bestDay) ?? 0) + 1);
    s.placedDayOffsets.push(bestDay);
    placedPerDay[bestDay] += 1;
    placedThisRun.set(bestPlatform, placedThisRun.get(bestPlatform)! + 1);
    totalPlaced += 1;
  }

  // ── 5. Map sorted day-offsets to sortOrder-ordered posts + pick times ──
  const slots: ScheduleSlot[] = [];
  for (const [platform, s] of states) {
    const sortedDays = [...s.placedDayOffsets].sort((a, b) => a - b);
    for (let i = 0; i < sortedDays.length && i < s.posts.length; i++) {
      const dayOffset = sortedDays[i];
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      const timesOnDay = s.dayTimes.get(dayOffset) ?? [];
      const time = pickTimeWithSpacing(s.cadence, timesOnDay);
      date.setHours(time.hour, time.minute, 0, 0);
      timesOnDay.push(time.decimal);
      s.dayTimes.set(dayOffset, timesOnDay);
      slots.push({
        postId: s.posts[i].id,
        platform,
        scheduledDate: date.toISOString(),
      });
    }
  }

  // Sort by scheduled date for stable output
  slots.sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  return slots;
}

/**
 * Preview the schedule without assigning to specific posts.
 * Returns a summary of how many posts per platform per week.
 */
export function previewSchedule(input: Omit<ScheduleInput, "posts"> & {
  platformCounts: Record<string, number>;
}): Array<{
  week: number;
  startDate: string;
  platforms: Record<string, number>;
}> {
  const { platformCounts, startDate, durationDays, bias, cadence } = input;

  // Create dummy posts for each platform
  const posts: Array<{ id: string; platform: string }> = [];
  for (const [platform, count] of Object.entries(platformCounts)) {
    for (let i = 0; i < count; i++) {
      posts.push({ id: `preview-${platform}-${i}`, platform });
    }
  }

  const slots = schedulePostsAlgorithm({ posts, startDate, durationDays, bias, cadence });

  // Group into weeks
  const weeks = new Map<number, { startDate: string; platforms: Record<string, number> }>();
  for (const slot of slots) {
    const slotDate = new Date(slot.scheduledDate);
    const daysSinceStart = Math.floor((slotDate.getTime() - startDate.getTime()) / 86400000);
    const weekNum = Math.floor(daysSinceStart / 7);

    if (!weeks.has(weekNum)) {
      const weekStart = new Date(startDate);
      weekStart.setDate(weekStart.getDate() + weekNum * 7);
      weeks.set(weekNum, { startDate: weekStart.toISOString(), platforms: {} });
    }

    const week = weeks.get(weekNum)!;
    week.platforms[slot.platform] = (week.platforms[slot.platform] || 0) + 1;
  }

  return [...weeks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, data]) => ({ week, ...data }));
}
