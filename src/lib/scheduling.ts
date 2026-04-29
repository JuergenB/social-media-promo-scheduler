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

/**
 * Find the index in `validDays` whose cumulative weight first reaches the target.
 */
function cdfInvert(cumulative: number[], target: number): number {
  for (let j = 0; j < cumulative.length; j++) {
    if (cumulative[j] >= target) return j;
  }
  return cumulative.length - 1;
}

/**
 * Walk outward from `preferredIdx` to the nearest valid-day index whose count is
 * still below `maxPerDay`. When both sides have a candidate at the same offset,
 * prefer the heavier curve weight (closer to the curve's intent).
 */
function findAvailableDayIdx(
  preferredIdx: number,
  validDays: number[],
  dayCounts: Map<number, number>,
  maxPerDay: number,
  weights: number[],
): number {
  const isOpen = (idx: number) =>
    idx >= 0 &&
    idx < validDays.length &&
    (dayCounts.get(validDays[idx]) || 0) < maxPerDay;

  if (isOpen(preferredIdx)) return preferredIdx;

  for (let offset = 1; offset < validDays.length; offset++) {
    const left = preferredIdx - offset;
    const right = preferredIdx + offset;
    const leftOpen = isOpen(left);
    const rightOpen = isOpen(right);
    if (leftOpen && rightOpen) {
      return weights[left] >= weights[right] ? left : right;
    }
    if (leftOpen) return left;
    if (rightOpen) return right;
  }
  // No room anywhere — best-effort fallback (over-allocates the preferred day).
  return preferredIdx;
}

// ── Main scheduling function ──────────────────────────────────────────

/**
 * Distribute approved posts across the campaign timeline.
 *
 * Algorithm:
 * 1. Group posts by platform
 * 2. Generate a tapering curve for the campaign duration
 * 3. For each platform, distribute its posts across days proportionally
 *    to the curve weights, respecting per-platform cadence
 * 4. Assign specific times using organic variation
 */
export function schedulePostsAlgorithm(input: ScheduleInput): ScheduleSlot[] {
  const { posts, startDate, durationDays, bias, cadence: cadenceConfig, excludedDates } = input;

  if (posts.length === 0 || durationDays <= 0) return [];

  // Group posts by platform, then sort by sortOrder (ascending, nulls last)
  const byPlatform = new Map<string, Array<{ id: string; platform: string; sortOrder?: number | null }>>();
  for (const post of posts) {
    const existing = byPlatform.get(post.platform) || [];
    existing.push(post);
    byPlatform.set(post.platform, existing);
  }
  for (const [, platformPosts] of byPlatform) {
    platformPosts.sort((a, b) => {
      const aOrder = a.sortOrder ?? Infinity;
      const bOrder = b.sortOrder ?? Infinity;
      return aOrder - bOrder;
    });
  }

  // Generate the tapering curve
  const curve = generateCurve(durationDays, bias);

  const slots: ScheduleSlot[] = [];

  for (const [platform, platformPosts] of byPlatform) {
    const cadence = resolveCadence(platform, cadenceConfig);
    const postCount = platformPosts.length;

    // Build the platform's working state:
    // - validDays: day offsets allowed by activeDays
    // - dayCounts: per-day count (pre-loaded from excludedDates, mutated as we place)
    // - dayTimes: per-day list of decimal hours already placed (for spacing)
    const platformExcluded = excludedDates?.get(platform);
    const validDays: number[] = [];
    const dayCounts = new Map<number, number>();
    const dayTimes = new Map<number, number[]>();

    for (let d = 0; d < durationDays; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      if (!isDayActive(date, cadence)) continue;
      validDays.push(d);
      if (platformExcluded) {
        const dateStr = date.toISOString().split("T")[0];
        const existing = platformExcluded.get(dateStr) ?? 0;
        if (existing > 0) dayCounts.set(d, existing);
      }
    }

    if (validDays.length === 0) continue;

    // Cumulative-weight CDF over the valid days (skipping inactive days)
    const validWeights = validDays.map((d) => curve[d]);
    const totalWeight = validWeights.reduce((a, b) => a + b, 0);
    const normalized = validWeights.map((w) => w / totalWeight);
    const cumulative: number[] = [];
    let cum = 0;
    for (const w of normalized) {
      cum += w;
      cumulative.push(cum);
    }

    for (let i = 0; i < postCount; i++) {
      // Midpoint quantile sampling — never forces endpoints (issue #207).
      const target = (i + 0.5) / postCount;
      const preferredIdx = cdfInvert(cumulative, target);
      const dayIdx = findAvailableDayIdx(
        preferredIdx,
        validDays,
        dayCounts,
        cadence.maxPerDay,
        normalized,
      );
      const dayOffset = validDays[dayIdx];
      dayCounts.set(dayOffset, (dayCounts.get(dayOffset) || 0) + 1);

      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);

      const timesOnDay = dayTimes.get(dayOffset) || [];
      const time = pickTimeWithSpacing(cadence, timesOnDay);
      date.setHours(time.hour, time.minute, 0, 0);
      timesOnDay.push(time.decimal);
      dayTimes.set(dayOffset, timesOnDay);

      slots.push({
        postId: platformPosts[i].id,
        platform,
        scheduledDate: date.toISOString(),
      });
    }
  }

  // Sort by scheduled date
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
