# Firecrawl API Reference

Firecrawl is the core web scraping/extraction tool for this project. It handles JS rendering, anti-bot measures, and structured data extraction.

**API Docs:** https://docs.firecrawl.dev/introduction
**API Key:** Stored in `.env.local` as `FIRECRAWL_API_KEY`

## Key Endpoints

| Endpoint | Purpose | Credits |
|----------|---------|---------|
| `POST /v2/scrape` | Single URL → markdown, HTML, links, images, JSON (structured) | 1 (base), +4 for JSON mode |
| `POST /v2/crawl` | Recursive multi-page crawl (async) | 1 per page |
| `POST /v2/extract` | AI-powered structured extraction across multiple URLs | 2 per URL |
| `POST /v2/map` | Fast URL discovery without scraping content | 1 |

## Usage in This Project

### Campaign URL Scraping
When a user creates a campaign from a URL, Firecrawl extracts:
- **Markdown content** — article text, exhibition details, artist bios
- **Images** — all images on the page (for social media posts)
- **Links** — related pages (individual artwork pages, artist pages)
- **Structured data** — via JSON schema extraction for specific fields

### Recommended Scrape Call
```typescript
// Basic content extraction
const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: campaignUrl,
    formats: ["markdown", "links", "images"],
    waitFor: 3000, // REQUIRED — prevents 500 errors on many sites
  }),
});
```

### Structured Extraction (for exhibitions)
```typescript
// Extract structured exhibition data
const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.FIRECRAWL_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    url: exhibitionUrl,
    formats: ["json", "images"],
    jsonOptions: {
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          curator: { type: "string" },
          description: { type: "string" },
          dates: { type: "string" },
          artists: { type: "array", items: { type: "string" } },
          venue: { type: "string" },
        },
      },
      prompt: "Extract exhibition details including title, curator, description, dates, artist names, and venue.",
    },
    waitFor: 3000,
  }),
});
```

## Scrape Options

- **formats:** `markdown`, `html`, `links`, `images`, `screenshot`, `json`
- **waitFor:** Delay in ms before scraping (ALWAYS use 3000+)
- **onlyMainContent:** Default true — strips nav/footer
- **includeTags / excludeTags:** CSS selectors for content filtering
- **timeout:** Max duration (default 30s)

## Gotchas

1. **`waitFor: 3000` is REQUIRED** — without it, many sites return 500 errors
2. **`onlyMainContent: true` silently disables `excludeTags`** — use `onlyMainContent: false` with explicit `includeTags` if you need both
3. **Screenshot URLs expire after 24 hours**
4. **JSON mode costs +4 credits** (5 total per page)
5. **Images from Firecrawl are URLs** — they need to be downloaded and persisted for Zernio scheduling (Airtable attachment URLs are also temporary)

## When to Use Which Endpoint

| Need | Endpoint | Cost |
|------|----------|------|
| Single page content + images | `/v2/scrape` with `["markdown", "images"]` | 1 credit |
| Single page structured data | `/v2/scrape` with `["json"]` + schema | 5 credits |
| All links on a page | `/v2/scrape` with `["links"]` | 1 credit |
| Multiple pages structured | `/v2/extract` with schema + URL wildcards | 2/URL |
| Discover all site URLs | `/v2/map` | 1 credit |

## Image Handling Pipeline

1. Firecrawl scrape returns image URLs from the source page
2. Download images to persistent storage (NOT Airtable — attachment URLs expire)
3. Resize per platform specs (see `docs/background/posting-slots-rules.md` image size table)
4. Upload to Zernio via presigned URLs when scheduling posts
