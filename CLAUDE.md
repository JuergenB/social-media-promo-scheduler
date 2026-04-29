# Social Media Promo Scheduler — Claude Code Instructions

## Project Overview
Next.js 16 app (forked from LateWiz) for automated social media campaign generation and scheduling. Takes a URL (exhibition, blog post, artist page) and generates a 6-month promotional campaign with tapering frequency. Uses Zernio API for social media scheduling, Airtable for data storage and approval workflows.

## Rule 1: Read code before answering

**NEVER answer questions about how something works from memory alone.** Read every file in the chain first. The code is the source of truth.

## Rule 2: GitHub Issues are the source of truth

**When a design or feature is discussed:** Create a GitHub issue immediately with the full spec. Design documents belong in GitHub Issues, not in conversation history.

**When closing an issue:** Add a comment summarising what was built and which files changed.

## Rule 3: Never ask the user to do what you can do yourself

CLI tools are pre-approved: `git`, `gh`, `npm`, `npx`, `node`, `python3`, `curl`, `vercel`, `lsof`, `kill`, `jq`, `open`, `tree`.
Airtable schema changes: use the Meta API directly, never ask the user to edit Airtable manually.

## Rule 4: Use Perplexity for ALL research — NEVER use WebSearch or WebFetch

**All research tasks must use the Perplexity MCP tools** (`search`, `reason`, or `deep_research`). Do NOT use the WebSearch or WebFetch tools — they are unreliable and the user does not trust them. This includes research launched via subagents — subagents must also use Perplexity, not WebSearch/WebFetch.

When delegating research to an Agent subagent, explicitly instruct it to use Perplexity MCP tools and NOT WebSearch/WebFetch.

## Rule 5: Execute ALL user instructions in a single pass

When the user gives multiple instructions in one message, implement ALL of them before responding. Do not silently drop instructions.

## Rule 6: Visual testing — sparing, honest, Playwright-preferred

See the global rule "Visual Verification — Use Sparingly, Honestly" in `~/.claude/CLAUDE.md` for the full policy. The summary in this project:

- **Screenshots only for first-render / multi-step flow / regression detection** — not iterative design refinement, not pixel-precision work, not "does this look good" judgments.
- **When taking one, report two parts:** what the screenshot verifies vs. what still needs the user's eyes.
- **Bail out at 2 attempts** on a visual issue. Ask for explicit values; don't try a third time.
- **Default to design system** (shadcn defaults, Tailwind scale). Custom values require user-provided justification.

**Tooling:**
- New scripts: **Playwright with `storageState`**. Use `scripts/lib/playwright-auth.mjs` (one-time interactive login → reusable `.auth/state.json`, gitignored). No more credential parsing in scripts.
- Existing Puppeteer helpers (`scripts/lib/puppeteer-auth.mjs` and the ~17 scripts that use it) stay as-is — they're clean (POST flow, no hardcoded creds). Don't migrate working code.
- Both `puppeteer@24.40.0` and `playwright` are installed.

## Allowed Bash Commands

- `git *`
- `gh *`
- `npm *`
- `npx *`
- `node *`
- `curl *`
- `lsof *`
- `kill *`
- `rm -rf .next`
- `mkdir *`
- `ls *`

## Dev Environment

- **Port: 3025** — `npm run dev` (hardcoded in package.json). Do NOT use 3000 (reserved for other projects).
- **Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui, Zustand, TanStack Query
- **API:** Zernio (formerly Late) — `@getlatedev/node` SDK
- **Data:** Airtable (new base, TBD)
- **Image Storage:** Vercel Blob (permanent public URLs, `@vercel/blob`)
- **Deployment:** Vercel
- **User Timezone:** America/New_York (Eastern Time)

## Project Structure

