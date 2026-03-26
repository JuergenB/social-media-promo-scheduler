# Handover: Issue #39 — Dynamic Campaign Type Rules

## Context

PolyWiz is a Next.js 16 social media campaign generator. It scrapes blog posts/newsletters, generates platform-specific social posts via Claude Sonnet 4.6, and saves them to Airtable for review.

**What just shipped (#38):** Blog posts with multiple artists now parse into H2/H3 sections. Each section's images stay bound to that section so the AI can't pair the wrong artist's artwork with the wrong artist's text. This works, but the rules that govern how each campaign type behaves (scraping strategy, editorial constraints, image handling) are hardcoded in `src/lib/prompts/blog-post-generator.ts`. Issue #39 moves these rules to Airtable so they're editable without code changes.

## Goal

Build a dynamic, Airtable-backed rules system for campaign types. Full spec is in GitHub issue #39 on repo `JuergenB/social-media-promo-scheduler`. Read it first — it has the complete Airtable schema, UI wireframes, migration path, and example rules.

## What Exists Today

- **10 campaign types** defined in `src/lib/airtable/types.ts` (`CAMPAIGN_TYPES` array). Only Blog Post and Newsletter are enabled.
- **Hardcoded descriptions** in `src/app/dashboard/campaigns/new/page.tsx` (`CAMPAIGN_TYPE_DESCRIPTIONS`, `CAMPAIGN_TYPE_ICONS`, `ENABLED_CAMPAIGN_TYPES`).
- **One prompt template** (`src/lib/prompts/blog-post-generator.ts`) shared by Blog Post and Newsletter — no type-specific differentiation.
- **Section parsing** in `src/lib/firecrawl.ts` — `parseSections()` splits at H2/H3, `ContentSection` type, image-to-section binding. This stays in code.
- **Generate route** at `src/app/api/campaigns/[id]/generate/route.ts` — accepts `?platforms=` and `?maxPerPlatform=` for test mode.
- **Settings pages** exist at `/dashboard/settings/brands` and `/dashboard/settings/platforms` — use these as UI patterns.
- **Airtable base** `app5FPCG06huzh7hX` with tables: Brands, Campaigns, Posts, Platform Settings, Image Sizes.

## Recommended Approach (4 Phases)

### Phase 1: Schema + Seed (start here)
1. Create 3 new Airtable tables via Meta API (`POST https://api.airtable.com/v0/meta/bases/{baseId}/tables`):
   - **Campaign Type Rules** — replaces hardcoded type constants
   - **Generation Rules** — individual editorial rules per type
   - **Feedback Log** — structured feedback linked to posts
2. Seed Campaign Type Rules with all 10 types from `CAMPAIGN_TYPES`
3. Extract the implicit rules from `SYSTEM_PROMPT` and `buildUserPrompt()` into Generation Rules records for Blog Post and Newsletter
4. Add a Feedback link field to the Posts table
5. **No behavior change yet** — generation still uses hardcoded prompts

### Phase 2: Dynamic Prompt Composition
1. Create `src/lib/prompts/compose-prompt.ts` with `composeSystemPrompt()` and `composeUserPrompt()`
2. Create `src/lib/airtable/campaign-type-rules.ts` to fetch type config + rules
3. Update `generate/route.ts` to use the new composer instead of the hardcoded template
4. **Fallback**: if no rules found in Airtable, fall back to existing `blog-post-generator.ts`
5. Update campaign creation page to fetch type definitions from API instead of hardcoded constants

### Phase 3: Settings UI + Feedback
1. Build `/dashboard/settings/campaign-types` page — expandable cards per type showing rules, feedback, prompt preview
2. Add "Flag Issue" button to post cards on campaign detail page
3. API routes: `GET/PATCH /api/campaign-type-rules`, `GET/POST /api/feedback`

### Phase 4: Intelligence (stretch)
1. Feedback pattern aggregation with category counts
2. AI-assisted rule suggestions from accumulated feedback
3. Conversational onboarding for new types

## Key Files to Read First

| File | Why |
|------|-----|
| `src/lib/prompts/blog-post-generator.ts` | The monolithic prompt being replaced — understand what stays in code vs. moves to Airtable |
| `src/lib/firecrawl.ts` | Section parsing (`parseSections`, `ContentSection`) — stays in code, rules reference it |
| `src/app/api/campaigns/[id]/generate/route.ts` | The pipeline that will consume dynamic rules |
| `src/lib/airtable/client.ts` | Airtable REST client — use for table creation and CRUD |
| `src/lib/airtable/types.ts` | `CAMPAIGN_TYPES`, `ENABLED_CAMPAIGN_TYPES` — being replaced by Airtable |
| `src/app/dashboard/campaigns/new/page.tsx` | `CAMPAIGN_TYPE_DESCRIPTIONS` — being replaced |
| `src/app/dashboard/settings/brands/page.tsx` | UI pattern reference for the settings page |
| GitHub issue #39 | Full spec with Airtable schema, UI wireframes, example rules, migration path |

## What Stays in Code (Do Not Move to Airtable)

- Banned words list (universal, rarely changes)
- JSON output format specification (tightly coupled to response parsing)
- Platform token budgets (structural)
- Image assignment logic (`sectionIndex` lookup from #38)
- Short link creation
- Scraper function implementations (`parseSections`, `scrapeBlogPost`, `scrapeNewsletter`)

## What Moves to Airtable

- Campaign type definitions, descriptions, icons, enabled status
- Type-specific editorial rules and constraints
- Content pairing rules (e.g., "images must stay with their section artist")
- Tone modifications per type
- Scraping strategy selection (which scraper to use)
- Content angle suggestions per type

## Important Constraints

- **Airtable Meta API** for schema changes — never ask the user to edit Airtable manually
- **All research via Perplexity MCP** — never use WebSearch/WebFetch
- **Read code before answering** — the code is the source of truth
- **Prompt architecture**: XML tags for sections, primacy/recency for critical constraints (see global CLAUDE.md)
- **Port 3025** for dev server
