import { useLayoutEffect, useRef, useState } from 'react';
import { type Box, placeMotifBar } from './motifBar';

export interface MotifBarProps {
  /**
   * Selection bounding box in CSS pixels, relative to the canvas wrapper,
   * or null when nothing is selected (the bar renders nothing).
   */
  box: Box | null;
  /** Wrapper size in CSS px, used to clamp the bar into view. */
  viewport: { w: number; h: number };
  /** True mid-gesture (drag / pinch) so the bar never chases the finger. */
  hidden: boolean;
  /** Number of selected areas — the ⋯ detail button is single-selection only. */
  selectedCount: number;
  onRotate: () => void;
  onFlip: (axis: 'x' | 'y') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}

/**
 * A toolbar anchored to the selected motif, holding the actions reached for
 * constantly while composing: rotate, flip, duplicate, delete, and a ⋯ that
 * opens the detail panel.
 *
 * Real DOM buttons rather than canvas-drawn hit targets, so they get 44pt tap
 * targets, focus rings and screen-reader labels for free — and cannot be
 * missed by a few pixels the way the old canvas-drawn × and rotate knob could.
 *
 * Undo is deliberately NOT here: it is global (it reverses the last edit
 * whatever it was, including creating the very motif this bar is attached to),
 * so it lives in the canvas corner cluster instead.
 */
export default function MotifBar({
  box,
  viewport,
  hidden,
  selectedCount,
  onRotate,
  onFlip,
  onDuplicate,
  onDelete,
  onOpenDetail,
}: MotifBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Measured after paint so placement uses the bar's real width (which
  // depends on font metrics), not a guess.
  const [size, setSize] = useState({ w: 240, h: 44 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width && (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1)) {
      setSize({ w: r.width, h: r.height });
    }
  });

  if (!box || hidden) return null;

  const { left, top } = placeMotifBar(box, size, viewport);

  return (
    <div
      ref={ref}
      className="motif-bar"
      role="toolbar"
      aria-label="Motif actions"
      style={{ left, top }}
      // Keep pointer events off the canvas beneath: a tap on the bar must
      // never also register as a canvas press (which would deselect).
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="motif-bar-btn" onClick={onRotate} title="Rotate 90° clockwise" aria-label="Rotate 90 degrees clockwise">↺</button>
      <button type="button" className="motif-bar-btn" onClick={() => onFlip('x')} title="Flip horizontally" aria-label="Flip horizontally">⇔</button>
      <button type="button" className="motif-bar-btn" onClick={() => onFlip('y')} title="Flip vertically" aria-label="Flip vertically">⇕</button>
      <button type="button" className="motif-bar-btn" onClick={onDuplicate} title="Duplicate (Ctrl/Cmd+D)" aria-label="Duplicate">⧉</button>
      <button type="button" className="motif-bar-btn motif-bar-danger" onClick={onDelete} title="Delete" aria-label="Delete">⌫</button>
      {selectedCount === 1 && (
        <button type="button" className="motif-bar-btn" onClick={onOpenDetail} title="Name, size, colors, repeat" aria-label="More options">⋯</button>
      )}
    </div>
  );
}
