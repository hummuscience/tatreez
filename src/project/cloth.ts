/**
 * Cloth and floss-thickness options for the Project Setup panel.
 *
 * Tatreez is traditionally stitched on Aida 14 with 2 strands; the
 * tables here cover the common variants a stitcher might choose. The
 * planner uses these to compute (a) finished-piece dimensions in cm
 * and (b) per-color floss requirements in mm / skeins.
 */

export interface ClothOption {
  id: string;
  label: string;
  /** Stitches per inch (the "count" — Aida 14 = 14 stitches per inch). */
  count: number;
  /** Real-world spacing between holes, in mm. */
  holeMm: number;
}

export const CLOTH_OPTIONS: ClothOption[] = [
  { id: 'aida-11', label: 'Aida 11-count', count: 11, holeMm: 2.31 },
  { id: 'aida-14', label: 'Aida 14-count', count: 14, holeMm: 1.81 },
  { id: 'aida-16', label: 'Aida 16-count', count: 16, holeMm: 1.59 },
  { id: 'aida-18', label: 'Aida 18-count', count: 18, holeMm: 1.41 },
  { id: 'even-25', label: 'Evenweave 25-ct', count: 25, holeMm: 1.02 },
  { id: 'even-28', label: 'Evenweave 28-ct', count: 28, holeMm: 0.91 },
  { id: 'even-32', label: 'Evenweave 32-ct', count: 32, holeMm: 0.79 },
  { id: 'linen-36', label: 'Linen 36-count', count: 36, holeMm: 0.71 },
];

export const DEFAULT_CLOTH_ID = 'aida-14';

export interface StrandOption {
  id: string;
  label: string;
  /** Length multiplier vs. baseline (2 strands = 1.0). */
  mult: number;
}

export const STRAND_OPTIONS: StrandOption[] = [
  { id: '1', label: '1 strand', mult: 0.6 },
  { id: '2', label: '2 strands (typical)', mult: 1.0 },
  { id: '3', label: '3 strands', mult: 1.4 },
  { id: '4', label: '4 strands', mult: 1.8 },
  { id: '6', label: '6 strands (heavy)', mult: 2.6 },
];

export const DEFAULT_STRANDS_ID = '2';

/**
 * mm of floss needed for one cross-stitch on the given cloth. A cross
 * is two diagonals of one cell; each diagonal is √2 × the hole spacing.
 */
export function flossPerStitchMm(cloth: ClothOption): number {
  return 2 * Math.SQRT2 * cloth.holeMm;
}

/** Approx usable length of one DMC skein in mm. */
export const SKEIN_MM = 8000;

/**
 * Look up a cloth option by id, falling back to the default if not found.
 * Useful when reading user-controlled state that might be stale.
 */
export function getCloth(id: string | null | undefined): ClothOption {
  return CLOTH_OPTIONS.find((c) => c.id === id) ?? CLOTH_OPTIONS.find((c) => c.id === DEFAULT_CLOTH_ID)!;
}

export function getStrands(id: string | null | undefined): StrandOption {
  return STRAND_OPTIONS.find((s) => s.id === id) ?? STRAND_OPTIONS.find((s) => s.id === DEFAULT_STRANDS_ID)!;
}
