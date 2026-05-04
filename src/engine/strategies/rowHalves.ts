import type { Corner, Region, Step } from '../types';
import { emit } from '../stepUtil';

export function strategyRowHalves(region: Region): Step[] {
  const rows: Record<number, number[]> = {};
  region.cells.forEach(([x, y]) => {
    (rows[y] = rows[y] || []).push(x);
  });
  const yKeys = Object.keys(rows).map(Number).sort((a, b) => a - b);
  const steps: Step[] = [];
  let needleAt: Corner | null = null;

  for (const y of yKeys) {
    const xs = rows[y].sort((a, b) => a - b);
    const runs: number[][] = [];
    let cur = [xs[0]];
    for (let i = 1; i < xs.length; i++) {
      if (xs[i] === xs[i - 1] + 1) cur.push(xs[i]);
      else {
        runs.push(cur);
        cur = [xs[i]];
      }
    }
    runs.push(cur);

    for (const run of runs) {
      // Forward pass: lay all `/` legs
      for (let i = 0; i < run.length; i++) {
        const cx = run[i];
        const start: Corner = [cx, y + 1];
        const end: Corner = [cx + 1, y];
        if (needleAt && (needleAt[0] !== start[0] || needleAt[1] !== start[1])) {
          emit(steps, 'back', needleAt, start);
        } else if (!needleAt) {
          emit(steps, 'start', null, start);
        }
        emit(steps, 'front', start, end, [cx, y], '/');
        needleAt = end;
      }
      // Return pass: lay all `\` legs, traversed BR→TL so that back-travel
      // between cells stays on the bottom edge of the row.
      for (let i = run.length - 1; i >= 0; i--) {
        const cx = run[i];
        const start: Corner = [cx + 1, y + 1];
        const end: Corner = [cx, y];
        if (needleAt![0] !== start[0] || needleAt![1] !== start[1]) {
          emit(steps, 'back', needleAt, start);
        }
        emit(steps, 'front', start, end, [cx, y], '\\');
        needleAt = end;
      }
    }
  }
  return steps;
}
