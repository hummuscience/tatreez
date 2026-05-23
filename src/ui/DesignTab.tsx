import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pattern } from '../engine/types';
import {
  type Area,
  type Design,
  type RepeatMode,
  cmToCells,
  compositeArea,
  mergePalette,
  newId,
  patternPalette,
  remapCells,
  repeatFit,
} from '../project/design';
import {
  CLOTH_OPTIONS,
  DEFAULT_CLOTH_ID,
  DEFAULT_STRANDS_ID,
  STRAND_OPTIONS,
  getCloth,
} from '../project/cloth';
import { BUILTIN_PATTERNS } from '../patterns/builtin';
import { TIRAZAIN_ARCHIVE } from '../patterns/tirazainArchive';
import {
  builtinPatternKey,
  deleteDesign,
  listDesigns,
  listSavedPatterns,
  saveDesign,
  savedPatternKey,
} from '../storage/storage';
import PatternThumb from './PatternThumb';
import { cellSize, clearCanvas, drawGridLines, drawPatternBackground } from './canvasUtil';

interface Props {
  /** Route a composited area to the Plan tab. */
  onPlanArea: (pattern: Pattern, key: string) => void;
  showToast: (msg: string) => void;
}

const CANVAS_W = 560;
const CANVAS_H = 440;

/** A library entry the browser can show and drag. */
interface LibEntry {
  key: string;
  pattern: Pattern;
}

function buildLibrary(): LibEntry[] {
  const out: LibEntry[] = [];
  for (const [id, p] of Object.entries(BUILTIN_PATTERNS)) {
    out.push({ key: builtinPatternKey(id), pattern: p });
  }
  for (const s of listSavedPatterns()) {
    out.push({ key: savedPatternKey(s.id), pattern: s.pattern });
  }
  for (const [slug, p] of Object.entries(TIRAZAIN_ARCHIVE)) {
    out.push({ key: `tirazain:${slug}`, pattern: p });
  }
  return out;
}

function matches(p: Pattern, q: string): boolean {
  if (!q) return true;
  const ql = q.toLowerCase();
  if (p.name.toLowerCase().includes(ql)) return true;
  if ((p.nameAr ?? '').includes(q)) return true;
  if (p.source?.region?.toLowerCase().includes(ql)) return true;
  if ((p.source?.arabicName ?? '').includes(q)) return true;
  return false;
}

export default function DesignTab({ onPlanArea, showToast }: Props) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [design, setDesign] = useState<Design | null>(null);

  useEffect(() => {
    setDesigns(listDesigns());
  }, []);

  // Persist whenever the open design changes (debounced lightly via effect).
  useEffect(() => {
    if (!design) return;
    saveDesign(design);
    setDesigns((cur) => {
      const rest = cur.filter((d) => d.id !== design.id);
      return [...rest, design].sort((a, b) => a.name.localeCompare(b.name));
    });
  }, [design]);

  if (!design) {
    return (
      <DesignList
        designs={designs}
        onOpen={setDesign}
        onCreate={(d) => {
          setDesign(d);
        }}
        onDelete={(id) => {
          deleteDesign(id);
          setDesigns(listDesigns());
        }}
      />
    );
  }

  return (
    <DesignComposer
      design={design}
      onChange={setDesign}
      onClose={() => setDesign(null)}
      onPlanArea={onPlanArea}
      showToast={showToast}
    />
  );
}

// ---------- Design list / new ----------

