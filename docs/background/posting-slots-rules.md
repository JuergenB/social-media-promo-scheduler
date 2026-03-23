# Posting Slots Rules — Reference

Extracted from n8n workflow `SS7PdXrSgwKK060w` ("Utility: Create Social Posting Calendar Slots"). These rules govern the organic timing of social media posts per platform.

## Per-Platform Configuration

### Twitter/X
- **Min spacing:** 20 minutes
- **Weekly volume:** 19-26 posts
- **Weekend:** Active (2-3/day)

| Day | Posts/Day | Time Windows |
|-----|-----------|-------------|
| Mon | 2-3 | 10:00-11:00, 13:00-14:00 |
| Tue | 4-5 | 09:00-12:00, 14:00-15:00 |
| Wed | 4-5 | 09:00-12:00, 13:00-15:00 |
| Thu | 3-4 | 10:00-13:00, 15:00-15:59 |
| Fri | 2-3 | 10:00-12:00, 14:00-16:00 |
| Sat | 2-3 | 11:00-14:00 |
| Sun | 2-3 | 14:00-18:00 |

### Threads
- **Min spacing:** 30 minutes
- **Weekly volume:** 9-12 posts
- **Weekend:** Light (1/day)

| Day | Posts/Day | Time Windows |
|-----|-----------|-------------|
| Mon | 1-2 | 10:00-12:00, 15:00-17:00 |
| Tue | 2 | 09:00-12:00, 14:00-16:00 |
| Wed | 2 | 09:00-12:00, 14:00-17:00 |
| Thu | 1-2 | 10:00-13:00, 15:00-17:00 |
| Fri | 1 | 09:00-11:00, 14:00-16:00 |
| Sat | 1 | 11:00-14:00 |
| Sun | 1 | 12:00-15:00 |

### LinkedIn
- **Min spacing:** 60 minutes
- **Weekly volume:** 4-5 posts
- **Weekend:** None
- **Special:** Fridays have 50% skip probability

| Day | Posts/Day | Time Windows |
|-----|-----------|-------------|
| Mon | 1 | 09:00-12:00 |
| Tue | 1 | 09:00-12:00, 14:00-16:00 |
| Wed | 1 | 09:00-12:00 |
| Thu | 1 | 09:00-11:00, 13:00-15:00 |
| Fri | 0-1 (50%) | 09:00-11:00 |

### Pinterest
- **Min spacing:** 60 minutes
- **Weekly volume:** ~11-12 posts
- **Weekend:** Sundays skipped, Fridays 50% skip

| Day | Posts/Day | Time Windows |
|-----|-----------|-------------|
| Mon | 2 | 09:00-12:00 |
| Tue | 2 | 09:00-12:00, 14:00-16:00 |
| Wed | 2 | 09:00-12:00 |
| Thu | 3 | 09:00-11:00, 13:00-15:00 |
| Fri | 0-1 (50%) | 09:00-11:00 |
| Sat | 0 | — |
| Sun | 0 | — |

### Facebook Page
- **Min spacing:** 45 minutes
- **Weekly volume:** 10-13 posts
- **Weekend:** Light (1/day)

| Day | Posts/Day | Time Windows |
|-----|-----------|-------------|
| Mon | 1-2 | 10:00-12:00, 18:00-20:00 |
| Tue | 2 | 09:00-11:00, 13:00-15:00 |
| Wed | 2 | 09:00-12:00, 18:00-21:00 |
| Thu | 2 | 10:00-13:00, 17:00-20:00 |
| Fri | 1-2 | 09:00-11:00, 14:00-16:00 |
| Sat | 1 | 10:00-12:00 |
| Sun | 1 | 11:00-13:00 |

### BlueSky
- **Min spacing:** 30 minutes
- **Weekly volume:** 7-12 posts
- **Weekend:** Optional (0-1/day)

| Day | Posts/Day | Time Windows |
|-----|-----------|-------------|
| Mon | 1-2 | 09:00-11:00, 14:00-16:00 |
| Tue | 2 | 09:00-12:00, 13:00-15:00 |
| Wed | 2 | 10:00-12:00, 14:00-17:00 |
| Thu | 1-2 | 09:00-11:00, 15:00-17:00 |
| Fri | 1-2 | 10:00-12:00, 13:00-15:00 |
| Sat | 0-1 | 11:00-13:00 |
| Sun | 0-1 | 12:00-14:00 |

### Instagram
- **Min spacing:** 120 minutes (2 hours)
- **Weekly volume:** 7-10 (target 3-5 quality posts)
- **Weekend:** Optional (0-1/day)
- **Content vibe hints:** Motivation Monday, Educational Tuesday, etc.

| Day | Posts/Day | Time Windows |
|-----|-----------|-------------|
| Mon | 1 | 08:00-09:30, 19:00-20:30 |
| Tue | 2 | 08:30-09:30, 18:00-20:00 |
| Wed | 2 | 12:00-13:00, 19:00-21:00 |
| Thu | 1-2 | 09:00-10:00, 18:30-20:30 |
| Fri | 1 | 11:00-13:00, 17:00-19:00 |
| Sat | 0-1 | 11:00-14:00 |
| Sun | 0-1 | 10:00-12:00, 18:00-20:00 |

## Randomization Rules

1. Random minute-level times within each window (not at boundaries)
2. Posts distributed across windows when multiple exist per day
3. Range-based post counts (e.g., "2-3") vary daily
4. No duplicate timestamps within a platform
5. No cross-platform conflict checking (platforms are independent)

## TypeScript Interface

```typescript
interface PlatformSlotConfig {
  platform: string;
  minSpacingMinutes: number;
  schedule: Record<DayOfWeek, {
    postsPerDay: [number, number]; // [min, max]
    timeWindows: Array<[string, string]>; // ["HH:MM", "HH:MM"]
    skipProbability?: number; // 0-1
  }>;
}
```

## Summary Table

| Platform | Min Spacing | Weekly Vol | Weekend |
|----------|-------------|------------|---------|
| Twitter/X | 20 min | 19-26 | Active |
| Threads | 30 min | 9-12 | Light |
| LinkedIn | 60 min | 4-5 | None |
| Pinterest | 60 min | 11-12 | None |
| Facebook | 45 min | 10-13 | Light |
| BlueSky | 30 min | 7-12 | Optional |
| Instagram | 120 min | 7-10 | Optional |
