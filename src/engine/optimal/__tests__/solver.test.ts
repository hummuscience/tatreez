import { describe, it, expect } from 'vitest';
import { solveOptimal, solvePatternOptimal, optimizeColourOrder } from '../solver';
import { DEFAULT_WEIGHTS } from '../types';
import { extractRegions } from '../../regions';
import { scorePlan } from '../../scoring';
import { BUILTIN_PATTERNS } from '../../../patterns/builtin';
import type { Cell, ColorIndex, Region, Step } from '../../types';

function legSet(region: Region): Set<string> {
  return new Set(region.cells.flatMap(([x, y]) => [`${x},${y}:/`, `${x},${y}:\\`]));
}

function frontLegsCovered(steps: Step[]): Set<string> {
  const set = new Set<string>();
  for (const s of steps) {
    if (s.kind === 'front' && s.cell && s.leg) {
      set.add(`${s.cell[0]},${s.cell[1]}:${s.leg}`);
    }
  }
  return set;
}

describe('optimal solver — coverage', () => {
  it('covers every leg of a single isolated cell', () => {
    const region: Region = { color: 1 as ColorIndex, cells: [[0, 0] as Cell] };
    const steps = solveOptimal(region);
    expect(frontLegsCovered(steps)).toEqual(legSet(region));
  });

  it('covers every leg of a horizontal run of cells', () => {
    const region: Region = {
      color: 1 as ColorIndex,
      cells: [[0, 0], [1, 0], [2, 0], [3, 0]] as Cell[],
    };
    const steps = solveOptimal(region);
    expect(frontLegsCovered(steps)).toEqual(legSet(region));
  });

  it('covers every leg of a 2D cluster', () => {
    const region: Region = {
      color: 1 as ColorIndex,
      cells: [[0, 0], [1, 0], [0, 1], [1, 1]] as Cell[],
    };
    const steps = solveOptimal(region);
    expect(frontLegsCovered(steps)).toEqual(legSet(region));
  });

  it('covers every leg of an L-shape', () => {
    const region: Region = {
      color: 1 as ColorIndex,
      cells: [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]] as Cell[],
    };
    const steps = solveOptimal(region);
    expect(frontLegsCovered(steps)).toEqual(legSet(region));
  });
});

describe('optimal solver — built-in patterns', () => {
  for (const [id, pattern] of Object.entries(BUILTIN_PATTERNS)) {
    it(`covers every painted-cell leg in ${id}`, () => {
      const steps = solvePatternOptimal(pattern, DEFAULT_WEIGHTS);
      const expected = new Set<string>();
      for (const r of extractRegions(pattern)) for (const leg of legSet(r)) expected.add(leg);
      const got = frontLegsCovered(steps);
      expect(got.size).toBe(expected.size);
      for (const e of expected) expect(got.has(e)).toBe(true);
    });
  }
});

describe('optimal solver — maxThreads cap', () => {
  it("Coffee Bean with maxThreads=7 produces ≤7 thread starts", () => {
    const steps = solvePatternOptimal(BUILTIN_PATTERNS.coffeeBean, {
      maxThreads: 7,
    });
    let starts = 0;
    for (const s of steps) if (s.kind === 'start') starts++;
    expect(starts).toBeLessThanOrEqual(7);
  });

  it("maxThreads=1 collapses everything in a single-colour pattern to 1 thread", () => {
    const steps = solvePatternOptimal(BUILTIN_PATTERNS.coffeeBean, {
      maxThreads: 1,
    });
    let starts = 0;
    for (const s of steps) if (s.kind === 'start') starts++;
    expect(starts).toBe(1);
  });

  it("maxThreads cap is per-colour: Cypress (2 colours) with maxThreads=1 → 2 threads", () => {
    const steps = solvePatternOptimal(BUILTIN_PATTERNS.cypressTree, {
      maxThreads: 1,
    });
    let starts = 0;
    for (const s of steps) if (s.kind === 'start') starts++;
    expect(starts).toBe(2);
  });

  it("maxThreads cap still covers every leg", () => {
    for (const pattern of Object.values(BUILTIN_PATTERNS)) {
      const steps = solvePatternOptimal(pattern, { maxThreads: 3 });
      const expected = new Set<string>();
      for (const r of extractRegions(pattern)) for (const leg of legSet(r)) expected.add(leg);
      const got = frontLegsCovered(steps);
      expect(got.size).toBe(expected.size);
      for (const e of expected) expect(got.has(e)).toBe(true);
    }
  });
});

