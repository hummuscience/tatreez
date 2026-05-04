import type { Cell, ColorIndex, Corner, Pattern, Region, Step } from '../types';
import { extractRegions } from '../regions';
import { emit } from '../stepUtil';
import type { OptimalWeights, SolveOptions } from './types';
import { DEFAULT_WEIGHTS } from './types';
import { pairwiseBackPaths } from './backGraph';
import { minWeightMatching } from './matching';

interface SolveRegionOptions {
  /**
   * Force-merge all disconnected components in the augmented graph into
   * a single Euler tour, regardless of merge-vs-restart cost. When false
   * (default), the solver chooses based on cost.
   */
  forceMergeComponents?: boolean;
  /**
   * Hard cap on the back-distance the solver will pay to merge two
   * components. Even when merging is cheaper than `threadRestart`,
   * components farther apart than this are NOT merged — preventing
   * long diagonal slashes across the chart. Undefined = no cap.
   */
  maxMergeDistance?: number;
}

/**
 * Solve the tatreez stitch-order problem optimally for one region under
 * the given cost weights. Returns the Step sequence.
 *
 * Algorithm:
 *  1. Required-edge multigraph: each cell contributes its `/` and `\` legs.
 *  2. Compute odd-degree vertices (corners with odd number of incident
 *     required edges).
 *  3. Compute pairwise back-graph shortest paths between odd corners,
 *     capped at `threadRestart`: if back-path costs more than restarting
 *     the thread, take the cheaper option.
 *  4. Min-weight perfect matching pairs up the odd corners.
 *  5. For each matched pair: if cheaper to back-walk, add the back-edges
 *     to the multigraph as "free" edges; if cheaper to restart, mark the
 *     pair as a "thread cut" that splits the eventual Euler tour.
 *  6. The augmented multigraph now has all-even degrees → Euler tour
 *     exists. Walk it. Split at thread cuts.
 *  7. Translate the walked path into Step objects.
 *
 * The matching step uses 2-opt local search; for typical pattern sizes
 * (≤ 80 odd corners) this is optimal or very near-optimal.
 */
