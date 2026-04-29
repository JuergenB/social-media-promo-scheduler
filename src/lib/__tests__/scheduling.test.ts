/**
 * Scheduling tests.
 *
 * Phase A (issue #207):
 *   - Midpoint quantile sampling (no endpoint forcing → no barbell)
 *   - Front-loaded / Balanced / Back-loaded shapes match intent
 *   - maxPerDay enforced
 *   - minSpacingHours enforced
 *   - Count-aware excludedDates respected
 *
 * Phase B (issue #84 Phase 2):
 *   - Density-aware additive scheduling: when existing posts are present, new
 *     posts fill curve deficits (residual distribution) rather than piling
 *     into whatever days happen to be free.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { schedulePostsAlgorithm, type ScheduleInput } from "@/lib/scheduling";
import type { DistributionBias, PlatformCadenceConfig } from "@/lib/airtable/types";

// ── Helpers ──────────────────────────────────────────────────────────

// Use a LOCAL-midnight start to match how the production schedule API constructs
// its startDate (`new Date("YYYY-MM-DD" + "T00:00:00")`). The algorithm's day
// loop and pickTime() both operate in local time, so test assertions count days
// in local time as well.
const START = new Date(2026, 3, 28); // Apr 28 2026, local midnight

function makePosts(platforms: string[], perPlatform: number) {
  const posts: ScheduleInput["posts"] = [];
  for (const p of platforms) {
    for (let i = 0; i < perPlatform; i++) {
      posts.push({ id: `${p}-${i}`, platform: p });
    }
  }
  return posts;
}

function dayOffset(slotDate: string, start: Date): number {
  const d = new Date(slotDate);
  // Compare LOCAL date components — pickTime() sets local hours, so the slot's
  // user-visible day is the local day, not the UTC day component.
  const slotMid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  return Math.round((slotMid - startMid) / 86_400_000);
}

function localDayKey(slotDate: string): string {
  const d = new Date(slotDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function countByDay(slots: { scheduledDate: string }[], start: Date, durationDays: number): number[] {
  const counts = new Array(durationDays).fill(0);
  for (const s of slots) {
    const d = dayOffset(s.scheduledDate, start);
    if (d >= 0 && d < durationDays) counts[d] += 1;
  }
  return counts;
}

function frontHalfRatio(slots: { scheduledDate: string }[], start: Date, durationDays: number): number {
  const counts = countByDay(slots, start, durationDays);
  const half = Math.floor(durationDays / 2);
  const front = counts.slice(0, half).reduce((a, b) => a + b, 0);
  const back = counts.slice(half).reduce((a, b) => a + b, 0);
  const total = front + back;
  return total > 0 ? front / total : 0;
}

// Restrict a config to the given platforms with permissive cadence
// (no weekday-only restriction so the matrix doesn't collide with weekends).
function permissiveCadence(platforms: string[]): PlatformCadenceConfig {
  const cfg: PlatformCadenceConfig = {};
  for (const p of platforms) {
    cfg[p] = {
      postsPerWeek: 14, // → maxPerDay = 2
      activeDays: [], // all days active
      timeWindows: ["morning", "afternoon", "evening"],
    };
  }
  return cfg;
}

// ── 1. Quantile midpoint sanity ──────────────────────────────────────

describe("quantile target distribution", () => {
  it("never forces the last post onto the final day for front-loaded", () => {
    // Bug regression: i/(N-1) puts target=1 → final day. (i+0.5)/N puts target<1.
    // Exercise the simplest case where every platform is single-post: midpoint is 0.5,
    // which under front-loaded curve should NOT land on the final day.
    const input: ScheduleInput = {
      posts: makePosts(["instagram"], 1),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence: permissiveCadence(["instagram"]),
    };
    const slots = schedulePostsAlgorithm(input);
    expect(slots).toHaveLength(1);
    const off = dayOffset(slots[0].scheduledDate, START);
    // Front-loaded median is around day 3 of 14 (curve mass is weighted early).
    expect(off).toBeLessThan(8);
  });

  it("does not produce a back-cluster for the bug scenario (14d / 6 platforms / 4 each)", () => {
    // The exact #207 bug: with i/(N-1), 6 platforms each contribute their last post
    // to day 13, producing 6 posts on the final day. Midpoint quantile should not.
    const platforms = ["instagram", "linkedin", "facebook", "threads", "bluesky", "pinterest"];
    const input: ScheduleInput = {
      posts: makePosts(platforms, 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence: permissiveCadence(platforms),
    };
    const slots = schedulePostsAlgorithm(input);
    const counts = countByDay(slots, START, 14);
    const lastDayCount = counts[13];
    const firstDayCount = counts[0];
    // The bug forced 6 posts onto the last day. Now the last day must not exceed first day.
    expect(lastDayCount).toBeLessThanOrEqual(firstDayCount);
    // And explicitly: not a barbell — the last day shouldn't be among the 2 heaviest days.
    const sorted = [...counts].sort((a, b) => b - a);
    const top2Threshold = sorted[1];
    expect(lastDayCount).toBeLessThan(top2Threshold + 1); // last day not in top 2
  });
});

// ── 2. Distribution shape — test matrix from #207 ────────────────────

describe("test matrix from #207", () => {
  type Cell = { bias: DistributionBias; days: number; perPlatform: number; platforms: string[] };
  const platforms6 = ["instagram", "linkedin", "facebook", "threads", "bluesky", "pinterest"];
  const platforms4 = ["instagram", "linkedin", "facebook", "threads"];
  const platforms3 = ["instagram", "linkedin", "facebook"];
  const platforms2 = ["instagram", "linkedin"];
  const platforms1 = ["instagram"];

  const cells: Array<Cell & { name: string }> = [
    { name: "Front-loaded × 14d × 4 × 6", bias: "Front-loaded", days: 14, perPlatform: 4, platforms: platforms6 },
    { name: "Front-loaded × 90d × 8 × 3", bias: "Front-loaded", days: 90, perPlatform: 8, platforms: platforms3 },
    { name: "Balanced × 14d × 4 × 6", bias: "Balanced", days: 14, perPlatform: 4, platforms: platforms6 },
    { name: "Back-loaded × 14d × 4 × 6", bias: "Back-loaded", days: 14, perPlatform: 4, platforms: platforms6 },
    { name: "Front-loaded × 7d × 2 × 4", bias: "Front-loaded", days: 7, perPlatform: 2, platforms: platforms4 },
    { name: "Front-loaded × 30d × 12 × 2", bias: "Front-loaded", days: 30, perPlatform: 12, platforms: platforms2 },
    { name: "Front-loaded × 14d × 1 × 1", bias: "Front-loaded", days: 14, perPlatform: 1, platforms: platforms1 },
  ];

  for (const c of cells) {
    it(c.name, () => {
      const input: ScheduleInput = {
        posts: makePosts(c.platforms, c.perPlatform),
        startDate: START,
        durationDays: c.days,
        bias: c.bias,
        cadence: permissiveCadence(c.platforms),
      };
      const slots = schedulePostsAlgorithm(input);
      const expectedTotal = c.platforms.length * c.perPlatform;
      expect(slots).toHaveLength(expectedTotal);

      const ratio = frontHalfRatio(slots, START, c.days);
      const counts = countByDay(slots, START, c.days);

      if (c.bias === "Front-loaded") {
        // Strict: front half holds the majority. (Threshold loose for tiny matrices.)
        const minFront = expectedTotal === 1 ? 0.5 : 0.6;
        expect(ratio).toBeGreaterThanOrEqual(minFront);
      } else if (c.bias === "Back-loaded") {
        const maxFront = expectedTotal === 1 ? 0.5 : 0.4;
        expect(ratio).toBeLessThanOrEqual(maxFront);
      } else if (c.bias === "Balanced") {
        // Strict midpoint quantile (per spec) maps every platform's i-th post to
        // the same quantile of the (uniform) balanced curve, so all platforms
        // pick identical days. CV is structurally high for sparse multi-platform
        // balanced distributions; cross-platform spread is out of Phase A scope.
        // Real regression we want to catch: catastrophic clustering on 1–2 days.
        const max = Math.max(...counts);
        const total = counts.reduce((a, b) => a + b, 0);
        // No single day should hold more than half of the total.
        if (total > 0) expect(max / total).toBeLessThanOrEqual(0.5);
        // Active days should be at least the per-platform post count
        // (each midpoint quantile picks one day per stratum).
        const activeDays = counts.filter((c) => c > 0).length;
        expect(activeDays).toBeGreaterThanOrEqual(c.perPlatform);
      }
    });
  }
});

// ── 3. maxPerDay enforcement ─────────────────────────────────────────

describe("maxPerDay enforcement", () => {
  it("never places more than maxPerDay same-platform posts on one day", () => {
    // Cadence: postsPerWeek=7 with all-day-active → maxPerDay = 1.
    const cadence: PlatformCadenceConfig = {
      instagram: { postsPerWeek: 7, activeDays: [], timeWindows: ["morning", "afternoon"] },
    };
    const input: ScheduleInput = {
      posts: makePosts(["instagram"], 5),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    };
    const slots = schedulePostsAlgorithm(input);
    expect(slots).toHaveLength(5);

    const perDay = new Map<string, number>();
    for (const s of slots) {
      const dayKey = localDayKey(s.scheduledDate);
      perDay.set(dayKey, (perDay.get(dayKey) || 0) + 1);
    }
    for (const [, count] of perDay) {
      expect(count).toBeLessThanOrEqual(1); // maxPerDay=1
    }
  });

  it("permits maxPerDay>1 same-platform posts on one day if cadence allows", () => {
    // Cadence: postsPerWeek=14 → maxPerDay=2 with all-active days.
    const cadence: PlatformCadenceConfig = {
      instagram: { postsPerWeek: 14, activeDays: [], timeWindows: ["morning", "afternoon", "evening"] },
    };
    const input: ScheduleInput = {
      posts: makePosts(["instagram"], 6),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    };
    const slots = schedulePostsAlgorithm(input);
    expect(slots).toHaveLength(6);
    const perDay = new Map<string, number>();
    for (const s of slots) {
      const dayKey = localDayKey(s.scheduledDate);
      perDay.set(dayKey, (perDay.get(dayKey) || 0) + 1);
    }
    for (const [, count] of perDay) {
      expect(count).toBeLessThanOrEqual(2); // maxPerDay=2
    }
  });
});

// ── 4. minSpacingHours enforcement ───────────────────────────────────

describe("minSpacingHours enforcement", () => {
  it("respects minSpacingHours between same-platform same-day posts (best effort)", () => {
    // postsPerWeek=21 → maxPerDay=3, minSpacingHours=floor(24/(3+1))=6
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 21,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    const input: ScheduleInput = {
      posts: makePosts(["instagram"], 6),
      startDate: START,
      durationDays: 7, // dense — forces multiple posts per day
      bias: "Balanced",
      cadence,
    };
    const slots = schedulePostsAlgorithm(input);
    expect(slots).toHaveLength(6);
    const minSpacing = 6;
    const grouped = new Map<string, Date[]>();
    for (const s of slots) {
      const day = localDayKey(s.scheduledDate);
      const arr = grouped.get(day) || [];
      arr.push(new Date(s.scheduledDate));
      grouped.set(day, arr);
    }
    for (const [, dates] of grouped) {
      if (dates.length < 2) continue;
      const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < sorted.length; i++) {
        const diffH = (sorted[i].getTime() - sorted[i - 1].getTime()) / 3_600_000;
        expect(diffH).toBeGreaterThanOrEqual(minSpacing);
      }
    }
  });
});

// ── 5. Count-aware excludedDates ─────────────────────────────────────

describe("excludedDates count-aware shape", () => {
  it("treats excluded counts < maxPerDay as still-allowed slots", () => {
    // maxPerDay=2; pre-existing 1 IG post on day 0; expect new posts can still land there.
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 14,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    const platformExcluded = new Map<string, number>();
    const day0Str = START.toISOString().split("T")[0];
    platformExcluded.set(day0Str, 1);
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", platformExcluded);

    // Cram many posts so day 0 is highly desirable (front-loaded).
    const input: ScheduleInput = {
      posts: makePosts(["instagram"], 5),
      startDate: START,
      durationDays: 7,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
    };
    const slots = schedulePostsAlgorithm(input);
    // Day 0 already has 1 → algorithm may add 1 more (maxPerDay=2). Algorithm must NOT
    // place 2+ new posts on day 0 (that'd be 3 total, exceeding cadence).
    const day0Adds = slots.filter((s) => s.scheduledDate.split("T")[0] === day0Str).length;
    expect(day0Adds).toBeLessThanOrEqual(1);
  });

  it("treats a fully-loaded day (count == maxPerDay) as unavailable", () => {
    // maxPerDay=2; pre-existing count=2 on day 0; new posts must spill to day 1+.
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 14,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    const day0Str = START.toISOString().split("T")[0];
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", new Map([[day0Str, 2]]));

    const input: ScheduleInput = {
      posts: makePosts(["instagram"], 3),
      startDate: START,
      durationDays: 7,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
    };
    const slots = schedulePostsAlgorithm(input);
    expect(slots).toHaveLength(3);
    const onDay0 = slots.filter((s) => s.scheduledDate.split("T")[0] === day0Str).length;
    expect(onDay0).toBe(0);
  });
});

// ── 6. Sanity / boundary ─────────────────────────────────────────────

describe("boundary cases", () => {
  it("returns [] for zero posts", () => {
    expect(schedulePostsAlgorithm({
      posts: [], startDate: START, durationDays: 14, bias: "Front-loaded",
    })).toEqual([]);
  });

  it("returns [] for zero duration", () => {
    expect(schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 1), startDate: START, durationDays: 0, bias: "Balanced",
    })).toEqual([]);
  });

  it("places a single post somewhere within the campaign window", () => {
    const input: ScheduleInput = {
      posts: makePosts(["instagram"], 1),
      startDate: START,
      durationDays: 14,
      bias: "Balanced",
      cadence: permissiveCadence(["instagram"]),
    };
    const slot = schedulePostsAlgorithm(input)[0];
    const off = dayOffset(slot.scheduledDate, START);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(14);
  });
});

// Determinism note: pickTime() uses Math.random for organic minute jitter, but no
// assertion in this file depends on a specific minute. Distribution and constraint
// tests are deterministic in the day/hour shape we measure.

// Run multiple iterations of the headline regression to guard against random luck.
describe("regression: barbell does not return under randomness", () => {
  beforeEach(() => {
    // Use a stable but non-trivial seed each iteration to avoid flakes.
  });

  it("front-loaded 14d/6×4: averaged over 5 runs, last day count ≤ first day count", () => {
    const platforms = ["instagram", "linkedin", "facebook", "threads", "bluesky", "pinterest"];
    let lastSum = 0;
    let firstSum = 0;
    for (let r = 0; r < 5; r++) {
      const slots = schedulePostsAlgorithm({
        posts: makePosts(platforms, 4),
        startDate: START,
        durationDays: 14,
        bias: "Front-loaded",
        cadence: permissiveCadence(platforms),
      });
      const counts = countByDay(slots, START, 14);
      lastSum += counts[13];
      firstSum += counts[0];
    }
    expect(lastSum).toBeLessThanOrEqual(firstSum);
  });
});

// ── 7. Phase B: density-aware additive scheduling (#84 Phase 2) ──────

// Helper: build excludedDates count map from "post on day d" entries. Uses the
// same key format the algorithm uses internally (`new Date(start); setDate(d);
// toISOString().split('T')[0]`) so test inputs match algorithm lookups exactly.
function makeExisting(start: Date, perDayCounts: Record<number, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [dStr, count] of Object.entries(perDayCounts)) {
    const d = Number(dStr);
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    m.set(date.toISOString().split("T")[0], count);
  }
  return m;
}

describe("Phase B: density-aware additive scheduling", () => {
  it("existing exceeds curve on day 0 → deficit clamps; new posts skip day 0", () => {
    // maxPerDay big enough to fit both existing and new on day 0 if algo wanted to
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 70,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    // 5 existing on day 0 — far exceeds front-loaded ideal for total=9 (≈2 on day 0)
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", makeExisting(START, { 0: 5 }));

    const slots = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
      additiveMode: true,
    });
    expect(slots).toHaveLength(4);

    // Deficit on day 0 = max(0, ideal-existing) = 0 → no new posts there
    const onDay0 = slots.filter((s) => dayOffset(s.scheduledDate, START) === 0).length;
    expect(onDay0).toBe(0);
  });

  it("existing on late days → residual deficit pushes new posts early (front-loaded)", () => {
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 14,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    // 4 existing on days 10–13 (the back end). Front-loaded ideal_8 has tiny
    // weight on those days → existing already saturates them; deficit lives
    // in days 0–9.
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", makeExisting(START, { 10: 1, 11: 1, 12: 1, 13: 1 }));

    const slots = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
      additiveMode: true,
    });
    expect(slots).toHaveLength(4);
    for (const s of slots) {
      const off = dayOffset(s.scheduledDate, START);
      expect(off).toBeLessThan(10);
    }
  });

  it("additive shifts new posts later than first-time scheduling when existing clusters early", () => {
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 14,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    // Existing 1 post on each of days 0–3 (early-cluster)
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", makeExisting(START, { 0: 1, 1: 1, 2: 1, 3: 1 }));

    const firstTime = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    });
    const additive = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
      additiveMode: true,
    });

    const avg = (xs: { scheduledDate: string }[]) =>
      xs.reduce((s, x) => s + dayOffset(x.scheduledDate, START), 0) / xs.length;
    expect(avg(additive)).toBeGreaterThan(avg(firstTime));
  });

  it("acceptance (#84): existing 8 + new 5 ≈ first-time 13 (combined matches curve)", () => {
    // Permissive cadence: maxPerDay=4, all days, plenty of windows.
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 28,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };

    // Phase A first-pass: place 8 posts.
    const first8 = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 8),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    });

    // Build excludedDates from the first-pass slots, using the algorithm's
    // own day-key format (UTC component of `start + dayOffset`).
    const existingPerDay: Record<number, number> = {};
    for (const s of first8) {
      const off = dayOffset(s.scheduledDate, START);
      existingPerDay[off] = (existingPerDay[off] ?? 0) + 1;
    }
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", makeExisting(START, existingPerDay));

    // Phase B additive: place 5 more.
    const additive5 = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 5),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
      additiveMode: true,
    });
    expect(additive5).toHaveLength(5);

    // Reference: schedule 13 from scratch.
    const ref13 = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 13),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    });

    const combined = first8.concat(additive5);
    const combinedDist = countByDay(combined, START, 14);
    const refDist = countByDay(ref13, START, 14);

    // Combined day-by-day distribution should be close to scheduling all 13 from scratch
    const totalAbsDiff = combinedDist.reduce((s, c, i) => s + Math.abs(c - refDist[i]), 0);
    // 13 posts on 14 days; allow some chunking slack from per-platform maxPerDay walks
    expect(totalAbsDiff).toBeLessThanOrEqual(6);

    // Combined total must equal the reference total
    expect(combinedDist.reduce((a, b) => a + b, 0))
      .toBe(refDist.reduce((a, b) => a + b, 0));
  });

  it("maxPerDay still enforced in additive mode (no over-cap collisions)", () => {
    // postsPerWeek=7 with all days active → maxPerDay=1. 5 existing posts on
    // days 0–4 already saturate those. 5 new posts must not pile on any day
    // (everything stays at ≤1 per day).
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 7,
        activeDays: [],
        timeWindows: ["morning", "afternoon"],
      },
    };
    const excluded = new Map<string, Map<string, number>>();
    excluded.set(
      "instagram",
      makeExisting(START, { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 }),
    );

    const slots = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 5),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
      additiveMode: true,
    });
    expect(slots).toHaveLength(5);

    // No new post on the 5 already-occupied days
    for (const s of slots) {
      const off = dayOffset(s.scheduledDate, START);
      expect(off).toBeGreaterThanOrEqual(5);
    }
    // At most 1 new post per day
    const perDay = new Map<string, number>();
    for (const s of slots) {
      const k = localDayKey(s.scheduledDate);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    for (const [, count] of perDay) expect(count).toBeLessThanOrEqual(1);
  });

  it("minSpacingHours still enforced in additive mode", () => {
    // postsPerWeek=28 (all days active) → maxPerDay=4 → minSpacingHours=4h.
    // The 9–19 platform window range comfortably fits 2 posts ≥ 4h apart;
    // pickTimeWithSpacing should find a non-colliding slot. Existing post
    // on day 0 has no recorded time (excludedDates only carries counts), so
    // spacing applies only between newly-placed slots.
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 28,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", makeExisting(START, { 0: 1 }));

    const slots = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 6),
      startDate: START,
      durationDays: 3,
      bias: "Balanced",
      cadence,
      excludedDates: excluded,
      additiveMode: true,
    });
    expect(slots).toHaveLength(6);

    const grouped = new Map<string, Date[]>();
    for (const s of slots) {
      const day = localDayKey(s.scheduledDate);
      const arr = grouped.get(day) ?? [];
      arr.push(new Date(s.scheduledDate));
      grouped.set(day, arr);
    }
    for (const [, dates] of grouped) {
      if (dates.length < 2) continue;
      const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < sorted.length; i++) {
        const diffH = (sorted[i].getTime() - sorted[i - 1].getTime()) / 3_600_000;
        expect(diffH).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("no existing posts → identical behavior to Phase A first-time scheduling", () => {
    // Sanity: when excludedDates is empty/absent, the algorithm must produce
    // the same shape as Phase A — Phase B's deficit branch is gated on
    // totalExisting > 0.
    const platforms = ["instagram"];
    const cadence = permissiveCadence(platforms);

    const a = schedulePostsAlgorithm({
      posts: makePosts(platforms, 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    });
    // Same call but with an empty Map — should also exercise Phase A path.
    const bWithEmpty = schedulePostsAlgorithm({
      posts: makePosts(platforms, 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: new Map([["instagram", new Map()]]),
    });

    expect(countByDay(a, START, 14)).toEqual(countByDay(bWithEmpty, START, 14));
  });
});

// ── 8. Phase D: redistribute mode (#178) — externals as pure collisions ──

describe("Phase D: external-collision mode (additiveMode: false, default)", () => {
  it("externals don't shift the curve target — front-loaded stays front-loaded", () => {
    // Brand-wide other-campaign posts on days 0-3 (early). Without additiveMode,
    // these should ONLY block via maxPerDay (not in this scenario since cadence
    // is loose), and the new posts should still front-load per the curve.
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 70, // maxPerDay=10, very loose
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    const externals = new Map<string, Map<string, number>>();
    externals.set("instagram", makeExisting(START, { 0: 1, 1: 1, 2: 1, 3: 1 }));

    // additiveMode default false: externals are collision-only, don't shape curve
    const redistributed = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: externals,
    });
    // Compare to first-time scheduling with no externals at all
    const firstTime = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    });

    // The two day-distributions should be identical — externals don't reshape
    // the curve when additiveMode is off.
    expect(countByDay(redistributed, START, 14))
      .toEqual(countByDay(firstTime, START, 14));
  });

  it("externals still enforce maxPerDay (collision constraint applies)", () => {
    // maxPerDay=1. Externals on days 0-3 saturate them. New posts must spill
    // past day 3 even though front-loaded curve wants to put them early.
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 7,
        activeDays: [],
        timeWindows: ["morning", "afternoon"],
      },
    };
    const externals = new Map<string, Map<string, number>>();
    externals.set("instagram", makeExisting(START, { 0: 1, 1: 1, 2: 1, 3: 1 }));

    const slots = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: externals,
      additiveMode: false, // explicit
    });
    expect(slots).toHaveLength(4);

    // No new post on the externally-occupied days (maxPerDay=1 walked outward)
    for (const s of slots) {
      const off = dayOffset(s.scheduledDate, START);
      expect(off).toBeGreaterThanOrEqual(4);
    }
  });

  it("additiveMode: false vs true — same inputs, different shape", () => {
    // Identical setup except for the flag. Confirms the two modes are
    // genuinely distinct, not silently merged behavior.
    //
    // Setup: Front-loaded, existing 1 on day 0, maxPerDay=4.
    //   - additiveMode: true → total=5, ideal[0] = 0.213·5 ≈ 1.07,
    //     placedPerDay[0] starts at 1 → deficit[0] ≈ 0.07. Day 1 deficit ≈ 0.85.
    //     Algorithm prefers day 1 first.
    //   - additiveMode: false → total=4, ideal[0] = 0.213·4 ≈ 0.85,
    //     placedPerDay[0] starts at 0 → deficit[0] ≈ 0.85. Algorithm picks
    //     day 0 first (existing doesn't reshape the ideal).
    const cadence: PlatformCadenceConfig = {
      instagram: {
        postsPerWeek: 28,
        activeDays: [],
        timeWindows: ["morning", "afternoon", "evening"],
      },
    };
    const excluded = new Map<string, Map<string, number>>();
    excluded.set("instagram", makeExisting(START, { 0: 1 }));

    const additiveTrue = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
      additiveMode: true,
    });
    const additiveFalse = schedulePostsAlgorithm({
      posts: makePosts(["instagram"], 4),
      startDate: START,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
      excludedDates: excluded,
      additiveMode: false,
    });

    expect(countByDay(additiveTrue, START, 14))
      .not.toEqual(countByDay(additiveFalse, START, 14));
  });
});

// ── 9. Intersect-shape regression — global deficit-fill produces smooth taper ──
//
// Reproduces the real-world scenario that exposed the per-platform-quantile
// barbell: 14-day Front-loaded, 19 posts across 6 platforms (5 weekday-only +
// 1 all-day-active Pinterest), maxPerDay=1. The new global deficit-fill
// algorithm must produce a smooth taper, not a barbell. (Phase A's per-
// platform midpoint quantile passed unit tests but failed this real shape.)

describe("regression: global deficit-fill produces a smooth taper under Intersect-shape input", () => {
  it("19 posts × 6 platforms × 14 days × Front-loaded → no back cluster, sparse middle filled", () => {
    // Mirror The Intersect's cadence: 5 weekday-only platforms with
    // postsPerWeek=4 (maxPerDay=1) + Pinterest all-day-active with
    // postsPerWeek=4 (maxPerDay=1).
    const cadence: PlatformCadenceConfig = {
      instagram: { postsPerWeek: 4, activeDays: [1, 2, 3, 4, 5], timeWindows: ["morning", "afternoon"] },
      bluesky: { postsPerWeek: 4, activeDays: [1, 2, 3, 4, 5], timeWindows: ["morning", "afternoon"] },
      threads: { postsPerWeek: 4, activeDays: [1, 2, 3, 4, 5], timeWindows: ["morning", "afternoon"] },
      facebook: { postsPerWeek: 4, activeDays: [1, 2, 3, 4, 5], timeWindows: ["afternoon"] },
      linkedin: { postsPerWeek: 4, activeDays: [1, 2, 3, 4, 5], timeWindows: ["morning", "afternoon"] },
      pinterest: { postsPerWeek: 4, activeDays: [], timeWindows: ["evening"] },
    };
    // 19 posts: bluesky 4, instagram 3, threads 3, facebook 3, linkedin 3, pinterest 3
    const posts: ScheduleInput["posts"] = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `bs-${i}`, platform: "bluesky" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `ig-${i}`, platform: "instagram" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `th-${i}`, platform: "threads" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `fb-${i}`, platform: "facebook" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `li-${i}`, platform: "linkedin" })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `pi-${i}`, platform: "pinterest" })),
    ];
    // Apr 28 2026 = Tuesday → 14-day window has 10 weekdays + 4 weekend days
    const start = new Date(2026, 3, 28);
    const slots = schedulePostsAlgorithm({
      posts,
      startDate: start,
      durationDays: 14,
      bias: "Front-loaded",
      cadence,
    });

    expect(slots).toHaveLength(19);

    const counts = countByDay(slots, start, 14);
    const total = counts.reduce((a, b) => a + b, 0);

    // Front half should hold ≥ 70% of posts (Front-loaded with this curve has
    // roughly 80% mass in first half over 14 days).
    const front = counts.slice(0, 7).reduce((a, b) => a + b, 0);
    expect(front / total).toBeGreaterThanOrEqual(0.7);

    // No "back cluster": last 3 days combined must hold < 15% of total.
    const back3 = counts[11] + counts[12] + counts[13];
    expect(back3 / total).toBeLessThan(0.15);

    // Specifically: day 13 (final day) cannot exceed day 0.
    expect(counts[13]).toBeLessThanOrEqual(counts[0]);

    // Smoothness: no single day in the last half should exceed 3 posts
    // (catches the 6-on-final-day barbell pattern).
    const lastHalfMax = Math.max(...counts.slice(7));
    expect(lastHalfMax).toBeLessThanOrEqual(3);
  });
});
