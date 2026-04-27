# Zernio API Reference (PolyWiz-specific)

This doc captures Zernio endpoints we consume directly, the quirks we've hit, and response shapes confirmed against the live API.

- **Base URL:** `https://zernio.com/api`
- **Auth:** `Authorization: Bearer $LATE_API_KEY` (SDK key format `sk_...`)
- **SDK:** `@getlatedev/node` — covers most endpoints but does **not** cover the `/v1/analytics/best-time`, `/v1/analytics/content-decay`, or `/v1/analytics/posting-frequency` endpoints. Those require raw HTTP.
- **Per-brand key resolution:** see `src/lib/late-api/client.ts` — `resolveZernioKey(brand)` resolves the brand-specific env var (e.g. `LATE_API_KEY_INTERSECT`) or falls back to the global `LATE_API_KEY`.
- **OpenAPI inventory:** `docs/zernio-api-openapi.yaml` is a comment-only pointer listing endpoint paths, not a full spec.

Last verified: 2026-04-24 (ads section re-verified against live key + Zernio docs/changelog 2026-04-24).

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

---

## Ads API (live-probed, gated by add-on)

**Status:** Zernio shipped a paid-ads API in April 2026. We have **not integrated it yet**. The current `LATE_API_KEY` (Dominate/AppSumo plan) does **not** have access — every `/v1/ads/*` endpoint returns `HTTP 403 {"error":"Ads add-on required"}`. Activating ads requires purchasing the Ads Add-On as a billing line item (separate from the base plan); the Dominate/lifetime plan does not include it.

**Last verified (live key probes + docs):** 2026-04-24
**Source pages:** `https://docs.zernio.com/changelog`, `https://docs.zernio.com/ads/meta`, `https://docs.zernio.com/ads/google`, `https://docs.zernio.com/ads/x`, `https://docs.zernio.com/guides/connecting-accounts`, `https://zernio.com/social-media-ads`, `https://zernio.com/meta-ads-api`, `https://zernio.com/tiktok-ads-api`, `https://zernio.com/pinterest-ads-api`, `https://zernio.com/linkedin-ads-api`, `https://zernio.com/x-ads`, `https://zernio.com/google-ads`, Product Hunt launch (2026-04-23).

### Scope at launch

- **Platforms (claimed):** Meta (Facebook + Instagram), Google, TikTok, LinkedIn, Pinterest, X/Twitter — Zernio markets it as "7 platforms" but the seventh is not yet identified in the changelog text we've seen.
- **Capabilities:** Boost an existing organic post, OR create standalone ad campaigns with full Campaign → Ad Set → Ad hierarchy (CBO and ABO budgeting), custom audiences, lookalikes, and detailed targeting.
- **Analytics:** spend, impressions, clicks, CTR, CPC, CPM, ROAS, with breakdowns. Auto-syncs ~90 days of historical data on connect.
- **Roadmap items mentioned:** Ad Library API, Advantage+ campaigns.

### Auth + add-on gate

Same Bearer token model as the rest of Zernio (`Authorization: Bearer $LATE_API_KEY`). No separate scope or key class — the existing `sk_` key is reused, but the **Ads Add-On must be activated in billing** before any `/v1/ads/*` call returns anything other than 403.

Confirmed by live probe (2026-04-24, our `LATE_API_KEY`):

```
GET /v1/ads/tree         → 403 {"error":"Ads add-on required"}
GET /v1/ads/campaigns    → 403 {"error":"Ads add-on required"}
GET /v1/ads/accounts     → 403 {"error":"Ads add-on required"}
GET /v1/ads/audiences    → 403 {"error":"Ads add-on required"}
GET /v1/ads/platforms    → 403 {"error":"Ads add-on required"}
POST /v1/ads/create {}   → 403 {"error":"Ads add-on required"}
POST /v1/ads/boost {}    → 403 {"error":"Ads add-on required"}
GET /v1/ads/boost        → 405 (method not allowed; endpoint exists, POST only)
GET /v1/ads/create       → 405 (method not allowed; endpoint exists, POST only)
```

