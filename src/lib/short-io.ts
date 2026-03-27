/**
 * Short.io API client — link shortening with click tracking
 *
 * Supports per-brand configuration: each brand can have its own Short.io
 * domain and API key (domain-restricted). Falls back to global env vars.
 *
 * Brand config pattern (same as Zernio):
 *   - Brand.shortDomain → "jb9.me"
 *   - Brand.shortApiKeyLabel → "SHORT_IO_KEY_INTERSECT" → resolves to env var value
 *   - Falls back to SHORT_IO_DOMAIN and SHORT_IO_API_KEY env vars
 *
 * API docs: https://developers.short.io/reference
 */

const API_BASE = "https://api.short.io/links";

/** Brand-level Short.io config. Pass from Brand record when available. */
export interface ShortIoConfig {
  apiKey: string;
  domain: string;
}

/**
 * Resolve Short.io config for a brand.
 * Uses brand-specific domain/key if available, falls back to global env vars.
 */
export function resolveConfig(brand?: {
  shortDomain?: string | null;
  shortApiKeyLabel?: string | null;
}): ShortIoConfig {
  // Brand-specific API key: look up the env var named by the label
  const apiKey = brand?.shortApiKeyLabel
    ? process.env[brand.shortApiKeyLabel] || process.env.SHORT_IO_API_KEY
    : process.env.SHORT_IO_API_KEY;

  // Brand-specific domain, or fallback
  const domain = brand?.shortDomain || process.env.SHORT_IO_DOMAIN;

  if (!apiKey) throw new Error("Short.io API key not configured (set SHORT_IO_API_KEY or brand-specific key)");
  if (!domain) throw new Error("Short.io domain not configured (set SHORT_IO_DOMAIN or brand shortDomain)");

  return { apiKey, domain };
}

async function shortIoFetch<T>(
  config: ShortIoConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Short.io API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Types ──────────────────────────────────────────────────────────────

export interface ShortLink {
  id: string;
  originalURL: string;
  shortURL: string;
  secureShortURL: string;
  path: string;
  title?: string;
  tags?: string[];
  createdAt: string;
  clicksCount?: number;
}

export interface CreateShortLinkOptions {
  /** The full URL to shorten */
  originalURL: string;
  /** Brand config (optional — falls back to env vars) */
  brand?: { shortDomain?: string | null; shortApiKeyLabel?: string | null };
  /** Optional custom slug (e.g., "spring-2026-show") */
  path?: string;
  /** Link title for dashboard organization */
  title?: string;
  /** Tags for filtering/grouping (brand name auto-added) */
  tags?: string[];
  /** UTM parameters — appended to the original URL before shortening */
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
  };
}

// ── Core API ───────────────────────────────────────────────────────────

/**
 * Create a shortened link.
 * Optionally appends UTM parameters to the original URL for tracking.
 */
export async function createShortLink(
  options: CreateShortLinkOptions
): Promise<ShortLink> {
  const config = resolveConfig(options.brand);

  // Append UTM params if provided
  let url = options.originalURL;
  if (options.utm) {
    const urlObj = new URL(url);
    if (options.utm.source) urlObj.searchParams.set("utm_source", options.utm.source);
    if (options.utm.medium) urlObj.searchParams.set("utm_medium", options.utm.medium);
    if (options.utm.campaign) urlObj.searchParams.set("utm_campaign", options.utm.campaign);
    if (options.utm.content) urlObj.searchParams.set("utm_content", options.utm.content);
    url = urlObj.toString();
  }

  return shortIoFetch<ShortLink>(config, "", {
    method: "POST",
    body: JSON.stringify({
      domain: config.domain,
      originalURL: url,
      path: options.path,
      title: options.title,
      tags: options.tags,
    }),
  });
}

/**
 * Create a short link with platform-specific UTM tracking.
 * Convenience wrapper used during post generation.
 *
 * @param originalURL - The content URL being promoted
 * @param platform - Social media platform name (used as utm_source)
 * @param campaignSlug - Campaign identifier (used as utm_campaign)
 * @param brand - Brand record for per-brand domain/key resolution
 */
export async function createPlatformShortLink(
  originalURL: string,
  platform: string,
  campaignSlug: string,
  brand?: { name?: string; shortDomain?: string | null; shortApiKeyLabel?: string | null },
  title?: string
): Promise<ShortLink> {
  const tags = [campaignSlug, platform];
  if (brand?.name) tags.unshift(brand.name);

  return createShortLink({
    originalURL,
    brand,
    title: title || `${campaignSlug} — ${platform}`,
    tags,
    utm: {
      source: platform,
      medium: "social",
      campaign: campaignSlug,
    },
  });
}

/**
 * Search for existing short links by original URL.
 * Useful to avoid creating duplicates.
 */
export async function findShortLinks(
  originalURL: string,
  brand?: { shortDomain?: string | null; shortApiKeyLabel?: string | null }
): Promise<ShortLink[]> {
  const config = resolveConfig(brand);
  const data = await shortIoFetch<{ links: ShortLink[] }>(
    config,
    `/api/links?domain=${encodeURIComponent(config.domain)}&originalURL=${encodeURIComponent(originalURL)}`,
    { method: "GET" }
  );
  return data.links || [];
}

/**
 * Delete a short link by its short URL (e.g., "https://jb9.me/blhmNN").
 * Expands the URL to get the link ID, then deletes it.
 * Silently succeeds if the link doesn't exist or is already deleted.
 */
export async function deleteShortLink(
  shortUrl: string,
  brand?: { shortDomain?: string | null; shortApiKeyLabel?: string | null }
): Promise<boolean> {
  if (!shortUrl) return false;

  try {
    const config = resolveConfig(brand);

    // Parse domain and path from the short URL
    const urlObj = new URL(shortUrl);
    const domain = urlObj.hostname;
    const path = urlObj.pathname.replace(/^\//, "");

    if (!path) return false;

    // Expand to get the link ID
    const expandRes = await fetch(
      `https://api.short.io/links/expand?domain=${encodeURIComponent(domain)}&path=${encodeURIComponent(path)}`,
      {
        headers: {
          Authorization: config.apiKey,
          Accept: "application/json",
        },
      }
    );

    if (!expandRes.ok) return false;

    const linkData = await expandRes.json();
    const linkId = linkData?.id;
    if (!linkId) return false;

    // Delete the link
    const deleteRes = await fetch(`${API_BASE}/${linkId}`, {
      method: "DELETE",
      headers: {
        Authorization: config.apiKey,
        Accept: "application/json",
      },
    });

    return deleteRes.ok;
  } catch (err) {
    console.warn(`[short-io] Failed to delete short link ${shortUrl}:`, err);
    return false;
  }
}

/**
 * Delete multiple short links. Logs failures but doesn't throw.
 * Returns the count of successfully deleted links.
 */
export async function deleteShortLinks(
  shortUrls: string[],
  brand?: { shortDomain?: string | null; shortApiKeyLabel?: string | null }
): Promise<number> {
  let deleted = 0;
  for (const url of shortUrls) {
    if (await deleteShortLink(url, brand)) deleted++;
  }
  return deleted;
}

/**
 * Get click analytics for a short link.
 */
export async function getLinkClicks(
  linkId: string,
  period: "day" | "week" | "month" | "total" = "total",
  brand?: { shortDomain?: string | null; shortApiKeyLabel?: string | null }
): Promise<{ clicks: number }> {
  const config = resolveConfig(brand);
  return shortIoFetch<{ clicks: number }>(
    config,
    `/link/${linkId}/clicks?period=${period}`,
    { method: "GET" }
  );
}
