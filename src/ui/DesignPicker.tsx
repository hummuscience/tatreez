import { useState } from 'react';
import { listDesigns } from '../storage/storage';
import type { Design } from '../project/design';

/**
 * A small modal listing existing designs plus a "New design" choice. Shared by
 * the pattern detail panel and the editor's "Add to design" action so both
 * offer the same picker. `onChoose` receives an existing design id, or `null`
 * to create a fresh design.
 */
export default function DesignPicker({
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