export function solveOptimal(
  region: Region,
  weights: OptimalWeights = DEFAULT_WEIGHTS,
  regionOptions: SolveRegionOptions = {},
): Step[] {
  if (region.cells.length === 0) return [];

  // --- 1. Required-edge multigraph ---
  // We represent edges as pairs of corner keys with a leg label.
  // Edge id = unique integer; we'll need to walk these in an Euler tour later.
  type Edge = {
    id: number;
    a: Corner;
    b: Corner;
    cell: Cell;
    leg: '/' | '\\';
    isBack: boolean; // false = required front, true = back-travel from matching
  };
  const edges: Edge[] = [];
  for (const [cx, cy] of region.cells) {
    edges.push({
      id: edges.length,
      a: [cx, cy + 1],
      b: [cx + 1, cy],
      cell: [cx, cy],
      leg: '/',
      isBack: false,
    });
    edges.push({
      id: edges.length,
      a: [cx, cy],
      b: [cx + 1, cy + 1],
      cell: [cx, cy],
      leg: '\\',
      isBack: false,
    });
  }

  // --- 2. Compute corner degrees in the required-edge graph ---
  const cornerDeg = new Map<string, number>();
  const cornerXY = new Map<string, Corner>();
  const ck = (c: Corner) => `${c[0]},${c[1]}`;
  const noteCorner = (c: Corner) => {
    const k = ck(c);
    if (!cornerXY.has(k)) cornerXY.set(k, c);
  };
  for (const e of edges) {
    cornerDeg.set(ck(e.a), (cornerDeg.get(ck(e.a)) ?? 0) + 1);
    cornerDeg.set(ck(e.b), (cornerDeg.get(ck(e.b)) ?? 0) + 1);
    noteCorner(e.a);
    noteCorner(e.b);
  }
  const oddKeys: string[] = [];
  for (const [k, d] of cornerDeg) if (d % 2 === 1) oddKeys.push(k);

  // For odd count safety: if any corner has odd degree, there must be an
  // even total of them (handshake lemma). But if 0, we can do Euler tour
  // without adding any back edges.
  if (oddKeys.length % 2 !== 0) {
    throw new Error(`Internal error: odd number of odd-degree corners (${oddKeys.length})`);
  }

  // --- 3. Pairwise back-distances among odd corners, capped at restart cost ---
  // Compute the bounding region for the back-graph (a generous bound;
  // we extend a few cells beyond region bounds to allow back-travel
  // outside the region's tight bounding box if it's optimal).
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [cx, cy] of region.cells) {
    if (cx < minX) minX = cx;
    if (cx + 1 > maxX) maxX = cx + 1;
    if (cy < minY) minY = cy;
    if (cy + 1 > maxY) maxY = cy + 1;
  }
  // Allow back-travel within the bounding rectangle (no need to go outside it
  // for a minimum-cost path under typical weights).
  const bbW = maxX - minX;
  const bbH = maxY - minY;
  const oddCorners: Corner[] = oddKeys.map((k) => cornerXY.get(k)!);
  const offsetCorners = oddCorners.map(([x, y]) => [x - minX, y - minY] as [number, number]);
  const { dist: backDist, path: backPath } = pairwiseBackPaths(
    offsetCorners,
    bbW,
    bbH,
    weights,
  );

  // Cap each back distance at threadRestart: if back-walking is more
  // expensive than restarting, the pair will use a thread restart instead.
  // Also enforce maxMergeDistance: any pair farther than the cap is forced
  // to use a thread restart even when back-walking would be cheaper. This
  // prevents long axis slashes across the chart (e.g. (11,11)→(2,11)) when
  // threadRestart cost is high enough that the matching would otherwise
  // pair distant odd corners.
  const cap = regionOptions.maxMergeDistance;
  const matchCosts: number[][] = backDist.map((row, i) =>
    row.map((d, j) => {
      if (cap !== undefined && i !== j && backDist[i][j] > cap) {
        return weights.threadRestart;
      }
      return Math.min(d, weights.threadRestart);
    }),
  );

  // --- 4. Min-weight perfect matching ---
  let matching: number[] = [];
  if (oddCorners.length > 0) {
    matching = minWeightMatching(matchCosts);
  }

  // --- 5. Augment graph: for each matched pair, decide back vs restart ---
  type PairInfo = { i: number; j: number; useRestart: boolean };
  const pairInfo: PairInfo[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < matching.length; i++) {
    if (seen.has(i)) continue;
    const j = matching[i];
    if (j === -1) continue;
    seen.add(i);
    seen.add(j);
    const overCap = cap !== undefined && backDist[i][j] > cap;
    const useRestart = overCap || backDist[i][j] >= weights.threadRestart;
    pairInfo.push({ i, j, useRestart });
  }

  // For non-restart pairs, add "back" edges that connect the two odd
  // corners. The cheapest path may have multiple hops, but for the Euler
  // tour we just need a single edge per pair — the corner keys will be
  // emitted as direct moves in the final step sequence (the renderer
  // will draw them as straight lines, which is fine because our cost
  // function allows any path of the same total cost).
  // For thread-restart pairs, do NOT add a back-edge; instead remember
  // that the Euler tour will eventually have these two corners as
  // open ends of separate threads.
  type AugEdge = Edge & {
    backInfo?: { partnerCorner: Corner };
    /**
     * Full corner-grid path for back-edges, in offset coordinates
     * (relative to the region's bounding-box origin). When set, the
     * emitter expands this back-edge into multiple unit-length back
     * steps that follow the actual Dijkstra path. When unset, the
     * back-edge is rendered as a straight line between endpoints
     * (legacy behaviour).
     */
    backPath?: Array<[number, number]>;
  };
  const augEdges: AugEdge[] = edges.slice() as AugEdge[];
  // For each non-restart pair, we add ONE back-edge between the two odd
  // corners. This makes the multigraph fully even-degree (each odd corner
  // gets one extra edge incident to it).
  const restartPairs: Array<[Corner, Corner]> = [];
  for (const { i, j, useRestart } of pairInfo) {
    const a = oddCorners[i];
    const b = oddCorners[j];
    if (useRestart) {
      restartPairs.push([a, b]);
    } else {
      augEdges.push({
        id: augEdges.length,
        a,
        b,
        cell: [-1, -1],
        leg: '/',
        isBack: true,
        backPath: backPath[i][j] ?? undefined,
      });
    }
  }

  // For thread-restart pairs, we still need each odd corner to have even
  // degree in the multigraph for the Euler tour. We use the same trick:
  // add a virtual "restart edge" between the paired corners but flag it
  // so that we split the tour there.
  const restartEdgeIds = new Set<number>();
  for (const [a, b] of restartPairs) {
    const id = augEdges.length;
    restartEdgeIds.add(id);
    augEdges.push({
      id,
      a,
      b,
      cell: [-1, -1],
      leg: '/',
      isBack: true,
    });
  }

  // --- 5b. Connect disconnected components via paired back-edges ---
  // After odd-vertex matching, the augmented graph may still have multiple
  // connected components (e.g. an "interior" cluster of cells whose corner
  // diamond never touches the bounding-box corners). Each separate
  // component becomes its own thread by default, paying threadRestart cost
  // each. If we can connect two components via a pair of back-edges
  // (round-trip) cheaper than restartCost, we should — that's a solid
  // benefit of higher restart costs and also the right human stitcher
  // intuition (use one thread, run back-travel between clusters).
  {
    // Build connectivity over current edges.
    const cornerKeys = Array.from(cornerXY.keys());
    const cornerIdx = new Map<string, number>();
    cornerKeys.forEach((k, i) => cornerIdx.set(k, i));
    const parent: number[] = cornerKeys.map((_, i) => i);
    const findRoot = (x: number): number => {
      let r = x;
      while (parent[r] !== r) r = parent[r];
      // Path compress
      while (parent[x] !== r) {
        const nxt = parent[x];
        parent[x] = r;
        x = nxt;
      }
      return r;
    };
    const union = (x: number, y: number) => {
      const rx = findRoot(x);
      const ry = findRoot(y);
      if (rx !== ry) parent[rx] = ry;
    };
    for (const e of augEdges) {
      const ai = cornerIdx.get(ck(e.a));
      const bi = cornerIdx.get(ck(e.b));
      if (ai !== undefined && bi !== undefined) union(ai, bi);
    }
    // Group corners by root.
    const componentOf = new Map<number, number[]>();
    for (let i = 0; i < cornerKeys.length; i++) {
      const r = findRoot(i);
      if (!componentOf.has(r)) componentOf.set(r, []);
      componentOf.get(r)!.push(i);
    }
    const components = Array.from(componentOf.values());
    if (components.length > 1) {
      // For each pair of components, find the cheapest pair of corners
      // (one from each) on the back-graph. We only need to consider corners
      // that actually have incident required edges (interior corners would
      // give the same distance via shorter routes anyway, but using only
      // present corners keeps the pairwise count small).
      const compRep: Array<{
        comp: number;
        corner: Corner;
        cornerIdx: number;
      }> = components.map((comp) => {
        const idx = comp[0];
        const key = cornerKeys[idx];
        return { comp: 0, corner: cornerXY.get(key)!, cornerIdx: idx };
      });
      for (let c = 0; c < compRep.length; c++) compRep[c].comp = c;

      // Cost of merging components A and B = 2 × minBackDist between any
      // corner in A and any corner in B. We approximate by picking one
      // corner per component (the first); this is fine because back-graph
      // distances are smooth on the corner grid.
      // Compute pairwise back-distances between all component reps.
      const repCorners: Array<[number, number]> = compRep.map(({ corner }) => [
        corner[0] - minX,
        corner[1] - minY,
      ]);
      const { dist: repDist, path: repPath } = pairwiseBackPaths(
        repCorners,
        bbW,
        bbH,
        weights,
      );

      // Use Kruskal's MST: candidate edges are pairs (compA, compB) with
      // weight = min(2 * repDist, threadRestart). We add an edge to the
      // MST iff it actually merges (UF says so) AND it's cheaper than
      // the alternative threadRestart. Because we WILL pay restart cost
      // for every component beyond the first, the MST trades that fixed
      // cost against connection cost.

      // Reset UF on components only.
      const cParent = new Array(compRep.length).fill(0).map((_, i) => i);
      const cFind = (x: number): number => {
        let r = x;
        while (cParent[r] !== r) r = cParent[r];
        while (cParent[x] !== r) {
          const nx = cParent[x];
          cParent[x] = r;
          x = nx;
        }
        return r;
      };
      const cUnion = (a: number, b: number) => {
        const ra = cFind(a);
        const rb = cFind(b);
        if (ra !== rb) cParent[ra] = rb;
      };

      const candidates: Array<{ a: number; b: number; cost: number; backDist: number }> = [];
      for (let a = 0; a < compRep.length; a++) {
        for (let b = a + 1; b < compRep.length; b++) {
          const d = repDist[a][b];
          // Connection cost: round-trip back-travel = 2*d.
          // Comparison cost: thread restart (which we'd otherwise pay).
          const connectCost = 2 * d;
          candidates.push({ a, b, cost: connectCost, backDist: d });
        }
      }
      candidates.sort((x, y) => x.cost - y.cost);

      for (const cand of candidates) {
        if (cFind(cand.a) === cFind(cand.b)) continue; // already merged
        // Distance cap: never merge across more than `maxMergeDistance`
        // corner-grid units. This stops long diagonal slashes across the
        // chart even when forceMergeComponents is true. The cap is on
        // one-way back-distance (not the round-trip cost).
        if (
          regionOptions.maxMergeDistance !== undefined &&
          cand.backDist > regionOptions.maxMergeDistance
        ) {
          continue;
        }
        // Connecting saves us threadRestart cost. Only do it if connection
        // is cheaper than restart — UNLESS forceMergeComponents is set,
        // in which case we must collapse all components into one thread.
        if (!regionOptions.forceMergeComponents && cand.cost >= weights.threadRestart) break;
        // Add 2 parallel back-edges between the two component reps.
        const cornerA = compRep[cand.a].corner;
        const cornerB = compRep[cand.b].corner;
        const fwdPath = repPath[cand.a][cand.b] ?? undefined;
        const bckPath = repPath[cand.b][cand.a] ?? undefined;
        for (let k = 0; k < 2; k++) {
          augEdges.push({
            id: augEdges.length,
            a: cornerA,
            b: cornerB,
            cell: [-1, -1],
            leg: '/',
            isBack: true,
            backPath: k === 0 ? fwdPath : bckPath,
          });
        }
        cUnion(cand.a, cand.b);
      }
    }
  }

  // --- 6. Euler tour ---
  // Hierholzer's algorithm. The graph has all-even degrees. We produce a
  // sequence of vertices `path` such that consecutive pairs (path[i],
  // path[i+1]) form a complete cover of the edges, each used exactly once.
  // We track `pathEdges[i]` = the edge id used between path[i] and
  // path[i+1].

  // Build adjacency as edge-id lists per corner key.
  const adj = new Map<string, number[]>();
  for (const e of augEdges) {
    const ka = ck(e.a);
    const kb = ck(e.b);
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka)!.push(e.id);
    adj.get(kb)!.push(e.id);
  }


  // The augmented graph may be DISCONNECTED — disjoint regions of legs
  // that don't share corners stay disconnected even after matching their
  // own odd vertices. We handle this by finding connected components and
  // running Hierholzer on each separately. Each component becomes its own
  // thread (separated by a thread restart in the emitted step sequence).

  const usedEdge = new Array<boolean>(augEdges.length).fill(false);

  type Walked = {
    from: Corner;
    to: Corner;
    edge: AugEdge;
  };

  // Helper: run Hierholzer's from a given start key, walking only edges
  // not yet marked used, and return the resulting walked sequence.
  const runHierholzer = (startKey: string): Walked[] => {
    const stack: string[] = [startKey];
    const circuit: { vertex: string; edgeId: number | null }[] = [];
    const enterEdge: number[] = [-1];

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const incidentList = adj.get(top) ?? [];
      let nextEdgeId = -1;
      while (incidentList.length > 0) {
        const id = incidentList[incidentList.length - 1];
        if (usedEdge[id]) {
          incidentList.pop();
        } else {
          nextEdgeId = id;
          incidentList.pop();
          break;
        }
      }
      if (nextEdgeId === -1) {
        circuit.push({ vertex: top, edgeId: enterEdge[stack.length - 1] });
        stack.pop();
        enterEdge.pop();
      } else {
        const e = augEdges[nextEdgeId];
        usedEdge[nextEdgeId] = true;
        const other = ck(e.a) === top ? ck(e.b) : ck(e.a);
        stack.push(other);
        enterEdge.push(nextEdgeId);
      }
    }
    circuit.reverse();

    const out: Walked[] = [];
    for (let i = 1; i < circuit.length; i++) {
      const eId = circuit[i].edgeId;
      if (eId === null || eId === -1) continue;
      const e = augEdges[eId];
      const fromKey = circuit[i - 1].vertex;
      const from = cornerXY.get(fromKey) ?? (ck(e.a) === fromKey ? e.a : e.b);
      const toKey = circuit[i].vertex;
      const to = cornerXY.get(toKey) ?? (ck(e.a) === toKey ? e.a : e.b);
      out.push({ from, to, edge: e });
    }
    return out;
  };

  // Iterate: find any unused edge, pick one of its endpoints as start,
  // run Hierholzer. Repeat until all edges are used. Each pass is a
  // separate Euler sub-tour (a separate thread).
  const componentTours: Walked[][] = [];
  while (true) {
    let startEdgeId = -1;
    for (let i = 0; i < augEdges.length; i++) {
      if (!usedEdge[i]) {
        startEdgeId = i;
        break;
      }
    }
    if (startEdgeId === -1) break;
    const startKey = ck(augEdges[startEdgeId].a);
    componentTours.push(runHierholzer(startKey));
  }

  // Flatten all sub-tours into a single walked list, inserting a
  // synthetic "thread cut" marker between sub-tours by reusing the
  // restartEdgeIds mechanism.
  const walked: Walked[] = [];
  for (let c = 0; c < componentTours.length; c++) {
    if (c > 0) {
      // Insert a virtual restart edge (not in augEdges; we'll detect this
      // marker downstream by checking edge id).
      walked.push({
        from: componentTours[c - 1][componentTours[c - 1].length - 1]?.to ?? [0, 0],
        to: componentTours[c][0]?.from ?? [0, 0],
        edge: {
          id: -1, // synthetic
          a: [0, 0],
          b: [0, 0],
          cell: [-1, -1],
          leg: '/',
          isBack: true,
        } as AugEdge,
      });
    }
    walked.push(...componentTours[c]);
  }

  // --- 8. Split at restart edges and emit Step objects ---
  const steps: Step[] = [];
  // Whenever we encounter a restart-edge or a synthetic component-jump
  // in `walked`, we drop it and start a new thread on the next non-restart
  // edge.
  let needNewThread = true;
  for (let idx = 0; idx < walked.length; idx++) {
    const w = walked[idx];
    const isRestart = restartEdgeIds.has(w.edge.id) || w.edge.id === -1;
    if (isRestart) {
      needNewThread = true;
      continue;
    }
    if (needNewThread) {
      emit(steps, 'start', null, w.from);
      needNewThread = false;
    }
    if (w.edge.isBack) {
      // Expand into the actual Dijkstra path if we have one, so each
      // segment is a unit-length corner-grid move (axis-aligned or
      // diagonal). Without expansion the back-edge is rendered as a
      // straight line, which can look diagonal even when the cost was
      // computed for an axis-aligned multi-step path.
      const p = w.edge.backPath;
      if (p && p.length >= 2) {
        // Path is in offset coords (relative to bbox origin); shift back.
        const abs: Corner[] = p.map(([x, y]) => [x + minX, y + minY] as Corner);
        // Path may be in either direction relative to w.from / w.to. Match.
        const startMatchesFront = abs[0][0] === w.from[0] && abs[0][1] === w.from[1];
        const oriented = startMatchesFront ? abs : abs.slice().reverse();
        for (let k = 1; k < oriented.length; k++) {
          emit(steps, 'back', oriented[k - 1], oriented[k]);
        }
      } else {
        emit(steps, 'back', w.from, w.to);
      }
    } else {
      emit(steps, 'front', w.from, w.to, w.edge.cell, w.edge.leg);
    }
  }

  return steps;
}

