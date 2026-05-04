import type { Cell, Corner, Pattern, Region, Step } from './types';
import { emit } from './stepUtil';
import { extractRegions } from './regions';

/**
 * A "primitive" is an atomic stitching instruction — one thing a stitcher
 * commits to once and then executes without further reference to the
 * chart. Plans become sequences of primitives instead of corner-to-corner
 * step lists, eliminating the per-step counting fatigue.
 *
 * Vocabulary chosen to mirror the Tatreez Traditions PDFs:
 *   - column-up / column-down: walk a vertical run with row-halves
 *   - row-right / row-left:    walk a horizontal run with row-halves
 *   - single-cross:            one full cross at one cell
 *   - jump:                    axis back-travel between primitives
 *   - restart:                 new thread
 *
 * Each primitive expands to a deterministic Step[] sequence — the
 * existing renderer doesn't need to know primitives exist. Primitives
 * are an abstraction *on top of* Steps for human readability.
 */
export type Primitive =
  | {
      kind: 'columnUp';
      /** x coordinate of the column (cell-x). */
      x: number;
      /** Top cell row (smallest y). */
      yMin: number;
      /** Bottom cell row (largest y). */
      yMax: number;
    }
  | {
      kind: 'columnDown';
      x: number;
      yMin: number;
      yMax: number;
    }
  | {
      kind: 'rowRight';
      y: number;
      xMin: number;
      xMax: number;
    }
  | {
      kind: 'rowLeft';
      y: number;
      xMin: number;
      xMax: number;
    }
  | {
      kind: 'singleCross';
      x: number;
      y: number;
    }
  | {
      kind: 'jump';
      from: Corner;
      to: Corner;
    }
  | { kind: 'restart' };

/** A plan as a sequence of primitives, plus the expanded Step[] for rendering. */
export interface PrimitivePlan {
  primitives: Primitive[];
  steps: Step[];
  /**
   * Maps each Step index → the index of the Primitive that produced it.
   * `-1` for synthetic 'start' steps emitted before a primitive.
   * The UI uses this to display the active primitive while stepping
   * through the plan.
   */
  stepToPrimitive: number[];
}

/**
 * Human-readable label for one primitive — what to display in the UI.
 */
export function describePrimitive(p: Primitive): string {
  switch (p.kind) {
    case 'columnUp': {
      const n = p.yMax - p.yMin + 1;
      return `Column up at x=${p.x}, ${n} cells (y=${p.yMax}→${p.yMin})`;
    }
    case 'columnDown': {
      const n = p.yMax - p.yMin + 1;
      return `Column down at x=${p.x}, ${n} cells (y=${p.yMin}→${p.yMax})`;
    }
    case 'rowRight': {
      const n = p.xMax - p.xMin + 1;
      return `Row right at y=${p.y}, ${n} cells (x=${p.xMin}→${p.xMax})`;
    }
    case 'rowLeft': {
      const n = p.xMax - p.xMin + 1;
      return `Row left at y=${p.y}, ${n} cells (x=${p.xMax}→${p.xMin})`;
    }
    case 'singleCross':
      return `Single cross at (${p.x}, ${p.y})`;
    case 'jump':
      return `Jump (${p.from[0]}, ${p.from[1]}) → (${p.to[0]}, ${p.to[1]})`;
    case 'restart':
      return `New thread`;
  }
}

// ---------- Expansion: Primitive → Step[] ----------