Verbatim quick-start step from `zernio.com/google-ads` and `zernio.com/x-ads`:

> **1. Enable the Ads Add-On**
> Activate Ads in billing.
> Available on Build, Accelerate, or Unlimited Zernio plans.

Our current plan reports as `{"planName":"Dominate","isAppSumo":true,"hasAccess":true}` (from `GET /v1/usage-stats`). Despite `hasAccess: true`, the ads add-on is a separate paid line item — it is **not** bundled with the AppSumo lifetime tier.

### Endpoints (under `/v1/ads/`)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/ads/boost` | Promote an existing post by `postId` (Meta-style boost). |
| `POST` | `/v1/ads/create` | Create standalone Campaign → Ad Set → Ad in one call. Body: `platform`, `accountId`, `adAccountId`, `name`, `goal`, `budget: { amount, type }`, `schedule: { startDate, endDate }`, `targeting`, `videoUrl`, `callToAction`, `landingPageUrl`. |
| `GET`  | `/v1/ads/tree` | Full campaign tree across connected ad accounts with CBO/ABO, review state, budgets, real-time analytics. |
| `GET`  | `/v1/ads/campaigns` | List campaigns across connected ad accounts. |
| `PUT`  | `/v1/ads/campaigns/{campaignId}` | Update a CBO campaign (budget, status). |
| `PUT`  | `/v1/ads/campaigns/{campaignId}/status` | Pause/resume campaign. |
| `PUT`  | `/v1/ads/ad-sets/{adSetId}` | Update an ABO ad set (budget, status). |
| `PUT`  | `/v1/ads/ad-sets/{adSetId}/status` | Pause/resume ad set. |
| `GET`  | `/v1/ads/{id}` | Get ad details, spend, status, creative. |
| `PUT`  | `/v1/ads/{id}` | Update ad status, budget, schedule, targeting. |
| `GET`  | `/v1/ads/{id}/analytics` | Spend, impressions, CTR, CPC, CPM, ROAS, with breakdowns. |
| `POST` | `/v1/ads/audiences` | Create a Custom Audience (customer list, website pixel, lookalike). |
| `POST` | `/v1/ads/audiences/{id}/users` | Add users to a Custom Audience (SHA-256 hashing applied automatically). |

There are also bulk delete/duplicate endpoints (campaigns cascade to ad sets and ads); paths not yet captured in the public docs sample.

### `goal` enum

**Verbatim from `https://docs.zernio.com/changelog` (2026-04-24):**

> Ads goals have been expanded in `POST /v1/ads/boost` and `POST /v1/ads/create`: `goal` now supports `engagement`, `traffic`, `awareness`, `videoviews`, `lead generation`, `conversions`, and `app_promotion` (availability varies by platform).

So the full enum is:

```
engagement
traffic
awareness
videoviews          ← single-token, no underscore (NOT "video_views" or "video views")
lead generation     ← space, NOT underscore (NOT "lead_generation")
conversions
app_promotion       ← underscore (NOT "appPromotion" or "app promotion")
```

The inconsistent casing/separators (`videoviews` vs `lead generation` vs `app_promotion`) is what the docs publish — assume Zernio normalizes platform-side. Live re-probe with a `goal: "_invalid"` body once the add-on is active will confirm the exact accepted forms via the validation error.

Per-platform examples in the marketing docs use these values:
- Meta: `"conversions"` (zernio.com/meta-ads-api)
- TikTok: `"conversions"` (zernio.com/tiktok-ads-api)
- LinkedIn: `"engagement"` (zernio.com/linkedin-ads-api)
- Pinterest: `"traffic"` (zernio.com/pinterest-ads-api)

**Notably absent from observed examples:** `PAGE_LIKES`, `FOLLOWERS`. Meta's native objectives like `OUTCOME_ENGAGEMENT` / `OUTCOME_LEADS` are not surfaced — Zernio appears to abstract them into the simpler enum above and translate platform-side.

### Creative format

`/v1/ads/boost` reuses an existing `postId` — so our Zernio scheduled-post creative flows directly into a boost. Good fit for our pipeline.

