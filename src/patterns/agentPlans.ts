import type { Step } from '../engine/types';
import {
  expandPrimitive,
  describePrimitive,
  startCorner,
  type Primitive,
  type PrimitivePlan,
} from '../engine/primitives';
import { emit } from '../engine/stepUtil';

/**
 * Plans submitted by external agents (LLMs, custom scripts) as JSON
 * fixtures. Each fixture is a list of primitives plus a `patternKey`
 * binding it to a specific built-in or imported pattern.
 *
 * The PlanTab automatically surfaces any agent plan whose `patternKey`
 * matches the currently-loaded pattern, alongside the engine plans, the
 * solver's primitive plan, and any ground truth.
 *
 * To add a plan: drop a JSON file into `src/patterns/agentPlans/` and
 * import it here.
 */

import sarwaRamallah1 from './agentPlans/sarwa-ramallah-1.json';

export interface AgentPlanFixture {
  patternKey: string;
  label: string;
  primitives: Primitive[];
}

/**
 * An agent plan ready to be displayed alongside engine plans. Same shape
 * as PrimitivePlan plus a patternKey + label so the UI can route it.
 */
export interface AgentPlan extends PrimitivePlan {
  patternKey: string;
  label: string;
}

const FIXTURES: AgentPlanFixture[] = [sarwaRamallah1 as AgentPlanFixture];

/**
 * Expand a JSON-loaded primitive list into a full PrimitivePlan with
 * Step[] expansion + stepToPrimitive mapping. Mirrors the logic in
 * `planAsPrimitives` for the expansion phase.
 */
function buildAgentPlan(fixture: AgentPlanFixture): AgentPlan {
  const steps: Step[] = [];
  const stepToPrimitive: number[] = [];
  let needStart = true;
  for (let pi = 0; pi < fixture.primitives.length; pi++) {
    const p = fixture.primitives[pi];
    if (p.kind === 'restart') {
      needStart = true;
      continue;
    }
    const before = steps.length;
    if (needStart) {
      const sc = startCorner(p);
      if (sc) emit(steps, 'start', null, sc);
      needStart = false;
    }
    expandPrimitive(steps, p);
    for (let i = before; i < steps.length; i++) stepToPrimitive[i] = pi;
  }
  return {
    patternKey: fixture.patternKey,
    label: fixture.label,
    primitives: fixture.primitives,
    steps,
    stepToPrimitive,
  };
}

const PLANS_BY_KEY = new Map<string, AgentPlan[]>();
for (const fixture of FIXTURES) {
  const plan = buildAgentPlan(fixture);
  const list = PLANS_BY_KEY.get(plan.patternKey) ?? [];
  list.push(plan);
  PLANS_BY_KEY.set(plan.patternKey, list);
}

export function getAgentPlans(patternKey: string | null): AgentPlan[] {
  if (!patternKey) return [];
  return PLANS_BY_KEY.get(patternKey) ?? [];
}

// Re-export for convenience.
export { describePrimitive };
