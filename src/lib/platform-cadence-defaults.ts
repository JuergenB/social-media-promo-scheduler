/**
 * Global platform cadence defaults — research-backed starting points
 * for arts/culture brands (2025-2026 best practices).
 *
 * These serve as fallbacks when a brand has no per-platform override.
 * Each platform maps time-of-day toggles (morning/afternoon/evening)
 * to platform-specific optimal posting hours.
 */

import type { PlatformCadenceEntry, TimeWindow } from "@/lib/airtable/types";

// ── Per-platform time window mappings ─────────────────────────────────
// "morning", "afternoon", "evening" map to different hours per platform,
// reflecting when each platform's audience is most active.

interface PlatformTimeMap {
  morning: number[];
  afternoon: number[];
  evening: number[];
}

export const PLATFORM_TIME_WINDOWS: Record<string, PlatformTimeMap> = {
  linkedin: {
    morning: [10, 11],      // Professionals checking in mid-morning
    afternoon: [13, 14, 15], // Post-lunch engagement
    evening: [17],           // End of workday
  },
  instagram: {
    morning: [9, 10, 11],
    afternoon: [12, 13, 14, 17], // Lunch + late afternoon
    evening: [18, 19],
  },
  facebook: {
    morning: [9, 10],
    afternoon: [12, 13, 14, 15], // Strongest window
    evening: [18, 19, 20],
  },
  threads: {
    morning: [9, 10, 11],   // Strongest window
    afternoon: [13, 14, 15],
    evening: [17, 18],
  },
  bluesky: {
    morning: [9, 10, 11],
    afternoon: [12, 13, 14],
    evening: [17, 18],
  },
  pinterest: {
    morning: [8, 9, 10, 11], // Secondary window
    afternoon: [14],
    evening: [19, 20, 21, 22], // Primary window — leisure browsing
  },
  twitter: {
    morning: [8, 9, 10, 11],  // Peak: 10-11am
    afternoon: [13, 14, 15, 17],
    evening: [19, 20],
  },
};

const FALLBACK_TIME_MAP: PlatformTimeMap = {
  morning: [9, 10],
  afternoon: [13, 14],
  evening: [18],
};

// ── Global defaults per platform ──────────────────────────────────────

export const GLOBAL_CADENCE_DEFAULTS: Record<string, PlatformCadenceEntry> = {
  linkedin: {
    postsPerWeek: 3,
    activeDays: [1, 2, 3, 4, 5], // Weekdays only
    timeWindows: ["morning", "afternoon"],
  },
  instagram: {
    postsPerWeek: 4,
    activeDays: [1, 2, 3, 4, 5], // Weekdays
    timeWindows: ["morning", "afternoon"],
  },
  facebook: {
    postsPerWeek: 3,
    activeDays: [1, 2, 3, 4, 5],
    timeWindows: ["afternoon"],
  },
  threads: {
    postsPerWeek: 5,
    activeDays: [1, 2, 3, 4, 5],
    timeWindows: ["morning", "afternoon"],
  },
  bluesky: {
    postsPerWeek: 3,
    activeDays: [1, 2, 3, 4, 5],
    timeWindows: ["morning", "afternoon"],
  },
  pinterest: {
    postsPerWeek: 4,
    activeDays: [], // All days — Pinterest is leisure-driven
    timeWindows: ["evening"],
  },
  twitter: {
    postsPerWeek: 10, // ~2/day weekdays
    activeDays: [1, 2, 3, 4, 5],
    timeWindows: ["morning", "afternoon"],
  },
  tiktok: {
    postsPerWeek: 3,
    activeDays: [],
    timeWindows: ["afternoon", "evening"],
  },
};

const FALLBACK_ENTRY: PlatformCadenceEntry = {
  postsPerWeek: 3,
  activeDays: [1, 2, 3, 4, 5],
  timeWindows: ["morning", "afternoon"],
};

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Get the effective cadence for a platform, merging brand overrides
 * over global defaults.
 */
export function getEffectiveCadence(
  platform: string,
  brandCadence: Record<string, PlatformCadenceEntry> | null | undefined,
): PlatformCadenceEntry {
  // Brand override takes priority
  if (brandCadence?.[platform]) return brandCadence[platform];
  // Then global default
  return GLOBAL_CADENCE_DEFAULTS[platform] || FALLBACK_ENTRY;
}

/**
 * Resolve time-of-day toggles into concrete posting hours for a platform.
 */
export function resolveTimeWindows(
  platform: string,
  windows: TimeWindow[],
): number[] {
  const map = PLATFORM_TIME_WINDOWS[platform] || FALLBACK_TIME_MAP;
  const hours = new Set<number>();
  for (const w of windows) {
    for (const h of map[w]) hours.add(h);
  }
  return [...hours].sort((a, b) => a - b);
}

/** All supported platform IDs for the cadence UI. */
export const CADENCE_PLATFORMS = [
  "linkedin",
  "instagram",
  "facebook",
  "threads",
  "bluesky",
  "pinterest",
  "twitter",
  "tiktok",
] as const;

/** Human-readable platform labels. */
export const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  bluesky: "Bluesky",
  pinterest: "Pinterest",
  twitter: "X / Twitter",
  tiktok: "TikTok",
};