/** Append the Step[] expansion of one primitive to `out`. */
export function expandPrimitive(out: Step[], p: Primitive): void {
  switch (p.kind) {
    case 'columnUp': {
      // / up: BL→TR, axis to next BL going up
      // \ down: TL→BR, axis to next TL going down
      // Needle starts at BL of bottom cell; ends at BR of bottom cell.
      for (let y = p.yMax; y >= p.yMin; y--) {
        const bl: Corner = [p.x, y + 1];
        const tr: Corner = [p.x + 1, y];
        emit(out, 'front', bl, tr, [p.x, y] as Cell, '/');
        if (y > p.yMin) emit(out, 'back', tr, [p.x, y]);
      }
      // axis back to TL of top cell
      emit(out, 'back', [p.x + 1, p.yMin], [p.x, p.yMin]);
      for (let y = p.yMin; y <= p.yMax; y++) {
        const tl: Corner = [p.x, y];
        const br: Corner = [p.x + 1, y + 1];
        emit(out, 'front', tl, br, [p.x, y] as Cell, '\\');
        if (y < p.yMax) emit(out, 'back', br, [p.x, y + 1]);
      }
      return;
    }
    case 'columnDown': {
      // Mirror of columnUp: \ down first, then / up.
      // Needle starts at TL of top cell; ends at TR of top cell.
      for (let y = p.yMin; y <= p.yMax; y++) {
        const tl: Corner = [p.x, y];
        const br: Corner = [p.x + 1, y + 1];
        emit(out, 'front', tl, br, [p.x, y] as Cell, '\\');
        if (y < p.yMax) emit(out, 'back', br, [p.x, y + 1]);
      }
      emit(out, 'back', [p.x + 1, p.yMax + 1], [p.x, p.yMax + 1]);
      for (let y = p.yMax; y >= p.yMin; y--) {
        const bl: Corner = [p.x, y + 1];
        const tr: Corner = [p.x + 1, y];
        emit(out, 'front', bl, tr, [p.x, y] as Cell, '/');
        if (y > p.yMin) emit(out, 'back', tr, [p.x, y]);
      }
      return;
    }
    case 'rowRight': {
      // / going right: BL→TR for each cell, axis right to next BL.
      // Then \ going left: TL→BR going right? No, the row reverse is BL←TR.
      // Convention: walk right with /, then walk back left with \.
      // Needle starts at BL of leftmost cell.
      for (let x = p.xMin; x <= p.xMax; x++) {
        const bl: Corner = [x, p.y + 1];
        const tr: Corner = [x + 1, p.y];
        emit(out, 'front', bl, tr, [x, p.y] as Cell, '/');
        if (x < p.xMax) emit(out, 'back', tr, [x + 1, p.y + 1]);
      }
      // axis to BR of rightmost cell, then walk \ leftward.
      emit(out, 'back', [p.xMax + 1, p.y], [p.xMax + 1, p.y + 1]);
      for (let x = p.xMax; x >= p.xMin; x--) {
        const br: Corner = [x + 1, p.y + 1];
        const tl: Corner = [x, p.y];
        emit(out, 'front', br, tl, [x, p.y] as Cell, '\\');
        if (x > p.xMin) emit(out, 'back', tl, [x, p.y + 1]);
      }
      return;
    }
    case 'rowLeft': {
      // Mirror of rowRight: walk \ right first, then / leftward.
      for (let x = p.xMin; x <= p.xMax; x++) {
        const tl: Corner = [x, p.y];
        const br: Corner = [x + 1, p.y + 1];
        emit(out, 'front', tl, br, [x, p.y] as Cell, '\\');
        if (x < p.xMax) emit(out, 'back', br, [x + 1, p.y]);
      }
      emit(out, 'back', [p.xMax + 1, p.y + 1], [p.xMax + 1, p.y]);
      for (let x = p.xMax; x >= p.xMin; x--) {
        const tr: Corner = [x + 1, p.y];
        const bl: Corner = [x, p.y + 1];
        emit(out, 'front', tr, bl, [x, p.y] as Cell, '/');
        if (x > p.xMin) emit(out, 'back', bl, [x, p.y]);
      }
      return;
    }
    case 'singleCross': {
      const bl: Corner = [p.x, p.y + 1];
      const tr: Corner = [p.x + 1, p.y];
      const tl: Corner = [p.x, p.y];
      const br: Corner = [p.x + 1, p.y + 1];
      emit(out, 'front', bl, tr, [p.x, p.y] as Cell, '/');
      emit(out, 'back', tr, tl);
      emit(out, 'front', tl, br, [p.x, p.y] as Cell, '\\');
      return;
    }
    case 'jump': {
      // Axis-only: emit either as one or two segments.
      if (p.from[0] === p.to[0] || p.from[1] === p.to[1]) {
        emit(out, 'back', p.from, p.to);
      } else {
        // L-shape: vertical first, then horizontal.
        const corner: Corner = [p.from[0], p.to[1]];
        emit(out, 'back', p.from, corner);
        emit(out, 'back', corner, p.to);
      }
      return;
    }
    case 'restart': {
      // Resolved by the caller emitting 'start' before the next primitive.
      return;
    }
  }
}

/** Where the needle is positioned after `expandPrimitive` runs. */
export function endCorner(p: Primitive): Corner | null {
  switch (p.kind) {
    case 'columnUp':
      return [p.x + 1, p.yMax + 1]; // BR of bottom cell
    case 'columnDown':
      return [p.x + 1, p.yMin]; // TR of top cell
    case 'rowRight':
      return [p.xMin, p.y + 1]; // BL of leftmost (we ended walking left)
    case 'rowLeft':
      return [p.xMin, p.y]; // TL of leftmost (mirror)
    case 'singleCross':
      return [p.x + 1, p.y + 1]; // BR
    case 'jump':
      return p.to;
    case 'restart':
      return null;
  }
}

