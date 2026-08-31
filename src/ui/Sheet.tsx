import { type ReactNode, useEffect } from 'react';

export interface SheetProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * Anchor to the viewport instead of the nearest positioned ancestor.
   * Default (false) is today's behaviour: `position: absolute`, sized and
   * placed relative to whatever positioned ancestor the caller mounts it
   * in — correct when that ancestor is a tall, content-sized region (e.g.
   * the inspector's `.design-canvas-wrap`). Pass `true` when the mount
   * point is a thin, auto-height ancestor (e.g. a header row) where
   * percentage sizing and edge anchoring would collapse to near-nothing.
   */
  viewportAnchored?: boolean;
}

/**
 * A bottom sheet for narrow/tablet viewports. On wide screens the CSS turns
 * it into a floating panel in the canvas corner, so callers render one thing
 * and the breakpoint decides how it looks.
 */
export default function Sheet({ title, open, onClose, children, viewportAnchored = false }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`sheet${viewportAnchored ? ' sheet-viewport' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={title}
    >
      <div className="sheet-head">
        <span className="sheet-title">{title}</span>
        <button type="button" className="sheet-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
