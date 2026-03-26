#!/usr/bin/env node
/**
 * Phase 1: Create and seed Airtable tables for dynamic campaign type rules.
 *
 * Creates 3 new tables:
 *   - Campaign Type Rules (replaces hardcoded CAMPAIGN_TYPE_DESCRIPTIONS etc.)
 *   - Generation Rules (editorial rules per type, extracted from blog-post-generator.ts)
 *   - Feedback Log (structured feedback linked to posts/campaigns)
 *
 * Also adds a "Feedback" linked record field to the existing Posts table.
 *
 * Run: node scripts/seed-campaign-type-rules.js
 */

const BASE_ID = "app5FPCG06huzh7hX";
const PAT =
  "patO7RElDWYl9bwLo.e5c0dfeb7767ac6e862c588bb02d3a948cae51c8aa35b7de0c6a2a1cd359f3c1";

const META_URL = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
const DATA_URL = `https://api.airtable.com/v0/${BASE_ID}`;

const POSTS_TABLE_ID = "tblyUEPOJXxpQDZNL";
const CAMPAIGNS_TABLE_ID = "tbl4S3vdDR4JgBT1d";

// ── Helpers ──────────────────────────────────────────────────────────────

async function apiCall(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${PAT}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("API error:", res.status, JSON.stringify(data, null, 2));
    throw new Error(`API ${res.status}: ${data.error?.message || res.statusText}`);
  }
  return data;
}

async function createTable(name, fields, description) {
  console.log(`\nCreating table: ${name}...`);
  const result = await apiCall(META_URL, {
    method: "POST",
    body: JSON.stringify({ name, fields, description }),
  });
  console.log(`  Created: ${result.id}`);
  return result;
}

async function createRecords(tableName, records) {
  const batches = [];
  for (let i = 0; i < records.length; i += 10) {
    batches.push(records.slice(i, i + 10));
  }
  let created = 0;
  for (const batch of batches) {
    const data = await apiCall(
      `${DATA_URL}/${encodeURIComponent(tableName)}`,
      {
        method: "POST",
        body: JSON.stringify({
          records: batch.map((fields) => ({ fields })),
        }),
      }
    );
    created += data.records.length;
  }
  console.log(`  ${tableName}: ${created} records seeded`);
  return created;
}

async function addFieldToTable(tableId, field) {
  console.log(`\nAdding field "${field.name}" to table ${tableId}...`);
  const result = await apiCall(
    `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${tableId}/fields`,
    {
      method: "POST",
      body: JSON.stringify(field),
    }
  );
  console.log(`  Field created: ${result.id}`);
  return result;
}

// ── Table Schemas ────────────────────────────────────────────────────────

function getCampaignTypeRulesFields() {
  return [
    { name: "Name", type: "singleLineText" },
    { name: "Slug", type: "singleLineText" },
    {
      name: "Description",
      type: "multilineText",
    },
    {
      name: "Icon",
      type: "singleSelect",
      options: {
        choices: [
          { name: "Mail" },
          { name: "FileText" },
          { name: "Frame" },
          { name: "User" },
          { name: "Mic" },
          { name: "CalendarDays" },
          { name: "Landmark" },
          { name: "Film" },
          { name: "Building2" },
          { name: "Sparkles" },
        ],
      },
    },
    {
      name: "Status",
      type: "singleSelect",
      options: {
        choices: [
          { name: "Active", color: "greenBright" },
          { name: "Coming Soon", color: "yellowBright" },
          { name: "Disabled", color: "grayBright" },
        ],
      },
    },
    {
      name: "Scraper Strategy",
      type: "singleSelect",
      options: {
        choices: [
          { name: "blog-post" },
          { name: "newsletter" },
          { name: "html-structured" },
          { name: "api-fetch" },
          { name: "manual" },
        ],
      },
    },
    {
      name: "Scraper Config",
      type: "multilineText",
    },
    {
      name: "Content Structure",
      type: "multilineText",
    },
    {
      name: "URL Placeholder",
      type: "singleLineText",
    },
    {
      name: "Sort Order",
      type: "number",
      options: { precision: 0 },
    },
  ];
}

