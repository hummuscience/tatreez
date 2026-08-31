import { type ReactNode, useEffect } from 'react';

export interface SheetProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A bottom sheet for narrow/tablet viewports. On wide screens the CSS turns
 * it into a floating panel in the canvas corner, so callers render one thing
 * and the breakpoint decides how it looks.
 */
export default function Sheet({ title, open, onClose, children }: SheetProps) {
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
    <div className="sheet" role="dialog" aria-modal="false" aria-label={title}>
      <div className="sheet-head">
        <span className="sheet-title">{title}</span>
        <button type="button" className="sheet-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