/**
 * Solve a whole pattern using the optimal CPP solver.
 *
 * Two modes (controlled by `options.mergeRegions`):
 *
 * 1. **Region-by-region (default)** — runs the solver once per
 *    flood-fill region. Each contiguous block of same-coloured cells
 *    becomes its own thread. The trajectory within a region is still
 *    mathematically optimal, but you finish one visual sub-shape (a
 *    leaf, the stem, an arm) before moving to the next. This matches
 *    how the Tatreez Traditions PDFs teach the patterns and how a
 *    real stitcher approaches a chart.
 *
 * 2. **Merged (mergeRegions=true)** — groups all cells of a single
 *    colour into one CPP. The solver decides for itself when to
 *    restart and when to back-walk between visual regions. Produces
 *    fewer threads but a trajectory that can zig-zag across the
 *    chart in ways that are hard to execute by hand.
 *
 * In both modes, different colours always become different threads
 * (a thread can only be one colour).
 *
 * Regions are emitted top-to-bottom, then left-to-right within a row.
 * Within each colour, the order is stable across runs.
 *
 * The function accepts the legacy two-argument form
 * `solvePatternOptimal(pattern, weights)` for backward compatibility.
 */
export function solvePatternOptimal(
  pattern: Pattern,
  optionsOrWeights: SolveOptions | OptimalWeights = {},
): Step[] {
  // Backward-compat: if the second argument looks like raw weights,
  // wrap it. We detect this by the presence of `horiz` / `vert` /
  // `diag` / `threadRestart` keys at the top level.
  let options: SolveOptions;
  if (
    'horiz' in optionsOrWeights ||
    'vert' in optionsOrWeights ||
    'diag' in optionsOrWeights ||
    'threadRestart' in optionsOrWeights
  ) {
    options = { weights: optionsOrWeights as OptimalWeights };
  } else {
    options = optionsOrWeights as SolveOptions;
  }
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const mergeRegions = options.mergeRegions ?? false;

  if (mergeRegions) {
    // Group all cells of one colour into one CPP per colour.
    const byColor = new Map<number, Cell[]>();
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const c = pattern.cells[y][x];
        if (c === 0) continue;
        if (!byColor.has(c)) byColor.set(c, []);
        byColor.get(c)!.push([x, y]);
      }
    }
    const allSteps: Step[] = [];
    // Colour order: explicit override, or palette-index order.
    const allColors = Array.from(byColor.keys()).sort((a, b) => a - b);
    let colorKeys: number[];
    if (options.colorOrder && options.colorOrder.length > 0) {
      colorKeys = options.colorOrder.filter((c) => byColor.has(c));
      for (const c of allColors) if (!colorKeys.includes(c)) colorKeys.push(c);
    } else {
      colorKeys = allColors;
    }
    for (const color of colorKeys) {
      const cells = byColor.get(color)!;
      const region: Region = { color: color as ColorIndex, cells };
      allSteps.push(
        ...solveOptimal(region, weights, {
          maxMergeDistance: options.maxMergeDistance,
        }),
      );
    }
    return allSteps;
  }

  // Region-by-region: each flood-fill component is solved as its own
  // thread. Order regions by colour (asc), then top-to-bottom, then
  // left-to-right. If maxThreads is set, greedily merge adjacent
  // same-colour regions until each colour has at most maxThreads regions.
  const regions = extractRegions(pattern);

  // Per-colour merging if maxThreads set
  const maxThreads = options.maxThreads ?? 0;
  let workingRegions: Region[] = regions;
  if (maxThreads > 0) {
    workingRegions = mergeRegionsToCap(regions, maxThreads);
  }

  // Per-colour ordering: greedy nearest-neighbour traversal over region
  // centroids, starting from the top-leftmost region of each colour. This
  // minimises the total inter-thread restart distance the stitcher walks
  // between regions, beating the simple top-left sort when regions are
  // scattered.
  const orderedRegions = orderRegionsForTraversal(workingRegions, options.colorOrder);
  const allSteps: Step[] = [];
  // When the user has explicitly capped the number of threads, the
  // solver must collapse each Region into a single Euler tour even when
  // back-travel between merged sub-regions is expensive.
  const forceMerge = maxThreads > 0;
  for (const r of orderedRegions) {
    allSteps.push(
      ...solveOptimal(r, weights, {
        forceMergeComponents: forceMerge,
        maxMergeDistance: options.maxMergeDistance,
      }),
    );
  }
  return allSteps;
}