function getGenerationRulesFields(campaignTypeRulesTableId) {
  return [
    { name: "Name", type: "singleLineText" },
    {
      name: "Campaign Type",
      type: "multipleRecordLinks",
      options: {
        linkedTableId: campaignTypeRulesTableId,
      },
    },
    {
      name: "Category",
      type: "singleSelect",
      options: {
        choices: [
          { name: "Content Pairing", color: "blueBright" },
          { name: "Tone & Voice", color: "purpleBright" },
          { name: "Image Handling", color: "tealBright" },
          { name: "Link Handling", color: "cyanBright" },
          { name: "Structure", color: "orangeBright" },
          { name: "Avoidance", color: "redBright" },
          { name: "Platform-Specific", color: "pinkBright" },
        ],
      },
    },
    {
      name: "Rule Text",
      type: "multilineText",
    },
    {
      name: "Prompt Fragment",
      type: "multilineText",
    },
    {
      name: "Priority",
      type: "singleSelect",
      options: {
        choices: [
          { name: "Critical", color: "redBright" },
          { name: "Important", color: "yellowBright" },
          { name: "Nice-to-have", color: "grayBright" },
        ],
      },
    },
    {
      name: "Active",
      type: "checkbox",
      options: { icon: "check", color: "greenBright" },
    },
    {
      name: "Source",
      type: "singleSelect",
      options: {
        choices: [
          { name: "Manual" },
          { name: "Feedback-derived" },
          { name: "Onboarding" },
        ],
      },
    },
    // "Created From Feedback" linked field will be added after Feedback Log table exists
  ];
}

function getFeedbackLogFields(campaignTypeRulesTableId) {
  return [
    { name: "Summary", type: "singleLineText" },
    {
      name: "Campaign",
      type: "multipleRecordLinks",
      options: { linkedTableId: CAMPAIGNS_TABLE_ID },
    },
    {
      name: "Post",
      type: "multipleRecordLinks",
      options: { linkedTableId: POSTS_TABLE_ID },
    },
    {
      name: "Campaign Type",
      type: "multipleRecordLinks",
      options: { linkedTableId: campaignTypeRulesTableId },
    },
    {
      name: "Issue Category",
      type: "multipleSelects",
      options: {
        choices: [
          { name: "Wrong Image Pairing", color: "redBright" },
          { name: "Wrong Tone", color: "orangeBright" },
          { name: "Wrong Artist", color: "redBright" },
          { name: "Too Generic", color: "yellowBright" },
          { name: "Wrong Length", color: "yellowBright" },
          { name: "Missing Context", color: "blueBright" },
          { name: "Factual Error", color: "redBright" },
          { name: "Banned Word Used", color: "pinkBright" },
          { name: "Wrong Platform Style", color: "purpleBright" },
          { name: "Other", color: "grayBright" },
        ],
      },
    },
    {
      name: "Description",
      type: "multilineText",
    },
    {
      name: "Severity",
      type: "singleSelect",
      options: {
        choices: [
          { name: "Minor", color: "grayBright" },
          { name: "Moderate", color: "yellowBright" },
          { name: "Critical", color: "redBright" },
        ],
      },
    },
    {
      name: "Resolution",
      type: "singleSelect",
      options: {
        choices: [
          { name: "Pending", color: "grayBright" },
          { name: "Rule Created", color: "greenBright" },
          { name: "Rule Updated", color: "blueBright" },
          { name: "Won't Fix", color: "grayBright" },
        ],
      },
    },
    // "Resolved By Rule" linked field added after Generation Rules table has the feedback link
  ];
}

// ── Seed Data ────────────────────────────────────────────────────────────

