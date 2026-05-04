import type { Pattern, Plan, StrategyResult } from './types';
import { extractRegions } from './regions';
import { STRATEGIES } from './strategies';
import { scorePlan } from './scoring';
import {
  solvePatternOptimal,
  DEFAULT_WEIGHTS,
  type OptimalWeights,
  type SolveOptions,
} from './optimal';

export function generatePlans(
  pattern: Pattern,
  weights: OptimalWeights = DEFAULT_WEIGHTS,
  solveOptions: Pick<
    SolveOptions,
    'mergeRegions' | 'maxThreads' | 'maxMergeDistance' | 'colorOrder'
  > = {},
): Plan[] {
  const regions = extractRegions(pattern);
  if (regions.length === 0) return [];

  const perRegion: StrategyResult[][] = regions.map((r) =>
    STRATEGIES.map((s) => {
      const steps = s.fn(r);
      return { strategyName: s.name, steps, score: scorePlan(steps, weights) };
    }).sort((a, b) => a.score.composite - b.score.composite),
  );

  function combine(picker: (rPlans: StrategyResult[]) => StrategyResult, label: string): Plan {
    const allSteps = [];
    for (const rPlans of perRegion) {
      const chosen = picker(rPlans);
      allSteps.push(...chosen.steps);
    }
    return { label, steps: allSteps, score: scorePlan(allSteps, weights) };
  }

  const byName = (name: string) => (rPlans: StrategyResult[]) => {
    const found = rPlans.find((p) => p.strategyName === name);
    if (!found) throw new Error(`Strategy ${name} not found in per-region plans`);
    return found;
  };

  // The "Optimal" plan: solved as a Chinese Postman Problem with a depot
  // for thread restarts. Under the chosen edge-cost weights it is provably
  // optimal (modulo the 2-opt approximation in the matching subproblem,
  // which is near-optimal for our problem sizes).
  const optimalSteps = solvePatternOptimal(pattern, {
    weights,
    mergeRegions: solveOptions.mergeRegions,
    maxThreads: solveOptions.maxThreads,
    maxMergeDistance: solveOptions.maxMergeDistance,
    colorOrder: solveOptions.colorOrder,
  });
  const optimalPlan: Plan = {
    label: solveOptions.mergeRegions
      ? 'Optimal — merged threads'
      : 'Optimal — region-by-region',
    steps: optimalSteps,
    score: scorePlan(optimalSteps, weights),
  };

  const plans: Plan[] = [
    optimalPlan,
    combine((rp) => rp[0], 'Best per region'),
    combine(byName('Row halves'), 'All row halves'),
    combine(byName('Column halves'), 'All column halves'),
    combine(byName('Contour + fill'), 'All contour'),
    combine(byName('Mirrored pairs'), 'All mirrored pairs'),
    combine(byName('Greedy'), 'All greedy'),
  ];

  // De-duplicate plans by composite score
  const seen = new Set<string>();
  return plans
    .filter((p) => {
      const key = p.score.composite.toFixed(2) + '|' + p.score.starts;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.score.composite - b.score.composite);
}
