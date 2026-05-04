import type { ColorIndex, Corner, GroundTruth, Pattern, Step } from '../engine/types';
import { pointsToSteps } from '../engine/groundTruth';
import { emit } from '../engine/stepUtil';
import { BUILTIN_PATTERNS } from './builtin';

/**
 * Group consecutive same-color cells in column `x` (sharing y) into
 * vertical runs. Returns runs sorted top-to-bottom.
 */
function verticalRuns(p: Pattern, x: number, color: ColorIndex): Array<{ yMin: number; yMax: number }> {
  const runs: Array<{ yMin: number; yMax: number }> = [];
  let y = 0;
  while (y < p.height) {
    if (p.cells[y][x] === color) {
      const start = y;
      while (y < p.height && p.cells[y][x] === color) y++;
      runs.push({ yMin: start, yMax: y - 1 });
    } else {
      y++;
    }
  }
  return runs;
}

/**
 * Canonical ground truths for the built-in patterns, encoded as
 * functions that emit the corner sequence according to the
 * Tatreez Traditions PDF guides.
 *
 * Each function returns null if no canonical GT is encoded yet.
 * Use `getCanonicalGroundTruth(patternId)` to fetch one.
 */

// --- Old Man's Teeth ---
// Per page 2 of the PDF + the user's recorded ground truth:
// For each column c with painted cells, complete all crosses in that
// column (tooth row + solid row) before advancing to the next column.
// Direction alternates so the needle ends adjacent to the next column.
function omtCanonicalPoints(p: Pattern): Corner[] {
  // Pattern is 10 cols × 3 rows: row 0 = teeth (cols 0,2,4,6,8 filled);
  // row 1 = solid (all cols filled); row 2 = empty.
  const points: Corner[] = [];
  let needleAt: Corner | null = null;
  // Start at BL of cell (0, 1)
  const start: Corner = [0, 2];
  points.push(start);
  needleAt = start;

  // For each column 0..9, stitch the painted cells in that column.
  // Direction alternates: even columns go BL→TR for `/`, odd go BR→TL.
  for (let c = 0; c < p.width; c++) {
    const hasTooth = p.cells[0][c] > 0;
    const hasSolid = p.cells[1][c] > 0;
    const cellsHere: number[] = [];
    if (hasTooth) cellsHere.push(0);
    if (hasSolid) cellsHere.push(1);
    if (cellsHere.length === 0) continue;

    // Bottom-most row in this column is at row 1 (or 0 if only tooth)
    const bottomRow = cellsHere[cellsHere.length - 1];
    const topRow = cellsHere[0];
    const evenCol = c % 2 === 0;

    if (evenCol) {
      // Forward `/`: stitch each cell BL→TR going upward
      // Make sure needle is at BL of bottom cell
      const blBottom: Corner = [c, bottomRow + 1];
      if (needleAt[0] !== blBottom[0] || needleAt[1] !== blBottom[1]) {
        points.push(blBottom);
        needleAt = blBottom;
      }
      for (let r = bottomRow; r >= topRow; r--) {
        // `/` from BL to TR
        const tr: Corner = [c + 1, r];
        points.push(tr);
        needleAt = tr;
        // axis to BL of next cell up (or past last)
        if (r > topRow) {
          const nextBl: Corner = [c, r];
          points.push(nextBl);
          needleAt = nextBl;
        }
      }
      // After all `/`s: needle is at TR of top cell `[c+1, topRow]`
      // Now reverse pass `\` from TL→BR going downward, BR→TL traversed
      // axis: from TR of top to TL of top
      const tlTop: Corner = [c, topRow];
      points.push(tlTop);
      needleAt = tlTop;
      for (let r = topRow; r <= bottomRow; r++) {
        // `\` from TL to BR
        const br: Corner = [c + 1, r + 1];
        points.push(br);
        needleAt = br;
        // axis to TL of next cell down
        if (r < bottomRow) {
          const nextTl: Corner = [c, r + 1];
          points.push(nextTl);
          needleAt = nextTl;
        }
      }
      // needle is now at BR of bottom cell = `[c+1, bottomRow+1]`
    } else {
      // Odd column: mirror direction — start by laying `\` first then `/`
      // Make sure needle is at TR of top cell (since we just ended at BR of last bottom)
      // Actually we ended at `[c, bottomRow+1]` (BR of previous column = BL of this)
      // For odd col, we lay `\` BR→TL going upward first
      const brBottom: Corner = [c + 1, bottomRow + 1];
      if (needleAt[0] !== brBottom[0] || needleAt[1] !== brBottom[1]) {
        points.push(brBottom);
        needleAt = brBottom;
      }
      for (let r = bottomRow; r >= topRow; r--) {
        // `\` BR→TL (reverse of normal `\`)
        const tl: Corner = [c, r];
        points.push(tl);
        needleAt = tl;
        if (r > topRow) {
          const nextBr: Corner = [c + 1, r];
          points.push(nextBr);
          needleAt = nextBr;
        }
      }
      // Now `/` going downward TR→BL
      const trTop: Corner = [c + 1, topRow];
      points.push(trTop);
      needleAt = trTop;
      for (let r = topRow; r <= bottomRow; r++) {
        // `/` TR→BL (reverse direction of normal `/`)
        const bl: Corner = [c, r + 1];
        points.push(bl);
        needleAt = bl;
        if (r < bottomRow) {
          const nextTr: Corner = [c + 1, r + 1];
          points.push(nextTr);
          needleAt = nextTr;
        }
      }
      // needle ends at BL of bottom cell = `[c, bottomRow+1]`
    }
  }
  return points;
}

