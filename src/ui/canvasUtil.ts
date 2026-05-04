import { getPalette } from '../patterns/builtin';
import type { Pattern } from '../engine/types';

export function cellSize(canvasW: number, canvasH: number, gridW: number, gridH: number): number {
  return Math.min(canvasW / gridW, canvasH / gridH);
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