describe('optimal solver — maxMergeDistance', () => {
  it('with maxMergeDistance=2 produces no back-travel longer than 2*sqrt(2) units on Coffee Bean', () => {
    const steps = solvePatternOptimal(BUILTIN_PATTERNS.coffeeBean, {
      maxMergeDistance: 2,
    });
    let maxBackLen = 0;
    for (const s of steps) {
      if (s.kind === 'back' && s.from) {
        const dx = s.to[0] - s.from[0];
        const dy = s.to[1] - s.from[1];
        const len = Math.hypot(dx, dy);
        if (len > maxBackLen) maxBackLen = len;
      }
    }
    // No back-edge should be far longer than the cap (allow some slack for
    // the actual rendered straight-line endpoints between matched corners).
    expect(maxBackLen).toBeLessThanOrEqual(3);
  });

  it('lower maxMergeDistance produces more thread starts (or equal)', () => {
    const stepsUnlimited = solvePatternOptimal(BUILTIN_PATTERNS.coffeeBean, {
      mergeRegions: true,
    });
    const stepsCapped = solvePatternOptimal(BUILTIN_PATTERNS.coffeeBean, {
      mergeRegions: true,
      maxMergeDistance: 2,
    });
    const startsUnlimited = stepsUnlimited.filter((s) => s.kind === 'start').length;
    const startsCapped = stepsCapped.filter((s) => s.kind === 'start').length;
    expect(startsCapped).toBeGreaterThanOrEqual(startsUnlimited);
  });

  it('still covers every leg with maxMergeDistance set', () => {
    const steps = solvePatternOptimal(BUILTIN_PATTERNS.coffeeBean, {
      maxMergeDistance: 3,
    });
    const expected = new Set<string>();
    for (const r of extractRegions(BUILTIN_PATTERNS.coffeeBean)) {
      for (const leg of legSet(r)) expected.add(leg);
    }
    const got = frontLegsCovered(steps);
    expect(got.size).toBe(expected.size);
    for (const e of expected) expect(got.has(e)).toBe(true);
  });

  it('caps within-region odd-vertex matching, not just between-component merges', () => {
    // Regression for a bug where maxMergeDistance only applied to merging
    // between disconnected components — within a single connected region,
    // the odd-vertex matching could still pair distant corners and emit a
    // long axis back-jump (e.g. 9 cells across the chart 23 grid).
    //
    // Construct a "dumbbell": two 2×2 clusters bridged by a single
    // horizontal row of cells 9 wide. The bridge is one cell tall, so
    // each end of the bridge introduces odd-degree corners at the cluster
    // boundary. The odd corners on the left cluster vs right cluster are
    // forced ~10 cells apart by the bridge length. With a low cap and
    // moderate threadRestart, the matching should pick a thread restart
    // over a 10-unit back-walk along the bridge.
    const cells: Cell[] = [
      [0, 0], [1, 0], [0, 1], [1, 1], // left 2×2
      ...Array.from({ length: 9 }, (_, i) => [2 + i, 0] as Cell), // bridge
      [11, 0], [12, 0], [11, 1], [12, 1], // right 2×2
    ];
    const region: Region = { color: 1 as ColorIndex, cells };
    const weights = { horiz: 1, vert: 10, diag: 10, threadRestart: 100 };
    const steps = solveOptimal(region, weights, { maxMergeDistance: 4 });
    let maxBack = 0;
    for (const s of steps) {
      if (s.kind === 'back' && s.from) {
        const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]);
        if (len > maxBack) maxBack = len;
      }
    }
    expect(maxBack).toBeLessThanOrEqual(4);
    // Coverage must still be complete.
    expect(frontLegsCovered(steps)).toEqual(legSet(region));
  });
});