// --- Coffee Bean (Habbet Binn) ---
//
// Encoded from the user's recorded GT (one stalk segment + one full bean)
// in the planner's Ground Truth recorder. The chart is chart 689 — a
// vertical stack of 5 bean clusters around a central stem at col 8.
// Cluster T-rows (where stem cells share a row with side cells) are at
// y = 7, 16, 25, 34, 43. Bean cells live in the rows BETWEEN T-rows, on
// both sides of the stem.
//
// Thread 1 — stalk (whole chart):
//   • Bottom T-base at row 43: cells (7,43), (8,43), (9,43) stitched as a
//     row of full crosses (`/` going right, then `\` coming back left).
//   • Stem segments interleaved with T-rows: walking up, lay only `/` on
//     each stem cell (col 8). At each T-row (36, 27, 18, 9, 0 — i.e.
//     yBot - 7 of each cluster, or the chart's top), pause and do the
//     two side cells (cols 7 and 9) as full crosses before continuing
//     up. The center stem cell at the T-row stays half (only `/`).
//   • Note: the bottom T-row is row 43 (already done as base); the next
//     T-row going up is 34, then 25, 16, 7, then the very top.
//   • Descent: come back down the stem laying `\` on every stem cell
//     from the top of the stem to the bottom. This completes all crosses.
//
// Threads 2..11 — beans (5 clusters × 2 sides):
//   For each of the 5 clusters and each side (right then left), stitch
//   the bean cells using a fixed primitive sequence relative to the bean
//   shape. The bean is sewn in 9 sub-motifs: 3 diagonal "slices" along
//   the bottom rows, 4 vertical 3-cell columns ("ribs"), 1 single-cell
//   pair, and 1 right-tip mop-up. See `stitchBeanRight` below.

interface ClusterInfo {
  /** Top row of the cluster (the y above the bean rows). */
  yTop: number;
  /** Bottom row of the cluster (the T-row with side cells filled). */
  yBot: number;
}

/**
 * Boundaries within a Step[] sequence that correspond to logical "parts"
 * (stalk, bean-right, bean-left, etc). Each entry is `[name, startIdx]`
 * where `startIdx` is the step index at which the part begins. The part
 * ends at the next entry's startIdx, or at the end of the steps.
 *
 * Used by canonical GT generators that want to emit `parts` alongside
 * their step sequence.
 */
type StepParts = Array<{ name: string; stepStart: number }>;

