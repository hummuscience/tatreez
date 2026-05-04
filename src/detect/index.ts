import type { ColorIndex, Pattern } from '../engine/types';
import type { DetectionResult } from './types';
import { autoCrop } from './crop';
import { detectGridlines } from './gridDetect';
import { gridFromBlockDetection } from './blockDetect';
import { gridFromUniformDetection } from './uniformCellDetect';
import { sampleCells } from './sample';
import { clusterColors } from './kmeans';

export * from './types';
export { autoCrop } from './crop';
export { detectGridlines } from './gridDetect';
export { gridFromBlockDetection, detectCellSizeFromBlocks } from './blockDetect';
export { gridFromUniformDetection, detectGridByUniformity } from './uniformCellDetect';
export { sampleCells } from './sample';
export { clusterColors } from './kmeans';

import type { CropBox } from './types';

export type DetectionMode = 'auto' | 'gridlines' | 'blocks' | 'manual';

export interface DetectOptions {
  paletteSize?: number; // default 3 (empty + 2 colours)
  bgThreshold?: number;
  peakFraction?: number;
  minSpacing?: number;
  /** If provided, skip autoCrop and use this region instead. */
  cropOverride?: CropBox;
  /**
   * Force the grid dimensions instead of detecting them. Useful for
   * borderless pixel-art images that have no gridlines for the
   * detector to lock onto. Both must be set together.
   */
  gridSize?: { width: number; height: number };
  /**
   * How to detect the grid:
   *  - 'auto' (default): try gridlines first, fall back to blocks if it
   *    finds nothing reasonable.
   *  - 'gridlines': edge-projection peak finding. Best for charts with
   *    drawn gridlines (e.g. PDF charts).
   *  - 'blocks': connected-component analysis to find cell sizes from
   *    monochrome rectangles. Best for borderless pixel art.
   *  - 'manual': use `gridSize` (must be provided).
   */
  detectionMode?: DetectionMode;
}

export function detectPatternFromImage(img: ImageData, opts: DetectOptions = {}): DetectionResult {
  const paletteSize = opts.paletteSize ?? 3;
  const crop = opts.cropOverride ?? autoCrop(img, opts.bgThreshold ?? 30);

  const mode: DetectionMode = opts.detectionMode ?? 'auto';
  let gridlines;

  // Manual override always wins
  if (opts.gridSize && opts.gridSize.width > 0 && opts.gridSize.height > 0) {
    gridlines = makeUniformGrid(crop, opts.gridSize.width, opts.gridSize.height);
  } else if (mode === 'manual') {
    // Manual mode without gridSize is a no-op; fall through to gridlines.
    gridlines = detectGridlines(img, crop, {
      peakFraction: opts.peakFraction,
      minSpacing: opts.minSpacing,
    });
  } else if (mode === 'blocks') {
    // Try uniform-cell detection first (most reliable for borderless
    // pixel art); fall back to block-dimension heuristic, then to
    // gridlines if both fail.
    gridlines =
      gridFromUniformDetection(img, crop) ??
      gridFromBlockDetection(img, crop) ??
      detectGridlines(img, crop);
  } else if (mode === 'gridlines') {
    gridlines = detectGridlines(img, crop, {
      peakFraction: opts.peakFraction,
      minSpacing: opts.minSpacing,
    });
  } else {
    // auto: detect whether the image is borderless pixel art (has
    // transparency or sparse mostly-uniform colours) and use uniform-
    // cell detection if so; otherwise use gridline detection (best for
    // PDF-style charts with explicit gridlines).
    const W = img.width,
      H = img.height;
    const cornerAlphas = [
      img.data[3], // top-left alpha
      img.data[(W - 1) * 4 + 3], // top-right
      img.data[((H - 1) * W) * 4 + 3], // bottom-left
      img.data[((H - 1) * W + W - 1) * 4 + 3], // bottom-right
    ];
    const hasTransparentCorner = cornerAlphas.some((a) => a < 128);

    if (hasTransparentCorner) {
      // Borderless pixel art: prefer uniform-cell, fall back to others.
      gridlines =
        gridFromUniformDetection(img, crop) ??
        gridFromBlockDetection(img, crop) ??
        detectGridlines(img, crop);
    } else {
      // Try gridlines first; fall back to uniform if it returns garbage.
      const fromGrid = detectGridlines(img, crop, {
        peakFraction: opts.peakFraction,
        minSpacing: opts.minSpacing,
      });
      const numCols = fromGrid.xs.length - 1;
      const numRows = fromGrid.ys.length - 1;
      if (numCols < 3 || numRows < 3 || numCols > 80 || numRows > 80) {
        gridlines =
          gridFromUniformDetection(img, crop) ??
          gridFromBlockDetection(img, crop) ??
          fromGrid;
      } else {
        gridlines = fromGrid;
      }
    }
  }

  const samples = sampleCells(img, crop, gridlines);
  const { clusters, assignments } = clusterColors(samples, paletteSize);
  return { crop, gridlines, samples, clusters, assignments };
}

