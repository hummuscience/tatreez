import type { CellSamples, CropBox, GridLines, RGB } from './types';
import { alphaAt, avgRgb, pixelAt, TRANSPARENT_THRESHOLD } from './imageData';

const OPAQUE_THRESHOLD = 200;

/**
 * Sample the colour of each cell defined by the gridlines. We average
 * the central 50% of each cell to avoid gridline pixels.
 *
 * Alpha-aware sampling: when the image has an alpha channel, we average
 * only the *fully-opaque* pixels (alpha >= 200) so that edge antialiasing
 * pixels — which fade toward RGB(0,0,0) as alpha drops — don't pull a
 * cell's average colour darker. The cell's average alpha is recorded
 * separately so downstream code can mark cells with low coverage as
 * transparent.
 */
export function sampleCells(
  img: ImageData,
  crop: CropBox,
  grid: GridLines,
): CellSamples {
  const cellsAcross = grid.xs.length - 1;
  const cellsDown = grid.ys.length - 1;
  if (cellsAcross < 1 || cellsDown < 1) {
    return { width: 0, height: 0, cells: [], cellAlpha: [] };
  }

  const cells: RGB[][] = [];
  const cellAlpha: number[][] = [];
  for (let cy = 0; cy < cellsDown; cy++) {
    const row: RGB[] = [];
    const alphaRow: number[] = [];
    const y0abs = crop.y + grid.ys[cy];
    const y1abs = crop.y + grid.ys[cy + 1];
    const innerH = y1abs - y0abs;
    const yA = y0abs + Math.floor(innerH * 0.25);
    const yB = y0abs + Math.ceil(innerH * 0.75);
    for (let cx = 0; cx < cellsAcross; cx++) {
      const x0abs = crop.x + grid.xs[cx];
      const x1abs = crop.x + grid.xs[cx + 1];
      const innerW = x1abs - x0abs;
      const xA = x0abs + Math.floor(innerW * 0.25);
      const xB = x0abs + Math.ceil(innerW * 0.75);
      const opaqueSamples: RGB[] = [];
      const allSamples: RGB[] = [];
      let alphaSum = 0;
      let alphaN = 0;
      for (let y = yA; y < yB; y++) {
        for (let x = xA; x < xB; x++) {
          if (x >= 0 && y >= 0 && x < img.width && y < img.height) {
            const a = alphaAt(img, x, y);
            const px = pixelAt(img, x, y);
            allSamples.push(px);
            alphaSum += a;
            alphaN++;
            if (a >= OPAQUE_THRESHOLD) opaqueSamples.push(px);
          }
        }
      }
      // Use opaque-only average if we have enough opaque pixels;
      // otherwise the cell is mostly transparent and the RGB doesn't
      // matter anyway (it'll be classified as transparent downstream).
      const avg = opaqueSamples.length > 0 ? avgRgb(opaqueSamples) : avgRgb(allSamples);
      row.push(avg);
      alphaRow.push(alphaN > 0 ? alphaSum / alphaN : 255);
    }
    cells.push(row);
    cellAlpha.push(alphaRow);
  }
  return { width: cellsAcross, height: cellsDown, cells, cellAlpha };
}

// Re-export so callers don't have to import from imageData
export { TRANSPARENT_THRESHOLD };
