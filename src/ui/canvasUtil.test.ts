import { describe, expect, it } from 'vitest';
import { drawGridLines } from './canvasUtil';

function recordingCtx() {
  const calls: { style: string; width: number }[] = [];
  const stub = {
    strokeStyle: '#000',
    lineWidth: 1,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() { calls.push({ style: String(stub.strokeStyle), width: stub.lineWidth }); },
  };
  const ctx = stub as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('drawGridLines major option', () => {
  it('draws every 10th line with the major style/width', () => {
    const { ctx, calls } = recordingCtx();
    // 20x1 grid → vertical lines at i=0..20, horizontal at j=0..1.
    drawGridLines(ctx, 4, 20, 1, 'rgba(0,0,0,0.06)', {
      major: 10, majorColor: 'rgba(0,0,0,0.22)', majorWidth: 2,
    });
    const major = calls.filter((c) => c.style === 'rgba(0,0,0,0.22)');
    // Vertical majors at i=0,10,20 (3) + horizontal majors at j=0 (1) = 4.
    expect(major.length).toBe(4);
    for (const c of major) expect(c.width).toBe(2);
    // Minor lines use the base style at width 1.
    const minor = calls.filter((c) => c.style === 'rgba(0,0,0,0.06)');
    expect(minor.every((c) => c.width === 1)).toBe(true);
  });

  it('without options behaves like the old single-style grid', () => {
    const { ctx, calls } = recordingCtx();
    drawGridLines(ctx, 4, 2, 2, '#abc');
    expect(calls.length).toBe((2 + 1) + (2 + 1)); // 6 lines
    expect(calls.every((c) => c.style === '#abc' && c.width === 1)).toBe(true);
  });
});
