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
  }>;
  startDate: Date;
  durationDays: number;
  bias: DistributionBias;
  timezone?: string;
  /** Brand-level per-platform cadence overrides. Merged over global defaults. */
  brandCadence?: PlatformCadenceConfig | null;
  /** Per-platform dates that are already taken (avoid scheduling on these days) */
  excludedDates?: Map<string, Set<string>>; // platform → set of "YYYY-MM-DD" strings
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
  brandCadence?: PlatformCadenceConfig | null,
): ResolvedCadence {
  const entry = getEffectiveCadence(platform, brandCadence);

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
 * Pick a random time from the platform's posting windows with
 * organic variation (±30 minutes).
 */
function pickTime(cadence: ResolvedCadence): { hour: number; minute: number } {
  const baseHour = cadence.windows[Math.floor(Math.random() * cadence.windows.length)];
  // Add organic variation: ±30 minutes
  const minuteOffset = Math.floor(Math.random() * 60) - 30;
  let hour = baseHour;
  let minute = Math.max(0, Math.min(59, minuteOffset));
  if (minuteOffset < 0) {
    minute = 60 + minuteOffset;
    hour = Math.max(0, hour - 1);
  }
  return { hour, minute };
}

/**
 * Check if a day of week is active for a platform.
 */
function isDayActive(date: Date, cadence: ResolvedCadence): boolean {
  if (cadence.activeDays.length === 0) return true;
  return cadence.activeDays.includes(date.getDay());
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
  const { posts, startDate, durationDays, bias, brandCadence, excludedDates } = input;

  if (posts.length === 0 || durationDays <= 0) return [];

  // Group posts by platform
  const byPlatform = new Map<string, Array<{ id: string; platform: string }>>();
  for (const post of posts) {
    const existing = byPlatform.get(post.platform) || [];
    existing.push(post);
    byPlatform.set(post.platform, existing);
  }

  // Generate the tapering curve
  const curve = generateCurve(durationDays, bias);

  const slots: ScheduleSlot[] = [];

  for (const [platform, platformPosts] of byPlatform) {
    const cadence = resolveCadence(platform, brandCadence);
    const postCount = platformPosts.length;

    // Find valid days (active days within duration, excluding already-scheduled)
    const platformExcluded = excludedDates?.get(platform);
    const validDays: number[] = [];
    for (let d = 0; d < durationDays; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      if (!isDayActive(date, cadence)) continue;
      // Skip days that already have a post for this platform
      if (platformExcluded) {
        const dateStr = date.toISOString().split("T")[0];
        if (platformExcluded.has(dateStr)) continue;
      }
      validDays.push(d);
    }

    if (validDays.length === 0) continue;

    // Calculate cumulative weights for valid days only
    const validWeights = validDays.map((d) => curve[d]);
    const totalWeight = validWeights.reduce((a, b) => a + b, 0);
    const normalizedWeights = validWeights.map((w) => w / totalWeight);

    // Assign posts to days using weighted distribution
    // Use cumulative distribution to spread posts evenly according to curve
    const cumulative: number[] = [];
    let cum = 0;
    for (const w of normalizedWeights) {
      cum += w;
      cumulative.push(cum);
    }

    for (let i = 0; i < postCount; i++) {
      // Map post index to a position in the curve
      const target = postCount > 1 ? i / (postCount - 1) : 0.5;

      // Find the day whose cumulative weight is closest to the target
      let dayIdx = 0;
      for (let j = 0; j < cumulative.length; j++) {
        if (cumulative[j] >= target) {
          dayIdx = j;
          break;
        }
        dayIdx = j;
      }

      const dayOffset = validDays[dayIdx];
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);

      // Pick a time with organic variation
      const time = pickTime(cadence);
      date.setHours(time.hour, time.minute, 0, 0);

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
  const { platformCounts, startDate, durationDays, bias, brandCadence } = input;

  // Create dummy posts for each platform
  const posts: Array<{ id: string; platform: string }> = [];
  for (const [platform, count] of Object.entries(platformCounts)) {
    for (let i = 0; i < count; i++) {
      posts.push({ id: `preview-${platform}-${i}`, platform });
    }
  }

  const slots = schedulePostsAlgorithm({ posts, startDate, durationDays, bias, brandCadence });

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
