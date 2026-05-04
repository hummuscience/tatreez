import type { ColorIndex, Pattern } from '../../engine/types';

// Minimal ImageData polyfill for node-based tests
class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = 'srgb' as const;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

if (typeof globalThis.ImageData === 'undefined') {
  // @ts-expect-error inject polyfill
  globalThis.ImageData = FakeImageData;
}

interface RenderOpts {
  cellPx: number; // pixel size per cell
  borderPx: number; // outer border padding (background colour)
  gridLine?: number; // gridline thickness (default 1)
  bg?: [number, number, number]; // background colour, default white
  gridColor?: [number, number, number]; // gridline colour, default mid grey
  paletteRgb?: Record<number, [number, number, number]>; // colour per palette index
}

/**
 * Render a Pattern as an ImageData chart that the detector can ingest.
 * Default styling roughly matches the Tatreez Traditions chart aesthetic.
 */
export function renderPatternToImageData(p: Pattern, opts: RenderOpts): ImageData {
  const cellPx = opts.cellPx;
  const border = opts.borderPx;
  const gridLine = opts.gridLine ?? 1;
  const bg = opts.bg ?? [255, 255, 255];
  const gridColor = opts.gridColor ?? [180, 180, 180];
  const palette = opts.paletteRgb ?? {
    0: bg,
    1: [163, 45, 45],
    2: [44, 44, 42],
  };

  const W = border * 2 + cellPx * p.width;
  const H = border * 2 + cellPx * p.height;
  const img = new (globalThis.ImageData as typeof ImageData)(W, H);
  const data = img.data;

  const setPx = (x: number, y: number, rgb: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  };

  // fill background
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) setPx(x, y, bg);

  // fill cells
  for (let cy = 0; cy < p.height; cy++) {
    for (let cx = 0; cx < p.width; cx++) {
      const v = p.cells[cy][cx];
      const rgb = palette[v] ?? bg;
      const x0 = border + cx * cellPx;
      const y0 = border + cy * cellPx;
      for (let y = y0; y < y0 + cellPx; y++) {
        for (let x = x0; x < x0 + cellPx; x++) setPx(x, y, rgb);
      }
    }
  }

  // draw gridlines on top (so cell colour is visible inside cells)
  for (let i = 0; i <= p.width; i++) {
    const x = border + i * cellPx;
    for (let y = border; y < border + p.height * cellPx; y++) {
      for (let t = 0; t < gridLine; t++) setPx(x + t, y, gridColor);
    }
  }
  for (let i = 0; i <= p.height; i++) {
    const y = border + i * cellPx;
    for (let x = border; x < border + p.width * cellPx; x++) {
      for (let t = 0; t < gridLine; t++) setPx(x, y + t, gridColor);
    }
  }

  return img;
}

export function makeSimplePattern(width: number, height: number, cells: number[][]): Pattern {
  return {
    name: 'synth',
    width,
    height,
    cells: cells.map((row) => row.map((v) => v as ColorIndex)),
  };
}
