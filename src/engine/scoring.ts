import type { Score, Step } from './types';
import { DEFAULT_WEIGHTS, type OptimalWeights } from './optimal/types';

/**
 * Score a stitch plan under the chosen back-edge cost weights.
 *
 * The composite cost is exactly what the optimal solver minimises:
 *   composite = horiz·horizBack + vert·vertBack + diag·diagBack
 *             + threadRestart·(starts - 1)
 *
 * (We subtract 1 from starts because the FIRST start is unavoidable —
 * every plan has at least one. Subsequent starts are restarts.)
 *
 * For backward compatibility we still report `axis` (horiz + vert
 * combined) and `axisFraction` (fraction of back-travel that's
 * axis-aligned). The `Score` type is unchanged.
 */
export function scorePlan(steps: Step[], weights: OptimalWeights = DEFAULT_WEIGHTS): Score {
  let horiz = 0;
  let vert = 0;
  let diag = 0;
  let starts = 0;
  let longJumps = 0;
  let parityViolations = 0;
  let underOverViolations = 0;

  // Track first and last front-stitch cell parity per thread.
  let curThreadFirstParity: number | null = null;
  let curThreadLastParity: number | null = null;
  // Track which leg was stitched first per cell.
  const firstLegByCell = new Map<string, '/' | '\\'>();

  const flushThread = () => {
    if (curThreadFirstParity !== null && curThreadLastParity !== null) {
      if (curThreadFirstParity !== curThreadLastParity) parityViolations++;
    }
    curThreadFirstParity = null;
    curThreadLastParity = null;
  };

  for (const s of steps) {
    if (s.kind === 'start') {
      flushThread();
      starts++;
      continue;
    }
    if (s.kind === 'front' && s.cell && s.leg) {
      const p = (s.cell[0] + s.cell[1]) & 1;
      if (curThreadFirstParity === null) curThreadFirstParity = p;
      curThreadLastParity = p;
      const ck = `${s.cell[0]},${s.cell[1]}`;
      const prev = firstLegByCell.get(ck);
      if (prev === undefined) {
        firstLegByCell.set(ck, s.leg);
      } else if (prev === '\\' && s.leg === '/') {
        // `\` came first, then `/` — over-before-under: violation.
        underOverViolations++;
      }
    }
    if (s.kind === 'back' && s.from) {
      const dx = s.to[0] - s.from[0];
      const dy = s.to[1] - s.from[1];
      const len = Math.hypot(dx, dy);
      if (dx === 0 && dy !== 0) vert += Math.abs(dy);
      else if (dy === 0 && dx !== 0) horiz += Math.abs(dx);
      else if (dx !== 0 && dy !== 0) diag += len;
      if (len > LONG_JUMP_THRESHOLD) longJumps++;
    }
  }
  flushThread();

  const axis = horiz + vert;
  const restartCount = Math.max(0, starts - 1);
  const composite =
    weights.horiz * horiz +
    weights.vert * vert +
    weights.diag * diag +
    weights.threadRestart * restartCount;
  const axisFraction = axis + diag > 0 ? axis / (axis + diag) : 1;

  return {
    composite,
    diag,
    axis,
    starts,
    longJumps,
    axisFraction,
    parityViolations,
    underOverViolations,
  };
}

export const LONG_JUMP_THRESHOLD = 2;

// Kept for backward compat — UI references SCORING_WEIGHTS.
export const SCORING_WEIGHTS = {
  diagonal: DEFAULT_WEIGHTS.diag,
  axis: DEFAULT_WEIGHTS.horiz,
  threadStarts: DEFAULT_WEIGHTS.threadRestart,
  longJumps: 0,
};