```
polywiz-app/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── brands/         # GET active brands, PATCH update brand
│   │   │   ├── campaigns/      # GET list (?status=active|archived|all, default active), POST create, GET/PATCH/DELETE [id], POST [id]/generate (SSE, auto-unarchives), POST [id]/reset, POST [id]/schedule (?postIds= optional filter), POST [id]/publish, POST [id]/archive ({cleanupDrafts?}), POST [id]/unarchive, POST [id]/cleanup (deletes Pending+Dismissed), POST/DELETE [id]/image, POST [id]/sync (Zernio schedule sync)
│   │   │   ├── campaign-type-rules/ # GET all types, GET/PATCH single type
│   │   │   ├── generation-rules/ # GET/POST rules, PATCH/DELETE [id]
│   │   │   ├── feedback/       # GET (last 90 days), POST feedback entries
│   │   │   ├── posts/           # PATCH [id] update post fields, DELETE [id], POST [id]/image, POST [id]/publish, POST [id]/cover-slide (preview/apply/delete), POST [id]/cover-slide-content (AI text gen), POST/PATCH/DELETE [id]/carousel-pdf (LinkedIn user-PDF override)
│   │   │   ├── posts/reorder/    # POST — bulk reorder (accepts { postIds: string[] }, writes Sort Order indices)
│   │   │   ├── cover-slide-templates/ # GET active templates (filtered by brand)
│   │   │   ├── webhooks/zernio/ # POST — Zernio webhook receiver (post.published/failed/partial status sync)
│   │   │   ├── platform-settings/ # GET platform best practices from Airtable
│   │   │   ├── auth/           # NextAuth endpoints
│   │   │   ├── auto-auth/      # Server-side API key provider
│   │   │   └── validate-key/   # Zernio key validation
│   │   ├── dashboard/
│   │   │   ├── campaigns/      # Campaign list + /new creation + /[id] detail (posts, settings)
│   │   │   ├── compose/        # Post composer (from LateWiz)
│   │   │   ├── calendar/       # Calendar view (from LateWiz)
│   │   │   ├── accounts/       # Connected social accounts (from LateWiz)
│   │   │   ├── queue/          # Queue management (from LateWiz)
│   │   │   └── settings/       # General settings + /brands + /platforms + /campaign-types
│   │   ├── callback/           # OAuth callbacks
│   │   └── login/              # Auth login page
│   ├── components/
│   │   ├── campaigns/          # FrequencyPreview, ArchiveCampaignDialog, CampaignRowActions (overflow menu)
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── shared/             # Logo, ErrorBoundary, PlatformIcon
│   │   ├── accounts/           # Account cards
│   │   └── posts/              # Post cards, media selectors, carousel/card designers
│   ├── hooks/                  # React hooks (useAccounts, usePosts, etc.)
│   ├── lib/
│   │   ├── late-api/           # Zernio API client & platform types
│   │   ├── airtable/           # Airtable REST client, TypeScript types, campaign-type-rules fetch, user profile lookup
│   │   ├── anthropic.ts        # Claude Sonnet 4.6 client (per-brand key resolution)
│   │   ├── blob-storage.ts     # Vercel Blob upload/delete, Sharp server-side optimization (PNG/WebP→JPEG)
│   │   ├── image-compression.ts # Client-side compression, PNG→JPEG conversion, timeout guards
│   │   ├── image-crop.ts       # Platform aspect ratio auto-crop (center-crop to 16:9 for Instagram/Threads)
│   │   ├── lnk-bio.ts          # lnk.bio OAuth2 client — auto-create link-in-bio entries after Instagram publish
│   │   ├── pdf-carousel.ts     # LinkedIn PDF carousel — assemble multi-image posts into PDF via pdf-lib
│   │   ├── cover-slide-renderer.ts # Cover slide band layout engine (Satori + Sharp)
│   │   ├── cover-slide-types.ts # TypeScript types for band specs, templates, content, render options
│   │   ├── fonts.ts            # Shared font registry for Satori (6 Noto Sans/Serif variants)
│   │   ├── brand-access.ts     # Server-side brand access helpers (user-brand mapping)
│   │   ├── firecrawl.ts        # Blog + newsletter scraper with H2/H3 section parsing & image extraction
│   │   ├── scheduling.ts       # Tapering schedule algorithm, date assignment with collision avoidance
│   │   ├── campaign-post-cleanup.ts # Shared helper — delete campaign posts (optionally filtered by status) with cascading Short.io/lnk.bio/Zernio cleanup
│   │   ├── short-io.ts         # Short.io link shortener (per-brand domain/key)
│   │   ├── prompts/            # Generation prompt templates + dynamic compose-prompt.ts
│   │   └── brand-context.tsx   # BrandProvider + useBrand() hook
│   └── stores/                 # Zustand stores (app, auth)
├── scripts/                    # seed-airtable.js, seed-campaign-type-rules.js (one-time seeding)
├── public/brands/              # Downloaded brand logos (local copies)
├── docs/                       # Documentation, API reference, background research
├── .env.local                  # Secrets (never commit)
└── CLAUDE.md                   # This file
```

