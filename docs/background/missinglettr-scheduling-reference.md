# Missinglettr Scheduling Algorithm — Reference

Research findings from Missinglettr (missinglettr.com), a social media drip campaign tool. Informs our tapering schedule design.

## Default Tapering Curve

9 posts spread over 12 months with exponentially increasing gaps:

| Post # | Day Offset | Calendar Equivalent |
|--------|-----------|-------------------|
| 1 | Day 0 | Same day (launch) |
| 2 | Day 3 | 3 days later |
| 3 | Day 7 | 1 week |
| 4 | Day 14 | 2 weeks |
| 5 | Day 30 | 1 month |
| 6 | Day 90 | 3 months |
| 7 | Day 180 | 6 months |
| 8 | Day 270 | 9 months |
| 9 | Day 365 | 12 months |

**Pattern:** 4 posts in the first 2 weeks, 1 more in the first month, then quarterly for 11 months.

## Duration Presets

| Template | Duration |
|----------|----------|
| 12-month evergreen | 365 days |
| 6-month evergreen | ~180 days |
| 2-month blast | ~60 days |
| 2-week blast | 14 days |
| 2-week lite | 14 days (fewer posts) |

Hard limits: max 2 years (730 days), up to 50 posts per social profile per campaign.

## Post Distribution Slider

Three-mode UI slider for controlling the frequency curve:
- **Front-loaded** (slider left): More posts early in the campaign
- **Balanced** (slider center): Even distribution
- **Back-loaded** (slider right): More posts toward the end

The slider recalculates day offsets while keeping total count and duration fixed.

## Key Rules

- **Minimum 3-day spacing** between posts from the same campaign
- **Content variation per post** — each uses different excerpts, images, hashtags
- **Per-platform time slots** typed by campaign source (drip vs. curate vs. one-off)
- **Nothing publishes without explicit approval** — all posts reviewed individually
- **Per-platform post counts** — a 9-post campaign with 3 profiles = 27 total scheduled posts

## Multi-Platform Handling

- Campaign template (day offsets) is shared across all profiles
- Actual posting times and day-of-week availability differ per profile
- Same campaign can land on different calendar dates per platform if a day is blocked on one profile

## Design Takeaways for Our System

1. The exponential tapering curve (0, 3, 7, 14, 30, 90, 180, 270, 365) is well-tested
2. A slider for distribution bias is an elegant UI pattern
3. Per-platform time slot typing prevents campaign types from competing
4. 3-day minimum spacing prevents self-cannibalization
5. Content variation is per-post, not per-phase
