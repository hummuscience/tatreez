export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridLines {
  // x-coordinates of vertical gridlines, in image pixels
  xs: number[];
  // y-coordinates of horizontal gridlines, in image pixels
  ys: number[];
}

export interface CellSamples {
  width: number; // cells across
  height: number; // cells down
  // cells[y][x] is the average RGB of cell (x, y)
  cells: RGB[][];
  /**
   * cellAlpha[y][x] is the average alpha (0..255) of cell (x, y).
   * Cells with alpha below TRANSPARENT_THRESHOLD are treated as
   * empty/background and skipped during colour clustering.
   */
  cellAlpha: number[][];
}

export interface ColorCluster {
  centroid: RGB;
  // count of cells assigned to this cluster
  count: number;
  /** True if this is a synthetic "transparent" cluster (from alpha=0 cells). */
  transparent?: boolean;
}

export interface DetectionResult {
  crop: CropBox;
  gridlines: GridLines;
  samples: CellSamples;
  clusters: ColorCluster[];
  // assignments[y][x] = cluster index for cell (x, y)
  assignments: number[][];
}
