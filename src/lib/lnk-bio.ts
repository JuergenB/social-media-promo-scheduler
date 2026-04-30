/**
 * lnk.bio API client — link-in-bio management for Instagram posts.
 *
 * Per-brand config pattern (same as Short.io / Anthropic):
 *   - Brand.lnkBioEnabled → feature flag
 *   - Brand.lnkBioGroupId → target group for this brand's posts
 *   - Brand.lnkBioClientIdLabel → env var name for OAuth client ID
 *   - Brand.lnkBioClientSecretLabel → env var name for base64-encoded secret
 *   - Falls back to LNKBIO_CLIENT_ID / LNKBIO_CLIENT_SECRET_B64 when labels absent
 *
 * API docs (unofficial — captured from live probing):
 *   POST /oauth/token                          — OAuth2 client_credentials
 *   POST /oauth/v1/lnk/add                     — create entry (form-encoded)
 *   POST /oauth/v1/lnk/edit                    — update entry (form-encoded, accepts group_id for moves)
 *   POST /oauth/v1/lnk/delete                  — delete by link_id
 *   GET  /oauth/v1/lnk/list[?group_id=X]       — list entries on authenticated profile
 *   GET  /oauth/v1/group/list                  — list groups on authenticated profile
 */

import { lnkBioThrottle } from "@/lib/api-throttle";

const API_BASE = "https://lnk.bio/oauth/v1";
const TOKEN_URL = "https://lnk.bio/oauth/token";

export interface LnkBioCredentials {
  clientId: string;
  clientSecret: string;
}

export interface LnkBioConfig extends LnkBioCredentials {
  /** Target group_id for new entries created by this brand. */
  groupId: string;
}

export interface BrandLnkBioFields {
  lnkBioEnabled?: boolean;
  lnkBioGroupId?: string | null;
  lnkBioClientIdLabel?: string | null;
  lnkBioClientSecretLabel?: string | null;
}

/**
 * Resolve credentials only (no group). Used by delete paths where we don't need a target group.
 * Returns null if the brand isn't configured for lnk.bio.
 */
export function resolveCredentials(brand: BrandLnkBioFields): LnkBioCredentials | null {
  if (!brand.lnkBioEnabled) return null;
  const clientId = brand.lnkBioClientIdLabel
    ? process.env[brand.lnkBioClientIdLabel] || process.env.LNKBIO_CLIENT_ID
    : process.env.LNKBIO_CLIENT_ID;
  const secretB64 = brand.lnkBioClientSecretLabel
    ? process.env[brand.lnkBioClientSecretLabel] || process.env.LNKBIO_CLIENT_SECRET_B64
    : process.env.LNKBIO_CLIENT_SECRET_B64;
  if (!clientId || !secretB64) return null;
  return { clientId, clientSecret: Buffer.from(secretB64, "base64").toString("utf-8") };
}

/**
 * Resolve full config (credentials + groupId). Used by create paths.
 * Returns null if the brand isn't fully configured.
 */
export function resolveConfig(brand: BrandLnkBioFields): LnkBioConfig | null {
  const creds = resolveCredentials(brand);
  if (!creds) return null;
  if (!brand.lnkBioGroupId) return null;
  return { ...creds, groupId: brand.lnkBioGroupId };
}

// ── Token cache (keyed by clientId so per-brand refreshes don't collide) ────
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

async function getAccessToken(creds: LnkBioCredentials): Promise<string> {
  const cached = tokenCache.get(creds.clientId);
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.accessToken;

  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  await lnkBioThrottle.wait();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`lnk.bio token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache.set(creds.clientId, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function lnkBioRequest(
  creds: LnkBioCredentials,
  path: string,
  method: "GET" | "POST",
  data?: Record<string, string>
): Promise<Record<string, unknown>> {
  const token = await getAccessToken(creds);
  const options: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  };
  if (data && method === "POST") {
    (options.headers as Record<string, string>)["Content-Type"] =
      "application/x-www-form-urlencoded";
    options.body = new URLSearchParams(data).toString();
  }
  await lnkBioThrottle.wait();
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`lnk.bio API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface CreateLnkBioEntryOptions {
  title: string;
  link: string;
  image?: string;
  scheduledDate?: string;
  /** IANA timezone for rendering schedule_from (e.g. "America/New_York"). */
  timezone?: string;
}

/**
 * Create a lnk.bio entry. Returns the entry ID (for later cleanup) or null on malformed response.
 */
export async function createLnkBioEntry(
  config: LnkBioConfig,
  options: CreateLnkBioEntryOptions
): Promise<string | null> {
  const params: Record<string, string> = {
    title: options.title,
    link: options.link,
    group_id: config.groupId,
  };
  if (options.image) params.image = options.image;
  if (options.scheduledDate) {
    // lnk.bio's UI displays schedule_from as the literal wall-clock value of
    // whatever we send — it does NOT convert to the viewer's timezone. So
    // sending UTC `Z` (the previous fix's approach) caused 8 AM ET to render
    // as "12 PM" on the dashboard. We have to send the wall time in the
    // brand's local timezone with explicit offset (DST-correct).
    const { formatInTimeZone } = await import("date-fns-tz");
    const tz = options.timezone || "America/New_York";
    const when = new Date(options.scheduledDate);
    params.schedule_from = formatInTimeZone(when, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
    // NOTE: we do NOT send a `position` param. Empirically, lnk.bio's
    // Current Posts grid sorts scheduled entries by creation time descending
    // (newest-created at top) and ignores the `position` value. Probe results
    // 2026-04-24. Display order of scheduled entries is therefore controlled
    // by creation sequence — individual creates land at top; bulk backfills
    // must iterate earliest-schedule-first so the furthest-future entry is
    // created last and ends up on top.
  }

  const result = await lnkBioRequest(config, "/lnk/add", "POST", params);
  console.log("[lnk-bio] Entry created:", JSON.stringify(result));

  const responseData = result.data as Record<string, unknown> | undefined;
  const entryId = responseData?.id || (result.info as Record<string, unknown>)?.lnk_id;
  return entryId ? String(entryId) : null;
}

/**
 * Delete a lnk.bio entry by ID. Silently succeeds if it doesn't exist.
 * Logs but does not throw — callers treat this as best-effort cleanup.
 */
export async function deleteLnkBioEntry(
  creds: LnkBioCredentials,
  entryId: string
): Promise<boolean> {
  if (!entryId) return false;
  try {
    await lnkBioRequest(creds, "/lnk/delete", "POST", { link_id: entryId });
    return true;
  } catch (err) {
    console.warn(`[lnk-bio] Failed to delete entry ${entryId}:`, err);
    return false;
  }
}

/**
 * List all groups for the authenticated profile.
 * Useful for admin tools / configuration UIs.
 */
export async function listGroups(creds: LnkBioCredentials): Promise<Record<string, unknown>> {
  return lnkBioRequest(creds, "/group/list", "GET");
}

/**
 * Build the public profile URL for a brand's lnk.bio page.
 * Returns null if no username configured.
 */
export function buildProfileUrl(username?: string | null): string | null {
  if (!username) return null;
  const clean = username.replace(/^@/, "").replace(/^https?:\/\/(www\.)?lnk\.bio\//i, "").replace(/\/$/, "");
  return clean ? `https://lnk.bio/${clean}` : null;
}