function makeUniformGrid(crop: CropBox, w: number, h: number) {
  const xs: number[] = [];
  const ys: number[] = [];
  const cw = crop.w / w;
  const ch = crop.h / h;
  for (let i = 0; i <= w; i++) xs.push(Math.round(i * cw));
  for (let i = 0; i <= h; i++) ys.push(Math.round(i * ch));
  return { xs, ys };
}

/**
 * Build a Pattern from a detection result, given a mapping from
 * detected cluster indices to palette indices in the engine.
 *
 * Legacy mode: paletteMap[i] = engine palette index (0/1/2/...) to
 * assign to cells detected as cluster i. The pattern's `palette` field
 * is left unset, so the engine global PALETTE will be used.
 */
export function patternFromDetection(
  detection: DetectionResult,
  paletteMap: ColorIndex[],
  name = 'Imported pattern',
): Pattern {
  const { samples, assignments } = detection;
  const cells: ColorIndex[][] = [];
  for (let y = 0; y < samples.height; y++) {
    const row: ColorIndex[] = [];
    for (let x = 0; x < samples.width; x++) {
      const cluster = assignments[y][x];
      row.push(paletteMap[cluster] ?? 0);
    }
    cells.push(row);
  }
  return { name, width: samples.width, height: samples.height, cells };
}

/**
 * Build a Pattern from a detection result using the detected cluster
 * RGB centroids AS the pattern's colours. The user only chooses which
 * cluster represents "empty" (the chart background). Every other
 * cluster becomes its own palette entry with the actual detected RGB.
 *
 * Stores a per-pattern `palette` on the result so the colours travel
 * with the pattern (not relying on the global engine PALETTE).
 *
 * @param emptyCluster Index of the cluster that should be treated as
 *   empty/background. If undefined, the lightest cluster is chosen
 *   automatically.
 */
export function patternFromDetectionAuto(
  detection: DetectionResult,
  emptyCluster: number | undefined,
  name = 'Imported pattern',
): Pattern {
  const { samples, assignments, clusters } = detection;

  // Choose empty cluster: explicit, or lightest by sum of RGB
  let chosenEmpty = emptyCluster;
  if (chosenEmpty === undefined && clusters.length > 0) {
    let bestI = 0;
    let bestSum = -1;
    clusters.forEach((c, i) => {
      const sum = c.centroid.r + c.centroid.g + c.centroid.b;
      if (sum > bestSum) {
        bestSum = sum;
        bestI = i;
      }
    });
    chosenEmpty = bestI;
  }

  // Map each cluster index to a new palette index. Empty cluster → 0,
  // all others → 1, 2, 3, ... in cluster-index order so the palette
  // is stable.
  const clusterToPaletteIdx = new Map<number, number>();
  let next = 1;
  for (let i = 0; i < clusters.length; i++) {
    if (i === chosenEmpty) {
      clusterToPaletteIdx.set(i, 0);
    } else {
      clusterToPaletteIdx.set(i, next++);
    }
  }

  // Build the per-pattern palette: index 0 = null (empty), then the
  // detected RGB centroids in palette-index order.
  const palette: (string | null)[] = [null];
  for (let i = 0; i < clusters.length; i++) {
    if (i === chosenEmpty) continue;
    const c = clusters[i].centroid;
    const hex =
      '#' +
      [c.r, c.g, c.b]
        .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
        .join('');
    palette.push(hex);
  }

  // Translate cell assignments
  const cells: ColorIndex[][] = [];
  for (let y = 0; y < samples.height; y++) {
    const row: ColorIndex[] = [];
    for (let x = 0; x < samples.width; x++) {
      const cluster = assignments[y][x];
      row.push((clusterToPaletteIdx.get(cluster) ?? 0) as ColorIndex);
    }
    cells.push(row);
  }
  return { name, width: samples.width, height: samples.height, cells, palette };
}
