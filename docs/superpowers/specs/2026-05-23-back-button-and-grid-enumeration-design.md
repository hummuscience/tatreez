# Back Button & Grid Enumeration — Design

Date: 2026-05-23

Two independent UI improvements to the Tatreez Stitch Planner:

1. **Browser back button** returns to the previously viewed tab/view.
2. **Row/column enumeration** numbers the grid on the Editor, Ground Truth, and Plan tabs.

---

## Part 1 — Browser back button (history integration)

### Problem

Navigation lives entirely in `App.tsx` as `useState<TabName>`. Tab switches and
cross-tab jumps (Import→Editor, Library→Plans, Editor→Plans) never touch browser
history, so the browser's ← button does nothing useful (or exits the app). The user
expects ← to return to the previous thing they saw.

### Scope

- **In scope:** previous *tab/view*. The five tabs are `library | editor | import |
  plans | gt`. Back/forward navigates between the tab views the user actually visited.
- **Out of scope:** restoring the previously *loaded pattern*. The currently loaded
  pattern (`state.pattern` / `patternKey`) persists across back/forward. This avoids
  flooding the history stack with pattern loads or per-cell edits. (Confirmed with user.)

### Approach

React state remains the source of truth; the URL hash mirrors it.

- **Initial load:** read the tab from `location.hash` (e.g. `#editor`). If absent or
  invalid, default to `library`. Seed history with `history.replaceState({ tab }, '',
  '#' + tab)` so the first entry is well-formed.
- **On navigation:** all tab changes go through a single `navigate(tab)` helper that
  - calls `setTab(tab)`, and
  - calls `history.pushState({ tab }, '', '#' + tab)`.
  Every existing `setTab(...)` call site (the nav buttons and the cross-tab jumps in
  `loadAndShowPlans`, `onSendToEditor`, `onGoToPlans`) is routed through `navigate`.
- **On popstate:** a `window` `popstate` listener reads `event.state?.tab` (falling back
  to parsing the hash, then to `library`) and calls `setTab(...)` directly — **not**
  `navigate`, so it does not push a new entry.

### Why not a router library

The project has only `react` + `react-dom` as runtime deps (no router). A ~30-line
hash/history integration in `App.tsx` keeps the dependency footprint unchanged and is
sufficient for five flat tabs.

### Components touched

- `src/App.tsx`: add `navigate` helper, initial-hash read, `popstate` effect; route
  existing `setTab` call sites through `navigate`.

### Testing

- Manual: click through tabs, press browser ←/→, confirm the view returns to the prior
  tab. Refresh on a non-default tab and confirm it stays. Use a cross-tab jump
  (Library→Plans) then ← and confirm return to Library.

---

## Part 2 — Row/column enumeration on the grid

### Problem

The Editor, Ground Truth, and Plan (front + back) canvases render an unlabeled grid.
The user wants rows and columns numbered so they can locate cells.

### Constraints discovered in code

- All canvases draw the grid at canvas origin `(0,0)`, filling `gridW*cs × gridH*cs`,
  via the shared helpers in `src/ui/canvasUtil.ts` (`cellSize`, `drawPatternBackground`,
  `drawGridLines`) plus many inline `x * cs` / `y * cs` draw calls.
- Editor (`cellAt`) and Ground Truth (`handleClick`) hit-test mouse coordinates against
  that same origin. **Editor works in cell coordinates** (`floor`, valid `0..W-1`).
  **Ground Truth works in corner coordinates** (`round`, valid `0..W` inclusive) — it
  records thread paths through grid intersections, not painted cells.
- Editor permits grids up to 60×60.

### Decisions (confirmed with user)

- **Placement:** a gutter *outside* the grid (top + left), graph-paper style.
- **Frequency / base:** number **every** row and column, **1-based** (`1,2,3,…`).

### Approach — gutter via canvas translate

Avoid rewriting every coordinate expression by reserving a fixed gutter and translating
the drawing origin once per render. Existing `x*cs` / `y*cs` calls then remain unchanged.

Changes in `src/ui/canvasUtil.ts`:

- Export `const GUTTER = 18` (px, fixed). Single source of truth; tune if labels feel
  cramped, but it must not depend on grid size.
- Change `cellSize` callers to compute `cs` from the **drawable** area:
  `cellSize(canvas.width - GUTTER, canvas.height - GUTTER, gridW, gridH)`.
  (The `cellSize` signature is unchanged; callers pass reduced dimensions.)
- Add `drawAxisLabels(ctx, cs, gridW, gridH)`:
  - Drawn in the **untranslated** coordinate space (called before the per-render
    `translate`, or with the gutter accounted for explicitly).
  - Column numbers `1..gridW` centered horizontally over each **cell column** in the top
    gutter (i.e. above the cell spanning `[i*cs, (i+1)*cs]`).
  - Row numbers `1..gridH` centered vertically beside each **cell row** in the left gutter.
  - Note: this cell-based numbering is the same in all four canvases, including Ground
    Truth — even though GT's *hit-testing* is corner-based, the visible labels number
    cells, matching the Editor so the user reads one consistent coordinate system.
  - Font size scales with `cs` (clamped to a small minimum) so dense grids stay legible
    against the fixed-width gutter; numbers will be small at 60×60 but will not overflow.
  - Muted label color consistent with the Linen & Thread palette.

Per-render pattern in each tab's draw effect:

```
clearCanvas(...)
drawAxisLabels(ctx, cs, gridW, gridH)   // in gutter, untranslated
ctx.save()
ctx.translate(GUTTER, GUTTER)
... all existing draw calls unchanged (drawPatternBackground, drawGridLines, x*cs ...) ...
ctx.restore()
```

Hit-testing (Editor `cellAt`, GT `handleClick`):

- Subtract the gutter before converting to grid coordinates. Because `cs` is computed in
  CSS pixels but the canvas is scaled to its displayed size, the gutter must be scaled by
  the same `scale = r.width / canvas.width` factor already used:
  `gridX = (clientX - r.left - GUTTER * scale) / (cs * scale)` (and the y analogue),
  then `floor` (Editor) / `round` (GT) as today.

### Components touched

- `src/ui/canvasUtil.ts`: add `GUTTER`, add `drawAxisLabels`.
- `src/ui/EditorTab.tsx`: reduced `cellSize` dims, translate wrapper, `drawAxisLabels`,
  gutter in `cellAt`.
- `src/ui/GroundTruthTab.tsx`: same four changes; `handleClick` gutter.
- `src/ui/PlanTab.tsx`: same for both front and back canvases so they stay aligned.

### Edge cases

- Very large grids (up to 60×60): labels render small but legible; fixed gutter prevents
  overflow. Accepted per "every cell" choice.
- The Plan front + back canvases share `GUTTER` and the same reduced `cs`, keeping the two
  views aligned cell-for-cell.

### Testing

- Manual: open each tab, confirm column numbers run left→right `1..W` and row numbers
  top→bottom `1..H`, aligned to grid lines.
- Manual hit-test: in Editor, paint a cell and confirm the painted cell is the one under
  the cursor (gutter offset correctly subtracted). In GT, click a corner and confirm the
  selected corner matches the cursor.
- Visual: Plan front/back canvases remain aligned.

---

## Out of scope

- Restoring previously loaded pattern via history.
- Configurable label frequency (every 5 / every 10) — fixed at every cell for now.
- Persisting tab selection beyond the current session (history/hash only).