function DesignList({
  designs,
  onOpen,
  onCreate,
  onDelete,
}: {
  designs: Design[];
  onOpen: (d: Design) => void;
  onCreate: (d: Design) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [clothId, setClothId] = useState(DEFAULT_CLOTH_ID);
  const [widthCm, setWidthCm] = useState(20);
  const [heightCm, setHeightCm] = useState(20);

  const cloth = getCloth(clothId);
  const gridW = cmToCells(widthCm, cloth);
  const gridH = cmToCells(heightCm, cloth);

  const create = () => {
    const d: Design = {
      id: newId('design'),
      name: name.trim() || 'Untitled design',
      clothId,
      strandsId: DEFAULT_STRANDS_ID,
      widthCm,
      heightCm,
      gridW,
      gridH,
      areas: [],
      palette: [null],
    };
    onCreate(d);
  };

  return (
    <div className="design-list">
      <section className="panel">
        <div className="panel-h">
          <span>New design</span>
          <span dir="rtl">تصميم جديد</span>
        </div>
        <div className="design-new">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My thobe panel" />
          </label>
          <label className="field">
            <span>Cloth</span>
            <select value={clothId} onChange={(e) => setClothId(e.target.value)}>
              {CLOTH_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Width (cm)</span>
            <input
              type="number"
              min={1}
              value={widthCm}
              onChange={(e) => setWidthCm(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="field">
            <span>Height (cm)</span>
            <input
              type="number"
              min={1}
              value={heightCm}
              onChange={(e) => setHeightCm(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <div className="design-new-meta">
            = {gridW} × {gridH} stitches
          </div>
          <button className="btn-primary" type="button" onClick={create}>
            Create
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <span>Your designs</span>
          <span dir="rtl">تصاميمك</span>
        </div>
        {designs.length === 0 ? (
          <p className="empty-hint">No designs yet. Create one above.</p>
        ) : (
          <div className="design-cards">
            {designs.map((d) => (
              <div key={d.id} className="design-card">
                <button type="button" className="design-card-main" onClick={() => onOpen(d)}>
                  <div className="design-card-name">{d.name}</div>
                  <div className="design-card-meta">
                    {d.widthCm}×{d.heightCm} cm · {d.gridW}×{d.gridH} · {d.areas.length} area
                    {d.areas.length === 1 ? '' : 's'}
                  </div>
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    if (confirm(`Delete design "${d.name}"?`)) onDelete(d.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Composer ----------

function DesignComposer({
  design,
  onChange,
  onClose,
  onPlanArea,
  showToast,
}: {
  design: Design;
  onChange: (d: Design) => void;
  onClose: () => void;
  onPlanArea: (pattern: Pattern, key: string) => void;
  showToast: (msg: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(
    design.areas[0]?.id ?? null,
  );
  const [query, setQuery] = useState('');
  const [fitOnly, setFitOnly] = useState(false);

  const library = useMemo(() => buildLibrary(), []);
  const activeArea = design.areas.find((a) => a.id === activeAreaId) ?? null;

  // Drag-select state for making a new area (in cells).
  const dragRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );

  const cs = cellSize(CANVAS_W, CANVAS_H, design.gridW, design.gridH);

  // ----- rendering -----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    clearCanvas(ctx, canvas.width, canvas.height);
    drawGridLines(ctx, cs, design.gridW, design.gridH, 'rgba(0,0,0,0.06)');

    for (const area of design.areas) {
      // composite + draw the area's stitches
      const sub = compositeArea(area, design.palette);
      ctx.save();
      ctx.translate(area.x * cs, area.y * cs);
      drawPatternBackground(ctx, sub, cs);
      ctx.restore();

      // area frame
      const isActive = area.id === activeAreaId;
      ctx.save();
      ctx.strokeStyle = isActive ? '#b5654a' : 'rgba(154,123,181,0.7)';
      ctx.lineWidth = isActive ? 2 : 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(area.x * cs + 0.5, area.y * cs + 0.5, area.w * cs, area.h * cs);
      ctx.restore();

      // label
      ctx.save();
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillStyle = isActive ? '#b5654a' : '#9a7bb5';
      ctx.fillText(area.name, area.x * cs + 3, area.y * cs + 13);
      ctx.restore();
    }

    if (dragRect) {
      ctx.save();
      ctx.strokeStyle = '#b5654a';
      ctx.fillStyle = 'rgba(181,101,74,0.08)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(dragRect.x * cs, dragRect.y * cs, dragRect.w * cs, dragRect.h * cs);
      ctx.strokeRect(dragRect.x * cs, dragRect.y * cs, dragRect.w * cs, dragRect.h * cs);
      ctx.restore();
    }
  }, [design, activeAreaId, cs, dragRect]);

  // ----- helpers -----
  const cellAt = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const scale = r.width / canvas.width;
    const x = Math.floor((clientX - r.left) / (cs * scale));
    const y = Math.floor((clientY - r.top) / (cs * scale));
    return [
      Math.max(0, Math.min(design.gridW - 1, x)),
      Math.max(0, Math.min(design.gridH - 1, y)),
    ];
  };

  const areaAt = (cx: number, cy: number): Area | null => {
    // topmost area containing the cell (last drawn wins visually → search reversed)
    for (let i = design.areas.length - 1; i >= 0; i--) {
      const a = design.areas[i];
      if (cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h) return a;
    }
    return null;
  };

  const updateArea = (id: string, fn: (a: Area) => Area) => {
    onChange({
      ...design,
      areas: design.areas.map((a) => (a.id === id ? fn(a) : a)),
    });
  };

  // ----- drag-select to make an area -----
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const [cx, cy] = cellAt(e.clientX, e.clientY);
    const hit = areaAt(cx, cy);
    if (hit) {
      setActiveAreaId(hit.id);
      return;
    }
    dragRef.current = { x0: cx, y0: cy, x1: cx, y1: cy };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const [cx, cy] = cellAt(e.clientX, e.clientY);
    dragRef.current.x1 = cx;
    dragRef.current.y1 = cy;
    const d = dragRef.current;
    setDragRect({
      x: Math.min(d.x0, d.x1),
      y: Math.min(d.y0, d.y1),
      w: Math.abs(d.x1 - d.x0) + 1,
      h: Math.abs(d.y1 - d.y0) + 1,
    });
  };

  const onMouseUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !dragRect) {
      setDragRect(null);
      return;
    }
    const rect = dragRect;
    setDragRect(null);
    if (rect.w < 2 || rect.h < 2) return; // ignore tiny accidental drags
    const name = prompt('Name this area', `area ${design.areas.length + 1}`);
    if (name === null) return;
    const area: Area = {
      id: newId('area'),
      name: name.trim() || `area ${design.areas.length + 1}`,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      motifs: [],
    };
    onChange({ ...design, areas: [...design.areas, area] });
    setActiveAreaId(area.id);
  };

  // ----- drop a library card onto the canvas -----
  const onDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    const entry = library.find((l) => l.key === key);
    if (!entry) return;
    const [cx, cy] = cellAt(e.clientX, e.clientY);

    // merge the motif palette into the design palette
    const merged = mergePalette(design.palette, patternPalette(entry.pattern));
    const cells = remapCells(entry.pattern.cells, merged.indexMap);

    let target = areaAt(cx, cy);
    let areas = design.areas;

    if (!target) {
      // auto-wrap a new area sized to the motif, clamped on-grid
      const ax = Math.min(cx, design.gridW - entry.pattern.width);
      const ay = Math.min(cy, design.gridH - entry.pattern.height);
      target = {
        id: newId('area'),
        name: entry.pattern.name || 'motif',
        x: Math.max(0, ax),
        y: Math.max(0, ay),
        w: Math.min(entry.pattern.width, design.gridW),
        h: Math.min(entry.pattern.height, design.gridH),
        motifs: [],
      };
      areas = [...areas, target];
    }

    // if target is a repeat area and has no repeat motif yet, become the repeat motif
    if (target.repeat && target.repeat.cells.length === 0) {
      target = { ...target, repeat: { ...target.repeat, patternKey: key, cells } };
    } else if (target.repeat) {
      showToast('This area repeats one motif — clear repeat to place freely.');
      onChange({ ...design, palette: merged.palette, areas });
      setActiveAreaId(target.id);
      return;
    } else {
      // free placement: clamp top-left inside the area
      const lx = Math.max(0, Math.min(cx - target.x, target.w - 1));
      const ly = Math.max(0, Math.min(cy - target.y, target.h - 1));
      const motif = { patternKey: key, cells, x: lx, y: ly };
      target = { ...target, motifs: [...target.motifs, motif] };
    }

    const finalTarget = target;
    onChange({
      ...design,
      palette: merged.palette,
      areas: areas.map((a) => (a.id === finalTarget.id ? finalTarget : a)),
    });
    setActiveAreaId(finalTarget.id);
  };

  const filteredLib = library.filter((l) => {
    if (!matches(l.pattern, query)) return false;
    if (fitOnly && activeArea) {
      if (l.pattern.width > activeArea.w || l.pattern.height > activeArea.h) return false;
    }
    return true;
  });

  return (
    <div className="design-composer">
      {/* Left: library browser */}
      <aside className="design-lib">
        <div className="design-lib-head">
          <button className="btn-ghost btn-sm" type="button" onClick={onClose}>
            ← Designs
          </button>
          <strong>{design.name}</strong>
        </div>
        <input
          type="search"
          className="design-lib-search"
          placeholder="Search patterns…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="design-fit-toggle">
          <input
            type="checkbox"
            checked={fitOnly}
            disabled={!activeArea}
            onChange={(e) => setFitOnly(e.target.checked)}
          />
          Fits active area{activeArea ? ` (≤ ${activeArea.w}×${activeArea.h})` : ''}
        </label>
        <div className="design-lib-grid">
          {filteredLib.slice(0, 120).map((l) => (
            <div
              key={l.key}
              className="design-lib-card"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', l.key);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={`${l.pattern.name} · ${l.pattern.width}×${l.pattern.height}`}
            >
              <PatternThumb pattern={l.pattern} width={88} height={70} />
              <div className="design-lib-card-name">{l.pattern.name}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: canvas */}
      <div className="design-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="design-canvas"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => {
            if (dragRef.current) onMouseUp();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={onDrop}
        />
        <p className="design-canvas-hint">
          Drag-select an empty region to make an area · drag a pattern from the left onto the
          canvas
        </p>
      </div>

      {/* Right: inspector */}
      <aside className="design-inspector">
        <Inspector
          design={design}
          area={activeArea}
          onChange={onChange}
          updateArea={updateArea}
          onDeleteArea={(id) => {
            onChange({ ...design, areas: design.areas.filter((a) => a.id !== id) });
            setActiveAreaId(null);
          }}
          onPlanArea={(area) => {
            const sub = compositeArea(area, design.palette);
            onPlanArea(sub, `design:${design.id}:${area.id}`);
          }}
        />
      </aside>
    </div>
  );
}

// ---------- Inspector ----------

function Inspector({
  design,
  area,
  onChange,
  updateArea,
  onDeleteArea,
  onPlanArea,
}: {
  design: Design;
  area: Area | null;
  onChange: (d: Design) => void;
  updateArea: (id: string, fn: (a: Area) => Area) => void;
  onDeleteArea: (id: string) => void;
  onPlanArea: (a: Area) => void;
}) {
  const cloth = getCloth(design.clothId);

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <span>Design</span>
          <span dir="rtl">التصميم</span>
        </div>
        <div className="design-setup">
          <label className="field">
            <span>Cloth</span>
            <select
              value={design.clothId}
              onChange={(e) => {
                const c = getCloth(e.target.value);
                onChange({
                  ...design,
                  clothId: e.target.value,
                  gridW: cmToCells(design.widthCm, c),
                  gridH: cmToCells(design.heightCm, c),
                });
              }}
            >
              {CLOTH_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Strands</span>
            <select
              value={design.strandsId}
              onChange={(e) => onChange({ ...design, strandsId: e.target.value })}
            >
              {STRAND_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="design-setup-meta">
            {design.widthCm}×{design.heightCm} cm · {design.gridW}×{design.gridH} stitches on{' '}
            {cloth.label}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <span>Area</span>
          <span dir="rtl">المنطقة</span>
        </div>
        {!area ? (
          <p className="empty-hint">Select or drag-select an area on the canvas.</p>
        ) : (
          <AreaPanel
            area={area}
            updateArea={updateArea}
            onDeleteArea={onDeleteArea}
            onPlanArea={onPlanArea}
          />
        )}
      </section>
    </>
  );
}

function AreaPanel({
  area,
  updateArea,
  onDeleteArea,
  onPlanArea,
}: {
  area: Area;
  updateArea: (id: string, fn: (a: Area) => Area) => void;
  onDeleteArea: (id: string) => void;
  onPlanArea: (a: Area) => void;
}) {
  const repeating = !!area.repeat;
  const repeatCells = area.repeat?.cells ?? [];
  const mh = repeatCells.length;
  const mw = mh > 0 ? repeatCells[0].length : 0;
  const fit = repeating && mw > 0 ? repeatFit(area, mw, mh, area.repeat!.mode) : null;

  return (
    <div className="design-area">
      <label className="field">
        <span>Name</span>
        <input
          value={area.name}
          onChange={(e) => updateArea(area.id, (a) => ({ ...a, name: e.target.value }))}
        />
      </label>
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
          onClick={() => {
            if (confirm(`Delete area "${area.name}"?`)) onDeleteArea(area.id);
          }}
        >
          Delete area
        </button>
      </div>
    </div>
  );
}
