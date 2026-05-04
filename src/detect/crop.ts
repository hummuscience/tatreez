import type { CropBox, RGB } from './types';
import { alphaAt, isTransparent, pixelAt, rgbDist2, TRANSPARENT_THRESHOLD } from './imageData';

/**
 * Detect content bounding box by trimming a uniform-color border.
 * We sample the four corners as the assumed background, then walk inward
 * from each edge until we hit pixels that differ from background by more
 * than `threshold`.
 *
 * If no clear border is found (e.g. image is already cropped tight), we
 * return the full image bounds.
 */
export function autoCrop(img: ImageData, threshold = 30): CropBox {
  const { width: W, height: H } = img;
  if (W < 10 || H < 10) return { x: 0, y: 0, w: W, h: H };

  // Detect whether the image has a meaningful alpha channel. If any of
  // the four corners is transparent, treat transparency as background:
  // pixels with alpha < TRANSPARENT_THRESHOLD count as background and
  // get trimmed regardless of their RGB.
  const cornerAlphas = [
    alphaAt(img, 0, 0),
    alphaAt(img, W - 1, 0),
    alphaAt(img, 0, H - 1),
    alphaAt(img, W - 1, H - 1),
  ];
  const hasTransparentCorner = cornerAlphas.some(
    (a) => a < TRANSPARENT_THRESHOLD,
  );

  // Sample four corners and use the most common one as background
  const corners: RGB[] = [
    pixelAt(img, 0, 0),
    pixelAt(img, W - 1, 0),
    pixelAt(img, 0, H - 1),
    pixelAt(img, W - 1, H - 1),
  ];
  // Pick the corner with the smallest average distance to the others
  let bgIdx = 0;
  let bestSum = Infinity;
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

  const isBgPixel = (x: number, y: number): boolean => {
    if (hasTransparentCorner && isTransparent(img, x, y)) return true;
    return rgbDist2(pixelAt(img, x, y), bg) <= t2;
  };

  // A row/column counts as background if it has FEWER than `minNonBg`
  // non-background pixels. Using a fixed pixel count (rather than a
  // percentage) means tiny chart features like a 1-pixel-thick foot or
  // a sparse trailing row don't get trimmed away — even when they
  // occupy much less than 5% of the row.
  const minNonBg = 4;

  const isBgRow = (y: number, fromX: number, toX: number): boolean => {
    let nonBg = 0;
    for (let x = fromX; x < toX; x++) {
      if (!isBgPixel(x, y)) {
        nonBg++;
        if (nonBg >= minNonBg) return false;
      }
    }
    return true;
  };
  const isBgCol = (x: number, fromY: number, toY: number): boolean => {
    let nonBg = 0;
    for (let y = fromY; y < toY; y++) {
      if (!isBgPixel(x, y)) {
        nonBg++;
        if (nonBg >= minNonBg) return false;
      }
    }
    return true;
  };

  let top = 0;
  while (top < H - 1 && isBgRow(top, 0, W)) top++;
  let bottom = H - 1;
  while (bottom > top && isBgRow(bottom, 0, W)) bottom--;
  let left = 0;
  while (left < W - 1 && isBgCol(left, top, bottom + 1)) left++;
  let right = W - 1;
  while (right > left && isBgCol(right, top, bottom + 1)) right--;

  if (right - left < 10 || bottom - top < 10) {
    return { x: 0, y: 0, w: W, h: H };
  }
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}
