# Design Page — Motif-Anchored UX — Design

Date: 2026-08-31

A restructuring of the Design tab's interaction model, driven by tablet use.
Today every control that acts on a motif lives in a permanent full-width band
far from the motif itself: drawing tools in the top cloth bar, transforms in a
floating inspector, search above the canvas, cards below it. The result is that
the canvas — the actual working surface — is squeezed between chrome, and every
edit is a round trip to the top of the screen and back.

This spec moves per-motif controls **onto the motif**, collapses rarely-used
project settings **behind a disclosure**, and gives the canvas the reclaimed
space.

## The organising principle

> The canvas is the app. Everything else is either anchored to the thing it
> acts on, or one tap behind a control that names it.

Controls sort into four kinds by how often they are touched:

| Kind | Frequency | Home |
| --- | --- | --- |
| Per-motif actions (rotate, flip, duplicate, delete) | constantly | floating bar on the motif |
| Per-motif detail (name, cm size, DMC colors, repeat) | occasionally | behind `⋯` on that bar |
| Canvas modes (pen, eraser, undo, zoom, border) | per session | small persistent corner cluster |
| Project setup (cloth, size, strands) | once per piece | collapsed behind a disclosure |

## Goals

1. **Floating motif bar** — a real DOM toolbar anchored to the selected area's
   bounding box, holding rotate / flip / duplicate / delete / `⋯`, following the
   motif as it moves.
2. **Inspector behind `⋯`** — the residual detail panel (name, size, colors,
   repeat modes) stops auto-opening on every selection; it opens on request, as
   a bottom sheet on narrow viewports and a floating panel on wide ones.
3. **Canvas settings collapsed** — the `design-clothbar` band reduces to
   `← back · name · ▾`, with cloth / size / strands / *Fit to content* moving
   into a sheet that is closed by default.
4. **Canvas mode cluster** — pen, eraser, undo, zoom and border move into one
   compact corner cluster on the canvas, replacing the top-bar `design-tools`
   and the `design-canvas-foot` band.
5. **Search below the canvas** — the filter bar moves to sit directly above the
   pattern cards it filters, so query and results are visible together.
6. **A real tablet breakpoint** — iPad portrait (768–834pt) currently lands in
   rules written for phones; it gets a layout of its own.

## Non-Goals

- No change to the engine, planner, storage model, or the composite/plan path.
- No change to `Area` / `Design` data shapes. This is presentation only.
- No new transforms. The bar exposes actions that already exist
  (`rotateGroup`, `flipX`/`flipY`, `duplicateAreas`, area deletion).
- No redesign of the pattern cards or the filter controls themselves — the
  filter bar moves, its contents stay as they are.
- No global i18n change; bilingual labels keep the existing `labelAr` +
  `dir="rtl"` convention.

## Decisions taken during brainstorming

Three points were settled explicitly with the user and are load-bearing:

- **Undo is not on the motif bar.** Undo is global — `popUndo`
  (`DesignTab.tsx:2252`) reverses the last edit whatever it was, including the
  creation or deletion of the very motif whose bar would host the button.
  Putting it on a per-motif bar would imply "undo this motif's last change",
  which is not the semantics. Undo lives in the canvas corner cluster, where it
  is always reachable and always means one thing.
- **Pen and eraser are canvas modes, not motif actions.** They are armed before
  touching anything and paint wherever the pointer goes, so they belong to the
  canvas, not to a selection. They join the corner cluster.
- **The bar's budget is five slots.** Rotate, flip, duplicate, delete, `⋯`.
  Anything beyond that occludes the motif it is attached to, which defeats the
  purpose.

## Changes by area

### 1. `MotifBar` (new — `src/ui/MotifBar.tsx`)

A positioned DOM element inside `.design-canvas-wrap`, **not** drawn into the
canvas bitmap. Using real `<button>`s rather than canvas hit-testing buys
44pt tap targets, focus rings, `aria-label`s and keyboard access for free — and
removes a class of "I missed it by three pixels" errors that the current
canvas-drawn controls are prone to on touch.

```
        ┌─ ↺   ⇄   ⧉   ⌫   ⋯ ─┐
   ╭────┴──────────────────────┴────╮
   │        selected motif          │
   ╰────────────────────────────────╯
```

Interface:

```ts
interface MotifBarProps {
  /** Selection bounding box in canvas pixels, or null when nothing is selected. */
  box: { x: number; y: number; w: number; h: number } | null;
  /** Canvas viewport size, for clamping. */
  viewport: { w: number; h: number };
  /** Hidden mid-gesture so the bar never chases a dragging finger. */
  hidden: boolean;
  onRotate: () => void;
  onFlip: (axis: 'x' | 'y') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}
```

**Positioning** is a pure function, extracted so it can be unit-tested without
a DOM:

```ts
/**
 * Place the bar just outside a selection box, preferring above. Flips below
 * when the box is too near the top edge, and clamps horizontally so the bar
 * never leaves the viewport.
 */
export function placeMotifBar(
  box: { x: number; y: number; w: number; h: number },
  bar: { w: number; h: number },
  viewport: { w: number; h: number },
): { left: number; top: number; placement: 'above' | 'below' }
```

Rules, in order:

- Prefer `above`: `top = box.y - bar.h - GAP`.
- If that is `< 0`, use `below`: `top = box.y + box.h + GAP`.
- If *both* would clip (a motif taller than the viewport), pin to `above` at
  `top = 0` — the bar stays reachable rather than disappearing.
- Horizontally centre on the box, then clamp to `[0, viewport.w - bar.w]`.

**Multi-selection** anchors to the union box, and every action applies to the
whole selection. This matches how `rotateGroup` and the existing flip handler
(`DesignTab.tsx:2508`, inside the inspector wiring) already behave, so the semantics carry over unchanged.

