/**
 * Cost weights for the back-edge graph used by the optimal solver.
 * The solver minimises the sum of these costs over all back-travel
 * traversed by the needle.
 *
 * Default weights treat horizontal and vertical back-travel as equally
 * cheap (a "clean back" — both grain directions run straight along the
 * weave). Diagonal back-travel is penalised heavily because diagonal
 * threads on the back of the work cross the weave at an angle and look
 * messy; this is the tatreez aesthetic constraint.
 *
 * The `forbidDiagonalBack` flag makes the diagonal aesthetic constraint
 * a hard rule: when true (default), diagonal moves are unavailable in
 * the back-graph entirely, forcing all back-paths to be Manhattan
 * (axis-aligned) routes. The `diag` weight is then irrelevant.
 */
export interface OptimalWeights {
  /** Per-unit cost of horizontal back-travel along a row of corners. */
  horiz: number;
  /** Per-unit cost of vertical back-travel along a column of corners. */
  vert: number;
  /** Per-unit cost of diagonal back-travel between corners. */
  diag: number;
  /** Cost of a single thread restart (knot off + knot on). */
  threadRestart: number;
  /**
   * Forbid diagonal back-travel entirely. Defaults to true: a clean back
   * has only horizontal and vertical thread runs on it. Set to false to
   * fall back to the soft-cost behaviour where `diag` weight applies.
   */
  forbidDiagonalBack?: boolean;
}

export const DEFAULT_WEIGHTS: OptimalWeights = {
  horiz: 1,
  vert: 1,
  diag: 10,
  threadRestart: 15,
  forbidDiagonalBack: true,
};

export interface SolveOptions {
  weights?: OptimalWeights;
  /**
   * When true, groups all cells of a single colour into one CPP and lets
   * the solver merge spatially close flood-fill regions into one thread
   * if the math is cheaper than restarting. Mathematically optimal but
   * produces stitch trajectories that zig-zag across the chart in ways
   * that are hard to follow by hand.
   *
   * When false (default), runs the CPP solver once per flood-fill region.
   * Each region becomes its own thread. The trajectory within a region
   * is still optimal, but the work proceeds region by region — matching
   * the way real stitchers approach a chart and the way the
   * Tatreez Traditions PDFs teach the patterns.
   */
  mergeRegions?: boolean;

  /**
   * Cap on the number of threads (per colour). When set in region-by-region
   * mode, the solver greedily merges adjacent same-colour regions until
   * the per-colour thread count is at most this value. Merging is by
   * spatial proximity (closest pair first) so the resulting threads
   * still correspond to recognisable chart areas.
   *
   * Undefined/0 means unlimited (= one thread per flood-fill region).
   */
  maxThreads?: number;

  /**
   * Maximum back-travel distance (in corner-grid units) the solver is
   * willing to pay to merge two disconnected components into one thread.
   * If the shortest back-path between two components exceeds this cap,
   * the solver chooses a thread restart instead, even if `threadRestart`
   * cost is higher.
   *
   * This prevents long diagonal slashes across the chart when merging
   * spatially-distant regions: the merge stays "local" rather than
   * carrying a thread across the entire pattern.
   *
   * Undefined means no cap (legacy behaviour: only `threadRestart` cost
   * decides merging).
   */
  maxMergeDistance?: number;

  /**
   * Maximum length (in corner-grid units) of any single axis-aligned
   * back-travel hop the solver will produce. Pairs of odd corners that
   * are farther apart than this are forced to use a thread restart even
   * if the back-walk would be cheaper.
   *
   * This prevents the "fine but visually wandering" plans where the
   * needle travels 30 cells along a column. A short axis hop is
   * invisible; a long one looks like a wandering needle to the
   * stitcher and adds counting fatigue.
   *
   * Undefined means no cap.
   */
  maxAxisJump?: number;

  /**
   * Explicit colour-stitching order (palette indices). Threads of these
   * colours are emitted in the given sequence; any colour present in the
   * pattern but not listed is appended at the end in palette-index order.
   *
   * When undefined, colours are stitched in palette-index order.
   *
   * The `solvePatternOptimal` function exposes
   * `optimizeColourOrder(pattern, weights)` to compute a near-optimal
   * order automatically (greedy nearest-neighbour over per-colour
   * centroids).
   */
  colorOrder?: number[];
}

/** A corner key string, "x,y", used as map keys. */
export type CornerKey = string;

export function cornerKey(x: number, y: number): CornerKey {
  return `${x},${y}`;
}

export function parseCorner(key: CornerKey): [number, number] {
  const [x, y] = key.split(',').map(Number);
  return [x, y];
}
