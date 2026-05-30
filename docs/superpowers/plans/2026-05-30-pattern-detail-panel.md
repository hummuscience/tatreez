# Pattern Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a library pattern opens a slide-over detail panel showing its info (description, size, stitches, colors, ground-truth status) with Edit / Plan / Submit-ground-truth / Add-to-design actions, instead of jumping straight to the editor.

**Architecture:** A new `PatternDetail` slide-over component is driven by selection state lifted into `App`. The four actions reuse App's existing `navigate`/`setPattern` helpers. "Add to design" sets a `pendingMotif` handoff that `DesignTab` consumes by auto-placing the motif via a pure `placeMotif` helper extracted from the existing drop logic in `design.ts`. Description is a new optional `Pattern` field, hand-written for built-ins.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest. No external state library — `useState` in `App.tsx`. localStorage persistence via `src/storage/storage.ts`.

---

## File Structure

**New files:**
- `src/ui/patternStats.ts` — pure `patternStats(pattern)` helper feeding the details table.
- `src/ui/patternStats.test.ts` — unit tests for it (co-located, matching `src/project/design.test.ts`).
- `src/ui/PatternDetail.tsx` — the slide-over panel + the design-picker modal.

**Modified files:**
- `src/engine/types.ts` — add `description?: string` to `Pattern`.
- `src/patterns/builtin.ts` — add `description` to canonical motifs.
- `src/project/design.ts` — add pure `placeMotif(design, entry, cx, cy)`; add `LibEntry`-shaped input type.
- `src/project/design.test.ts` — tests for `placeMotif`.
- `src/ui/DesignTab.tsx` — refactor `placeMotifAt` to call `placeMotif`; accept `pendingMotif`/`onConsumedMotif`; auto-place on handoff.
- `src/App.tsx` — selection state for the panel, `pendingMotif` handoff, wire actions.
- `src/ui/LibraryTab.tsx` — card click opens panel via a new `onSelect` prop instead of `onLoad`.
- `src/styles.css` — slide-over + picker modal styles.

