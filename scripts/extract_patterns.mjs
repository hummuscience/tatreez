#!/usr/bin/env node
/**
 * Extract pattern grids from rasterised PDF chart images.
 *
 * Approach:
 *  - We pre-crop each PDF page to just the chart card area (bypassing the
 *    spurious-peak issue we'd hit with the auto-crop on a full PDF page).
 *  - Then run the same detection module the UI uses, with optional manual
 *    overrides for grid dimensions when detection is off-by-a-row.
 *  - Print the resulting cells array as a TypeScript snippet to stdout.
 *
 * Usage: node scripts/extract_patterns.mjs <pattern-name>
 *   patterns: coffee_bean | cypress_tree | moon_of_bethlehem | old_mans_teeth | all
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PDF_DIR = path.join(ROOT, 'handoff/reference_pdfs');
const TMP_DIR = path.join(ROOT, '.test-images');

// Pattern config: which PDF page has the full chart, and the crop region
// in image pixel coords (at 200 DPI). The crop should hug the chart card
// content so detection doesn't have to deal with surrounding text/figures.
const CONFIGS = {
  coffee_bean: {
    pdf: 'Coffee_Bean_Step-by-step.pdf',
    page: 8,
    dpi: 200,
    // Bottom-left chart on page 8 (the "complete pattern" preview).
    // Crop coords are tuned to enclose the chart's interior grid only,
    // excluding the mauve rounded-rect border.
    crop: { x: 480, y: 1280, w: 420, h: 620 },
    paletteSize: 2,
    expected: { w: 17, h: 26 },
  },
  cypress_tree: {
    pdf: 'Cypress_Tree_Steps.pdf',
    page: 2,
    dpi: 200,
    // "Sarw" preview chart at top of page 2 — interior grid only
    crop: { x: 720, y: 515, w: 270, h: 580 },
    paletteSize: 3,
    expected: { w: 9, h: 26 },
  },
  moon_of_bethlehem: {
    pdf: 'Moon_of_Bethlehem_Steps.pdf',
    page: 2,
    dpi: 200,
    // The 'Front' preview at top-right of the page header
    // (will measure precisely)
    crop: { x: 980, y: 290, w: 290, h: 290 },
    paletteSize: 2,
    expected: { w: 11, h: 11 },
  },
  old_mans_teeth: {
    pdf: 'Old_Man_s_Teeth_Steps.pdf',
    page: 2,
    dpi: 200,
    // Schematic chart at top-left of page (interior grid only)
    crop: { x: 360, y: 295, w: 320, h: 165 },
    paletteSize: 2,
    expected: { w: 10, h: 3 },
  },
};

function rasterise(pdfPath, page, dpi) {
  const baseName = path.basename(pdfPath, '.pdf');
  const outPrefix = path.join(TMP_DIR, `extract_${baseName}_p${page}_${dpi}`);
  execSync(
    `pdftoppm -png -r ${dpi} -f ${page} -l ${page} "${pdfPath}" "${outPrefix}"`,
    { stdio: 'inherit' },
  );
  const padding = String(page).padStart(page < 10 ? 1 : 2, '0');
  // pdftoppm uses 1-padded for <10 pages, 2-padded for 10-99
  const candidates = [`${outPrefix}-${page}.png`, `${outPrefix}-0${page}.png`, `${outPrefix}-${padding}.png`];
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* ignore */
    }
  }
  throw new Error(`Could not find rasterised page output near ${outPrefix}`);
}

function loadPng(filePath) {
  const buf = readFileSync(filePath);
  return PNG.sync.read(buf);
}

function cropImage(img, region) {
  const out = new PNG({ width: region.w, height: region.h });
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      const sx = region.x + x;
      const sy = region.y + y;
      const si = (sy * img.width + sx) * 4;
      const di = (y * region.w + x) * 4;
      out.data[di] = img.data[si];
      out.data[di + 1] = img.data[si + 1];
      out.data[di + 2] = img.data[si + 2];
      out.data[di + 3] = img.data[si + 3];
    }
  }
  return out;
}

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
}

function edgeProjections(img) {
  const W = img.width, H = img.height;
  const xEdges = new Float64Array(W);
  const yEdges = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let prev = lum(img.data[(y * W) * 4], img.data[(y * W) * 4 + 1], img.data[(y * W) * 4 + 2]);
    for (let x = 1; x < W; x++) {
      const i = (y * W + x) * 4;
      const cur = lum(img.data[i], img.data[i + 1], img.data[i + 2]);
      xEdges[x] += Math.abs(cur - prev);
      prev = cur;
    }
  }
  for (let x = 0; x < W; x++) {
    let prev = lum(img.data[x * 4], img.data[x * 4 + 1], img.data[x * 4 + 2]);
    for (let y = 1; y < H; y++) {
      const i = (y * W + x) * 4;
      const cur = lum(img.data[i], img.data[i + 1], img.data[i + 2]);
      yEdges[y] += Math.abs(cur - prev);
      prev = cur;
    }
  }
  return { xEdges, yEdges };
}

function smooth(s) {
  const out = new Float64Array(s.length);
  for (let i = 0; i < s.length; i++) {
    let sum = 0, n = 0;
    for (let k = -1; k <= 1; k++) {
      const j = i + k;
      if (j >= 0 && j < s.length) {
        sum += s[j];
        n++;
      }
    }
    out[i] = sum / n;
  }
  return out;
}