function regionCentroid(r: Region): [number, number] {
  let sx = 0,
    sy = 0;
  for (const [x, y] of r.cells) {
    sx += x;
    sy += y;
  }
  const n = r.cells.length || 1;
  return [sx / n, sy / n];
}

/**
 * Order regions so that within each colour, the traversal is a greedy
 * nearest-neighbour walk starting from the top-leftmost region centroid.
 * Colour order is taken from `colorOrder` if supplied, otherwise palette
 * index (1, 2, …).
 */
function orderRegionsForTraversal(
  regions: Region[],
  colorOrder?: number[],
): Region[] {
  const byColor = new Map<number, Region[]>();
  for (const r of regions) {
    if (!byColor.has(r.color)) byColor.set(r.color, []);
    byColor.get(r.color)!.push(r);
  }
  const colors =
    colorOrder && colorOrder.length > 0
      ? colorOrder.filter((c) => byColor.has(c))
      : Array.from(byColor.keys()).sort((a, b) => a - b);
  // Add any colours from `regions` that weren't in colorOrder, in palette
  // index order, so we never silently drop regions.
  for (const c of Array.from(byColor.keys()).sort((a, b) => a - b)) {
    if (!colors.includes(c)) colors.push(c);
  }

  const out: Region[] = [];
  for (const c of colors) {
    const regs = byColor.get(c)!;
    const centroids = regs.map(regionCentroid);
    // Start from the top-leftmost (min y, tie-break min x).
    let startIdx = 0;
    for (let i = 1; i < regs.length; i++) {
      if (
        centroids[i][1] < centroids[startIdx][1] ||
        (centroids[i][1] === centroids[startIdx][1] &&
          centroids[i][0] < centroids[startIdx][0])
      ) {
        startIdx = i;
      }
    }
    const visited = new Array<boolean>(regs.length).fill(false);
    let cur = startIdx;
    out.push(regs[cur]);
    visited[cur] = true;
    for (let step = 1; step < regs.length; step++) {
      let bestNext = -1;
      let bestD = Infinity;
      const [cx, cy] = centroids[cur];
      for (let i = 0; i < regs.length; i++) {
        if (visited[i]) continue;
        const dx = centroids[i][0] - cx;
        const dy = centroids[i][1] - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestNext = i;
        }
      }
      if (bestNext === -1) break;
      visited[bestNext] = true;
      out.push(regs[bestNext]);
      cur = bestNext;
    }
  }
  return out;
}

