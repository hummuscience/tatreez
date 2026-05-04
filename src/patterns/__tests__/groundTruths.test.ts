import { describe, it, expect } from 'vitest';
import { getCanonicalGroundTruth, hasCanonicalGroundTruth } from '../groundTruths';
import { BUILTIN_PATTERNS } from '../builtin';
import { extractRegions } from '../../engine/regions';
import { scorePlan } from '../../engine/scoring';
import type { ColorIndex } from '../../engine/types';

describe('canonical ground truths', () => {
  it('Old Man\'s Teeth has a canonical GT', () => {
    expect(hasCanonicalGroundTruth('oldMansTeeth')).toBe(true);
  });

  it("Old Man's Teeth GT covers every leg of every painted cell exactly once", () => {
    const gt = getCanonicalGroundTruth('oldMansTeeth')!;
    const pattern = BUILTIN_PATTERNS.oldMansTeeth;
    const expected = new Set<string>();
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        if (pattern.cells[y][x] > 0) {
          expected.add(`${x},${y}:/`);
          expected.add(`${x},${y}:\\`);
        }
      }
    }
    const got = new Set<string>();
    for (const s of gt.steps) {
      if (s.kind === 'front' && s.cell && s.leg) {
        const key = `${s.cell[0]},${s.cell[1]}:${s.leg}`;
        expect(got.has(key)).toBe(false);
        got.add(key);
      }
    }
    expect(got.size).toBe(expected.size);
    for (const e of expected) expect(got.has(e)).toBe(true);
  });

  it("Old Man's Teeth GT has zero diagonal back-travel", () => {
    const gt = getCanonicalGroundTruth('oldMansTeeth')!;
    const score = scorePlan(gt.steps);
    expect(score.diag).toBe(0);
  });

  it("Old Man's Teeth GT has only 1 thread start (single thread)", () => {
    const gt = getCanonicalGroundTruth('oldMansTeeth')!;
    const score = scorePlan(gt.steps);
    expect(score.starts).toBe(1);
  });

  it('Coffee Bean has a canonical GT', () => {
    expect(hasCanonicalGroundTruth('coffeeBean')).toBe(true);
  });

  it('Coffee Bean GT has near-zero diagonal back-travel (clean back of work)', () => {
    // The recorded technique uses primarily axis back-travel between
    // primitives; a small amount of diagonal travel (≤ a few cells of
    // sqrt(2) per cluster) is acceptable for the bean's diagonal slices.
    const gt = getCanonicalGroundTruth('coffeeBean')!;
    const score = scorePlan(gt.steps);
    expect(score.diag).toBeLessThan(20);
  });

  it('Coffee Bean GT uses 1 stem thread + 2 threads per cluster', () => {
    // Chart 689 has 5 vertically-stacked bean clusters; PDF prescribes
    // a fresh thread for each cluster's right side and "Repeat (Flipped)"
    // for the left. Total = 1 stem + 5 × 2 = 11 threads.
    const gt = getCanonicalGroundTruth('coffeeBean')!;
    const score = scorePlan(gt.steps);
    expect(score.starts).toBe(11);
  });

  it('Coffee Bean GT covers every painted leg exactly once', () => {
    const gt = getCanonicalGroundTruth('coffeeBean')!;
    const pattern = BUILTIN_PATTERNS.coffeeBean;
    const got = new Map<string, number>();
    let expectedLegs = 0;
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        if (pattern.cells[y][x] !== 0) expectedLegs += 2;
      }
    }
    for (const s of gt.steps) {
      if (s.kind === 'front' && s.cell && s.leg) {
        const k = `${s.cell[0]},${s.cell[1]}:${s.leg}`;
        got.set(k, (got.get(k) ?? 0) + 1);
      }
    }
    // No duplicates
    for (const [k, n] of got) expect(n, `${k} emitted ${n} times`).toBe(1);
    expect(got.size).toBe(expectedLegs);
  });

  it('GT covers all painted cells across all built-in patterns that have one encoded', () => {
    for (const id of Object.keys(BUILTIN_PATTERNS)) {
      if (!hasCanonicalGroundTruth(id)) continue;
      const gt = getCanonicalGroundTruth(id)!;
      const pattern = BUILTIN_PATTERNS[id];
      const regions = extractRegions(pattern);
      const expectedLegs = new Set<string>();
      for (const r of regions) {
        for (const [x, y] of r.cells) {
          expectedLegs.add(`${x},${y}:/`);
          expectedLegs.add(`${x},${y}:\\`);
        }
      }
      const got = new Set<string>();
      for (const s of gt.steps) {
        if (s.kind === 'front' && s.cell && s.leg) {
          got.add(`${s.cell[0]},${s.cell[1]}:${s.leg}`);
        }
      }
      expect(got.size, `${id}: leg count`).toBe(expectedLegs.size);
      for (const leg of expectedLegs) {
        expect(got.has(leg), `${id}: missing ${leg}`).toBe(true);
      }
    }
  });
});

// Sanity: confirm the OMT pattern itself has the corrected shape
describe('built-in pattern shapes', () => {
  it("Old Man's Teeth has tooth row + solid row + empty row", () => {
    const p = BUILTIN_PATTERNS.oldMansTeeth;
    expect(p.width).toBe(10);
    expect(p.height).toBe(3);
    // Row 0: every-other-cell teeth pattern starting filled
    expect(p.cells[0]).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 0] as ColorIndex[]);
    expect(p.cells[1]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1] as ColorIndex[]);
    expect(p.cells[2]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as ColorIndex[]);
  });
});
