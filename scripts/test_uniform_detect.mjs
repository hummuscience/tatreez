#!/usr/bin/env node
// Standalone diagnostic to test uniform-cell grid detection on a real image
// (won't run as part of the test suite, just a developer utility).

import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// Inline implementations so we don't import from .ts files

const TRANSPARENT_THRESHOLD = 128;
const QUANT_STEP = 64;

function loadPNG(path) {
  const buf = readFileSync(path);
  const png = PNG.sync.read(buf);
  return { data: png.data, width: png.width, height: png.height };
}

function alphaAt(img, x, y) {
  return img.data[(y * img.width + x) * 4 + 3];
}
function pixelAt(img, x, y) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
}
function rgbDist2(a, b) {
  const dr = a.r - b.r,
    dg = a.g - b.g,
    db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function autoCrop(img, threshold = 30) {
  const W = img.width,
    H = img.height;
  // Detect transparent corners
  const cornerAlphas = [
    alphaAt(img, 0, 0),
    alphaAt(img, W - 1, 0),
    alphaAt(img, 0, H - 1),
    alphaAt(img, W - 1, H - 1),
  ];
  const hasTransparent = cornerAlphas.some((a) => a < TRANSPARENT_THRESHOLD);

  const corners = [
    pixelAt(img, 0, 0),
    pixelAt(img, W - 1, 0),
    pixelAt(img, 0, H - 1),
    pixelAt(img, W - 1, H - 1),
  ];
  let bgIdx = 0,
    bestSum = Infinity;
  for (let i = 0; i < 4; i++) {
    let sum = 0;
    for (let j = 0; j < 4; j++) sum += rgbDist2(corners[i], corners[j]);
    if (sum < bestSum) {
      bestSum = sum;
      bgIdx = i;
    }
  }
  const bg = corners[bgIdx];
  const t2 = threshold * threshold;
  const isBgPx = (x, y) => {
    if (hasTransparent && alphaAt(img, x, y) < TRANSPARENT_THRESHOLD) return true;
    return rgbDist2(pixelAt(img, x, y), bg) <= t2;
  };
  const minNonBg = 4;
  const isBgRow = (y) => {
    let nonBg = 0;
    for (let x = 0; x < W; x++) {
      if (!isBgPx(x, y)) {
        nonBg++;
        if (nonBg >= minNonBg) return false;
      }
    }
    return true;
  };
  const isBgCol = (x, y0, y1) => {
    let nonBg = 0;
    for (let y = y0; y < y1; y++) {
      if (!isBgPx(x, y)) {
        nonBg++;
        if (nonBg >= minNonBg) return false;
      }
    }
    return true;
  };
  let top = 0;
  while (top < H - 1 && isBgRow(top)) top++;
  let bottom = H - 1;
  while (bottom > top && isBgRow(bottom)) bottom--;
  let left = 0;
  while (left < W - 1 && isBgCol(left, top, bottom + 1)) left++;
  let right = W - 1;
  while (right > left && isBgCol(right, top, bottom + 1)) right--;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

function quantKey(r, g, b) {
  return (
    (Math.round(r / QUANT_STEP) << 16) |
    (Math.round(g / QUANT_STEP) << 8) |
    Math.round(b / QUANT_STEP)
  );
}

function detectGridByUniformity(img, crop, opts = {}) {
  const minCells = opts.minCells ?? 4;
  const maxCells = opts.maxCells ?? 60;
  const uniformityThreshold = opts.uniformityThreshold ?? 0.85;
  const innerFraction = opts.innerFraction ?? 0.6;
  const W = crop.w,
    H = crop.h;
  const qmap = new Int32Array(W * H);
  for (let dy = 0; dy < H; dy++) {
    for (let dx = 0; dx < W; dx++) {
      const sx = crop.x + dx,
        sy = crop.y + dy;
      const a = alphaAt(img, sx, sy);
      if (a < TRANSPARENT_THRESHOLD) {
        qmap[dy * W + dx] = -1;
      } else {
        const p = pixelAt(img, sx, sy);
        qmap[dy * W + dx] = quantKey(p.r, p.g, p.b);
      }
    }
  }

  let best = null;
  for (let numCols = minCells; numCols <= maxCells; numCols++) {
    const cellW = W / numCols;
    const numRowsExact = H / cellW;
    const candidates = new Set();
    for (let dr = -1; dr <= 1; dr++) {
      const nr = Math.round(numRowsExact) + dr;
      if (nr >= minCells && nr <= maxCells) candidates.add(nr);
    }
    for (const numRows of candidates) {
      const cellH = H / numRows;
      if (cellW < 6 || cellH < 6) continue;

      let allUniform = true;
      let allTransparent = true;
      for (let cy = 0; cy < numRows && allUniform; cy++) {
        for (let cx = 0; cx < numCols && allUniform; cx++) {
          const x0 = Math.floor(cx * cellW);
          const x1 = Math.floor((cx + 1) * cellW);
          const y0 = Math.floor(cy * cellH);
          const y1 = Math.floor((cy + 1) * cellH);
          const innerW = x1 - x0,
            innerH = y1 - y0;
          const xa = x0 + Math.floor((innerW * (1 - innerFraction)) / 2);
          const xb = x1 - Math.floor((innerW * (1 - innerFraction)) / 2);
          const ya = y0 + Math.floor((innerH * (1 - innerFraction)) / 2);
          const yb = y1 - Math.floor((innerH * (1 - innerFraction)) / 2);
          const counts = new Map();
          let totalOpaque = 0;
          for (let y = ya; y < yb; y++) {
            for (let x = xa; x < xb; x++) {
              const q = qmap[y * W + x];
              if (q === -1) continue;
              counts.set(q, (counts.get(q) ?? 0) + 1);
              totalOpaque++;
            }
          }
          if (totalOpaque === 0) continue;
          allTransparent = false;
          let dominantCount = 0;
          for (const c of counts.values()) if (c > dominantCount) dominantCount = c;
          const uniformity = dominantCount / totalOpaque;
          if (uniformity < uniformityThreshold) {
            allUniform = false;
            break;
          }
        }
      }
      if (allUniform && !allTransparent) {
        best = { numCols, numRows, cellW, cellH };
        return best;
      }
    }
  }
  return best;
}

const path = process.argv[2] ?? '.test-images/13.png';
const img = loadPNG(path);
console.log(`Image: ${img.width} × ${img.height}`);
const crop = autoCrop(img);
console.log(`Crop: ${crop.w} × ${crop.h} at (${crop.x}, ${crop.y})`);
console.log('Threshold sweep:');
for (const t of [0.95, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5, 0.4]) {
  const result = detectGridByUniformity(img, crop, { uniformityThreshold: t });
  if (!result) {
    console.log(`  uniformity ≥ ${t}: no valid grid`);
  } else {
    console.log(
      `  uniformity ≥ ${t}: ${result.numCols} × ${result.numRows} (cell ${result.cellW.toFixed(1)} × ${result.cellH.toFixed(1)})`,
    );
  }
}
