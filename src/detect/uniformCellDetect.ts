import type { CropBox, GridLines } from './types';
import { alphaAt, pixelAt, TRANSPARENT_THRESHOLD } from './imageData';

/**
 * Cell-uniformity-based grid detection for borderless pixel art.
 *
 * Algorithm:
 *  1. Pre-quantize all opaque pixels in the cropped region into a small
 *     set of colour buckets (using a coarse RGB quantization that survives
 *     antialiasing — e.g. round each channel to nearest 32).
 *  2. For each candidate grid (numCols × numRows): walk every cell, sample
 *     a window in its centre, and count distinct quantized colours among
 *     opaque pixels. A grid is "valid" iff every cell has ≥ uniformity
 *     fraction of its sampled pixels agreeing on a single quantized colour.
 *  3. Among valid grids, pick the one with the LARGEST cell size. (If no
 *     candidate is valid, return null and the caller falls back.)
 *
 * Why this finds the real cell size: in the actual chart's grid, each
 * cell is one solid colour, so uniformity is high. In a 2× too-fine grid,
 * each "cell" is ¼ of a real cell, also uniform. So uniformity alone
 * doesn't pick the right cell size — we'd get the smallest. But by
 * preferring the LARGEST valid cell size, we converge on the true grid:
 * 1× true is uniform (valid); 1.5× true straddles cell boundaries (not
 * uniform, invalid); 2× true contains 4 cells of possibly different
 * colours (not uniform, invalid). So the largest uniform is exactly 1×.
 */

// Coarse colour quantization to make uniformity checks robust to
// anti-aliasing inside cells. Step = 64 means 4 levels per channel
// (4³ = 64 distinct buckets), which is enough to distinguish typical
// pixel-art palettes (red vs teal vs blue) while collapsing AA fringes
// into the same bucket as their parent colour.
const QUANT_STEP = 64;

function quantKey(r: number, g: number, b: number): number {
  return (
    (Math.round(r / QUANT_STEP) << 16) |
    (Math.round(g / QUANT_STEP) << 8) |
    Math.round(b / QUANT_STEP)
  );
}

interface UniformCellResult {
  cellW: number;
  cellH: number;
  numCols: number;
  numRows: number;
  /** Average uniformity fraction across cells (1.0 = every cell is fully uniform). */
  avgUniformity: number;
}