const CAMPAIGN_TYPE_SEEDS = [
  {
    Name: "Newsletter",
    Slug: "newsletter",
    Description:
      "Promote a newsletter issue across social media. Each story becomes its own post with a link that scrolls directly to that story. Great for curated newsletters with multiple features.",
    Icon: "Mail",
    Status: "Active",
    "Scraper Strategy": "newsletter",
    "Content Structure":
      "Newsletter issues contain multiple story sections, each with its own heading, content, images, and anchor link. Stories are parsed into independent sections for per-story post generation.",
    "URL Placeholder": "https://example.com/newsletter/issue-42",
    "Sort Order": 1,
  },
  {
    Name: "Blog Post",
    Slug: "blog-post",
    Description:
      "Turn a blog post or article into a series of social media posts. Images and key quotes are extracted and cycled through, with each post highlighting a different aspect of the article.",
    Icon: "FileText",
    Status: "Active",
    "Scraper Strategy": "blog-post",
    "Content Structure":
      "Blog posts may contain a single topic or multiple H2/H3 sections, each about a different artist or topic. Multi-section posts are parsed into independent sections with section-bound images.",
    "URL Placeholder": "https://example.com/blog/my-article",
    "Sort Order": 2,
  },
  {
    Name: "Exhibition",
    Slug: "exhibition",
    Description:
      "Promote an art exhibition by featuring individual artists and artworks. Scrapes exhibition pages and artist profiles to build a months-long drip campaign.",
    Icon: "Frame",
    Status: "Coming Soon",
    "Scraper Strategy": "html-structured",
    "Content Structure":
      "Exhibition pages list participating artists with bios and artwork thumbnails. Each artist becomes a section for independent post generation.",
    "URL Placeholder": "https://example.com/exhibitions/spring-2025",
    "Sort Order": 3,
  },
  {
    Name: "Artist Profile",
    Slug: "artist-profile",
    Description:
      "Spotlight an artist with posts featuring their work and story. Uses artwork images and artist bio to generate posts that celebrate the artist across platforms.",
    Icon: "User",
    Status: "Coming Soon",
    "Scraper Strategy": "html-structured",
    "Content Structure":
      "Single artist page with bio, artwork gallery, exhibitions, and press. All images belong to one artist — no cross-artist pairing risk.",
    "URL Placeholder": "https://example.com/artists/jane-doe",
    "Sort Order": 4,
  },
  {
    Name: "Podcast Episode",
    Slug: "podcast-episode",
    Description:
      "Promote a podcast episode using show notes, guest highlights, and key quotes. Can incorporate transcripts for deeper content extraction.",
    Icon: "Mic",
    Status: "Coming Soon",
    "Scraper Strategy": "html-structured",
    "Content Structure":
      "Episode page with show notes, guest bio, key quotes, and optional transcript. Content is primarily text-based with limited imagery.",
    "URL Placeholder": "https://example.com/podcast/episode-12",
    "Sort Order": 5,
  },
  {
    Name: "Event",
    Slug: "event",
    Description:
      "Promote open calls and submission deadlines. Time-sensitive campaigns that build toward a deadline, inviting artists to submit their work.",
    Icon: "CalendarDays",
    Status: "Coming Soon",
    "Scraper Strategy": "html-structured",
    "Content Structure":
      "Event page with date, location, description, eligibility, and submission details. Time-sensitive content requires countdown-style messaging.",
    "URL Placeholder": "https://example.com/events/open-call-2025",
    "Sort Order": 6,
  },
  {
    Name: "Public Art",
    Slug: "public-art",
    Description:
      "Promote public art installations, murals, and outdoor exhibitions with location-specific content and visual storytelling.",
    Icon: "Landmark",
    Status: "Coming Soon",
    "Scraper Strategy": "html-structured",
    "Content Structure":
      "Installation page with location details, artist info, artwork images, and contextual description. Location and visual impact are key content angles.",
    "URL Placeholder": "https://example.com/public-art/mural-project",
    "Sort Order": 7,
  },
  {
    Name: "Video/Film",
    Slug: "video-film",
    Description:
      "Promote video content, short films, or video art with platform-optimized teasers and behind-the-scenes posts.",
    Icon: "Film",
    Status: "Coming Soon",
    "Scraper Strategy": "html-structured",
    "Content Structure":
      "Video page with embedded player, synopsis, credits, and stills. Content promotion focuses on teasers, behind-the-scenes, and premiere announcements.",
    "URL Placeholder": "https://example.com/films/short-film-title",
    "Sort Order": 8,
  },
  {
    Name: "Institutional",
    Slug: "institutional",
    Description:
      "Promote organizational news, grants, residencies, and institutional announcements across social platforms.",
    Icon: "Building2",
    Status: "Coming Soon",
    "Scraper Strategy": "html-structured",
    "Content Structure":
      "Organizational page with announcement details, eligibility, deadlines, and institutional context. Formal but accessible tone.",
    "URL Placeholder": "https://example.com/news/grant-announcement",
    "Sort Order": 9,
  },
  {
    Name: "Custom",
    Slug: "custom",
    Description:
      "Create a custom campaign with manual configuration for content types not covered by other presets.",
    Icon: "Sparkles",
    Status: "Coming Soon",
    "Scraper Strategy": "manual",
    "Content Structure":
      "User-provided content with no assumed structure. All rules and constraints configured manually.",
    "URL Placeholder": "https://example.com/page-to-promote",
    "Sort Order": 10,
  },
];

