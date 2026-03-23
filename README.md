# Social Media Promo Scheduler

Automated social media campaign generator and scheduler. Given a URL (newsletter issue, exhibition page, blog post, artist profile, podcast episode), the system generates a multi-platform promotional campaign with per-platform tapering frequency over a configurable timeline — then puts it through an approval queue before scheduling.

Built for [Arterial](https://arterial.org) and its family of brands: [Not Real Art](https://notrealart.com), [Artsville USA](https://artsvilleusa.com), and [The Intersect of Art and Tech](https://theintersect.art). Designed to be brand-agnostic so it can serve multiple organizations and content types from a single interface.

## The Problem

Exhibitions, newsletters, blog posts, and artist features currently get a single social media post and are forgotten. Effective promotion requires sustained, multi-platform campaigns that start strong and taper over time — but nobody has the bandwidth to manually create and schedule 30+ posts across 7 platforms for every piece of content.

## What This Does

1. **Input a URL** — Newsletter issue, exhibition page, blog post, artist profile, podcast episode, or any content worth promoting
2. **Scrape and enrich** — Firecrawl extracts text, images, and metadata. Perplexity researches additional context (artist bios, exhibition background). Classify the content type automatically.
3. **Editorial direction** — Before AI generation, the system can ask team members for input: "Which pieces were your favorites?" "What angle should we emphasize?" This human curation step shapes the campaign.
4. **Generate a campaign** — AI creates platform-specific post variants (IG carousels, X threads, LinkedIn posts, etc.) with appropriate tone, length, and media for each platform, guided by brand voice guidelines.
5. **Review and approve** — All generated posts land in an approval queue. Dismiss, modify, or approve each one before anything goes live.
6. **Schedule with tapering frequency** — Approved posts are distributed across a configurable timeline using per-platform cadence rules. A distribution slider controls the tapering curve (front-loaded → balanced → back-loaded).
7. **Publish via Zernio API** — Scheduled posts are sent to connected social media accounts across 14 supported platforms. Webhooks notify on success/failure.

## Campaign Types

| # | Type | Source | Example |
|---|------|--------|---------|
| 1 | **Newsletter** | Curated.co URL | theintersect.art, newsletter.notrealart.com |
| 2 | **Blog Post / Article** | Article URL | Newsletter issue, thought piece, announcement |
| 3 | **Exhibition** | Gallery/museum URL | First Fridays at Artwork Archive |
| 4 | **Artist Profile** | Artist page or interview URL | Q+Art interview series, featured artist spotlight |
| 5 | **Podcast Episode** | Podcast URL | Not Real Art podcast network, Artsville USA podcast |
| 6 | **Event** | Event page URL | Studio tours, exhibition openings, strolls |
| 7 | **Public Art** | Location/project URL | "Remote" series by Dear McCleary |
| 8 | **Video / Film** | Video URL | Arthouse TV series, documentary promos |
| 9 | **Institutional** | Mission/impact URL | Arterial grants, impact reports |
| 10 | **Custom** | Manual entry | Anything else |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Next.js App (this repo)                      │
│                                                                    │
│  ┌───────────┐  ┌───────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Campaign   │  │ Editorial │  │  Approval  │  │  Scheduling  │  │
│  │ Generator  │→ │ Direction │→ │  Queue     │→ │  Dashboard   │  │
│  │            │  │ (human)   │  │            │  │              │  │
│  └─────┬──┬──┘  └───────────┘  └────────────┘  └──────┬───────┘  │
│        │  │                                            │          │
│  ┌─────▼──┘─┐  ┌───────────┐                   ┌──────▼───────┐  │
│  │ Firecrawl │  │ Perplexity│                   │  Zernio API  │  │
│  │ (scrape)  │  │ (research)│                   │  (schedule)  │  │
│  └──────────┘  └───────────┘                   └──────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                            │
                      ┌─────▼─────┐
                      │  Airtable  │
                      │            │
                      │ Campaigns  │
                      │ Posts      │
                      │ Brands     │
                      │ Settings   │
                      └────────────┘
```

### Data Flow

1. **Campaign creation** — User provides a URL, selects a campaign type + brand, chooses a duration preset and distribution bias. Configuration stored in Airtable.
2. **Content extraction** — Firecrawl scrapes the URL for text, images, and structured data. Perplexity researches additional context (artist background, related coverage).
3. **Editorial direction** — Optional human input step: team members provide focus guidance ("highlight pieces 3 and 7", "emphasize the sustainable materials theme") before AI generation.
4. **Post generation** — AI generates platform-specific content variants using brand voice guidelines, platform best practices (character limits, URL handling, hashtag rules), and the editorial direction.
5. **Approval queue** — Generated posts stored in Airtable with status `pending`. Approval UI shows each post with platform, scheduled date, media preview. Actions: approve, edit, dismiss.
6. **Scheduling** — Approved posts pushed to Zernio API with per-platform scheduled timestamps. Media uploaded via presigned URLs.
7. **Publishing** — Zernio handles posting at scheduled times. Webhooks notify the app of success/failure.

### Tapering Schedule

Campaigns use a configurable frequency curve with **per-platform cadence**. Each platform gets its own posting density based on its character (Twitter is high-frequency, Instagram is quality-over-quantity, LinkedIn is weekdays-only).

**Example: 6-month exhibition campaign**

| Period | Twitter/X | Instagram | LinkedIn | Facebook |
|--------|-----------|-----------|----------|----------|
| Week 1 (launch) | 4-5/day | 1-2/day | 1/day | 2/day |
| Weeks 2-4 | 3-4/day | 1/day | 1/day | 1-2/day |
| Month 2 | 2-3/day | 3/week | 3/week | 1/day |
| Month 3 | 1-2/day | 2/week | 2/week | 3/week |
| Months 4-6 | 1/day | 1/week | 1/week | 2/week |

**Controls:**
- **Duration presets** — Sprint (2 weeks), Standard (3 months), Evergreen (6 months), Marathon (12 months), Custom
- **Distribution slider** — front-loaded ↔ balanced ↔ back-loaded
- **Per-platform overrides** — volume multipliers, time windows, minimum spacing
- **Schedule preview** — visual timeline of post distribution before any content is generated

Inspired by [Missinglettr](https://missinglettr.com/)'s drip campaign approach (exponential tapering curve: days 0, 3, 7, 14, 30, 90, 180, 270, 365).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Auth | Auth.js v5 (Credentials provider, pre-configured users) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| State | Zustand + TanStack Query |
| Social API | Zernio (14 platforms) |
| Data | Airtable |
| Scraping | Firecrawl |
| Research | Perplexity (artist/content enrichment) |
| AI | OpenAI (content generation) |
| Image Templates | Orshot (Instagram carousels) |
| Deployment | Vercel |

> **Foundation:** The scheduling UI is based on [LateWiz](https://github.com/zernio-dev/latewiz) (MIT licensed), an open-source social media scheduler by Zernio. Campaign generation, approval workflows, Airtable integration, the tapering schedule engine, and multi-brand support are original additions.

## Supported Platforms

Instagram, TikTok, YouTube, LinkedIn, Pinterest, X/Twitter, Facebook, Threads, Bluesky, Snapchat, Google Business, Reddit, Telegram

## Multi-Brand Support

The system serves multiple brands from a **single shared Airtable base** with brand-level separation. Each brand has its own Zernio API key (scoped to its profile). Switching brands in the UI swaps the active key and filters campaigns/posts.

| Brand | Newsletter | Zernio Profile | Status |
|-------|-----------|---------------|--------|
| The Intersect of Art and Tech | [theintersect.art](https://theintersect.art) | The Intersect High Frequency (7 accounts) | Active |
| Not Real Art | [newsletter.notrealart.com](https://newsletter.notrealart.com) | TBD | Planned |
| Artsville USA | TBD | TBD | Planned |
| Arterial | N/A | TBD | Planned |

**Why shared Airtable?** Platform settings (character limits, image sizes, posting rules) are universal. Team members work across brands. Campaign analytics benefit from cross-brand comparison.

**What's brand-specific?** Zernio API key, brand voice guidelines, campaign history, editorial direction defaults.

## Airtable Schema (Planned)

| Table | Purpose |
|-------|---------|
| **Campaigns** | Campaign definition: URL, type, brand, frequency settings, editorial direction, status |
| **Posts** | Generated posts: content, platform, media refs, scheduled date, approval status |
| **Brands** | Brand profiles: name, voice guidelines, Zernio profile ID, API key reference |
| **Platform Settings** | Per-platform config: character limits, URL handling, tone, best practices, image sizes |
| **Media Assets** | Downloaded images/videos with permanent URLs for scheduling |

## Getting Started

See [GETTING_STARTED.md](GETTING_STARTED.md) for the full development guide including phased plan, credentials, and architecture details.

### Quick Start

```bash
git clone https://github.com/JuergenB/social-media-promo-scheduler.git
cd social-media-promo-scheduler
npm install
cp .env.example .env.local
# Edit .env.local with your API keys
npm run dev
# Open http://localhost:3025 → login with your credentials
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LATE_API_KEY` | Yes | Zernio API key (`sk_` prefix) |
| `AUTH_SECRET` | Yes | Auth.js session encryption secret |
| `AUTH_USERS` | Yes | Pre-configured users (`id:email:password:name:role`, comma-separated) |
| `FIRECRAWL_API_KEY` | Yes* | Firecrawl API key for web scraping |
| `PERPLEXITY_API_KEY` | Yes* | Perplexity API key for deep research |
| `OPENAI_API_KEY` | Yes* | OpenAI API key for content generation |
| `AIRTABLE_API_KEY` | Yes* | Airtable Personal Access Token |
| `AIRTABLE_BASE_ID` | Yes* | Airtable base ID |

*Required for campaign features (not needed for basic scheduling UI).

## Development Phases

| Phase | Focus | Key Deliverable |
|-------|-------|-----------------|
| **I** | Foundation MVP | Create a campaign from a newsletter URL → generate posts → approve → schedule |
| **II** | Scheduling Engine | Per-platform tapering, distribution slider, presets, multi-brand switching |
| **III** | Rich Content | Orshot carousels, image pipeline, pre-generation input, deep research |
| **IV** | Optimization | Analytics feedback, automated triggers, Vercel deployment |

Phase I starts with **The Intersect newsletter** (theintersect.art) as the first campaign type.

See [GETTING_STARTED.md](GETTING_STARTED.md) for full phase breakdown.

## Project Status

- [x] Scheduling UI (LateWiz foundation)
- [x] Zernio API integration (14 platforms)
- [x] Auth.js v5 with pre-configured team credentials
- [x] Background knowledge: brand profiles, scheduling algorithms, platform rules, Firecrawl reference
- [x] Design issues and phased development plan
- [ ] **Phase I:** Airtable base setup
- [ ] **Phase I:** Campaign creation UI (Newsletter + Blog Post types)
- [ ] **Phase I:** Firecrawl URL scraping integration
- [ ] **Phase I:** AI post generation (OpenAI)
- [ ] **Phase I:** Approval queue UI
- [ ] **Phase I:** Basic scheduling (push to Zernio)
- [ ] **Phase II:** Tapering schedule engine with per-platform cadence
- [ ] **Phase II:** Distribution slider and preset UI
- [ ] **Phase II:** Multi-brand support (API key switching)
- [ ] **Phase III:** Image pipeline and Orshot carousel generation
- [ ] **Phase III:** Pre-generation editorial input workflow
- [ ] **Phase IV:** Analytics and optimization

## Related Work

This project builds on prior work:
- **n8n workflows** for exhibition data extraction and promo pack generation (proof of concept for the scraping → AI enrichment → content generation pipeline)
- **Artwork Archive** rolling submissions system (Airtable patterns, Auth.js, export pipeline)
- **Missinglettr** drip campaign scheduling (tapering curve inspiration)
- **Existing Airtable bases** with social media best practices, image sizes, and posting slot rules

## License

MIT — see [LICENSE](./LICENSE) for details.
