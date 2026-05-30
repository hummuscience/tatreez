import { useEffect, useState } from 'react';
import type { Pattern } from '../engine/types';
import { patternStats } from './patternStats';
import PatternThumb from './PatternThumb';
import { listDesigns } from '../storage/storage';
import type { Design } from '../project/design';

export interface PatternDetailProps {
  /** The selected pattern and its library key, or null when the panel is closed. */
  selection: { pattern: Pattern; patternKey: string } | null;
  /** Whether this pattern has ground truth (canonical or saved). */
  hasGroundTruth: boolean;
  onClose: () => void;
  onEdit: (pattern: Pattern, key: string) => void;
  onPlan: (pattern: Pattern, key: string) => void;
  onSubmitGroundTruth: (pattern: Pattern, key: string) => void;
  /** User picked a design (existing id, or null to create a new one) for the motif. */
  onAddToDesign: (pattern: Pattern, key: string, designId: string | null) => void;
}

export default function PatternDetail({
  selection,
  hasGroundTruth,
  onClose,
  onEdit,
  onPlan,
  onSubmitGroundTruth,
  onAddToDesign,
}: PatternDetailProps) {
  const [picking, setPicking] = useState(false);

  // Close on Escape. Reset the picker whenever the selection changes.
  useEffect(() => {
    setPicking(false);
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, onClose]);

  if (!selection) return null;
  const { pattern: p, patternKey } = selection;
  const s = patternStats(p);
  const arabicName = p.nameAr ?? p.source?.arabicName ?? '';
  const region = p.source?.region;
  const sourceUrl = p.source?.url;

  return (
    <div className="pd-overlay" role="dialog" aria-modal="true" aria-label={p.name}>
      <button className="pd-backdrop" type="button" aria-label="Close" onClick={onClose} />
      <aside className="pd-panel">
        <button className="pd-close" type="button" aria-label="Close" onClick={onClose}>
          ✕
        </button>

        <div className="pd-head">
          <div className="pd-thumb">
            <PatternThumb pattern={p} />
          </div>
          <div className="pd-titles">
            <div className="pd-name">{p.name}</div>
            {arabicName && (
              <div className="pd-name-ar" dir="rtl">
                {arabicName}
              </div>
            )}
            <div className="pd-sub">
              {region && <span>{region}</span>}
              {hasGroundTruth && <span className="pat-badge">GT</span>}
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                  source ↗
                </a>
              )}
            </div>
          </div>
        </div>

        {p.description && (
          <section className="pd-section">
            <h3 className="pd-h">Description</h3>
            <p className="pd-desc">{p.description}</p>
          </section>
        )}

        <section className="pd-section">
          <h3 className="pd-h">Details</h3>
          <dl className="pd-details">
            <dt>Chart size</dt>
            <dd>
              {s.chart.w} × {s.chart.h}
            </dd>
            <dt>Painted size</dt>
            <dd>
              {s.painted.w} × {s.painted.h}
            </dd>
            <dt>Stitches</dt>
            <dd>{s.stitches}</dd>
            <dt>Colors</dt>
            <dd>
              <span className="pat-dmc">
                {s.colors.map((c, i) => (
                  <span
                    key={i}
                    className="pat-dmc-chip"
                    style={{ background: c.hex }}
                    title={c.dmc ? `DMC ${c.dmc.number} · ${c.dmc.name}` : c.hex}
                  />
                ))}
              </span>{' '}
              ({s.colorCount})
            </dd>
            {s.dmc.length > 0 && (
              <>
                <dt>Threads (DMC)</dt>
                <dd>{s.dmc.map((d) => `${d.number} ${d.name}`).join(' · ')}</dd>
              </>
            )}
            <dt>Ground truth</dt>
            <dd>{hasGroundTruth ? '✓ available' : '— none yet'}</dd>
          </dl>
        </section>

        <div className="pd-actions">
          <button className="btn-primary" type="button" onClick={() => setPicking(true)}>
            Add to design
          </button>
          <button className="btn-primary" type="button" onClick={() => onPlan(p, patternKey)}>
            Plan
          </button>
          <button className="btn-ghost" type="button" onClick={() => onEdit(p, patternKey)}>
            Edit
          </button>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => onSubmitGroundTruth(p, patternKey)}
          >
            Submit ground truth
          </button>
        </div>

        {picking && (
          <DesignPicker
            onCancel={() => setPicking(false)}
            onChoose={(designId) => onAddToDesign(p, patternKey, designId)}
          />
        )}
      </aside>
    </div>
  );
}

/** A small modal listing existing designs plus a "New design" choice. */
function DesignPicker({
  onCancel,
  onChoose,
}: {
  onCancel: () => void;
  onChoose: (designId: string | null) => void;
}) {
  const [designs] = useState<Design[]>(() => listDesigns());
  return (
    <div className="pd-picker" role="dialog" aria-label="Add to which design">
      <div className="pd-picker-h">Add to design</div>
      <button
        className="btn-ghost pd-picker-item"
        type="button"
        onClick={() => onChoose(null)}
      >
        + New design
      </button>
      {designs.map((d) => (
        <button
          key={d.id}
          className="btn-ghost pd-picker-item"
          type="button"
          onClick={() => onChoose(d.id)}
        >
          {d.name}
        </button>
      ))}
      <button className="btn-ghost btn-sm" type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
