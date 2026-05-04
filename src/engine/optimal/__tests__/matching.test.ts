import { describe, it, expect } from 'vitest';
import { minWeightMatching, matchingCost } from '../matching';

function bruteForceMin(costs: number[][]): number {
  const n = costs.length;
  if (n === 0) return 0;
  // Try every perfect matching by recursion: pick lowest unmatched i,
  // try every j > i.
  const used = new Array<boolean>(n).fill(false);
  function rec(): number {
    let lowest = -1;
    for (let i = 0; i < n; i++) {
      if (!used[i]) {
        lowest = i;
        break;
      }
    }
    if (lowest === -1) return 0;
    let best = Infinity;
    for (let j = lowest + 1; j < n; j++) {
      if (used[j]) continue;
      used[lowest] = true;
      used[j] = true;
      const sub = rec();
      const total = costs[lowest][j] + sub;
      if (total < best) best = total;
      used[lowest] = false;
      used[j] = false;
    }
    return best;
  }
  return rec();
}

function symRandom(n: number, seed: number): number[][] {
  // Tiny LCG for reproducibility.
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = rand() * 100;
      m[i][j] = v;
      m[j][i] = v;
    }
  }
  return m;
}

describe('minWeightMatching', () => {
  it('handles N=2', () => {
    const m = minWeightMatching([
      [0, 5],
      [5, 0],
    ]);
    expect(m).toEqual([1, 0]);
  });

  it('handles N=4 exactly', () => {
    const costs = [
      [0, 10, 1, 5],
      [10, 0, 5, 1],
      [1, 5, 0, 10],
      [5, 1, 10, 0],
    ];
    const m = minWeightMatching(costs);
    // Optimal is (0,2)+(1,3) for cost 1+1=2, NOT (0,1)+(2,3)=20 or (0,3)+(1,2)=10.
    expect(matchingCost(costs, m)).toBe(2);
  });

  it('matches brute force on random small instances', () => {
    for (const n of [4, 6, 8, 10, 12]) {
      for (let seed = 1; seed <= 4; seed++) {
        const costs = symRandom(n, seed * 1000 + n);
        const m = minWeightMatching(costs);
        const got = matchingCost(costs, m);
        const want = bruteForceMin(costs);
        expect(got).toBeCloseTo(want, 6);
      }
    }
  });

  it('exact DP path covers up to N=22 (smoke test for N=14)', () => {
    const costs = symRandom(14, 42);
    const m = minWeightMatching(costs);
    const got = matchingCost(costs, m);
    const want = bruteForceMin(costs);
    expect(got).toBeCloseTo(want, 6);
  });

  it('valid output: each i is paired with exactly one partner', () => {
    const costs = symRandom(10, 7);
    const m = minWeightMatching(costs);
    expect(m.length).toBe(10);
    for (let i = 0; i < m.length; i++) {
      expect(m[m[i]]).toBe(i);
      expect(m[i]).not.toBe(i);
    }
  });
});
