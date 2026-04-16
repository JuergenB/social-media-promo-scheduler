# Instagram Collaboration & User Tags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Instagram collaborator invites and image user tags to the post detail card, wired through to Zernio at publish time.

**Architecture:** Two new Airtable fields on Posts (Collaborators, User Tags) stored as JSON string arrays. A new collapsible "Collaboration" UI section on Instagram post detail cards, following the First Comment pattern. Publish and sync routes extended to pass these through `platformSpecificData`.

**Tech Stack:** Airtable Meta API, Next.js API routes, React (campaign-post-detail.tsx), Zernio SDK (`@getlatedev/node`)

---

### Task 1: Add Airtable fields via Meta API

**Files:**
- Create: `scripts/add-collaboration-fields.mjs`

- [ ] **Step 1: Write the migration script**

```javascript
// scripts/add-collaboration-fields.mjs
import 'dotenv/config';

const BASE_ID = 'app5FPCG06huzh7hX';
const POSTS_TABLE_ID = 'tblyUEPOJXxpQDZNL';
const PAT = process.env.AIRTABLE_API_KEY;

const fields = [
  { name: 'Collaborators', type: 'multilineText', description: 'JSON array of Instagram usernames for collab invites (max 3)' },
  { name: 'User Tags', type: 'multilineText', description: 'JSON array of Instagram usernames to tag on image (center-positioned)' },
];

for (const field of fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables/${POSTS_TABLE_ID}/fields`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(field),
    }
  );
  const data = await res.json();
  if (res.ok) {
    console.log(`Created field "${field.name}": ${data.id}`);
  } else {
    console.error(`Failed to create "${field.name}":`, data.error);
  }
}
```

- [ ] **Step 2: Run the script**

Run: `node scripts/add-collaboration-fields.mjs`
Expected: Two lines confirming field creation with IDs.

- [ ] **Step 3: Verify fields exist in Airtable**

Run: `curl -s -H "Authorization: Bearer $AIRTABLE_API_KEY" "https://api.airtable.com/v0/meta/bases/app5FPCG06huzh7hX/tables" | jq '.tables[] | select(.id == "tblyUEPOJXxpQDZNL") | .fields[] | select(.name == "Collaborators" or .name == "User Tags") | {name, type, id}'`
Expected: Two JSON objects showing Collaborators and User Tags as multilineText fields.

- [ ] **Step 4: Commit**

```bash
git add scripts/add-collaboration-fields.mjs
git commit -m "feat: add Collaborators and User Tags fields to Posts table"
```

---

### Task 2: Extend Post type and API mapping

**Files:**
- Modify: `src/lib/airtable/types.ts:171-199` (Post interface)
- Modify: `src/app/api/campaigns/[id]/route.ts:156-158` (Post mapping)

- [ ] **Step 1: Add fields to the Post interface**

In `src/lib/airtable/types.ts`, after the `platformPostUrl` field (line 196), add:

```typescript
  /** JSON string array of Instagram usernames invited as collaborators (max 3). */
  collaborators: string;
  /** JSON string array of Instagram usernames tagged on the image (center-positioned). */
  userTags: string;
```

- [ ] **Step 2: Add fields to the Post mapping in the campaigns route**

In `src/app/api/campaigns/[id]/route.ts`, after the `platformPostUrl` mapping (line 158), add:

```typescript
      collaborators: r.fields["Collaborators"] || "",
      userTags: r.fields["User Tags"] || "",
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors (existing errors unrelated to these changes are OK).

- [ ] **Step 4: Commit**

```bash
git add src/lib/airtable/types.ts src/app/api/campaigns/[id]/route.ts
git commit -m "feat: add collaborators and userTags to Post type and mapping"
```

---

### Task 3: Accept collaboration fields in PATCH endpoint

**Files:**
- Modify: `src/app/api/posts/[id]/route.ts:115-128` (field acceptance block)
- Modify: `src/app/api/posts/[id]/route.ts:139-218` (Zernio sync block)

