/**
 * Minimum-weight perfect matching on a complete graph with even N nodes.
 *
 * Uses an exact bitmask-DP solution when N is small enough that 2^N is
 * tractable, otherwise falls back to greedy + 2-opt + 3-opt local search.
 * The DP threshold is chosen so the exact solver runs in a few hundred
 * milliseconds at most; for tatreez patterns this covers most regions.
 *
 * Returns an array `match` of length N where `match[i]` is the partner of
 * node i (so `match[match[i]] === i`).
 */
export function minWeightMatching(costs: number[][]): number[] {
  const n = costs.length;
  if (n === 0) return [];
  if (n % 2 !== 0) {
    throw new Error(`minWeightMatching requires even N, got ${n}`);
  }
  for (const row of costs) {
    if (row.length !== n) throw new Error(`costs must be square (${n} × ${n})`);
  }

  // For small N, use exact bitmask DP. Threshold: 2^N must fit comfortably
  // in memory and be fast. N=20 → 1M states × 20 work ≈ 20M ops, ~30ms.
  // N=22 → 4M × 22 ≈ 88M ops, ~150ms. Stop there.
  if (n <= 22) {
    return exactBitmaskMatching(costs);
  }

  // Larger N: greedy seed + 2-opt + 3-opt local search.
  return localSearchMatching(costs);
}

/**
 * Exact min-weight perfect matching via bitmask DP.
 *
 * State: subset S of {0..n-1} representing elements still UNMATCHED.
 * dp[S] = min cost to perfectly match the elements of S.
 * Transition: pick the lowest-index element i in S, pair it with some
 * other j in S, and recurse on S \ {i, j}.
 *
 * Complexity: O(2^N * N). For N = 22 this is ~92M ops, runs in ~150ms.
 */
function exactBitmaskMatching(costs: number[][]): number[] {
  const n = costs.length;
  const FULL = (1 << n) - 1;
  // dp[unmatchedMask] = min cost to match the remaining elements.
  // partner[unmatchedMask] = the j that the lowest-bit i is paired with.
  const dp = new Float64Array(1 << n);
  const partner = new Int32Array(1 << n);
  dp.fill(Infinity);
  partner.fill(-1);
  dp[0] = 0;

  // Iterate by popcount ascending so dp[smaller] is filled before dp[larger].
  for (let mask = 1; mask <= FULL; mask++) {
    // Need even popcount; otherwise no perfect sub-matching exists.
    if (popcount(mask) % 2 !== 0) continue;
    // Find the lowest set bit in mask (= the lowest unmatched element).
    let i = -1;
    for (let b = 0; b < n; b++) {
      if (mask & (1 << b)) {
        i = b;
        break;
      }
    }
    if (i === -1) continue;
    const iBit = 1 << i;
    // Try pairing i with every other element j in mask (j > i).
    let best = Infinity;
    let bestJ = -1;
    for (let j = i + 1; j < n; j++) {
      const jBit = 1 << j;
      if (!(mask & jBit)) continue;
      const subMask = mask & ~iBit & ~jBit;
      const sub = dp[subMask];
      if (sub === Infinity) continue;
      const total = sub + costs[i][j];
      if (total < best) {
        best = total;
        bestJ = j;
      }
    }
    dp[mask] = best;
    partner[mask] = bestJ;
  }

  // Reconstruct.
  const match = new Array<number>(n).fill(-1);
  let mask = FULL;
  while (mask !== 0) {
    // Lowest bit of mask is `i`; partner[mask] is its pair `j`.
    let i = -1;
    for (let b = 0; b < n; b++) {
      if (mask & (1 << b)) {
        i = b;
        break;
      }
    }
    if (i === -1) break;
    const j = partner[mask];
    if (j === -1) break;
    match[i] = j;
    match[j] = i;
    mask &= ~((1 << i) | (1 << j));
  }
  return match;
}