function coffeeBeanCanonicalSteps(p: Pattern, partsOut?: StepParts): Step[] | null {
  const steps: Step[] = [];
  const color = 1 as ColorIndex;

  // ---- Identify the stem column and cluster boundaries ----
  // Stem = the single column whose cells form the longest contiguous
  // vertical run. T-rows = rows where the stem cell AND its left/right
  // neighbours are painted.
  let stemX = -1;
  let stemRun: { yMin: number; yMax: number } | null = null;
  for (let x = 0; x < p.width; x++) {
    const runs = verticalRuns(p, x, color);
    for (const r of runs) {
      const len = r.yMax - r.yMin + 1;
      if (!stemRun || len > stemRun.yMax - stemRun.yMin + 1) {
        stemRun = r;
        stemX = x;
      }
    }
  }
  if (stemX < 0 || !stemRun) return null;

  // T-rows: every row where the stem cell + both immediate neighbours
  // are painted. The stalk thread handles those 3 cells (sides as full
  // crosses, stem cell stays half until the descent). Bean cells in the
  // same row (if any) belong to the bean thread, not the stalk.
  const tRows: number[] = [];
  for (let y = stemRun.yMin; y <= stemRun.yMax; y++) {
    if (stemX - 1 < 0 || stemX + 1 >= p.width) continue;
    if (p.cells[y][stemX - 1] !== color) continue;
    if (p.cells[y][stemX + 1] !== color) continue;
    tRows.push(y);
  }
  if (tRows.length === 0) return null;

  // ---- Thread 1: stalk ----
  // The recorded technique walks UP from the bottom T-base laying
  // half-stitches, doing T-row side cells as full crosses inline, then
  // walks DOWN at the end to complete all stem `\` legs.
  partsOut?.push({ name: 'stalk', stepStart: steps.length });
  emitStalkThread(steps, stemX, stemRun, tRows);

  // ---- Threads 2..N: bean clusters ----
  // T-rows come in pairs: a TOP-T (top edge of a bean cluster) and a
  // BOTTOM-T (bottom edge). The cluster spans yTop..yBot inclusive.
  // Pair consecutive T-rows: (tRows[0], tRows[1]), (tRows[2], tRows[3]),
  // etc. The bean cells live within yTop+1..yBot-1.
  const clusters: ClusterInfo[] = [];
  for (let i = 0; i + 1 < tRows.length; i += 2) {
    const yTop = tRows[i];
    const yBot = tRows[i + 1];
    if (yBot > yTop + 1) clusters.push({ yTop, yBot });
  }

  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    // Right side first, then left (mirrored). Each gets its own thread.
    partsOut?.push({ name: `bean ${ci + 1} (right)`, stepStart: steps.length });
    stitchBean(steps, stemX, cluster, /*mirror=*/ false);
    partsOut?.push({ name: `bean ${ci + 1} (left)`, stepStart: steps.length });
    stitchBean(steps, stemX, cluster, /*mirror=*/ true);
  }

  return steps;
}

/**
 * Emit the stalk thread: bottom T-base + (stem segment + T-row sides)
 * upward + descent. Modifies `steps` in place. Stalk needle starts at
 * BL of cell (stemX-1, yBot) and ends at TL of the topmost stem cell
 * after the descent (TR actually — see below).
 */
