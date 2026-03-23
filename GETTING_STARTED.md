# Getting Started — Development Guide

This document outlines the phased development plan and how to start contributing.

## Quick Start

```bash
cd social-media-promo-scheduler
npm install
# Edit .env.local with your API keys (see .env.example)
npm run dev
# Open http://localhost:3025 → login with your credentials
```

### Credentials (Development)

| Email | Role | Access |
|-------|------|--------|
| juergen@polymash.com | admin | Full access, all brands |
| scottpower@arterial.org | admin | Full access, all brands |
| editor@notrealart.com | curator | Review/approve NRA campaigns |
| kbviking@gmail.com | curator | Review/approve campaigns |

Password for all: `REDACTED_PASSWORD` (development only)

---

## Multi-Brand Architecture

The system serves multiple brands from a single Airtable base with brand-level separation:

| Brand | Zernio Profile | Newsletter | Status |
|-------|---------------|------------|--------|
| **The Intersect** | The Intersect High Frequency | theintersect.art (Curated.co) | Active — 7 accounts connected |
| **Not Real Art** | TBD | newsletter.notrealart.com (Curated.co) | Planned |
| **Artsville USA** | TBD | TBD | Planned |
| **Arterial** | TBD | N/A | Planned |

Each brand has its own Zernio API key scoped to its profile. Switching brands in the UI swaps the active API key and filters campaigns/posts to that brand. All data lives in a shared Airtable base with a `Brand` field for separation.

### Why Shared Airtable?

- Platform settings (character limits, image sizes, best practices) are universal — no need to duplicate
- Team members work across brands — Kirsten curates NRA exhibitions but also reviews Artsville content
- Campaign analytics benefit from cross-brand comparison
- Simpler infrastructure — one base, one PAT, one schema

### What's Brand-Specific?

- Zernio API key (scoped to profile with its social accounts)
- Brand voice guidelines
- Campaign history
- Editorial direction defaults

---

## Development Phases

### Phase I: Foundation (MVP)

**Goal:** Create one campaign from a newsletter URL, generate posts, approve them, schedule them.

**Starting point:** The Intersect newsletter (theintersect.art) — Juergen's own newsletter with connected Zernio accounts.

| Task | Description |
|------|-------------|
| Airtable base setup | Create tables: Campaigns, Posts, Brands, Platform Settings, Image Sizes. Clone reference data from existing base. |
| Campaign creation UI | Form: URL input, brand selector, campaign type, duration preset, editorial direction |
| URL scraping | Firecrawl integration — extract content + images from newsletter/article URLs |
| Post generation | OpenAI integration — generate platform-specific post variants using brand voice + platform best practices |
| Approval queue | List view of pending posts with approve/edit/dismiss actions |
| Basic scheduling | Push approved posts to Zernio API with hardcoded tapering schedule |

**Campaign types for Phase I:**
- Newsletter (Curated.co) — primary development target
- Blog Post / Article — similar pipeline, good for validation

**Not in Phase I:** Per-platform frequency sliders, preset customization, image generation (Orshot), multi-brand switching, analytics.

### Phase II: Scheduling Engine + Multi-Brand

**Goal:** Per-platform tapering schedules, duration presets, distribution slider. Multi-brand support with API key switching.

| Task | Description |
|------|-------------|
| Tapering schedule engine | TypeScript implementation of Missinglettr-inspired exponential curve with per-platform cadence |
| Duration presets | Sprint (2wk), Standard (3mo), Evergreen (6mo), Marathon (12mo), Custom |
| Distribution slider UI | Front-loaded / balanced / back-loaded — live preview of post distribution |
| Per-platform cadence | Platform-specific volume multipliers, time windows, minimum spacing |
| Schedule preview | Visual timeline showing post slots per platform before generation |
| Brand switching | Swap Zernio API key per brand, filter campaigns/posts by brand |
| Additional campaign types | Exhibition, Artist Profile, Podcast Episode |

