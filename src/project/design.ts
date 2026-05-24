/**
 * The Design workspace data model and pure helpers.
 *
 * A Design is a cloth-sized stitch grid (same coordinate system as the
 * editor) holding a set of named Areas. Each Area is a labeled rectangle
 * containing freely-placed motifs and/or one repeating motif. Areas are
 * the unit of planning: each derives into a normal `Pattern` and is
 * planned on its own via the existing Plan tab.
 */

import type { ColorIndex, Palette, PaletteColor, Pattern } from '../engine/types';
import { getPaletteColors } from '../patterns/builtin';
import { colorFromHex } from '../patterns/dmcCatalog';
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
  /**
   * Merged design palette: index 0 = null (empty), 1..N are PaletteColor
   * objects (hex + optional DMC). DMC is carried through so the UI can show
   * thread numbers, falling back to hex when a colour has no DMC.
   */
  palette: Palette;
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
  designPalette: Palette,
  motifPalette: Palette,
): { palette: Palette; indexMap: number[] } {
  const palette = designPalette.slice();
  if (palette.length === 0) palette.push(null); // ensure index 0 = empty
  const indexMap: number[] = [0];

  for (let i = 1; i < motifPalette.length; i++) {
    const c = motifPalette[i];
    if (c == null) {
      // A hole in the motif palette: map to empty.
      indexMap[i] = 0;
      continue;
    }
    const norm = c.hex.toLowerCase();
    let found = -1;
    for (let j = 1; j < palette.length; j++) {
      if ((palette[j]?.hex ?? '').toLowerCase() === norm) {
        found = j;
        break;
      }
    }
    if (found === -1) {
      // Carry DMC if present; otherwise resolve by exact hex (hex fallback).
      palette.push(c.dmc ? c : colorFromHex(c.hex));
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

/**
 * Rotate a cell grid 90° clockwise. A `h×w` grid becomes `w×h`. Cells map
 * 1:1 (no resampling), so stitches stay crisp — this is why only 90° steps
 * are allowed on the grid.
 */
export function rotateCW(cells: ColorIndex[][]): ColorIndex[][] {
  const h = cells.length;
  if (h === 0) return [];
  const w = cells[0].length;
  const out: ColorIndex[][] = Array.from({ length: w }, () => new Array<ColorIndex>(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x][h - 1 - y] = cells[y][x];
    }
  }
  return out;
}

/** Rotate a cell grid by a multiple of 90° (turns mod 4, clockwise). */
export function rotateTurns(cells: ColorIndex[][], turns: number): ColorIndex[][] {
  let out = cells;
  const n = ((turns % 4) + 4) % 4;
  for (let i = 0; i < n; i++) out = rotateCW(out);
  return out;
}

/** Mirror a cell grid horizontally (flip left↔right). */
export function flipX(cells: ColorIndex[][]): ColorIndex[][] {
  return cells.map((row) => row.slice().reverse());
}

/** Mirror a cell grid vertically (flip top↔bottom). */
export function flipY(cells: ColorIndex[][]): ColorIndex[][] {
  return cells.slice().reverse();
}

/**
 * Crop a cell grid to the bounding box of its non-empty (nonzero) cells, so
 * an area drawn around it hugs the visible motif rather than the source
 * chart's blank margins. Returns the trimmed cells; an all-empty grid trims
 * to a single empty cell.
 */
export function trimCells(cells: ColorIndex[][]): ColorIndex[][] {
  let top = Infinity;
  let left = Infinity;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      if (cells[y][x] > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return [[0]]; // nothing painted
  const out: ColorIndex[][] = [];
  for (let y = top; y <= bottom; y++) {
    out.push(cells[y].slice(left, right + 1));
  }
  return out;
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
export function compositeArea(area: Area, palette: Palette): Pattern {
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
    // The design palette is already PaletteColor objects (DMC + hex).
    palette: palette.map((c) => (c == null ? null : { ...c })),
  };
}

/** Convenience: pull a library pattern's effective palette as DMC+hex colours. */
export function patternPalette(p: Pattern): Palette {
  return getPaletteColors(p);
}

/**
 * The distinct design-palette indices actually used by an area's painted
 * cells (motifs and/or its repeat motif), sorted ascending. Index 0 (empty)
 * is excluded. Used to show one editable swatch per colour in the area.
 */
export function areaUsedColors(area: Area): number[] {
  const used = new Set<number>();
  const scan = (cells: ColorIndex[][]) => {
    for (const row of cells) for (const v of row) if (v > 0) used.add(v);
  };
  if (area.repeat) scan(area.repeat.cells);
  for (const m of area.motifs) scan(m.cells);
  return [...used].sort((a, b) => a - b);
}

/**
 * Recolour one design-palette index *within a single area* to a new hex.
 * Ensures the hex exists in the design palette (dedupe by case-insensitive
 * hex, appending if new) and remaps only this area's cells from the old index
 * to the resolved index — other areas keep referencing the old index, so the
 * recolour is local to the area.
 *
 * Returns the updated palette and area. Index 0 (empty) is never remapped.
 */
export function recolorAreaIndex(
  area: Area,
  oldIndex: number,
  color: PaletteColor,
  palette: Palette,
): { palette: Palette; area: Area } {
  if (oldIndex <= 0) return { palette, area };
  const norm = color.hex.toLowerCase();
  const nextPalette = palette.slice();
  let target = nextPalette.findIndex(
    (c, i) => i > 0 && (c?.hex ?? '').toLowerCase() === norm,
  );
  if (target === -1) {
    // Carry DMC if provided; else resolve by exact hex (hex fallback).
    nextPalette.push(color.dmc ? color : colorFromHex(color.hex));
    target = nextPalette.length - 1;
  }
  if (target === oldIndex) return { palette: nextPalette, area };
  const remap = (cells: ColorIndex[][]) =>
    cells.map((row) => row.map((v) => (v === oldIndex ? target : v)));
  const nextArea: Area = {
    ...area,
    motifs: area.motifs.map((m) => ({ ...m, cells: remap(m.cells) })),
    repeat: area.repeat ? { ...area.repeat, cells: remap(area.repeat.cells) } : undefined,
  };
  return { palette: nextPalette, area: nextArea };
}

let idCounter = 0;
/** Generate a short unique id for designs/areas. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
