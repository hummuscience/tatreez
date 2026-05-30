/**
 * Pure derivation of the facts shown on the pattern detail panel's details
 * table. One source so the panel stays consistent and the logic is testable.
 */

import type { DmcRef, PaletteColor, Pattern } from '../engine/types';
import { getPaletteColors } from '../patterns/builtin';
import { colorCount, paintedCells, paintedSize } from './patternFilters';

export interface PatternStats {
  /** Full chart dimensions (width × height), in cells. */
  chart: { w: number; h: number };
  /** Painted bounding-box dimensions, in cells. {w:0,h:0} if all-empty. */
  painted: { w: number; h: number };
  /** Number of painted (non-empty) cells. */
  stitches: number;
  /** Number of distinct palette colours. */
  colorCount: number;
  /** The non-null palette colours, in palette order. */
  colors: PaletteColor[];
  /** DMC references for colours that carry one, in palette order. */
  dmc: DmcRef[];
}

export function patternStats(p: Pattern): PatternStats {
  const colors = getPaletteColors(p).filter(
    (c): c is PaletteColor => c != null,
  );
  return {
    chart: { w: p.width, h: p.height },
    painted: paintedSize(p),
    stitches: paintedCells(p),
    colorCount: colorCount(p),
    colors,
    dmc: colors.map((c) => c.dmc).filter((d): d is DmcRef => d != null),
  };
}
