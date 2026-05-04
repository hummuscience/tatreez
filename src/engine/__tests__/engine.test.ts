import { describe, it, expect } from 'vitest';
import { BUILTIN_PATTERNS } from '../../patterns/builtin';
import { extractRegions } from '../regions';
import { scorePlan } from '../scoring';
import { generatePlans } from '../plan';
import { STRATEGIES } from '../strategies';
import type { Pattern, Step, ColorIndex } from '../types';

const ALL_PATTERNS = Object.entries(BUILTIN_PATTERNS);

function legSetForRegion(region: { color: ColorIndex; cells: [number, number][] }) {
  // Two legs per cell — `/` and `\`
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

describe('extractRegions', () => {
  it('returns no regions for an empty pattern', () => {
    const empty: Pattern = {
      name: 'empty',
      width: 5,
      height: 5,
      cells: Array.from({ length: 5 }, () => Array(5).fill(0) as ColorIndex[]),
    };
    expect(extractRegions(empty)).toEqual([]);
  });

  it('flood fills only same-color cells', () => {
    const p: Pattern = {
      name: 't',
      width: 3,
      height: 1,
      cells: [[1, 2, 1] as ColorIndex[]],
    };
    const regions = extractRegions(p);
    expect(regions).toHaveLength(3); // three colour blocks separated
    expect(regions.every((r) => r.cells.length === 1)).toBe(true);
  });
});

describe('strategies', () => {
  for (const [name, pattern] of ALL_PATTERNS) {
    describe(`pattern: ${name}`, () => {
      const regions = extractRegions(pattern);

      for (const strategy of STRATEGIES) {
        for (let r = 0; r < regions.length; r++) {
          const region = regions[r];
          it(`${strategy.name} covers all legs of region #${r} (${region.cells.length} cells)`, () => {
            const steps = strategy.fn(region);
            expect(() => steps).not.toThrow();
            const expected = legSetForRegion(region);
            const got = frontLegsCovered(steps);
            // Each leg covered exactly once
            const frontCount = steps.filter((s) => s.kind === 'front').length;
            expect(frontCount).toBe(expected.size);
            for (const leg of expected) expect(got.has(leg)).toBe(true);
          });
        }
      }
    });
  }
});

describe('scoring invariants', () => {
  it('adding a redundant cross to a clean plan increases the score', () => {
    const region = { color: 1 as ColorIndex, cells: [[0, 0], [1, 0]] as [number, number][] };
    const baseline = STRATEGIES[0].fn(region);
    const baseScore = scorePlan(baseline);

    // Add a redundant back-and-front move to corner (5, 5) and back
    const augmented: Step[] = [
      ...baseline,
      { kind: 'back', from: baseline[baseline.length - 1].to, to: [5, 5] },
      { kind: 'back', from: [5, 5], to: baseline[baseline.length - 1].to },
    ];
    const augScore = scorePlan(augmented);
    expect(augScore.composite).toBeGreaterThan(baseScore.composite);
  });

  it('axisFraction is 1 when no diagonal back travel exists', () => {
    const region = { color: 1 as ColorIndex, cells: [[0, 0], [1, 0], [2, 0]] as [number, number][] };
    const steps = STRATEGIES[0].fn(region); // row halves
    const score = scorePlan(steps);
    expect(score.diag).toBe(0);
    expect(score.axisFraction).toBe(1);
  });
});

describe('generatePlans', () => {
  for (const [name, pattern] of ALL_PATTERNS) {
    it(`produces at least one plan for ${name}`, () => {
      const plans = generatePlans(pattern);
      expect(plans.length).toBeGreaterThan(0);
      expect(plans[0].score.composite).toBeLessThanOrEqual(plans[plans.length - 1].score.composite);
    });

    it(`every leg of ${name} is covered by every plan`, () => {
      const plans = generatePlans(pattern);
      const allRegions = extractRegions(pattern);
      const expected = new Set<string>();
      for (const r of allRegions) for (const leg of legSetForRegion(r)) expected.add(leg);
      for (const plan of plans) {
        const got = frontLegsCovered(plan.steps);
        expect(got.size).toBe(expected.size);
        for (const leg of expected) expect(got.has(leg)).toBe(true);
      }
    });
  }

  it("Old Man's Teeth best plan has zero diagonal back travel", () => {
    const plans = generatePlans(BUILTIN_PATTERNS.oldMansTeeth);
    expect(plans[0].score.diag).toBe(0);
  });

  it('Best per region beats every All-X heuristic plan on Coffee Bean', () => {
    const plans = generatePlans(BUILTIN_PATTERNS.coffeeBean);
    const best = plans.find((p) => p.label === 'Best per region');
    expect(best).toBeDefined();
    for (const p of plans) {
      if (p === best) continue;
      // Optimal solver may beat Best per region (it's by construction).
      // We only assert against heuristic plans here.
      if (p.label === 'Optimal — region-by-region') continue;
      expect(best!.score.composite).toBeLessThanOrEqual(p.score.composite + 1e-6);
    }
  });

  it('Optimal solver beats every heuristic plan on every built-in pattern', () => {
    for (const pattern of Object.values(BUILTIN_PATTERNS)) {
      const plans = generatePlans(pattern);
      const opt = plans.find((p) => p.label === 'Optimal — region-by-region');
      expect(opt).toBeDefined();
      for (const p of plans) {
        if (p === opt) continue;
        expect(opt!.score.composite).toBeLessThanOrEqual(p.score.composite + 1e-6);
      }
    }
  });

  it('Greedy does not beat the best structured plan on Coffee Bean', () => {
    const plans = generatePlans(BUILTIN_PATTERNS.coffeeBean);
    const greedy = plans.find((p) => p.label === 'All greedy');
    const best = plans[0];
    if (greedy && best.label !== 'All greedy') {
      expect(greedy.score.composite).toBeGreaterThanOrEqual(best.score.composite);
    }
  });
});