// Rules extracted from SYSTEM_PROMPT and buildUserPrompt() in blog-post-generator.ts
// These apply to Blog Post; Newsletter inherits the same set with link handling additions
function getGenerationRuleSeeds(blogPostTypeId, newsletterTypeId) {
  const blogPostRules = [
    // Content Pairing rules (from multi-section logic)
    {
      Name: "Pair images with section artists",
      Category: "Content Pairing",
      "Rule Text":
        "Each image must stay paired with its section's artist. Never swap images between sections. A mismatch means the wrong artist's artwork appears with the wrong artist's text.",
      "Prompt Fragment":
        "CRITICAL SECTION RULE: Each variant MUST focus on the content from ONE specific section. Set sectionIndex to the section number that the variant is about. The image assigned to each post will be determined by sectionIndex, so a mismatch means the wrong artist's artwork appears with the wrong artist's text.",
      Priority: "Critical",
      Active: true,
      Source: "Manual",
    },
    {
      Name: "One artist per post in multi-section content",
      Category: "Structure",
      "Rule Text":
        "For multi-artist posts, each social post should focus on one artist/section. Do not combine content from different sections in a single post.",
      "Prompt Fragment":
        "For each platform, each variant MUST focus on a DIFFERENT person, artist, topic, or section of the article. Do NOT write multiple posts about the same thing.",
      Priority: "Important",
      Active: true,
      Source: "Manual",
    },
    // Image Handling
    {
      Name: "Filter out navigation and UI images",
      Category: "Image Handling",
      "Rule Text":
        "Filter out navigation/UI images — no chevrons, icons, or images below 200x200px. Only use substantive artwork or photography images.",
      Priority: "Critical",
      Active: true,
      Source: "Manual",
    },
    {
      Name: "Automatic image assignment via sectionIndex",
      Category: "Image Handling",
      "Rule Text":
        "Images are assigned AUTOMATICALLY based on sectionIndex. Set imageUrl to an empty string. The system will use the images from the section you specify via sectionIndex.",
      "Prompt Fragment":
        "IMPORTANT: Images are assigned AUTOMATICALLY based on sectionIndex. Set imageUrl to an empty string. The system will use the images from the section you specify.",
      Priority: "Critical",
      Active: true,
      Source: "Manual",
    },
    // Avoidance rules (from SYSTEM_PROMPT banned words)
    {
      Name: "No AI-generated cliches",
      Category: "Avoidance",
      "Rule Text":
        'Never use AI cliches: "delve", "dive into", "unlock", "unleash", "elevate", "enhance", "empower", "revolutionize", "game-changer", "navigate", "embark", "journey", "landscape", "realm", "beacon", "resonate", "testament", "ever-evolving", "cutting-edge", "turbocharge", "supercharge". Also banned: "moreover", "furthermore", "indeed" as transitions.',
      Priority: "Critical",
      Active: true,
      Source: "Manual",
    },
    {
      Name: "No rhetorical question endings",
      Category: "Avoidance",
      "Rule Text":
        "Don't end posts with rhetorical questions. Don't use transformation/journey/evolution metaphors or vague empowerment language.",
      Priority: "Important",
      Active: true,
      Source: "Manual",
    },
    // Tone & Voice
    {
      Name: "Write like a real person",
      Category: "Tone & Voice",
      "Rule Text":
        "Use simple, direct language. Mix short and long sentences naturally. Lead with specifics, not abstractions. Use concrete examples over general concepts. Sound conversational, not corporate. Be opinionated when appropriate.",
      "Prompt Fragment":
        "WRITE LIKE A REAL PERSON: Use simple, direct language. Mix short and long sentences naturally. Lead with specifics, not abstractions. Sound conversational, not corporate. Be opinionated when appropriate.",
      Priority: "Critical",
      Active: true,
      Source: "Manual",
    },
    // Structure
    {
      Name: "Spread content across article",
      Category: "Structure",
      "Rule Text":
        "When generating multiple variants, each must focus on a DIFFERENT person, artist, topic, or section. Do not write multiple posts about the same thing. Spread focus across the entire article.",
      Priority: "Important",
      Active: true,
      Source: "Manual",
    },
    {
      Name: "Use diverse content angles",
      Category: "Structure",
      "Rule Text":
        "Vary the angle for each variant: lead with the most surprising point, focus on a specific person, pull out a provocative quote or statistic, frame as a question or debate, or connect to a broader trend.",
      Priority: "Nice-to-have",
      Active: true,
      Source: "Manual",
    },
    // Link Handling
    {
      Name: "Include blog post URL naturally",
      Category: "Link Handling",
      "Rule Text":
        "Include the blog post URL naturally in each post. The URL will be replaced with a shortened tracking link after generation. For Instagram, mention 'link in bio' instead since URLs aren't clickable in captions.",
      "Prompt Fragment":
        'Include the blog post URL naturally in each post. The URL will be replaced with a shortened tracking link after generation. For platforms where URLs aren\'t clickable in captions (Instagram), mention "link in bio" instead.',
      Priority: "Important",
      Active: true,
      Source: "Manual",
    },
  ];

  // Newsletter-specific rules (in addition to shared Blog Post rules)
  const newsletterOnlyRules = [
    {
      Name: "Link to story anchor, not newsletter homepage",
      Category: "Link Handling",
      "Rule Text":
        "Each post links to its specific story anchor within the newsletter, not the newsletter homepage. This ensures readers land directly on the story being promoted.",
      Priority: "Critical",
      Active: true,
      Source: "Manual",
    },
    {
      Name: "Lead with visually striking story",
      Category: "Structure",
      "Rule Text":
        "Lead with the most visually striking story, not necessarily the first story in the newsletter. Visual impact drives engagement on social media.",
      Priority: "Important",
      Active: true,
      Source: "Manual",
    },
  ];

  // Build the records with linked Campaign Type IDs
  const records = [];

  // Blog Post rules
  for (const rule of blogPostRules) {
    records.push({
      ...rule,
      "Campaign Type": [blogPostTypeId],
    });
  }

  // Newsletter gets the same base rules as Blog Post PLUS its own
  for (const rule of blogPostRules) {
    records.push({
      ...rule,
      "Campaign Type": [newsletterTypeId],
    });
  }
  for (const rule of newsletterOnlyRules) {
    records.push({
      ...rule,
      "Campaign Type": [newsletterTypeId],
    });
  }

  return records;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Phase 1: Campaign Type Rules Schema + Seed ===\n");

  // Step 1: Create Campaign Type Rules table
  const ctrTable = await createTable(
    "Campaign Type Rules",
    getCampaignTypeRulesFields(),
    "Campaign type definitions, descriptions, enabled status, and scraper configuration. Replaces hardcoded CAMPAIGN_TYPES constants."
  );

  // Step 2: Create Generation Rules table (linked to Campaign Type Rules)
  const grTable = await createTable(
    "Generation Rules",
    getGenerationRulesFields(ctrTable.id),
    "Individual editorial rules composed into prompt fragments. Each belongs to a campaign type via linked record."
  );

  // Step 3: Create Feedback Log table (linked to Campaigns, Posts, Campaign Type Rules)
  const flTable = await createTable(
    "Feedback Log",
    getFeedbackLogFields(ctrTable.id),
    "Structured feedback on generated posts, linked to campaigns, posts, and campaign types."
  );

  // Step 4: Add cross-link fields that required all tables to exist first

  // Add "Created From Feedback" field to Generation Rules → Feedback Log
  await addFieldToTable(grTable.id, {
    name: "Created From Feedback",
    type: "multipleRecordLinks",
    options: { linkedTableId: flTable.id },
  });

  // Add "Resolved By Rule" field to Feedback Log → Generation Rules
  // (This may already exist as the inverse of "Created From Feedback",
  //  but if Airtable didn't auto-create it, we add it explicitly)

  // Step 5: Add "Feedback" linked field to existing Posts table
  await addFieldToTable(POSTS_TABLE_ID, {
    name: "Feedback",
    type: "multipleRecordLinks",
    options: { linkedTableId: flTable.id },
  });

  // Step 6: Seed Campaign Type Rules
  console.log("\n--- Seeding Campaign Type Rules ---");
  await createRecords("Campaign Type Rules", CAMPAIGN_TYPE_SEEDS);

  // Step 7: Retrieve seeded records to get IDs for linking
  console.log("\n--- Fetching seeded Campaign Type IDs ---");
  const seededTypes = await apiCall(
    `${DATA_URL}/${encodeURIComponent("Campaign Type Rules")}?fields[]=Name`
  );
  const typeIdMap = {};
  for (const rec of seededTypes.records) {
    typeIdMap[rec.fields.Name] = rec.id;
  }
  console.log(
    "  Type IDs:",
    Object.entries(typeIdMap)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")
  );

  // Step 8: Seed Generation Rules
  console.log("\n--- Seeding Generation Rules ---");
  const genRuleSeeds = getGenerationRuleSeeds(
    typeIdMap["Blog Post"],
    typeIdMap["Newsletter"]
  );
  await createRecords("Generation Rules", genRuleSeeds);

  // Summary
  console.log("\n=== Phase 1 Complete ===");
  console.log(`Campaign Type Rules table: ${ctrTable.id}`);
  console.log(`Generation Rules table:    ${grTable.id}`);
  console.log(`Feedback Log table:        ${flTable.id}`);
  console.log("\nNext: Update CLAUDE.md and types.ts with these table IDs.");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
