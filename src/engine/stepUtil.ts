import type { Cell, Corner, LegType, Step, StepKind } from './types';

export function emit(
  steps: Step[],
  kind: StepKind,
  from: Corner | null,
  to: Corner,
  cell?: Cell,
  leg?: LegType,
): void {
  steps.push({ kind, from, to, cell, leg });
}

export function legEndpoints(cell: Cell, type: LegType): [Corner, Corner] {
  const [cx, cy] = cell;
  if (type === '/') return [[cx, cy + 1], [cx + 1, cy]];
  return [[cx, cy], [cx + 1, cy + 1]];
}

export function corners(cell: Cell): Corner[] {
  const [cx, cy] = cell;
  return [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]];
}
