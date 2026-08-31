import { describe, expect, it } from 'vitest';
import { placeMotifBar } from './motifBar';

const BAR = { w: 200, h: 40 };
const VIEW = { w: 800, h: 600 };

describe('placeMotifBar', () => {
  it('sits above the box, horizontally centred, when there is room', () => {
    const r = placeMotifBar({ x: 300, y: 200, w: 100, h: 100 }, BAR, VIEW);
    expect(r.placement).toBe('above');
    // 200 (box.y) - 40 (bar.h) - 8 (gap) = 152
    expect(r.top).toBe(152);
    // centre 350 - 100 (half bar) = 250
    expect(r.left).toBe(250);
  });

  it('flips below when the box is too close to the top edge', () => {
    const r = placeMotifBar({ x: 300, y: 10, w: 100, h: 100 }, BAR, VIEW);
    expect(r.placement).toBe('below');
    // 10 + 100 + 8 = 118
    expect(r.top).toBe(118);
  });

  it('pins to the top when neither above nor below fits', () => {
    // A box taller than the viewport: above clips (<0) and below clips (>view.h).
    const r = placeMotifBar({ x: 300, y: 0, w: 100, h: 900 }, BAR, VIEW);
    expect(r.placement).toBe('above');
    expect(r.top).toBe(0);
  });

  it('clamps at the left edge', () => {
    const r = placeMotifBar({ x: 0, y: 200, w: 20, h: 100 }, BAR, VIEW);
    expect(r.left).toBe(0);
  });

  it('clamps at the right edge', () => {
    const r = placeMotifBar({ x: 780, y: 200, w: 20, h: 100 }, BAR, VIEW);
    // 800 - 200 = 600
    expect(r.left).toBe(600);
  });

  it('never returns a negative left when the bar is wider than the viewport', () => {
    const r = placeMotifBar({ x: 10, y: 200, w: 20, h: 100 }, { w: 900, h: 40 }, VIEW);
    expect(r.left).toBe(0);
  });

  it('honours a custom gap', () => {
    const r = placeMotifBar({ x: 300, y: 200, w: 100, h: 100 }, BAR, VIEW, 20);
    expect(r.top).toBe(140);
  });
});
