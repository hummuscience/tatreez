import type { CropBox, GridLines } from './types';
import { luminance, pixelAt } from './imageData';

/**
 * Compute row and column "edge energy" projections. We measure how much
 * the luminance changes across each row/column boundary, summed perpendicular
 * to that direction. Gridlines produce horizontal/vertical edges and so
 * spike in the corresponding projection.
 *
 * For vertical gridlines (xEdges[x]): sum over y of |L(x,y) - L(x-1,y)|.
 * For horizontal gridlines (yEdges[y]): sum over x of |L(x,y) - L(x,y-1)|.
 */
function edgeProjections(
  img: ImageData,
  crop: CropBox,
): { xEdges: Float64Array; yEdges: Float64Array } {
  const xEdges = new Float64Array(crop.w);
  const yEdges = new Float64Array(crop.h);
  for (let dy = 0; dy < crop.h; dy++) {
    let prev = luminance(pixelAt(img, crop.x, crop.y + dy));
    for (let dx = 1; dx < crop.w; dx++) {
      const cur = luminance(pixelAt(img, crop.x + dx, crop.y + dy));
      xEdges[dx] += Math.abs(cur - prev);
      prev = cur;
    }
  }
  for (let dx = 0; dx < crop.w; dx++) {
    let prev = luminance(pixelAt(img, crop.x + dx, crop.y));
    for (let dy = 1; dy < crop.h; dy++) {
      const cur = luminance(pixelAt(img, crop.x + dx, crop.y + dy));
      yEdges[dy] += Math.abs(cur - prev);
      prev = cur;
    }
  }
  return { xEdges, yEdges };
}

/**
 * 1-D smoothing with a 3-tap box filter, repeated `n` times.
 */
function smooth(s: Float64Array, passes = 1): Float64Array {
  let cur = s;
  for (let p = 0; p < passes; p++) {
    const out = new Float64Array(cur.length);
    for (let i = 0; i < cur.length; i++) {
      let sum = 0;
      let n = 0;
      for (let k = -1; k <= 1; k++) {
        const j = i + k;
        if (j >= 0 && j < cur.length) {
          sum += cur[j];
          n++;
        }
      }
      out[i] = sum / n;
    }
    cur = out;
  }
  return cur;
}

/**
 * Locate peaks in a 1-D signal. A peak must exceed `fraction · max(signal)`
 * AND be a local maximum. Adjacent samples within `minSpacing` are merged
 * (only the strongest is kept).
 */
function findPeaks(signal: Float64Array, fraction = 0.4, minSpacing = 3): number[] {
  const n = signal.length;
  if (n < 3) return [];
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (signal[i] > max) max = signal[i];
  if (max <= 0) return [];
  const threshold = max * fraction;

  // Find local maxima above threshold
  const candidates: { i: number; v: number }[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (signal[i] >= threshold && signal[i] >= signal[i - 1] && signal[i] >= signal[i + 1]) {
      candidates.push({ i, v: signal[i] });
    }
  }
  // Also consider edges if they're above threshold
  if (signal[0] >= threshold && (n < 2 || signal[0] >= signal[1])) {
    candidates.unshift({ i: 0, v: signal[0] });
  }
  if (signal[n - 1] >= threshold && (n < 2 || signal[n - 1] >= signal[n - 2])) {
    candidates.push({ i: n - 1, v: signal[n - 1] });
  }

  // Greedy non-max suppression by descending value
  candidates.sort((a, b) => b.v - a.v);
  const taken: boolean[] = new Array(n).fill(false);
  const kept: number[] = [];
  for (const c of candidates) {
    let collide = false;
    for (let d = -minSpacing + 1; d < minSpacing; d++) {
      const j = c.i + d;
      if (j >= 0 && j < n && taken[j]) {
        collide = true;
        break;
      }
    }
    if (!collide) {
      kept.push(c.i);
      taken[c.i] = true;
    }
  }
  kept.sort((a, b) => a - b);
  return kept;
}

/**
 * Given peak positions, regularise to evenly-spaced gridlines.
 *
 * Approach:
 *  1) Use the median inter-peak gap as the cell period.
 *  2) Find the longest "consistent run" of peaks: one where every gap
 *     is a near-integer multiple of the period (within tolerance).
 *     Gaps of 1·period or 2·period both count — that handles a missed
 *     gridline. Spurious peaks with off-period gaps break the run.
 *  3) Output evenly-spaced lines from the first to the last peak in the
 *     run.
 */
function regularizeGrid(peaks: number[], _length: number): number[] {
  if (peaks.length < 2) return peaks.slice();
  const gaps: number[] = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
  const sorted = gaps.slice().sort((a, b) => a - b);
  const period = sorted[Math.floor(sorted.length / 2)];
  if (period < 2) return peaks.slice();

  const isMultipleOfPeriod = (g: number): boolean => {
    const k = Math.round(g / period);
    if (k < 1 || k > 4) return false;
    return Math.abs(g - k * period) <= Math.max(2, period * 0.25);
  };

  let bestStart = 0;
  let bestLen = 1;
  let curStart = 0;
  let curLen = 1;
  for (let i = 1; i < peaks.length; i++) {
    const g = peaks[i] - peaks[i - 1];
    if (isMultipleOfPeriod(g)) {
      curLen++;
    } else {
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
      curStart = i;
      curLen = 1;
    }
  }
  if (curLen > bestLen) {
    bestLen = curLen;
    bestStart = curStart;
  }

  const first = peaks[bestStart];
  const last = peaks[bestStart + bestLen - 1];

  const lines: number[] = [];
  for (let p = first; p <= last + period / 2; p += period) lines.push(p);
  return lines;
}

export function detectGridlines(
  img: ImageData,
  crop: CropBox,
  opts: { peakFraction?: number; minSpacing?: number } = {},
): GridLines {
  const { xEdges, yEdges } = edgeProjections(img, crop);
  const xs0 = smooth(xEdges, 1);
  const ys0 = smooth(yEdges, 1);

  const fraction = opts.peakFraction ?? 0.4;
  const minSp = opts.minSpacing ?? 4;
  const xPeaks = findPeaks(xs0, fraction, minSp);
  const yPeaks = findPeaks(ys0, fraction, minSp);

  const xs = regularizeGrid(xPeaks, crop.w);
  const ys = regularizeGrid(yPeaks, crop.h);

  return { xs, ys };
}
