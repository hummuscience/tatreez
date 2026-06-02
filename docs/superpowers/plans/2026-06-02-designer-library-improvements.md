# Designer & Library Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship seven independent Designer/Library UX improvements: eraser snaps an area to its content, area-move is gated to the Select tool, major/minor grid lines every 10 stitches, bilingual (English+Arabic) Designer buttons, a full-width canvas with all patterns in a strip below it, a Library "Other" category for uncategorized motifs, and a contact line in the footer.

**Architecture:** Each change is self-contained. Pure logic (`refitAreaToContent`, the "Other" category, the `drawGridLines` major-line option) is added with unit tests first (TDD via Vitest). UI wiring in `DesignTab.tsx`, `LibraryTab.tsx`, `App.tsx`, and `styles.css` is verified by typecheck + the existing test suite plus manual visual checks.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest, canvas 2D rendering. No new dependencies.

**Conventions:**
- Run a single test file: `npx vitest run src/project/design.test.ts`
- Run one test by name: `npx vitest run src/project/design.test.ts -t "refit"`
- Typecheck: `npm run typecheck`
- Full suite: `npm test`
- Bilingual labels follow the existing pattern: an English text node plus a sibling `<span dir="rtl">عربي</span>`, styled with a stacking CSS class. No i18n framework.

---

## Task 1: `refitAreaToContent` pure helper + tests

**Files:**
- Modify: `src/project/design.ts` (add export near `trimCells`, around line 316)
- Test: `src/project/design.test.ts`

Motifs inside an area carry their own local origin `(m.x, m.y)` relative to the area's top-left. Refitting must compute the painted bounding box in **area-local** coordinates across all motifs (and the repeat, if any), then shift the area's `x/y` by the box's top-left, set `w/h` to the box size, and re-base each motif's local position so stitches stay fixed on the global grid.

- [ ] **Step 1: Write the failing tests**

Add to `src/project/design.test.ts` (import `refitAreaToContent` and `type Area` — `Area` is already imported):

```ts
import { refitAreaToContent } from './design';

describe('refitAreaToContent', () => {
  const baseArea = (over: Partial<Area>): Area => ({
    id: 'a1', name: 'a', x: 0, y: 0, w: 0, h: 0, motifs: [], ...over,
  });

  it('shrinks the box to painted cells and keeps stitches on the global grid', () => {
    // Area at (10,10) sized 4x4, one motif at local (0,0) with a single
    // painted cell at local (1,1) → global (11,11).
    const area = baseArea({
      x: 10, y: 10, w: 4, h: 4,
      motifs: [{ patternKey: 'k', x: 0, y: 0, cells: [
        [0, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ] }],
    });
    const out = refitAreaToContent(area)!;
    expect(out.x).toBe(11);
    expect(out.y).toBe(11);
    expect(out.w).toBe(1);
    expect(out.h).toBe(1);
    // The single stitch is still at global (11,11): area (11,11) + motif (0,0) + cell (0,0).
    expect(out.motifs[0].x).toBe(0);
    expect(out.motifs[0].y).toBe(0);
    expect(out.motifs[0].cells).toEqual([[1]]);
  });

  it('only shifts the axis with margin', () => {
    // Painted column 0..1 across full height → trims width only.
    const area = baseArea({
      x: 5, y: 7, w: 3, h: 2,
      motifs: [{ patternKey: 'k', x: 0, y: 0, cells: [
        [1, 1, 0],
        [1, 1, 0],
      ] }],
    });
    const out = refitAreaToContent(area)!;
    expect(out.x).toBe(5);
    expect(out.y).toBe(7);
    expect(out.w).toBe(2);
    expect(out.h).toBe(2);
  });

  it('returns null when nothing is painted', () => {
    const area = baseArea({
      x: 0, y: 0, w: 2, h: 2,
      motifs: [{ patternKey: 'k', x: 0, y: 0, cells: [[0, 0], [0, 0]] }],
    });
    expect(refitAreaToContent(area)).toBeNull();
  });

  it('accounts for a motif with a non-zero local origin', () => {
    // Area 6x6 at (0,0); motif placed at local (2,2), one painted cell at
    // its (0,0) → area-local (2,2), global (2,2).
    const area = baseArea({
      x: 0, y: 0, w: 6, h: 6,
      motifs: [{ patternKey: 'k', x: 2, y: 2, cells: [[1]] }],
    });
    const out = refitAreaToContent(area)!;
    expect(out.x).toBe(2);
    expect(out.y).toBe(2);
    expect(out.w).toBe(1);
    expect(out.h).toBe(1);
    expect(out.motifs[0].x).toBe(0);
    expect(out.motifs[0].y).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/project/design.test.ts -t "refitAreaToContent"`
