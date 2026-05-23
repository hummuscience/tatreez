# Design workspace — spec

**Date:** 2026-05-23
**Status:** Approved for planning

## Goal

Add a new **Design** tab where the user composes a full piece: choose cloth and
finished dimensions (in cm), then drag patterns from the library onto a
cloth-sized stitch grid. The user can label rectangular **areas** of the design,
filter the library to patterns that fit the active area, and optionally fill an
area by repeating one motif. Each area is planned independently using the
existing Plan tab.

This turns the app from a single-motif planner into a whole-piece composer while
reusing the existing library, cloth math, and planning engine unchanged.

## Mental model

A **Design** is a cloth-sized stitch grid (same coordinate system as the editor)
containing a set of **Areas**. An area is a labeled rectangle holding placed
motifs and/or one repeating motif. **Areas are the unit of planning** — each area
derives into a normal `Pattern` and is planned on its own. Loose motifs dropped
outside any area auto-wrap into their own area, so everything is always plannable.

A design is never planned as one giant whole-cloth pattern; planning is always
per-area, matching how a thobe is stitched panel-by-panel.

## Data model

New module `src/project/design.ts`:

```ts
import type { ColorIndex } from '../engine/types';

interface PlacedMotif {
  /** Library reference (builtin / saved / tirazain key) for provenance. */
  patternKey: string;
  /** Snapshot of the motif's cells, already remapped to the design palette. */
  cells: ColorIndex[][];
  /** Top-left position within the owning area, in grid cells. */
  x: number;
  y: number;
}

type RepeatMode = 'horizontal' | 'grid';

interface AreaRepeat {
  mode: RepeatMode;
  patternKey: string;
  /** Motif cells remapped to the design palette. */
  cells: ColorIndex[][];
}

interface Area {
  id: string;
  name: string;
  /** Top-left on the design grid, in cells. */
  x: number;
  y: number;
  /** Size in cells. */
  w: number;
  h: number;
  motifs: PlacedMotif[];
  /** When present, the area is filled by repeating one motif. */
  repeat?: AreaRepeat;
}

interface Design {
  id: string;
  name: string;
  clothId: string;          // CLOTH_OPTIONS id
  strandsId: string;        // STRAND_OPTIONS id
  widthCm: number;
  heightCm: number;
  /** Derived grid size, stored for stability if cloth changes later. */
  gridW: number;
  gridH: number;
  areas: Area[];
  /** Merged design palette: index 0 = null (empty), 1..N = hex strings. */
  palette: (string | null)[];
}
```

### Derived values (pure functions in `design.ts`)

- `cmToCells(cm, cloth): number` — `Math.round(cm / 2.54 * cloth.count)`.
- `compositeArea(area, palette): Pattern` — allocate a `w×h` grid of `0`; paint
  each `PlacedMotif` at its `(x, y)`; if `repeat` is set, tile the repeat motif
  (see Repeat fill). Returns a `Pattern` with `name = area.name`, the design
  `palette`, the area's `w/h`, and no `source`. This is what the Plan tab consumes.
- `mergePalette(designPalette, motifPalette): { palette, indexMap }` — dedupe by
  case-insensitive hex; returns the new palette and an `indexMap` from the motif's
  local color indices to design indices (index 0 → 0 always).

## Palette merge

When a motif is placed (or set as a repeat), its palette folds into the design
palette via `mergePalette`. The motif's `cells` are remapped through `indexMap`
**at placement time** and stored remapped, so `compositeArea` is a straight copy
with no per-cell lookups. Identical hex values across motifs collapse to one
design color, so per-color batching in the Plan tab spans every motif in an area.

## Repeat fill

Per-area, optional. Inspector toggles repeat on and chooses mode:

- **horizontal**: tile the motif left-to-right in a single row; vertical extent is
  the motif height (anchored at the area's top).
- **grid**: tile the motif across and down to fill the rectangle.

Only **whole** copies are placed. Remainder cells are left empty and reported as a
label in the inspector, e.g. `fits 7× across, 5 cells left`. No clipping, no
stretching. Tiling count: `floor(area.w / motif.w)` across,
`floor(area.h / motif.h)` down (down = 1 for horizontal mode).

When `repeat` is set, the area ignores free `motifs` for compositing (repeat wins);
the UI hides free-placement for a repeating area to avoid ambiguity.

## Layout

New `src/ui/DesignTab.tsx`, three columns:

```
┌─ Library (filtered) ─┬──────── Design canvas ────────┬─ Inspector ─┐
│ search + filters     │  cloth-sized stitch grid       │ Design:     │
│ [fits active area]   │  • areas = labeled dashed rects │  cloth/cm   │
│ pattern cards        │  • placed motifs rendered       │  → grid WxH │
│ (drag source)        │  • drag-select → new area       │ Area: name, │
│                      │  • active area highlighted      │  size, plan │
│                      │                                 │  repeat ▸   │
└──────────────────────┴────────────────────────────────┴─────────────┘
```

- **Library column**: reuse the existing LibraryTab card/filter UI by extracting a
  presentational `PatternBrowser` component (search, region/color/size/complexity
  filters, paged cards). Add one filter: **"fits active area"** →
  `w <= area.w && h <= area.h`. Cards are HTML5 drag sources
  (`draggable`, `dataTransfer` carries the patternKey).
- **Canvas**: one `<canvas>` sized to the design grid using existing `canvasUtil`
  (`cellSize`, `drawGridLines`, `drawPatternBackground` per area composite).
  Areas drawn as dashed rectangles with a name label; the active area is
  highlighted. Renders placed motifs and repeat tiles.
- **Inspector**: top = design setup (cloth/strands/cm selectors mirroring PlanTab's
  Project Setup, recomputing `gridW/gridH`); bottom = selected-area details (name,
  size, repeat mode + fit report, "Plan this area" button, delete).

## Interactions

- **Make area**: pointer drag-select on empty canvas → name prompt → `Area` created
  (snapped to cells), becomes active.
- **Place motif**: with an active area, drag a library card onto the canvas
  (HTML5 drop). Snaps to the cell under the cursor, clamped so the footprint stays
  inside the area. Dropping outside any area auto-wraps a new area sized to the
  motif (named from the pattern), which becomes active.
- **Move/delete motif**: click a placed motif to select; pointer-drag to move
  within its area; Delete/backspace or an inspector button removes it.
- **Repeat fill**: inspector toggle → choose horizontal/grid. The repeat motif is
  the area's first placed motif if one exists; otherwise the next library card
  dragged onto the area becomes the repeat motif. Tiling shows the fit report.
- **Plan area**: "Plan this area" calls `compositeArea` and routes to the Plan tab
  with the resulting `Pattern` (see Cross-tab wiring). Plans one area at a time.
- **Resize/rename/merge areas**: rename + numeric w/h in inspector; merge is
  out of v1 scope (see Out of scope).

## Cross-tab wiring

App gains a `'design'` tab. PlanTab is unchanged — it already takes
`state: PatternState` (`{ pattern, patternKey }`). "Plan this area" reuses the
existing `loadAndShowPlans(pattern, key)` flow: set state to the area composite
`Pattern` (with `patternKey: null`) and switch to the Plan tab. No engine or
PlanTab changes.

Designs are saved to their own list in storage (parallel to saved patterns):
`saveDesign` / `listDesigns` / `deleteDesign` in `src/storage/storage.ts`, keyed
`design:<id>`, serialized as plain JSON. The Design tab opens with a design list
(new / load / delete) then the composer.

## Testing

Unit tests (vitest), no DOM needed for the core:

- `cmToCells` — known conversions (20cm @ Aida-14 → 110 cells; rounding).
- `mergePalette` — dedupe identical hex; case-insensitive; index 0 preserved;
  `indexMap` correctness; disjoint palettes concatenate.
- `compositeArea` — single motif painted at offset; two motifs; out-of-bounds
  motif clamped/ignored; empty area → all zeros.
- Repeat fill — horizontal count = `floor(w/mw)`, leftover reported; grid count in
  both axes; motif larger than area → 0 copies, full remainder; exact fit → 0
  leftover.
- Storage round-trip — `saveDesign`→`listDesigns` returns an equal `Design`.

UI wiring (DesignTab, drag/drop, canvas rendering) verified manually in the
browser; not unit-tested, consistent with EditorTab/PlanTab.

## Out of scope (v1)

- Manual recolor-on-drop (mapping a motif's colors to chosen design colors).
- Whole-cloth single plan across all areas.
- Area merging/splitting and overlap resolution (areas may overlap visually; each
  plans from its own composite independently).
- Auto-tiling that clips or stretches motifs.
- Arabic names (`nameAr`) for areas/designs.
```