function emitStalkThread(
  steps: Step[],
  stemX: number,
  stemRun: { yMin: number; yMax: number },
  tRows: number[],
): void {
  // Sort T-rows top-down for clarity. We process bottom-up.
  const tRowsAsc = tRows.slice().sort((a, b) => a - b);
  const tRowsDesc = tRowsAsc.slice().reverse();
  // The bottom T-row is the largest y (last visually). Stalk starts there.
  const bottomT = tRowsDesc[0];

  // ---- Bottom T-base: 3 cells (stemX-1, bottomT), (stemX, bottomT),
  // (stemX+1, bottomT) sewn as a row of full crosses with row-halves.
  // Start at BL of (stemX-1, bottomT) = [stemX-1, bottomT+1].
  emit(steps, 'start', null, [stemX - 1, bottomT + 1]);
  // `/` going right on cells stemX-1, stemX, stemX+1.
  for (let dx = 0; dx <= 2; dx++) {
    const x = stemX - 1 + dx;
    emit(steps, 'front', [x, bottomT + 1], [x + 1, bottomT], [x, bottomT], '/');
    if (dx < 2) emit(steps, 'back', [x + 1, bottomT], [x + 1, bottomT + 1]);
  }
  // After last `/`, needle is at TR of cell (stemX+1, bottomT) = [stemX+2, bottomT].
  // Axis-back to BR of (stemX+1, bottomT) = [stemX+2, bottomT+1].
  emit(steps, 'back', [stemX + 2, bottomT], [stemX + 2, bottomT + 1]);
  // `\` going left on cells stemX+1, stemX, stemX-1.
  for (let dx = 0; dx <= 2; dx++) {
    const x = stemX + 1 - dx;
    emit(steps, 'front', [x + 1, bottomT + 1], [x, bottomT], [x, bottomT], '\\');
    if (dx < 2) emit(steps, 'back', [x, bottomT], [x, bottomT + 1]);
  }
  // Needle now at BL of (stemX-1, bottomT) = [stemX-1, bottomT+1].
  // Axis to BL of stem cell directly above: [stemX, bottomT].
  emit(steps, 'back', [stemX - 1, bottomT + 1], [stemX, bottomT]);

  // ---- Walk up: stem segments + T-rows ----
  // Process T-rows from bottomT going up (excluding bottomT itself).
  let cursorY = bottomT;
  for (let i = 1; i < tRowsDesc.length; i++) {
    const nextT = tRowsDesc[i];
    // Lay `/` on stem cells from (stemX, cursorY-1) up to (stemX, nextT+1).
    // Each step: front BL→TR, then axis to next BL.
    for (let y = cursorY - 1; y > nextT; y--) {
      const bl: Corner = [stemX, y + 1];
      const tr: Corner = [stemX + 1, y];
      // Need to be at BL: previous step ended at TR. Axis from TR to BL.
      const prev = steps[steps.length - 1].to;
      if (prev[0] !== bl[0] || prev[1] !== bl[1]) {
        emit(steps, 'back', prev, bl);
      }
      emit(steps, 'front', bl, tr, [stemX, y], '/');
    }
    // Now do the T-row at `nextT`: side cells as full crosses, center
    // stem cell only gets `/` (its `\` is added during descent).
    // Order from recording: lay `/` on stem cell first, then go to LEFT
    // side cell, do it / then \, then RIGHT side cell, do it / then \.
    // Recording shows for cluster T-row 36:
    //   front (8,37)→(9,36) cell (8,36) /
    //   back (9,36)→(8,36)
    //   front (8,36)→(7,37) cell (7,36) /
    //   back (7,37)→(7,36)
    //   front (7,36)→(8,37) cell (7,36) \
    //   back (8,37)→(9,37)
    //   front (9,37)→(10,36) cell (9,36) /
    //   back (10,36)→(10,37)
    //   front (10,37)→(9,36) cell (9,36) \
    //   back (9,36)→(8,36)
    {
      // Center stem `/`
      const centerBl: Corner = [stemX, nextT + 1];
      const centerTr: Corner = [stemX + 1, nextT];
      const prev = steps[steps.length - 1].to;
      if (prev[0] !== centerBl[0] || prev[1] !== centerBl[1]) {
        emit(steps, 'back', prev, centerBl);
      }
      emit(steps, 'front', centerBl, centerTr, [stemX, nextT], '/');
      // axis-back from TR to TL of center stem cell
      emit(steps, 'back', centerTr, [stemX, nextT]);
      // Left side cell `/` then `\`
      const lBl: Corner = [stemX - 1, nextT + 1];
      const lTr: Corner = [stemX, nextT];
      // Need to be at BL of left cell. Currently at TL of center = lTr.
      // Axis from lTr down to lBl, then over... actually recording shows
      // we go from (8,36)=TL center → front to (7,37) = BR? No wait:
      // recording: front (8,36)→(7,37) cell (7,36) /  — that's BR→TL of left cell.
      // So `/` on left cell goes from BR=(8,37) to TL=(7,36)? Let me re-read.
      // Actually `/` connects BL and TR. For cell (7,36): BL=(7,37), TR=(8,36).
      // The recording says front (8,36)→(7,37) which is TR→BL. That's still
      // the `/` leg, just traversed backward. The renderer treats them the same.
      // So we go from (stemX, nextT) = TL center / TR of left cell, to (stemX-1, nextT+1) = BL of left cell.
      emit(steps, 'front', lTr, lBl, [stemX - 1, nextT], '/');
      // axis-back from BL to TL of left cell
      emit(steps, 'back', lBl, [stemX - 1, nextT]);
      // `\` on left cell: TL → BR. Recording: front (7,36)→(8,37).
      emit(steps, 'front', [stemX - 1, nextT], [stemX, nextT + 1], [stemX - 1, nextT], '\\');
      // axis-back to TR of center stem cell at (stemX+1, nextT)... wait recording: back (8,37)→(9,37).
      // That's a 2-cell horizontal axis from BL of center to BR of center. OK.
      emit(steps, 'back', [stemX, nextT + 1], [stemX + 1, nextT + 1]);
      // Right side cell `/`: from BL=(stemX+1, nextT+1) to TR=(stemX+2, nextT).
      emit(steps, 'front', [stemX + 1, nextT + 1], [stemX + 2, nextT], [stemX + 1, nextT], '/');
      // axis-back from TR to TR... wait: recording back (10,36)→(10,37). That's TR=(stemX+2, nextT) → BR=(stemX+2, nextT+1).
      emit(steps, 'back', [stemX + 2, nextT], [stemX + 2, nextT + 1]);
      // `\` on right cell: BR → TL. Recording: front (10,37)→(9,36) cell (9,36) \.
      emit(steps, 'front', [stemX + 2, nextT + 1], [stemX + 1, nextT], [stemX + 1, nextT], '\\');
      // axis-back from TL of right cell to TL of center stem.
      emit(steps, 'back', [stemX + 1, nextT], [stemX, nextT]);
    }
    cursorY = nextT;
  }

  // ---- After last T-row: continue stem segments to the top ----
  // Lay `/` on remaining stem cells from (stemX, cursorY-1) up to (stemX, stemRun.yMin).
  for (let y = cursorY - 1; y >= stemRun.yMin; y--) {
    const bl: Corner = [stemX, y + 1];
    const tr: Corner = [stemX + 1, y];
    const prev = steps[steps.length - 1].to;
    if (prev[0] !== bl[0] || prev[1] !== bl[1]) {
      emit(steps, 'back', prev, bl);
    }
    emit(steps, 'front', bl, tr, [stemX, y], '/');
  }
  // After top `/`, needle at TR of top cell = (stemX+1, stemRun.yMin).
  // Axis to TL of top cell.
  emit(steps, 'back', [stemX + 1, stemRun.yMin], [stemX, stemRun.yMin]);

  // ---- Descent: lay `\` on every stem cell, top to bottom ----
  // Skip the bottom T-row's stem cell because the T-base loop above
  // already laid `\` on it.
  for (let y = stemRun.yMin; y < bottomT; y++) {
    const tl: Corner = [stemX, y];
    const br: Corner = [stemX + 1, y + 1];
    const prev = steps[steps.length - 1].to;
    if (prev[0] !== tl[0] || prev[1] !== tl[1]) {
      emit(steps, 'back', prev, tl);
    }
    emit(steps, 'front', tl, br, [stemX, y], '\\');
  }
}