function findPeaks(signal, fraction = 0.4, minSpacing = 4) {
  const n = signal.length;
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (signal[i] > max) max = signal[i];
  const threshold = max * fraction;
  const candidates = [];
  for (let i = 1; i < n - 1; i++) {
    if (signal[i] >= threshold && signal[i] >= signal[i - 1] && signal[i] >= signal[i + 1]) {
      candidates.push({ i, v: signal[i] });
    }
  }
  candidates.sort((a, b) => b.v - a.v);
  const taken = new Array(n).fill(false);
  const kept = [];
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

function regularizeGrid(peaks) {
  if (peaks.length < 2) return peaks.slice();
  const gaps = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
  const sorted = gaps.slice().sort((a, b) => a - b);
  const period = sorted[Math.floor(sorted.length / 2)];
  if (period < 2) return peaks.slice();

  const isMultipleOfPeriod = (g) => {
    const k = Math.round(g / period);
    if (k < 1 || k > 4) return false;
    return Math.abs(g - k * period) <= Math.max(2, period * 0.25);
  };

  let bestStart = 0, bestLen = 1, curStart = 0, curLen = 1;
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
  const lines = [];
  for (let p = first; p <= last + period / 2; p += period) lines.push(p);
  return { lines, period };
}

function sampleCellColor(img, x0, x1, y0, y1) {
  const innerW = x1 - x0;
  const innerH = y1 - y0;
  const xA = x0 + Math.floor(innerW * 0.25);
  const xB = x0 + Math.ceil(innerW * 0.75);
  const yA = y0 + Math.floor(innerH * 0.25);
  const yB = y0 + Math.ceil(innerH * 0.75);
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = yA; y < yB; y++) {
    for (let x = xA; x < xB; x++) {
      const p = px(img, x, y);
      r += p.r;
      g += p.g;
      b += p.b;
      n++;
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n } : { r: 0, g: 0, b: 0 };
}

function classify(rgb) {
  // empty (light) | red | black
  const lumV = lum(rgb.r, rgb.g, rgb.b);
  const redness = rgb.r - (rgb.g + rgb.b) / 2;
  if (lumV > 200 && redness < 30) return 0; // empty
  // dark — could be red or black
  if (redness > 35) return 1; // red
  return 2; // black
}

async function extractPattern(name) {
  const cfg = CONFIGS[name];
  if (!cfg) throw new Error(`Unknown pattern: ${name}`);
  const pdfPath = path.join(PDF_DIR, cfg.pdf);
  const rasterPath = rasterise(pdfPath, cfg.page, cfg.dpi);
  const fullImg = loadPng(rasterPath);
  console.error(`Page raster: ${fullImg.width}x${fullImg.height}`);
  // Save the cropped chart image so user can inspect
  const cropped = cropImage(fullImg, cfg.crop);
  const cropPath = path.join(TMP_DIR, `extract_${name}_crop.png`);
  writeFileSync(cropPath, PNG.sync.write(cropped));
  console.error(`Cropped chart saved: ${cropPath} (${cropped.width}x${cropped.height})`);

  // Detect grid
  const { xEdges, yEdges } = edgeProjections(cropped);
  const xPeaks = findPeaks(smooth(xEdges));
  const yPeaks = findPeaks(smooth(yEdges));
  const xReg = regularizeGrid(xPeaks);
  const yReg = regularizeGrid(yPeaks);
  const xs = xReg.lines || xReg;
  const ys = yReg.lines || yReg;

  console.error(`Detected: ${xs.length - 1} cols × ${ys.length - 1} rows`);
  console.error(`x period: ${xReg.period}, y period: ${yReg.period}`);
  console.error(`xs: ${xs.join(',')}`);
  console.error(`ys: ${ys.join(',')}`);

  // Sample cells
  const cells = [];
  for (let cy = 0; cy < ys.length - 1; cy++) {
    const row = [];
    for (let cx = 0; cx < xs.length - 1; cx++) {
      const rgb = sampleCellColor(cropped, xs[cx], xs[cx + 1], ys[cy], ys[cy + 1]);
      row.push(classify(rgb));
    }
    cells.push(row);
  }

  return {
    name,
    width: xs.length - 1,
    height: ys.length - 1,
    cells,
    expected: cfg.expected,
  };
}

function printPatternTs(pattern) {
  console.log(`\n// ${pattern.name}: ${pattern.width}×${pattern.height} (expected ${pattern.expected.w}×${pattern.expected.h})`);
  console.log(`{ width: ${pattern.width}, height: ${pattern.height}, cells: [`);
  for (const row of pattern.cells) {
    console.log(`  [${row.join(',')}],`);
  }
  console.log(`]}`);
}

const args = process.argv.slice(2);
const target = args[0] ?? 'all';
const targets = target === 'all' ? Object.keys(CONFIGS) : [target];

for (const t of targets) {
  console.error(`\n=== Extracting ${t} ===`);
  try {
    const result = await extractPattern(t);
    printPatternTs(result);
  } catch (e) {
    console.error(`FAILED: ${e.message}`);
  }
}
