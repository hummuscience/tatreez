import type { CellSamples, ColorCluster, RGB } from './types';
import { avgRgb, rgbDist2, TRANSPARENT_THRESHOLD } from './imageData';

/**
 * Cluster the cell colours into K clusters using k-means with k-means++
 * initialisation and a fixed seed PRNG so results are deterministic.
 *
 * Cells whose average alpha is below TRANSPARENT_THRESHOLD are treated
 * as transparent. They form their OWN synthetic cluster (centroid = a
 * sentinel transparent colour) and don't participate in k-means. This
 * means k counts only the *visible* colours: paletteSize=3 for a chart
 * with red, black, and transparent background gives you 3 clusters
 * (red, black, transparent) — not 2 visible colours fighting for 3
 * slots.
 *
 * Returns the cluster centroids and the cluster assignment for each
 * cell. Clusters are sorted with the transparent cluster (if present)
 * always at index 0, then remaining clusters by descending luminance.
 */
export function clusterColors(
  samples: CellSamples,
  k: number,
  iterations = 12,
): { clusters: ColorCluster[]; assignments: number[][] } {
  const N = samples.width * samples.height;
  if (N === 0 || k < 1) {
    return { clusters: [], assignments: samples.cells.map((row) => row.map(() => 0)) };
  }

  // Build flat list of (cell, isTransparent) pairs preserving index order.
  type Entry = { rgb: RGB; alpha: number; transparent: boolean };
  const flat: Entry[] = [];
  for (let y = 0; y < samples.height; y++) {
    for (let x = 0; x < samples.width; x++) {
      const alpha = samples.cellAlpha[y][x];
      flat.push({
        rgb: samples.cells[y][x],
        alpha,
        transparent: alpha < TRANSPARENT_THRESHOLD,
      });
    }
  }

  const opaqueIdx: number[] = [];
  for (let i = 0; i < flat.length; i++) if (!flat[i].transparent) opaqueIdx.push(i);
  const opaqueRGBs: RGB[] = opaqueIdx.map((i) => flat[i].rgb);

  // Assignments per cell, indexed into the FINAL cluster list.
  // We'll build the cluster list as: [transparent (if any)]  + opaque clusters.
  const transparentCount = flat.length - opaqueIdx.length;
  const hasTransparent = transparentCount > 0;
  const transparentClusterIdx = hasTransparent ? 0 : -1;

  // Run k-means only on opaque cells.
  let opaqueClusters: { centroid: RGB; count: number }[] = [];
  let opaqueAssignments: number[] = [];

  if (opaqueRGBs.length > 0 && k > 0) {
    const K = Math.min(k, opaqueRGBs.length);
    const rand = mulberry32(0xc0ffee);
    const centroids: RGB[] = [];
    centroids.push(opaqueRGBs[Math.floor(rand() * opaqueRGBs.length)]);
    while (centroids.length < K) {
      const dists = opaqueRGBs.map((p) =>
        Math.min(...centroids.map((c) => rgbDist2(p, c))),
      );
      const sum = dists.reduce((a, b) => a + b, 0);
      if (sum === 0) {
        centroids.push(opaqueRGBs[Math.floor(rand() * opaqueRGBs.length)]);
        continue;
      }
      let r = rand() * sum;
      let pick = 0;
      for (let i = 0; i < dists.length; i++) {
        r -= dists[i];
        if (r <= 0) {
          pick = i;
          break;
        }
      }
      centroids.push(opaqueRGBs[pick]);
    }

    opaqueAssignments = opaqueRGBs.map(() => 0);
    for (let iter = 0; iter < iterations; iter++) {
      let changed = false;
      for (let i = 0; i < opaqueRGBs.length; i++) {
        let best = 0;
        let bestD = Infinity;
        for (let c = 0; c < K; c++) {
          const d = rgbDist2(opaqueRGBs[i], centroids[c]);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (opaqueAssignments[i] !== best) {
          opaqueAssignments[i] = best;
          changed = true;
        }
      }
      if (!changed && iter > 0) break;
      for (let c = 0; c < K; c++) {
        const members: RGB[] = [];
        for (let i = 0; i < opaqueRGBs.length; i++) {
          if (opaqueAssignments[i] === c) members.push(opaqueRGBs[i]);
        }
        if (members.length > 0) centroids[c] = avgRgb(members);
      }
    }

    opaqueClusters = centroids.map((centroid, i) => ({
      centroid,
      count: opaqueAssignments.filter((a) => a === i).length,
    }));
    // Sort opaque clusters by descending luminance for stable order
    const sortedIdx = opaqueClusters
      .map((_, i) => i)
      .sort((a, b) => {
        const la = opaqueClusters[a].centroid.r +
          opaqueClusters[a].centroid.g +
          opaqueClusters[a].centroid.b;
        const lb = opaqueClusters[b].centroid.r +
          opaqueClusters[b].centroid.g +
          opaqueClusters[b].centroid.b;
        return lb - la;
      });
    const remap = new Map<number, number>();
    sortedIdx.forEach((oldIdx, newIdx) => remap.set(oldIdx, newIdx));
    opaqueAssignments = opaqueAssignments.map((a) => remap.get(a) ?? 0);
    opaqueClusters = sortedIdx.map((oi) => opaqueClusters[oi]);
  }

  // Build final cluster list: transparent (if any), then opaque clusters.
  const finalClusters: ColorCluster[] = [];
  if (hasTransparent) {
    finalClusters.push({
      centroid: { r: 255, g: 255, b: 255 }, // sentinel: render as white
      count: transparentCount,
      transparent: true,
    });
  }
  for (const c of opaqueClusters) finalClusters.push(c);

  // Build per-cell assignment grid
  const grid: number[][] = [];
  let opaqueCursor = 0;
  for (let y = 0; y < samples.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < samples.width; x++) {
      const cellIdx = y * samples.width + x;
      const e = flat[cellIdx];
      if (e.transparent) {
        row.push(transparentClusterIdx >= 0 ? transparentClusterIdx : 0);
      } else {
        const opaqueAssign = opaqueAssignments[opaqueCursor++] ?? 0;
        row.push(hasTransparent ? opaqueAssign + 1 : opaqueAssign);
      }
    }
    grid.push(row);
  }

  return { clusters: finalClusters, assignments: grid };
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
