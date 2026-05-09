#!/usr/bin/env node
/**
 * Backfill markdown sanitization for existing post Content.
 *
 * Strips italic/bold markdown (`_x_`, `*x*`, `__x__`, `**x**`) and replaces
 * with curly quotes (“ ”) — see issue #222.
 *
 * Scope (locked):
 *   - Statuses: Pending, Approved (default; --status overridable within these two)
 *   - Field: Content only
 *   - Scheduled is deferred to #224 (requires Zernio updatePost coordination)
 *   - Published / Failed are terminal — never touched
 *
 * Usage:
 *   node scripts/sanitize-post-markdown.mjs [options]
 *
 * Options:
 *   --status <list>     Comma-separated status filter (default: "Pending,Approved")
 *                       Allowed values: Pending, Approved
 *                       Scheduled/Published/Failed are explicitly rejected for safety;
 *                       see issue #224 for the Scheduled-posts plan.
 *   --dry-run           Print what would change but do not PATCH Airtable.
 *   --limit <n>         Stop after processing n posts (useful for testing).
 *   --post-id <id>      Process only one post by record ID (for spot-checking).
 *   --help              Show this help.
 *
 * Requires: AIRTABLE_API_KEY in .env.local
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Sanitizer ───────────────────────────────────────────────────────────
// Markdown italic/bold → curly quotes.
// CANONICAL SOURCE: src/lib/text-sanitizer.ts (lands in PR for issue #222).
// This script duplicates the regex deliberately to avoid TS↔mjs interop;
// if you change one, change both.
function stripMarkdownFormatting(text) {
  if (!text) return text;
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "“$1”")
    .replace(/(?<!\w)__([^_\n]+)__(?!\w)/g, "“$1”")
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "“$1”")
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "“$1”");
}

// ── Self-check fixtures ─────────────────────────────────────────────────
function runSelfCheck() {
  const cases = [
    {
      input: "Wesley Goatley's _The Harbinger_ is about",
      expected: "Wesley Goatley's “The Harbinger” is about",
    },
    { input: "**bold** thing", expected: "“bold” thing" },
    { input: "my_variable_name", expected: "my_variable_name" },
    { input: "#some_tag", expected: "#some_tag" },
    { input: "*emphasized*", expected: "“emphasized”" },
    { input: "__strong__", expected: "“strong”" },
    { input: "", expected: "" },
  ];
  let failed = 0;
  for (const { input, expected } of cases) {
    const actual = stripMarkdownFormatting(input);
    if (actual !== expected) {
      console.error(
        `Self-check FAILED:\n  input:    ${JSON.stringify(input)}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
      );
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} self-check fixture(s) failed. Aborting before any Airtable I/O.`);
    process.exit(1);
  }
}

// ── Args ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { status: "Pending,Approved", dryRun: false, limit: null, postId: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--status") args.status = argv[++i];
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--post-id") args.postId = argv[++i];
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

const HELP_TEXT = `Usage:
  node scripts/sanitize-post-markdown.mjs [options]

Options:
  --status <list>     Comma-separated status filter (default: "Pending,Approved")
                      Allowed values: Pending, Approved
                      Scheduled/Published/Failed are explicitly rejected for safety;
                      see issue #224 for the Scheduled-posts plan.
  --dry-run           Print what would change but do not PATCH Airtable.
  --limit <n>         Stop after processing n posts (useful for testing).
  --post-id <id>      Process only one post by record ID (for spot-checking).
  --help              Show this help.

Examples:
  node scripts/sanitize-post-markdown.mjs --dry-run
  node scripts/sanitize-post-markdown.mjs --dry-run --limit 3
  node scripts/sanitize-post-markdown.mjs --post-id reccoOS13ot0rppmQ
  node scripts/sanitize-post-markdown.mjs
`;

const ALLOWED_STATUSES = new Set(["Pending", "Approved"]);
const REJECTED_STATUSES = new Set(["Scheduled", "Published", "Failed"]);

function validateStatuses(statusArg) {
  const list = statusArg
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) {
    console.error("--status must include at least one value (Pending, Approved).");
    process.exit(1);
  }
  for (const s of list) {
    if (REJECTED_STATUSES.has(s)) {
      console.error(
        `Status "${s}" is not allowed for this script.\n` +
          `  - Scheduled posts must be coordinated with Zernio updatePost — tracked in issue #224.\n` +
          `  - Published and Failed are terminal and will not be modified.\n` +
          `Allowed values: Pending, Approved.`,
      );
      process.exit(1);
    }
    if (!ALLOWED_STATUSES.has(s)) {
      console.error(`Unknown status "${s}". Allowed values: Pending, Approved.`);
      process.exit(1);
    }
  }
  return list;
}

// ── Env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  let envText;
  try {
    envText = readFileSync(envPath, "utf-8");
  } catch (err) {
    console.error(`Could not read .env.local at ${envPath}: ${err.message}`);
    process.exit(1);
  }
  for (const line of envText.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2];
      // Strip surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

// ── Airtable ────────────────────────────────────────────────────────────
const BASE_ID = "app5FPCG06huzh7hX";
const POSTS_TABLE_ID = "tblyUEPOJXxpQDZNL";

function airtableUrl(path) {
  return `https://api.airtable.com/v0/${BASE_ID}${path}`;
}

async function airtableGet(path, token) {
  const res = await fetch(airtableUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Airtable GET ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function airtablePatch(recordId, fields, token) {
  const res = await fetch(airtableUrl(`/${POSTS_TABLE_ID}/${recordId}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`Airtable PATCH /${POSTS_TABLE_ID}/${recordId}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function buildFilterFormula(statuses) {
  if (statuses.length === 1) return `Status='${statuses[0]}'`;
  const clauses = statuses.map((s) => `Status='${s}'`).join(",");
  return `OR(${clauses})`;
}

async function* iteratePosts({ statuses, postId, token }) {
  if (postId) {
    const data = await airtableGet(`/${POSTS_TABLE_ID}/${postId}`, token);
    yield data;
    return;
  }
  let offset;
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    params.set("filterByFormula", buildFilterFormula(statuses));
    params.append("fields[]", "Content");
    params.append("fields[]", "Status");
    if (offset) params.set("offset", offset);
    const data = await airtableGet(`/${POSTS_TABLE_ID}?${params.toString()}`, token);
    for (const record of data.records ?? []) {
      yield record;
    }
    offset = data.offset;
  } while (offset);
}

// ── Utility ─────────────────────────────────────────────────────────────
function truncate(s, n = 200) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  // Validate status arg (rejects Scheduled/Published/Failed)
  const statuses = validateStatuses(args.status);

  // Self-check fixtures BEFORE any I/O
  runSelfCheck();

  loadEnv();
  const token = process.env.AIRTABLE_API_KEY;
  if (!token) {
    console.error("AIRTABLE_API_KEY missing from .env.local");
    process.exit(1);
  }

  if (args.dryRun) {
    console.log("DRY RUN — no Airtable writes will be made.\n");
  }
  console.log(`Status filter: ${statuses.join(", ")}`);
  if (args.postId) console.log(`Single post: ${args.postId}`);
  if (args.limit) console.log(`Limit: ${args.limit}`);
  console.log("");

  let processed = 0;
  let changed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    for await (const record of iteratePosts({ statuses, postId: args.postId, token })) {
      if (args.limit && processed >= args.limit) break;
      processed++;

      const status = record.fields?.Status;
      // Defense-in-depth: if a single-post lookup returned a record outside
      // the allowed statuses, refuse to touch it.
      if (args.postId && status && REJECTED_STATUSES.has(status)) {
        console.error(
          `Refusing to process record ${record.id} with Status="${status}". ` +
            `Scheduled is deferred to issue #224; Published/Failed are terminal.`,
        );
        errors++;
        continue;
      }
      if (args.postId && status && !ALLOWED_STATUSES.has(status)) {
        console.error(
          `Skipping record ${record.id} with Status="${status}" (not in allowed set Pending/Approved).`,
        );
        skipped++;
        continue;
      }

      const before = record.fields?.Content ?? "";
      const after = stripMarkdownFormatting(before);

      if (before === after) {
        skipped++;
        continue;
      }

      console.log(
        JSON.stringify(
          {
            recordId: record.id,
            status: status ?? null,
            before: truncate(before),
            after: truncate(after),
          },
          null,
          2,
        ),
      );

      if (args.dryRun) {
        changed++;
        continue;
      }

      try {
        await airtablePatch(record.id, { Content: after }, token);
        changed++;
        // Pace at ~5 req/sec to stay under Airtable's 5/sec/base rate limit.
        await sleep(200);
      } catch (err) {
        console.error(`PATCH failed for ${record.id}: ${err.message}`);
        errors++;
      }
    }
  } catch (err) {
    console.error(`Fatal: ${err.message}`);
    errors++;
  }

  console.log("\n--- Summary ---");
  console.log(`processed: ${processed}`);
  console.log(`changed:   ${changed}`);
  console.log(`skipped:   ${skipped}`);
  console.log(`errors:    ${errors}`);

  process.exit(errors > 0 ? 1 : 0);
}

main();
