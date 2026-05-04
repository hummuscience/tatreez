import { describe, it, expect } from 'vitest';
import { BUILTIN_PATTERNS } from '../../patterns/builtin';
import { planAsPrimitives } from '../primitives';

describe('planAsPrimitives — coverage', () => {
  for (const [id, pattern] of Object.entries(BUILTIN_PATTERNS)) {
    it(`covers every painted leg of ${id} exactly once`, () => {
      const plan = planAsPrimitives(pattern);
      const expected = new Set<string>();
      for (let y = 0; y < pattern.height; y++) {
        for (let x = 0; x < pattern.width; x++) {
          if (pattern.cells[y][x] !== 0) {
            expected.add(`${x},${y}:/`);
            expected.add(`${x},${y}:\\`);
          }
        }
      }
      const got = new Map<string, number>();
      for (const s of plan.steps) {
        if (s.kind === 'front' && s.cell && s.leg) {
          const k = `${s.cell[0]},${s.cell[1]}:${s.leg}`;
          got.set(k, (got.get(k) ?? 0) + 1);
        }
      }
      expect(got.size).toBe(expected.size);
      for (const e of expected) expect(got.has(e)).toBe(true);
      for (const [k, n] of got) expect(n, `${k} emitted ${n} times`).toBe(1);
    });
  }

  it('produces zero diagonal back-travel by construction', () => {
    for (const pattern of Object.values(BUILTIN_PATTERNS)) {
      const plan = planAsPrimitives(pattern);
      for (const s of plan.steps) {
        if (s.kind === 'back' && s.from) {
          const dx = s.to[0] - s.from[0];
          const dy = s.to[1] - s.from[1];
          expect(dx === 0 || dy === 0, `${pattern.name}: diag back ${s.from}→${s.to}`).toBe(true);
        }
      }
    }
  });

  it('does not span colours within a thread', () => {
    for (const pattern of Object.values(BUILTIN_PATTERNS)) {
      const plan = planAsPrimitives(pattern);
      let curColor: number | null = null;
      for (const s of plan.steps) {
        if (s.kind === 'start') {
          curColor = null;
          continue;
        }
        if (s.kind === 'front' && s.cell) {
          const [cx, cy] = s.cell;
          const c = pattern.cells[cy][cx];
          if (curColor === null) curColor = c;
          else expect(c, `${pattern.name}: thread spans colours`).toBe(curColor);
        }
      }
    }
  });
});
