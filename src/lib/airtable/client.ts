// Airtable REST API client for server-side use

import type { UserProfile, UserRole } from "./types";

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

async function airtableFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_PAT}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      `Airtable API error: ${res.status} ${JSON.stringify(error)}`
    );
  }

  return res.json();
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
    fields: ["Email", "Display Name", "Role", "Brands", "Default Brand"],
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
  };
}
