// Airtable REST API client for server-side use

import type { UserProfile, UserRole } from "./types";
import { airtableThrottle } from "@/lib/api-throttle";

const AIRTABLE_PAT = process.env.AIRTABLE_API_KEY!;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!;
const AIRTABLE_API_URL = "https://api.airtable.com/v0";

interface AirtableRecord<T = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: T;
}

interface AirtableListResponse<T = Record<string, unknown>> {
  records: AirtableRecord<T>[];
  offset?: string;
}

/**
 * Airtable's per-base rate limit is 5 req/sec. Bursting past it returns
 * a 429 with `Retry-After` (seconds). We retry up to 3 times with
 * exponential backoff, honoring the header when present. This protects
 * batch routes (redistribute, schedule, etc.) from cascading failures
 * when many records are touched in one user action.
 */
const AIRTABLE_MAX_RETRIES = 3;
const AIRTABLE_BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function airtableFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}${path}`;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= AIRTABLE_MAX_RETRIES; attempt++) {
    // Hard rate-limit gate: never call Airtable faster than 4.5 req/sec.
    await airtableThrottle.wait();
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (res.ok) return res.json();

    if (res.status === 429 && attempt < AIRTABLE_MAX_RETRIES) {
      // Honor Retry-After if present (seconds), else exponential backoff.
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : AIRTABLE_BASE_BACKOFF_MS * 2 ** attempt;
      console.warn(`[airtable] 429 on ${path}; retry in ${waitMs}ms (attempt ${attempt + 1}/${AIRTABLE_MAX_RETRIES})`);
      await sleep(waitMs);
      continue;
    }

    // Non-429 error or out of retries — fail.
    const error = await res.json().catch(() => ({ error: res.statusText }));
    lastError = new Error(
      `Airtable API error: ${res.status} ${JSON.stringify(error)}`,
    );
    break;
  }

  throw lastError ?? new Error("Airtable request failed after retries");
}

export async function listRecords<T = Record<string, unknown>>(
  tableName: string,
  options?: { fields?: string[]; filterByFormula?: string; sort?: Array<{ field: string; direction?: "asc" | "desc" }> }
): Promise<AirtableRecord<T>[]> {
  const params = new URLSearchParams();
  if (options?.fields) {
    options.fields.forEach((f) => params.append("fields[]", f));
  }
  if (options?.filterByFormula) {
    params.set("filterByFormula", options.filterByFormula);
  }
  if (options?.sort) {
    options.sort.forEach((s, i) => {
      params.set(`sort[${i}][field]`, s.field);
      if (s.direction) params.set(`sort[${i}][direction]`, s.direction);
    });
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const allRecords: AirtableRecord<T>[] = [];
  let offset: string | undefined;

  do {
    const pageQuery = offset
      ? `${query}${query ? "&" : "?"}offset=${offset}`
      : query;
    const data = await airtableFetch<AirtableListResponse<T>>(
      `/${encodeURIComponent(tableName)}${pageQuery}`
    );
    allRecords.push(...data.records);
    offset = data.offset;
  } while (offset);

  return allRecords;
}

export async function createRecord<T = Record<string, unknown>>(
  tableName: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord<T>> {
  const data = await airtableFetch<{ records: AirtableRecord<T>[] }>(
    `/${encodeURIComponent(tableName)}`,
    {
      method: "POST",
      body: JSON.stringify({ records: [{ fields }] }),
    }
  );
  return data.records[0];
}

export async function deleteRecord(
  tableName: string,
  recordId: string
): Promise<{ deleted: boolean; id: string }> {
  return airtableFetch<{ deleted: boolean; id: string }>(
    `/${encodeURIComponent(tableName)}/${recordId}`,
    { method: "DELETE" }
  );
}

export async function updateRecord<T = Record<string, unknown>>(
  tableName: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<AirtableRecord<T>> {
  return airtableFetch<AirtableRecord<T>>(
    `/${encodeURIComponent(tableName)}/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    }
  );
}

export async function getRecord<T = Record<string, unknown>>(
  tableName: string,
  recordId: string
): Promise<AirtableRecord<T>> {
  return airtableFetch<AirtableRecord<T>>(
    `/${encodeURIComponent(tableName)}/${recordId}`
  );
}

// ── User Profile Lookup ─────────────────────────────────────────────────────

interface UserFields {
  Email: string;
  "Display Name": string;
  Role: UserRole;
  Brands: string[];
  "Default Brand": string[];
  "Password Hash": string;
  "Password Reset Token": string;
  "Token Expires": string;
}

/**
 * Fetch a user profile by email from the Users table.
 * Returns null if no matching user found.
 * Used during JWT creation to populate brand access in the session.
 */
export async function fetchUserByEmail(
  email: string
): Promise<UserProfile | null> {
  const records = await listRecords<UserFields>("Users", {
    filterByFormula: `{Email} = "${email}"`,
    fields: ["Email", "Display Name", "Role", "Brands", "Default Brand", "Password Hash"],
  });

  if (records.length === 0) return null;

  const r = records[0];
  return {
    id: r.id,
    email: r.fields.Email || "",
    displayName: r.fields["Display Name"] || "",
    role: r.fields.Role || "viewer",
    brandIds: r.fields.Brands || [],
    defaultBrandId: r.fields["Default Brand"]?.[0] || null,
    passwordHash: r.fields["Password Hash"] || null,
  };
}

/**
 * Store a password reset token for a user.
 * Token expires in 1 hour.
 */
export async function storeResetToken(
  email: string,
  token: string
): Promise<boolean> {
  const records = await listRecords<UserFields>("Users", {
    filterByFormula: `{Email} = "${email}"`,
    fields: ["Email"],
  });

  if (records.length === 0) return false;

  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await updateRecord("Users", records[0].id, {
    "Password Reset Token": token,
    "Token Expires": expires,
  });
  return true;
}

/**
 * Validate a reset token and return the user record ID if valid.
 */
export async function validateResetToken(
  token: string
): Promise<{ recordId: string; email: string } | null> {
  const records = await listRecords<UserFields>("Users", {
    filterByFormula: `{Password Reset Token} = "${token}"`,
    fields: ["Email", "Password Reset Token", "Token Expires"],
  });

  if (records.length === 0) return null;

  const r = records[0];
  const expires = r.fields["Token Expires"];
  if (!expires || new Date(expires) < new Date()) return null;

  return { recordId: r.id, email: r.fields.Email };
}

/**
 * Update a user's password hash and clear the reset token.
 */
export async function updatePasswordHash(
  recordId: string,
  passwordHash: string
): Promise<void> {
  await updateRecord("Users", recordId, {
    "Password Hash": passwordHash,
    "Password Reset Token": "",
    "Token Expires": "",
  });
}

/**
 * List all users (for admin user management).
 */
export async function listUsers(): Promise<
  Array<{ id: string; email: string; displayName: string; role: UserRole; brandIds: string[] }>
> {
  const records = await listRecords<UserFields>("Users", {
    fields: ["Email", "Display Name", "Role", "Brands"],
    sort: [{ field: "Display Name", direction: "asc" }],
  });

  return records.map((r) => ({
    id: r.id,
    email: r.fields.Email || "",
    displayName: r.fields["Display Name"] || "",
    role: r.fields.Role || "viewer",
    brandIds: r.fields.Brands || [],
  }));
}
