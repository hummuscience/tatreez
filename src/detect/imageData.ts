import type { RGB } from './types';

export function pixelAt(img: ImageData, x: number, y: number): RGB {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] };
}

export function alphaAt(img: ImageData, x: number, y: number): number {
  const i = (y * img.width + x) * 4 + 3;
  return img.data[i];
}

/**
 * Threshold below which a pixel (or a cell's average alpha) is considered
 * "transparent" — i.e. background. Set high enough that cells with mostly
 * transparent + some antialiasing edge pixels still classify as empty,
 * even though their average alpha is non-zero.
 */
export const TRANSPARENT_THRESHOLD = 128;

export function isTransparent(img: ImageData, x: number, y: number): boolean {
  return alphaAt(img, x, y) < TRANSPARENT_THRESHOLD;
}

export function luminance({ r, g, b }: RGB): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rgbDist2(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function avgRgb(samples: RGB[]): RGB {
  if (samples.length === 0) return { r: 0, g: 0, b: 0 };
  let r = 0, g = 0, b = 0;
  for (const s of samples) {
    r += s.r;
    g += s.g;
    b += s.b;
  }
  return { r: r / samples.length, g: g / samples.length, b: b / samples.length };
}
