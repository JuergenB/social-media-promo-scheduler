# Handover: Issues #42, #43, #44, #45 — Multi-User Brand Access & Deployment

## Context

PolyWiz is a Next.js 16 social media campaign generator. Brand switching with per-brand Zernio API keys just shipped (#41). The global brand switcher in the dashboard header works — switching brands changes the API key, refreshes all Zernio data (profiles, accounts, posts, queue), and filters Airtable campaigns by brand.

**What's missing:** Every user sees all brands. There's no user-to-brand mapping, no persistent brand selection, no server-side brand access enforcement, and the app only runs on localhost.

## What Exists Today

### Authentication
- **NextAuth v5** with Credentials provider (email/password)
- Users hardcoded in `AUTH_USERS` env var: `id:email:password:displayName:role`
- 4 users: Kirsten (curator), Morgan (curator), Scott (admin), Juergen (admin)
- Session includes `user.id`, `user.email`, `user.displayName`, `user.role`
- Auth config: `src/auth.ts`
- Middleware: `src/middleware.ts`

### Brand Switching (client-side only)
- `src/lib/brand-context.tsx` — `BrandProvider` with `switchBrand()` that:
  - Sets selected brand in React state (lost on refresh)
  - Clears cached Zernio profile ID
  - Invalidates all React Query caches (profiles, accounts, posts, queue, calendar)
- `src/app/dashboard/layout.tsx` — Global brand switcher dropdown in header
- All hooks include `brandId` in React Query keys

### Per-Brand API Key Resolution
- `src/lib/late-api/client.ts` — `resolveZernioKey(brand)` follows Short.io pattern
- `src/app/api/auto-auth/route.ts` — accepts `?brandId=`, resolves brand-specific Zernio key
- `src/lib/short-io.ts` — per-brand Short.io keys (fully working reference)
- `src/lib/anthropic.ts` — per-brand Anthropic keys (now wired up)
- Env var pattern: Brand record has `zernioApiKeyLabel` field → `process.env[label]`

### Airtable
- **Base ID:** `app5FPCG06huzh7hX`
- **PAT:** in `.env.local` as `AIRTABLE_API_KEY`
- **Brands table** (`tblK6tDXvx8Qt0CXh`): 4 active brands (Arterial set to Inactive, deferred)
  - The Intersect (`recQ69SHPps9W5z0U`) — `LATE_API_KEY_INTERSECT`
  - Sugar Press Art (`rec9Qi1hXcktmCDyZ`) — `LATE_API_KEY_SUGAR_PRESS`
  - Not Real Art (`recC3FgykeXrRzId1`) — `LATE_API_KEY_NRA`
  - Artsville USA (`recRzyM8RWgN433uv`) — `LATE_API_KEY_ARTSVILLE`
- **Campaigns table** (`tbl4S3vdDR4JgBT1d`): has `Brand` linked record field
- **Posts table** (`tblyUEPOJXxpQDZNL`): linked to campaigns (indirect brand scoping)

### User-Brand Assignments (from memory, not yet in any system)

| User | Email | Role | Brands |
|------|-------|------|--------|
| Juergen | juergen@polymash.com | super-admin | ALL brands |
| Scott | scottpower@arterial.org | admin | Arterial.org, Artsville USA, Not Real Art |
| Kirsten | kbviking@gmail.com | curator | Not Real Art |
| Morgan | editor@notrealart.com | curator | Artsville USA, Not Real Art |
| Elise | (TBD) | curator | Artsville USA |

### Vercel
- Already deployed at `https://app.polywiz.polymash.com`
- Not configured with per-brand env vars yet
- Not tested with multi-user auth

## Issue #42: User-Brand Access Mapping

### Goal
Create an Airtable Users table that maps each user to their allowed brands. Integrate with the auth session so API endpoints can check access.

### Steps
1. **Create Users table via Airtable Meta API** (`POST /v0/meta/bases/{baseId}/tables`):

   | Field | Type | Purpose |
   |-------|------|---------|
   | Email | Single line text | Login email (matches AUTH_USERS) |
   | Display Name | Single line text | Shown in UI |
   | Role | Single select | super-admin / admin / curator / viewer |
   | Brands | Link to Brands | Which brands this user can access |
   | Default Brand | Link to Brands | Brand to select on login |

2. **Seed with initial user records** (5 users from table above)

3. **Update `src/auth.ts`** — On login (authorize callback or jwt callback), look up the user's email in the Users table. Add to the JWT/session:
   - `allowedBrandIds: string[]` — from the Brands linked records
   - `defaultBrandId: string | null` — from Default Brand
   - `role: string` — from the Users table (overrides AUTH_USERS role)

4. **Update session type** in `src/auth.ts` — extend Session interface with `allowedBrandIds` and `defaultBrandId`

5. **Update `src/app/api/brands/route.ts`** — Filter returned brands by `session.allowedBrandIds`. Super-admin sees all.

6. **Passwords stay in `AUTH_USERS` env var** — only brand mapping in Airtable

### Key files to read
- `src/auth.ts` — NextAuth config, JWT callbacks, session extension
- `src/middleware.ts` — route protection
- `src/app/api/brands/route.ts` — brands endpoint to scope
- `src/lib/airtable/client.ts` — for Users table CRUD

### Decision made
Passwords in env vars (secure, users rarely change). Brand access in Airtable (adjustable without redeploy).

---

## Issue #43: Brand-Scoped API Endpoints

### Goal
API endpoints should only return data the logged-in user has access to. Campaigns and posts for unauthorized brands should be invisible.

### Depends on: #42 (session must include allowedBrandIds)

### Steps
1. **Create a helper** `getUserBrandAccess(session)` that returns `{ brandIds: string[], isSuperAdmin: boolean }` from the session

2. **Scope these endpoints:**

   | Endpoint | Current | Change |
   |----------|---------|--------|
   | `GET /api/brands` | All active brands | Filter by `allowedBrandIds` |
   | `GET /api/campaigns` | All campaigns | Filter by campaigns whose Brand is in `allowedBrandIds` |
   | `POST /api/campaigns` | Creates for any brand | Validate brand is in `allowedBrandIds` |
   | `GET /api/campaigns/[id]` | Any campaign | 403 if campaign's brand not authorized |
   | `POST /api/campaigns/[id]/generate` | Any campaign | 403 if not authorized |
   | `GET /api/auto-auth` | Returns key for any brand | Validate brandId is in `allowedBrandIds` |

3. **Campaigns filtering**: Campaigns have a `Brand` linked record field. Fetch all, filter server-side by checking `campaign.brandIds` against `session.allowedBrandIds`. (Same pattern as Generation Rules fix — Airtable linked record filtering is unreliable.)

4. **Posts filtering**: Posts link to Campaigns, not directly to Brands. Either:
   - Join through campaigns to check brand access, or
   - Add a Brand field to Posts table for direct filtering (recommended for performance)

### Key files to read
- `src/app/api/campaigns/route.ts` — campaign list + create
- `src/app/api/campaigns/[id]/route.ts` — campaign detail
- `src/app/api/campaigns/[id]/generate/route.ts` — generation pipeline
- `src/app/api/auto-auth/route.ts` — Zernio key endpoint

---

## Issue #44: Persistent Brand Switching

### Goal
Brand selection should survive page refreshes and be restored on next login.

### Depends on: #42 (default brand from user profile)

### Steps
1. **Store selected brand in a cookie or localStorage** — when `switchBrand()` is called, persist the selection. Cookie is preferred (accessible server-side for SSR).

2. **BrandProvider reads persisted selection on mount** — check cookie/localStorage before falling back to auto-select logic.

3. **Default brand on first login** — read `defaultBrandId` from session (populated by #42 from Users table). Use this when no persisted selection exists.

4. **BrandProvider only shows allowed brands** — read `session.allowedBrandIds` and filter the brands list. This is the enforcement layer on the client side.

5. **Update `src/lib/brand-context.tsx`:**
   - Import `useSession()` from next-auth
   - Filter `brands` by `session.allowedBrandIds` (if not super-admin)
   - On mount: check cookie → check session.defaultBrandId → fall back to first allowed brand
   - On `switchBrand()`: persist to cookie

### Key files to read
- `src/lib/brand-context.tsx` — BrandProvider (currently React state only)
- `src/auth.ts` — session shape
- `src/app/dashboard/layout.tsx` — header brand switcher

### Brand Switch Flow (target)
```
Page load → BrandProvider mounts
  → Read cookie for last selected brandId
  → If cookie has valid brandId in allowedBrandIds → use it
  → Else if session.defaultBrandId → use it
  → Else → first allowed brand
  → Set brand, fetch data

User clicks brand switcher → switchBrand(brandId)
  → Validate brandId is in allowedBrandIds
  → Persist to cookie
  → Update BrandContext
  → Invalidate all React Query caches
  → auto-auth returns new Zernio key
  → All hooks re-fetch with new brand
```

---

## Issue #45: Vercel Deployment

### Goal
Deploy to Vercel with all per-brand env vars and multi-user auth working.

### Depends on: #41 (done), #42, #43, #44

### Steps
1. **Add env vars to Vercel** (Settings → Environment Variables):
   - `LATE_API_KEY_INTERSECT`, `LATE_API_KEY_SUGAR_PRESS`, `LATE_API_KEY_NRA`, `LATE_API_KEY_ARTSVILLE`
   - `SHORT_IO_KEY_INTERSECT`, `SHORT_IO_KEY_ARTERIAL`
   - `SHORT_IO_API_KEY`, `SHORT_IO_DOMAIN`
   - `ANTHROPIC_API_KEY`, `ANTHROPIC_KEY_INTERSECT`
   - `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`
   - `FIRECRAWL_API_KEY`
   - `AUTH_SECRET`, `AUTH_USERS` (all team members with passwords)
   - `NEXT_PUBLIC_APP_URL=https://app.polywiz.polymash.com`
   - `AUTH_TRUST_HOST=true`

2. **Verify build** — `npm run build` locally first

3. **Push to trigger Vercel deploy** (auto-deploys from main)

4. **Test each user login:**
   - Juergen → sees all 4 brands
   - Scott → sees Artsville USA, Not Real Art (Arterial inactive)
   - Kirsten → sees Not Real Art only
   - Morgan → sees Artsville USA, Not Real Art

5. **Verify brand switching** — accounts, campaigns, calendar refresh per brand

6. **Optional:** Set up custom domain `polywiz.polymash.com`

### Pre-deployment checklist
- [ ] All per-brand API keys in Vercel env vars
- [ ] AUTH_USERS includes all team members with real passwords (not REDACTED_PASSWORD!)
- [ ] Users table seeded with brand assignments
- [ ] Brand records have correct zernioApiKeyLabel values
- [ ] Test build passes locally
- [ ] Test login as each user role

---

## Implementation Order

```
#42 (Users table + session)
  → #43 (scoped APIs — needs session.allowedBrandIds)
  → #44 (persistent switching — needs session.defaultBrandId)
  → #45 (Vercel deploy — needs all of the above)
```

#42 is the foundation. #43 and #44 can be done in parallel after #42. #45 is last.

## What Stays in Code (Do Not Move to Airtable)
- User passwords (in AUTH_USERS env var)
- API key values (in env vars)
- Auth middleware logic
- Brand switching UI component

## What Lives in Airtable
- User-to-brand mapping (Users table)
- Brand records with API key labels
- Default brand per user

## Key Files to Read First

| File | Why |
|------|-----|
| `src/auth.ts` | NextAuth config — where session gets extended with brand access |
| `src/lib/brand-context.tsx` | BrandProvider — needs session integration + persistence |
| `src/app/api/brands/route.ts` | First endpoint to scope by user access |
| `src/app/api/campaigns/route.ts` | Campaign list needs brand filtering |
| `src/app/api/auto-auth/route.ts` | Zernio key endpoint needs access validation |
| `src/middleware.ts` | Route protection — may need brand-level checks |
| `.env.local` | All API keys and AUTH_USERS |
| GitHub issues #42, #43, #44, #45 | Full specs with acceptance criteria |
