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
- **Deployment:** Vercel
- **User Timezone:** America/New_York (Eastern Time)

## Project Structure

```
social-media-promo-scheduler/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/
│   │   │   ├── brands/         # GET active brands, PATCH update brand
│   │   │   ├── campaigns/      # GET list, POST create, GET/PATCH/DELETE [id], POST [id]/generate (SSE), POST [id]/reset
│   │   │   ├── campaign-type-rules/ # GET all types, GET/PATCH single type
│   │   │   ├── generation-rules/ # GET/POST rules, PATCH/DELETE [id]
│   │   │   ├── feedback/       # GET (last 90 days), POST feedback entries
│   │   │   ├── posts/           # PATCH [id] update post fields, POST [id]/image upload/swap image
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
│   │   ├── campaigns/          # FrequencyPreview bar chart
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── shared/             # Logo, ErrorBoundary, PlatformIcon
│   │   ├── accounts/           # Account cards
│   │   └── posts/              # Post cards
│   ├── hooks/                  # React hooks (useAccounts, usePosts, etc.)
│   ├── lib/
│   │   ├── late-api/           # Zernio API client & platform types
│   │   ├── airtable/           # Airtable REST client, TypeScript types, campaign-type-rules fetch, user profile lookup
│   │   ├── anthropic.ts        # Claude Sonnet 4.6 client (per-brand key resolution)
│   │   ├── brand-access.ts     # Server-side brand access helpers (user-brand mapping)
│   │   ├── firecrawl.ts        # Blog + newsletter scraper with H2/H3 section parsing & image extraction
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
- **Key endpoints:** See `docs/zernio-api-openapi.yaml`
- **Rate limits:** Vary by plan (Free: 60/min, Build: 120/min)
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
| Brands | `tblK6tDXvx8Qt0CXh` | Brand profiles, voice guidelines, logos, Zernio profile links |
| Campaigns | `tbl4S3vdDR4JgBT1d` | Campaign config (URL, type, duration, bias, editorial direction, og:image, event date, event details, additional URLs, target platforms, max variants per platform) |
| Posts | `tblyUEPOJXxpQDZNL` | Generated post drafts per platform, approval status, scheduling. **Image Upload** attachment field for per-post image swap/override |
| Platform Settings | `tbl3CXqVmk4GVkmQn` | 13 records: character limits, URL handling, tone per platform |
| Image Sizes | `tbl1gXZgmKzfLH2X5` | 29 records: image dimensions per platform per image type |
| Campaign Type Rules | `tblh0R7a5PyNZXt2Y` | 11 records: type definitions, descriptions, icons, status, scraper strategy (includes "Open Call" — Coming Soon) |
| Generation Rules | `tbliTMGAEuaU9CLBf` | Editorial rules per campaign type, composed into prompt fragments |
| Feedback Log | `tblZWSKDdVYUcHX5J` | Structured feedback on generated posts, linked to posts/campaigns/types |
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
