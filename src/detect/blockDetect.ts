import type { CropBox, GridLines } from './types';

/**
 * Block-based grid detection for borderless pixel-art images.
 *
 * Strategy: every painted cell in a pixel-art chart is a flat rectangle
 * of one colour, separated from its neighbours by colour boundaries.
 * If we find connected components of same-colour pixels and look at their
 * sizes, the smallest 1-cell-tall × 1-cell-wide block reveals the cell
 * size in pixels — and from there, the grid is fully determined.
 *
 * Caveats:
 *  - Adjacent cells of the same colour merge into one block, but we
 *    only need ONE small isolated block in the chart to fix the cell
 *    size. Most charts have these (corner accents, small dots).
 *  - The "background" colour produces a huge component spanning most
 *    of the image. We skip components larger than 1/3 of the chart.
 */

// Quantize a channel to coarser levels so anti-aliasing doesn't fragment blocks.
const QUANT = 24;
function qch(v: number): number {
  return Math.round(v / QUANT) * QUANT;
}

interface BlockInfo {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pixels: number;
  color: number; // packed RGB key
}

function colorKey(r: number, g: number, b: number): number {
  return (qch(r) << 16) | (qch(g) << 8) | qch(b);
}

/**
 * Find all connected components of same-quantized-colour pixels in the
 * cropped region. Uses 4-connectivity. Returns block info per component.
 */
function findColorBlocks(img: ImageData, crop: CropBox): BlockInfo[] {
  const W = crop.w;
  const H = crop.h;
  // Build the quantized colour map for the cropped region
  const colorMap = new Int32Array(W * H);
  for (let dy = 0; dy < H; dy++) {
    for (let dx = 0; dx < W; dx++) {
      const i = ((crop.y + dy) * img.width + (crop.x + dx)) * 4;
      colorMap[dy * W + dx] = colorKey(img.data[i], img.data[i + 1], img.data[i + 2]);
    }
  }

  const labels = new Int32Array(W * H).fill(-1);
  const blocks: BlockInfo[] = [];
  const stackX = new Int32Array(W * H);
  const stackY = new Int32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (labels[idx] !== -1) continue;
      const target = colorMap[idx];
      // BFS / iterative flood fill
      let top = 0;
      stackX[top] = x;
      stackY[top] = y;
      top++;
      const blockId = blocks.length;
      const block: BlockInfo = {
        minX: x,
        maxX: x,
        minY: y,
        maxY: y,
        pixels: 0,
        color: target,
      };
      while (top > 0) {
        top--;
        const cx = stackX[top];
        const cy = stackY[top];
        const cidx = cy * W + cx;
        if (labels[cidx] !== -1) continue;
        if (colorMap[cidx] !== target) continue;
        labels[cidx] = blockId;
        block.pixels++;
        if (cx < block.minX) block.minX = cx;
        if (cx > block.maxX) block.maxX = cx;
        if (cy < block.minY) block.minY = cy;
        if (cy > block.maxY) block.maxY = cy;
        if (cx + 1 < W) {
          stackX[top] = cx + 1;
          stackY[top] = cy;
          top++;
        }
        if (cx > 0) {
          stackX[top] = cx - 1;
          stackY[top] = cy;
          top++;
        }
        if (cy + 1 < H) {
          stackX[top] = cx;
          stackY[top] = cy + 1;
          top++;
        }
        if (cy > 0) {
          stackX[top] = cx;
          stackY[top] = cy - 1;
          top++;
        }
      }
      blocks.push(block);
    }
  }
  return blocks;
}

/**
 * Detect cell size by analysing the bounding-box dimensions of mono-colour
 * blocks. Returns the inferred cell width and height in pixels.
 *
 * Key idea: a "cell" is a square (or near-square) block of one colour
 * that's much smaller than the full chart. We collect those, then take
 * the GCD-like mode of their bounding-box dimensions to get the cell
 * size. The smallest single isolated cell pins it down.
 */