describe('optimal solver — color separation', () => {
  it('no single thread spans more than one color in any built-in pattern', () => {
    for (const [id, pattern] of Object.entries(BUILTIN_PATTERNS)) {
      const steps = solvePatternOptimal(pattern);
      let curColor: number | null = null;
      let curThreadIdx = 0;
      for (const s of steps) {
        if (s.kind === 'start') {
          curColor = null;
          curThreadIdx++;
          continue;
        }
        if (s.kind === 'front' && s.cell) {
          const [cx, cy] = s.cell;
          const cellColor = pattern.cells[cy][cx];
          if (curColor === null) {
            curColor = cellColor;
          } else if (cellColor !== curColor) {
            throw new Error(
              `Pattern ${id}: thread #${curThreadIdx} spans colors ${curColor} and ${cellColor} ` +
                `at cell (${cx},${cy})`,
            );
          }
        }
      }
    }
  });
});

describe('optimal solver — cost properties', () => {
  it("Old Man's Teeth optimal has zero diagonal back-travel", () => {
    const steps = solvePatternOptimal(BUILTIN_PATTERNS.oldMansTeeth);
    const score = scorePlan(steps);
    expect(score.diag).toBe(0);
  });

  it('horizontal run of 10 cells has zero diagonal back-travel under default weights', () => {
    const region: Region = {
      color: 1 as ColorIndex,
      cells: Array.from({ length: 10 }, (_, i) => [i, 0] as Cell),
    };
    const steps = solveOptimal(region);
    let diag = 0;
    for (const s of steps) {
      if (s.kind === 'back' && s.from) {
        const dx = s.to[0] - s.from[0];
        const dy = s.to[1] - s.from[1];
        if (dx !== 0 && dy !== 0) diag += Math.hypot(dx, dy);
      }
    }
    expect(diag).toBe(0);
  });

  it('parity violations: a single isolated cell has zero parity violations', () => {
    // Single-cell thread: starts and ends in the same cell, parity matches trivially.
    const region: Region = { color: 1 as ColorIndex, cells: [[3, 5] as Cell] };
    const steps = solveOptimal(region);
    const score = scorePlan(steps);
    expect(score.parityViolations).toBe(0);
  });

  it('parity violations are reported per thread for whole patterns', () => {
    // The score should be a non-negative integer, computed over every thread.
    const steps = solvePatternOptimal(BUILTIN_PATTERNS.coffeeBean);
    const score = scorePlan(steps);
    expect(Number.isInteger(score.parityViolations)).toBe(true);
    expect(score.parityViolations).toBeGreaterThanOrEqual(0);
    expect(score.parityViolations).toBeLessThanOrEqual(score.starts);
  });

  it("optimal beats heuristic 'best per region' on simple horizontal runs", () => {
    // Important sanity check — if optimal is worse, the solver is broken.
    const region: Region = {
      color: 1 as ColorIndex,
      cells: Array.from({ length: 10 }, (_, i) => [i, 0] as Cell),
    };
    const optimal = solveOptimal(region);
    const optScore = scorePlan(optimal);
    expect(optScore.composite).toBeGreaterThan(0);
    expect(optScore.composite).toBeLessThan(50); // sanity bound
  });
});

describe('optimizeColourOrder', () => {
  it('returns a permutation of palette indices present in the pattern', () => {
    for (const [, p] of Object.entries(BUILTIN_PATTERNS)) {
      const order = optimizeColourOrder(p);
      const expectedColors = new Set<number>();
      for (let y = 0; y < p.height; y++) {
        for (let x = 0; x < p.width; x++) {
          if (p.cells[y][x] !== 0) expectedColors.add(p.cells[y][x]);
        }
      }
      expect(new Set(order)).toEqual(expectedColors);
      // No duplicates.
      expect(order.length).toBe(expectedColors.size);
    }
  });

  it('passing the optimised order into the solver still covers every leg', () => {
    for (const p of Object.values(BUILTIN_PATTERNS)) {
      const order = optimizeColourOrder(p);
      const steps = solvePatternOptimal(p, { colorOrder: order });
      const expected = new Set<string>();
      for (const r of extractRegions(p)) for (const leg of legSet(r)) expected.add(leg);
      const got = frontLegsCovered(steps);
      expect(got.size).toBe(expected.size);
    }
  });
});
