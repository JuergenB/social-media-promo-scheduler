# Cover Generator picker UI — design critique

**Scope:** the story picker and "selected story" surfaces on `/dashboard/tools/cover-generator`, as captured in [`cover-generator-issue-192-2026-04-28.png`](./cover-generator-issue-192-2026-04-28.png) and implemented in [`src/app/dashboard/tools/cover-generator/page.tsx`](../../src/app/dashboard/tools/cover-generator/page.tsx) lines 2262–2326.

**Author's stance:** honest critique requested. I'm not going to pad with both-sides hedging.

---

## 1. The heavy-black selection border on grid cards is wrong

The picked cards use `border-foreground bg-foreground/10 ring-2 ring-foreground` — a 1px black border, a 2px black ring outside that, and a translucent black wash. On a cream/white panel against a 2-column grid of 6+ cards, the result is exactly what the screenshot shows: four black blocks visually punching out of the panel and pulling all attention away from the canvas below. The picker stops feeling like a control surface and starts feeling like a results display.

The standard pattern for "selected" state in a multi-select gallery — Pinterest, Notion's media picker, Figma's asset libraries, Linear's filter pickers — is one of: a thin accent-colored border (1px, brand color, no ring), a checkmark badge in the corner of the thumbnail, or a subtle shadow/elevation lift. Heavy black borders are the pattern for **destructive confirm** ("delete this?") or **error state**, not "I picked this story." A user scanning this panel would reasonably wonder if the four blackened cards are flagged as problems. The contrast difference between picked and unpicked is so high that it actively encourages the user to deselect, because deselecting visually "cleans up" the panel — that's the opposite of the intended affordance.

**Recommendation:** drop the ring entirely, swap the foreground border for a 2px Polymash blue border (`border-primary`), drop the foreground bg wash to either nothing or a 4–5% accent tint, and add a small filled checkmark circle in the top-right corner of the thumbnail. The picked state should feel additive, not punitive.

## 2. The Selected-story row + grid + clear-link is three controls doing one job

Right now the panel surfaces the selection state in three different places: (a) the draggable "Selected story order" row at the top, (b) the toggleable grid below it where the same 4 stories are also rendered with the heavy black treatment, (c) the "clear story picks (4/4)" link in the toolbar. Three components. Same underlying data. Three different visual languages — pills with × buttons, gallery cards with rings, an underlined text link. A user who picks a story sees it appear in two places simultaneously and has to figure out the relationship between them.

This is solvable, but the right consolidation depends on which job matters more. If **picking** is the primary act and **ordering** is occasional polish, the grid should own selection (with a lightweight selected state per #1) and the order row should only appear once order matters — for example, behind a "Reorder selected" toggle, or rendered only when the user expands a disclosure. If **ordering** is in fact load-bearing for the slide layout (positions 1–4 map to specific slots on Slide 2), then make the order row the single source of truth: render it with drag handles and × buttons as today, but in the grid, just dim picked cards to ~40% opacity with a tiny "✓ Picked #2" label corner-stamped on them — they become "already in your order, click to remove" rather than competing real estate. Either way, the redundancy is the problem; the cure is to pick a primary control and demote the other to a supporting role.

The `clear story picks (4/4)` link at the top-right is a third instance of the same data, and it's the easiest to defend: it's a bulk-action escape hatch, not a status display. I'd keep it but rewrite the label to `Clear all (4/4)` — it's a button, not a sentence — and right-align it inside whichever container ends up owning selection state, not in the toolbar two rows above the picker.

## 3. The "Slide 1 — Cover" label is too quiet for what it's labeling

`font-mono text-xs text-muted-foreground` is the typographic choice you reach for when you're labeling a debug control or a developer-facing diagnostic — it whispers. The thing it's labeling is a **1080×1350 canvas that fills half the viewport and represents the actual deliverable of the entire tool**. The label loses to the picker panel above it, the canvas adornments below it, and even the row of color-picker controls beneath the canvas. A user who scrolls down past the picker shouldn't have to hunt for where Slide 1 begins.

**Recommendation:** promote the slide label to `text-sm font-semibold text-foreground` (sans, not mono) and treat it as a section heading — `Slide 1` as the heading, `Cover · sampled bottom band` as a quieter `text-xs text-muted-foreground` subtitle below it. The mono treatment is fine for the per-control labels (`Tagline`, `Bg ◑`, `Crop`) below the canvas; those genuinely are diagnostic-style controls. The slide identity is structural — it deserves structural type weight.

## 4. Two structural notes worth flagging while we're here

**(a)** The toolbar mixes a transient status message (`· Issue 76 · 5 entries`), an error message (red text), and an action link (`clear story picks`) on the same row as the issue input and fetch button. When all three appear at once on a wide screen, the row reads as a soup. Status and error belong below the toolbar, attached to the picker panel they describe; only the action belongs adjacent to the toolbar. Right now the toolbar is doing four jobs and getting noisy.

**(b)** The grid is `grid-cols-2 md:grid-cols-3` — at typical dashboard widths this puts story cards at ~280–320px, but the cards are 16px-tall thumbnails plus a 2-line title. The cards are wider than they need to be and the thumbnails are too small to make a real visual choice between, say, two photographs. If the picker is supposed to support image-led selection (as the screenshot suggests it should be), the thumbnails should be at least 96px tall and the card layout should be image-on-top rather than image-on-left. As implemented, the picker is title-led with a thumbnail garnish — which makes the heavy-border problem in #1 worse, because the card is mostly title text and the border becomes the dominant visual element by default.

---

## Summary of recommended changes (in priority order)

1. Replace the heavy-black selection treatment on grid cards with a thin accent border + corner checkmark badge. (Highest visual ROI; touches one className.)
2. Pick a single primary control for selection state — either the grid or the order row — and demote the other. The current dual rendering creates the worst of both.
3. Promote the `Slide 1 — Cover` label from mono-xs-muted to a real section heading. The slide is a structural element, not a debug readout.
4. Move the picker status messages (`· Issue 76 · 5 entries`, error text) out of the toolbar row and attach them to the picker panel.
5. Restructure the grid card to image-top rather than image-left, with thumbnails ≥96px tall, so the picker is genuinely image-led.

None of these are blockers for shipping the issue-data fix in [#192](https://github.com/JuergenB/polywiz-app/issues/192). They're a separate UI pass that would benefit from being planned and committed independently — exactly the kind of "while I'm here" creep that the [postmortem](./session-postmortem-2026-04-28.md) calls out as a failure mode.
