# Design Page Motif-Anchored UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move per-motif controls onto a floating toolbar anchored to the selected motif, collapse rarely-used canvas settings behind a disclosure, relocate the pattern search below the canvas, and give tablets a real breakpoint — so the canvas stops being squeezed between four permanent full-width bands.

**Architecture:** A new `MotifBar` React component is absolutely positioned inside `.design-canvas-wrap` (which is already `position: relative`). Its placement is computed by a **pure function** in a separate module so it can be unit-tested without a DOM. Two canvas-drawn hit tests (delete `×`, rotate handle) are deleted and replaced by real `<button>`s on the bar. `AreaInspector` is extracted from `DesignTab.tsx` into its own file so both a wide-screen panel and a narrow-screen bottom sheet can render it. No data shapes change — this is presentation only.

**Tech Stack:** React 18, TypeScript, Vite, Vitest (no jsdom — tests are pure-function only; see Global Constraints), plain CSS in a single `src/styles.css`.

**Spec:** `docs/superpowers/specs/2026-08-31-design-page-motif-anchored-ux-design.md`

## Global Constraints

- **Test runner:** `npm test` (vitest run). Single test: `npx vitest run src/ui/motifBar.test.ts`.
- **Typecheck:** `npm run typecheck` must pass before every commit. The deploy workflow gates on typecheck + tests, so a red build never reaches the site.
- **No jsdom in this repo.** Tests are pure-function tests only. Do NOT add `@testing-library/react` or jsdom — component rendering is verified manually by running the app. Existing test style: `import { describe, expect, it } from 'vitest'` with hand-rolled stubs (see `src/ui/canvasUtil.test.ts`).
- **No new runtime dependencies.** `package.json` dependencies stay exactly `react` and `react-dom`. Adding anything to the lockfile that is not in `package.json` breaks the deploy's `npm ci` tidiness.
- **Bilingual labels** follow the existing convention: `<span className="btn-bi">English<span className="btn-bi-ar" dir="rtl" lang="ar" aria-hidden="true">عربي</span></span>`. Icon-only buttons need an `aria-label` and a `title` instead.
- **Touch targets** in the motif bar and canvas cluster are ≥44×44 CSS px.
- **Commit style:** conventional commits (`feat(design):`, `refactor(design):`, `test(design):`). Every commit message ends with the two trailer lines used across this repo:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL
  ```
- **Do not push.** The user pushes; a push to `main` triggers a live GitHub Pages deploy.

## Coordinate systems — read this before Task 1

Getting this wrong is the single most likely source of a misplaced bar. Three spaces are in play:

1. **Grid cells** — `Area.x/y/w/h` and the return of `selectionBox()` (`DesignTab.tsx:856`) are in *cells*, not pixels.
2. **Canvas backing pixels** — cells map to canvas pixels as `px = GUTTER + cell * cs`, where `GUTTER = 18` (`canvasUtil.ts:10`) and `cs = cellSize(canvasW - GUTTER, canvasH - GUTTER, gridW, gridH)` (`DesignTab.tsx:648`).
3. **CSS pixels** — the canvas element is CSS-scaled. `pointerPx` (`:788`) derives `scale = r.width / canvas.width`. The bar is positioned in CSS px inside `.design-canvas-wrap`, so backing pixels must be multiplied by this scale.

**Why `GUTTER` appears in some places and not others:** the draw code calls
`ctx.translate(GUTTER, GUTTER)` (`DesignTab.tsx:675`) before drawing, so helpers
that run *inside* that translated space (e.g. `deleteButtonCenter`, `:660`) use a
bare `cell * cs` with no gutter term. `selectionBoxCss` below runs *outside* it and
must add `GUTTER` itself. Both are correct for their context — do not "harmonise" them.

The canvas also lives inside `.design-canvas-scroll`, so a scrolled canvas shifts the visual position. `MotifBar` therefore takes an already-converted **CSS-pixel box relative to the wrapper** — `DesignTab` does the conversion, `MotifBar` only places itself. This keeps the pure function free of DOM concerns.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/ui/motifBar.ts` (new) | `placeMotifBar` — pure placement math, no React, no DOM |
| `src/ui/motifBar.test.ts` (new) | Unit tests for `placeMotifBar` |
| `src/ui/MotifBar.tsx` (new) | The React toolbar: 6 buttons, positioned via `placeMotifBar` |
| `src/ui/AreaInspector.tsx` (new) | Extracted from `DesignTab.tsx:2891`; unchanged behavior, minus transform chips |
| `src/ui/DesignTab.tsx` (modify) | Wire the bar, delete two hit tests, relocate filter bar, collapse cloth bar |
| `src/styles.css` (modify) | `.motif-bar`, `.design-canvas-cluster`, sheet styles, tablet breakpoint |

