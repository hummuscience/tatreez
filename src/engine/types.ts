/**
 * Index into the engine palette. 0 = empty, 1..N = filled colours.
 *
 * Historically this was a literal union (0..7) — fine for built-in
 * patterns, but archive imports (Tirazain, etc.) routinely use 8+ DMC
 * colours per chart. Widened to `number` so any palette length works.
 * Code paths in the engine all branch on "0 vs nonzero" rather than
 * exhaustively switching over indices, so widening is safe.
 */
export type ColorIndex = number;

export type Cell = [number, number];

export type Corner = [number, number];

export type LegType = '/' | '\\';

export type StepKind = 'start' | 'front' | 'back';

export interface Step {
  kind: StepKind;
  from: Corner | null;
  to: Corner;
  cell?: Cell;
  leg?: LegType;
}

export interface Region {
  color: ColorIndex;
  cells: Cell[];
}

/**
 * Provenance for a pattern that came from an external archive. When
 * present, the editor and library should display attribution.
 */
export interface PatternSource {
  /** Where the pattern originally came from, e.g. "tirazain.com". */
  archive: string;
  /** Permalink to the pattern's page in the archive. */
  url: string;
  /** Original name as listed in the archive (often English transliteration). */
  originalName?: string;
  /** Original Arabic name, when available. */
  arabicName?: string;
  /** Region or origin (e.g. "Ramallah", "Hebron", "Gaza"). */
  region?: string;
  /** Free-form attribution string the archive asks be shown. */
  attribution?: string;
}

export interface Pattern {
  name: string;
  width: number;
  height: number;
  cells: ColorIndex[][];
  /**
   * Optional per-pattern palette: index 0 is empty (null), indices 1..N
   * are hex colour strings. When unset, the global engine PALETTE from
   * `src/patterns/builtin.ts` is used as a fallback for backward
   * compatibility with patterns saved before per-pattern palettes were
   * introduced.
   */
  palette?: (string | null)[];
  /**
   * Provenance metadata for patterns imported from external archives.
   * Optional — built-in and user-drawn patterns omit this.
   */
  source?: PatternSource;
  /**
   * Arabic display name (e.g. "السرو" for the Cypress Tree). Optional.
   * The UI shows this alongside the Latin `name` with `dir="rtl"`. The
   * search index also matches against this field as raw text (no
   * lowercasing — Arabic is case-insensitive natively).
   */
  nameAr?: string;
  /**
   * Arabic region label (e.g. "رام الله" for Ramallah). Optional.
   * Mirrors the existing `source.region` (English) when both are present.
   */
  regionAr?: string;
}

export interface Score {
  composite: number;
  diag: number;
  axis: number;
  starts: number;
  longJumps: number;
  axisFraction: number;
  /**
   * Number of threads in the plan whose first and last stitch have
   * different parity (parity = (x+y) mod 2 of the cell of the first
   * front leg of the stitch). Per Biedl/Horton/López-Ortiz 2005
   * Theorem 6, a "perfect stitching" must have matching parity at
   * thread start and end. A nonzero count means the plan provably
   * isn't a perfect stitching in their sense and likely has avoidable
   * back-travel near a thread end.
   */
  parityViolations: number;
  /**
   * Number of cells where the over-diagonal `\` was stitched before
   * the under-diagonal `/`. Per Biedl/Horton/López-Ortiz 2005, the
   * `/` ("under") must be laid first so the `\` ("over") sits on top
   * of it; otherwise the cross looks reversed and reflects light
   * differently. Zero is the goal.
   */
  underOverViolations: number;
}

export interface StrategyResult {
  strategyName: string;
  steps: Step[];
  score: Score;
}

export interface Plan {
  label: string;
  steps: Step[];
  score: Score;
  isGroundTruth?: boolean;
}

/**
 * A named region of the chart that a stitcher treats as a single unit
 * (e.g. "stalk", "bean", "najma-arm"). Parts are the unit of reuse: the
 * same recorded part traversal can be transplanted onto any chart that
 * contains the same shape.
 *
 * `pointStart` and `pointEnd` are inclusive/exclusive indices into the
 * GroundTruth's flat `points` array — the points belonging to this part
 * are `points.slice(pointStart, pointEnd)`. A part typically corresponds
 * to one continuous thread, but the schema doesn't enforce this.
 */
export interface GroundTruthPart {
  name: string;
  pointStart: number;
  pointEnd: number;
}

export interface GroundTruth {
  points: Corner[];
  threadStarts: number[];
  steps: Step[];
  /**
   * Named parts within this ground truth. When absent (legacy GTs),
   * consumers should treat the whole recording as a single anonymous
   * part. Parts are non-overlapping and sorted by `pointStart`.
   */
  parts?: GroundTruthPart[];
}
