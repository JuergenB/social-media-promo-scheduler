# Zernio API Reference (PolyWiz-specific)

This doc captures Zernio endpoints we consume directly, the quirks we've hit, and response shapes confirmed against the live API.

- **Base URL:** `https://zernio.com/api`
- **Auth:** `Authorization: Bearer $LATE_API_KEY` (SDK key format `sk_...`)
- **SDK:** `@getlatedev/node` — covers most endpoints but does **not** cover the `/v1/analytics/best-time`, `/v1/analytics/content-decay`, or `/v1/analytics/posting-frequency` endpoints. Those require raw HTTP.
- **Per-brand key resolution:** see `src/lib/late-api/client.ts` — `resolveZernioKey(brand)` resolves the brand-specific env var (e.g. `LATE_API_KEY_INTERSECT`) or falls back to the global `LATE_API_KEY`.
- **OpenAPI inventory:** `docs/zernio-api-openapi.yaml` is a comment-only pointer listing endpoint paths, not a full spec.

Last verified: 2026-04-24.

---

## GET `/v1/analytics`

SDK: `client.analytics.getAnalytics()`. Returns per-post analytics (impressions, likes, comments, shares, views, clicks, engagementRate) for the brand's posts. Used by `src/app/api/dashboard/analytics/route.ts`.

---

## GET `/v1/analytics/best-time`

**Purpose:** aggregate historical engagement by (day-of-week, hour) slot. Feeds the best-posting-times heatmap on `/dashboard/analytics`.

**Not exposed by the SDK.** Call via `fetch` with the Bearer token.

### Request

```
GET https://zernio.com/api/v1/analytics/best-time
Authorization: Bearer $LATE_API_KEY
```

### Query parameters (observed)

- `platform=<name>` — optional. Filter to a single platform (e.g. `platform=instagram`). Verified to reduce the slot count on our live key.
- `platforms=<a,b>` — **unreliable**. Comma-separated value appeared to return *more* slots than the unfiltered call (76 vs ~74) on our key, which doesn't make sense for a filter; assume this param is not recognized and data is grouping by some other axis. Don't depend on it — filter client-side if multi-platform scoping is needed.

### Response shape

```json
{
  "slots": [
    { "day_of_week": 2, "hour": 15, "avg_engagement": 74, "post_count": 13 },
    { "day_of_week": 3, "hour": 15, "avg_engagement": 69.5, "post_count": 8 },
    ...
  ]
}
```

- `day_of_week`: 0 = Sunday, 6 = Saturday (standard JS Date convention).
- `hour`: **assumed UTC** (Zernio doesn't document this; hours cluster at 13–19 which maps to 9–15 ET under the UTC assumption — a plausible engagement window for art audiences). Our route converts to America/New_York before returning to the client so the UI is local-time correct. If Zernio ever confirms a different source timezone, flip the `SOURCE_TZ` constant in the analytics route.
- `avg_engagement`: average engagement score (units unspecified — treat as relative within the dataset for heatmap shading).
- `post_count`: how many historical posts contributed to this slot. Low counts (<3) are noisy; the heatmap fades them slightly.

### Known caveats

- Endpoint returns empty `slots: []` for brands with insufficient historical posts.
- Brands with low post counts will return slots dominated by 1–2 outlier posts. Visualizations should indicate post-count confidence (we fade cells with `post_count < 3`).
- No date-range parameters are documented; response appears to cover all-time. If we ever need a rolling window, it'll have to be done client-side by post-level `/v1/analytics` aggregation.

---

## Other analytics endpoints (not yet integrated)

- `GET /v1/analytics/content-decay` — content lifespan data. Unexplored.
- `GET /v1/analytics/posting-frequency` — frequency vs engagement. Unexplored.

If we add either, document the response shape here.

---

## Webhook events

See `src/app/api/webhooks/zernio/route.ts`. Zernio emits `post.scheduled`, `post.published`, `post.failed`, `post.partial`, `post.cancelled`, `post.recycled`, `account.connected`, `account.disconnected`, `message.received`, `comment.received`. Notably absent: no `post.reverted` event when a scheduled post is moved back to draft — tracked as an architectural gap in #142.

## Response shape gotchas

- `createPost` returns `{ post: { _id: "..." }, message: "..." }` — the post ID is nested, not at the top level. Always extract via `data.post._id`.
- `updatePost` requires `scheduledFor` to be included in the body, even when unchanged — omitting it reverts the post from scheduled to draft.