`/v1/ads/create` uses a **separate creative shape** (e.g., `videoUrl`, `callToAction`, `landingPageUrl`) — it does not appear to accept the full `createPost` body. Headline/primary text/description fields are not documented in the snippets we've seen; assume per-platform creative variants are needed and probe before building.

### Targeting fields (sampled)

```json
{
  "targeting": {
    "age_min": 25,
    "age_max": 45,
    "countries": ["US", "CA", "GB"],
    "locations": [{ "id": "6252001", "name": "United States" }]
  }
}
```

Custom audiences and lookalikes are created separately via `/v1/ads/audiences` and then referenced. **No documented helper** to spawn a lookalike from "current Instagram followers of brand X" — that would require user-supplied source audiences inside Meta Business Manager.

### Ad account connection flow

**Zernio-brokered OAuth, not user-paste.** Confirmed via:

- `https://zernio.com/x-ads` quick-start: "**2. Connect Your X Ads Account.** OAuth flow with your X account. We handle OAuth 1.0a request signing behind the scenes."
- `https://zernio.com/google-ads` quick-start: "**2. Connect Your Google Ads Account.** OAuth with your Google account — no MCC required, no developer token required."
- `https://zernio.com/tiktok-ads-api` and `https://zernio.com/meta-ads-api` quick-starts: "**Connect Account.** Use our OAuth flow to connect [Meta/TikTok] Ads accounts."

Reuses the existing `/v1/connect/{platform}` SDK pattern (`getConnectUrl` in `@getlatedev/node`) — the platform identifier for ads variants likely follows the same convention as organic accounts (e.g. `meta-ads`, `tiktok-ads`, `google-ads`, `x-ads`). The exact platform string is **unconfirmed** until we activate the add-on and call `getConnectUrl({ platform: "..." })` — there is no public docs page enumerating ad-platform identifiers.

After OAuth completes, the ad account surfaces in API call bodies as `adAccountId` with platform-native format:

| Platform | `adAccountId` example | Source |
|----------|----------------------|--------|
| Meta (FB+IG) | `"act_1234567890"` | zernio.com/meta-ads-api |
| LinkedIn | `"urn:li:sponsoredAccount:12345"` | zernio.com/linkedin-ads-api |
| TikTok | `"7123456789012345678"` | zernio.com/tiktok-ads-api |
| Pinterest | `"549123456789"` | zernio.com/pinterest-ads-api |

So the user does NOT paste a raw ad account ID — they OAuth via Zernio, and Zernio surfaces the ad accounts they then reference by ID in API calls. There is no "manual paste" flow documented.

### Billing model

- **User brings their own ad accounts.** Spend is billed by Meta/Google/TikTok/etc. directly to the user's connected ad account. Zernio does not intermediate spend.
- **Ads add-on is a paid Zernio plan upgrade.** Available on Build, Accelerate, or Unlimited plans (per `zernio.com/x-ads` and `zernio.com/google-ads` quick-starts: "Available on Build, Accelerate, or Unlimited Zernio plans"). Discrete add-on line-item price not captured verbatim — verify on the live billing page when activating.
- We are on the **Dominate (AppSumo lifetime)** plan, which **does not include** the ads add-on. Step 0 of integration is purchasing/activating it.

### Webhooks

**No ad-specific webhook events.** Confirmed via Zernio docs scan (changelog, per-platform ads API pages, social-media-ads page) — none mention webhook events for ad lifecycle. The existing webhook receiver covers post lifecycle only (`post.published`, `post.failed`, etc.). Ad lifecycle (approval, disapproval, spend thresholds, daily budget exhausted) is **poll-only** via `GET /v1/ads/{id}` and `GET /v1/ads/{id}/analytics`. If we integrate, build a Vercel cron job (or extend the existing scheduling cron) — do not wait for webhooks.

### Rate limits

