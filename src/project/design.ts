/**
 * The Design workspace data model and pure helpers.
 *
 * A Design is a cloth-sized stitch grid (same coordinate system as the
 * editor) holding a set of named Areas. Each Area is a labeled rectangle
 * containing freely-placed motifs and/or one repeating motif. Areas are
 * the unit of planning: each derives into a normal `Pattern` and is
 * planned on its own via the existing Plan tab.
 */

import type { ColorIndex, Pattern } from '../engine/types';
import { getPalette } from '../patterns/builtin';
import type { ClothOption } from './cloth';

export interface PlacedMotif {
  /** Library reference (builtin / saved / tirazain key) for provenance. */
  patternKey: string;
  /** Snapshot of the motif's cells, already remapped to the design palette. */
  cells: ColorIndex[][];
  /** Top-left position within the owning area, in grid cells. */
  x: number;
  y: number;
}

export type RepeatMode = 'horizontal' | 'grid';

export interface AreaRepeat {
  mode: RepeatMode;
  patternKey: string;
  /** Motif cells remapped to the design palette. */
  cells: ColorIndex[][];
}

export interface Area {
  id: string;
  name: string;
  /** Top-left on the design grid, in cells. */
  x: number;
  y: number;
  /** Size in cells. */
  w: number;
  h: number;
  motifs: PlacedMotif[];
  /** When present, the area is filled by repeating one motif. */
  repeat?: AreaRepeat;
}

export interface Design {
  id: string;
  name: string;
  clothId: string;
  strandsId: string;
  widthCm: number;
  heightCm: number;
  /** Derived grid size, stored for stability if cloth changes later. */
  gridW: number;
  gridH: number;
  areas: Area[];
  /** Merged design palette: index 0 = null (empty), 1..N = hex strings. */
  palette: (string | null)[];
}

/** Convert a real-world cm length to a count of stitch cells on a cloth. */
export function cmToCells(cm: number, cloth: ClothOption): number {
  return Math.max(1, Math.round((cm / 2.54) * cloth.count));
}

/**
 * Fold a motif's palette into a design palette, deduping by case-insensitive
 * hex. Returns the (possibly extended) design palette plus an `indexMap` from
 * the motif's local color indices to design indices. Index 0 (empty) always
 * maps to 0.
 */
export function mergePalette(
  designPalette: (string | null)[],
  motifPalette: (string | null)[],
): { palette: (string | null)[]; indexMap: number[] } {
  const palette = designPalette.slice();
  if (palette.length === 0) palette.push(null); // ensure index 0 = empty
  const indexMap: number[] = [0];

  for (let i = 1; i < motifPalette.length; i++) {
    const hex = motifPalette[i];
    if (hex == null) {
      // A hole in the motif palette: map to empty.
      indexMap[i] = 0;
      continue;
    }
    const norm = hex.toLowerCase();
    let found = -1;
    for (let j = 1; j < palette.length; j++) {
      if ((palette[j] ?? '').toLowerCase() === norm) {
        found = j;
        break;
      }
    }
    if (found === -1) {
      palette.push(hex);
      found = palette.length - 1;
    }
    indexMap[i] = found;
  }
  return { palette, indexMap };
}

/** Remap a motif's cells through an indexMap from `mergePalette`. */
export function remapCells(cells: ColorIndex[][], indexMap: number[]): ColorIndex[][] {
  return cells.map((row) => row.map((v) => indexMap[v] ?? 0));
}

export interface RepeatFit {
  /** Whole copies that fit across (x) and down (y). */
  cols: number;
  rows: number;
  /** Leftover cells after the whole copies, per axis. */
  leftoverX: number;
  leftoverY: number;
}

/** How many whole copies of a motif fit in an area, and the remainder. */
export function repeatFit(area: Area, motifW: number, motifH: number, mode: RepeatMode): RepeatFit {
  const cols = motifW > 0 ? Math.floor(area.w / motifW) : 0;
  const rowsRaw = motifH > 0 ? Math.floor(area.h / motifH) : 0;
  const rows = mode === 'horizontal' ? Math.min(1, rowsRaw) : rowsRaw;
  return {
    cols,
    rows,
    leftoverX: area.w - cols * motifW,
    leftoverY: area.h - rows * motifH,
  };
}

/**
 * Composite an area into a standalone `Pattern` on a `w×h` grid using the
 * design palette. Free motifs are painted at their offsets; if `repeat` is
 * set, the repeat motif tiles whole copies (repeat wins over free motifs).
 * Cells painted out of bounds are clipped.
 */
export function compositeArea(area: Area, palette: (string | null)[]): Pattern {
  const grid: ColorIndex[][] = Array.from({ length: area.h }, () =>
    new Array<ColorIndex>(area.w).fill(0),
  );

  const paint = (cells: ColorIndex[][], ox: number, oy: number) => {
    for (let y = 0; y < cells.length; y++) {
      const gy = oy + y;
      if (gy < 0 || gy >= area.h) continue;
      const row = cells[y];
      for (let x = 0; x < row.length; x++) {
        const gx = ox + x;
        if (gx < 0 || gx >= area.w) continue;
        const v = row[x];
        if (v > 0) grid[gy][gx] = v;
      }
    }
  };

  if (area.repeat) {
    const { cells } = area.repeat;
    const mh = cells.length;
    const mw = mh > 0 ? cells[0].length : 0;
    const fit = repeatFit(area, mw, mh, area.repeat.mode);
    for (let r = 0; r < fit.rows; r++) {
      for (let c = 0; c < fit.cols; c++) {
        paint(cells, c * mw, r * mh);
      }
    }
  } else {
    for (const m of area.motifs) {
      paint(m.cells, m.x, m.y);
    }
  }

  return {
    name: area.name,
    width: area.w,
    height: area.h,
    cells: grid,
    palette,
  };
}

/** Convenience: pull a library pattern's effective palette (per-pattern or global). */
export function patternPalette(p: Pattern): (string | null)[] {
  return getPalette(p);
}

let idCounter = 0;
/** Generate a short unique id for designs/areas. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
