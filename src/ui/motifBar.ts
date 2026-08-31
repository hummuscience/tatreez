/** A rectangle in CSS pixels, relative to the canvas wrapper. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gap in CSS px between the selection box and the bar. */
export const MOTIF_BAR_GAP = 8;

/**
 * Place the motif toolbar just outside a selection box.
 *
 * Prefers sitting above the selection (where it never covers the motif the
 * user is looking at). Flips below when the box hugs the top edge, and pins
 * to the top when the box is so tall that neither side fits — a bar that is
 * awkwardly placed is still better than one the user cannot reach.
 *
 * Horizontally the bar centres on the box, then clamps into the viewport so
 * a motif near either edge still gets a fully visible toolbar.
 */
export function placeMotifBar(
  box: Box,
  bar: { w: number; h: number },
  viewport: { w: number; h: number },
  gap: number = MOTIF_BAR_GAP,
): { left: number; top: number; placement: 'above' | 'below' } {
  const above = box.y - bar.h - gap;
  const below = box.y + box.h + gap;

  let top: number;
  let placement: 'above' | 'below';
  if (above >= 0) {
    top = above;
    placement = 'above';
  } else if (below + bar.h <= viewport.h) {
    top = below;
    placement = 'below';
  } else {
    // Neither side fits (a selection taller than the viewport): pin to the
    // top edge so the bar stays on screen and reachable.
    top = 0;
    placement = 'above';
  }

  const centred = box.x + box.w / 2 - bar.w / 2;
  // Math.max(0, …) wins over the upper clamp when the bar is wider than the
  // viewport, so `left` is never negative.
  const left = Math.max(0, Math.min(centred, viewport.w - bar.w));

  return { left, top, placement };
}