- [ ] **Step 1: Accept the new fields in the PATCH handler**

In `src/app/api/posts/[id]/route.ts`, after the `firstComment` block (line 117-118), add:

```typescript
    // Collaborators (Instagram collab invites — JSON string array)
    if (body.collaborators !== undefined) {
      fields["Collaborators"] = body.collaborators;
    }

    // User Tags (Instagram image tags — JSON string array)
    if (body.userTags !== undefined) {
      fields["User Tags"] = body.userTags;
    }
```

- [ ] **Step 2: Include collaboration fields in the Zernio sync change detection**

In `src/app/api/posts/[id]/route.ts`, extend the `contentOrMediaChanged` condition (around line 140) to also trigger on collaboration field changes:

```typescript
    const contentOrMediaChanged = fields["Content"] !== undefined
      || fields["Image URL"] !== undefined
      || fields["Media URLs"] !== undefined
      || fields["Media Captions"] !== undefined
      || fields["First Comment"] !== undefined
      || fields["Collaborators"] !== undefined
      || fields["User Tags"] !== undefined;
```

- [ ] **Step 3: Add Collaborators and User Tags to the Zernio sync getRecord call**

In the Zernio sync block, extend the `getRecord` type parameter (around line 150-160) to include the new fields:

```typescript
          const post = await getRecord<{
            "Zernio Post ID": string;
            "Scheduled Date": string;
            Campaign: string[];
            Content: string;
            "Image URL": string;
            "Media URLs": string;
            "Media Captions": string;
            "First Comment": string;
            Platform: string;
            Collaborators: string;
            "User Tags": string;
          }>("Posts", id);
```

- [ ] **Step 4: Extend the Zernio sync platformSpecificData to include collaboration fields**

In the Zernio sync block, replace the existing `firstComment` platformSpecificData section (around lines 196-203) with:

```typescript
          // Sync firstComment + collaboration fields to Zernio (Instagram-specific)
          const platform = (post.fields.Platform || "").toLowerCase();
          if (platform === "instagram") {
            const psd: Record<string, unknown> = {};
            if (post.fields["First Comment"]) {
              psd.firstComment = post.fields["First Comment"];
            }
            // Collaborators: JSON array of usernames
            try {
              const collabs: string[] = post.fields.Collaborators
                ? JSON.parse(post.fields.Collaborators)
                : [];
              if (collabs.length > 0) psd.collaborators = collabs;
            } catch { /* ignore malformed JSON */ }
            // User Tags: JSON array of usernames → {username, x, y} objects
            try {
              const tags: string[] = post.fields["User Tags"]
                ? JSON.parse(post.fields["User Tags"])
                : [];
              if (tags.length > 0) {
                psd.userTags = tags.map((username) => ({ username, x: 0.5, y: 0.5 }));
              }
            } catch { /* ignore malformed JSON */ }
            if (Object.keys(psd).length > 0) {
              updateBody.platformSpecificData = psd;
            }
          } else if (["facebook", "linkedin"].includes(platform)) {
            // Non-Instagram platforms: firstComment only
            if (post.fields["First Comment"]) {
              updateBody.platformSpecificData = {
                firstComment: post.fields["First Comment"],
              };
            }
          }
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 6: Test the PATCH endpoint with curl**

Run:
```bash
# Pick any existing Instagram post ID from Airtable for testing
curl -s -X PATCH http://localhost:3025/api/posts/TEST_POST_ID \
  -H "Content-Type: application/json" \
  -d '{"collaborators": "[\"testuser1\", \"testuser2\"]", "userTags": "[\"taggeduser\"]"}' | jq .
```
Expected: `{ "success": true }`

Then verify the Airtable record has the fields populated:
```bash
curl -s -H "Authorization: Bearer $AIRTABLE_API_KEY" \
  "https://api.airtable.com/v0/app5FPCG06huzh7hX/tblyUEPOJXxpQDZNL/TEST_POST_ID?fields%5B%5D=Collaborators&fields%5B%5D=User%20Tags" | jq .fields
