import type { ColorIndex, Pattern, Region } from './types';

export function extractRegions(pattern: Pattern): Region[] {
  const { width, height, cells } = pattern;
  const seen: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const regions: Region[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] > 0 && !seen[y][x]) {
        const color = cells[y][x] as ColorIndex;
        const regionCells: [number, number][] = [];
        const stack: [number, number][] = [[x, y]];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
          if (seen[cy][cx]) continue;
          if (cells[cy][cx] !== color) continue;
          seen[cy][cx] = true;
          regionCells.push([cx, cy]);
          stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
        regions.push({ color, cells: regionCells });
      }
    }
  }
  return regions;
}

export function countRegions(pattern: Pattern): number {
  return extractRegions(pattern).length;
}

export function countStitches(pattern: Pattern): number {
  let n = 0;
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      if (pattern.cells[y][x] > 0) n++;
    }
  }
  return n;
}
