/**
 * Probe `prepareLinkedInPdfMetadata` against representative campaign/post data.
 * Prints the AI-generated documentTitle and the matching filename so we can
 * eyeball that the output is human-readable and within the 55-char budget.
 *
 * Usage:  node scripts/probe-linkedin-document-title.mjs
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const envFile = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// We import via tsx so TS source resolves. Fallback: dynamic require of compiled.
const { prepareLinkedInPdfMetadata } = await import("../src/lib/pdf-carousel.ts").catch(
  async () => await import("../src/lib/pdf-carousel.js")
);

const cases = [
  {
    label: "The Intersect — wrenches/AI-art issue",
    campaignDescription:
      "An issue exploring how AI image generation is reshaping artistic labor: wrenches, paper, and waste — examining what stays organic when machines can produce any image in seconds.",
    editorialDirection:
      "Be skeptical of hype. Highlight the artists who refuse to be replaced. Conversational, occasionally biting.",
    postContent:
      "AI can generate any image in seconds. So why are artists still showing up to studios with paint-stained hands?",
  },
  {
    label: "Newsletter — long boilerplate name",
    campaignDescription:
      "How a curator's role is changing in a year of museum cuts. Profiles five practitioners adapting to shrinking budgets without abandoning rigor.",
    editorialDirection: "Empathetic but grounded. Real numbers, real names.",
    postContent:
      "Museum budgets are being slashed. Five curators on what they're letting go of — and what they refuse to.",
  },
  {
    label: "Empty fallback (no description, no AI)",
    campaignDescription: "",
    editorialDirection: "",
    postContent: "",
  },
];

for (const c of cases) {
  process.stdout.write(`\n--- ${c.label} ---\n`);
  const t0 = Date.now();
  const meta = await prepareLinkedInPdfMetadata({
    campaignDescription: c.campaignDescription,
    editorialDirection: c.editorialDirection,
    postContent: c.postContent,
    brand: null,
  });
  const ms = Date.now() - t0;
  process.stdout.write(`  documentTitle: "${meta.documentTitle}" (${meta.documentTitle.length} chars, ${ms}ms)\n`);
  process.stdout.write(`  filename:      "${meta.filename}" (${meta.filename.length} chars)\n`);
}
