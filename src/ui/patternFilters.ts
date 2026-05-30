/**
 * Shared pattern-filtering helpers used by both the Library tab and the
 * Design tab's library panel, so the two stay in lock-step. Pure functions
 * over `Pattern` — no React, no DOM.
 */

import type { Pattern } from '../engine/types';

/** Lower-case ASCII normalize so "Sarwa" matches "sarwa" / "SARWA". */
export function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}

/** Match query against name, arabic name, and region. Empty query = match. */
export function matchesQuery(p: Pattern, q: string): boolean {
  if (!q) return true;
  const ql = q.toLowerCase();
  if (norm(p.name).includes(ql)) return true;
  // Builtin Arabic — substring on raw value (don't lowercase RTL).
  if ((p.nameAr ?? '').includes(q)) return true;
  if ((p.regionAr ?? '').includes(q)) return true;
  const src = p.source;
  if (src) {
    if (norm(src.originalName).includes(ql)) return true;
    if (norm(src.region).includes(ql)) return true;
    if ((src.arabicName ?? '').includes(q)) return true;
  }
  return false;
}

/** Number of non-empty palette entries. */
export function colorCount(p: Pattern): number {
  if (!p.palette) return 0;
  let n = 0;
  for (const c of p.palette) if (c !== null) n++;
  return n;
}

export function paintedCells(p: Pattern): number {
  let n = 0;
  for (const row of p.cells) {
    for (const c of row) if (c) n++;
  }
  return n;
}

/**
 * Dimensions of a pattern's painted bounding box (ignoring blank margin rows
 * and columns), in stitches. This matches what a motif occupies once placed
 * (placement trims to the painted box), so it's the size to compare against a
 * marked area. An all-empty pattern returns {w:0,h:0}.
 */
export function paintedSize(p: Pattern): { w: number; h: number } {
  let top = Infinity;
  let left = Infinity;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < p.cells.length; y++) {
    const row = p.cells[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return { w: 0, h: 0 };
  return { w: right - left + 1, h: bottom - top + 1 };
}

export type SizeBucket = 'small' | 'medium' | 'large';
export type ComplexityBucket = 'simple' | 'medium' | 'complex';
export type ColorBucket = 1 | 2 | 3 | 4 | 5;

/**
 * Heuristic: is this pattern a border? Matches names that mention "border"
 * (English), "sinsal"/"haashia"/"dayer" (Palestinian border terms), or the
 * Arabic ٍسنسال / حاشية / داير. Source-of-truth is name text — many tirazain
 * archive entries follow "Sinsal / Border (N)" or "Nafnoof Border" patterns.
 */
const BORDER_PATTERNS = /border|sinsal|haashia|dayer|سنسال|حاشية|داير/i;
export function isBorderPatternByName(p: Pattern): boolean {
  const haystack = [p.name, p.nameAr, p.source?.originalName, p.source?.arabicName]
    .filter(Boolean)
    .join(' ');
  return BORDER_PATTERNS.test(haystack);
}

/**
 * Stronger check: structural border eligibility. Returns true if the
 * pattern is usable as a continuous border, by any of these criteria —
 *
 *   1. The name says so (Sinsal, Nafnoof Border, Dayer Qabbeh, etc.).
 *   2. There's a continuous spine — a row or column with ≥80% painted cells
 *      running the long axis. Tiles like Sarwa (cypress tree with a central
 *      trunk) qualify here even though their name doesn't say "border."
 *   3. The pattern decomposes to a smaller period along its long axis —
 *      i.e., its own data contains visible repetition (Coffee Bean and
 *      similar small rhythmic motifs).
 *
 * Anything ≥10 cells on the short axis is excluded as too "blocky" to read
 * as a border line.
 */
export function isBorderPattern(p: Pattern): boolean {
  if (isBorderPatternByName(p)) return true;
  // Name aside, structural cues.
  const w = p.width;
  const h = p.height;
  // Strip-like aspect; we look at the *long axis* for the spine.
  const longIsH = h >= w;
  const longLen = longIsH ? h : w;
  const shortLen = longIsH ? w : h;
  // Allow up to ~15 short-axis cells to call it a border-eligible strip.
  if (shortLen > 15) return false;
  // Continuous spine: any row (when long axis = w) or column (long axis = h)
  // with ≥80% painted cells along the long axis is a "spine."
  const SPINE_FRACTION = 0.8;
  const threshold = Math.ceil(longLen * SPINE_FRACTION);
  if (longIsH) {
    // Look for a column where ≥threshold of the rows have a painted cell.
    for (let x = 0; x < w; x++) {
      let count = 0;
      for (let y = 0; y < h; y++) {
        if ((p.cells[y]?.[x] ?? 0) > 0) count++;
      }
      if (count >= threshold) return true;
    }
  } else {
    // Look for a row.
    for (let y = 0; y < h; y++) {
      let count = 0;
      const row = p.cells[y] ?? [];
      for (let x = 0; x < w; x++) {
        if (row[x] > 0) count++;
      }
      if (count >= threshold) return true;
    }
  }
  return false;
}

export function sizeBucket(p: Pattern): SizeBucket {
  const m = Math.max(p.width, p.height);
  if (m <= 30) return 'small';
  if (m <= 60) return 'medium';
  return 'large';
}

export function complexityBucket(painted: number): ComplexityBucket {
  if (painted <= 300) return 'simple';
  if (painted <= 1000) return 'medium';
  return 'complex';
}

/** Label tables for the filter chip rows (English + Arabic), shared by both tabs. */
export const SIZE_FILTERS: Array<[SizeBucket, string]> = [
  ['small', 'Small (≤30)'],
  ['medium', 'Medium (31–60)'],
  ['large', 'Large (>60)'],
];

export const COMPLEXITY_FILTERS: Array<[ComplexityBucket, string]> = [
  ['simple', 'Simple'],
  ['medium', 'Medium'],
  ['complex', 'Complex'],
];

export const COLOR_BUCKETS: ColorBucket[] = [1, 2, 3, 4, 5];
