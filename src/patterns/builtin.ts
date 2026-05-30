import type { ColorIndex, Palette, PaletteColor, Pattern } from '../engine/types';

const c = (rows: number[][]): ColorIndex[][] => rows.map((r) => r.map((v) => v as ColorIndex));

export const BUILTIN_PATTERNS: Record<string, Pattern> = {
  coffeeBean: {
    name: 'Coffee Bean (Habbet Binn)',
    nameAr: 'حبة البن',
    regionAr: 'الخليل',
    description:
      'A Hebron motif named for the coffee bean, long tied to Palestinian hospitality. Paired beans repeat down the panel as a vertical border.',
    width: 19,
    height: 46,
    cells: c([
      [1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0],
      [0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0],
      [1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0],
      [0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]),
    palette: [null, { hex: '#D21D22', dmc: { number: '3801', name: 'Christmas Red LT' } }],
  },
  cypressTree: {
    name: 'Cypress Tree (Sarw)',
    nameAr: 'السرو',
    regionAr: 'رام الله',
    description:
      'The cypress tree, one of the most common tatreez motifs, often read as a symbol of resilience and long life. A Ramallah rendering.',
    width: 11,
    height: 28,
    cells: c([
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0],
      [0, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0],
      [0, 2, 0, 2, 0, 2, 0, 2, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 1, 2, 0, 2, 1, 0, 0, 0, 0],
      [0, 0, 1, 2, 0, 2, 1, 0, 0, 0, 0],
      [0, 0, 1, 2, 0, 2, 1, 0, 0, 0, 0],
      [0, 0, 1, 2, 0, 2, 1, 0, 0, 0, 0],
      [0, 1, 2, 2, 0, 2, 2, 1, 0, 0, 0],
      [0, 1, 2, 2, 0, 2, 2, 1, 0, 0, 0],
      [0, 1, 2, 2, 0, 2, 2, 1, 0, 0, 0],
      [0, 1, 2, 2, 0, 2, 2, 1, 0, 0, 0],
      [1, 2, 2, 2, 0, 2, 2, 2, 1, 0, 0],
      [1, 2, 2, 2, 0, 2, 2, 2, 1, 0, 0],
      [1, 2, 2, 2, 0, 2, 2, 2, 1, 0, 0],
      [1, 2, 2, 2, 0, 2, 2, 2, 1, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]),
    palette: [
      null,
      { hex: '#5977A6', dmc: { number: '3838', name: 'Lavender Blue DK' } },
      { hex: '#E04B91', dmc: { number: '603', name: 'Pink Mauve Med' } },
    ],
  },
  moonOfBethlehem: {
    name: 'Najma (Star)',
    nameAr: 'النجمة',
    regionAr: 'بيت لحم',
    description:
      'A star (Najma) from Bethlehem — a radial medallion built around a central point with even, pointed symmetry.',
    width: 15,
    height: 15,
    cells: c([
      [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0],
      [2, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 2, 0, 0],
      [2, 2, 0, 0, 0, 1, 0, 1, 0, 0, 0, 2, 2, 0, 0],
      [2, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 2, 0, 0],
      [0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0],
      [1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]),
    palette: [
      null,
      { hex: '#D21D22', dmc: { number: '3801', name: 'Christmas Red LT' } },
      { hex: '#E04B91', dmc: { number: '603', name: 'Pink Mauve Med' } },
    ],
  },
  oldMansTeeth: {
    name: "Old Man's Teeth (Snan El 'Ajouz)",
    nameAr: 'سنان العجوز',
    regionAr: 'الجليل',
    description:
      'A Galilee border motif: a row of triangular "teeth" above a solid band, with an empty row separating each repeat.',
    width: 10,
    height: 3,
    cells: c([
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]),
  },
};

export const PALETTE: { name: string; color: string | null }[] = [
  { name: 'empty', color: null },
  { name: 'red', color: '#A32D2D' },
  { name: 'black', color: '#2C2C2A' },
  { name: 'teal', color: '#1E7A7A' },
  { name: 'blue', color: '#7EA0C2' },
  { name: 'maroon', color: '#5E1A2C' },
  { name: 'gold', color: '#C39E3F' },
  { name: 'green', color: '#3F7A3D' },
];

/**
 * Upgrade a possibly-legacy palette to the {@link Palette} object shape.
 * Accepts either the current `(PaletteColor | null)[]` or the legacy
 * hex-only `(string | null)[]` and returns the object shape. Idempotent.
 *
 * Persisted localStorage data and any not-yet-reimported source may carry
 * the legacy shape; call this at every load boundary so the rest of the
 * code only ever sees `PaletteColor` objects.
 */
export function normalizePalette(raw: unknown): Palette {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (entry == null) return null;
    if (typeof entry === 'string') return { hex: entry };
    if (typeof entry === 'object' && typeof (entry as PaletteColor).hex === 'string') {
      const e = entry as PaletteColor;
      return e.dmc ? { hex: e.hex, dmc: { ...e.dmc } } : { hex: e.hex };
    }
    return null;
  });
}

/**
 * Resolve the effective colour palette for a pattern as **hex strings**
 * (the rendering path). Returns the pattern's own palette if set,
 * otherwise the global PALETTE. Index 0 is empty (null).
 *
 * Use this everywhere that paints cells from a pattern — never index
 * into the global PALETTE directly when displaying a pattern's cells.
 */
export function getPalette(pattern: Pattern): (string | null)[] {
  return getPaletteColors(pattern).map((c) => (c == null ? null : c.hex));
}

/**
 * Resolve the effective colour palette as {@link PaletteColor} objects
 * (hex + optional DMC). Use this where DMC metadata is needed (editor
 * swatches, plans material list, library cards). Index 0 is empty (null).
 */
export function getPaletteColors(pattern: Pattern): Palette {
  if (pattern.palette && pattern.palette.length > 0) {
    return normalizePalette(pattern.palette);
  }
  return PALETTE.map((p) => (p.color == null ? null : { hex: p.color }));
}

export function emptyPattern(width: number, height: number, name = 'Untitled'): Pattern {
  return {
    name,
    width,
    height,
    cells: Array.from({ length: height }, () => Array(width).fill(0) as ColorIndex[]),
  };
}

export function clonePattern(p: Pattern): Pattern {
  const out: Pattern = {
    name: p.name,
    width: p.width,
    height: p.height,
    cells: p.cells.map((row) => row.slice()),
  };
  if (p.palette) out.palette = normalizePalette(p.palette);
  if (p.source) out.source = { ...p.source };
  return out;
}
