# Designer & Library Improvements — Design

Date: 2026-06-02

A batch of seven independent UI/UX improvements from user feedback, spanning the
Design tab, the shared canvas helpers, the Library tab, and the app shell. Each
is small and self-contained; they share no state and can be implemented in any
order.

## Goals

1. **Eraser snaps area to content** — after erasing cells in the Designer, the
   owning area rectangle shrinks to hug the remaining painted stitches.
2. **Move only via Select tool** — dragging an existing area to reposition it
   requires the Select tool; Pen/Eraser paint instead of grabbing.
3. **Major + minor grid lines** — major lines every 10 stitches, darker and
   thicker than the 1-stitch minor lines.
4. **Bilingual buttons** — Designer buttons show English with Arabic underneath
   (stacked), matching the app's existing `dir="rtl"` label style.
5. **Full-width canvas, gallery below** — the canvas spans the page width; the
   search/filter bar and pattern thumbnails move into a full-width strip below
   the canvas. The per-area inspector stays on the right.
6. **Library "Other" category** — motifs matching no subject category fall into
   an explicit "Other" bucket so none are unreachable under category filters.
7. **Contact footer** — a persistent app footer inviting email suggestions to
   `muad.abdelhay@gmail.com`, in English + Arabic.

## Non-Goals

- No global language toggle / i18n framework. Bilingual labels are static,
  following the existing per-string `labelAr` + `dir="rtl"` convention.
- No change to the engine, planner, or storage model.
- No change to the Editor/GroundTruth/Import tabs beyond the shared
  `drawGridLines` signature being extended (their behavior is unchanged).

## Changes by area

### 1. Eraser → snap area to content (`src/project/design.ts`, `src/ui/DesignTab.tsx`)

Add a pure helper:

```ts
/**
 * Trim an area to the bounding box of its painted cells, shifting x/y so the
 * remaining stitches stay fixed on the global design grid while w/h shrink.
 * Returns null if the area has no painted cells (caller should delete it).
 */
export function refitAreaToContent(area: Area): Area | null
```

It computes the painted bounding box across the area's motifs (and repeat, if
any), offsets each motif's local position by the box's top-left, trims the
cells, and returns a new area with updated `x += boxLeft`, `y += boxTop`,
`w = boxW`, `h = boxH`. An all-empty area returns `null`.

Wiring: in the Designer pointer-up handler, when the gesture was an eraser
stroke (`toolRef.current === 'eraser'`), refit the area(s) touched by the
stroke. Removed-to-empty areas are dropped from `design.areas`. The whole
refit is folded into the same single undo entry as the erase stroke (re-fit on
*stroke end*, not per cell, so the outline settles once).

Tests in `src/project/design.test.ts`: refit shrinks bounds and preserves
stitch positions; fully-erased area returns null; area with margin on one side
only shifts the correct axis.

### 2. Move only via Select tool (`src/ui/DesignTab.tsx`)

The pointer-down branch that begins an area drag-move is currently reached in
any tool. Gate the **drag-start** on `toolRef.current === 'select'`. Tapping an
area to *select* it remains allowed in any tool (so the inspector still reflects
what you touched); only initiating a move requires Select. This mirrors commit
`50c645a`, which already gated the marquee on the Select tool.

### 3. Major + minor grid lines (`src/ui/canvasUtil.ts`, `src/ui/DesignTab.tsx`)

Extend the shared helper with an optional options object (default off → existing
callers unaffected):

```ts
export function drawGridLines(
  ctx, cs, gridW, gridH,
  color = 'rgba(0,0,0,0.1)',
  opts?: { major?: number; majorColor?: string; majorWidth?: number },
): void
```

When `opts.major` (e.g. 10) is set, lines whose index is a multiple of `major`
are drawn with `majorColor` (default `rgba(0,0,0,0.22)`) at `majorWidth`
(default 2); all other lines use `color` at width 1. Implementation draws minor
lines first, then major lines on top so intersections read cleanly. Only the
Design tab passes `{ major: 10 }`; Editor/GroundTruth/Import keep calling it
without the option.

