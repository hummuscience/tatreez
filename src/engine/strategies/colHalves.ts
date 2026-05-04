import type { Corner, Region, Step } from '../types';
import { emit } from '../stepUtil';

export function strategyColHalves(region: Region): Step[] {
  const cols: Record<number, number[]> = {};
  region.cells.forEach(([x, y]) => {
    (cols[x] = cols[x] || []).push(y);
  });
  const xKeys = Object.keys(cols).map(Number).sort((a, b) => a - b);
  const steps: Step[] = [];
  let needleAt: Corner | null = null;

  for (const x of xKeys) {
    const ys = cols[x].sort((a, b) => a - b);
    const runs: number[][] = [];
    let cur = [ys[0]];
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] === ys[i - 1] + 1) cur.push(ys[i]);
      else {
        runs.push(cur);
        cur = [ys[i]];
      }
    }
    runs.push(cur);

    for (const run of runs) {
      // Forward pass: lay all `\` legs
      for (let i = 0; i < run.length; i++) {
        const cy = run[i];
        const start: Corner = [x, cy];
        const end: Corner = [x + 1, cy + 1];
        if (needleAt && (needleAt[0] !== start[0] || needleAt[1] !== start[1])) {
          emit(steps, 'back', needleAt, start);
        } else if (!needleAt) {
          emit(steps, 'start', null, start);
        }
        emit(steps, 'front', start, end, [x, cy], '\\');
        needleAt = end;
      }
      // Return pass: lay all `/` legs
      for (let i = run.length - 1; i >= 0; i--) {
        const cy = run[i];
        const start: Corner = [x, cy + 1];
        const end: Corner = [x + 1, cy];
        if (needleAt![0] !== start[0] || needleAt![1] !== start[1]) {
          emit(steps, 'back', needleAt, start);
        }
        emit(steps, 'front', start, end, [x, cy], '/');
        needleAt = end;
      }
    }
  }
  return steps;
}