Tasks are ordered so each leaves the app working and committable. Tasks 1–2 add code that nothing renders yet (zero risk). Task 3 is the first user-visible change.

---

### Task 1: Pure placement math

**Files:**
- Create: `src/ui/motifBar.ts`
- Test: `src/ui/motifBar.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `placeMotifBar(box, bar, viewport, gap?) => { left: number; top: number; placement: 'above' | 'below' }` and the exported type `Box = { x: number; y: number; w: number; h: number }`. Task 2 imports both.

- [ ] **Step 1: Write the failing test**

Create `src/ui/motifBar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { placeMotifBar } from './motifBar';

const BAR = { w: 200, h: 40 };
const VIEW = { w: 800, h: 600 };

describe('placeMotifBar', () => {
  it('sits above the box, horizontally centred, when there is room', () => {
    const r = placeMotifBar({ x: 300, y: 200, w: 100, h: 100 }, BAR, VIEW);
    expect(r.placement).toBe('above');
    // 200 (box.y) - 40 (bar.h) - 8 (gap) = 152
    expect(r.top).toBe(152);
    // centre 350 - 100 (half bar) = 250
    expect(r.left).toBe(250);
  });

  it('flips below when the box is too close to the top edge', () => {
    const r = placeMotifBar({ x: 300, y: 10, w: 100, h: 100 }, BAR, VIEW);
    expect(r.placement).toBe('below');
    // 10 + 100 + 8 = 118
    expect(r.top).toBe(118);
  });

  it('pins to the top when neither above nor below fits', () => {
    // A box taller than the viewport: above clips (<0) and below clips (>view.h).
    const r = placeMotifBar({ x: 300, y: 0, w: 100, h: 900 }, BAR, VIEW);
    expect(r.placement).toBe('above');
    expect(r.top).toBe(0);
  });

  it('clamps at the left edge', () => {
    const r = placeMotifBar({ x: 0, y: 200, w: 20, h: 100 }, BAR, VIEW);
    expect(r.left).toBe(0);
  });

  it('clamps at the right edge', () => {
    const r = placeMotifBar({ x: 780, y: 200, w: 20, h: 100 }, BAR, VIEW);
    // 800 - 200 = 600
    expect(r.left).toBe(600);
  });

  it('never returns a negative left when the bar is wider than the viewport', () => {
    const r = placeMotifBar({ x: 10, y: 200, w: 20, h: 100 }, { w: 900, h: 40 }, VIEW);
    expect(r.left).toBe(0);
  });

  it('honours a custom gap', () => {
    const r = placeMotifBar({ x: 300, y: 200, w: 100, h: 100 }, BAR, VIEW, 20);
    expect(r.top).toBe(140);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/motifBar.test.ts`
Expected: FAIL — `Failed to resolve import "./motifBar"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/motifBar.ts`:

```ts
/** A rectangle in CSS pixels, relative to the canvas wrapper. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gap in CSS px between the selection box and the bar. */
export const MOTIF_BAR_GAP = 8;

/**
 * Place the motif toolbar just outside a selection box.
 *
 * Prefers sitting above the selection (where it never covers the motif the
 * user is looking at). Flips below when the box hugs the top edge, and pins
 * to the top when the box is so tall that neither side fits — a bar that is
 * awkwardly placed is still better than one the user cannot reach.
 *
 * Horizontally the bar centres on the box, then clamps into the viewport so
 * a motif near either edge still gets a fully visible toolbar.
 */
export function placeMotifBar(
  box: Box,
  bar: { w: number; h: number },
  viewport: { w: number; h: number },
  gap: number = MOTIF_BAR_GAP,
): { left: number; top: number; placement: 'above' | 'below' } {
  const above = box.y - bar.h - gap;
  const below = box.y + box.h + gap;

  let top: number;
  let placement: 'above' | 'below';
  if (above >= 0) {
    top = above;
    placement = 'above';
  } else if (below + bar.h <= viewport.h) {
    top = below;
    placement = 'below';
  } else {
    // Neither side fits (a selection taller than the viewport): pin to the
    // top edge so the bar stays on screen and reachable.
    top = 0;
    placement = 'above';
  }

  const centred = box.x + box.w / 2 - bar.w / 2;
  // Math.max(0, …) wins over the upper clamp when the bar is wider than the
  // viewport, so `left` is never negative.
  const left = Math.max(0, Math.min(centred, viewport.w - bar.w));

  return { left, top, placement };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/motifBar.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/ui/motifBar.ts src/ui/motifBar.test.ts
git commit -m "feat(design): pure placement math for the motif toolbar

placeMotifBar prefers above, flips below near the top edge, pins to the
top when a selection is taller than the viewport, and clamps horizontally
so a motif at either edge still gets a fully visible bar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

### Task 2: The MotifBar component

**Files:**
- Create: `src/ui/MotifBar.tsx`
- Modify: `src/styles.css` (append `.motif-bar` rules)

**Interfaces:**
- Consumes: `placeMotifBar`, `Box`, `MOTIF_BAR_GAP` from Task 1.
- Produces: `export default function MotifBar(props: MotifBarProps)` with the exact prop names listed below. Task 3 renders it.

Nothing imports this component yet, so the app is unchanged after this task.

- [ ] **Step 1: Write the component**

Create `src/ui/MotifBar.tsx`:

```tsx
import { useLayoutEffect, useRef, useState } from 'react';
import { type Box, placeMotifBar } from './motifBar';

export interface MotifBarProps {
  /**
   * Selection bounding box in CSS pixels, relative to the canvas wrapper,
   * or null when nothing is selected (the bar renders nothing).
   */
  box: Box | null;
  /** Wrapper size in CSS px, used to clamp the bar into view. */
  viewport: { w: number; h: number };
  /** True mid-gesture (drag / pinch) so the bar never chases the finger. */
  hidden: boolean;
  /** Number of selected areas — the ⋯ detail button is single-selection only. */
  selectedCount: number;
  onRotate: () => void;
  onFlip: (axis: 'x' | 'y') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}

/**
 * A toolbar anchored to the selected motif, holding the actions reached for
 * constantly while composing: rotate, flip, duplicate, delete, and a ⋯ that
 * opens the detail panel.
 *
 * Real DOM buttons rather than canvas-drawn hit targets, so they get 44pt tap
 * targets, focus rings and screen-reader labels for free — and cannot be
 * missed by a few pixels the way the old canvas-drawn × and rotate knob could.
 *
 * Undo is deliberately NOT here: it is global (it reverses the last edit
 * whatever it was, including creating the very motif this bar is attached to),
 * so it lives in the canvas corner cluster instead.
 */
export default function MotifBar({
  box,
  viewport,
  hidden,
  selectedCount,
  onRotate,
  onFlip,
  onDuplicate,
  onDelete,
  onOpenDetail,
}: MotifBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Measured after paint so placement uses the bar's real width (which
  // depends on font metrics), not a guess.
  const [size, setSize] = useState({ w: 240, h: 44 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width && (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1)) {
      setSize({ w: r.width, h: r.height });
    }
  });

  if (!box || hidden) return null;

  const { left, top } = placeMotifBar(box, size, viewport);

  return (
    <div
      ref={ref}
      className="motif-bar"
      role="toolbar"
      aria-label="Motif actions"
      style={{ left, top }}
      // Keep pointer events off the canvas beneath: a tap on the bar must
      // never also register as a canvas press (which would deselect).
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="motif-bar-btn" onClick={onRotate} title="Rotate 90° clockwise" aria-label="Rotate 90 degrees clockwise">↺</button>
      <button type="button" className="motif-bar-btn" onClick={() => onFlip('x')} title="Flip horizontally" aria-label="Flip horizontally">⇔</button>
      <button type="button" className="motif-bar-btn" onClick={() => onFlip('y')} title="Flip vertically" aria-label="Flip vertically">⇕</button>
      <button type="button" className="motif-bar-btn" onClick={onDuplicate} title="Duplicate (Ctrl/Cmd+D)" aria-label="Duplicate">⧉</button>
      <button type="button" className="motif-bar-btn motif-bar-danger" onClick={onDelete} title="Delete" aria-label="Delete">⌫</button>
      {selectedCount === 1 && (
        <button type="button" className="motif-bar-btn" onClick={onOpenDetail} title="Name, size, colors, repeat" aria-label="More options">⋯</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `src/styles.css`:

```css
/* ---- Motif toolbar -------------------------------------------------------
   Anchored to the selected motif inside .design-canvas-wrap (which is
   position: relative). Placement is computed in JS by placeMotifBar. */
.motif-bar {
  position: absolute;
  z-index: 12; /* above the inspector's 10 */
  display: flex;
  gap: 2px;
  padding: 3px;
  background: var(--surface);
  border: 1px solid var(--rule-strong, var(--rule));
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
  /* The bar is chrome, not canvas: never let a drag on it pan the canvas. */
  touch-action: none;
}
.motif-bar-btn {
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  line-height: 1;
  color: var(--ink);
  background: transparent;
  border: none;
  border-radius: calc(var(--card-radius) - 2px);
  cursor: pointer;
}
.motif-bar-btn:hover { background: var(--accent-tint); }
.motif-bar-btn:active { background: var(--accent); color: var(--surface); }
.motif-bar-danger:hover { background: color-mix(in srgb, crimson 14%, transparent); color: crimson; }
```

- [ ] **Step 3: Verify it compiles and nothing regressed**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all tests pass (Task 1's 7 tests included).

- [ ] **Step 4: Commit**

```bash
git add src/ui/MotifBar.tsx src/styles.css
git commit -m "feat(design): MotifBar component (not yet rendered)

Six buttons — rotate, flip H, flip V, duplicate, delete, and ⋯ for the
detail panel — as real DOM buttons with 44pt targets and aria-labels.
Measures itself after paint so placement uses its true width.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

### Task 3: Wire MotifBar into DesignTab and delete the canvas-drawn controls

This is the first user-visible change and the riskiest task in the plan, because it edits `onPointerDown`'s priority ladder.

**Files:**
- Modify: `src/ui/DesignTab.tsx`

**Interfaces:**
- Consumes: `MotifBar` (Task 2), and these existing `DesignTab` internals — `selectionBox()` (`:856`, returns **cells**), `cs` (`:648`), `GUTTER` (imported from `./canvasUtil`), `rotateGroup(turns)` (`:930`), `duplicateAreas(srcs)` (`:1038`), `selectedAreas()` (`:1056`), `interactionRef`, `canvasRef`, `canvasScrollRef`, `setShowInspector`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add a cells→CSS-pixels helper next to `selectionBox`**

Insert directly after `selectionBox` (ends `:864`):

```tsx
  /**
   * The selection box converted from grid cells into CSS pixels relative to
   * `.design-canvas-wrap`, which is what MotifBar positions against.
   *
   * Three conversions stack here:
   *   cells → canvas backing px   (GUTTER + cell * cs)
   *   backing px → CSS px          (the canvas is CSS-scaled; see pointerPx)
   *   canvas CSS px → wrapper px   (the canvas sits inside a scroll container)
   */
  const selectionBoxCss = (): Box | null => {
    const cells = selectionBox();
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cells || !canvas || !wrap) return null;
    const cr = canvas.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    const scale = cr.width / canvas.width;
    return {
      x: cr.left - wr.left + (GUTTER + cells.x * cs) * scale,
      y: cr.top - wr.top + (GUTTER + cells.y * cs) * scale,
      w: cells.w * cs * scale,
      h: cells.h * cs * scale,
    };
  };
```

Add `import MotifBar from './MotifBar';` and `import type { Box } from './motifBar';` to the import block at the top.

- [ ] **Step 2: Add state that forces a reposition**

The bar must move when the canvas scrolls, zooms, resizes, or the selection changes. Add near the other `useState` declarations (around `:522`):

```tsx
  // Bumped whenever something that affects the bar's on-screen position
  // changes; selectionBoxCss() is re-read on each render this triggers.
  const [barTick, setBarTick] = useState(0);
```

And an effect after the zoom effects:

```tsx
  // Reposition the motif bar on scroll / resize. Zoom and selection changes
  // already re-render, so they need no extra listener.
  useEffect(() => {
    const scroll = canvasScrollRef.current;
    const bump = () => setBarTick((t) => t + 1);
    scroll?.addEventListener('scroll', bump, { passive: true });
    window.addEventListener('resize', bump);
    return () => {
      scroll?.removeEventListener('scroll', bump);
      window.removeEventListener('resize', bump);
    };
  }, []);
```

- [ ] **Step 3: Render the bar inside `.design-canvas-wrap`**

Immediately before the `{inspectorVisible && (` block (`:2505`), add:

```tsx
          {/* Toolbar anchored to the selection. `barTick` is read so this
              recomputes on scroll/resize; `interactionRef` hides it mid-drag. */}
          {(() => {
            void barTick;
            const box = selectionBoxCss();
            const wrap = wrapRef.current;
            return (
              <MotifBar
                box={box}
                viewport={{ w: wrap?.clientWidth ?? 0, h: wrap?.clientHeight ?? 0 }}
                hidden={interactionRef.current != null || pinchPointersRef.current.size > 0}
                selectedCount={selectedIds.size}
                onRotate={() => rotateGroup(1)}
                onFlip={(axis) => {
                  const f = axis === 'x' ? flipX : flipY;
                  pushUndo(design);
                  onChange({
                    ...design,
                    areas: design.areas.map((a) =>
                      selectedIds.has(a.id)
                        ? {
                            ...a,
                            motifs: a.motifs.map((m) => ({ ...m, cells: f(m.cells) })),
                            repeat: a.repeat ? { ...a.repeat, cells: f(a.repeat.cells) } : undefined,
                          }
                        : a,
                    ),
                  });
                }}
                onDuplicate={() => duplicateAreas(selectedAreas())}
                onDelete={() => {
                  pushUndo(design);
                  onChange({ ...design, areas: design.areas.filter((a) => !selectedIds.has(a.id)) });
                  selectOne(null);
                }}
                onOpenDetail={() => setShowInspector(true)}
              />
            );
          })()}
```

Note: the flip/delete bodies are copied verbatim from the existing inspector wiring (`:2508` onward) so behavior is identical.

- [ ] **Step 4: Force a reposition on pointer-up**

The bar is hidden during a drag and must reappear at the motif's new home. At the end of `onPointerUp` (`:1504`), after `interactionRef.current = null`, add:

```tsx
    setBarTick((t) => t + 1);
```

- [ ] **Step 5: Delete the canvas-drawn delete button hit test**

In `onPointerDown`, delete the whole block starting at the comment `// Delete (×) button on a selected area takes priority over everything.` (`:1236`) through its closing brace — the `if (toolRef.current === 'select') { … }` that loops over `design.areas` calling `deleteButtonCenter`.

- [ ] **Step 6: Delete the rotate-handle hit test**

Delete the block starting `// Rotate handle (on the selection) takes priority over body hits.` (`:1252`) through the end of its `if` — the one calling `overRotateHandle` and setting `interactionRef.current = { kind: 'rotate', … }`.

- [ ] **Step 7: Remove now-dead code**

Delete, in `DesignTab.tsx`:
- `HANDLE_HIT_MOUSE` and `HANDLE_HIT_TOUCH` (`:655`–`:656`)
- `DELETE_R` and `DELETE_R_TOUCH` (`:658`–`:659`)
- `overRotateHandle` (`:869`)
- `deleteButtonCenter` and the code that draws the `×` and the rotate knob (search `deleteButtonCenter`)
- the `'rotate'` and `'rotateGroupByAngle'` interaction handling: the `kind: 'rotate'` arm in `onPointerMove` and `onPointerUp`, and `rotateGroupByAngle` (`:973`) if nothing else calls it
- the `'rotate'` variant from the `Interaction` union type

Let `npm run typecheck` find anything missed — unused locals surface as errors under this repo's config.

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test`
Expected: clean.

Then `npm run dev` and check by hand at an iPad-portrait viewport (768×1024 in devtools):
- selecting a motif shows the bar above it; each of the six buttons works
- the bar flips below for a motif at the very top of the canvas
- the bar vanishes during a drag and reappears at the new position on release
- press-hold on a motif still promotes to a move; an early drag still pans
- pinch-zoom never moves a motif, and the bar tracks the new zoom
- an armed library motif still places on a plain tap
- a border-end drag still resizes along the tiling axis
- multi-select shows one bar on the union box; `⋯` is hidden for a multi-selection

- [ ] **Step 9: Commit**

```bash
git add src/ui/DesignTab.tsx
git commit -m "feat(design): anchor motif actions to the motif

MotifBar replaces the canvas-drawn × and rotate knob with real buttons
that cannot be missed by a few pixels on touch. Removes the 'rotate'
interaction kind and two invisible hit targets from onPointerDown's
priority ladder.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

### Task 4: Extract AreaInspector and drop its transform chips

**Files:**
- Create: `src/ui/AreaInspector.tsx`
- Modify: `src/ui/DesignTab.tsx` (remove the inline component, import the new one)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export default function AreaInspector(props)` — same props as the current inline component **minus** `onRotate` and `onFlip` (now on MotifBar). Task 5 renders it inside a sheet.

- [ ] **Step 1: Move the component**

Cut `function AreaInspector({ … })` (`:2891` to the end of its body) from `DesignTab.tsx` into a new `src/ui/AreaInspector.tsx`. Add `export default` to it. Move with it any helpers only it uses. Add the imports it needs — from `../engine/types`: `ColorIndex`, `Palette`, `PaletteColor`; from `../project/design`: `type Area`, `type RepeatMode`, `areaUsedColors`, `repeatFit`, and whatever else the body references; plus `ColorReplacePopover`.

- [ ] **Step 2: Remove its transform chips**

In the new file, delete both `<div className="design-transform">` blocks (they were at `:2963` and `:3036`) — the rotate and flip chips. Delete the now-unused `onRotate` and `onFlip` props from its props interface.

- [ ] **Step 3: Update DesignTab**

Add `import AreaInspector from './AreaInspector';`. At the render site (`:2505`), delete the `onRotate={…}` and `onFlip={…}` props being passed.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: clean. `DesignTab.tsx` should now be roughly 400 lines shorter.

Then `npm run dev`: open the inspector via `⋯`, confirm name, size, colors, repeat modes and *Plan this area* all still work, and that rotate/flip are gone from it (they live on the bar now).

- [ ] **Step 5: Commit**

```bash
git add src/ui/AreaInspector.tsx src/ui/DesignTab.tsx
git commit -m "refactor(design): extract AreaInspector to its own file

Two shells now render it (wide panel, narrow sheet), so it stops being
inline in DesignTab. Its rotate/flip chips are gone — those actions moved
to MotifBar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

### Task 5: Bottom sheet shell for narrow viewports

**Files:**
- Create: `src/ui/Sheet.tsx`
- Modify: `src/styles.css`, `src/ui/DesignTab.tsx`

**Interfaces:**
- Consumes: `AreaInspector` (Task 4).
- Produces: `export default function Sheet({ title, open, onClose, children })`. Task 6 reuses it for canvas settings.

- [ ] **Step 1: Write the shell**

Create `src/ui/Sheet.tsx`:

```tsx
import { type ReactNode, useEffect } from 'react';

export interface SheetProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A bottom sheet for narrow/tablet viewports. On wide screens the CSS turns
 * it into a floating panel in the canvas corner, so callers render one thing
 * and the breakpoint decides how it looks.
 */
export default function Sheet({ title, open, onClose, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet" role="dialog" aria-modal="false" aria-label={title}>
      <div className="sheet-head">
        <span className="sheet-title">{title}</span>
        <button type="button" className="sheet-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Style it**

Append to `src/styles.css`:

```css
/* ---- Sheet ---------------------------------------------------------------
   Bottom sheet on tablet/phone; a floating corner panel from 1100px up. */
.sheet {
  position: absolute;
  z-index: 14;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 70%;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--card-radius) var(--card-radius) 0 0;
  box-shadow: var(--shadow);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--rule);
}
.sheet-title { font-family: var(--font-display); font-size: 15px; }
.sheet-close {
  min-width: 44px;
  min-height: 44px;
  background: none;
  border: none;
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 15px;
}
.sheet-body { overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 16px; }

@media (min-width: 1100px) {
  .sheet {
    left: auto;
    right: 8px;
    top: 8px;
    bottom: auto;
    width: 300px;
    max-height: calc(100% - 16px);
    border-radius: var(--card-radius);
  }
}
```

- [ ] **Step 3: Render the inspector inside it**

In `DesignTab.tsx`, replace the `{inspectorVisible && (<aside className="design-inspector"> … </aside>)}` block with:

```tsx
          <Sheet title="Motif details" open={inspectorVisible} onClose={dismissInspector}>
            <AreaInspector
              area={activeArea}
              selectedCount={selectedIds.size}
              palette={design.palette}
              libraryNumbers={libraryNumbers}
              onRecolor={recolorActiveArea}
              updateArea={updateArea}
              onDuplicate={() => duplicateAreas(selectedAreas())}
              onDeleteArea={() => {
                pushUndo(design);
                onChange({ ...design, areas: design.areas.filter((a) => !selectedIds.has(a.id)) });
                selectOne(null);
              }}
              onPlanArea={(area) => {
                const sub = compositeArea(area, design.palette);
                onPlanArea(sub, `design:${design.id}:${area.id}`);
              }}
            />
          </Sheet>
```

Add `import Sheet from './Sheet';`. Delete the `.design-inspector` and `.design-inspector-close` rules from `styles.css` (`:582`–`:617`), now unused.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`, then `npm run dev`. At 768px wide the inspector is a bottom sheet; above 1100px it is a corner panel. Escape closes it. `⋯` opens it.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Sheet.tsx src/ui/DesignTab.tsx src/styles.css
git commit -m "feat(design): inspector opens as a bottom sheet on tablet

One Sheet shell, two looks: bottom sheet under 1100px, corner panel above.
Escape closes.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

### Task 6: Collapse the cloth bar behind a disclosure

**Files:**
- Modify: `src/ui/DesignTab.tsx` (the `ClothBar` component), `src/styles.css`

**Interfaces:**
- Consumes: `Sheet` (Task 5).
- Produces: nothing consumed later.

- [ ] **Step 1: Reduce the always-visible row**

In `ClothBar`, keep only: the `← Designs` button, the name input, and a new disclosure button. Everything else — the cloth/size/strands summary span, `Edit`, `Fit to content`, and the whole `{open && (…)}` form — moves into a `Sheet`.

The disclosure button:

```tsx
      <button
        type="button"
        className="btn-ghost btn-sm"
        onClick={() => setOpen(true)}
        title="Cloth, size, strands"
        aria-label="Canvas settings"
      >
        {cloth.label} · {design.gridW}×{design.gridH} st ▾
      </button>
```

It doubles as the summary — the reader still sees which cloth and size without opening anything.

- [ ] **Step 2: Move the form into a sheet**

Wrap the existing `{open && (…)}` form body — the cloth select, the width/height fields with their unit switch, the strands select, and *Fit to content* — in:

```tsx
      <Sheet title="Canvas settings" open={open} onClose={() => setOpen(false)}>
        {/* existing form fields, unchanged */}
      </Sheet>
```

Keep the field markup and every `onChange` handler exactly as they are; only their container changes.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`, then `npm run dev`. The bar above the canvas is now one thin row. The disclosure opens the settings sheet; changing cloth or size still resizes the grid; *Fit to content* still shrinks the canvas.

- [ ] **Step 4: Commit**

```bash
git add src/ui/DesignTab.tsx src/styles.css
git commit -m "feat(design): collapse canvas settings behind a disclosure

Cloth, size and strands are set once per piece but occupied a permanent
full-width band. The bar is now back + name + a summary button that opens
them in a sheet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

### Task 7: Canvas mode cluster

**Files:**
- Modify: `src/ui/DesignTab.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed later.

- [ ] **Step 1: Move the tools out of the top bar**

Delete the `tools={toolsNode}` prop from the `<ClothBar>` call and the `tools` prop from `ClothBar`'s signature. Rename `toolsNode` to `clusterNode` and change its wrapper to `<div className="design-canvas-cluster" role="toolbar" aria-label="Canvas tools">`.

- [ ] **Step 2: Fold in zoom and border**

Move the contents of `design-canvas-foot` (`:2466`) — the zoom −/value/+/Fit controls and the `+ Border` toggle — into `clusterNode`, after the undo button. Then delete the `design-canvas-foot` div entirely, including the `design-canvas-hint` paragraph (`:2497`); the help sheet behind `?` already explains the gesture model.

- [ ] **Step 3: Render the cluster over the canvas**

Inside `.design-canvas-wrap`, before the `MotifBar` render, add `{clusterNode}`.

- [ ] **Step 4: Style it**

```css
/* ---- Canvas tool cluster -------------------------------------------------
   Pen/eraser/undo/zoom/border, pinned to the canvas corner. Undo lives here
   rather than on MotifBar because it is global: it reverses the last edit
   whatever it was, including creating the motif a per-motif bar sits on. */
.design-canvas-cluster {
  position: absolute;
  z-index: 11;
  left: 8px;
  bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 16px);
  padding: 4px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--rule);
  border-radius: var(--card-radius);
  box-shadow: var(--shadow);
  touch-action: none;
}
@media (max-width: 1099px) {
  .design-canvas-cluster .chip { min-height: 44px; }
}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test`, then `npm run dev`. Pen paints with the selected color; the swatches and DMC picker still work; eraser clears; undo reverses the last edit; zoom and Fit work; Border still requires an armed motif.

- [ ] **Step 6: Commit**

```bash
git add src/ui/DesignTab.tsx src/styles.css
git commit -m "feat(design): pen/eraser/undo/zoom/border in one canvas cluster

Replaces the top-bar tools row and the canvas foot band. Undo is here
rather than on the motif bar because it is global, not per-motif.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

### Task 8: Move the filter bar below the canvas, add the tablet breakpoint

**Files:**
- Modify: `src/ui/DesignTab.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing.

- [ ] **Step 1: Relocate the filter bar**

Move the entire `{showPatterns && (<div className="design-filterbar"> … </div>)}` block (`:2286`) from above `.design-body-l` to immediately **before** `{showPatterns && bottomMotifs.length > 0 && (<div className="design-motif-strip" …>)}`. Contents unchanged — only its position in the JSX moves.

- [ ] **Step 2: Add the tablet breakpoint**

Append to `src/styles.css`:

```css
/* ---- Tablet --------------------------------------------------------------
   iPad portrait is 768–834pt and previously fell into the phone rules. The
   canvas takes the available height; filters and cards scroll beneath it. */
@media (min-width: 768px) and (max-width: 1099px) {
  .design-canvas-scroll { max-height: 64vh; }
  .design-filterbar { position: sticky; top: 0; z-index: 2; }
  .design-motif-strip .design-lib-card { width: 92px; }
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`, then `npm run dev` at 768×1024, 1024×768 and 1280×800. The search sits directly above the cards it filters. The canvas is visibly taller than before this plan started.

- [ ] **Step 4: Full manual pass**

Re-run the whole Task 3 Step 8 checklist, plus: place a motif from the strip by tap-arming; drag one from the strip with a mouse; toggle Patterns off and on.

- [ ] **Step 5: Commit**

```bash
git add src/ui/DesignTab.tsx src/styles.css
git commit -m "feat(design): search below the canvas + a real tablet breakpoint

The filter bar now sits directly above the cards it filters, so query and
results are visible together. iPad portrait gets its own rules instead of
falling into the phone breakpoint.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011e98tyXbrcD8B6ZbnbhrHL"
```

---

## Self-review notes

**Spec coverage:** goal 1 → Tasks 1–3; goal 2 → Tasks 4–5; goal 3 → Task 6; goal 4 → Task 7; goal 5 → Task 8 Step 1; goal 6 → Task 8 Step 2. The spec's "canvas-drawn controls removed" → Task 3 Steps 5–7. Every spec section maps to a task.

**Two spec corrections found while planning, applied above:**
1. The spec said `MotifBar` takes a box in "canvas pixels". `selectionBox()` actually returns **grid cells**, and the canvas is CSS-scaled inside a scroll container. Task 3 Step 1 adds `selectionBoxCss()` to do all three conversions, keeping `placeMotifBar` DOM-free.
2. The spec said the inspector "stops auto-opening on every selection". It already doesn't — `inspectorVisible = showInspector` (`:562`) is a manual toggle persisted to localStorage. Task 5 only re-homes it into a sheet and adds `⋯` as a second way to open it.

**Deferred:** the spec's draggable peek/full sheet height is not implemented — Task 5 ships a fixed `max-height: 70%` sheet. Dragging is a refinement worth having only if the fixed height proves wrong in use.
