import type { Corner, Region, Step } from '../types';
import { emit } from '../stepUtil';

export function strategyMirroredPairs(region: Region): Step[] {
  const xs = region.cells.map(([x]) => x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const axis = (minX + maxX + 1) / 2;

  const rows: Record<number, number[]> = {};
  region.cells.forEach(([x, y]) => {
    (rows[y] = rows[y] || []).push(x);
  });
  const yKeys = Object.keys(rows).map(Number).sort((a, b) => a - b);

  const steps: Step[] = [];
  let needleAt: Corner | null = null;

  for (const y of yKeys) {
    const cells = rows[y].slice();
    cells.sort((a, b) => {
      const da = Math.abs(a + 0.5 - axis);
      const db = Math.abs(b + 0.5 - axis);
      if (Math.abs(da - db) > 0.001) return da - db;
      return a - b;
    });

    for (const cx of cells) {
      const start: Corner = [cx, y + 1];
      const end: Corner = [cx + 1, y];
      if (!needleAt) {
        emit(steps, 'start', null, start);
      } else if (needleAt[0] !== start[0] || needleAt[1] !== start[1]) {
        emit(steps, 'back', needleAt, start);
      }
      emit(steps, 'front', start, end, [cx, y], '/');
      needleAt = end;
    }
    // Reverse pass over `cells` in the order they were stitched in the forward pass,
    // not by sort order — so that `\` legs visit the same physical sequence going back.
    for (let i = cells.length - 1; i >= 0; i--) {
      const cx = cells[i];
      const start: Corner = [cx + 1, y + 1];
      const end: Corner = [cx, y];
      if (needleAt![0] !== start[0] || needleAt![1] !== start[1]) {
        emit(steps, 'back', needleAt, start);
      }
      emit(steps, 'front', start, end, [cx, y], '\\');
      needleAt = end;
    }
  }
  return steps;
}
