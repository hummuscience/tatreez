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