/** Where the needle starts before `expandPrimitive` runs. */
export function startCorner(p: Primitive): Corner | null {
  switch (p.kind) {
    case 'columnUp':
      return [p.x, p.yMax + 1]; // BL of bottom cell
    case 'columnDown':
      return [p.x, p.yMin]; // TL of top cell
    case 'rowRight':
      return [p.xMin, p.y + 1]; // BL of leftmost cell
    case 'rowLeft':
      return [p.xMin, p.y]; // TL of leftmost cell
    case 'singleCross':
      return [p.x, p.y + 1]; // BL
    case 'jump':
      return p.from;
    case 'restart':
      return null;
  }
}

// ---------- Decomposition: Region → Primitive[] ----------
//
// Greedy strategy:
//   1. Find the longest unbroken vertical run in the region; emit a
//      column primitive for it, mark those cells consumed.
//   2. Repeat until no vertical runs of length ≥ 2 remain.
//   3. Find the longest unbroken horizontal run; emit row primitive.
//   4. Repeat.
//   5. Remaining cells become singleCross primitives.
//
// This isn't optimal set-cover (NP-hard in general) but produces clean
// motifs on real tatreez patterns where the natural structure is rows
// and columns.

/**
 * Decompose a region into a covering sequence of primitives. The
 * returned primitives, when expanded, produce Step[] entries that
 * collectively cover every leg of every cell in the region exactly once.
 *
 * The output does NOT include `jump` or `restart` between primitives —
 * sequencing those is the next stage's job.
 */
export function decomposeRegion(region: Region): Primitive[] {
  const cellSet = new Set<string>();
  for (const [x, y] of region.cells) cellSet.add(`${x},${y}`);

  const out: Primitive[] = [];

  // 1. Vertical runs of length ≥ 2.
  while (true) {
    let bestX = -1, bestYMin = -1, bestYMax = -1;
    let bestLen = 1;
    // Group cells by x.
    const byX = new Map<number, number[]>();
    for (const key of cellSet) {
      const [xs, ys] = key.split(',').map(Number);
      if (!byX.has(xs)) byX.set(xs, []);
      byX.get(xs)!.push(ys);
    }
    for (const [x, ys] of byX) {
      ys.sort((a, b) => a - b);
      let runStart = ys[0];
      let runLen = 1;
      for (let i = 1; i < ys.length; i++) {
        if (ys[i] === ys[i - 1] + 1) {
          runLen++;
          if (runLen > bestLen) {
            bestLen = runLen;
            bestX = x;
            bestYMin = runStart;
            bestYMax = ys[i];
          }
        } else {
          runStart = ys[i];
          runLen = 1;
        }
      }
    }
    if (bestLen < 2) break;
    out.push({ kind: 'columnUp', x: bestX, yMin: bestYMin, yMax: bestYMax });
    for (let y = bestYMin; y <= bestYMax; y++) cellSet.delete(`${bestX},${y}`);
  }

  // 2. Horizontal runs of length ≥ 2 from what's left.
  while (true) {
    let bestY = -1, bestXMin = -1, bestXMax = -1;
    let bestLen = 1;
    const byY = new Map<number, number[]>();
    for (const key of cellSet) {
      const [xs, ys] = key.split(',').map(Number);
      if (!byY.has(ys)) byY.set(ys, []);
      byY.get(ys)!.push(xs);
    }
    for (const [y, xs] of byY) {
      xs.sort((a, b) => a - b);
      let runStart = xs[0];
      let runLen = 1;
      for (let i = 1; i < xs.length; i++) {
        if (xs[i] === xs[i - 1] + 1) {
          runLen++;
          if (runLen > bestLen) {
            bestLen = runLen;
            bestY = y;
            bestXMin = runStart;
            bestXMax = xs[i];
          }
        } else {
          runStart = xs[i];
          runLen = 1;
        }
      }
    }
    if (bestLen < 2) break;
    out.push({ kind: 'rowRight', y: bestY, xMin: bestXMin, xMax: bestXMax });
    for (let x = bestXMin; x <= bestXMax; x++) cellSet.delete(`${x},${bestY}`);
  }

  // 3. Whatever's left → single-cross primitives.
  for (const key of cellSet) {
    const [x, y] = key.split(',').map(Number);
    out.push({ kind: 'singleCross', x, y });
  }

  return out;
}

