# Instagram Collaboration & User Tags — Design Spec

**Date:** 2026-04-16
**Status:** Draft
**Scope:** Instagram-only collaboration invites and image user tags on the post detail card

## Problem

Zernio supports Instagram collaborator invites (co-publishing) and image user tags (tagged tab visibility), but PolyWiz doesn't expose either feature. The team occasionally collaborates with partner accounts and tags artists/galleries in posts. Currently this requires editing the post natively in Instagram after publishing.

## Decision

Minimal implementation following the existing First Comment pattern:

- Post-level fields on the Posts Airtable table (no brand-level defaults)
- Expandable UI section on Instagram post detail cards, collapsed by default
- User tags use center positioning only (x: 0.5, y: 0.5) — no coordinate picker

## Instagram Collaboration Tiers (Context)

| Action | Notification | On their profile | Where | Acceptance required |
|--------|-------------|-----------------|-------|-------------------|
| @mention in text | Yes | No | — | No |
| Image tag | Yes | Yes | Tagged tab | No (removable) |
| Collaborator invite | Yes | Yes | Main grid + followers' feeds | Yes |

@mentions in post text already work via our content generation. This spec adds the other two tiers.

## Data Layer

### New Airtable fields on Posts table (`tblyUEPOJXxpQDZNL`)

| Field | Type | Format | Constraints |
|-------|------|--------|-------------|
| `Collaborators` | Long text | JSON string: `["username1", "username2"]` | Max 3 usernames. `@` prefix stripped on save. Instagram feed/Reels only (not Stories). |
| `User Tags` | Long text | JSON string: `["user1", "user2"]` | Usernames only — app injects `x: 0.5, y: 0.5` at publish time. `@` prefix stripped. Single images or first carousel image only. |

Fields are created via the Airtable Meta API. JSON string storage follows the same pattern as `Media Captions`.

### TypeScript types

```typescript
// In src/lib/airtable/types.ts — extend Post interface
collaborators?: string;   // JSON string: string[]
userTags?: string;         // JSON string: string[]  (usernames only, center-positioned at publish)
```

Note: `userTags` is stored as a simple username array in Airtable (no coordinates). The `{username, x: 0.5, y: 0.5}` structure is constructed at publish time when building the Zernio API call.

## UI Design

### Location

Post detail card (`campaign-post-detail.tsx`), below the First Comment section. Visible **only when platform is Instagram**. Collapsed by default.

### Collapsed state

```
v Collaboration                          2 collaborators, 1 tag
```

A chevron + "Collaboration" label + a muted summary badge showing counts when populated. Nothing shown when both fields are empty (just the collapsed header with no badge).

### Expanded state

```
^ Collaboration

  Collaborators (max 3)
  ┌─────────────────────────────────────┐
  │ galleryname, artistname             │
  └─────────────────────────────────────┘
  Invite these accounts as collaborators — they'll be asked to co-publish this post.

  Image Tags
  ┌─────────────────────────────────────┐
  │ artistname                          │
  └─────────────────────────────────────┘
  Tag these accounts on the image — the post appears on their Tagged tab.

  [Save]
```

- Both inputs are simple comma-separated text fields (matching the First Comment textarea pattern)
- `@` prefix is accepted but stripped silently
- Collaborators input shows validation if > 3 usernames entered
- Save button triggers a single PATCH call with both fields
- Inputs are disabled when post is published

### Interaction notes

- Expanding/collapsing is local state only (no persistence needed)
- Save mutation follows the same pattern as `saveFirstCommentMutation`
- On post navigation (prev/next), reset local state from the new post's data

## API Changes

### PATCH `/api/posts/[id]` (existing route)

Accept two new optional body fields:

```typescript
{
  collaborators?: string,  // JSON string: ["username1", "username2"]
  userTags?: string,       // JSON string: ["username1"]
}
```

Write through to Airtable `Collaborators` and `User Tags` fields respectively.

### POST `/api/posts/[id]/publish` (existing route)

When platform is `instagram`:

1. Read `Collaborators` and `User Tags` from the post record
2. Parse both JSON fields
3. Build `platformSpecificData`:

```typescript
platformSpecificData: {
  firstComment: post.fields["First Comment"] || undefined,
  collaborators: collaboratorsArray.length > 0 ? collaboratorsArray : undefined,
  userTags: userTagsArray.length > 0
    ? userTagsArray.map(username => ({ username, x: 0.5, y: 0.5 }))
    : undefined,
}
```

### Zernio sync on scheduled post edit (existing PATCH route)

The existing fire-and-forget sync in the PATCH handler already sends `platformSpecificData` for scheduled posts. Extend it to include `collaborators` and `userTags` (same structure as publish) when the post has a Zernio Post ID and platform is Instagram.

## Zernio API Constraints

From the SDK types (`@getlatedev/node`):

- `collaborators`: Up to 3 Instagram usernames. Feed and Reels only — not Stories.
- `userTags`: Array of `{username: string, x: number, y: number}`. Coordinates 0.0–1.0. Works on single image posts and first image of carousel posts only. Not supported for Stories or videos. `@` symbol optional — auto-stripped by Zernio.

## Out of Scope

- Brand-level default collaborators (add later if usage warrants)
- X/Y position picker for user tags (center-tag only)
- LinkedIn mentions (separate API call to resolve URNs — separate feature)
- Post-level `mentions[]` field (unclear semantics across platforms)
- Auto-population during campaign generation (manual per-post only)
- Threads, Facebook, or other platform collaboration features

## Test Plan

1. **Airtable schema**: Create fields via Meta API, verify they appear on Posts table
2. **UI visibility**: Collaboration section appears only on Instagram post cards, not on LinkedIn/X/etc.
3. **Collapsed default**: Section is collapsed by default, shows no badge when empty
4. **Badge counts**: Populated fields show correct count in collapsed state ("2 collaborators, 1 tag")
5. **Save collaborators**: Enter 1-3 usernames, save, verify Airtable field updates with JSON array
6. **Save user tags**: Enter usernames, save, verify Airtable field updates
7. **@ stripping**: Enter "@username" — saved as "username" without the @
8. **Max 3 validation**: Enter 4+ collaborator usernames — validation error shown, save blocked
9. **Publish with collaborators**: Publish Instagram post, verify Zernio `createPost` call includes `platformSpecificData.collaborators`
10. **Publish with user tags**: Verify `platformSpecificData.userTags` includes `x: 0.5, y: 0.5` for each username
11. **Scheduled post sync**: Edit collaborators on an already-scheduled post, verify Zernio update includes the change
12. **Published post**: Verify inputs are disabled/read-only on published posts
13. **Post navigation**: Navigate between posts, verify collaboration state resets correctly
14. **Empty state**: Save with empty inputs — fields cleared in Airtable, not sent to Zernio
