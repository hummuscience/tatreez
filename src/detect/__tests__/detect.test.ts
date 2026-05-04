import { describe, it, expect } from 'vitest';
import { detectPatternFromImage, patternFromDetection } from '../index';
import { BUILTIN_PATTERNS } from '../../patterns/builtin';
import { renderPatternToImageData, makeSimplePattern } from './synthImage';
import type { ColorIndex } from '../../engine/types';

function expectPatternsMatch(
  a: { width: number; height: number; cells: ColorIndex[][] },
  b: { width: number; height: number; cells: ColorIndex[][] },
) {
  expect(b.width).toBe(a.width);
  expect(b.height).toBe(a.height);
  for (let y = 0; y < a.height; y++) {
    expect(b.cells[y]).toEqual(a.cells[y]);
  }
}

describe('detectPatternFromImage — synthetic charts', () => {
  it('recovers a simple 4×3 pattern at high resolution', () => {
    const p = makeSimplePattern(4, 3, [
      [1, 0, 1, 0],
      [0, 1, 0, 1],
      [1, 1, 0, 0],
    ]);
    const img = renderPatternToImageData(p, { cellPx: 30, borderPx: 24 });
    const det = detectPatternFromImage(img, { paletteSize: 2 });
    // Find which detected cluster is the red one (highest red component)
    const redCluster = det.clusters
      .map((c, i) => ({ i, score: c.centroid.r - c.centroid.g - c.centroid.b }))
      .sort((a, b) => b.score - a.score)[0].i;
    const map: ColorIndex[] = det.clusters.map((_, i) => (i === redCluster ? 1 : 0)) as ColorIndex[];
    const recovered = patternFromDetection(det, map);
    expectPatternsMatch(p, recovered);
  });

  it('recovers a 2-colour pattern with red and black', () => {
    const p = makeSimplePattern(5, 4, [
      [1, 0, 2, 0, 1],
      [0, 2, 1, 2, 0],
      [2, 1, 0, 1, 2],
      [1, 0, 2, 0, 1],
    ]);
    const img = renderPatternToImageData(p, { cellPx: 24, borderPx: 16 });
    const det = detectPatternFromImage(img, { paletteSize: 3 });

    // Identify clusters by colour: lightest = empty, reddest = red, darkest = black
    const c = det.clusters.map((cl, i) => ({
      i,
      lum: cl.centroid.r + cl.centroid.g + cl.centroid.b,
      red: cl.centroid.r - (cl.centroid.g + cl.centroid.b) / 2,
    }));
    const empty = c.slice().sort((a, b) => b.lum - a.lum)[0].i;
    const red = c.slice().sort((a, b) => b.red - a.red)[0].i;
    const black = c.find((x) => x.i !== empty && x.i !== red)!.i;
    const map: ColorIndex[] = [];
    map[empty] = 0;
    map[red] = 1;
    map[black] = 2;
    const recovered = patternFromDetection(det, map);
    expectPatternsMatch(p, recovered);
  });

  it('handles a wide aspect ratio pattern (Old Man\'s Teeth shape)', () => {
    const p = makeSimplePattern(10, 3, [
      [1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const img = renderPatternToImageData(p, { cellPx: 28, borderPx: 20 });
    const det = detectPatternFromImage(img, { paletteSize: 2 });
    const redCluster = det.clusters
      .map((c, i) => ({ i, score: c.centroid.r - c.centroid.g - c.centroid.b }))
      .sort((a, b) => b.score - a.score)[0].i;
    const map: ColorIndex[] = det.clusters.map((_, i) => (i === redCluster ? 1 : 0)) as ColorIndex[];
    const recovered = patternFromDetection(det, map);
    expectPatternsMatch(p, recovered);
  });

  it(`round-trips Coffee Bean (${BUILTIN_PATTERNS.coffeeBean.width}×${BUILTIN_PATTERNS.coffeeBean.height})`, () => {
    const p = BUILTIN_PATTERNS.coffeeBean;
    const img = renderPatternToImageData(p, { cellPx: 18, borderPx: 24 });
    const det = detectPatternFromImage(img, { paletteSize: 2 });
    const redCluster = det.clusters
      .map((c, i) => ({ i, score: c.centroid.r - c.centroid.g - c.centroid.b }))
      .sort((a, b) => b.score - a.score)[0].i;
    const map: ColorIndex[] = det.clusters.map((_, i) => (i === redCluster ? 1 : 0)) as ColorIndex[];
    const recovered = patternFromDetection(det, map);
    expectPatternsMatch(p, recovered);
  });

  it(`round-trips Najma (${BUILTIN_PATTERNS.moonOfBethlehem.width}×${BUILTIN_PATTERNS.moonOfBethlehem.height})`, () => {
    // Najma uses two distinct colours (red + pink). Detect 3 clusters
    // (empty + 2 inks), then map by lightness/redness to indices 0/1/2.
    const p = BUILTIN_PATTERNS.moonOfBethlehem;
    const img = renderPatternToImageData(p, { cellPx: 22, borderPx: 24 });
    const det = detectPatternFromImage(img, { paletteSize: 3 });
    const c = det.clusters.map((cl, i) => ({
      i,
      lum: cl.centroid.r + cl.centroid.g + cl.centroid.b,
      red: cl.centroid.r - (cl.centroid.g + cl.centroid.b) / 2,
    }));
    const empty = c.slice().sort((a, b) => b.lum - a.lum)[0].i;
    const red = c.slice().sort((a, b) => b.red - a.red).filter((x) => x.i !== empty)[0].i;
    const pink = c.find((x) => x.i !== empty && x.i !== red)!.i;
    const map: ColorIndex[] = [];
    map[empty] = 0;
    map[red] = 1;
    map[pink] = 2;
    const recovered = patternFromDetection(det, map);
    expectPatternsMatch(p, recovered);
  });
});