export function detectCellSizeFromBlocks(
  img: ImageData,
  crop: CropBox,
): { cellW: number; cellH: number; numBlocks: number } | null {
  const blocks = findColorBlocks(img, crop);
  if (blocks.length === 0) return null;

  const totalPixels = crop.w * crop.h;
  // First pass: a hint of what cell size MIGHT be. We pick blocks that:
  //  - Are not the global background (size < 1/4 of image)
  //  - Are mostly square (aspect ratio between 0.5 and 2)
  //  - Have density > 0.7 (the bbox is mostly filled — i.e. it's a
  //    rectangular block, not a complex shape)
  //  - Are at least 8 px in each dimension (filter out aliasing noise)
  const rectish = blocks.filter((b) => {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    // Minimum 16px because real cell sizes are usually 20+ px
    // (anything smaller is most likely an antialiasing artifact)
    if (w < 16 || h < 16) return false;
    if (b.pixels > totalPixels / 4) return false;
    const aspect = w / h;
    if (aspect < 0.5 || aspect > 2) return false;
    const density = b.pixels / (w * h);
    return density > 0.7;
  });
  if (rectish.length === 0) {
    // Fallback: looser criteria
    const fallback = blocks.filter(
      (b) =>
        b.pixels > 16 &&
        b.pixels < totalPixels / 3 &&
        b.maxX - b.minX + 1 >= 4 &&
        b.maxY - b.minY + 1 >= 4,
    );
    if (fallback.length === 0) return null;
    const widths = fallback.map((b) => b.maxX - b.minX + 1).sort((a, b) => a - b);
    const heights = fallback.map((b) => b.maxY - b.minY + 1).sort((a, b) => a - b);
    return {
      cellW: widths[0],
      cellH: heights[0],
      numBlocks: fallback.length,
    };
  }

  // Two signals for picking cell size:
  //  (a) FIT: most block bounding-box dims should be near-integer
  //      multiples of the cell size.
  //  (b) WHOLE: the cell size should divide the chart's bounding-box
  //      dimensions (crop.w and crop.h) into a near-integer count of
  //      cells. This is a strong prior — charts usually fill the cropped
  //      area exactly, with the cell pitch evenly tiling the box.
  //
  // We score each candidate cell size by combining the two signals.
  const allDims: number[] = [];
  for (const b of rectish) {
    allDims.push(b.maxX - b.minX + 1);
    allDims.push(b.maxY - b.minY + 1);
  }
  allDims.sort((a, b) => a - b);

  const minCand = 6;
  const maxCand = Math.min(
    allDims[Math.floor(allDims.length * 0.5)] * 2, // up to 2× median
    Math.floor(crop.w / 3),
    Math.floor(crop.h / 3),
  );

  // Step 1: find the LARGEST cell size that fits a high fraction of
  // observed block dimensions (≥70%). This is the "best fit" baseline.
  let baselineSize = minCand;
  for (let s = maxCand; s >= minCand; s--) {
    let hits = 0;
    for (const d of allDims) {
      const mult = Math.round(d / s);
      if (mult < 1) continue;
      const err = Math.abs(d - mult * s) / s;
      if (err < 0.18) hits++;
    }
    const frac = hits / allDims.length;
    if (frac >= 0.7) {
      baselineSize = s;
      break;
    }
  }
  // (debug log removed)

  // Step 2: refine independently for W and H, biased toward the
  // baseline. The block-fit baseline tends to *undercount* cell size
  // by 5-10% because antialiasing artifacts produce small biased
  // dimensions. We search a narrow range around the baseline and
  // prefer the size whose chart-division rounding error is small
  // AND whose value is close to the baseline.
  //
  // Combined score: rounding_err + abs(s - baseline) / baseline * weight.
  // The second term penalises straying far from the baseline (so we
  // don't jump to s=46 just because it gives err=0.02 when err=0.10
  // at s=37 is just as fine and much closer to where the blocks suggest).
  const pickIntegerAligned = (total: number, baseline: number): number => {
    const lo = Math.max(minCand, Math.floor(baseline * 0.9));
    const hi = Math.min(Math.ceil(baseline * 1.15), Math.floor(total / 2));
    let best = baseline;
    let bestScore = Infinity;
    for (let s = lo; s <= hi; s++) {
      const exact = total / s;
      const rounded = Math.round(exact);
      if (rounded < 2) continue;
      const err = Math.abs(exact - rounded);
      // Bias toward the baseline. Distance penalty is in cell-size units.
      const distPenalty = Math.abs(s - baseline) / Math.max(1, baseline);
      const score = err + distPenalty * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  };

  const cellW = pickIntegerAligned(crop.w, baselineSize);
  const cellH = pickIntegerAligned(crop.h, baselineSize);

  return { cellW, cellH, numBlocks: rectish.length };
}

/**
 * Build evenly-spaced gridlines from the inferred cell size.
 */
export function gridFromBlockDetection(
  img: ImageData,
  crop: CropBox,
): GridLines | null {
  const sz = detectCellSizeFromBlocks(img, crop);
  if (!sz) return null;
  const numCols = Math.round(crop.w / sz.cellW);
  const numRows = Math.round(crop.h / sz.cellH);
  if (numCols < 2 || numRows < 2) return null;
  const cw = crop.w / numCols;
  const ch = crop.h / numRows;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= numCols; i++) xs.push(Math.round(i * cw));
  for (let i = 0; i <= numRows; i++) ys.push(Math.round(i * ch));
  return { xs, ys };
}
