import { useState } from 'react';
import type { Palette, PaletteColor } from '../engine/types';
import { type Area, type RepeatMode, areaUsedColors, repeatFit } from '../project/design';
import ColorReplacePopover from './ColorReplacePopover';

interface AreaActions {
  onDuplicate: () => void;
  onDeleteArea: () => void;
  onPlanArea: (a: Area) => void;
}

export default function AreaInspector({
  area,
  selectedCount,
  palette,
  libraryNumbers,
  onRecolor,
  updateArea,
  ...actions
}: {
  area: Area | null;
  selectedCount: number;
  palette: Palette;
  libraryNumbers: ReadonlySet<string>;
  onRecolor: (oldIndex: number, color: PaletteColor) => void;
  updateArea: (id: string, fn: (a: Area) => Area) => void;
} & AreaActions) {
  // Nothing selected means nothing to inspect. Render nothing at all rather
  // than a header-only panel: this sits inside a bottom sheet that claims up
  // to 70% of the canvas on a tablet, and a titled-but-empty panel is pure
  // chrome over the work surface.
  if (!area) return null;

  // The inspector's old "?" toggle was superseded by the global help modal
  // accessible from the cloth bar's "?" button — keep the header clean here.
  return (
    <section className="panel">
      <div className="panel-h">
        <span>{selectedCount > 1 ? `${selectedCount} areas` : 'Area'}</span>
        <span dir="rtl">المنطقة</span>
      </div>
      <AreaPanel
        area={area}
        multi={selectedCount > 1}
        palette={palette}
        libraryNumbers={libraryNumbers}
        onRecolor={onRecolor}
        updateArea={updateArea}
        {...actions}
      />
    </section>
  );
}