## Zernio API

- **Base URL:** `https://zernio.com/api`
- **Auth:** Bearer token (`sk_` prefixed), stored in `LATE_API_KEY` env var
- **SDK:** `@getlatedev/node` (npm package)
- **CLI:** `@zernio/cli` (global install)
- **Key endpoints:** See `docs/zernio-api-openapi.yaml` (inventory) and `docs/reference/zernio-api.md` (project-specific quirks, best-time response shape, update gotchas)
- **Rate limits:** Vary by plan (Free: 60/min, Build: 120/min)
- **Response shape:** `createPost` returns `{ post: { _id: "..." }, message: "..." }` — the post ID is nested under `.post._id`, NOT at the top level `._id`. Always extract via `data.post._id`.
- **Campaign-relevant features:**
  - Per-platform `customContent` and `customMedia` per post
  - Per-platform `scheduledFor` overrides
  - Post recycling with content variations (weekly/monthly)
  - Queue system with recurring time slots
  - Bulk CSV upload
  - Webhooks for post lifecycle events

## Airtable

- **Base ID:** `app5FPCG06huzh7hX`
- **PAT:** stored in `.env.local` as `AIRTABLE_API_KEY` (prefix `patO7R...`)
- **Base URL:** https://airtable.com/app5FPCG06huzh7hX/
- **Meta API:** `GET/PATCH https://api.airtable.com/v0/meta/bases/{baseId}/tables` — for schema changes
- **Never ask the user to manually create/modify fields in the Airtable UI.** Use the REST API or write a script.

### Tables

| Table | ID | Purpose |
|-------|-----|---------|
| Brands | `tblK6tDXvx8Qt0CXh` | Brand profiles, voice guidelines, logos, Zernio profile links. **lnk.bio fields:** `Lnk.Bio Enabled` (checkbox), `Lnk.Bio Group ID`, `Lnk.Bio Username`, `Lnk.Bio Client ID Label`, `Lnk.Bio Client Secret Label` (label fields name per-brand env vars for OAuth credentials) |
| Campaigns | `tbl4S3vdDR4JgBT1d` | Campaign config (URL, type, duration, bias, editorial direction, og:image, event date, event details, additional URLs, target platforms, max variants per platform). **Scraped Images** (JSON array of `{url, alt, storyTitle?}`) populated during generation — surfaced in post editor as campaign image library. **Archived At** (dateTime) — null = active, timestamp = hidden from default views (user-initiated archive, orthogonal to Status lifecycle) |
| Posts | `tblyUEPOJXxpQDZNL` | Generated post drafts per platform, approval status (Draft/Approved/Dismissed), scheduling status (Queued/Scheduled/Published). **Image Upload** attachment field for per-post image swap/override. **imageIndex** (integer) for catalog-based image selection, **subject** field declares who/what each post is about, **Sort Order** (integer) for user-defined scheduling priority, **Platform Post URL** for published post permalink, **Collaborators** (JSON array of Instagram usernames for collab invites), **User Tags** (JSON array of Instagram usernames for image tagging), **Carousel PDF URL** (LinkedIn-only — Vercel Blob URL of a user-supplied PDF that, when set, replaces the auto-assembled carousel at publish time) |
| Platform Settings | `tbl3CXqVmk4GVkmQn` | 13 records: character limits, URL handling, tone per platform |
| Image Sizes | `tbl1gXZgmKzfLH2X5` | 29 records: image dimensions per platform per image type |
| Campaign Type Rules | `tblh0R7a5PyNZXt2Y` | 11 records: type definitions, descriptions, icons, status, scraper strategy (includes "Open Call" — Coming Soon) |
| Generation Rules | `tbliTMGAEuaU9CLBf` | Editorial rules per campaign type, composed into prompt fragments |
| Feedback Log | `tblZWSKDdVYUcHX5J` | Structured feedback on generated posts, linked to posts/campaigns/types |
| Cover Slide Templates | `tblk0l8nE9SDP0lca` | Band-based layout templates for carousel cover slides (JSON spec, color scheme, fonts, brand/type associations) |
| Users | `tblyUmt78haC25nPZ` | User-to-brand access mapping: email, role, allowed brands, default brand |

