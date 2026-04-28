import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";

// Dev-only: fetch a single Intersect newsletter issue + its linked Newsletter
// Entries from the-intersect-curator's Airtable base. Cross-references each
// entry's Source URL against the Discovered Articles table to recover the
// scraped Image URL. Intersect-specific by design.

export const maxDuration = 30;

function loadCuratorEnv() {
  // Production (Vercel): explicit env vars set via `vercel env add`.
  if (
    process.env.CURATOR_AIRTABLE_API_KEY &&
    process.env.CURATOR_AIRTABLE_BASE_ID
  ) {
    return {
      apiKey: process.env.CURATOR_AIRTABLE_API_KEY,
      baseId: process.env.CURATOR_AIRTABLE_BASE_ID,
    };
  }
  // Local dev fallback: read from the sibling repo's .env.local so the dev
  // tool keeps working without duplicating the credential into polywiz-app's
  // own .env.local.
  try {
    const envPath = path.join(
      process.env.HOME ?? "",
      "Projects/the-intersect-curator/.env.local",
    );
    const content = readFileSync(envPath, "utf8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      if (!line || line.trimStart().startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      env[k] = v;
    }
    return {
      apiKey: env.AIRTABLE_API_KEY,
      baseId: env.AIRTABLE_BASE_ID,
    };
  } catch {
    return null;
  }
}

const ISSUES_TBL = "tbl3zFoA32H9c3E9P";
const ENTRIES_TBL = "tblZOEh8XSZJBAmsB";
const ARTICLES_TBL = "tblDKbsxewpNlNsQD";

async function airtableFetch(
  baseId: string,
  apiKey: string,
  table: string,
  query: string,
) {
  const resp = await fetch(
    `https://api.airtable.com/v0/${baseId}/${table}?${query}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    },
  );
  if (!resp.ok) {
    throw new Error(`Airtable ${table} ${resp.status}: ${await resp.text()}`);
  }
  return (await resp.json()) as { records: { id: string; fields: Record<string, unknown> }[] };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params;
  const issueNumber = Number(number);
  if (!Number.isFinite(issueNumber)) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
  }

  const env = loadCuratorEnv();
  if (!env?.apiKey || !env?.baseId) {
    return NextResponse.json(
      { error: "Curator base credentials not found" },
      { status: 500 },
    );
  }

  try {
    // 1. Fetch the issue by Issue Number
    const issuesData = await airtableFetch(
      env.baseId,
      env.apiKey,
      ISSUES_TBL,
      `filterByFormula=${encodeURIComponent(`{Issue Number}=${issueNumber}`)}&maxRecords=1`,
    );
    if (!issuesData.records.length) {
      return NextResponse.json(
        { error: `Issue ${issueNumber} not found` },
        { status: 404 },
      );
    }
    const issueRec = issuesData.records[0];
    const issueFields = issueRec.fields as {
      "Issue Name"?: string;
      "Issue Number"?: number;
      "Publication Date"?: string;
      Summary?: string;
      theme?: string;
      "Lead Image"?: { url: string }[];
      "Newsletter Entries"?: string[];
      "Discovered Articles"?: string[];
      planning_notes?: string;
    };

    // 2. Two possible sources for stories:
    //    a) Newsletter Entries (curated, promoted) — older / further-along issues
    //    b) planning_notes.articleIds — Curator's source of truth for which
    //       Discovered Articles are selected for THIS issue. Status will be
    //       "picked" but the issue's reverse-link to Discovered Articles is
    //       fuzzy and includes rejected candidates too, so we read the JSON
    //       blob directly instead of filtering.
    //    Try (a) first; fall back to (b) if empty.
    const entryIds = issueFields["Newsletter Entries"] ?? [];
    let plannedArticleIds: string[] = [];
    try {
      if (issueFields.planning_notes) {
        const parsed = JSON.parse(issueFields.planning_notes) as {
          articleIds?: string[];
        };
        plannedArticleIds = parsed.articleIds ?? [];
      }
    } catch {
      // planning_notes wasn't valid JSON — leave empty
    }
    let entries: {
      id: string;
      title: string;
      sourceUrl: string;
      contentSummary?: string;
      imageUrl: string | null;
    }[] = [];

    if (entryIds.length > 0) {
      // Path (a): Newsletter Entries → cross-reference Discovered Articles for image
      const entryFormula = `OR(${entryIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
      const entriesData = await airtableFetch(
        env.baseId,
        env.apiKey,
        ENTRIES_TBL,
        `filterByFormula=${encodeURIComponent(entryFormula)}`,
      );
      entries = entriesData.records.map((r) => ({
        id: r.id,
        title: (r.fields["Title"] as string) ?? "",
        sourceUrl: (r.fields["Source URL"] as string) ?? "",
        contentSummary: r.fields["Content/Summary"] as string | undefined,
        imageUrl: null,
      }));

      const urlsToLookup = entries
        .map((e) => e.sourceUrl)
        .filter((u): u is string => !!u);
      if (urlsToLookup.length > 0) {
        const articleFormula = `OR(${urlsToLookup
          .map((u) => `{URL}='${u.replace(/'/g, "\\'")}'`)
          .join(",")})`;
        const articlesData = await airtableFetch(
          env.baseId,
          env.apiKey,
          ARTICLES_TBL,
          `filterByFormula=${encodeURIComponent(articleFormula)}&maxRecords=50`,
        );
        const urlToImage = new Map<string, string>();
        for (const a of articlesData.records) {
          const u = a.fields["URL"] as string | undefined;
          const img =
            (a.fields["Image URL"] as string | undefined) ||
            (a.fields["Blob Image URL"] as string | undefined);
          if (u && img) urlToImage.set(u, img);
        }
        for (const e of entries) {
          if (e.sourceUrl && urlToImage.has(e.sourceUrl)) {
            e.imageUrl = urlToImage.get(e.sourceUrl) ?? null;
          }
        }
      }
    } else if (plannedArticleIds.length > 0) {
      // Path (b): no Newsletter Entries yet — read the curator's selection
      // directly from planning_notes.articleIds and fetch those articles.
      const articleFormula = `OR(${plannedArticleIds
        .map((id: string) => `RECORD_ID()='${id}'`)
        .join(",")})`;
      const articlesData = await airtableFetch(
        env.baseId,
        env.apiKey,
        ARTICLES_TBL,
        `filterByFormula=${encodeURIComponent(articleFormula)}&maxRecords=20`,
      );
      // Preserve the order from articleIds, since Airtable's response order
      // doesn't match.
      const byId = new Map(articlesData.records.map((r) => [r.id, r]));
      entries = plannedArticleIds
        .map((id: string) => byId.get(id))
        .filter((r): r is (typeof articlesData.records)[number] => !!r)
        .map((r) => ({
          id: r.id,
          title: (r.fields["Title"] as string) ?? "",
          sourceUrl: (r.fields["URL"] as string) ?? "",
          contentSummary: r.fields["Summary"] as string | undefined,
          imageUrl:
            (r.fields["Image URL"] as string) ||
            (r.fields["Blob Image URL"] as string) ||
            null,
        }));
    }

    return NextResponse.json({
      issue: {
        id: issueRec.id,
        number: issueFields["Issue Number"],
        name: issueFields["Issue Name"],
        publicationDate: issueFields["Publication Date"],
        summary: issueFields["Summary"],
        theme: issueFields["theme"],
        leadImageUrl: issueFields["Lead Image"]?.[0]?.url ?? null,
      },
      entries,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Curator fetch failed: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