function AreaPanel({
  area,
  multi,
  palette,
  libraryNumbers,
  onRecolor,
  updateArea,
  onDuplicate,
  onDeleteArea,
  onPlanArea,
}: {
  area: Area;
  multi: boolean;
  palette: Palette;
  libraryNumbers: ReadonlySet<string>;
  onRecolor: (oldIndex: number, color: PaletteColor) => void;
  updateArea: (id: string, fn: (a: Area) => Area) => void;
} & AreaActions) {
  const [recolorIndex, setRecolorIndex] = useState<number | null>(null);
  const repeating = !!area.repeat;
  const repeatCells = area.repeat?.cells ?? [];
  const mh = repeatCells.length;
  const mw = mh > 0 ? repeatCells[0].length : 0;
  const fit = repeating && mw > 0 ? repeatFit(area, mw, mh, area.repeat!.mode) : null;

  // With multiple areas selected, per-area fields (name, size, repeat) don't
  // apply — show only the group duplicate/delete actions.
  if (multi) {
    return (
      <div className="design-area">
        <p className="design-area-count">Duplicate or delete all selected areas.</p>
        <div className="design-area-actions">
          <button className="btn-ghost btn-sm" type="button" onClick={onDuplicate} title="Duplicate (Ctrl/Cmd+D)">
            Duplicate all
          </button>
          <button
            className="btn-ghost btn-sm"
            type="button"
            onClick={() => {
              if (confirm('Delete the selected areas?')) onDeleteArea();
            }}
          >
            Delete all
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="design-area">
      <label className="field">
        <span>Name</span>
        <input
          value={area.name}
          onChange={(e) => updateArea(area.id, (a) => ({ ...a, name: e.target.value }))}
        />
      </label>

      {repeating ? (
        // Repeat areas have a manual fill region — keep W/H editable.
        <div className="design-area-size">
          <label className="field">
            <span>W</span>
            <input
              type="number"
              min={1}
              value={area.w}
              onChange={(e) =>
                updateArea(area.id, (a) => ({ ...a, w: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </label>
          <label className="field">
            <span>H</span>
            <input
              type="number"
              min={1}
              value={area.h}
              onChange={(e) =>
                updateArea(area.id, (a) => ({ ...a, h: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </label>
        </div>
      ) : (
        // Single-motif areas hug the motif — size is derived, not editable.
        <div className="design-area-count">
          {area.w}×{area.h} cells · at ({area.x}, {area.y})
        </div>
      )}

      {/* Colours: one swatch per colour used in this area; click to replace. */}
      {(() => {
        const used = areaUsedColors(area);
        if (used.length === 0) return null;
        const onCanvas: PaletteColor[] = palette.filter(
          (c): c is PaletteColor => c != null,
        );
        return (
          <div className="design-colors">
            <div className="design-colors-label">Colours · الألوان</div>
            <div className="design-swatches">
              {used.map((idx) => {
                const c = palette[idx];
                if (!c) return null;
                return (
                  <button
                    key={idx}
                    type="button"
                    className="design-swatch"
                    style={{ background: c.hex }}
                    title={c.dmc ? `DMC ${c.dmc.number} · ${c.dmc.name}` : c.hex}
                    onClick={() => setRecolorIndex(recolorIndex === idx ? null : idx)}
                  />
                );
              })}
            </div>
            {recolorIndex != null && palette[recolorIndex] && (
              <ColorReplacePopover
                current={palette[recolorIndex]!}
                libraryNumbers={libraryNumbers}
                suggested={onCanvas}
                suggestedLabel="On the canvas"
                onPick={(color) => {
                  onRecolor(recolorIndex, color);
                  setRecolorIndex(null);
                }}
                onClose={() => setRecolorIndex(null)}
              />
            )}
          </div>
        );
      })()}

      <label className="design-fit-toggle">
        <input
          type="checkbox"
          checked={repeating}
          onChange={(e) => {
            if (e.target.checked) {
              // seed from first placed motif if any
              const seed = area.motifs[0];
              updateArea(area.id, (a) => ({
                ...a,
                repeat: {
                  mode: 'horizontal',
                  patternKey: seed?.patternKey ?? '',
                  cells: seed?.cells ?? [],
                },
              }));
            } else {
              updateArea(area.id, (a) => {
                const { repeat: _r, ...rest } = a;
                return rest as Area;
              });
            }
          }}
        />
        Repeat one motif to fill
      </label>

      {repeating && (
        <>
          <div className="design-repeat-modes">
            {(['horizontal', 'grid'] as RepeatMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${area.repeat!.mode === m ? ' chip-active' : ''}`}
                onClick={() => updateArea(area.id, (a) => ({ ...a, repeat: { ...a.repeat!, mode: m } }))}
              >
                {m === 'horizontal' ? 'Horizontal band' : 'Full grid'}
              </button>
            ))}
          </div>
          {repeatCells.length === 0 ? (
            <p className="empty-hint">Drag a pattern onto this area to set the repeat motif.</p>
          ) : (
            fit && (
              <p className="design-fit-report">
                fits {fit.cols}
                {area.repeat!.mode === 'grid' ? `×${fit.rows}` : '×'} ·{' '}
                {fit.leftoverX > 0 ? `${fit.leftoverX} cells left across` : 'exact across'}
                {area.repeat!.mode === 'grid' && fit.leftoverY > 0
                  ? `, ${fit.leftoverY} down`
                  : ''}
              </p>
            )
          )}
        </>
      )}

      {!repeating && (
        <p className="design-area-count">
          {area.motifs.length} motif{area.motifs.length === 1 ? '' : 's'}
          {area.motifs.length > 0 && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => updateArea(area.id, (a) => ({ ...a, motifs: [] }))}
            >
              clear
            </button>
          )}
        </p>
      )}

      <div className="design-area-actions">
        <button className="btn-primary" type="button" onClick={() => onPlanArea(area)}>
          Plan this area
        </button>
        <button
          className="btn-ghost btn-sm"
          type="button"
          onClick={onDuplicate}
          title="Duplicate (Ctrl/Cmd+D)"
        >
          Duplicate
        </button>
        <button
          className="btn-ghost btn-sm"
          type="button"
          onClick={() => {
            if (confirm(`Delete area "${area.name}"?`)) onDeleteArea();
          }}
        >
          Delete area
        </button>
      </div>
    </div>
  );
}
