# Pattern Detail Panel — Design

**Date:** 2026-05-30
**Status:** Approved for planning

## Problem

Clicking a pattern in the Library jumps straight to the Editor. There is no place
to see what a pattern *is* — its description, size, stitch count, colors, ground-truth
status — or to choose what to do with it. We want a dedicated detail view per pattern
that surfaces everything worth knowing and offers the four meaningful actions:
**Edit**, **Plan**, **Submit ground truth**, and **Add to design** (shopping-cart style).

## Behavior change

Today every library card calls `onLoad(pattern, key)` → sets App pattern state →
`navigate('editor')`. We replace this: **clicking any library card opens a slide-over
detail panel** over the library. The library stays mounted behind the panel. The panel
becomes the hub from which the user picks an action. No card click routes directly to
the editor anymore — Edit is one click away inside the panel.

Applies to all three library sections: Built-in, Tirazain Archive, Saved.

## The detail panel

A right-side slide-over (`role="dialog"`, dimmed backdrop, Esc and backdrop-click to
close). New component: `src/ui/PatternDetail.tsx`.

Content, top to bottom:

1. **Header** — large thumbnail (reuse `PatternThumb`), Latin `name`, Arabic name
   (`nameAr ?? source.arabicName`), region (`source.region`), a `GT` badge when the
   pattern has ground truth, and a `source ↗` link when `source.url` is present.
2. **Description** — free text. Hidden entirely when the pattern has no description.
3. **Details** table:
   - Chart size — `width × height`
   - Painted size — from `paintedSize(p)` (`w × h`)
   - Stitches — from `paintedCells(p)`
   - Colors — swatch chips (reuse the card's `getPaletteColors` chips) + count
   - Threads (DMC) — list of DMC `number · name` for palette colors that carry DMC
   - Ground truth — "✓ canonical" / "✓ saved" / "— none", from
     `getGroundTruth(key) || hasCanonicalGroundTruth(id)`
4. **Actions** — see below.

Stats are computed by a small pure helper `patternStats(pattern)` (new), wrapping the
existing `paintedSize` / `paintedCells` / `colorCount` / `getPaletteColors` so the panel
has a single source for the rows and the helper is unit-testable.

## Actions

Four buttons. Two primary (the common actions), two ghost.

| Button | Weight | Behavior |
| --- | --- | --- |
| **Add to design** | primary | Opens the design picker (see below). |
| **Plan** | primary | `setPattern(clone, key)` + `navigate('plans')` (existing `loadAndShowPlans`). |
| **Edit** | ghost | `setPattern(clone, key)` + `navigate('editor')` (existing `loadAndEdit`). |
| **Submit ground truth** | ghost | `setPattern(clone, key)` + `navigate('gt')`. `GroundTruthTab` already reads `state`. |

Every action clones the pattern with `clonePattern`, exactly as the card does today.
Taking an action closes the panel.

## "Add to design" handoff

`DesignTab` owns its `design` state internally and shares no "current design" with App,
so we add a lightweight handoff rather than hoisting design state.

- **New App state:** `pendingMotif: { key: string; pattern: Pattern; designId: string } | null`.
- **Add to design** opens a **design picker** modal listing `listDesigns()` plus a
  "New design" option (reusing the existing new-design form fields, or a minimal
  name+cloth+size form). On choose:
  - existing design → `pendingMotif = { key, pattern, designId }`
  - new design → create + `saveDesign` it, then `pendingMotif = { key, pattern, designId: new.id }`
  - then `navigate('design')` and close the panel.
- **`DesignTab` gains props** `pendingMotif` + a callback `onConsumedMotif`. On mount /
  when `pendingMotif` becomes set, it opens the design with id `pendingMotif.designId`
  and **auto-places the motif as a new tight area** at the grid's top-left (clamped),
  then calls `onConsumedMotif()` so App clears `pendingMotif`.

### Placement model

A new motif always creates its **own new tight area** at top-left — identical to
dropping it on the canvas. We extract the area-creation core of `placeMotifAt` into a
pure helper:

```
placeMotif(design, entry, cx, cy): Design
```

that runs `mergePalette` → `remapCells` → `trimCells` → builds a new `Area` and returns
the updated `Design` (palette + areas). `placeMotifAt` is refactored to call it (passing
the cell coords from the pointer), and the handoff calls it with `cx=0, cy=0`. This keeps
one code path for "make an area from a motif" and makes it unit-testable. The
empty-marked-area and repeat-area branches of `placeMotifAt` stay where they are (they
need a pointer/target context); the handoff only uses the new-area path.

## Description data

- Add optional `description?: string` to `Pattern` in `src/engine/types.ts`.
- Hand-write descriptions for the canonical motifs in `src/patterns/builtin.ts`.
- Tirazain and Saved patterns render the description block only when present; filling
  their descriptions is out of scope here (importer/editor can populate later).

## Files

**New**
- `src/ui/PatternDetail.tsx` — slide-over panel + design picker modal.
- `src/ui/patternStats.ts` — `patternStats(pattern)` pure helper for the details rows.

**Edited**
- `src/engine/types.ts` — add `description?: string` to `Pattern`.
- `src/patterns/builtin.ts` — add descriptions to canonical motifs.
- `src/ui/LibraryTab.tsx` — card click opens the detail panel (selected pattern + key)
  instead of calling `onLoad`. The three sections pass their pattern + key to the panel.
- `src/App.tsx` — hold the selected-pattern panel state and `pendingMotif`; wire the
  four panel actions to existing navigate helpers; pass `pendingMotif`/`onConsumedMotif`
  to `DesignTab`.
- `src/ui/DesignTab.tsx` — accept `pendingMotif`/`onConsumedMotif`; extract pure
  `placeMotif(design, entry, cx, cy)` from `placeMotifAt`; auto-place on handoff.
- `src/project/design.ts` — host the extracted `placeMotif` helper if it fits better
  there (pure, no React) — preferred over keeping it in the component.
- `src/styles.css` — slide-over + picker modal styles.

## Testing

- Unit test `placeMotif(design, entry, cx, cy)`: palette merge dedup, cell remap, trim,
  and resulting area position/size for both a top-left (`0,0`) and an arbitrary drop point.
- Unit test `patternStats(pattern)`: chart size, painted size, stitches, color count,
  DMC list, for a pattern with and without a palette.
- Manual run-through in the app: card → panel shows correct info; each of the four
  actions routes correctly; Add to design into an existing design and into a new design
  both land the motif as a new area.

## Out of scope

- Editing/authoring descriptions for Tirazain or Saved patterns.
- Placing into an existing selected area, or repeat areas, from the handoff.
- Any change to the Design tab's drag-drop, editor, plan, or ground-truth internals
  beyond the additive handoff prop and the pure-helper extraction.