Expected: FAIL — `refitAreaToContent is not a function` (not exported yet).

- [ ] **Step 3: Implement `refitAreaToContent`**

Add to `src/project/design.ts` (place it just after `trimCells`, before the border section, ~line 316):

```ts
/**
 * Trim an area to the bounding box of its painted cells, shifting the area's
 * x/y so the remaining stitches stay fixed on the global design grid while
 * w/h shrink. Each motif's local position is re-based against the new origin.
 * Returns null if the area has no painted cells (caller should delete it).
 *
 * Coordinates: a cell painted in motif `m` at local cell (mx,my) lives at
 * area-local (m.x + mx, m.y + my); refitting finds the area-local bounding box
 * of all such painted cells. Areas with a `repeat` are returned unchanged —
 * the eraser can't edit a repeat, so there's nothing to refit.
 */
export function refitAreaToContent(area: Area): Area | null {
  if (area.repeat) return area;
  let top = Infinity;
  let left = Infinity;
  let bottom = -1;
  let right = -1;
  for (const m of area.motifs) {
    for (let y = 0; y < m.cells.length; y++) {
      const row = m.cells[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] > 0) {
          const ay = m.y + y;
          const ax = m.x + x;
          if (ay < top) top = ay;
          if (ay > bottom) bottom = ay;
          if (ax < left) left = ax;
          if (ax > right) right = ax;
        }
      }
    }
  }
  if (bottom < 0) return null; // nothing painted

  const motifs: PlacedMotif[] = area.motifs.map((m) => ({
    ...m,
    x: m.x - left,
    y: m.y - top,
    cells: m.cells.map((row) => row.slice()),
  }));
  return {
    ...area,
    x: area.x + left,
    y: area.y + top,
    w: right - left + 1,
    h: bottom - top + 1,
    motifs,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/project/design.test.ts -t "refitAreaToContent"`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/project/design.ts src/project/design.test.ts
git commit -m "feat(design): refitAreaToContent trims an area to its painted cells"
```

---

## Task 2: Wire eraser-stroke refit into the Designer

**Files:**
- Modify: `src/ui/DesignTab.tsx` — pointer handlers (`onPointerDown` ~1186, `onPointerUp` ~1379), interaction type, imports

The eraser stroke runs through `paintCellAt`, which mutates the top-most area at the cell and calls `onChange`. We record which area ids the stroke touched, then on pointer-up refit each touched area (and drop any that became empty) in a single `onChange`. The undo snapshot was already taken at stroke start by `snapshotForGesture()`, so the refit folds into the same undo entry — no extra `pushUndo`.

- [ ] **Step 1: Import the helper**

Find the import from `'../project/design'` in `DesignTab.tsx` and add `refitAreaToContent` to it. (Search for `from '../project/design'`.) Example resulting line:

```ts
import {
  // ...existing names...
  refitAreaToContent,
} from '../project/design';
```

- [ ] **Step 2: Track touched areas during an eraser stroke**

The pen/eraser branch of `onPointerDown` sets `interactionRef.current = { kind: 'paint', ... }`. Extend that interaction object with an `erasedAreaIds` set when erasing. Locate (around line 1186):

```ts
    if (toolRef.current === 'pen' || toolRef.current === 'eraser') {
      const [cx, cy] = cellAt(e.clientX, e.clientY);
      const isEraser = toolRef.current === 'eraser';
      const value: ColorIndex = isEraser ? 0 : (1 as ColorIndex); // placeholder; paintCellAt resolves
      paintCellAt(cx, cy, value, isEraser ? undefined : penColor);
      interactionRef.current = { kind: 'paint', value, color: isEraser ? undefined : penColor, lastCx: cx, lastCy: cy };
      return;
    }
```

Replace the last two lines (the `paintCellAt(...)` call stays) with a version that records the touched area and stores the set on the interaction:

```ts
      const touchedId = paintCellAt(cx, cy, value, isEraser ? undefined : penColor);
      interactionRef.current = {
        kind: 'paint',
        value,
        color: isEraser ? undefined : penColor,
        lastCx: cx,
        lastCy: cy,
        erasedAreaIds: isEraser && touchedId ? new Set([touchedId]) : undefined,
      };
      return;