/**
 * Stitch one bean cluster on one side of the stem. Each bean is sewn as
 * its own thread (per the recording). `mirror=false` = right side
 * (columns stemX+1 .. stemX+7), `mirror=true` = left side mirrored
 * (columns stemX-1 .. stemX-7).
 *
 * The recorded canonical sequence (right side, cluster row range
 * yTop..yBot-1, with yBot - yTop = 7) is encoded as a series of
 * sub-motifs in normalized coordinates and translated into chart space.
 */
function stitchBean(
  steps: Step[],
  stemX: number,
  cluster: ClusterInfo,
  mirror: boolean,
): void {
  // Normalised frame: ncy=0 maps to the cluster's TOP T-row (yTop),
  // ncy=6 to the row just above the BOTTOM T-row. Bean cells span
  // ncy=0..6 across the right side at ncx=1..7 (the T-cells at ncx=0
  // belong to the stalk). The recording's cluster 1 (yTop=9, yBot=16)
  // sets yOffset=9 so cell (1, 6) maps to chart (10, 15) ✓.
  const yOffset = cluster.yTop;
  // In mirror mode, normalised x=1 maps to actual x=stemX-1; normalised
  // x=8 maps to stemX-8. We mirror the *cell* x, but when emitting front
  // legs the leg direction (`/` vs `\`) flips too because mirroring
  // around the stem swaps `/` ↔ `\`.
  const flipLeg = mirror;

  // Normalized frame:
  //   cell (ncx, ncy) → chart cell (stemX + 1 + ncx, yOffset + ncy)
  //                    (or mirrored: stemX - 1 - ncx)
  //   corner (nx, ny) → chart corner (stemX + 1 + nx, yOffset + ny) for the
  //                    right side. Mirroring around stem means the LEFT side's
  //                    chart corner is (stemX - 1 - nx + 1) = stemX - nx (because
  //                    a corner shared by left-of-stem cells sits one to the
  //                    LEFT of the cell's column index).
  // Equivalently: corner-x at chart = stemX + 1 + xSign*(nx) where xSign
  // flips both the corner offset AND the cell index together. Easiest is
  // to compute via cell BL/TR rather than re-derive every time.
  const toCorner = (nx: number, ny: number): Corner =>
    mirror ? [stemX - nx, yOffset + ny] : [stemX + 1 + nx, yOffset + ny];
  const toCell = (ncx: number, ncy: number): [number, number] =>
    mirror ? [stemX - 1 - ncx, yOffset + ncy] : [stemX + 1 + ncx, yOffset + ncy];
  const flipL = (leg: '/' | '\\'): '/' | '\\' =>
    flipLeg ? (leg === '/' ? '\\' : '/') : leg;

  // The recorded bean has cells painted (relative cell coords cx in 0..6, cy in 0..6) — our
  // primitive sequences below name cells by their NORMALIZED corner space:
  //
  //   normalized cell (ncx, ncy) corresponds to the cell occupying corners
  //   (ncx, ncy) and (ncx+1, ncy+1) in the normalised frame.
  //
  // For the right-side bean of any cluster, ncx ranges 1..7 and ncy 0..6.
  // The chart-space cell is (stemX + 1 + (ncx - 1), yTop + ncy) = (stemX + ncx, yOffset + ncy).
  //
  // Let helper emit a `front` step given normalised cell (ncx, ncy) and
  // a leg, deciding from/to corners automatically based on the previous
  // emit and the leg orientation. We need to drive from/to from the
  // recording's corner sequence directly to be faithful.

  // ---- Sub-motif emitters ----
  // Below, F(nfromX, nfromY, ntoX, ntoY, ncx, ncy, leg) emits a front
  // and B(...) emits a back. All in normalised coordinates.
  const F = (
    fx: number,
    fy: number,
    tx: number,
    ty: number,
    cx: number,
    cy: number,
    leg: '/' | '\\',
  ): void => {
    emit(steps, 'front', toCorner(fx, fy), toCorner(tx, ty), toCell(cx, cy), flipL(leg));
  };
  const B = (fx: number, fy: number, tx: number, ty: number): void => {
    emit(steps, 'back', toCorner(fx, fy), toCorner(tx, ty));
  };

  // Thread start at BL of normalised cell (1, 6) = normalised corner (1, 7).
  emit(steps, 'start', null, toCorner(1, 7));

  // S1 — diag slice on row ncy=6: cells (1,6), (3,6), (4,6), (5,6).
  F(1, 7, 2, 6, 1, 6, '/');         // (10,15) /
  B(2, 6, 3, 6);                      // axis-right
  F(3, 6, 4, 7, 3, 6, '\\');        // (12,15) \
  B(4, 7, 4, 6);
  F(4, 6, 5, 7, 4, 6, '\\');        // (13,15) \
  B(5, 7, 5, 6);
  F(5, 6, 6, 7, 5, 6, '\\');        // (14,15) \
  B(6, 7, 6, 6);
  F(6, 6, 5, 7, 5, 6, '/');         // (14,15) /
  B(5, 7, 5, 6);
  F(5, 6, 4, 7, 4, 6, '/');         // (13,15) /
  B(4, 7, 4, 6);
  F(4, 6, 3, 7, 3, 6, '/');         // (12,15) /
  B(3, 7, 2, 7);                      // axis-left to (11,16)
  F(2, 7, 1, 6, 1, 6, '\\');        // (10,15) \
  B(1, 6, 2, 6);                      // axis-right to (11,15)

  // S2 — diag slice on row ncy=5: cells (2,5), (4,5), (5,5), (6,5).
  F(2, 6, 3, 5, 2, 5, '/');         // (11,14) /
  B(3, 5, 4, 5);
  F(4, 5, 5, 6, 4, 5, '\\');
  B(5, 6, 5, 5);
  F(5, 5, 6, 6, 5, 5, '\\');
  B(6, 6, 6, 5);
  F(6, 5, 7, 6, 6, 5, '\\');
  B(7, 6, 7, 5);
  F(7, 5, 6, 6, 6, 5, '/');
  B(6, 6, 6, 5);
  F(6, 5, 5, 6, 5, 5, '/');
  B(5, 6, 5, 5);
  F(5, 5, 4, 6, 4, 5, '/');
  B(4, 6, 3, 6);                      // axis-left to (12,15)
  F(3, 6, 2, 5, 2, 5, '\\');        // (11,14) \
  B(2, 5, 1, 5);                      // axis-left to (10,14)

  // S3 — column at ncx=1, rows 4→2 (cells (1,4), (1,3), (1,2)).
  F(1, 5, 2, 4, 1, 4, '/');
  B(2, 4, 1, 4);
  F(1, 4, 2, 3, 1, 3, '/');
  B(2, 3, 1, 3);
  F(1, 3, 2, 2, 1, 2, '/');
  B(2, 2, 1, 2);
  F(1, 2, 2, 3, 1, 2, '\\');
  B(2, 3, 1, 3);
  F(1, 3, 2, 4, 1, 3, '\\');
  B(2, 4, 1, 4);
  F(1, 4, 2, 5, 1, 4, '\\');
  B(2, 5, 3, 5);                      // axis-right to (12,14)

  // S4 — diag slice on row ncy=4: cells (3,4), (5,4), (6,4), (7,4).
  F(3, 5, 4, 4, 3, 4, '/');
  B(4, 4, 5, 4);
  F(5, 4, 6, 5, 5, 4, '\\');
  B(6, 5, 6, 4);
  F(6, 4, 7, 5, 6, 4, '\\');
  B(7, 5, 7, 4);
  F(7, 4, 8, 5, 7, 4, '\\');
  B(8, 5, 8, 4);
  F(8, 4, 7, 5, 7, 4, '/');
  B(7, 5, 7, 4);
  F(7, 4, 6, 5, 6, 4, '/');
  B(6, 5, 6, 4);
  F(6, 4, 5, 5, 5, 4, '/');
  B(5, 5, 4, 5);
  F(4, 5, 3, 4, 3, 4, '\\');
  B(3, 4, 2, 4);                      // axis-left to (11,13)

  // S5 — column at ncx=2, rows 3→1.
  F(2, 4, 3, 3, 2, 3, '/');
  B(3, 3, 2, 3);
  F(2, 3, 3, 2, 2, 2, '/');
  B(3, 2, 2, 2);
  F(2, 2, 3, 1, 2, 1, '/');
  B(3, 1, 2, 1);
  F(2, 1, 3, 2, 2, 1, '\\');
  B(3, 2, 2, 2);
  F(2, 2, 3, 3, 2, 2, '\\');
  B(3, 3, 2, 3);
  F(2, 3, 3, 4, 2, 3, '\\');
  B(3, 4, 3, 3);                      // axis-up

  // S6 — column at ncx=3, rows 2→0.
  F(3, 3, 4, 2, 3, 2, '/');
  B(4, 2, 3, 2);
  F(3, 2, 4, 1, 3, 1, '/');
  B(4, 1, 3, 1);
  F(3, 1, 4, 0, 3, 0, '/');
  B(4, 0, 3, 0);
  F(3, 0, 4, 1, 3, 0, '\\');
  B(4, 1, 3, 1);
  F(3, 1, 4, 2, 3, 1, '\\');
  B(4, 2, 3, 2);
  F(3, 2, 4, 3, 3, 2, '\\');
  B(4, 3, 4, 4);                      // axis-down

  // S7 — single cell pair at (4, 3): / then \ at the same cell.
  F(4, 4, 5, 3, 4, 3, '/');
  B(5, 3, 4, 3);
  F(4, 3, 5, 4, 4, 3, '\\');
  B(5, 4, 5, 3);

  // S8 — column at ncx=5, rows 2→0.
  F(5, 3, 6, 2, 5, 2, '/');
  B(6, 2, 5, 2);
  F(5, 2, 6, 1, 5, 1, '/');
  B(6, 1, 5, 1);
  F(5, 1, 6, 0, 5, 0, '/');
  B(6, 0, 5, 0);
  F(5, 0, 6, 1, 5, 0, '\\');
  B(6, 1, 5, 1);
  F(5, 1, 6, 2, 5, 1, '\\');
  B(6, 2, 5, 2);
  F(5, 2, 6, 3, 5, 2, '\\');
  B(6, 3, 7, 3);                      // axis-right to (16,12)

  // S9 — right-tip mop-up: cells (6,2), (6,1), (6,3), (7,0), (7,2).
  F(7, 3, 6, 2, 6, 2, '\\');
  B(6, 2, 7, 2);
  F(7, 2, 6, 1, 6, 1, '\\');
  B(6, 1, 7, 1);
  F(7, 1, 6, 2, 6, 1, '/');
  B(6, 2, 7, 2);
  F(7, 2, 6, 3, 6, 2, '/');
  B(6, 3, 7, 3);
  F(7, 3, 8, 2, 7, 2, '/');
  B(8, 2, 8, 1);
  F(8, 1, 7, 0, 7, 0, '\\');
  B(7, 0, 8, 0);
  F(8, 0, 7, 1, 7, 0, '/');
  B(7, 1, 7, 2);
  F(7, 2, 8, 3, 7, 2, '\\');
}

