import type { Cell, Corner, LegType, Step } from './types';
import { emit } from './stepUtil';

export function pointsToSteps(points: Corner[], threadStarts: number[]): Step[] {
  const steps: Step[] = [];
  const startSet = new Set(threadStarts);

  for (let i = 0; i < points.length; i++) {
    if (startSet.has(i)) {
      emit(steps, 'start', null, points[i]);
      continue;
    }
    const prev = points[i - 1];
    const cur = points[i];
    const dx = Math.abs(cur[0] - prev[0]);
    const dy = Math.abs(cur[1] - prev[1]);
    if (dx === 1 && dy === 1) {
      const cx = Math.min(prev[0], cur[0]);
      const cy = Math.min(prev[1], cur[1]);
      const cell: Cell = [cx, cy];
      const goingUp = (prev[0] < cur[0] && prev[1] > cur[1]) || (prev[0] > cur[0] && prev[1] < cur[1]);
      const leg: LegType = goingUp ? '/' : '\\';
      emit(steps, 'front', prev, cur, cell, leg);
    } else {
      emit(steps, 'back', prev, cur);
    }
  }
  return steps;
}