```

- [ ] **Step 3: Make `paintCellAt` return the edited area id**

`paintCellAt` (defined ~line 1579) currently returns `void`. Change its signature and add a return at each `onChange(...)` exit that edits an existing area. Update the declaration:

```ts
  const paintCellAt = (
    cx: number, cy: number, value: ColorIndex, color?: PaletteColor,
  ): string | undefined => {
```

At each early `return;` that does NOT edit an area (out of bounds, eraser-on-empty no-op, repeat skip, empty-motif eraser no-op, motifIdx===-1 eraser no-op) change to `return undefined;`. At each `onChange({...})` that edits a known target area, return that area's id right after. There are three area-editing exits:

1. The "empty marker area, pen creates a motif" branch (`const next: Area = ...; onChange(...)`) — after its `onChange`, add `return a.id;` (where `a` is `design.areas[targetIdx]`).
2. The freehand-on-empty-canvas branch creates a NEW area — after its `onChange`, add `return area.id;`.
3. The final motif-edit branch (ends with `onChange({ ... areas: design.areas.map(... { ...a, motifs: nextMotifs } ...) })`) — after its `onChange`, add `return a.id;`.

For the eraser, only branch 3 (and possibly branch 1, which is pen-only) is reachable, but returning the id from all area-editing exits is correct and harmless.

- [ ] **Step 4: Accumulate touched ids across drag in `onPointerMove`**

The paint drag continues in `onPointerMove` where `it.kind === 'paint'` (around line 1331–1349). Each `paintCellAt` call there should add its returned id into `it.erasedAreaIds` when erasing. Find the two `paintCellAt(...)` calls inside the `it.kind === 'paint'` block and wrap each so the id is collected. Example for the line-fill loop call:

```ts
          const id = paintCellAt(x0, y0, it.value, it.color);
          if (it.erasedAreaIds && id) it.erasedAreaIds.add(id);
```

and for the trailing single call:

```ts
      const id2 = paintCellAt(cx, cy, it.value, it.color);
      if (it.erasedAreaIds && id2) it.erasedAreaIds.add(id2);
```

(Names `id`/`id2` just avoid shadowing — adjust to the actual surrounding code; the point is: capture the return and add to `it.erasedAreaIds`.)

- [ ] **Step 5: Refit on pointer-up**

In `onPointerUp` (~line 1379), after `const it = interactionRef.current; interactionRef.current = null; if (!it) return;`, add a branch for the eraser paint case. Add this near the top of the handler, after the `if (!it) return;` line:

```ts
    if (it.kind === 'paint' && it.erasedAreaIds && it.erasedAreaIds.size > 0) {
      // Eraser stroke finished: refit each touched area to its painted cells,
      // dropping any area that was fully erased. Folds into the stroke's
      // existing undo snapshot (no extra pushUndo).
      const ids = it.erasedAreaIds;
      const nextAreas = design.areas
        .map((a) => (ids.has(a.id) ? refitAreaToContent(a) : a))
        .filter((a): a is NonNullable<typeof a> => a != null);
      if (nextAreas.length !== design.areas.length ||
          nextAreas.some((a, i) => a !== design.areas[i])) {
        onChange({ ...design, areas: nextAreas });
      }
      draw();
      return;
    }
```

- [ ] **Step 6: Extend the interaction type**

Find the union type for `interactionRef` (search for `kind: 'paint'` in a type/interface, or the `useRef<...>` for `interactionRef`). Add the optional field to the paint variant:

```ts
    | { kind: 'paint'; value: ColorIndex; color?: PaletteColor; lastCx: number; lastCy: number; erasedAreaIds?: Set<string> }
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, open the Designer, place a motif, switch to Eraser, erase an edge row of stitches, lift the pointer. Expected: the area rectangle shrinks to hug the remaining stitches; remaining stitches do not move. Erase everything → the area disappears. Undo (Ctrl/Cmd-Z) once restores the pre-stroke state in a single step.

- [ ] **Step 9: Commit**

```bash
git add src/ui/DesignTab.tsx
git commit -m "feat(design): eraser snaps the area to its remaining stitches on stroke end"
```

---

## Task 3: Gate area drag-move on the Select tool

**Files:**
- Modify: `src/ui/DesignTab.tsx` — the area-hit branch in `onPointerDown` (~line 1249–1265)

The plain-click area-hit branch currently always sets `interactionRef.current = { kind: 'move', ... }`. Gate the move-start on the Select tool while keeping selection (so the inspector still reflects a tapped area in any tool).

- [ ] **Step 1: Edit the area-hit branch**

Locate (around line 1257–1265):

```ts
      // Plain click: if it's already selected, keep the whole selection (so a
      // group drag moves all); otherwise select just this one.
      if (!selectedIds.has(hit.id)) selectOne(hit.id);
      else setActiveAreaId(hit.id);
      interactionRef.current = { kind: 'move', areaId: hit.id, offX: cx - hit.x, offY: cy - hit.y };
```

Replace the last line with a Select-gated move start:

```ts
      // Plain click: if it's already selected, keep the whole selection (so a
      // group drag moves all); otherwise select just this one.
      if (!selectedIds.has(hit.id)) selectOne(hit.id);
      else setActiveAreaId(hit.id);
      // Moving an area requires the Select tool. With Pen/Eraser active the
      // tap above still selects (so the inspector updates), but the drag does
      // not grab the area — pointer-move paints/erases instead.
      if (toolRef.current === 'select') {
        interactionRef.current = { kind: 'move', areaId: hit.id, offX: cx - hit.x, offY: cy - hit.y };
      }
```

Also update the comment block right above the `if (additive)` line (currently says "always allow selection + move, regardless of the current tool") to reflect the new behavior:

```ts
      // Hitting a painted cell of an area: selection is allowed in any tool,
      // but starting a move-drag requires the Select tool (see below). The
      // tight-fit hit-test ensures we only land here on a clear grab intent.
```

Note: with Pen/Eraser active, the pen/eraser branch earlier in `onPointerDown` (`if (toolRef.current === 'pen' || toolRef.current === 'eraser')`) returns before reaching this area-hit code — so this branch is only reached under Select or the inert `'none'`/border paths. The `toolRef.current === 'select'` guard therefore also prevents a move under the inert `'none'` tool, which is the desired "inert canvas by default" behavior (cf. commit a91205a).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. With the Pen tool active, press on an existing area and drag — expected: it paints (does not move). With Eraser active, dragging on an area erases (does not move). Switch to Select — dragging an area moves it as before.

- [ ] **Step 4: Commit**

```bash
git add src/ui/DesignTab.tsx
git commit -m "feat(design): area drag-move requires the Select tool"
```

---

## Task 4: Major + minor grid lines (every 10)

**Files:**
- Modify: `src/ui/canvasUtil.ts` — `drawGridLines` (~line 70)
- Modify: `src/ui/DesignTab.tsx` — the `drawGridLines(...)` call (~line 651)
- Test: `src/ui/canvasUtil.test.ts` (create if absent)

Extend `drawGridLines` with an optional options object so existing callers (Editor, GroundTruth, Import) are untouched. The Design tab passes `{ major: 10 }`.

- [ ] **Step 1: Write a failing test for the major-line option**

Check whether `src/ui/canvasUtil.test.ts` exists: `ls src/ui/canvasUtil.test.ts`. If absent, create it. Use a stub 2D context that records `strokeStyle`/`lineWidth` at each `stroke()` call:

```ts
import { describe, expect, it } from 'vitest';
import { drawGridLines } from './canvasUtil';

function recordingCtx() {
  const calls: { style: string; width: number }[] = [];
  const ctx = {
    strokeStyle: '#000',
    lineWidth: 1,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { calls.push({ style: String(this.strokeStyle), width: this.lineWidth }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('drawGridLines major option', () => {
  it('draws every 10th line with the major style/width', () => {
    const { ctx, calls } = recordingCtx();
    // 20x1 grid → vertical lines at i=0..20, horizontal at j=0..1.
    drawGridLines(ctx, 4, 20, 1, 'rgba(0,0,0,0.06)', {
      major: 10, majorColor: 'rgba(0,0,0,0.22)', majorWidth: 2,
    });
    const major = calls.filter((c) => c.style === 'rgba(0,0,0,0.22)');
    // Vertical majors at i=0,10,20 (3) + horizontal majors at j=0 (1) = 4.
    expect(major.length).toBe(4);
    for (const c of major) expect(c.width).toBe(2);
    // Minor lines use the base style at width 1.
    const minor = calls.filter((c) => c.style === 'rgba(0,0,0,0.06)');
    expect(minor.every((c) => c.width === 1)).toBe(true);
  });

  it('without options behaves like the old single-style grid', () => {
    const { ctx, calls } = recordingCtx();
    drawGridLines(ctx, 4, 2, 2, '#abc');
    expect(calls.length).toBe((2 + 1) + (2 + 1)); // 6 lines
    expect(calls.every((c) => c.style === '#abc' && c.width === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/canvasUtil.test.ts`
Expected: FAIL — the major test sees 0 major-styled calls (option ignored).

- [ ] **Step 3: Implement the major-line option**

Replace `drawGridLines` in `src/ui/canvasUtil.ts` (lines 70–93) with:

```ts
export function drawGridLines(
  ctx: CanvasRenderingContext2D,
  cs: number,
  gridW: number,
  gridH: number,
  color = 'rgba(0,0,0,0.1)',
  opts?: { major?: number; majorColor?: string; majorWidth?: number },
): void {
  ctx.save();
  const major = opts?.major ?? 0;
  const majorColor = opts?.majorColor ?? 'rgba(0,0,0,0.22)';
  const majorWidth = opts?.majorWidth ?? 2;
  const isMajor = (i: number) => major > 0 && i % major === 0;
  // Minor lines first, then major lines on top so intersections read cleanly.
  for (const pass of ['minor', 'major'] as const) {
    if (pass === 'minor') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
    } else {
      if (major <= 0) break;
      ctx.strokeStyle = majorColor;
      ctx.lineWidth = majorWidth;
    }
    for (let i = 0; i <= gridW; i++) {
      if ((pass === 'major') !== isMajor(i)) continue;
      ctx.beginPath();
      ctx.moveTo(i * cs, 0);
      ctx.lineTo(i * cs, gridH * cs);
      ctx.stroke();
    }
    for (let i = 0; i <= gridH; i++) {
      if ((pass === 'major') !== isMajor(i)) continue;
      ctx.beginPath();
      ctx.moveTo(0, i * cs);
      ctx.lineTo(gridW * cs, i * cs);
      ctx.stroke();
    }
  }
  ctx.restore();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/canvasUtil.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Opt the Design tab into major lines**

In `src/ui/DesignTab.tsx` (~line 651) the call is:

```ts
    drawGridLines(ctx, cs, design.gridW, design.gridH, 'rgba(0,0,0,0.06)');
```

Change it to pass the major-line option:

```ts
    drawGridLines(ctx, cs, design.gridW, design.gridH, 'rgba(0,0,0,0.06)', {
      major: 10,
      majorColor: 'rgba(0,0,0,0.22)',
      majorWidth: 2,
    });
```

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass (existing Editor/GroundTruth/Import callers still compile since `opts` is optional).

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open the Designer. Expected: every 10th grid line is visibly darker and thicker than the 1-stitch lines.

- [ ] **Step 8: Commit**

```bash
git add src/ui/canvasUtil.ts src/ui/canvasUtil.test.ts src/ui/DesignTab.tsx
git commit -m "feat(design): major grid lines every 10 stitches, darker and thicker"
```

---

## Task 5: Library "Other" category for uncategorized motifs

**Files:**
- Modify: `src/ui/patternFilters.ts` — `Category` type, `CATEGORY_FILTERS`, add `categoriesOfWithOther`
- Modify: `src/ui/LibraryTab.tsx` — use the with-other variant for `cats` and counts
- Test: `src/ui/patternFilters.test.ts` (create if absent)

`categoriesOf` returns `[]` for a motif matching no rule, which makes it invisible under any active category filter. Add an `'other'` bucket computed as "matched nothing".

- [ ] **Step 1: Write failing tests**

Check `ls src/ui/patternFilters.test.ts`. Create it (or append) with:

```ts
import { describe, expect, it } from 'vitest';
import { categoriesOfWithOther, CATEGORY_FILTERS } from './patternFilters';
import type { Pattern } from '../engine/types';

const pat = (name: string): Pattern => ({
  name, width: 1, height: 1, cells: [[0]], palette: [null],
});

describe('categoriesOfWithOther', () => {
  it('returns ["other"] when no subject rule matches', () => {
    expect(categoriesOfWithOther(pat('Zzz Qabbeh Panel'))).toEqual(['other']);
  });

  it('returns the matched categories (never other) when something matches', () => {
    const cats = categoriesOfWithOther(pat('Cypress Tree Sarwa'));
    expect(cats).toContain('plants');
    expect(cats).not.toContain('other');
  });

  it('includes an "other" entry in the filter chip list', () => {
    expect(CATEGORY_FILTERS.some(([k]) => k === 'other')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/patternFilters.test.ts`
Expected: FAIL — `categoriesOfWithOther` is not exported and no `'other'` chip exists.

- [ ] **Step 3: Add `'other'` to the type and chip list**

In `src/ui/patternFilters.ts`, extend the `Category` union (around line 178) to add `| 'other'`:

```ts
export type Category =
  | 'plants'
  | 'animals'
  | 'flowers'
  | 'celestial'
  | 'geometric'
  | 'objects'
  | 'architecture'
  | 'amulets'
  | 'food'
  | 'other';
```

`CATEGORY_RULES` stays as-is (no rule for `other` — it has no keywords). After the `CATEGORY_FILTERS` definition (around line 261), append the Other chip so it renders last:

```ts
/** [key, label, labelAr] in display order — for rendering the chip row.
 * "Other" is appended manually: it has no keyword rule (it means "matched
 * nothing"), so it isn't in CATEGORY_RULES. */
export const CATEGORY_FILTERS: Array<[Category, string, string]> = [
  ...CATEGORY_RULES.map((r): [Category, string, string] => [r.key, r.label, r.labelAr]),
  ['other', 'Other', 'أخرى'],
];
```

(Replace the existing `CATEGORY_FILTERS` const — do not leave the old `.map(...)`-only version.)

- [ ] **Step 4: Add `categoriesOfWithOther`**

After `categoriesOf` (around line 273), add:

```ts
/**
 * Like {@link categoriesOf}, but a motif that matches no subject rule is
 * bucketed into `['other']` instead of an empty list — so the "Other" filter
 * chip surfaces exactly the motifs no keyword rule catches, and nothing is
 * unreachable when a category filter is active.
 */
export function categoriesOfWithOther(p: Pattern): Category[] {
  const cats = categoriesOf(p);
  return cats.length > 0 ? cats : ['other'];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/ui/patternFilters.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Use the with-other variant in LibraryTab**

In `src/ui/LibraryTab.tsx`:
- Update the import to add `categoriesOfWithOther` alongside `categoriesOf`.
- Line ~116 (`cats: categoriesOf(p)`) → `cats: categoriesOfWithOther(p)`.
- Line ~125–126 builds the count map from `CATEGORY_FILTERS`; it already iterates `for (const [key] of CATEGORY_FILTERS) counts[key] = 0;` then tallies `for (const c of e.cats) counts[c]++;`. Since `CATEGORY_FILTERS` now includes `other`, the count map and chip render pick it up automatically. No further change needed there.

(`categoriesOf` may now be unused in LibraryTab — if so, drop it from the import to avoid an unused-symbol lint/type error. Verify with typecheck.)

- [ ] **Step 7: Typecheck + suite**

Run: `npm run typecheck && npm test`
Expected: no errors; all tests pass.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, open the Library tab. Expected: an "Other / أخرى" chip appears at the end of the category row; selecting it shows motifs whose names match no subject keyword (and they are no longer lost when other category chips are selected).

- [ ] **Step 9: Commit**

```bash
git add src/ui/patternFilters.ts src/ui/patternFilters.test.ts src/ui/LibraryTab.tsx
git commit -m "feat(library): Other category surfaces motifs matching no subject rule"
```

---

## Task 6: Designer category chips include "Other" (shared list)

**Files:**
- Modify: `src/ui/DesignTab.tsx` — library filtering by category (~line 2166 chip render, plus wherever `filteredLib` filters by `fCats`)

The Designer renders `CATEGORY_FILTERS` for its category chips (line ~2166). Because Task 5 added `other` to `CATEGORY_FILTERS`, the chip appears automatically. We must ensure the Designer's filter predicate buckets uncategorized motifs into `other` too, mirroring LibraryTab — otherwise selecting "Other" in the Designer matches nothing.

- [ ] **Step 1: Find the Designer's category filter predicate**

Search `DesignTab.tsx` for `categoriesOf` and `fCats`:

Run: `grep -n "categoriesOf\|fCats" src/ui/DesignTab.tsx`

Identify where `filteredLib` filters each library entry against the selected category set `fCats`.

- [ ] **Step 2: Use `categoriesOfWithOther` in that predicate**

Update the import from `'./patternFilters'` to include `categoriesOfWithOther`, and change the per-entry category computation used by the `fCats` filter from `categoriesOf(entry.pattern)` to `categoriesOfWithOther(entry.pattern)`. Concretely, the filter test becomes "entry matches if `fCats` is empty OR `categoriesOfWithOther(entry.pattern).some((c) => fCats.has(c))`". (If `categoriesOf` becomes unused in DesignTab, drop it from the import.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the Designer, scroll to the category chips. Expected: an "Other" chip is present; selecting it filters the library cards to uncategorized motifs.

- [ ] **Step 5: Commit**

```bash
git add src/ui/DesignTab.tsx
git commit -m "feat(design): Designer category filter buckets uncategorized motifs into Other"
```

---

## Task 7: Full-width canvas with all patterns in a strip below

**Files:**
- Modify: `src/ui/DesignTab.tsx` — composer body JSX (~line 2281–2445), motif partitioning (~line 2042–2060)
- Modify: `src/styles.css` — `.design-body-l`, `.design-motif-strip`, related

Today the library cards are split into a left column, a right arm under the inspector, and a bottom strip to flank the canvas. The request: canvas takes the full width and **all** matching patterns sit in a strip below it (the filter bar already lives above, in `design-filterbar`, which we keep). Remove the left column and right arm; route all filtered library cards to the bottom strip.

- [ ] **Step 1: Collapse motif partitioning to a single bottom list**

In `DesignTab.tsx` (~line 2042–2060), replace the left/right/bottom split:

```ts
  const canvasPx = displayedCanvasH;
  const leftCount = Math.max(3, Math.floor(canvasPx / CARD_PX));
  const rightCount = Math.max(0, Math.floor((canvasPx - 300) / CARD_PX));
  const BOTTOM_ROWS = 3;
  const bottomCount = BOTTOM_ROWS * 10;

  const leftMotifs = filteredLib.slice(0, leftCount);
  const rightMotifs = filteredLib.slice(leftCount, leftCount + rightCount);
  const bottomMotifs = filteredLib.slice(
    leftCount + rightCount,
    leftCount + rightCount + bottomCount,
  );
  const totalShown = Math.min(
    filteredLib.length,
    leftCount + rightCount + bottomCount,
  );
```

with a single bottom list that shows every filtered (searched) pattern:

```ts
  // All filtered (searched) patterns render in the full-width strip below the
  // canvas. Show the whole filtered set — the user asked to see all the
  // search results, not a slice.
  const bottomMotifs = filteredLib;
  const totalShown = filteredLib.length;
```

(If `CARD_PX` becomes unused after this, leave it — it may be referenced elsewhere; verify with typecheck and only remove if the compiler flags it.)

- [ ] **Step 2: Remove the left column and right arm from the body JSX**

In the composer body (~line 2281–2432):
- Delete the `{showPatterns && (<aside className="design-motif-col" ...>...</aside>)}` block (the left column, ~2284–2294).
- Delete the right-arm block inside the inspector aside: `{showPatterns && rightMotifs.length > 0 && (<div className="design-motif-col design-motif-col-right" ...>...</div>)}` (~2420–2429).

Leave the `design-canvas-wrap` and the `design-inspector` aside intact. The body row now contains just the canvas and (when shown) the inspector.

- [ ] **Step 3: Confirm the bottom strip renders all cards**

The bottom strip block (~2435) already maps `bottomMotifs`:

```tsx
      {showPatterns && bottomMotifs.length > 0 && (
        <div className="design-motif-strip">
          {bottomMotifs.map((l) => (
            <MotifCard key={l.key} entry={l} armed={armedKey === l.key} onArm={armMotif} />
          ))}
        </div>
      )}
```

Since `bottomMotifs = filteredLib`, this now shows all search results. No change needed beyond Step 1. If there is a "showing N of M" count or a "show all" control tied to `totalShown`, ensure it reads sensibly (it now equals `filteredLib.length`).

- [ ] **Step 4: Make the canvas span full width in CSS**

In `src/styles.css`, the body row layout lives under `.design-body-l` (search for it). Ensure it is a flex row of `[canvas | inspector]` where the canvas grows:

```css
.design-body-l { display: flex; gap: 16px; align-items: flex-start; }
.design-body-l .design-canvas-wrap { flex: 1 1 auto; min-width: 0; }
.design-body-l .design-inspector { flex: 0 0 auto; }
.design-body-l-no-inspector .design-canvas-wrap { flex: 1 1 100%; }
```

(Adjust to merge with existing rules rather than duplicate — search for the existing `.design-body-l` / `.design-canvas-wrap` declarations and edit them. The goal: with the left column gone, the canvas wrap fills the row width left of the inspector, and full width when the inspector is hidden.)

Make the bottom strip span the full composer width and wrap into rows:

```css
.design-motif-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  width: 100%;
}
```

(Edit the existing `.design-motif-strip` rule at line ~627 — keep `.design-motif-strip .design-lib-card { width: 104px; }`.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If `leftMotifs`/`rightMotifs`/`rightCount`/`leftCount`/`bottomCount`/`BOTTOM_ROWS` are now unused, remove their declarations — the compiler/lint will point to them.)

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open the Designer with the Patterns library on. Expected: the canvas spans the full width (no left column of cards); the inspector remains on the right; all searched patterns appear in a full-width wrapping strip below the canvas. The search/filter bar remains above the canvas.

- [ ] **Step 7: Commit**

```bash
git add src/ui/DesignTab.tsx src/styles.css
git commit -m "feat(design): full-width canvas with all patterns in a strip below"
```

---

## Task 8: Bilingual (English + Arabic) Designer buttons

**Files:**
- Modify: `src/ui/DesignTab.tsx` — tool buttons (~line 2065–2120) and the Border button (~line 2363) and Fit button (~line 2357)
- Modify: `src/styles.css` — add a `.btn-bi` stacking rule

Add Arabic sub-labels under the English on the Designer's tool and action buttons, following the existing `<span dir="rtl">` convention.

- [ ] **Step 1: Add the stacking CSS**

In `src/styles.css`, add:

```css
/* Bilingual button: English on top, smaller muted Arabic beneath. */
.btn-bi { display: inline-flex; flex-direction: column; align-items: center; line-height: 1.1; }
.btn-bi .btn-bi-ar { font-size: 0.72em; opacity: 0.72; margin-top: 1px; }
```

- [ ] **Step 2: Bilingualize the tool buttons**

In `DesignTab.tsx` the tool buttons (~2065–2120) render text like `Select`, `Pen`, `Eraser`. For each, wrap the label in the bilingual structure. Example for the Select button (~2068) — its current child is the English label; replace that child with:

```tsx
        <span className="btn-bi">
          Select
          <span className="btn-bi-ar" dir="rtl">تحديد</span>
        </span>
```

Apply the same pattern with these Arabic terms:

| Button | English | Arabic |
|--------|---------|--------|
| Select | Select  | تحديد  |
| Pen    | Pen     | قلم    |
| Eraser | Eraser  | ممحاة  |

(Find each button's text child in the toolbar block and wrap it. Keep the existing `className`, `aria-pressed`, and `onClick` on the `<button>` — only the inner text changes.)

- [ ] **Step 3: Bilingualize the Border and Fit buttons**

The Border button (~2363) shows `{borderMode ? 'Border ✓' : '+ Border'}`. Replace its child with a bilingual span (keep the ✓/+ state on the English line):

```tsx
              <span className="btn-bi">
                {borderMode ? 'Border ✓' : '+ Border'}
                <span className="btn-bi-ar" dir="rtl">حاشية</span>
              </span>
```

The Fit button in the zoom row (~2357, text `Fit`):

```tsx
                <span className="btn-bi">
                  Fit
                  <span className="btn-bi-ar" dir="rtl">ملاءمة</span>
                </span>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open the Designer. Expected: Select/Pen/Eraser/Border/Fit buttons each show English with the Arabic term beneath, the Arabic smaller and right-to-left. Active/pressed states still work.

- [ ] **Step 6: Commit**

```bash
git add src/ui/DesignTab.tsx src/styles.css
git commit -m "feat(design): bilingual English+Arabic labels on Designer buttons"
```

---

## Task 9: Contact line in the app footer

**Files:**
- Modify: `src/App.tsx` — the existing `<footer className="tt-foot">` (~line 232–244)
- Modify: `src/styles.css` — minor footer styling if needed

There is already a footer on every tab. Add a suggestions/contact line with a `mailto:` link to `muad.abdelhay@gmail.com`, in English + Arabic.

- [ ] **Step 1: Add the contact line to the footer**

In `src/App.tsx`, inside the existing `<footer className="tt-foot">` (~232), add a contact span. Replace the footer block with:

```tsx
      <footer className="tt-foot">
        <span>Tatreez stitch planner — Linen &amp; Thread</span>
        <span className="tt-foot-contact">
          Have a suggestion? Email us:{' '}
          <a href="mailto:muad.abdelhay@gmail.com">muad.abdelhay@gmail.com</a>
          <span className="tt-foot-contact-ar" dir="rtl"> · هل لديك اقتراح؟ راسلونا</span>
        </span>
        <span className="tt-foot-r">
          Built with attribution to{' '}
          <a
            href="https://tirazain.com/archive/"
            target="_blank"
            rel="noopener noreferrer"
          >
            tirazain.com
          </a>
        </span>
      </footer>
```

- [ ] **Step 2: Optional footer styling**

If the three footer spans crowd on one line, add to `src/styles.css` (only if the existing `.tt-foot` doesn't already wrap gracefully — check first):

```css
.tt-foot-contact { opacity: 0.85; }
.tt-foot-contact-ar { opacity: 0.7; }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Expected: every tab's footer shows "Have a suggestion? Email us: muad.abdelhay@gmail.com" with the Arabic line; clicking the address opens a mail composer.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: contact line in footer inviting email suggestions"
```

---

## Final verification

- [ ] **Step 1: Full typecheck + test suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: clean production build.

- [ ] **Step 3: Manual smoke pass**

Run: `npm run dev` and walk through all seven changes once more: eraser snap, move-gated-to-Select, major grid lines, bilingual buttons, full-width canvas + bottom gallery, Library "Other" chip, footer contact line.
