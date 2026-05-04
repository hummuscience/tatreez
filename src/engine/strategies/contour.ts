import type { Cell, Corner, Region, Step } from '../types';
import { emit } from '../stepUtil';
import { strategyRowHalves } from './rowHalves';

export function strategyContour(region: Region): Step[] {
  const cellSet = new Set(region.cells.map(([x, y]) => `${x},${y}`));
  const isInRegion = (x: number, y: number) => cellSet.has(`${x},${y}`);
  const isPerimeter = (x: number, y: number) =>
    !isInRegion(x - 1, y) || !isInRegion(x + 1, y) || !isInRegion(x, y - 1) || !isInRegion(x, y + 1);

  const perimeter = region.cells.filter(([x, y]) => isPerimeter(x, y));
  const interior = region.cells.filter(([x, y]) => !isPerimeter(x, y));

  if (perimeter.length === 0 || interior.length === 0) {
    return strategyRowHalves(region);
  }

  // Walk perimeter: pick topmost-leftmost, then greedily walk to nearest neighbour
  const perimSet = new Set(perimeter.map(([x, y]) => `${x},${y}`));
  const ordered: Cell[] = [];
  const start = perimeter.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
  ordered.push(start);
  perimSet.delete(`${start[0]},${start[1]}`);

  while (perimSet.size > 0) {
    const last = ordered[ordered.length - 1];
    let best: Cell | null = null;
    let bd = Infinity;
    for (const key of perimSet) {
      const [cx, cy] = key.split(',').map(Number);
      const d = Math.abs(cx - last[0]) + Math.abs(cy - last[1]);
      if (d < bd) {
        bd = d;
        best = [cx, cy];
      }
    }
    ordered.push(best!);
    perimSet.delete(`${best![0]},${best![1]}`);
  }

  const steps: Step[] = [];
  let needleAt: Corner | null = null;

  for (const [cx, cy] of ordered) {
    const cellCorners: Corner[] = [
      [cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1],
    ];
    let bestCorner: Corner = cellCorners[0];
    let bestD = Infinity;
    if (needleAt) {
      for (const c of cellCorners) {
        const dx = Math.abs(c[0] - needleAt[0]);
        const dy = Math.abs(c[1] - needleAt[1]);
        const axisBonus = dx === 0 || dy === 0 ? 0 : 5;
        const d = dx + dy + axisBonus;
        if (d < bestD) {
          bestD = d;
          bestCorner = c;
        }
      }
    }
    const legs = [
      { leg: '/' as const, from: [cx, cy + 1] as Corner, to: [cx + 1, cy] as Corner },
      { leg: '\\' as const, from: [cx, cy] as Corner, to: [cx + 1, cy + 1] as Corner },
    ];
    const first =
      legs.find((L) => L.from[0] === bestCorner[0] && L.from[1] === bestCorner[1]) || legs[0];
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
  }

  // Fill interior with row halves
  const interiorRegion: Region = { color: region.color, cells: interior };
  const interiorSteps = strategyRowHalves(interiorRegion);
  if (interiorSteps.length > 0 && interiorSteps[0].kind === 'start' && needleAt) {
    interiorSteps[0] = { kind: 'back', from: needleAt, to: interiorSteps[0].to };
  }
  steps.push(...interiorSteps);
  return steps;
}
