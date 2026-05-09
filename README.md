# PolyWiz — Social Media Campaign Scheduler

> **Live:** [app.polywiz.polymash.com](https://app.polywiz.polymash.com)

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
| Not Real Art | [newsletter.notrealart.com](https://newsletter.notrealart.com) | Active (Zernio profile connected) |
| Artsville USA | TBD | Active (Zernio profile connected) |
| Sugar Press Art | — | Active (Zernio profile connected) |
| Arterial | — | Inactive |

Each brand has its own connected social accounts, voice guidelines, Zernio profile, and campaign history. Users are mapped to specific brands via an Airtable Users table — each user only sees and can generate for their assigned brands. Platform settings (formatting rules, image sizes, posting best practices) are shared.

## Supported Platforms

Instagram, TikTok, YouTube, LinkedIn, Pinterest, X/Twitter, Facebook, Threads, Bluesky, Snapchat, Google Business, Reddit, Telegram

## Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| **I** | Create a campaign from a newsletter URL → draft posts → approve → schedule | Complete |
| **II** | Per-platform scheduling controls, distribution slider, multi-brand switching | In progress |
| **III** | Image formatting, carousel templates, cover slide designer, team input workflows | In progress |
| **IV** | Performance tracking, automated triggers, production deployment | Live in production |

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
- [x] **Phase I:** Per-brand Zernio key resolution + global brand switcher (#41)
- [x] **Phase I:** User-brand access mapping — Airtable Users table, session integration, scoped brands API (#42)
- [x] **Phase I:** Generation options show only connected platforms per brand (no more hardcoded list)
- [x] **Phase I:** All 4 active brands have Zernio profile IDs populated
- [x] **Phase I:** Event campaign type — date picker, back-loaded distribution, event details, generation pipeline (#46)
- [x] **Phase I:** Multiple source URLs per campaign — scrape and merge (#47)
- [x] **Phase I:** Generation options (platforms, variants) on campaign creation form (#48)
- [x] **Phase I:** Short.io link cleanup on campaign reset and delete
- [x] **Phase I:** Per-brand Short.io domain configuration (jb9.me / artsy.short.gy)
- [x] **Phase I:** og:image fallback — extract first content image when no og:image metadata
- [x] **Phase I:** Post content inline editing (click to edit, save/cancel)
- [x] **Phase I:** Multi-image carousel support (add/remove/reorder images per post)
- [x] **Phase I:** Post image swap (drag-drop, paste URL, file upload)
- [x] **Phase I:** Post approve/dismiss actions
- [x] **Phase I:** Push approved posts to Zernio scheduler
- [x] **Phase I:** Tapering schedule algorithm with configurable duration & distribution bias
- [x] **Phase I:** Batch scheduling with date collision avoidance
- [x] **Phase I:** Post status alignment with Zernio lifecycle (Queued → Scheduled → Published)
- [x] **Phase I:** Unified image catalog — Claude picks images by index, works across all CMS platforms
- [x] **Phase I:** Image-Text Integrity Rule — constraint hierarchy prevents hallucinated names/attribution
- [x] **Phase I:** Dimension-aware image dedup, thumbnail filtering (<200px rejected)
- [x] **Phase I:** Compact generation progress bar, tab auto-switch to Posts after generation
- [x] **Phase I:** Generation options persist to Airtable via Save Options button
- [x] **Phase I:** List-view Approve/Dismiss buttons functional
- [x] **Phase I:** New campaign redirects to detail page
- [x] **Phase I:** Ghost/CMS excludeTags for related posts sections (#58 partial)
- [x] **Phase I:** Event page section parsing from markdown
- [x] **Phase I:** Schedule preview heatmap visualization (#13)
- [x] **Phase I:** Client-side image compression with PNG→JPEG conversion (#64)
- [x] **Phase I:** Permanent image hosting via Vercel Blob (#62)
- [x] **Phase I:** Campaign hero image upload (file upload + paste URL) (#62)
- [x] **Phase I:** Carousel lightbox keyboard navigation + mobile swipe
- [x] **Phase I:** Single-post Publish Now button with double-publish guard
- [x] **Phase I:** Zernio webhook status sync (post.published/failed/partial → Airtable)
- [x] **Phase I:** LinkedIn PDF carousel — auto-assemble multi-image posts into PDF at publish time (#65)
- [x] **Phase I:** lnk.bio per-brand lifecycle sync — auto-create on Instagram schedule/publish, sync across delete/revert/reschedule/edit/failure (7 transitions); per-brand credentials and enable toggle
- [x] **Phase I:** Failed post handling — Retry (reset to Approved, clear Zernio state) and Delete (with blob/short.io cleanup) in list and detail views
- [x] **Phase I:** Zernio schedule sync — fetch current dates/statuses from Zernio and update Airtable to fix drift
- [x] **Phase I:** Server-side Sharp image optimization (PNG/WebP→JPEG, re-compress >500KB)
- [x] **Phase I:** Platform aspect ratio auto-crop (Instagram/Threads 1.91:1 max enforced)
- [x] **Phase II:** Brand switching at dashboard level (#41)
- [x] **Phase II:** Quick Post — single-post composer with first comment, collaborators, image tags
- [x] **Phase II:** Post detail UX — Unschedule control, popover schedule picker, broader cache invalidation
- [x] **Phase II:** Post reordering — drag-and-drop on approved posts, persisted Sort Order honored by scheduler
- [x] **Phase II:** Campaign archive + cleanup — hide from default views, optional cleanup of Pending/Dismissed posts cascading to Short.io, lnk.bio, and Zernio
- [x] **Phase II:** Dashboard "Needs Your Attention" panel — unified cross-campaign view of posts needing approval, images, scheduling, or that have failed
- [x] **Phase II:** Instagram collaboration invites (up to 3 collab usernames, co-publishes to both feeds) and image user tags
- [x] **Phase II:** Campaign image library — scraped images surfaced as clickable thumbnails when adding images to posts
- [x] **Phase II:** Image caption extraction — figcaption / wp-caption parsing flows through to post media captions
- [x] **Phase II:** Options expander state persists across campaigns (cookie-backed open/closed preference)
- [x] **Phase II:** Inline-rename campaign title on detail page (click h1, save to Airtable, Quick Post auto-rename respects user edits) (#221)
- [x] **Phase II:** Markdown sanitizer — prompt instruction + post-processing strips `_italic_` / `*bold*` to curly quotes at every Content write path; backfill script for Pending+Approved posts (#222, follow-up #224 for Scheduled+Zernio)
- [x] **Phase III:** Cover slide designer — band-based layout engine (Satori + Sharp), Airtable-driven templates, AI text generation, eyedropper color picker
- [x] **Phase III:** Card designer with URL-based tracking and slide exclusion
- [x] **Phase III:** Multi-image carousel handling matched to platform capability — LinkedIn PDF assembly; non-carousel platforms (Facebook, Pinterest, etc.) fall back to first image with honest UI messaging
- [ ] **Phase II:** Platform-aware campaign distribution (#18)
- [ ] **Phase II:** Per-platform cadence controls
- [ ] **Phase II:** Distribution slider (interactive, per-platform)

## Content Intelligence

The generation pipeline is designed to handle the real-world messiness of web content — different CMS platforms, varying image quality, inconsistent metadata, and embedded third-party exhibitions.

### Image-Content Matching

Rather than trying to match images to posts with regex or string heuristics (which failed at ~90%), the system gives Claude a **numbered image catalog** with descriptive labels and lets it pick the right image for each post. This works regardless of CMS platform because:

- **When alt text is present** (BigCommerce, Artwork Archive): the catalog uses the alt text directly — e.g., `Image 3: "Fracturist Fair Oaks (painting) by Augustine Kofie"`
- **When alt text is empty** (Ghost, WordPress): the catalog uses the section heading the image appears under — e.g., `Image 5: "Image from section: Katie Knorovsky"`
- **One code path** handles both cases. No CMS-specific logic.

### Image-Text Integrity Rule

The system enforces a constraint hierarchy: if Claude can confidently identify who created a specific work (their name appears alongside it in the scraped content), it can mention them by name. If it can't, it writes about the event or topic generically rather than guessing. Editorial direction from the user can guide tone and focus but cannot override this integrity rule.

### Multi-Source Enrichment

Campaigns can combine content from multiple URLs. A typical event campaign might include:
- **Primary URL**: The event blog post or landing page
- **Exhibition embed**: An Artwork Archive online exhibition with structured artwork data (artist, title, medium, high-res images)
- **Additional context**: An Eventbrite page, a partner's site, supplemental material

Images from supplemental sources are filtered by **entity overlap** — only images whose alt text matches entities from the primary page are merged in. This prevents sponsor headshots or venue stock photos from polluting the image pool, while allowing artwork images that appear on both the event page and an exhibition embed to enrich the campaign.

### What the AI Generates vs. What Humans Decide

The system generates drafts. Humans approve, edit, or dismiss every post before it goes live. The tools make it fast — functional Approve/Dismiss buttons on the list view, inline content editing, drag-and-drop image swap — but the team always has final say.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 16, React 19, TypeScript | App Router, server components, API routes |
| **Styling** | Tailwind CSS v4, shadcn/ui | Utility-first CSS, accessible component library |
| **State** | Zustand, TanStack Query | Client state management, server state caching |
| **Data** | Airtable (REST API) | Campaigns, posts, brands, platform settings, user access |
| **Auth** | Auth.js v5 | Credential-based login with role-based access |
| **AI Generation** | Anthropic Claude Sonnet 4.6 | Post content generation (per-brand API keys) |
| **Web Scraping** | Firecrawl | Campaign source URL extraction (newsletters, exhibitions, blogs) |
| **Social Scheduling** | Zernio API (`@getlatedev/node` SDK) | Publish to 14 platforms, webhook status sync |
| **Link Shortening** | Short.io | Per-brand shortened links with UTM tracking |
| **Image Storage** | Vercel Blob | Permanent public URLs for campaign and post images |
| **Image Optimization** | Sharp | Server-side PNG/WebP to JPEG conversion, re-compression |
| **Image AI** | Replicate (Flux models) | AI outpainting for aspect ratio correction |
| **PDF Generation** | pdf-lib | LinkedIn PDF carousel assembly from multi-image posts |
| **Cover Slide Rendering** | Satori + Sharp | Band-based layout engine for editorial carousel cover slides |
| **Drag and Drop** | @dnd-kit/core, @dnd-kit/sortable | Approved-post reordering on the campaign detail page |
| **Link-in-Bio** | lnk.bio (OAuth2) | Per-brand link-in-bio entries kept in sync with Instagram post lifecycle |
| **Deployment** | Vercel | Hosting, serverless functions, blob storage |

## Technical Details

For developers: see [GETTING_STARTED.md](GETTING_STARTED.md) for stack details, environment setup, API keys, and architecture.

## Related Work

This project builds on prior work with exhibition data pipelines, promo pack generation workflows, and scheduling research. The [Missinglettr](https://missinglettr.com/) drip campaign model was a key inspiration for the tapering schedule approach.

> **Foundation:** The scheduling UI is based on [LateWiz](https://github.com/zernio-dev/latewiz) (MIT licensed) by Zernio.

## License

MIT — see [LICENSE](./LICENSE) for details.