/**
 * Greedily merge same-colour regions until each colour has at most
 * `maxThreads` regions. Uses single-linkage clustering: at each step,
 * find the closest pair of regions of the same colour (by minimum cell
 * distance) and merge them.
 */
function mergeRegionsToCap(regions: Region[], maxThreads: number): Region[] {
  // Group by colour
  const byColor = new Map<number, Region[]>();
  for (const r of regions) {
    if (!byColor.has(r.color)) byColor.set(r.color, []);
    byColor.get(r.color)!.push({ color: r.color, cells: r.cells.slice() });
  }
  const out: Region[] = [];
  for (const [, regs] of byColor) {
    while (regs.length > maxThreads) {
      // Find closest pair
      let bestI = 0,
        bestJ = 1,
        bestD = Infinity;
      for (let i = 0; i < regs.length; i++) {
        for (let j = i + 1; j < regs.length; j++) {
          const d = minCellDist(regs[i].cells, regs[j].cells);
          if (d < bestD) {
            bestD = d;
            bestI = i;
            bestJ = j;
          }
        }
      }
      // Merge j into i, then remove j
      regs[bestI] = {
        color: regs[bestI].color,
        cells: regs[bestI].cells.concat(regs[bestJ].cells),
      };
      regs.splice(bestJ, 1);
    }
    out.push(...regs);
  }
  return out;
}