### Source base (read-only reference)
- `appDFU2JdAw2Ckax4` — Artwork Archive campaigns base (brand logos in Campaigns table)
- `appa1MQoMsfZ0WCPu` — Platform Settings + Image Sizes source (cloned from here)

## Existing n8n Workflows (reference only, not extending)

- `ptljiEPKOXED850E` — "First Fridays Exhibition Importer & Enhancer V2" — scrapes exhibitions, classifies artworks, profiles artists
- `wbb8rik5kgcDVFIE` — "First Fridays Promo Pack Generator" — AI carousel content + Orshot rendering
- Airtable: `app7fpZnDmqgPxQPV` — legacy exhibition/artwork/artist data

## Conventions

- Use shadcn/ui components from `components/ui/`
- Use `cn()` from `lib/utils.ts` for class merging
- App Router only (no pages/ directory)
- All AI prompts must follow the XML-tag prompt architecture from global CLAUDE.md
- **Image catalog approach:** Claude selects images by `imageIndex` from a numbered catalog. Works across all CMS platforms (Ghost, BigCommerce, WordPress, etc.). Multi-section blog posts use section headings as image labels when alt text is empty.
- **Image caption extraction:** `scrapeBlogPost` requests both markdown and HTML from Firecrawl. HTML `<figcaption>` tags and WordPress `wp-caption` divs are parsed and matched to images by URL basename. Markdown trailing text (Firecrawl's rendering of figcaptions) serves as fallback. Caption priority: figcaption > alt text > section heading > filename. The `ScrapedImage.caption` field is stored in the campaign's `Scraped Images` JSON and flows through to image catalogs, campaign image library, and post media captions. Retroactive backfill script: `scripts/backfill-captions.mjs`.
- **Image-Text Integrity Rule:** Constraint hierarchy — editorial direction cannot override integrity rules. Claude must not guess names, attribute artwork to wrong artists, or fabricate attribution. This is enforced in prompt templates.
- **Image filtering:** Thumbnails <200px in URL paths are rejected. Dimension-aware dedup keeps the largest version. Supplemental URL images are filtered by entity overlap with the main URL content.
- **lnk.bio integration:** Per-brand link-in-bio sync, gated by the `Lnk.Bio Enabled` toggle on each Brand record (The Intersect, Not Real Art, Artsville USA currently enabled; Sugar Press Art toggled off). Instagram-only scope — lnk.bio entries are created on schedule/publish and kept in sync across 7 lifecycle transitions: post delete, revert-to-draft, reschedule, content edit, image edit, campaign delete/reset, and Zernio `post.failed` webhook (mutations are delete-then-recreate). Architectural gap: Zernio does not emit a `post.reverted` webhook, tracked in [#142](https://github.com/JuergenB/polywiz-app/issues/142). Credentials are OAuth2 `client_credentials` scoped per profile — each brand record names its own env vars via `Lnk.Bio Client ID Label` / `Lnk.Bio Client Secret Label` fields (e.g. `LNKBIO_CLIENT_ID_INTERSECT` / `LNKBIO_CLIENT_SECRET_B64_INTERSECT`), falling back to unscoped `LNKBIO_CLIENT_ID` / `LNKBIO_CLIENT_SECRET_B64`. Client is `src/lib/lnk-bio.ts`; see `docs/reference/lnk-bio-api.md`.
- **lnk.bio `schedule_from` timezone:** Must be RFC 3339 with the brand's **local IANA offset** (e.g. `-04:00`), not UTC `Z`. The lnk.bio dashboard renders the literal wall-clock of whatever offset we send — an 8 AM ET post formatted as UTC `Z` displays as 12 PM on the bio page (a 4-hour visual drift). `createLnkBioEntry` threads `brand.fields.Timezone` through `date-fns-tz` (`XXX` offset token), defaulting to `America/New_York`. This is a follow-up to [#164](https://github.com/JuergenB/polywiz-app/issues/164)'s DST-safe UTC fix — the instant was correct, only the dashboard display was wrong.
- **lnk.bio display order quirk:** The lnk.bio Current Posts dashboard grid sorts scheduled entries by **creation time DESC** — it ignores both `schedule_from` and the `position` API parameter (both confirmed by probe on 2026-04-24). New entries scheduled into the middle of an existing queue will display out of chronological order on the bio page. Mitigation: run `scripts/backfill-lnkbio-tz-and-position.mjs --brand "<Brand Name>"` to re-create entries earliest-schedule-first (furthest-future is created last, lands at top of the grid). UI-triggered per-brand re-sort utility tracked in [#177](https://github.com/JuergenB/polywiz-app/issues/177).
- **Campaign archive + cleanup:** Archive is orthogonal to Status lifecycle — an archived campaign retains its prior status (Completed, Active, etc.) but `Archived At` is set, which hides it from default list/dashboard views. `POST /api/campaigns/[id]/archive` accepts `{ cleanupDrafts: boolean }` to atomically delete Pending+Dismissed posts while archiving. Cleanup cascades to Short.io links, lnk.bio entries, and Zernio scheduled posts via the shared `cleanupCampaignPosts` helper in `src/lib/campaign-post-cleanup.ts`. Regenerating content on an archived campaign auto-unarchives (`Archived At` cleared in the generate route). Dashboard (`/api/dashboard`) and campaigns list (`/api/campaigns`) both filter out archived by default — the list accepts `?status=active|archived|all`.
- **Zernio webhook:** `POST /api/webhooks/zernio` receives post lifecycle events and syncs status to Airtable. On `post.published`/`post.partial`, also captures `publishedUrl` from platform results → stored in `Platform Post URL` field. Auth middleware bypassed for `/api/webhooks` path. Currently registered via ngrok; permanent URL tracked in #67. Note: Zernio does not emit a webhook for "reverted to draft" — only `post.published`, `post.failed`, `post.partial`, `post.scheduled`.
- **Zernio scheduled post sync:** When content or media is edited on a post with a `Zernio Post ID`, the PATCH endpoint (`/api/posts/[id]`) fire-and-forgets an `updatePost` call to Zernio. **Must include `scheduledFor`** in the update body — omitting it causes Zernio to revert the post from scheduled to draft.
- **LinkedIn PDF carousel:** Posts with 2+ images targeting LinkedIn are auto-assembled into a PDF at publish time using `pdf-lib`. PDF uploaded to Zernio as document media type. **User-supplied PDF override**: a LinkedIn post can attach a pre-made PDF via the image drop zone (file picker / drag-drop, `application/pdf` only, ≤25MB). Stored in the `Carousel PDF URL` field on the Posts table; uploaded direct to Vercel Blob via `@vercel/blob/client` `upload()` to bypass the ~4.5MB serverless function payload cap. When set, the publish route + `post-downstream-sync` skip the auto-assembly entirely and ship that PDF as the only Zernio mediaItem (`type: "document"`). The image grid stays visible in the UI (banner: "PDF carousel attached") so the user can flip back. Adding an image while a PDF is attached prompts `confirm()` and detaches the PDF on confirm. Endpoint: `POST/PATCH/DELETE /api/posts/[id]/carousel-pdf` (POST = `handleUpload` token gen for the direct-to-Blob upload; PATCH = finalize-after-upload save called by the client; DELETE = clear field + delete Blob).
- **Cover slide designer:** Optional editorial cover slide prepended to carousel posts. Uses a horizontal band layout engine (Satori + Sharp) with Airtable-driven templates. AI generates text from post/campaign context. User can adjust font sizes, pick background colors via eyedropper, reposition the background image. Templates in Cover Slide Templates table (`tblk0l8nE9SDP0lca`). Cover slide uses the original raw image (from Original Media backup), not rendered slides. Supports additive card creation via `insertPosition: "append"` — new cards append to carousel without displacing the existing cover at position 0.
- **Image selectors:** Outpainting and card creation use image selector dialogs (`OutpaintImageSelector`, `CardImageSelector`) that filter out designed cards via `CoverSlideData.designedCardUrls`. Shared filtering utility: `getEligibleOutpaintIndices()` in `media-items.ts`. Single eligible image skips the selector.
- **Post reordering:** Approved posts can be drag-reordered in the campaign detail view (when Approved/Modified status filter is active). Uses `@dnd-kit/core` + `@dnd-kit/sortable`. Sort order is persisted to the `Sort Order` field on the Posts table via `POST /api/posts/reorder`. The scheduling algorithm respects `sortOrder` (ascending, nulls last) — lower sort order = earlier scheduled date.
- **Campaign image library:** Scraped images from campaign generation are surfaced as a clickable thumbnail row when adding images to posts (`CampaignImageLibrary` component). Alt text from scraping auto-fills captions — especially valuable for exhibitions with rich attribution. Data source: `Scraped Images` field on Campaigns table.
- **Instagram collaboration:** Posts targeting Instagram can include up to 3 collaborator usernames (collab invite, co-publishes to both feeds) and image user tags (appears on tagged users' Tagged tab, center-positioned). Stored as JSON string arrays in `Collaborators` and `User Tags` fields on Posts table. Surfaced in an expandable "Collaboration" section on Instagram post detail cards. Passed through `platformSpecificData` at publish time.

## Session Rules

1. **Read code before answering.** Do not answer from memory.
2. **Execute ALL user instructions.** Do not silently drop any.
3. **Convert timestamps to ET.** Zernio API timestamps are UTC. User is in America/New_York.
4. **Save important discoveries to memory immediately.** Do not wait until end of session.

## Post-Commit Checklist (MANDATORY after every commit)

After every `git commit`, run through this checklist before responding to the user. This is not optional.

### 1. GitHub Issues
- **Scan ALL open issues** (`gh issue list --state open`). For each one, ask: does this commit fully or partially resolve it?
- **Fully resolved:** Close with a comment listing what was built and which files changed.
- **Partially resolved:** Add a comment describing what was done and what remains. Do NOT close.
- **New work discussed but untracked:** Create an issue immediately. Design discussions, feature ideas, and bugs mentioned in conversation must not live only in chat history.
- **Follow-up work from partial closures:** Create a new issue referencing the original.
- **Never close an issue just because it was discussed.** Only close when the described implementation exists in the codebase.

### 2. README.md
- Does the README's "Project Status" checklist reflect what was just built?
- Do the architecture descriptions still match reality? (e.g., new routes, new tables, new components)
- Are any new third-party integrations mentioned? (e.g., Firecrawl scraping on campaign creation)

### 3. CLAUDE.md
- Does the Project Structure tree reflect new directories/files?
- Are new Airtable tables/fields documented in the Airtable section?
- Are new API routes or conventions captured?

### 4. GETTING_STARTED.md
- Are phase status indicators current? (e.g., Phase I tasks marked as done)
- Do the task tables reflect completed work?

### 5. Only commit and push when explicitly asked
- Do NOT commit or push proactively.
- When the user says "push", "commit", or "document and push": commit, push, AND run this full checklist.
- If the user asks "are we up to date?" — report status but do not push until told to.