```
Expected: `{ "Collaborators": "[\"testuser1\", \"testuser2\"]", "User Tags": "[\"taggeduser\"]" }`

- [ ] **Step 7: Commit**

```bash
git add src/app/api/posts/[id]/route.ts
git commit -m "feat: accept collaborators and userTags in PATCH, sync to Zernio"
```

---

### Task 4: Pass collaboration fields through at publish time

**Files:**
- Modify: `src/app/api/posts/[id]/publish/route.ts:8-20` (PostFields interface)
- Modify: `src/app/api/posts/[id]/publish/route.ts:196-206` (platformSpecificData block)

- [ ] **Step 1: Add fields to the PostFields interface**

In `src/app/api/posts/[id]/publish/route.ts`, extend the `PostFields` interface (line 8-20) to include:

```typescript
interface PostFields {
  Campaign: string[];
  Platform: string;
  Content: string;
  "Image URL": string;
  "Media URLs": string;
  "Media Captions": string;
  "Short URL": string;
  "Link URL": string;
  "First Comment": string;
  Status: string;
  "Zernio Post ID": string;
  Collaborators: string;
  "User Tags": string;
}
```

- [ ] **Step 2: Extend the platformSpecificData construction**

Replace the existing `platformEntry` / firstComment block (around lines 196-206) with:

```typescript
    // Build platform entry with platformSpecificData
    const platformEntry: Record<string, unknown> = {
      platform: platform as "instagram" | "twitter" | "linkedin" | "facebook" | "threads" | "bluesky" | "pinterest",
      accountId: (account as { _id: string })._id,
    };

    // Build platformSpecificData (firstComment + Instagram collaboration fields)
    const psd: Record<string, unknown> = {};

    if (post.fields["First Comment"]) {
      psd.firstComment = post.fields["First Comment"];
    }

    // Instagram-only: collaborators and user tags
    if (platform === "instagram") {
      try {
        const collabs: string[] = post.fields.Collaborators
          ? JSON.parse(post.fields.Collaborators)
          : [];
        if (collabs.length > 0) psd.collaborators = collabs;
      } catch { /* ignore malformed JSON */ }

      try {
        const tags: string[] = post.fields["User Tags"]
          ? JSON.parse(post.fields["User Tags"])
          : [];
        if (tags.length > 0) {
          psd.userTags = tags.map((username) => ({ username, x: 0.5, y: 0.5 }));
        }
      } catch { /* ignore malformed JSON */ }
    }

    if (Object.keys(psd).length > 0) {
      platformEntry.platformSpecificData = psd;
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/posts/[id]/publish/route.ts
git commit -m "feat: pass collaborators and userTags to Zernio at publish time"
```

---

### Task 5: Build the Collaboration UI section

**Files:**
- Create: `src/components/posts/collaboration-section.tsx`
- Modify: `src/components/posts/campaign-post-detail.tsx:130-164` (add collaboration state + section)

- [ ] **Step 1: Create the CollaborationSection component**

Create `src/components/posts/collaboration-section.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronUp, Save, Users } from "lucide-react";

interface CollaborationSectionProps {
  postId: string;
  collaborators: string[];
  userTags: string[];
  isPublished: boolean;
}

