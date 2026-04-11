# Continuation Prompt — Phase I: Campaign Pipeline

Copy everything below this line and paste it to start the next session.

---

## Context

We're building PolyWiz. The repo is at https://github.com/JuergenB/polywiz-app (private). Read the README.md, GETTING_STARTED.md, and CLAUDE.md first — they contain all project decisions, phased plan, and standing rules.

The app is a Next.js 16 fork of LateWiz (Zernio social media scheduler) with Auth.js v5 working. It runs on port 3025. Dev server is `npm run dev`.

### What's already built (don't rebuild):
- **Airtable schema** — 5 tables in base `app5FPCG06huzh7hX`: Brands (4 records with voice guidelines + logos), Campaigns, Posts, Platform Settings (13 records), Image Sizes (29 records). Issues #5, #15 closed.
- **Brand context** — `BrandProvider` + `useBrand()` hook. Defaults to The Intersect (has Zernio profile). Supports switching.
- **Campaign creation form** (`/dashboard/campaigns/new`) — Brand selector card (dark header, logo, voice preview, switch between brands), source URL, editorial direction, campaign type grid (10 types), duration presets with distribution bias, live frequency preview bar chart.
- **Campaign list** (`/dashboard/campaigns`) — 2-column card grid with og:image headers, title, status, meta row.
- **Settings** — Brands page (`/dashboard/settings/brands`) with dark header, inline edit for voice/URLs. Platform Settings browser (`/dashboard/settings/platforms`).
- **Sidebar** — Sectioned: Campaigns / Scheduling / Settings (expandable).
- **API routes** — `/api/brands` (GET/PATCH), `/api/campaigns` (GET/POST with Firecrawl og:image scrape), `/api/platform-settings` (GET).
- **Frequency preview** — `FrequencyPreview` component with exponential decay curve, adaptive axis labels, summary stats. Illustrative only — real algorithm in Phase II.

### Open issues with progress comments (check before working):
- #2 — Campaign creation (partially done, needs detail page + editing)
- #4 — Brand voice (partially done, needs structured format)
- #10 — Duration presets (partially done, needs per-type defaults)
- #11 — Distribution slider (partially done, bias buttons built, full slider in Phase II)
- #13 — Schedule preview (partially done, illustrative chart built)
- #17 — Campaign detail page and scrape-to-generate pipeline (THE MAIN TASK)

## What to do in this session

### Primary: Build the campaign pipeline (Issue #17)

This is the core of Phase I — what happens after a campaign is created. The campaign currently saves as a Draft. We need:

**1. Campaign detail page** (`/dashboard/campaigns/[id]`)
- Hero: og:image + campaign title + status + brand
- Source content section: scraped article/newsletter text
- Generated posts: list of platform-specific drafts
- Approval queue: approve/edit/dismiss each post
- Schedule preview: when approved posts will go out

**2. URL scraping** (Firecrawl)
- When a campaign moves to "Scraping" status, extract full content + images from the source URL
- Store scraped content in a new field on the Campaigns table (or a separate Content table)
- Use Firecrawl's `/v1/scrape` endpoint with `formats: ["markdown"]`

**3. Post generation** (OpenAI GPT-4.1)
- Generate platform-specific post drafts using: scraped content + brand voice guidelines + platform best practices (from Platform Settings table) + editorial direction
- Create Posts records in Airtable linked to the Campaign
- Each post: platform, content, suggested media URLs, scheduled date (from tapering curve), status=Pending
- Follow the AI Prompt Architecture from global CLAUDE.md (system prompt for role, XML tags, primacy/recency)

**4. Approval queue UI**
- List of generated posts grouped by platform
- Each post: preview, approve/edit/dismiss buttons
- Bulk approve option
- Status transitions: Pending → Approved/Modified/Dismissed

**5. Campaign status machine**
- Draft → Scraping → Generating → Review → Active → Completed
- Each transition triggers the next pipeline step
- Show status progress on the detail page

### API keys available in `.env.local`:
- `FIRECRAWL_API_KEY` — web scraping
- `OPENAI_API_KEY` — content generation (use gpt-4.1)
- `LATE_API_KEY` — Zernio scheduling (Phase I ends at approval; scheduling push is last step)
- `AIRTABLE_API_KEY` — data storage
- `PERPLEXITY_API_KEY` — deep research (via curl, NOT WebSearch/WebFetch)

### Important standing rules (read CLAUDE.md but especially):
- Port 3025 (never 3000)
- Use Perplexity via curl for ALL research (never WebSearch/WebFetch)
- Downplay AI in all team-facing copy. Lead with human control, editorial direction, artist service.
- Use Airtable Meta API for schema changes (never ask user to create fields manually)
- Read code before answering. GitHub issues are source of truth.
- **Post-commit checklist is MANDATORY** — after every commit: scan all open issues, update README status, update CLAUDE.md if structure changed, update GETTING_STARTED.md phase status. See CLAUDE.md for the full checklist.
- Do NOT commit or push unless explicitly asked.