**Reference (read, don't edit):**
- `src/ui/patternFilters.ts` — `paintedSize`, `paintedCells`, `colorCount`.
- `src/patterns/builtin.ts` — `getPaletteColors`, `clonePattern`.
- `src/storage/storage.ts` — `getGroundTruth`, `builtinPatternKey`, `savedPatternKey`, `listDesigns`, `saveDesign`.
- `src/patterns/groundTruths.ts` — `hasCanonicalGroundTruth`.

---

## Task 1: Add `description` to the Pattern type

**Files:**
- Modify: `src/engine/types.ts:108` (end of the `Pattern` interface, after `regionAr`)

- [ ] **Step 1: Add the field**

In `src/engine/types.ts`, inside `export interface Pattern { ... }`, after the
`regionAr?: string;` field (line ~108) and before the closing `}`, add:

```typescript
  /**
   * Optional human-readable description of the motif: what it depicts, its
   * cultural meaning, or notes for the stitcher. Shown on the pattern detail
   * panel. Built-in patterns provide this in code; imported/saved patterns
   * may omit it (the panel hides the block when absent).
   */
  description?: string;
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS (no errors). Adding an optional field cannot break existing code.

- [ ] **Step 3: Commit**

```bash
git add src/engine/types.ts
git commit -m "feat(types): add optional description field to Pattern"
```

---

## Task 2: `patternStats` helper + tests

A single pure function that derives every row of the details table, so the panel has
one source and the logic is testable.

**Files:**
- Create: `src/ui/patternStats.ts`
- Test: `src/ui/patternStats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/patternStats.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { patternStats } from './patternStats';
import type { Pattern } from '../engine/types';

const withPalette: Pattern = {
  name: 'T',
  width: 4,
  height: 3,
  cells: [
    [0, 1, 0, 0],
    [0, 1, 2, 0],
    [0, 0, 0, 0],
  ],
  palette: [
    null,
    { hex: '#D21D22', dmc: { number: '3801', name: 'Christmas Red LT' } },
    { hex: '#1B4D2E' },
  ],
};

describe('patternStats', () => {
  it('derives chart size, painted size, stitches, colors and DMC list', () => {
    const s = patternStats(withPalette);
    expect(s.chart).toEqual({ w: 4, h: 3 });
    expect(s.painted).toEqual({ w: 2, h: 2 }); // cols 1..2, rows 0..1
    expect(s.stitches).toBe(3);
    expect(s.colorCount).toBe(2);
    expect(s.colors.map((c) => c.hex)).toEqual(['#D21D22', '#1B4D2E']);
    expect(s.dmc).toEqual([{ number: '3801', name: 'Christmas Red LT' }]);
  });

  it('handles a pattern with no per-pattern palette by falling back', () => {
    const noPalette: Pattern = { name: 'X', width: 2, height: 2, cells: [[0, 1], [0, 0]] };
    const s = patternStats(noPalette);
    expect(s.chart).toEqual({ w: 2, h: 2 });
    expect(s.stitches).toBe(1);
    expect(s.colors.length).toBeGreaterThan(0); // fallback palette resolves a colour
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/patternStats.test.ts`
Expected: FAIL — "Failed to resolve import './patternStats'" / `patternStats is not a function`.

- [ ] **Step 3: Implement the helper**

Create `src/ui/patternStats.ts`:

```typescript
/**
 * Pure derivation of the facts shown on the pattern detail panel's details
 * table. One source so the panel stays consistent and the logic is testable.
 */

import type { DmcRef, PaletteColor, Pattern } from '../engine/types';
import { getPaletteColors } from '../patterns/builtin';
import { colorCount, paintedCells, paintedSize } from './patternFilters';

export interface PatternStats {
  /** Full chart dimensions (width × height), in cells. */
  chart: { w: number; h: number };
  /** Painted bounding-box dimensions, in cells. {w:0,h:0} if all-empty. */
  painted: { w: number; h: number };
  /** Number of painted (non-empty) cells. */
  stitches: number;
  /** Number of distinct palette colours. */
  colorCount: number;
  /** The non-null palette colours, in palette order. */
  colors: PaletteColor[];
  /** DMC references for colours that carry one, in palette order. */
  dmc: DmcRef[];
}

export function patternStats(p: Pattern): PatternStats {
  const colors = getPaletteColors(p).filter(
    (c): c is PaletteColor => c != null,
  );
  return {
    chart: { w: p.width, h: p.height },
    painted: paintedSize(p),
    stitches: paintedCells(p),
    colorCount: colorCount(p),
    colors,
    dmc: colors.map((c) => c.dmc).filter((d): d is DmcRef => d != null),
  };
}
```

Note: `colorCount(p)` returns 0 when `p.palette` is undefined (it only counts a
per-pattern palette). That's intentional and matches the library card. The `colors`
array uses `getPaletteColors` (with fallback) so swatches still render for legacy
patterns; `colorCount` is the "declared palette size" number.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/patternStats.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/patternStats.ts src/ui/patternStats.test.ts
git commit -m "feat(ui): add patternStats helper for the detail panel"
```

---

## Task 3: Extract pure `placeMotif` into design.ts + tests

The Design tab's `placeMotifAt` (in `src/ui/DesignTab.tsx`) contains the "make a new tight
area from a motif" logic inline. Extract that core into a pure helper so the Add-to-design
handoff can place a motif without a pointer event, and so it's unit-testable.

**Files:**
- Modify: `src/project/design.ts` (add `MotifEntry` type + `placeMotif`)
- Test: `src/project/design.test.ts`

- [ ] **Step 1: Write the failing test**

The existing `src/project/design.test.ts` imports only value helpers from `'./design'`
and does not import `Design`/`Pattern` types. Add `placeMotif` and the `Design` type to
the existing `from './design'` import block, and add a `Pattern` type import. At the top
of the file, extend the imports:

```typescript
import { placeMotif, type Design } from './design';
import type { Pattern } from '../engine/types';
```

Then append this block after the existing tests:

```typescript
describe('placeMotif', () => {
  const motif: Pattern = {
    name: 'Dot',
    width: 4,
    height: 4,
    // a single painted cell with blank margins, so trim matters
    cells: [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    palette: [null, { hex: '#D21D22' }],
  };
  const entry = { key: 'builtin:dot', pattern: motif };

  const baseDesign: Design = {
    id: 'd1',
    name: 'D',
    clothId: 'aida-14',
    strandsId: '2',
    widthCm: 10,
    heightCm: 10,
    gridW: 20,
    gridH: 20,
    areas: [],
    palette: [null],
  };

  it('adds a new tight area hugging the trimmed motif at the drop point', () => {
    const next = placeMotif(baseDesign, entry, 5, 7);
    expect(next.areas).toHaveLength(1);
    const a = next.areas[0];
    expect(a.x).toBe(5);
    expect(a.y).toBe(7);
    expect(a.w).toBe(1); // trimmed to the single painted cell
    expect(a.h).toBe(1);
    expect(a.motifs).toHaveLength(1);
    expect(a.motifs[0].patternKey).toBe('builtin:dot');
    // palette merged: the motif colour appended at index 1
    expect(next.palette[1]?.hex).toBe('#D21D22');
    // the motif cell references the merged design index
    expect(a.motifs[0].cells).toEqual([[1]]);
  });

  it('clamps the area on-grid when the drop point is past the edge', () => {
    const next = placeMotif(baseDesign, entry, 19, 19);
    const a = next.areas[0];
    expect(a.x).toBe(19); // 1-wide area still fits at x=19 (gridW=20)
    expect(a.y).toBe(19);
  });

  it('does not mutate the input design', () => {
    placeMotif(baseDesign, entry, 0, 0);
    expect(baseDesign.areas).toHaveLength(0);
    expect(baseDesign.palette).toEqual([null]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/project/design.test.ts`
Expected: FAIL — `placeMotif is not a function` / import resolves to undefined.

- [ ] **Step 3: Implement `placeMotif` in design.ts**

In `src/project/design.ts`, after `newId` (end of file) add:

```typescript
/** Minimal library entry `placeMotif` needs: a key for provenance and the source pattern. */
export interface MotifEntry {
  key: string;
  pattern: Pattern;
}

/**
 * Add a motif to a design as a new tight area whose top-left sits at grid cell
 * (cx, cy), clamped on-grid. The motif's palette is merged into the design
 * palette and its cells remapped + trimmed to the painted bounding box. Pure:
 * returns a new Design, never mutating the input.
 *
 * This is the "new area from a motif" path shared by the Design tab's
 * drag/drop placement and the library "Add to design" handoff. The
 * empty-marked-area and repeat-area drop variants stay in the Design tab
 * because they need pointer/target context.
 */
export function placeMotif(
  design: Design,
  entry: MotifEntry,
  cx: number,
  cy: number,
): Design {
  const merged = mergePalette(design.palette, patternPalette(entry.pattern));
  const cells = trimCells(remapCells(entry.pattern.cells, merged.indexMap));
  const mh = cells.length;
  const mw = mh > 0 ? cells[0].length : 1;
  const w = Math.min(mw, design.gridW);
  const h = Math.min(mh, design.gridH);
  const ax = Math.max(0, Math.min(cx, design.gridW - w));
  const ay = Math.max(0, Math.min(cy, design.gridH - h));
  const area: Area = {
    id: newId('area'),
    name: entry.pattern.name || 'motif',
    x: ax,
    y: ay,
    w,
    h,
    motifs: [{ patternKey: entry.key, cells, x: 0, y: 0 }],
  };
  return { ...design, palette: merged.palette, areas: [...design.areas, area] };
}
```

`mergePalette`, `patternPalette`, `trimCells`, `remapCells`, `newId`, and the `Area`/`Design`
types are all already defined in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/project/design.test.ts`
Expected: PASS (existing tests + 3 new `placeMotif` tests).

- [ ] **Step 5: Commit**

```bash
git add src/project/design.ts src/project/design.test.ts
git commit -m "feat(design): extract pure placeMotif helper from the drop path"
```

---

## Task 4: Refactor DesignTab's `placeMotifAt` to use `placeMotif`

Replace the inline new-area block with a call to the pure helper, keeping the
empty-marked-area and repeat branches. No behaviour change — this is a safe refactor
verified by the existing app and tests.

**Files:**
- Modify: `src/ui/DesignTab.tsx:1073-1088` (the final new-area block of `placeMotifAt`)
- Modify: `src/ui/DesignTab.tsx` import block (lines ~3-20) to import `placeMotif`

- [ ] **Step 1: Import `placeMotif`**

In `src/ui/DesignTab.tsx`, add `placeMotif` to the existing import from `'../project/design'`
(the block starting at line 3). Insert it alphabetically near `patternPalette`:

```typescript
  newId,
  patternPalette,
  placeMotif,
  recolorAreaIndex,
```

- [ ] **Step 2: Replace the inline new-area block**

In `placeMotifAt` (around line 1073), replace this block:

```typescript
    // Otherwise create a new tight area hugging the motif, positioned at the
    // drop point and clamped on-grid. Size = trimmed motif dimensions.
    const ax = Math.max(0, Math.min(cx, design.gridW - w));
    const ay = Math.max(0, Math.min(cy, design.gridH - h));
    const area: Area = {
      id: newId('area'),
      name: entry.pattern.name || 'motif',
      x: ax,
      y: ay,
      w,
      h,
      motifs: [{ patternKey: key, cells, x: 0, y: 0 }],
    };
    onChange({ ...design, palette: merged.palette, areas: [...design.areas, area] });
    selectOne(area.id);
```

with:

```typescript
    // Otherwise create a new tight area hugging the motif via the shared
    // pure helper, then select it.
    const next = placeMotif(design, { key, pattern: entry.pattern }, cx, cy);
    onChange(next);
    selectOne(next.areas[next.areas.length - 1].id);
```

Leave the earlier `merged`/`cells`/`mw`/`mh`/`w`/`h` locals and the two earlier branches
(repeat area, empty marked area) unchanged — they still use those locals.

- [ ] **Step 3: Verify typecheck and existing tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. `area`/`newId` may now be unused in this function — if `npm run typecheck`
reports an unused-import error for `newId` or unused `Area` type *in this file*, confirm
they're still used elsewhere in `DesignTab.tsx` (they are: other area-creating handlers).
If genuinely unused, remove only the now-dead local; do not remove imports used elsewhere.

- [ ] **Step 4: Commit**

```bash
git add src/ui/DesignTab.tsx
git commit -m "refactor(design): route drop placement through placeMotif"
```

---

## Task 5: DesignTab accepts a pending-motif handoff

Add props so an externally-chosen motif gets auto-placed into a chosen design on entry.

**Files:**
- Modify: `src/ui/DesignTab.tsx` — `Props` (line ~72), `DesignTab` body (line ~100), and
  `DesignComposer` (line ~270).

- [ ] **Step 1: Extend the `Props` interface**

In `src/ui/DesignTab.tsx`, change the `Props` interface (line ~72) to:

```typescript
interface Props {
  /** Route a composited area to the Plan tab. */
  onPlanArea: (pattern: Pattern, key: string) => void;
  showToast: (msg: string) => void;
  /**
   * A motif handed off from the library "Add to design" action: open this
   * design and auto-place the motif as a new area. Null when there's nothing
   * pending.
   */
  pendingMotif?: { key: string; pattern: Pattern; designId: string } | null;
  /** Called once the pending motif has been placed, so the parent can clear it. */
  onConsumedMotif?: () => void;
}
```

- [ ] **Step 2: Open the target design and place the motif in the `DesignTab` body**

In `DesignTab` (line ~100), update the signature and add an effect. Replace:

```typescript
export default function DesignTab({ onPlanArea }: Props) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [design, setDesign] = useState<Design | null>(null);

  useEffect(() => {
    setDesigns(listDesigns());
  }, []);
```

with:

```typescript
export default function DesignTab({
  onPlanArea,
  pendingMotif,
  onConsumedMotif,
}: Props) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [design, setDesign] = useState<Design | null>(null);

  useEffect(() => {
    setDesigns(listDesigns());
  }, []);

  // Consume a motif handed off from the library "Add to design" action: open
  // the chosen design (from storage so it's the persisted copy) and place the
  // motif as a new area, then tell the parent we've consumed it.
  useEffect(() => {
    if (!pendingMotif) return;
    const target = listDesigns().find((d) => d.id === pendingMotif.designId);
    if (!target) {
      onConsumedMotif?.();
      return;
    }
    const next = placeMotif(
      target,
      { key: pendingMotif.key, pattern: pendingMotif.pattern },
      0,
      0,
    );
    setDesign(next); // the persist effect saves it and refreshes the list
    onConsumedMotif?.();
    // Re-run only when a new motif arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMotif]);
```

`placeMotif` is already imported from Task 4. The existing persist effect
(`useEffect` on `[design]`, line ~109) will `saveDesign(next)` and update `designs`.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (Props are optional, so `App` not passing them yet is fine.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/DesignTab.tsx
git commit -m "feat(design): accept a pending-motif handoff and auto-place it"
```

---

## Task 6: The PatternDetail slide-over + design picker

The panel itself. Presentational, driven entirely by props.

**Files:**
- Create: `src/ui/PatternDetail.tsx`

- [ ] **Step 1: Create the component**

Create `src/ui/PatternDetail.tsx`:

```typescript
import { useEffect, useState } from 'react';
import type { Pattern } from '../engine/types';
import { patternStats } from './patternStats';
import PatternThumb from './PatternThumb';
import { listDesigns } from '../storage/storage';
import type { Design } from '../project/design';

export interface PatternDetailProps {
  /** The selected pattern and its library key, or null when the panel is closed. */
  selection: { pattern: Pattern; patternKey: string } | null;
  /** Whether this pattern has ground truth (canonical or saved). */
  hasGroundTruth: boolean;
  onClose: () => void;
  onEdit: (pattern: Pattern, key: string) => void;
  onPlan: (pattern: Pattern, key: string) => void;
  onSubmitGroundTruth: (pattern: Pattern, key: string) => void;
  /** User picked a design (existing id, or null to create a new one) for the motif. */
  onAddToDesign: (pattern: Pattern, key: string, designId: string | null) => void;
}

export default function PatternDetail({
  selection,
  hasGroundTruth,
  onClose,
  onEdit,
  onPlan,
  onSubmitGroundTruth,
  onAddToDesign,
}: PatternDetailProps) {
  const [picking, setPicking] = useState(false);

  // Close on Escape. Reset the picker whenever the selection changes.
  useEffect(() => {
    setPicking(false);
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, onClose]);

  if (!selection) return null;
  const { pattern: p, patternKey } = selection;
  const s = patternStats(p);
  const arabicName = p.nameAr ?? p.source?.arabicName ?? '';
  const region = p.source?.region;
  const sourceUrl = p.source?.url;

  return (
    <div className="pd-overlay" role="dialog" aria-modal="true" aria-label={p.name}>
      <button className="pd-backdrop" type="button" aria-label="Close" onClick={onClose} />
      <aside className="pd-panel">
        <button className="pd-close" type="button" aria-label="Close" onClick={onClose}>
          ✕
        </button>

        <div className="pd-head">
          <div className="pd-thumb">
            <PatternThumb pattern={p} />
          </div>
          <div className="pd-titles">
            <div className="pd-name">{p.name}</div>
            {arabicName && (
              <div className="pd-name-ar" dir="rtl">
                {arabicName}
              </div>
            )}
            <div className="pd-sub">
              {region && <span>{region}</span>}
              {hasGroundTruth && <span className="pat-badge">GT</span>}
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  source ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {p.description && (
          <section className="pd-section">
            <h3 className="pd-h">Description</h3>
            <p className="pd-desc">{p.description}</p>
          </section>
        )}

        <section className="pd-section">
          <h3 className="pd-h">Details</h3>
          <dl className="pd-details">
            <dt>Chart size</dt>
            <dd>
              {s.chart.w} × {s.chart.h}
            </dd>
            <dt>Painted size</dt>
            <dd>
              {s.painted.w} × {s.painted.h}
            </dd>
            <dt>Stitches</dt>
            <dd>{s.stitches}</dd>
            <dt>Colors</dt>
            <dd>
              <span className="pat-dmc">
                {s.colors.map((c, i) => (
                  <span
                    key={i}
                    className="pat-dmc-chip"
                    style={{ background: c.hex }}
                    title={c.dmc ? `DMC ${c.dmc.number} · ${c.dmc.name}` : c.hex}
                  />
                ))}
              </span>{' '}
              ({s.colorCount})
            </dd>
            {s.dmc.length > 0 && (
              <>
                <dt>Threads (DMC)</dt>
                <dd>
                  {s.dmc.map((d) => `${d.number} ${d.name}`).join(' · ')}
                </dd>
              </>
            )}
            <dt>Ground truth</dt>
            <dd>{hasGroundTruth ? '✓ available' : '— none yet'}</dd>
          </dl>
        </section>

        <div className="pd-actions">
          <button
            className="btn-primary"
            type="button"
            onClick={() => setPicking(true)}
          >
            Add to design
          </button>
          <button
            className="btn-primary"
            type="button"
            onClick={() => onPlan(p, patternKey)}
          >
            Plan
          </button>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => onEdit(p, patternKey)}
          >
            Edit
          </button>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => onSubmitGroundTruth(p, patternKey)}
          >
            Submit ground truth
          </button>
        </div>

        {picking && (
          <DesignPicker
            onCancel={() => setPicking(false)}
            onChoose={(designId) => onAddToDesign(p, patternKey, designId)}
          />
        )}
      </aside>
    </div>
  );
}

/** A small modal listing existing designs plus a "New design" choice. */
function DesignPicker({
  onCancel,
  onChoose,
}: {
  onCancel: () => void;
  onChoose: (designId: string | null) => void;
}) {
  const [designs] = useState<Design[]>(() => listDesigns());
  return (
    <div className="pd-picker" role="dialog" aria-label="Add to which design">
      <div className="pd-picker-h">Add to design</div>
      <button
        className="btn-ghost pd-picker-item"
        type="button"
        onClick={() => onChoose(null)}
      >
        + New design
      </button>
      {designs.map((d) => (
        <button
          key={d.id}
          className="btn-ghost pd-picker-item"
          type="button"
          onClick={() => onChoose(d.id)}
        >
          {d.name}
        </button>
      ))}
      <button className="btn-ghost btn-sm" type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. (Component is not yet rendered, but must compile.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/PatternDetail.tsx
git commit -m "feat(ui): add PatternDetail slide-over panel and design picker"
```

---

## Task 7: Slide-over + picker styles

**Files:**
- Modify: `src/styles.css` (append a new block at end of file)

- [ ] **Step 1: Append styles**

Append to `src/styles.css`. Match the existing token style (the file uses CSS custom
properties and class names like `.card`, `.btn-primary`, `.pat-badge`, `.pat-dmc`).
If a referenced variable (e.g. `--linen`, `--ink`) does not exist in the file, substitute
the nearest existing surface/border/text variable used by `.card` / `.panel`.

```css
/* ---- Pattern detail slide-over ---- */
.pd-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: flex-end;
}
.pd-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  background: rgba(0, 0, 0, 0.35);
  cursor: pointer;
}
.pd-panel {
  position: relative;
  width: min(420px, 92vw);
  height: 100%;
  overflow-y: auto;
  background: var(--surface, #faf6ef);
  border-left: 1px solid var(--border, #d9cfc0);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.18);
  padding: 20px;
  box-sizing: border-box;
}
.pd-close {
  position: absolute;
  top: 12px;
  right: 12px;
  border: 0;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  color: var(--ink, #3a2f25);
}
.pd-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin: 8px 0 4px;
}
.pd-thumb {
  width: 110px;
  flex: 0 0 auto;
}
.pd-titles {
  min-width: 0;
}
.pd-name {
  font-weight: 600;
  font-size: 16px;
}
.pd-name-ar {
  font-size: 14px;
  opacity: 0.85;
}
.pd-sub {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.8;
}
.pd-section {
  margin-top: 18px;
}
.pd-h {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
  margin: 0 0 6px;
}
.pd-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
.pd-details {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
  font-size: 13px;
}
.pd-details dt {
  opacity: 0.6;
}
.pd-details dd {
  margin: 0;
}
.pd-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 22px;
}
.pd-actions .btn-primary {
  flex: 1 1 45%;
}
.pd-actions .btn-ghost {
  flex: 1 1 45%;
}
.pd-picker {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border, #d9cfc0);
  border-radius: 8px;
  background: var(--surface-2, #fff);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pd-picker-h {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
}
.pd-picker-item {
  text-align: left;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "style(ui): pattern detail slide-over and picker"
```

---

## Task 8: Wire selection + actions into App; library opens the panel

This is the integration task. After it, clicking a card opens the panel and every
action works.

**Files:**
- Modify: `src/ui/LibraryTab.tsx` — replace `onLoad` prop with `onSelect`; pass pattern+key
  on card click.
- Modify: `src/App.tsx` — selection state, `pendingMotif`, render `PatternDetail`, wire actions.

- [ ] **Step 1: Change LibraryTab to call `onSelect`**

In `src/ui/LibraryTab.tsx`, change the `Props` interface (line ~77):

```typescript
interface Props {
  onSelect: (pattern: Pattern, patternKey: string) => void;
  showToast: (msg: string) => void;
}
```

Update the component signature (line ~82): `export default function LibraryTab({ onSelect, showToast }: Props) {`.

Replace the three `onClick={() => onLoad(...)}` handlers with `onSelect`:

- Built-in section (line ~230): `onClick={() => onSelect(clonePattern(p), key)}`
- Tirazain section (line ~371-373): `onClick={() => onSelect(clonePattern(p), archivePatternKey(slug))}`
- Saved section (line ~436): `onClick={() => onSelect(clonePattern(entry.pattern), key)}`

Also in `handleOxsFile` (line ~197), the post-import call `onLoad(result.pattern, savedPatternKey(id))`
should become `onSelect(result.pattern, savedPatternKey(id))` so an imported file opens its
detail panel (consistent with the new model).

- [ ] **Step 2: Add selection + pendingMotif state and imports in App**

In `src/App.tsx`, add imports near the top (after line 10):

```typescript
import PatternDetail from './ui/PatternDetail';
import { clonePattern } from './patterns/builtin';
import {
  getGroundTruth,
  builtinPatternKey,
  savedPatternKey,
  listDesigns,
  saveDesign,
} from './storage/storage';
import { hasCanonicalGroundTruth } from './patterns/groundTruths';
import { newId, type Design } from './project/design';
import { DEFAULT_CLOTH_ID, DEFAULT_STRANDS_ID, getCloth } from './project/cloth';
import { cmToCells } from './project/design';
```

(If any of these are already imported, merge rather than duplicate.)

Inside `App()`, after the existing `state`/`setState` block (line ~72), add:

```typescript
  const [selected, setSelected] = useState<{
    pattern: Pattern;
    patternKey: string;
  } | null>(null);
  const [pendingMotif, setPendingMotif] = useState<{
    key: string;
    pattern: Pattern;
    designId: string;
  } | null>(null);
```

- [ ] **Step 3: Add a ground-truth check helper in App**

After the state declarations, add:

```typescript
  // A pattern has ground truth if it has a saved GT or a canonical one. The
  // canonical check needs the builtin id, which is the part after "builtin:".
  const selectionHasGt = (() => {
    if (!selected) return false;
    const key = selected.patternKey;
    if (getGroundTruth(key)) return true;
    if (key.startsWith('builtin:')) {
      return hasCanonicalGroundTruth(key.slice('builtin:'.length));
    }
    return false;
  })();
```

Note: `builtinPatternKey(id)` is `` `builtin:${id}` `` (confirmed in storage.ts), so slicing
the prefix recovers the id `hasCanonicalGroundTruth` expects.

- [ ] **Step 4: Add the Add-to-design handler in App**

After the helper, add:

```typescript
  // From the detail panel: place a motif into a chosen design (or a fresh one),
  // then jump to the Design tab, which consumes `pendingMotif`.
  const addToDesign = useCallback(
    (pattern: Pattern, key: string, designId: string | null) => {
      let id = designId;
      if (id === null) {
        const cloth = getCloth(DEFAULT_CLOTH_ID);
        const widthCm = 20;
        const heightCm = 20;
        const d: Design = {
          id: newId('design'),
          name: 'Untitled design',
          clothId: DEFAULT_CLOTH_ID,
          strandsId: DEFAULT_STRANDS_ID,
          widthCm,
          heightCm,
          gridW: cmToCells(widthCm, cloth),
          gridH: cmToCells(heightCm, cloth),
          areas: [],
          palette: [null],
        };
        saveDesign(d);
        id = d.id;
      }
      setPendingMotif({ key, pattern: clonePattern(pattern), designId: id });
      setSelected(null);
      navigate('design');
    },
    [navigate],
  );
```

- [ ] **Step 5: Wire LibraryTab and render PatternDetail**

Change the library render (line ~143) from:

```typescript
        {tab === 'library' && (
          <LibraryTab onLoad={loadAndEdit} showToast={showToast} />
        )}
```

to:

```typescript
        {tab === 'library' && (
          <LibraryTab onSelect={(p, k) => setSelected({ pattern: p, patternKey: k })} showToast={showToast} />
        )}
```

Change the Design render (line ~165) to pass the handoff props:

```typescript
        {tab === 'design' && (
          <DesignTab
            onPlanArea={loadAndShowPlans}
            showToast={showToast}
            pendingMotif={pendingMotif}
            onConsumedMotif={() => setPendingMotif(null)}
          />
        )}
```

Add the panel just before the closing `{toast && ...}` line (line ~186), inside the
root `<div className="tt tt-linen">`:

```typescript
      <PatternDetail
        selection={selected}
        hasGroundTruth={selectionHasGt}
        onClose={() => setSelected(null)}
        onEdit={(p, k) => {
          loadAndEdit(p, k);
          setSelected(null);
        }}
        onPlan={(p, k) => {
          loadAndShowPlans(p, k);
          setSelected(null);
        }}
        onSubmitGroundTruth={(p, k) => {
          setPattern(p, k);
          navigate('gt');
          setSelected(null);
        }}
        onAddToDesign={addToDesign}
      />
```

- [ ] **Step 6: Verify typecheck and full test suite**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. If `loadAndEdit` is now only used inside the panel handler, that's fine —
it's still referenced. Remove no helpers.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/ui/LibraryTab.tsx
git commit -m "feat(library): open pattern detail panel on card click and wire actions"
```

---

## Task 9: Add descriptions to built-in patterns

**Files:**
- Modify: `src/patterns/builtin.ts` — add a `description` line to each entry of
  `BUILTIN_PATTERNS`.

- [ ] **Step 1: Add descriptions**

For each pattern object in `BUILTIN_PATTERNS` (e.g. `coffeeBean`, and each subsequent
motif), add a `description` field alongside `name`/`nameAr`. Write a one–two sentence,
factual description of what the motif depicts and its origin. Example for `coffeeBean`:

```typescript
  coffeeBean: {
    name: 'Coffee Bean (Habbet Binn)',
    nameAr: 'حبة البن',
    regionAr: 'الخليل',
    description:
      'A Hebron motif named for the coffee bean — a staple of Palestinian hospitality. The paired beans repeat down the panel as a vertical border.',
    width: 19,
    height: 46,
    // ...rest unchanged
```

Do this for every entry in `BUILTIN_PATTERNS`. Keep each description short and accurate;
where you are unsure of the cultural meaning, describe the visual form plainly (e.g.
"a row of triangular teeth above a solid band") rather than inventing symbolism.

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. (Descriptions are plain strings on an optional field.)

- [ ] **Step 3: Commit**

```bash
git add src/patterns/builtin.ts
git commit -m "content: add descriptions to built-in patterns"
```

---

## Task 10: Manual verification in the running app

**Files:** none (manual QA).

- [ ] **Step 1: Build to catch any remaining type errors**

Run: `npm run build`
Expected: PASS (tsc + vite build succeed).

- [ ] **Step 2: Run the app**

Run: `npm run dev`, open the printed localhost URL.

- [ ] **Step 3: Verify the panel and each action**

Check, and note pass/fail for each:
- Click a built-in card → slide-over opens with thumbnail, name/Arabic, description,
  details table (chart size, painted size, stitches, colour swatches, DMC list,
  ground-truth status). Backdrop click and Esc close it.
- Click a Tirazain card → panel shows, `source ↗` link present, description block
  absent (no description) — confirm it's simply hidden, no empty heading.
- **Edit** → lands in the Editor with the pattern loaded.
- **Plan** → lands in the Plans tab generating plans for the pattern.
- **Submit ground truth** → lands in the Ground truth tab with the pattern loaded.
- **Add to design → New design** → Design tab opens a new design with the motif placed
  as a new area at top-left.
- **Add to design → existing design** → Design tab opens that design with the motif
  added as a new area; previously-placed areas are still present.

- [ ] **Step 4: Commit any fixes**

If QA surfaces issues, fix them with focused commits referencing the specific behaviour,
then re-run the relevant check.

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** panel (Task 6/7/8), description field (Task 1, 9), details table via
  `patternStats` (Task 2), four actions wired (Task 8), Add-to-design handoff with
  picker + new-area placement (Tasks 3–6, 8), all three library sections open the panel
  (Task 8 step 1). Every spec section maps to a task.
- **Type consistency:** `placeMotif(design, entry, cx, cy)` and `MotifEntry { key, pattern }`
  are defined in Task 3 and used identically in Tasks 4, 5, 8. `pendingMotif` shape
  `{ key, pattern, designId }` matches between App (Task 8) and DesignTab (Task 5).
  `PatternDetailProps` (Task 6) matches the props App passes (Task 8 step 5).
- **No new state library:** all state stays in `App.tsx` `useState`, consistent with the
  codebase.
