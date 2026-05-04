import type { Cell, Corner, Region, Step } from '../types';
import { emit } from '../stepUtil';

export function strategyGreedy(region: Region): Step[] {
  const remaining = new Set(region.cells.map(([x, y]) => `${x},${y}`));
  const steps: Step[] = [];
  let needleAt: Corner | null = null;

  while (remaining.size > 0) {
    let best: { cell: Cell; entry: Corner } | null = null;
    let bestScore = Infinity;

    for (const key of remaining) {
      const [cx, cy] = key.split(',').map(Number);
      const cellCorners: Corner[] = [
        [cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1],
      ];
      for (const corner of cellCorners) {
        let score: number;
        if (!needleAt) {
          score = 0;
        } else {
          const dx = Math.abs(corner[0] - needleAt[0]);
          const dy = Math.abs(corner[1] - needleAt[1]);
          const axisBonus = dx === 0 || dy === 0 ? 0 : 5;
          score = dx + dy + axisBonus;
        }
        if (score < bestScore) {
          bestScore = score;
          best = { cell: [cx, cy], entry: corner };
        }
      }
    }

    const [cx, cy] = best!.cell;
    const entry = best!.entry;
    const legs = [
      { leg: '/' as const, from: [cx, cy + 1] as Corner, to: [cx + 1, cy] as Corner },
      { leg: '\\' as const, from: [cx, cy] as Corner, to: [cx + 1, cy + 1] as Corner },
    ];
    const first = legs.find((L) => L.from[0] === entry[0] && L.from[1] === entry[1]) || legs[0];
    const second = legs.find((L) => L !== first)!;

    if (!needleAt) {
      emit(steps, 'start', null, first.from);
    } else if (needleAt[0] !== first.from[0] || needleAt[1] !== first.from[1]) {
      emit(steps, 'back', needleAt, first.from);
    }
    emit(steps, 'front', first.from, first.to, [cx, cy], first.leg);
    needleAt = first.to;

    if (needleAt[0] !== second.from[0] || needleAt[1] !== second.from[1]) {
      emit(steps, 'back', needleAt, second.from);
    }
    emit(steps, 'front', second.from, second.to, [cx, cy], second.leg);
    needleAt = second.to;

    remaining.delete(`${cx},${cy}`);
  }
  return steps;
}