export function detectGridByUniformity(
  img: ImageData,
  crop: CropBox,
  options: {
    /** Minimum cells across to consider. Default 4. */
    minCells?: number;
    /** Maximum cells across to consider. Default 60. */
    maxCells?: number;
    /** Minimum uniformity fraction per cell to consider a grid valid. Default 0.85. */
    uniformityThreshold?: number;
    /** Fraction of inner cell to sample (0..1). Default 0.6 — avoids edges. */
    innerFraction?: number;
  } = {},
): UniformCellResult | null {
  const minCells = options.minCells ?? 4;
  const maxCells = options.maxCells ?? 60;
  // 0.95 is strict enough that a single mis-coloured pixel boundary
  // disqualifies a candidate grid. This prevents picking too-coarse
  // grids where huge "cells" happen to contain mostly one colour even
  // though they actually span multiple real cells.
  const uniformityThreshold = options.uniformityThreshold ?? 0.95;
  const innerFraction = options.innerFraction ?? 0.6;

  // Build a per-pixel quantized-colour map for the cropped region.
  // Pixels with low alpha are flagged as "transparent" (sentinel color = -1).
  const W = crop.w;
  const H = crop.h;
  const qmap = new Int32Array(W * H);
  for (let dy = 0; dy < H; dy++) {
    for (let dx = 0; dx < W; dx++) {
      const sx = crop.x + dx;
      const sy = crop.y + dy;
      const a = alphaAt(img, sx, sy);
      if (a < TRANSPARENT_THRESHOLD) {
        qmap[dy * W + dx] = -1;
      } else {
        const p = pixelAt(img, sx, sy);
        qmap[dy * W + dx] = quantKey(p.r, p.g, p.b);
      }
    }
  }

  // Try grid sizes by cell count, from large cell-size (few cells) to
  // small (many cells). Equivalently: from minCells up to maxCells.
  // We pick the *largest cell size that is valid*, which is the
  // *smallest* cell count that is valid.
  let best: UniformCellResult | null = null;
  for (let numCols = minCells; numCols <= maxCells; numCols++) {
    // For non-square cells, also iterate over numRows. For pure square
    // cells, numRows is determined by aspect ratio.
    // Practical: try numRows = round(H / cellW) where cellW = W/numCols,
    // and numRows ± 1.
    const cellW = W / numCols;
    const numRowsExact = H / cellW;
    const candidateRowCounts = new Set<number>();
    for (let dr = -1; dr <= 1; dr++) {
      const nr = Math.round(numRowsExact) + dr;
      if (nr >= minCells && nr <= maxCells) candidateRowCounts.add(nr);
    }

    for (const numRows of candidateRowCounts) {
      const cellH = H / numRows;
      if (cellW < 6 || cellH < 6) continue; // too small to sample reliably

      let allUniform = true;
      let sumUniformity = 0;
      let cellsCounted = 0;
      let allTransparent = true;
      for (let cy = 0; cy < numRows && allUniform; cy++) {
        for (let cx = 0; cx < numCols && allUniform; cx++) {
          const x0 = Math.floor(cx * cellW);
          const x1 = Math.floor((cx + 1) * cellW);
          const y0 = Math.floor(cy * cellH);
          const y1 = Math.floor((cy + 1) * cellH);
          const innerW = x1 - x0;
          const innerH = y1 - y0;
          const xa = x0 + Math.floor((innerW * (1 - innerFraction)) / 2);
          const xb = x1 - Math.floor((innerW * (1 - innerFraction)) / 2);
          const ya = y0 + Math.floor((innerH * (1 - innerFraction)) / 2);
          const yb = y1 - Math.floor((innerH * (1 - innerFraction)) / 2);

          // Count quantized colours in the inner window
          const counts = new Map<number, number>();
          let totalOpaque = 0;
          for (let y = ya; y < yb; y++) {
            for (let x = xa; x < xb; x++) {
              if (x < 0 || y < 0 || x >= W || y >= H) continue;
              const q = qmap[y * W + x];
              if (q === -1) continue;
              counts.set(q, (counts.get(q) ?? 0) + 1);
              totalOpaque++;
            }
          }
          if (totalOpaque === 0) {
            // Fully transparent cell — that's fine, treat as uniform.
            cellsCounted++;
            sumUniformity += 1;
            continue;
          }
          allTransparent = false;
          // Find dominant colour
          let dominantCount = 0;
          for (const c of counts.values()) {
            if (c > dominantCount) dominantCount = c;
          }
          const uniformity = dominantCount / totalOpaque;
          if (uniformity < uniformityThreshold) {
            allUniform = false;
            break;
          }
          sumUniformity += uniformity;
          cellsCounted++;
        }
      }

      if (allUniform && !allTransparent) {
        const avgUniformity = sumUniformity / Math.max(1, cellsCounted);
        // Largest cell size = smallest numCols × numRows. Since we iterate
        // numCols ascending, the FIRST valid grid is the largest cell size.
        if (best === null) {
          best = {
            cellW: Math.round(cellW),
            cellH: Math.round(cellH),
            numCols,
            numRows,
            avgUniformity,
          };
          // We could keep searching for a slightly higher avgUniformity at
          // the same cell-count level, but for simplicity return the first
          // valid grid (largest cell size).
          return best;
        }
      }
    }
  }
  return best;
}

/**
 * Build evenly-spaced GridLines from a uniform-cell detection result.
 */
export function gridFromUniformDetection(
  img: ImageData,
  crop: CropBox,
  options?: Parameters<typeof detectGridByUniformity>[2],
): GridLines | null {
  const result = detectGridByUniformity(img, crop, options);
  if (!result) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const cw = crop.w / result.numCols;
  const ch = crop.h / result.numRows;
  for (let i = 0; i <= result.numCols; i++) xs.push(Math.round(i * cw));
  for (let i = 0; i <= result.numRows; i++) ys.push(Math.round(i * ch));
  return { xs, ys };
}