/**
 * Convert a Step sequence into a (points, threadStarts) pair compatible with
 * the GT recorder schema. Also returns `stepToPoint`: a mapping from step
 * index → the point index where that step's first emitted corner lands.
 * Callers that recorded part boundaries by step index can use this to
 * translate them into point indices.
 */
function stepsToPointsAndStarts(steps: Step[]): {
  points: Corner[];
  threadStarts: number[];
  stepToPoint: number[];
} {
  const points: Corner[] = [];
  const threadStarts: number[] = [];
  const stepToPoint: number[] = new Array(steps.length).fill(0);
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    stepToPoint[i] = points.length;
    if (s.kind === 'start') {
      threadStarts.push(points.length);
      points.push(s.to);
    } else if (s.kind === 'front' || s.kind === 'back') {
      const last = points[points.length - 1];
      if (s.from && last && (last[0] !== s.from[0] || last[1] !== s.from[1])) {
        // Defensive: insert the missing 'from' so the pair makes sense.
        points.push(s.from);
      }
      points.push(s.to);
    }
  }
  if (threadStarts.length === 0) threadStarts.push(0);
  return { points, threadStarts, stepToPoint };
}

type CanonicalEntry =
  | { kind: 'points'; fn: (p: Pattern) => Corner[] | null }
  | {
      kind: 'steps';
      fn: (p: Pattern, partsOut?: StepParts) => Step[] | null;
    };