### 4. Bilingual buttons (`src/ui/DesignTab.tsx`, `src/styles.css`)

The Designer's drawing-tool buttons (Select, Pen, Eraser, Border) and the
view/action buttons render an Arabic sub-label beneath the English, using the
existing pattern (`<span dir="rtl" className="...-ar">`). Arabic terms:

| English | Arabic |
|---------|--------|
| Select  | تحديد  |
| Pen     | قلم    |
| Eraser  | ممحاة  |
| Border  | حاشية  |
| Fit     | ملاءمة |
| Patterns | الأنماط |

A small CSS rule stacks the two lines (English normal, Arabic smaller/muted).
No language state; both always shown.

### 5. Full-width canvas + gallery below (`src/ui/DesignTab.tsx`, `src/styles.css`)

Restructure the `design-composer` body. Today it is a 3-column flex row:
`[motif gallery | canvas | inspector]`. New layout:

```
┌─────────────────────────────────────────────┬───────────────┐
│  canvas (full remaining width)               │  inspector    │
│                                              │  (per-area)   │
├──────────────────────────────────────────────┴──────────────┤
│  filter/search bar  +  pattern thumbnail gallery (full width)│
└──────────────────────────────────────────────────────────────┘
```

- The canvas (`design-canvas-wrap`) grows to fill the width left of the
  inspector.
- The left motif column (`design-motif-col`), the `design-filterbar`, and the
  pattern thumbnails (`design-motif-strip` / library cards) move into a new
  full-width block **below** the canvas+inspector row.
- The right inspector (`design-inspector`) stays as a side panel.

This is JSX reordering inside `design-composer` plus CSS: the composer becomes a
vertical stack whose first child is the `[canvas | inspector]` row and whose
second child is the full-width gallery strip. The "show patterns" toggle now
shows/hides the bottom strip.

### 6. Library "Other" category (`src/ui/patternFilters.ts`, `src/ui/LibraryTab.tsx`, `src/ui/DesignTab.tsx`)

Introduce an `'other'` category for motifs matching no subject rule.

- `Category` type gains `'other'`.
- A helper `categoriesOfWithOther(p): Category[]` (or extend `categoriesOf`'s
  consumers) returns `['other']` when `categoriesOf(p)` is empty, else the
  matched list.
- `CATEGORY_FILTERS` appends `['other', 'Other', 'أخرى']` so the chip renders
  last.
- LibraryTab's per-entry `cats` and its count map use the with-other variant, so
  selecting "Other" surfaces exactly the previously-unreachable motifs. The
  Designer's category chips share the same list.

Decision: "Other" is computed (not stored) — it's purely "matched nothing",
keeping it in sync as keyword rules evolve.

### 7. Contact footer (`src/App.tsx`, `src/styles.css`)

A small footer at the app shell level, visible on all tabs:

> Have a suggestion? Email us: **muad.abdelhay@gmail.com**
> هل لديك اقتراح؟ راسلونا

with a `mailto:muad.abdelhay@gmail.com` link. Minimal CSS (muted, centered,
small). The Arabic line uses `dir="rtl"`.

## Risks / edge cases

- **Refit on erase** must not move stitches — only shrink the box. Covered by
  tests asserting global cell positions are preserved.
- **Major grid lines** at non-integer `cs` (fractional cell size) can look
  slightly soft; acceptable, matches existing minor-line rendering.
- **Layout reflow**: moving the gallery below changes vertical space budget; the
  canvas height calc (`displayedCanvasH`) and zoom-to-fit must be re-checked so
  the canvas still fits without the left column eating width.

## Testing

- Unit: `refitAreaToContent` (new), unchanged `categoriesOf` plus the
  with-other wrapper.
- Manual / visual: grid major lines every 10; bilingual buttons; full-width
  canvas with gallery below; "Other" chip surfaces uncategorized motifs; footer
  mailto link; eraser-then-snap; move blocked under Pen/Eraser.
