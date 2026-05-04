import type { OptimalWeights } from './types';

/**
 * Compute pairwise shortest-path costs between a set of corners on the
 * "back graph" — the implicit grid where each corner connects to its
 * eight neighbours, with weights determined by the user-supplied
 * OptimalWeights.
 *
 * Why a custom Dijkstra: the corner grid is implicit (we don't materialise
 * it as edge lists). Each corner (x, y) has up to 8 neighbours: 4 axis-
 * aligned (cost = horiz / vert) and 4 diagonal (cost = diag). Bounds:
 * 0 <= x <= W, 0 <= y <= H.
 *
 * Returns a square matrix `dist` where `dist[i][j]` is the minimum
 * back-travel cost between corners[i] and corners[j].
 */
export function pairwiseBackPaths(
  corners: ReadonlyArray<[number, number]>,
  W: number,
  H: number,
  weights: OptimalWeights,
): { dist: number[][]; path: Array<Array<Array<[number, number]> | null>> } {
  const n = corners.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  const path: Array<Array<Array<[number, number]> | null>> = Array.from(
    { length: n },
    () => new Array(n).fill(null),
  );
  for (let i = 0; i < n; i++) dist[i][i] = 0;

  const targetSet = new Set(corners.map(([x, y]) => x * (H + 2) + y));

  for (let s = 0; s < n; s++) {
    const start = corners[s];
    const settled = new Map<number, number>();
    const prev = new Map<number, number>(); // child key -> parent key
    settled.set(start[0] * (H + 2) + start[1], 0);
    const heap: { cost: number; key: number; x: number; y: number }[] = [];
    heap.push({ cost: 0, key: start[0] * (H + 2) + start[1], x: start[0], y: start[1] });
    let foundCount = 1;
    while (heap.length > 0 && foundCount < n) {
      const top = heapPop(heap);
      if (!top) break;
      const curCost = settled.get(top.key);
      if (curCost === undefined || top.cost > curCost) continue;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = top.x + dx;
          const ny = top.y + dy;
          if (nx < 0 || ny < 0 || nx > W || ny > H) continue;
          let edgeCost: number;
          if (dx === 0) edgeCost = weights.vert;
          else if (dy === 0) edgeCost = weights.horiz;
          else edgeCost = weights.diag;
          const nKey = nx * (H + 2) + ny;
          const nCost = top.cost + edgeCost;
          const prevCost = settled.get(nKey);
          if (prevCost === undefined || nCost < prevCost) {
            if (prevCost === undefined && targetSet.has(nKey)) foundCount++;
            settled.set(nKey, nCost);
            prev.set(nKey, top.key);
            heapPush(heap, { cost: nCost, key: nKey, x: nx, y: ny });
          }
        }
      }
    }

    for (let t = 0; t < n; t++) {
      if (t === s) continue;
      const tk = corners[t][0] * (H + 2) + corners[t][1];
      const v = settled.get(tk);
      if (v === undefined) continue;
      dist[s][t] = v;
      // Reconstruct path from start to corners[t].
      const reverse: Array<[number, number]> = [];
      let cur = tk;
      while (cur !== undefined) {
        const cx = Math.floor(cur / (H + 2));
        const cy = cur % (H + 2);
        reverse.push([cx, cy]);
        if (cur === start[0] * (H + 2) + start[1]) break;
        const p = prev.get(cur);
        if (p === undefined) break;
        cur = p;
      }
      reverse.reverse();
      path[s][t] = reverse;
    }
  }
  return { dist, path };
}

export function pairwiseBackDistances(
  corners: ReadonlyArray<[number, number]>,
  W: number,
  H: number,
  weights: OptimalWeights,
): number[][] {
  const n = corners.length;
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) dist[i][i] = 0;

  // For efficiency, run Dijkstra from each corner, stopping early once
  // all other target corners are settled.
  const targetSet = new Set(corners.map(([x, y]) => x * (H + 2) + y));

  for (let s = 0; s < n; s++) {
    const start = corners[s];
    const settled = new Map<number, number>();
    settled.set(start[0] * (H + 2) + start[1], 0);
    // Min-heap keyed by cost. Implemented as a simple binary heap of pairs.
    const heap: { cost: number; key: number; x: number; y: number }[] = [];
    heap.push({ cost: 0, key: start[0] * (H + 2) + start[1], x: start[0], y: start[1] });

    let foundCount = 1; // start corner itself
    while (heap.length > 0 && foundCount < n) {
      const top = heapPop(heap);
      if (!top) break;
      const curCost = settled.get(top.key);
      if (curCost === undefined || top.cost > curCost) continue;

      // Explore 8 neighbours
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = top.x + dx;
          const ny = top.y + dy;
          if (nx < 0 || ny < 0 || nx > W || ny > H) continue;
          let edgeCost: number;
          if (dx === 0) edgeCost = weights.vert;
          else if (dy === 0) edgeCost = weights.horiz;
          else edgeCost = weights.diag;
          const nKey = nx * (H + 2) + ny;
          const nCost = top.cost + edgeCost;
          const prev = settled.get(nKey);
          if (prev === undefined || nCost < prev) {
            if (prev === undefined && targetSet.has(nKey)) foundCount++;
            settled.set(nKey, nCost);
            heapPush(heap, { cost: nCost, key: nKey, x: nx, y: ny });
          }
        }
      }
    }

    for (let t = 0; t < n; t++) {
      if (t === s) continue;
      const tk = corners[t][0] * (H + 2) + corners[t][1];
      const v = settled.get(tk);
      if (v !== undefined) dist[s][t] = v;
    }
  }
  return dist;
}

// ---- Min-heap helpers (binary heap) ----

interface HeapItem {
  cost: number;
  key: number;
  x: number;
  y: number;
}

function heapPush(h: HeapItem[], item: HeapItem): void {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].cost <= h[i].cost) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}

function heapPop(h: HeapItem[]): HeapItem | undefined {
  if (h.length === 0) return undefined;
  const top = h[0];
  const last = h.pop()!;
  if (h.length > 0) {
    h[0] = last;
    let i = 0;
    const n = h.length;
    while (true) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && h[l].cost < h[smallest].cost) smallest = l;
      if (r < n && h[r].cost < h[smallest].cost) smallest = r;
      if (smallest === i) break;
      [h[smallest], h[i]] = [h[i], h[smallest]];
      i = smallest;
    }
  }
  return top;
}