const CANONICAL: Record<string, CanonicalEntry> = {
  oldMansTeeth: { kind: 'points', fn: omtCanonicalPoints },
  coffeeBean: { kind: 'steps', fn: coffeeBeanCanonicalSteps },
};

export function getCanonicalGroundTruth(patternId: string): GroundTruth | null {
  const entry = CANONICAL[patternId];
  if (!entry) return null;
  const pattern = BUILTIN_PATTERNS[patternId];
  if (!pattern) return null;

  if (entry.kind === 'points') {
    const points = entry.fn(pattern);
    if (!points || points.length < 2) return null;
    const threadStarts = [0];
    const steps = pointsToSteps(points, threadStarts);
    return { points, threadStarts, steps };
  }

  // 'steps' kind: convert the step sequence into the (points, threadStarts)
  // pair used by storage and the recorder. Also collect named parts if the
  // generator emits them.
  const stepParts: StepParts = [];
  const steps = entry.fn(pattern, stepParts);
  if (!steps || steps.length === 0) return null;
  const { points, threadStarts, stepToPoint } = stepsToPointsAndStarts(steps);

  // Translate part boundaries from step indices into point indices.
  // Each part runs from its own stepStart to the next part's stepStart
  // (or end of steps for the last part).
  const parts = stepParts.length
    ? stepParts.map((p, i) => {
        const nextStart = i + 1 < stepParts.length ? stepParts[i + 1].stepStart : steps.length;
        return {
          name: p.name,
          pointStart: stepToPoint[p.stepStart] ?? 0,
          pointEnd: nextStart >= steps.length ? points.length : (stepToPoint[nextStart] ?? points.length),
        };
      })
    : undefined;

  return { points, threadStarts, steps, parts };
}

export function hasCanonicalGroundTruth(patternId: string): boolean {
  return getCanonicalGroundTruth(patternId) !== null;
}