/** Strip @ prefix and whitespace from a username. */
function cleanUsername(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/** Parse comma-separated usernames, strip @, filter empties. */
function parseUsernames(input: string): string[] {
  return input
    .split(",")
    .map(cleanUsername)
    .filter((u) => u.length > 0);
}

export function CollaborationSection({
  postId,
  collaborators: initialCollaborators,
  userTags: initialUserTags,
  isPublished,
}: CollaborationSectionProps) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [collabInput, setCollabInput] = useState(initialCollaborators.join(", "));
  const [tagsInput, setTagsInput] = useState(initialUserTags.join(", "));

  const parsedCollabs = parseUsernames(collabInput);
  const parsedTags = parseUsernames(tagsInput);
  const collabError = parsedCollabs.length > 3 ? "Maximum 3 collaborators allowed" : null;

  // Summary for collapsed state
  const parts: string[] = [];
  if (initialCollaborators.length > 0) {
    parts.push(`${initialCollaborators.length} collaborator${initialCollaborators.length > 1 ? "s" : ""}`);
  }
  if (initialUserTags.length > 0) {
    parts.push(`${initialUserTags.length} tag${initialUserTags.length > 1 ? "s" : ""}`);
  }
  const summary = parts.join(", ");

  const hasChanges =
    JSON.stringify(parsedCollabs) !== JSON.stringify(initialCollaborators) ||
    JSON.stringify(parsedTags) !== JSON.stringify(initialUserTags);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collaborators: JSON.stringify(parsedCollabs),
          userTags: JSON.stringify(parsedTags),
        }),
      });
      if (!res.ok) throw new Error("Failed to save collaboration settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign"] });
      toast.success("Collaboration settings saved");
    },
    onError: () => toast.error("Failed to save collaboration settings"),
  });

  return (
    <div className="px-6 pb-3">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <Users className="h-3.5 w-3.5" />
        Collaboration
        {summary && !expanded && (
          <span className="ml-auto text-xs text-muted-foreground font-normal">{summary}</span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4 pl-6">
          {/* Collaborators */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Collaborators <span className="text-muted-foreground font-normal">(max 3)</span>
            </label>
            <Input
              value={collabInput}
              onChange={(e) => setCollabInput(e.target.value)}
              placeholder="username1, username2"
              disabled={isPublished}
              className="text-sm h-8"
            />
            {collabError && (
              <p className="text-xs text-destructive">{collabError}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Invite these accounts as collaborators — they&apos;ll be asked to co-publish this post.
            </p>
          </div>

          {/* User Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Image Tags</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="artistname, galleryname"
              disabled={isPublished}
              className="text-sm h-8"
            />
            <p className="text-[11px] text-muted-foreground">
              Tag these accounts on the image — the post appears on their Tagged tab.
            </p>
          </div>

          {/* Save */}
          {!isPublished && (
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!hasChanges || !!collabError || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-3 w-3 mr-1" />
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/posts/collaboration-section.tsx
git commit -m "feat: add CollaborationSection component for Instagram posts"
```

---

### Task 6: Integrate CollaborationSection into the post detail card

**Files:**
- Modify: `src/components/posts/campaign-post-detail.tsx`

- [ ] **Step 1: Add the import**

At the top of `campaign-post-detail.tsx`, after the `FlagIssueDialog` import (around line 38), add:

```typescript
import { CollaborationSection } from "./collaboration-section";
```

- [ ] **Step 2: Parse collaboration data from the post**

Inside the component function, after the `firstCommentExpanded` / `editingFirstComment` state block (around line 133), add:

```typescript
  // ── Collaboration (Instagram only) ────────────────────────────────────
  const isInstagram = platformLower === "instagram";
  const collaborators: string[] = (() => {
    try { return post.collaborators ? JSON.parse(post.collaborators) : []; }
    catch { return []; }
  })();
  const userTags: string[] = (() => {
    try { return post.userTags ? JSON.parse(post.userTags) : []; }
    catch { return []; }
  })();
```

- [ ] **Step 3: Add the CollaborationSection to the JSX**

In the JSX, after the First Comment section and before the source link row (find the `{/* Source link row */}` comment, around line 422), add:

```tsx
        {/* Instagram collaboration — collaborators & image tags */}
        {isInstagram && (
          <CollaborationSection
            postId={post.id}
            collaborators={collaborators}
            userTags={userTags}
            isPublished={isPublished}
          />
        )}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/posts/campaign-post-detail.tsx
git commit -m "feat: integrate CollaborationSection into Instagram post detail cards"
```

---

### Task 7: Visual verification with Puppeteer

**Files:** (no file changes — verification only)

- [ ] **Step 1: Take a screenshot of an Instagram post detail card**

Run a Puppeteer script to navigate to the dashboard, open a campaign with Instagram posts, click into one, and screenshot the post detail card to verify the Collaboration section appears:

```javascript
// Run with: node -e '...' or save to /tmp/verify-collab.js
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // Navigate to a campaign with Instagram posts — substitute a real campaign ID
  await page.goto('http://localhost:3025/dashboard/campaigns/CAMPAIGN_ID', { waitUntil: 'networkidle0' });
  // Click on an Instagram post card to open the detail view
  // (Adjust selector based on actual rendered DOM)
  await page.screenshot({ path: '/tmp/collab-section-verify.png', fullPage: true });
  await browser.close();
})();
```

- [ ] **Step 2: Read and evaluate the screenshot**

Read `/tmp/collab-section-verify.png` and confirm:
- The "Collaboration" section header is visible below First Comment
- It's collapsed by default
- Clicking to expand shows both inputs

- [ ] **Step 3: Verify non-Instagram posts do NOT show the section**

Navigate to a LinkedIn or X/Twitter post detail and screenshot. Confirm no Collaboration section appears.

---

### Task 8: End-to-end publish verification

**Files:** (no file changes — verification only)

- [ ] **Step 1: Set collaborators and user tags on a test Instagram post**

Use curl to set test values:
```bash
curl -s -X PATCH http://localhost:3025/api/posts/TEST_POST_ID \
  -H "Content-Type: application/json" \
  -d '{"collaborators": "[\"testuser1\"]", "userTags": "[\"taggedartist\"]"}' | jq .
```

- [ ] **Step 2: Publish the post and inspect the Zernio createPost call**

Add a `console.log` before the `createPost` call in the publish route (temporarily) to log the full `createBody` and verify `platformSpecificData` includes:
- `collaborators: ["testuser1"]`
- `userTags: [{ username: "taggedartist", x: 0.5, y: 0.5 }]`

Note: For a real publish test, use a test Instagram account. For a dry-run, temporarily log and return before the actual `createPost` call.

- [ ] **Step 3: Remove temporary logging and commit if any cleanup needed**

---

### Task 9: Update CLAUDE.md and create GitHub issue

**Files:**
- Modify: `CLAUDE.md` (project structure / conventions sections)

- [ ] **Step 1: Update CLAUDE.md conventions**

Add to the Conventions section in CLAUDE.md:

```markdown
- **Instagram collaboration:** Posts targeting Instagram can include up to 3 collaborator usernames (collab invite, co-publishes to both feeds) and image user tags (appears on tagged users' Tagged tab, center-positioned). Stored as JSON string arrays in `Collaborators` and `User Tags` fields on Posts table. Surfaced in an expandable "Collaboration" section on Instagram post detail cards. Passed through `platformSpecificData` at publish time.
```

- [ ] **Step 2: Update Airtable table documentation**

In the Posts table description in CLAUDE.md, add `Collaborators` and `User Tags` to the field list.

- [ ] **Step 3: Create GitHub issue for tracking**

```bash
gh issue create --title "Instagram collaboration invites and image user tags" \
  --body "## Summary
Adds Instagram-specific collaboration features to post detail cards:
- **Collaborators** (max 3): Invite accounts to co-publish (appears on both feeds)
- **Image User Tags**: Tag accounts on the image (appears on their Tagged tab, center-positioned)

## Implementation
- Airtable fields: \`Collaborators\`, \`User Tags\` on Posts table (JSON string arrays)
- UI: Collapsible 'Collaboration' section on Instagram post cards, below First Comment
- API: PATCH accepts new fields, publish route passes through \`platformSpecificData\`
- Zernio sync: Scheduled post edits include collaboration fields

## Design spec
\`docs/superpowers/specs/2026-04-16-instagram-collaboration-design.md\`

## Test plan
See spec for full 14-point test plan."
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Instagram collaboration feature in CLAUDE.md"
```
