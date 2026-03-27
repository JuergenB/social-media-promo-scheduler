# Carousel Generation Feasibility Report

> Research conducted March 2026. Documents the evaluation of approaches for generating carousel posts (multi-slide Instagram/Facebook posts) with artwork images and branded text overlays.

## The Short Answer: Not a fool's errand — but AI image generation is the wrong tool.

## Key Findings

### 1. Diffusion Models (Replicate/Flux) — Not Suitable
- No diffusion model can guarantee pixel-perfect preservation of placed images. The denoising process inherently modifies everything in the image, even with inpainting masks.
- Text rendering remains unreliable — even best-in-class models (Ideogram 3.0) fail ~10% of the time with garbled/hallucinated text.
- Verdict: Great for generating abstract backgrounds in isolation, but **cannot be trusted** for compositing artwork or rendering text.

### 2. Orshot — The Recommended Path (~$30/mo)
- Template-based, not AI-generated — artwork stays pixel-perfect, text is crisp and reliable.
- Supports multi-slide carousel generation in a single API call.
- Templates can be imported from Canva/Figma, then parameterized for dynamic data (artwork image URL, artist name, exhibition title, dates, brand colors).
- Has an **n8n community node**, which fits the existing automation stack.
- Already accessible.

### 3. Blotato — Limited Automation
- Primarily a manual design tool with AI assistance, not a headless API-first service.
- Good for one-off design but not suitable for automated pipeline integration.

### 4. Self-Hosted Fallback: Satori + Sharp
- Satori (by Vercel) converts JSX templates to SVG; Sharp composites images.
- Could run as a Next.js API route on the existing Vercel deployment at zero cost.
- More dev effort but full control over templates and no vendor dependency.

## Carousel Engagement Data
- Carousels generate **55–109% more engagement** than single-image posts.
- Significantly higher save rates — Instagram's algorithm rewards saves heavily.
- Sweet spot: **3–5 slides** for promotional content.

## Zernio Already Supports Carousels
- The existing Zernio API accepts multiple `media_id`s in a single post creation call — up to 10 items for Instagram carousels.
- No SDK changes needed; you upload media items individually, then pass the array.

## Recommended Architecture

| Component | Tool | Role |
|-----------|------|------|
| Background/template design | Orshot (or Satori+Sharp) | Render branded slides with artwork placed precisely |
| Text overlays | Orshot templates (or SVG) | Crisp, font-correct text — never AI-generated |
| Original artwork | Placed as-is (cropped/masked, never regenerated) | Pixel-perfect preservation |
| Carousel scheduling | Zernio API | Already supported, no new integration needed |

## Workflow Integration
1. **Carousel as a distinct post format** — not an enhancement to regular posts. The campaign generation step would flag "this campaign type benefits from carousel" and generate slide content alongside copy.
2. **Generate 2–3 variations automatically** using different template layouts.
3. **One-click approval** — present variations in the campaign detail view, user picks one or regenerates.
4. **Then schedule via Zernio** using the existing post scheduling pipeline.

## Post Type Distinction
- **Instagram:** Regular post (1 image) vs. Carousel post (2–10 images) — should be a field on the Post record, e.g., `postFormat: "single" | "carousel"`.
- **Facebook:** Same distinction applies. Both use the same Zernio endpoint.
- **Stories:** Same template engine could generate story-sized (9:16) images later — same pipeline, different dimensions.

## Bottom Line
Orshot is the fastest path to production-quality carousels. The Satori+Sharp approach is the zero-cost fallback with more dev effort. Either way, **template-based composition** (not AI generation) is the right approach for preserving artwork integrity and ensuring reliable text.

## Related Issues
- #36 — Template-based carousel generation via Orshot integration
- #37 — Post form factor selection: regular post, carousel, story per campaign per platform
- #33 — Epic: Per-Platform Image Transformation & Generation Pipeline
