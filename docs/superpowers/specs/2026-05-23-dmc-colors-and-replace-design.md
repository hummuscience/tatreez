# DMC Colors & Color Replace — Design

Date: 2026-05-23

Surface the exact DMC thread each pattern color suggests, and let the user
replace a color in the editor via a searchable dropdown.

---

## Goals

1. Show the **suggested DMC** (number + name) for every pattern color, in the
   editor palette swatches, the Plans material list, and the Library cards.
2. In the editor, a **Replace** action on a color opens a searchable dropdown to
   swap that color for another. Replace recolors **all cells** of that color
   (palette swap). The dropdown supports:
   - Searching the **full DMC catalog** (~454 standard colors) by number or name.
   - A toggle to **filter to DMCs used across the library** (the traditional
     Palestinian palette).
   - Entering a **free hex** color that is not a DMC thread.

## Findings (see memory `reference-dmc-in-oxs`)

- Source `.oxs` files carry full DMC data per color: `number="DMC 310"`,
  `name="Black"`, `color="0C0C0C"`. Source lives at
  `resources/tirazain/<slug>/pattern.oxs` and `resources/*.oxs`.
- `src/oxs/parseOxs.ts` reads the DMC label but **discards it** — only hex is
  kept. The imported `src/patterns/tirazainArchive.json` therefore stores hex
  only (`"palette":[null,"#7E83B9",...]`).
- DMC source recovery strategy: **re-import from .oxs** (user-chosen). The raw
  OXS is the source of truth; re-running the importer recovers true DMC for all
  patterns.

---

## Data model — Option B (richer palette objects)

Replace the bare-hex palette with objects carrying hex + optional DMC.
(User-chosen over the parallel-array option.)

```ts
// src/engine/types.ts
export interface DmcRef {
  number: string;   // e.g. "310"  (canonical DMC code; "ECRU"/"BLANC" allowed)
  name: string;     // e.g. "Black"
}
export interface PaletteColor {
  hex: string;          // "#RRGGBB"
  dmc?: DmcRef;         // present when the color maps to a known DMC thread
}
// index 0 is empty (null); 1..N are PaletteColor
export type Palette = (PaletteColor | null)[];

export interface Pattern {
  // ...
  palette?: Palette;    // was (string | null)[]
}
```

### Containing the blast radius

`palette` is referenced in ~17 files, but most reads go through one accessor.
Strategy: keep the **hex-returning** accessor so rendering code is untouched.

- `getPalette(pattern)` in `src/patterns/builtin.ts` keeps its signature
  `(pattern) => (string | null)[]`, now deriving hex from the new objects
  (`c == null ? null : c.hex`). Every canvas/render consumer
  (`canvasUtil`, `PlanTab`, `EditorTab`, `DesignTab`) continues to call it and
  needs **no change** for rendering.
- Add a parallel accessor `getPaletteColors(pattern): Palette` for the few UI
  sites that need DMC (editor swatches, plans list, library card).
- **Engine** (`engine/types.ts`, `optimal/*`, `primitives.ts`): only uses
  palette *indices* and *length*, never hex. The type changes; logic does not.
- **Palette constructors** (the real edit sites) produce the new object shape:
  - `parseOxs.ts`: build `{ hex, dmc: { number, name } }`, parsing `number`
    (strip the `DMC` prefix and whitespace) and `name`. Non-DMC entries (e.g.
    `Ecru`, custom) → `{ hex }` with `dmc` derived if the number is a known DMC
    token, else omitted.
  - `detect/*` (k-means + uniform cell): produce `{ hex }` (no DMC) — these come
    from images. Optionally tag nearest-DMC later; out of scope here.
  - `builtin.ts` literal patterns: convert `palette: [null, '#D21D22']` to
    `[null, { hex: '#D21D22' }]` (DMC optional; add where known).
  - `design.ts` / DesignTab palette composition: construct objects.

### Backward compatibility (persisted + archive data)

Old-shape palettes exist in two places that we will NOT eagerly rewrite:
- `localStorage` user-saved patterns (`(string|null)[]`).
- Any code path reading patterns before re-import.

Add `normalizePalette(raw): Palette` that upgrades a legacy palette
(`string → { hex: string }`, `null → null`) and is idempotent on the new shape.
Call it at every load boundary: `storage` load, archive load, and inside
`getPalette`/`getPaletteColors` as a guard. This means stored data needs no
migration pass; it upgrades on read. The re-imported archive will already be in
the new shape.