**During gestures** (`interactionRef.current != null`, or an active pinch) the
bar is hidden. It reappears on pointerup at the motif's new position.

### 2. Canvas-drawn controls removed (`src/ui/DesignTab.tsx`)

Two hit-test blocks in `onPointerDown` are deleted, along with their draw code
and the constants that serve them:

- the delete (`×`) button hit test (`:1236`) and `DELETE_R` / `DELETE_R_TOUCH` (`:658`)
- the rotate-handle hit test (`:1256`) and `overRotateHandle` (`:869`) /
  `HANDLE_HIT_MOUSE` / `HANDLE_HIT_TOUCH` (`:655`)

Both actions are now buttons on `MotifBar`. This removes the `'rotate'`
interaction kind and simplifies `onPointerDown`'s priority ladder, which
currently has to consider two invisible circular targets before it can decide
whether a press is a move, a pan, or a marquee.

The border-edge grab (`borderEndAt`) **stays** — it is a direct-manipulation
resize with no toolbar equivalent.

### 3. Inspector extraction (`src/ui/AreaInspector.tsx` — new)

`AreaInspector` is currently defined inline in `DesignTab.tsx` (`:2891`). It moves to its
own file unchanged in behavior, because two different shells now render it:

- **wide (≥1100px)** — the existing floating panel over the canvas corner
- **narrow / tablet** — a bottom sheet, draggable between peek and full height

Its transform chips (`:2963`, `:3036`) are removed, since those four actions are
now on `MotifBar`. What remains is name, cm size, the DMC color list with
recolor, repeat modes, and the *Plan this area* action.

It no longer auto-opens on selection. `inspectorVisible` becomes explicit state
set by the `⋯` button and cleared by the sheet's close.

### 4. Canvas settings sheet (`src/ui/DesignTab.tsx`, `ClothBar`)

`design-clothbar` collapses from a full-width band to a single thin row:

```
 ←  Ramallah panel ▾                          ⌫ ↺  ⊞   ?
 ╭──────────────────────────────────────────────────────╮
 │                        canvas                        │
```

Back, the editable name, and a `▾` disclosure. The disclosure opens a **Canvas
settings** sheet holding what the expanded `ClothBar` form holds today: cloth
select, width/height with the cm/in/stitch unit switch, strands, and *Fit to
content*. Same fields, same state, same `onChange` — relocated into the sheet
shell that the `⋯` inspector already needs, and closed by default.

*Fit to content* is a judgement call: it is arguably a working action rather
than a setup one, but it is rare and it acts on the **canvas**, so it sits with
the other canvas properties. Trivial to promote to the corner cluster if it
turns out to be reached for often.

### 5. Canvas mode cluster (`src/ui/DesignTab.tsx`)

`toolsNode` (`:2183`) is removed from the top bar and `design-canvas-foot`
(`:2466`) is removed from below the canvas. Their live contents merge into one
compact cluster pinned to a canvas corner:

- pen (with its color swatches and DMC picker, unchanged)
- eraser
- undo
- zoom out / level / in / fit
- border toggle

The `design-canvas-hint` paragraph (`:2497`) is dropped. It explains the gesture
model in prose that is only read once; the discoverable version is the help
sheet already reachable from `?`.

### 6. Filter bar relocation (`src/ui/DesignTab.tsx`)

The `design-filterbar` block (`:2286`) moves from above the canvas to directly
above `design-motif-strip`, below it. Contents unchanged. This collapses two
bands into one region and puts the query next to the results it produces.

### 7. Responsive layout (`src/styles.css`)

Current breakpoints are 1100 / 900 / 600px, so an iPad in portrait
(768–834pt) falls into rules written for phones and mostly just wraps the cloth
bar. Add a tablet range:

- **≥1100px** — as today: floating inspector panel, floating motif bar.
- **768–1099px (tablet)** — motif bar floats; inspector and canvas settings
  become bottom sheets; corner cluster gains larger hit targets; canvas takes
  the full remaining height with filters and strip scrolling beneath.
- **<768px** — as tablet, with the cluster wrapping to two rows.

All interactive targets in the bar and cluster are ≥44×44pt on touch pointers.

## Testing

**Unit (`src/ui/motifBar.test.ts`)** — `placeMotifBar` is pure and gets real
coverage: prefers above; flips below near the top edge; pins when both would
clip; clamps left and right; centres on the union box for a multi-selection.

**Manual** — the pointer choreography (press-hold to move, pan, pinch-zoom,
tap-to-place an armed motif) is not meaningfully unit-testable and is verified
by running the app at iPad-portrait and iPad-landscape viewport sizes. The
specific regressions to watch, since this spec touches `onPointerDown`'s
priority ladder:

- press-hold on a motif still promotes to a move, and an early drag still pans
- pinch-zoom never moves a motif
- an armed library motif still places on a plain tap
- border-end drag still resizes along the tiling axis
- the bar does not chase the finger during a move, and reappears correctly

The existing suite (`npm test`) and `npm run typecheck` must stay green; the
deploy workflow gates on both.

## Risks

- **`DesignTab.tsx` is 3209 lines.** This spec removes code from it (tools node,
  canvas foot, two hit tests, the inspector) but the file stays large. The
  `AreaInspector` extraction is the one restructuring included, and only because
  two shells need it. Further decomposition is deliberately out of scope so the
  UX change stays reviewable.
- **Sheet vs. panel duplication.** If the two shells drift, the inspector will
  behave differently by viewport. Mitigated by keeping `AreaInspector` a single
  presentational component that neither shell forks.
- **Gesture regressions.** The priority-ladder simplification is the riskiest
  edit here; the manual checklist above exists for it.
