import { getPalette } from '../patterns/builtin';
import type { Pattern } from '../engine/types';

/**
 * Pixels reserved on the top and left edges of a canvas for row/column number
 * labels. The grid itself is drawn translated by this amount (see callers), so
 * existing `x * cs` drawing code stays unchanged. Fixed — must not depend on
 * grid size, so labels never overflow on large grids.
 */
export const GUTTER = 18;

export function cellSize(canvasW: number, canvasH: number, gridW: number, gridH: number): number {
  return Math.min(canvasW / gridW, canvasH / gridH);
}

/**
 * Draw 1-based column numbers across the top gutter and row numbers down the
 * left gutter. Called in the *untranslated* coordinate space (before the
 * per-render `ctx.translate(GUTTER, GUTTER)`), so labels sit in the reserved
 * margin. Numbers are centered over each cell column/row; the font scales with
 * `cs` so dense grids stay legible against the fixed-width gutter.
 */
export function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  cs: number,
  gridW: number,
  gridH: number,
): void {
  ctx.save();
  const fontPx = Math.max(6, Math.min(11, Math.floor(cs * 0.55)));
  ctx.font = `${fontPx}px sans-serif`;
  ctx.fillStyle = 'rgba(60,46,38,0.65)'; // muted Linen & Thread ink
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Column numbers across the top gutter, centered over each cell.
  for (let i = 0; i < gridW; i++) {
    ctx.fillText(String(i + 1), GUTTER + i * cs + cs / 2, GUTTER / 2);
  }
  // Row numbers down the left gutter, centered beside each cell.
  for (let i = 0; i < gridH; i++) {
    ctx.fillText(String(i + 1), GUTTER / 2, GUTTER + i * cs + cs / 2);
  }
  ctx.restore();
}

export function drawPatternBackground(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  cs: number,
  alpha = 1,
): void {
  const palette = getPalette(pattern);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const v = pattern.cells[y][x];
      if (v > 0) {
        const color = palette[v];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x * cs, y * cs, Math.ceil(cs), Math.ceil(cs));
        }
      }
    }
  }
  ctx.restore();
}

export function drawGridLines(
  ctx: CanvasRenderingContext2D,
  cs: number,
  gridW: number,
  gridH: number,
  color = 'rgba(0,0,0,0.1)',
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridW; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cs, 0);
    ctx.lineTo(i * cs, gridH * cs);
    ctx.stroke();
  }
  for (let i = 0; i <= gridH; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * cs);
    ctx.lineTo(gridW * cs, i * cs);
    ctx.stroke();
  }
  ctx.restore();
}

export function clearCanvas(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
}