---

## DMC catalog

No catalog exists in the repo. Add `src/patterns/dmcCatalog.ts` (or `.json`):
a static table of standard DMC floss — `{ number, name, hex }[]` (~454 entries).

- Used by the Replace dropdown search (full catalog mode).
- Used to resolve a `number` → `{ name, hex }` when needed.
- The **library-used subset** is derived at build/load time: scan all pattern
  palettes for `dmc.number`s present, expose `libraryDmcNumbers: Set<string>`
  (computed from `BUILTIN_PATTERNS` + archive). The Replace dropdown's "used in
  library" toggle filters the catalog to this set.

Source of the catalog table: the standard DMC floss list (number → name → RGB
hex) is published factual reference data, committed as a static data file (no
runtime fetch). ~454 rows; small file. During implementation, prefer deriving
as many entries as possible from the hexes already present in the re-imported
`.oxs` palettes (which pair `number`+`name`+`color`), filling any gaps from the
public list — this keeps catalog hexes consistent with what patterns actually use.

---

## Re-import

- Update `scripts/import_tirazain.mjs` (and whatever `parseOxs` it shares) to
  emit the new palette object shape with DMC.
- Re-run `npm run import-tirazain` to regenerate
  `src/patterns/tirazainArchive.json` with DMC data for all patterns.
- The `.OXS` files directly under `resources/` (built-ins / test fixtures) are
  parsed by the same `parseOxs`; re-running tests confirms parity.

---

## Editor "Replace" UI

In `EditorTab.tsx`, near the palette swatches / active-color area:

- Each swatch shows its DMC: number + name as a label or on hover (display goal).
- A **Replace** button acts on the currently active color (index `activeColor`,
  must be > 0). Clicking it opens a small popover anchored to the swatch.
- The popover contains:
  - A text input filtering a scrollable list of DMC colors (number or name match).
  - A toggle "Only library colors" filtering the list to `libraryDmcNumbers`.
  - A "Custom hex" field accepting `#RRGGBB`.
  - Each list row shows a color chip + `DMC <number> — <name>`.
- Selecting an entry calls `replaceColor(activeColor, newPaletteColor)`:
  - Sets `pattern.palette[activeColor] = newPaletteColor` (the cells already use
    that index, so recoloring the palette slot recolors every cell of that color
    — no cell rewrite needed).
  - Custom hex → `{ hex }` (no dmc). Catalog pick → `{ hex, dmc }`.
- Closes the popover; canvas re-renders via the existing `pattern` effect.

Component: a focused `ColorReplacePopover` (own file
`src/ui/ColorReplacePopover.tsx`) — one purpose, testable in isolation. Inputs:
`current: PaletteColor`, `catalog`, `libraryNumbers`, `onPick`, `onClose`.

---

## Display surfaces

1. **Editor palette swatches** (`EditorTab.tsx`): swatch label/tooltip shows
   `DMC <number> <name>` when `dmc` present, else the hex.
2. **Plans material list** (`PlanTab.tsx`): the existing per-color breakdown row
   names the DMC (`DMC 310 Black`) alongside its length/stitch stats. Falls back
   to hex when no DMC.
3. **Library card** (`LibraryTab.tsx` PatternCard): show the DMC colors used
   (small chips with number, or count). Keep compact.

---

## Testing

- **Unit:** `parseOxs` now returns DMC on palette entries (extend
  `src/oxs/__tests__/parseOxs.test.ts` with a fixture asserting
  `palette[1].dmc.number === '310'`). `normalizePalette` idempotency +
  legacy-string upgrade. `replaceColor` swaps the palette slot and leaves cells
  untouched.
- **Engine regression:** full `vitest` suite must stay green (palette type widened
  but engine logic unchanged) — guards against accidental hex-shape assumptions.
- **Manual (run skill):** load a re-imported pattern in the editor; confirm
  swatches show DMC; click Replace, search a DMC, pick it, confirm all cells of
  that color change and the swatch updates; toggle "library only"; enter a custom
  hex. Check Plans material list and Library card show DMC.

---

## Out of scope

- Nearest-DMC matching for hand-painted / image-detected colors (we chose
  faithful re-import; detect-produced colors simply have no `dmc`).
- Editing the DMC catalog or adding non-DMC brands (Anchor, etc.).
- Bulk recolor across multiple patterns; per-cell multi-select replace.
- Migrating persisted localStorage data eagerly (upgraded on read instead).