**No `RateLimit-*`, `X-RateLimit-*`, or `Retry-After` headers returned** on either `/v1/ads/tree` (403) or `/v1/posts` (200) — Zernio simply does not surface rate-limit telemetry in response headers (live header dump 2026-04-24). The per-platform marketing pages (`zernio.com/meta-ads-api`, etc.) advertise that they document "rate limits" in their API references but do **not** publish numeric ceilings on the public pages we crawled. Verbatim Perplexity result: "No rate-limit section with actual numbers appears on any zernio.com/*-ads-api pages for LinkedIn, Meta, TikTok, or Pinterest."

Working assumption: same plan-tier ceilings as core Zernio scheduling (Build 120/min, Accelerate 600/min, Unlimited 1200/min). Re-confirm via header inspection (or a 429 response) once the add-on is active. Build any polling cadence to stay well under those limits — a 5-minute analytics-refresh poll across 50 active ads is ~600 calls/hour = 10/min, comfortably under Build tier.

### SDK coverage

**Confirmed: no ads coverage in `@getlatedev/node@0.1.7`.** Live grep against `node_modules/@getlatedev/node/dist/index.js` and `index.d.ts` (5,105 lines of type exports) returns **zero** matches for `ads`, `Ads`, `/v1/ads`, `boost`, or any ad-related identifier. The full export list ends at `YouTubeScopeMissingResponse` — no `AdsCreate*`, `AdsBoost*`, `AdsCampaign*`, `AdsAnalytics*` types exist.

Until a `client.ads.*` namespace ships, all ads calls must use raw `fetch` with the same Bearer token — the same pattern as `/v1/analytics/best-time`. Watch SDK releases (`npm view @getlatedev/node versions`) for an `Ads*` type addition and switch over once available.

### Response shapes (still partially unknown)

Public docs only show **request bodies and the platform-side ID echoed back** (`ad.platformAdId`). Full success-payload JSON has not been published verbatim. What we know:

```js
// POST /v1/ads/boost and POST /v1/ads/create — response shape inferred
// from per-platform marketing-page snippets that do `console.log(ad.ad.platformAdId)`:
{
  "ad": {
    "platformAdId": "<platform-native ad ID, e.g. Meta '120209876543210'>"
    // …other fields not enumerated in public docs
  }
}
```

```js
// GET /v1/ads/{id}/analytics — verbatim from zernio.com/linkedin-ads-api:
{
  "metrics": {
    "spend": 487.20,
    "impressions": 52300,
    "clicks": 1420,
    "ctr": 2.72,
    "cpc": 0.34,
    "cpm": 9.32
    // ROAS appears for Meta/conversions campaigns; not in this LinkedIn example
  }
}
```

`GET /v1/ads/{id}` (single ad detail, with status, creative, current spend) and `GET /v1/ads/tree` (full hierarchy) shapes are **not published**. Capture and document them on the first live call after the add-on is active.

### Open probes (now scoped post-add-on)

Once the Ads Add-On is purchased, run these in order — each is a one-call probe:

1. `GET /v1/ads/platforms` — likely returns the list of ad-platform connection identifiers (e.g. `meta-ads`, `tiktok-ads`). Confirms the OAuth platform string for `getConnectUrl`.
2. `GET /v1/ads/tree` with **no** ad accounts connected — capture the empty-state payload (likely `{ "campaigns": [] }` or similar).
3. OAuth-connect a single Meta ad account via `/v1/connect/<platform-string>`, then re-call `GET /v1/ads/tree` — capture full payload shape.
4. `POST /v1/ads/create` with `goal: "_invalid"` — capture the validation error payload to verify the exact accepted `goal` enum strings (especially `videoviews` vs `video_views`, `lead generation` vs `lead_generation`).
5. `POST /v1/ads/boost` with one of our scheduled `postId`s (status `paused`) — confirm whether scheduled (unpublished) posts are accepted, or only published ones. Delete after.
6. `GET /v1/ads/{id}` and `GET /v1/ads/{id}/analytics` against the test ad — capture full response shape and document here.
7. Inspect response headers on every probe for any `RateLimit-*` headers that only appear on ads endpoints.
8. Probe whether ad creative supports carousel/PDF (our LinkedIn doc-carousel pattern) or only single-image/video — `POST /v1/ads/create` with `mediaItems: [...]` and inspect the validation response.