function popcount(x: number): number {
  // 32-bit popcount.
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

/**
 * Heuristic min-weight matching: greedy seeding + 2-opt + 3-opt local
 * search. Used for larger N where exact DP isn't tractable.
 */
function localSearchMatching(costs: number[][]): number[] {
  const n = costs.length;
  // 1. Greedy seeding: repeatedly pick the cheapest unmatched pair.
  const match = new Array<number>(n).fill(-1);
  const pairs: { i: number; j: number; cost: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({ i, j, cost: costs[i][j] });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);
  for (const { i, j } of pairs) {
    if (match[i] === -1 && match[j] === -1) {
      match[i] = j;
      match[j] = i;
    }
  }

  // 2-opt
  twoOpt(match, costs);
  // 3-opt: try every triple of pairs, all 15 re-pairings. Loops until no
  // improvement.
  threeOpt(match, costs);
  // One more 2-opt pass (3-opt can unlock new 2-opt moves).
  twoOpt(match, costs);

  return match;
}

function twoOpt(match: number[], costs: number[][]): void {
  const n = match.length;
  let improved = true;
  let iter = 0;
  const maxIter = 1000;
  while (improved && iter < maxIter) {
    improved = false;
    iter++;
    for (let a = 0; a < n; a++) {
      const b = match[a];
      if (b < a) continue;
      for (let c = a + 1; c < n; c++) {
        if (c === b) continue;
        const d = match[c];
        if (d <= c) continue;
        if (d === a) continue;
        const cur = costs[a][b] + costs[c][d];
        const swap1 = costs[a][c] + costs[b][d];
        const swap2 = costs[a][d] + costs[b][c];
        const minOther = Math.min(swap1, swap2);
        if (minOther < cur - 1e-9) {
          if (swap1 <= swap2) {
            match[a] = c;
            match[c] = a;
            match[b] = d;
            match[d] = b;
          } else {
            match[a] = d;
            match[d] = a;
            match[b] = c;
            match[c] = b;
          }
          improved = true;
        }
      }
    }
  }
}

function threeOpt(match: number[], costs: number[][]): void {
  const n = match.length;
  // Three pairs (a,b), (c,d), (e,f) with a<b, c<d, e<f and a<c<e.
  // Six elements; 15 ways to pair into 3 pairs (the perfect matchings of K_6):
  //   ab cd ef  (current)
  //   ab ce df  ab cf de
  //   ac bd ef  ac be df  ac bf de
  //   ad bc ef  ad be cf  ad bf ce
  //   ae bc df  ae bd cf  ae bf cd
  //   af bc de  af bd ce  af be cd
  let improved = true;
  let iter = 0;
  const maxIter = 200;
  while (improved && iter < maxIter) {
    improved = false;
    iter++;
    for (let a = 0; a < n; a++) {
      const b = match[a];
      if (b < a) continue;
      for (let c = a + 1; c < n; c++) {
        if (c === b) continue;
        const d = match[c];
        if (d <= c) continue;
        if (d === a || d === b) continue;
        for (let e = c + 1; e < n; e++) {
          if (e === b || e === d) continue;
          const f = match[e];
          if (f <= e) continue;
          if (f === a || f === b || f === c || f === d) continue;
          const cur = costs[a][b] + costs[c][d] + costs[e][f];
          const opts: Array<[number, number, number, number, number, number, number]> = [
            // [p1a, p1b, p2a, p2b, p3a, p3b, totalCost]
            [a, c, b, d, e, f, costs[a][c] + costs[b][d] + costs[e][f]],
            [a, c, b, e, d, f, costs[a][c] + costs[b][e] + costs[d][f]],
            [a, c, b, f, d, e, costs[a][c] + costs[b][f] + costs[d][e]],
            [a, d, b, c, e, f, costs[a][d] + costs[b][c] + costs[e][f]],
            [a, d, b, e, c, f, costs[a][d] + costs[b][e] + costs[c][f]],
            [a, d, b, f, c, e, costs[a][d] + costs[b][f] + costs[c][e]],
            [a, e, b, c, d, f, costs[a][e] + costs[b][c] + costs[d][f]],
            [a, e, b, d, c, f, costs[a][e] + costs[b][d] + costs[c][f]],
            [a, e, b, f, c, d, costs[a][e] + costs[b][f] + costs[c][d]],
            [a, f, b, c, d, e, costs[a][f] + costs[b][c] + costs[d][e]],
            [a, f, b, d, c, e, costs[a][f] + costs[b][d] + costs[c][e]],
            [a, f, b, e, c, d, costs[a][f] + costs[b][e] + costs[c][d]],
            [a, b, c, e, d, f, costs[a][b] + costs[c][e] + costs[d][f]],
            [a, b, c, f, d, e, costs[a][b] + costs[c][f] + costs[d][e]],
          ];
          let bestCost = cur;
          let bestOpt = -1;
          for (let k = 0; k < opts.length; k++) {
            if (opts[k][6] < bestCost - 1e-9) {
              bestCost = opts[k][6];
              bestOpt = k;
            }
          }
          if (bestOpt !== -1) {
            const [p1a, p1b, p2a, p2b, p3a, p3b] = opts[bestOpt];
            match[p1a] = p1b;
            match[p1b] = p1a;
            match[p2a] = p2b;
            match[p2b] = p2a;
            match[p3a] = p3b;
            match[p3b] = p3a;
            improved = true;
          }
        }
      }
    }
  }
}

export function matchingCost(costs: number[][], match: number[]): number {
  let total = 0;
  const seen = new Set<number>();
  for (let i = 0; i < match.length; i++) {
    if (seen.has(i)) continue;
    seen.add(i);
    seen.add(match[i]);
    total += costs[i][match[i]];
  }
  return total;
}