### Phase III: Rich Content + Collaboration

**Goal:** Image generation, carousel templates, pre-generation input workflow, team collaboration features.

| Task | Description |
|------|-------------|
| Orshot integration | Instagram carousel templates with artwork images |
| Image pipeline | Download, resize per platform, persist, upload to Zernio |
| Pre-generation input | Chatbot or questionnaire asking team members for editorial focus before AI generation |
| Deep artist research | Perplexity integration for artist context beyond the source URL |
| Campaign analytics | Track post performance via Zernio analytics API, feed back into frequency optimization |
| Event campaigns | Time-bounded campaigns that end on event date |
| Public art (Remote) | Location-based campaign type |
| Institutional (Arterial) | Mission-driven content campaigns |

### Phase IV: Optimization + Scale

**Goal:** Analytics-driven optimization, automated campaign triggers, Vercel deployment.

| Task | Description |
|------|-------------|
| Vercel deployment | Production deployment with env vars |
| Automated triggers | n8n webhook or cron that creates campaigns when new content is published |
| A/B content testing | Generate multiple variants, measure performance, learn |
| Cross-campaign awareness | Prevent scheduling conflicts across campaigns on the same platform |
| Best-time optimization | Use Zernio analytics best-time API to adjust posting windows |

---

## Campaign Types (Complete List)

| # | Type | Source | Phase |
|---|------|--------|-------|
| 1 | **Newsletter** | Curated.co URL (theintersect.art, newsletter.notrealart.com) | I |
| 2 | **Blog Post / Article** | Article URL | I |
| 3 | **Exhibition** | Gallery/museum URL | II |
| 4 | **Artist Profile** | Artist page or Q+Art interview URL | II |
| 5 | **Podcast Episode** | Podcast URL (NRA network, Artsville) | II |
| 6 | **Event** | Event page URL | III |
| 7 | **Public Art** | Location/project URL (Remote series) | III |
| 8 | **Video / Film** | Video URL (Arthouse series) | III |
| 9 | **Institutional** | Mission/impact content URL | III |
| 10 | **Custom** | Manual entry | I |

---

## Key API Keys (in .env.local)

| Variable | Service | Purpose |
|----------|---------|---------|
| `LATE_API_KEY` | Zernio | Social media scheduling (currently: The Intersect profile) |
| `AUTH_SECRET` | Auth.js | Session encryption |
| `AUTH_USERS` | Auth.js | Pre-configured user credentials |
| `FIRECRAWL_API_KEY` | Firecrawl | Web scraping and content extraction |
| `PERPLEXITY_API_KEY` | Perplexity | Deep research for artist/content enrichment |
| `OPENAI_API_KEY` | OpenAI | Post content generation (TBD) |
| `AIRTABLE_API_KEY` | Airtable | Campaign data storage (TBD) |
| `AIRTABLE_BASE_ID` | Airtable | Base identifier (TBD) |

---

## Background Knowledge

All reference documents are in `docs/background/`:

| Document | Contents |
|----------|----------|
| [brand-profiles.md](docs/background/brand-profiles.md) | Arterial, Not Real Art, Artsville USA — missions, content series, voices |
| [missinglettr-scheduling-reference.md](docs/background/missinglettr-scheduling-reference.md) | Tapering curve, slider UI, duration presets |
| [posting-slots-rules.md](docs/background/posting-slots-rules.md) | Per-platform time windows, spacing, volumes |
| [firecrawl-reference.md](docs/background/firecrawl-reference.md) | API endpoints, scraping patterns, gotchas |

---

## GitHub Issues

Design discussions happen in GitHub Issues:

- **#1** — Per-platform tapering schedule engine
- **#2** — Campaign creation and types
- **#3** — Approval queue and post review
- **#4** — Brand voice and editorial direction
- **#5** — Airtable schema and data architecture
- **#6** — Requirements gathering and user stories
- **#7** — Design inbox (unstructured ideas)
