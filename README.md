# PolyWiz — Social Media Campaign Scheduler

> **Live:** [social-media-promo-scheduler.vercel.app](https://social-media-promo-scheduler.vercel.app)

A campaign planning tool that helps arts organizations give their artists, exhibitions, and content the sustained social media presence they deserve — across multiple platforms, over weeks and months, not just a single post on opening night.

Built by [Polymash](https://polymash.com) for [Arterial](https://arterial.org) and its family of brands: [Not Real Art](https://notrealart.com), [Artsville USA](https://artsvilleusa.com), [The Intersect](https://theintersect.art), and [Sugar Press Art](https://sugarpressart.com).

## Why This Exists

Promoting artists takes sustained effort. A First Fridays exhibition, a Q+Art interview, a newsletter issue — each deserves more than a single post. But creating and scheduling dozens of platform-specific posts over six months, while respecting each platform's character and cadence, is more than anyone can realistically keep up with manually.

This tool handles the repetitive scheduling and formatting work so the team can focus on what matters: **choosing what to promote, setting the tone, and deciding what resonates.**

## How It Works

1. **Start with a URL** — Drop in a link to a newsletter issue, exhibition page, artist profile, podcast episode, or anything worth promoting
2. **Set the direction** — Choose the brand, the tone, the angle. What should we emphasize? Which pieces stood out? What's the story we're telling? The team drives this.
3. **Review everything** — The system drafts platform-specific posts (Instagram, X, LinkedIn, Facebook, etc.) with appropriate formatting and media. Every post lands in an **approval queue** where you can edit, approve, or dismiss each one. Nothing goes live without a human green light.
4. **Schedule with a natural cadence** — Approved posts are spread across a timeline you control. Heavy promotion in the first week, tapering off gradually over months. Each platform gets its own rhythm — more frequent on X, more selective on Instagram, weekdays-only on LinkedIn.
5. **Publish and track** — Scheduled posts go out through the [Zernio](https://zernio.com) API across 14 platforms. You can see what's coming up in the calendar view and adjust anytime.

## What You Can Promote

| Type | Example |
|------|---------|
| **Newsletter** | New issue of [theintersect.art](https://theintersect.art) or [newsletter.notrealart.com](https://newsletter.notrealart.com) |
| **Exhibition** | First Fridays at Artwork Archive |
| **Artist Profile** | Q+Art interview, featured artist spotlight |
| **Blog Post** | Thought piece, announcement, recap |
| **Podcast Episode** | Not Real Art network, Artsville USA podcast |
| **Event** | Studio tours, exhibition openings, strolls |
| **Public Art** | "Remote" series by Dear McCleary |
| **Video / Film** | Arthouse series, documentary features |
| **Institutional** | Arterial grants, impact reports, mission stories |
| **Custom** | Anything else — manual entry |

## The Approval Queue

This is the heart of the workflow. Every generated post is a **draft suggestion** — not a final decision. The queue lets you:

- **Preview** each post as it would appear on each platform
- **Edit** the text, swap images, adjust hashtags
- **Approve** posts you're happy with
- **Dismiss** anything that doesn't fit
- **Bulk approve** when a batch looks good

The system suggests. The team decides.

## Scheduling Controls

Campaigns don't have to be one-size-fits-all. You control:

- **Duration** — Sprint (2 weeks for an event), Standard (3 months), Evergreen (6 months), Marathon (12 months)
- **Intensity** — How many posts total, distributed across the timeline
- **Distribution** — Front-loaded (heavy early, tapering off), balanced, or back-loaded
- **Per-platform rhythm** — Each platform gets cadence appropriate to how it works:

| Platform | Typical Rhythm | Why |
|----------|---------------|-----|
| X / Twitter | Multiple daily | Fast-moving feed, posts have short visibility |
| Instagram | A few per week | Quality over quantity, visual storytelling |
| LinkedIn | Weekdays only | Professional context, business hours |
| Facebook | 1-2 per day | Steady presence without overwhelming |
| Threads, Bluesky | Moderate daily | Conversational, community-driven |
| Pinterest | Several per week | Visual discovery, evergreen content |

Presets give you a starting point. Everything is adjustable.

## Brand Voice & Editorial Direction

Each brand has its own voice:
- **Not Real Art** — artist advocacy, community-building, accessible art language
- **Artsville USA** — craft-focused, Asheville community, warm and conversational
- **Arterial** — mission-driven, democratizing art access, institutional voice
- **The Intersect** — practitioner perspective, art meets technology, thoughtful

Each campaign can also have its own **editorial direction** — free text guidance like:
- "Focus on the sustainable materials and environmental themes"
- "Highlight Morgan's favorite pieces from this Q+Art episode"
- "Emphasize the opening night event and RSVP link"

This direction shapes every post that gets generated. The team's perspective comes first.

## Multi-Brand Support

One tool, multiple brands. Switch between them to manage campaigns for each:

| Brand | Newsletter | Status |
|-------|-----------|--------|
| The Intersect of Art and Tech | [theintersect.art](https://theintersect.art) | Active (7 social accounts) |
| Not Real Art | [newsletter.notrealart.com](https://newsletter.notrealart.com) | Planned |
| Artsville USA | TBD | Planned |
| Arterial | — | Planned |

Each brand has its own connected social accounts, voice guidelines, and campaign history. Platform settings (formatting rules, image sizes, posting best practices) are shared.

## Supported Platforms

Instagram, TikTok, YouTube, LinkedIn, Pinterest, X/Twitter, Facebook, Threads, Bluesky, Snapchat, Google Business, Reddit, Telegram

## Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| **I** | Create a campaign from a newsletter URL → draft posts → approve → schedule | Starting |
| **II** | Per-platform scheduling controls, distribution slider, multi-brand switching | Planned |
| **III** | Image formatting, carousel templates, team input workflows, deep research | Planned |
| **IV** | Performance tracking, automated triggers, production deployment | Planned |

Phase I starts with **The Intersect newsletter** as the first campaign type.

See [GETTING_STARTED.md](GETTING_STARTED.md) for the full development guide.

## Project Status

- [x] Scheduling dashboard (calendar, compose, queue, accounts)
- [x] 14-platform publishing via Zernio API
- [x] Team login with role-based access
- [x] Background research: brand profiles, platform rules, scheduling patterns
- [x] **Phase I:** Airtable schema (Brands, Campaigns, Posts, Platform Settings, Image Sizes)
- [x] **Phase I:** Brand context provider with 4 brands + voice guidelines
- [x] **Phase I:** Campaign creation UI (brand selector, URL, type, duration, distribution, editorial direction)
- [x] **Phase I:** Frequency preview with tapering curve visualization
- [x] **Phase I:** Brand settings page with inline editing
- [x] **Phase I:** Platform settings browser (13 platforms)
- [x] **Phase I:** og:image scraping on campaign creation (Firecrawl)
- [x] **Phase I:** Calendar day view sheet with post timeline, day navigation, platform filter
- [x] **Phase I:** Post detail dialog with platform header, retry for failed posts, expandable text, clickable URLs
- [x] **Phase I:** PDF/document media handling (LinkedIn carousels)
- [x] **Phase I:** Dashboard overview stats with configurable time range (today/7d/30d/90d)
- [x] **Phase I:** Week-starts-on-Monday calendar setting
- [x] **Phase I:** Rebrand to PolyWiz with Polymash Blue (#0399FE)
- [x] **Phase I:** Campaign detail page with editable settings, post review, delete (#17, #26)
- [x] **Phase I:** Blog post generation pipeline — Firecrawl scrape, Claude Sonnet 4.6, Short.io links, per-platform progress (#30)
- [x] **Phase I:** Newsletter generation — Curated.co story anchor extraction, per-story short links (#31)
- [x] **Phase I:** Campaign type selector with descriptions, context-aware URL/editorial prompts
- [x] **Phase I:** Campaign delete with linked post cleanup
- [x] **Phase I:** Short.io link shortener with per-brand domain/key support
- [x] **Phase I:** Sugar Press Art brand onboarded with voice guidelines
- [x] **Phase I:** Blog post semantic sectioning — H2/H3 section parsing, image-to-artist binding (#38)
- [x] **Phase I:** Generation options — platform selector, variant limit (test mode)
- [x] **Phase I:** Post detail: image lightbox, "Open source article" link
- [x] **Phase I:** Campaign reset to Draft (delete posts, revert status)
- [x] **Phase I:** Dynamic campaign type rules — Airtable-backed editorial rules, dynamic prompt composition, settings UI, feedback dialog (#39)
- [ ] **Phase I:** Post approve/dismiss actions
- [ ] **Phase I:** Push approved posts to Zernio scheduler
- [ ] **Phase I:** Push approved posts to Zernio scheduler
- [ ] **Phase II:** Platform-aware campaign distribution (#18)
- [ ] **Phase II:** Per-platform cadence controls
- [ ] **Phase II:** Distribution slider (interactive, per-platform)
- [ ] **Phase II:** Brand switching at dashboard level

## Technical Details

For developers: see [GETTING_STARTED.md](GETTING_STARTED.md) for stack details, environment setup, API keys, and architecture.

## Related Work

This project builds on prior work with exhibition data pipelines, promo pack generation workflows, and scheduling research. The [Missinglettr](https://missinglettr.com/) drip campaign model was a key inspiration for the tapering schedule approach.

> **Foundation:** The scheduling UI is based on [LateWiz](https://github.com/zernio-dev/latewiz) (MIT licensed) by Zernio.

## License

MIT — see [LICENSE](./LICENSE) for details.