// ---------- Sequencing: pattern → PrimitivePlan ----------

export interface PlanAsPrimitivesOptions {
  /**
   * Cap on the axis-aligned distance a single jump may cover before
   * the sequencer prefers a thread restart. Same idea as the solver's
   * maxAxisJump but applied at the primitive level. Default 6.
   */
  maxAxisJump?: number;
}

/**
 * Build a PrimitivePlan for a pattern. Strategy:
 *   1. Decompose each region.
 *   2. Order primitives so each starts where the previous one ended (no
 *      jump) when possible. Otherwise, jump if within maxAxisJump or
 *      restart the thread if farther.
 *   3. Threads are formed by chains of primitives that share/jump corners
 *      across the same colour. When the next reachable primitive is in a
 *      different colour, restart.
 *
 * Color order: regions are processed in the order they're returned by
 * extractRegions (palette index then top-to-bottom).
 */
export function planAsPrimitives(
  pattern: Pattern,
  options: PlanAsPrimitivesOptions = {},
): PrimitivePlan {
  const maxAxisJump = options.maxAxisJump ?? 6;
  const regions = extractRegions(pattern);
  const primitives: Primitive[] = [];

  // Group regions by colour so primitives of one colour all sit in one
  // thread queue. Within a colour, we order all primitives globally
  // (across regions) by greedy nearest-neighbour from the current cursor,
  // jumping between regions when within maxAxisJump.
  type Tagged = { prim: Primitive; color: number };
  const byColor = new Map<number, Tagged[]>();
  for (const region of regions) {
    const decomp = decomposeRegion(region);
    const list = byColor.get(region.color) ?? [];
    for (const p of decomp) list.push({ prim: p, color: region.color });
    byColor.set(region.color, list);
  }

  const colors = [...byColor.keys()].sort((a, b) => a - b);
  let firstColor = true;

  for (const color of colors) {
    if (!firstColor) primitives.push({ kind: 'restart' });
    firstColor = false;

    const queue = byColor.get(color)!;
    const remaining = new Set(queue.map((_, i) => i));

    // First primitive: top-leftmost by start corner.
    let curIdx = -1;
    let bestKey: string | null = null;
    for (const i of remaining) {
      const sc = startCorner(queue[i].prim);
      if (!sc) continue;
      const key = `${sc[1].toString().padStart(4, '0')},${sc[0].toString().padStart(4, '0')}`;
      if (bestKey === null || key < bestKey) {
        bestKey = key;
        curIdx = i;
      }
    }
    if (curIdx === -1) continue;

    const chosen = queue[curIdx].prim;
    primitives.push(chosen);
    remaining.delete(curIdx);
    let cursor = endCorner(chosen);

    while (remaining.size > 0) {
      let nextIdx = -1;
      let nextDist = Infinity;
      let nextStart: Corner | null = null;
      for (const i of remaining) {
        const sc = startCorner(queue[i].prim);
        if (!sc) continue;
        if (!cursor) {
          nextIdx = i;
          nextStart = sc;
          break;
        }
        const d = Math.abs(sc[0] - cursor[0]) + Math.abs(sc[1] - cursor[1]);
        if (d < nextDist) {
          nextDist = d;
          nextIdx = i;
          nextStart = sc;
        }
      }
      if (nextIdx === -1) break;
      const next = queue[nextIdx].prim;
      if (cursor && nextStart) {
        const dx = nextStart[0] - cursor[0];
        const dy = nextStart[1] - cursor[1];
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist === 0) {
          // Already there — append directly.
        } else if (dist <= maxAxisJump) {
          primitives.push({ kind: 'jump', from: cursor, to: nextStart });
        } else {
          // Too far — restart the thread.
          primitives.push({ kind: 'restart' });
        }
      }
      primitives.push(next);
      remaining.delete(nextIdx);
      cursor = endCorner(next);
    }
  }

  // Expand into Steps for rendering, recording which primitive owns
  // each emitted step.
  const steps: Step[] = [];
  const stepToPrimitive: number[] = [];
  let needStart = true;
  for (let pi = 0; pi < primitives.length; pi++) {
    const p = primitives[pi];
    if (p.kind === 'restart') {
      needStart = true;
      continue;
    }
    const before = steps.length;
    if (needStart) {
      const sc = startCorner(p);
      if (sc) emit(steps, 'start', null, sc);
      needStart = false;
    }
    expandPrimitive(steps, p);
    for (let i = before; i < steps.length; i++) stepToPrimitive[i] = pi;
  }

  return { primitives, steps, stepToPrimitive };
}