function minCellDist(a: Cell[], b: Cell[]): number {
  let best = Infinity;
  for (const [ax, ay] of a) {
    for (const [bx, by] of b) {
      const d = Math.abs(ax - bx) + Math.abs(ay - by);
      if (d < best) best = d;
      if (best === 0) return 0;
    }
  }
  return best;
}

/**
 * Compute a near-optimal colour-stitching order for the given pattern.
 * Uses greedy nearest-neighbour over per-colour centroids in chart space:
 * starts at the top-leftmost colour centroid and moves to the nearest
 * unvisited colour at each step.
 *
 * The result is a list of palette indices, suitable for passing as
 * `solvePatternOptimal(pattern, { colorOrder })`.
 *
 * For 2-colour patterns the output is always the same as palette order
 * (only one ordering matters). For 3+ colours, this can meaningfully
 * reduce the spatial distance the stitcher walks between threads.
 */
export function optimizeColourOrder(pattern: Pattern): number[] {
  // Per-colour centroid in chart space.
  const sums = new Map<number, { sx: number; sy: number; n: number }>();
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const c = pattern.cells[y][x];
      if (c === 0) continue;
      let s = sums.get(c);
      if (!s) {
        s = { sx: 0, sy: 0, n: 0 };
        sums.set(c, s);
      }
      s.sx += x;
      s.sy += y;
      s.n++;
    }
  }
  const colors = Array.from(sums.keys());
  if (colors.length <= 1) return colors;
  const centroids = new Map<number, [number, number]>();
  for (const [c, s] of sums) centroids.set(c, [s.sx / s.n, s.sy / s.n]);
  // Start from top-leftmost.
  let start = colors[0];
  let [sx, sy] = centroids.get(start)!;
  for (const c of colors) {
    const [cx, cy] = centroids.get(c)!;
    if (cy < sy || (cy === sy && cx < sx)) {
      start = c;
      sx = cx;
      sy = cy;
    }
  }
  const visited = new Set<number>([start]);
  const out: number[] = [start];
  let cur = start;
  while (visited.size < colors.length) {
    const [cx, cy] = centroids.get(cur)!;
    let bestC = -1;
    let bestD = Infinity;
    for (const c of colors) {
      if (visited.has(c)) continue;
      const [px, py] = centroids.get(c)!;
      const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (d < bestD) {
        bestD = d;
        bestC = c;
      }
    }
    if (bestC === -1) break;
    visited.add(bestC);
    out.push(bestC);
    cur = bestC;
  }
  return out;
}

// Re-export ColorIndex for the type system since some callers will need it.
export type { ColorIndex };
