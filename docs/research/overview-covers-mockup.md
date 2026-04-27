# Overview Cover Mockup — Project State (2026-04-27)

Snapshot of where the [#167](https://github.com/JuergenB/polywiz-app/issues/167)
"Overview variant" epic stands. Captures both shipped work and incomplete work
from a long iteration session that culminated in a manual-export workflow for
The Intersect's Issue 75 launch on 2026-04-28.

Branch: `feature/167-overview-covers-mockup` (uncommitted as of writing).

---

## What shipped (real, in production code path)

### 1. Brand logo manager

Per-brand logo uploads with four slots: square + rectangular × light/dark
backgrounds.

- **Airtable schema** — added two fields on Brands table (`tblK6tDXvx8Qt0CXh`)
  via Meta API: `Logo Rectangular Light` (`fldMAFj5kJHAmHCDg`),
  `Logo Rectangular Dark` (`fldn8lPwcwnEQZaVF`). Existing
  `Logo Transparent Light` / `Logo Transparent Dark` (square) preserved so
  the cover-slide card generator continues to work.
- **UI**: drag-and-drop component at
  [src/components/brands/logo-manager.tsx](../../src/components/brands/logo-manager.tsx) —
  2×2 grid, contrasting preview backgrounds, replace/remove controls, 5MB cap,
  PNG/SVG/JPG/WEBP allowlist, no new dependencies.
- **API**: [src/app/api/brands/[id]/logo/route.ts](../../src/app/api/brands/%5Bid%5D/logo/route.ts) —
  POST with `?slot=` and a multipart file body, DELETE to remove. Sharp
  optimization, deletes prior blob on replace.
- **Backfill**: ran [scripts/backfill-brand-logos.mjs](../../scripts/backfill-brand-logos.mjs)
  against `docs/brand-logos/`. Uploaded 10 logos to Vercel Blob:
  - The Intersect — all 4 slots
  - Artsville USA — all 4 slots
  - Not Real Art — 2 square slots only (no rect variants on disk)
  - Sugar Press Art / Arterial — empty (no source files)

**Inverted naming convention to know about**: legacy file names in
`docs/brand-logos/` use `*-light.png` to mean "logo art is light-colored".
The new Airtable field semantics use "Light" to mean "for use on light
backgrounds" (i.e., needs DARK logo art). Backfill mapping accounts for this;
file names are not authoritative.

Live at [/dashboard/settings/brands](http://localhost:3025/dashboard/settings/brands).

---

## What didn't ship (mockup only — not in the production generation path)

### 2. Overview cover mockup

A dev-only page at
[/dashboard/dev/overview-covers](http://localhost:3025/dashboard/dev/overview-covers)
that renders **three carousel slides** for The Intersect's newsletter Overview
post:

| Slide | Purpose |
|---|---|
| **Slide 1** — Cover | Full-bleed Lead Image, translucent masthead overlay, large semi-transparent "74" floating top-right, italic serif tagline + "READ IN BIO" CTA on a sampled-from-image bottom band |
| **Slide 2a** — Inner cover (square mark) | Square Intersect logo + "74" in same row band, 2×2 story grid, italic tagline at bottom |
| **Slide 2b** — Inner cover (rect logo) | Same as 2a with the rectangular wordmark instead, light/dark mode toggle |
| **Slide 3** — CTA | Full-bleed image, translucent masthead, gradient overlay at bottom with italic tagline + "READ ISSUE 74 — LINK IN BIO →" |

All four templates are React components in
[src/app/dashboard/dev/overview-covers/page.tsx](../../src/app/dashboard/dev/overview-covers/page.tsx).
Renders client-side with plain CSS — **not** wired to the campaign generation
pipeline, **not** a server-renderable PNG component.

### Editor primitives validated in the mockup

Worth keeping when this becomes a real production feature:

- **Drag-to-pan image** (PointerEvent + setPointerCapture, scale-corrected so
  1 mouse pixel = 1 canvas pixel)
- **Zoom slider** with `transform: scale` and `transform-origin` tied to the
  pan focal point so zoom acts on what's centered
- **Bottom-band color sampling**: client-side canvas `getImageData()` on the
  bottom 3% of the hero image, RGB averaged, luminance computed, dark/light
  text auto-flipped. Override + ±lightness slider + 0–300px linear-gradient
  fade into the image (so the band feels poured-in, not pasted-on)
- **Drag-positionable numeral**: separate from image pan; drag the "74"
  itself and the offset persists to localStorage
- **+/- step controls** for size, X, Y on the numeral (5px steps)
- **Light/dark toggle** for the rect-logo variant
- **Real Replicate Real-ESRGAN ×2 upscale** with spinner + status banner +
  source replacement + zoom reset. Endpoint at
  [src/app/api/dev/upscale-hero/route.ts](../../src/app/api/dev/upscale-hero/route.ts).
  Works against a Vercel-Blob-cached copy of the hero so Replicate has a
  public URL.

### Tuned numeral defaults (pixel-perfect alignment for The Intersect)

Settled after multiple rounds of cap-height-vs-em-box pain. Hardcoded as
defaults in the page; persisted in localStorage. **These will need to be
re-tuned per brand** because Noto Serif Bold cap height differs from other
fonts and from each brand's logo geometry.

```ts
// Slide 2a — square Intersect mark
{ fontSize: 265, dx: -29, dy: -48 }
// Slide 2b — rectangular Intersect wordmark
{ fontSize: 225, dx: -11, dy: -41 }
```

### Brand-color picker bug surface

The bottom-band color picker on Slide 1 currently overrides with whatever the
user picks via the native `<input type="color">`. It does NOT eyedropper from
the image (i.e., user can't click on the hero to grab a hue). Considered;
deferred.

---

## Issue 75 manual-export workflow (today's deliverable)

Because the full production pipeline isn't built, the immediate need for the
2026-04-28 launch is met by a manual workflow:

1. Open [/dashboard/dev/overview-covers](http://localhost:3025/dashboard/dev/overview-covers).
2. Tune position / zoom / band color / blur on each slide (state persists).
3. Click **↓ Download PNG (1080×1350)** under each slide. Triggers
   [src/app/api/dev/download-slide/route.ts](../../src/app/api/dev/download-slide/route.ts)
   which spins up Puppeteer, logs into the dev server, navigates to the page
   with `?render=A&{state}` (renders one slide at native size with no chrome),
   screenshots at 1080×1350, returns PNG as attachment. **No disk persistence**
   — file streams through to the browser's Downloads folder.
4. Open PolyWiz, create a campaign manually, create a quick-post, drag the
   downloaded PNGs into the media slots.

**Page is hardcoded for The Intersect Issue 75.** Hero from
`public/dev-assets/intersect-75-lead.jpg` (downloaded from
`the-intersect-curator/` Airtable record `recvI0qqQzhv2vqNT`). To use for a
different issue, edit the `HERO_IMAGE`, `ISSUE`, and `STORY_TITLES` constants
at the top of the page.

**Story images on Slides 2a/2b are still Issue 74 placeholders** — the Issue
75 Newsletter Entries don't have image attachments in the Curator base, so
the grid uses Issue 74's CloudFront URLs as visual filler. The cover (Slide
1) and CTA (Slide 3) use the correct Issue 75 hero.

---

## What I missed in scoping

**Multi-brand was not generalized in the mockup.** The brand logo manager IS
multi-brand and works for any brand. But the cover-mockup page hardcodes:

- Hero image URL (one local file)
- Logo URLs (The Intersect's, by Vercel Blob URL)
- Issue number / date / tagline / story titles (Issue 75)
- Brand background color `#f9f8f3` (sampled from the live newsletter HTML)
- Brand accent color `#c8472d` (guessed; not a real Intersect brand color)

Generalizing to multiple brands needs:

- A brand selector that reads logos from the brand's Airtable record
- Per-brand `Cover Template Preference` field (already specced in [#174](https://github.com/JuergenB/polywiz-app/issues/174))
- Per-brand `Brand Background Color` and `Brand Accent Color` fields
- An issue-source abstraction: not all newsletters are on Curated.co. Need
  adapters per source (Curated, Ghost, Mailchimp, Beehiiv, Substack, plain
  scraping). Sub-issue [#169](https://github.com/JuergenB/polywiz-app/issues/169)
  scoped this for Curated only

---

## Where to pick up if returning to this work

**Phase 1** of the epic (sub-issues #168–#173, newsletter-only scope) is the
right starting point. Realistic order:

1. **#168** — Add `Overview` value to the Generate dialog's variants picker;
   branch the generate route on it; add `Post Variant` field to Posts table
2. **Refactor the mockup templates** into server-renderable components.
   Two paths:
   - **Puppeteer-based** (current approach) — works for any CSS/SVG; slow per
     render (~5s with login), needs a render-only URL in the production
     dashboard. Already validated end-to-end via the download flow.
   - **Satori + Sharp** (preferred long-term) — fast, no browser dependency,
     fits the existing carousel-cover pattern in
     [src/lib/cover-slide-renderer.ts](../../src/lib/cover-slide-renderer.ts).
     Limitations: no `mix-blend-mode` (used on Slide 1 masthead overlay),
     no CSS `transform: scale` (used on the SVGNumeral attempt), simplified
     CSS subset. Slide 1's translucent masthead would need a different
     treatment (e.g., baked-in white text with a subtle text-shadow).
3. **#170** — Overview generation prompt for post copy
4. **#171** — `generateOverviewPosts()` that wires templates + data into per-platform carousels
5. **#172** — Pin Overview posts in campaign list with badge
6. **#169** — Curated `<time>` scrape for Publish Datetime on Campaigns
7. **#173** — Default `scheduledFor` to that publish datetime
8. **Cover editor in production** — port the drag/zoom/color/blur controls
   into the campaign post detail page so users tune per issue. The mockup
   primitives are mostly drop-in candidates (state shape: `ImagePos`,
   `NumeralPos`); for production, swap my custom drag for **react-easy-crop**
   (~5kb, MIT, mature) which gives drag/pinch-zoom/aspect-ratio crop with
   battle-tested UX
9. **#174** — Phase 2 designed cover template + Light/Dark brand preference

---

## Open issues / known bugs

- The `useBottomBandSample` hook samples client-side. If the hero image is
  cross-origin without CORS (some Airtable signed URLs), `getImageData()`
  taints the canvas and the sampling silently falls back to cream. Locally
  hosted images (`/dev-assets/`) work fine.
- The Replicate upscale endpoint hardcodes
  `public/dev-assets/intersect-74-lead.jpg` as the source — was wired
  before the Issue 75 hero swap. Update needed before the upscale button
  works for Issue 75 (or generalize the endpoint to take a source URL).
- The Puppeteer download endpoint launches a fresh browser + logs in per
  click. Slow (~10s). Acceptable for dev; for production the editor should
  render server-side in-process, not via headless browser.
- localStorage persistence is per-browser and per-user. If user A tunes
  values and user B opens the page, B sees defaults from the file, not A's
  tuning. Fine for dev; needs Airtable persistence for production.
- The cover-mockup page is `/dashboard/dev/overview-covers` — under auth
  and labeled clearly as dev. It has no `NODE_ENV` gate, so it ships in
  production. If we want to keep it as an internal tool, fine; if we don't
  want it in production, gate it.

---

## Files of interest

- [src/app/dashboard/dev/overview-covers/page.tsx](../../src/app/dashboard/dev/overview-covers/page.tsx) — the mockup
- [src/app/api/dev/download-slide/route.ts](../../src/app/api/dev/download-slide/route.ts) — Puppeteer PNG export
- [src/app/api/dev/upscale-hero/route.ts](../../src/app/api/dev/upscale-hero/route.ts) — Replicate Real-ESRGAN
- [src/components/brands/logo-manager.tsx](../../src/components/brands/logo-manager.tsx) — brand logo UI
- [src/app/api/brands/[id]/logo/route.ts](../../src/app/api/brands/%5Bid%5D/logo/route.ts) — logo upload endpoint
- [scripts/backfill-brand-logos.mjs](../../scripts/backfill-brand-logos.mjs) — one-shot logo seeder
- [scripts/screenshot-overview-covers.mjs](../../scripts/screenshot-overview-covers.mjs) — Puppeteer verification
- [public/dev-assets/intersect-74-lead.jpg](../../public/dev-assets/intersect-74-lead.jpg) — Issue 74 hero (legacy)
- [public/dev-assets/intersect-75-lead.jpg](../../public/dev-assets/intersect-75-lead.jpg) — Issue 75 hero (current)

---

## Honest project assessment

This session burned a lot of cycles iterating on visual minutiae (numeral
cap-height alignment, pixel positioning) that would have been better solved
by giving the user direct controls earlier. The flow that ultimately worked:
add `+/-` steppers and click-and-drag on the element, let the user tune,
read the values, bake them as defaults. Two iterations, not eight.

The brand logo manager and the editor primitives (drag/zoom/sample/blur) are
genuinely useful pieces and should survive into production. The cover
templates themselves are tuned for The Intersect specifically and need a
brand-aware refactor before they're useful for the other brands.

The biggest remaining unknown is **renderer choice** (Puppeteer vs Satori).
Puppeteer reuses the React mockup as-is but is slow and heavy. Satori is
clean but requires re-implementing the templates within its CSS subset
(which would lose `mix-blend-mode` and require some redesign of Slide 1).
That decision should be made before #171 is built.
