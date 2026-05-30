import { describe, it, expect } from 'vitest';
import { patternStats } from './patternStats';
import type { Pattern } from '../engine/types';

const withPalette: Pattern = {
  name: 'T',
  width: 4,
  height: 3,
  cells: [
    [0, 1, 0, 0],
    [0, 1, 2, 0],
    [0, 0, 0, 0],
  ],
  palette: [
    null,
    { hex: '#D21D22', dmc: { number: '3801', name: 'Christmas Red LT' } },
    { hex: '#1B4D2E' },
  ],
};

describe('patternStats', () => {
  it('derives chart size, painted size, stitches, colors and DMC list', () => {
    const s = patternStats(withPalette);
    expect(s.chart).toEqual({ w: 4, h: 3 });
    expect(s.painted).toEqual({ w: 2, h: 2 }); // cols 1..2, rows 0..1
    expect(s.stitches).toBe(3);
    expect(s.colorCount).toBe(2);
    expect(s.colors.map((c) => c.hex)).toEqual(['#D21D22', '#1B4D2E']);
    expect(s.dmc).toEqual([{ number: '3801', name: 'Christmas Red LT' }]);
  });

  it('handles a pattern with no per-pattern palette by falling back', () => {
    const noPalette: Pattern = { name: 'X', width: 2, height: 2, cells: [[0, 1], [0, 0]] };
    const s = patternStats(noPalette);
    expect(s.chart).toEqual({ w: 2, h: 2 });
    expect(s.stitches).toBe(1);
    expect(s.colors.length).toBeGreaterThan(0); // fallback palette resolves a colour
  });
});
