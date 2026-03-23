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
│   │   ├── dashboard/          # Scheduling UI (from LateWiz)
│   │   │   ├── compose/        # Post composer
│   │   │   ├── calendar/       # Calendar view
│   │   │   ├── accounts/       # Connected social accounts
│   │   │   ├── queue/          # Queue management
│   │   │   └── settings/       # Settings
│   │   ├── campaigns/          # NEW: Campaign generator & approval queue
│   │   ├── callback/           # OAuth callbacks
│   │   └── api/                # API routes
│   ├── components/             # UI components
│   ├── hooks/                  # React hooks
│   ├── lib/
│   │   ├── late-api/           # Zernio API utilities
│   │   ├── airtable/           # NEW: Airtable client & campaign data
│   │   └── campaign/           # NEW: Campaign generation logic
│   └── stores/                 # Zustand stores
├── docs/                       # Documentation & Zernio API reference
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
4. **Close issues immediately** when implementing code is committed.
5. **Save important discoveries to memory immediately.** Do not wait until end of session.
