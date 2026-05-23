import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColorIndex, Pattern } from '../engine/types';
import {
  type Area,
  type Design,
  type RepeatMode,
  cmToCells,
  compositeArea,
  flipX,
  flipY,
  mergePalette,
  newId,
  patternPalette,
  remapCells,
  repeatFit,
  rotateTurns,
  trimCells,
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
import {
  GUTTER,
  cellSize,
  clearCanvas,
  drawAxisLabels,
  drawGridLines,
  drawPatternBackground,
} from './canvasUtil';
import {
  COLOR_BUCKETS,
  COMPLEXITY_FILTERS,
  SIZE_FILTERS,
  colorCount,
  complexityBucket,
  matchesQuery,
  paintedCells,
  sizeBucket,
  type ColorBucket,
  type ComplexityBucket,
  type SizeBucket,
} from './patternFilters';

interface Props {
  /** Route a composited area to the Plan tab. */
  onPlanArea: (pattern: Pattern, key: string) => void;
  showToast: (msg: string) => void;
}

/** Max canvas backing height; width fills the residual column. */
const CANVAS_MAX_H = 560;

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

export default function DesignTab({ onPlanArea }: Props) {
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
}: {
  design: Design;
  onChange: (d: Design) => void;
  onClose: () => void;
  onPlanArea: (pattern: Pattern, key: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(640);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(
    design.areas[0]?.id ?? null,
  );
  const [query, setQuery] = useState('');
  const [fitOnly, setFitOnly] = useState(false);
  const [fRegion, setFRegion] = useState<string | null>(null);
  const [fColors, setFColors] = useState<ColorBucket | null>(null);
  const [fSize, setFSize] = useState<SizeBucket | null>(null);
  const [fComplexity, setFComplexity] = useState<ComplexityBucket | null>(null);

  const library = useMemo(() => buildLibrary(), []);
  const activeArea = design.areas.find((a) => a.id === activeAreaId) ?? null;

  // Region chips from the loaded library (same source as the Library tab).
  const regions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of library) {
      const r = l.pattern.source?.region;
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [library]);

  // Pointer interaction: either moving an area or rotating one. Move tracks
  // the grab offset so the motif doesn't jump to the cursor's corner; rotate
  // tracks a live preview angle that snaps to 90° on release.
  type Interaction =
    | { kind: 'move'; areaId: string; offX: number; offY: number }
    | { kind: 'rotate'; areaId: string; cx: number; cy: number; angle: number };
  const interactionRef = useRef<Interaction | null>(null);

  // Canvas fills the residual column width; height follows the cloth aspect
  // ratio, capped so very tall designs don't blow out the layout.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWrapW(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reserve GUTTER px on the top + left for row/column number labels; the
  // grid is drawn translated by GUTTER so all `x*cs` drawing stays unchanged.
  const aspect = design.gridH / design.gridW;
  const canvasW = wrapW;
  const canvasH = Math.min(CANVAS_MAX_H, Math.round(canvasW * aspect)) + GUTTER;
  const cs = cellSize(canvasW - GUTTER, canvasH - GUTTER, design.gridW, design.gridH);

  // Pixel length of the rotate handle's stem above an area.
  const HANDLE_STEM = 22;
  const HANDLE_HIT = 9;

  // ----- rendering -----
  // Drawn imperatively (called from the effect AND from pointer handlers) so
  // live move/rotate previews, which live in a ref, render at pointer speed
  // without a React state churn per frame.
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset (draw() is re-invoked imperatively)
    clearCanvas(ctx, canvas.width, canvas.height);
    drawAxisLabels(ctx, cs, design.gridW, design.gridH);
    // Everything below draws in grid space, offset past the number gutter.
    ctx.translate(GUTTER, GUTTER);
    drawGridLines(ctx, cs, design.gridW, design.gridH, 'rgba(0,0,0,0.06)');

    const interaction = interactionRef.current;

    for (const area of design.areas) {
      const isActive = area.id === activeAreaId;
      const sub = compositeArea(area, design.palette);

      // Live rotation preview: rotate the composite freely about the area
      // centre. Otherwise draw it axis-aligned at the area position.
      const rotating = interaction?.kind === 'rotate' && interaction.areaId === area.id;
      ctx.save();
      if (rotating) {
        const ccx = (area.x + area.w / 2) * cs;
        const ccy = (area.y + area.h / 2) * cs;
        ctx.translate(ccx, ccy);
        ctx.rotate(interaction.angle);
        ctx.translate(-area.w * cs * 0.5, -area.h * cs * 0.5);
        drawPatternBackground(ctx, sub, cs);
      } else {
        ctx.translate(area.x * cs, area.y * cs);
        drawPatternBackground(ctx, sub, cs);
      }
      ctx.restore();

      // area frame
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

      // rotate handle on the active area: a stem + knob above the top edge
      if (isActive) {
        const hx = (area.x + area.w / 2) * cs;
        const topY = area.y * cs;
        ctx.save();
        ctx.strokeStyle = '#b5654a';
        ctx.fillStyle = '#b5654a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(hx, topY);
        ctx.lineTo(hx, topY - HANDLE_STEM);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, topY - HANDLE_STEM, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  // Redraw whenever the design, selection, or canvas size changes.
  useEffect(draw);

  // ----- helpers -----
  // Pointer position in grid-space pixels: canvas pixels (un-scaling CSS),
  // minus the number gutter, so it matches the translated grid drawing where
  // (0,0) is the grid origin.
  const pointerPx = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const scale = r.width / canvas.width;
    return [(clientX - r.left) / scale - GUTTER, (clientY - r.top) / scale - GUTTER];
  };

  const cellAt = (clientX: number, clientY: number): [number, number] => {
    const [px, py] = pointerPx(clientX, clientY);
    return [
      Math.max(0, Math.min(design.gridW - 1, Math.floor(px / cs))),
      Math.max(0, Math.min(design.gridH - 1, Math.floor(py / cs))),
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

  // Does the pointer hit the active area's rotate knob?
  const overRotateHandle = (clientX: number, clientY: number): boolean => {
    if (!activeArea) return false;
    const [px, py] = pointerPx(clientX, clientY);
    const hx = (activeArea.x + activeArea.w / 2) * cs;
    const hy = activeArea.y * cs - HANDLE_STEM;
    return Math.hypot(px - hx, py - hy) <= HANDLE_HIT;
  };

  const updateArea = (id: string, fn: (a: Area) => Area) => {
    onChange({
      ...design,
      areas: design.areas.map((a) => (a.id === id ? fn(a) : a)),
    });
  };

  // Apply N clockwise 90° turns to an area's content, swapping w/h on odd
  // turns and keeping the area centred so it doesn't drift on rotation.
  const rotateArea = (area: Area, turns: number): Area => {
    const n = ((turns % 4) + 4) % 4;
    if (n === 0) return area;
    const swap = n % 2 === 1;
    const newW = swap ? area.h : area.w;
    const newH = swap ? area.w : area.h;
    const ccx = area.x + area.w / 2;
    const ccy = area.y + area.h / 2;
    const nx = Math.round(ccx - newW / 2);
    const ny = Math.round(ccy - newH / 2);
    const rot = (cells: ColorIndex[][]) => rotateTurns(cells, n);
    return {
      ...area,
      x: Math.max(0, Math.min(nx, design.gridW - newW)),
      y: Math.max(0, Math.min(ny, design.gridH - newH)),
      w: newW,
      h: newH,
      motifs: area.motifs.map((m) => ({ ...m, cells: rot(m.cells), x: 0, y: 0 })),
      repeat: area.repeat ? { ...area.repeat, cells: rot(area.repeat.cells) } : undefined,
    };
  };

  const flipArea = (area: Area, axis: 'x' | 'y'): Area => {
    const f = axis === 'x' ? flipX : flipY;
    return {
      ...area,
      motifs: area.motifs.map((m) => ({ ...m, cells: f(m.cells) })),
      repeat: area.repeat ? { ...area.repeat, cells: f(area.repeat.cells) } : undefined,
    };
  };

  // ----- pointer: select / move / rotate -----
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Rotate handle takes priority over body hits.
    if (overRotateHandle(e.clientX, e.clientY) && activeArea) {
      interactionRef.current = {
        kind: 'rotate',
        areaId: activeArea.id,
        cx: activeArea.x + activeArea.w / 2,
        cy: activeArea.y + activeArea.h / 2,
        angle: 0,
      };
      return;
    }
    const [cx, cy] = cellAt(e.clientX, e.clientY);
    const hit = areaAt(cx, cy);
    if (hit) {
      setActiveAreaId(hit.id);
      interactionRef.current = { kind: 'move', areaId: hit.id, offX: cx - hit.x, offY: cy - hit.y };
    } else {
      setActiveAreaId(null);
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const it = interactionRef.current;
    if (!it) return;
    if (it.kind === 'move') {
      const [cx, cy] = cellAt(e.clientX, e.clientY);
      const area = design.areas.find((a) => a.id === it.areaId);
      if (!area) return;
      const nx = Math.max(0, Math.min(cx - it.offX, design.gridW - area.w));
      const ny = Math.max(0, Math.min(cy - it.offY, design.gridH - area.h));
      if (nx !== area.x || ny !== area.y) updateArea(area.id, (a) => ({ ...a, x: nx, y: ny }));
    } else {
      // rotate: angle from area centre to pointer; Alt snaps to 90° live.
      const [px, py] = pointerPx(e.clientX, e.clientY);
      const ccx = it.cx * cs;
      const ccy = it.cy * cs;
      let angle = Math.atan2(py - ccy, px - ccx) + Math.PI / 2; // 0 = pointing up
      if (e.altKey) angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      interactionRef.current = { ...it, angle };
      draw();
    }
  };

  const onMouseUp = () => {
    const it = interactionRef.current;
    interactionRef.current = null;
    if (!it) return;
    if (it.kind === 'rotate') {
      // Snap the free angle to the nearest quarter turn (clockwise positive).
      const turns = Math.round(it.angle / (Math.PI / 2));
      const area = design.areas.find((a) => a.id === it.areaId);
      if (area && ((turns % 4) + 4) % 4 !== 0) {
        updateArea(area.id, (a) => rotateArea(a, turns));
      } else {
        draw(); // clear the preview transform
      }
    }
  };

  // ----- drop a library card onto the canvas: make a tight 1-motif area -----
  const onDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    const entry = library.find((l) => l.key === key);
    if (!entry) return;
    const [cx, cy] = cellAt(e.clientX, e.clientY);

    const merged = mergePalette(design.palette, patternPalette(entry.pattern));
    // Trim the source chart's blank margins so the area hugs the visible motif.
    const cells = trimCells(remapCells(entry.pattern.cells, merged.indexMap));
    const existing = areaAt(cx, cy);

    // Dropping onto a repeat area with no motif yet sets its repeat motif.
    if (existing?.repeat && existing.repeat.cells.length === 0) {
      const target = { ...existing, repeat: { ...existing.repeat, patternKey: key, cells } };
      onChange({
        ...design,
        palette: merged.palette,
        areas: design.areas.map((a) => (a.id === target.id ? target : a)),
      });
      setActiveAreaId(target.id);
      return;
    }

    // Otherwise create a new tight area hugging the motif, positioned at the
    // drop point and clamped on-grid. Size = trimmed motif dimensions.
    const mh = cells.length;
    const mw = mh > 0 ? cells[0].length : 1;
    const w = Math.min(mw, design.gridW);
    const h = Math.min(mh, design.gridH);
    const ax = Math.max(0, Math.min(cx, design.gridW - w));
    const ay = Math.max(0, Math.min(cy, design.gridH - h));
    const area: Area = {
      id: newId('area'),
      name: entry.pattern.name || 'motif',
      x: ax,
      y: ay,
      w,
      h,
      motifs: [{ patternKey: key, cells, x: 0, y: 0 }],
    };
    onChange({ ...design, palette: merged.palette, areas: [...design.areas, area] });
    setActiveAreaId(area.id);
  };

  const filteredLib = library.filter((l) => {
    const p = l.pattern;
    if (!matchesQuery(p, query)) return false;
    if (fRegion && p.source?.region !== fRegion) return false;
    if (fColors !== null) {
      const c = colorCount(p);
      if (fColors === 5 ? c < 5 : c !== fColors) return false;
    }
    if (fSize && sizeBucket(p) !== fSize) return false;
    if (fComplexity && complexityBucket(paintedCells(p)) !== fComplexity) return false;
    if (fitOnly && activeArea) {
      if (p.width > activeArea.w || p.height > activeArea.h) return false;
    }
    return true;
  });

  const anyFilter =
    query.length > 0 ||
    fRegion !== null ||
    fColors !== null ||
    fSize !== null ||
    fComplexity !== null ||
    fitOnly;

  const clearFilters = () => {
    setQuery('');
    setFRegion(null);
    setFColors(null);
    setFSize(null);
    setFComplexity(null);
    setFitOnly(false);
  };

  // Split the capped results between the L's two arms: a left column and a
  // bottom strip. Caps keep the L full without per-strip scroll fights —
  // narrow the dropdowns to reach motifs beyond the cap.
  // Left column shows as many cards as fit beside the canvas (≈106px each);
  // the rest spill into the bottom strip. Caps keep the L full without a
  // cramped scroll box — narrow the dropdowns to reach motifs beyond them.
  const CARD_PX = 106;
  const LEFT_CAP = Math.max(3, Math.floor((canvasH - GUTTER) / CARD_PX));
  const BOTTOM_CAP = 12;
  const leftMotifs = filteredLib.slice(0, LEFT_CAP);
  const bottomMotifs = filteredLib.slice(LEFT_CAP, LEFT_CAP + BOTTOM_CAP);
  const totalShown = Math.min(filteredLib.length, LEFT_CAP + BOTTOM_CAP);

  return (
    <div className="design-composer">
      {/* Top: cloth + size + strands — the first choice, full width */}
      <ClothBar design={design} onChange={onChange} onClose={onClose} />

      {/* Filter row: search + compact dropdowns, one line */}
      <div className="design-filterbar">
        <label className="filter-search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search patterns…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search patterns"
          />
        </label>

        {regions.length > 0 && (
          <select
            className="design-filter-select"
            value={fRegion ?? ''}
            onChange={(e) => setFRegion(e.target.value || null)}
            aria-label="Region"
          >
            <option value="">Region · المنطقة</option>
            {regions.map(([region, count]) => (
              <option key={region} value={region}>
                {region} ({count})
              </option>
            ))}
          </select>
        )}

        <select
          className="design-filter-select"
          value={fColors ?? ''}
          onChange={(e) => setFColors(e.target.value ? (Number(e.target.value) as ColorBucket) : null)}
          aria-label="Colors"
        >
          <option value="">Colors · الألوان</option>
          {COLOR_BUCKETS.map((n) => (
            <option key={n} value={n}>
              {n === 5 ? '5+ colors' : `${n} color${n === 1 ? '' : 's'}`}
            </option>
          ))}
        </select>

        <select
          className="design-filter-select"
          value={fSize ?? ''}
          onChange={(e) => setFSize((e.target.value || null) as SizeBucket | null)}
          aria-label="Size"
        >
          <option value="">Size · الحجم</option>
          {SIZE_FILTERS.map(([bucket, label]) => (
            <option key={bucket} value={bucket}>
              {label}
            </option>
          ))}
        </select>

        <select
          className="design-filter-select"
          value={fComplexity ?? ''}
          onChange={(e) => setFComplexity((e.target.value || null) as ComplexityBucket | null)}
          aria-label="Complexity"
        >
          <option value="">Complexity · التعقيد</option>
          {COMPLEXITY_FILTERS.map(([bucket, label]) => (
            <option key={bucket} value={bucket}>
              {label}
            </option>
          ))}
        </select>

        <label className="design-fit-toggle">
          <input
            type="checkbox"
            checked={fitOnly}
            disabled={!activeArea}
            onChange={(e) => setFitOnly(e.target.checked)}
          />
          Fits area
        </label>

        <span className="design-filter-count">
          {filteredLib.length === 0
            ? 'no matches'
            : `${totalShown} of ${filteredLib.length}`}
        </span>
        {anyFilter && (
          <button className="btn-ghost btn-sm" type="button" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {/* L-shape: left motif column + canvas + right inspector, then bottom strip */}
      <div className="design-body-l">
        {/* Cap the left column to the canvas's displayed height so the bottom
            strip hugs the canvas bottom instead of floating far below it. */}
        <aside className="design-motif-col" style={{ maxHeight: canvasH }}>
          {leftMotifs.length === 0 ? (
            <p className="empty-hint">No patterns match.</p>
          ) : (
            leftMotifs.map((l) => <MotifCard key={l.key} entry={l} />)
          )}
        </aside>

        <div className="design-canvas-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            className="design-canvas"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              if (interactionRef.current) onMouseUp();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={onDrop}
          />
          <p className="design-canvas-hint">
            Drag a pattern onto the canvas · drag a placed motif to move it · use the handle above it
            to rotate (hold Alt to snap to 90°)
          </p>
        </div>

        <aside className="design-inspector">
          <AreaInspector
            area={activeArea}
            updateArea={updateArea}
            onRotate={(a) => updateArea(a.id, (cur) => rotateArea(cur, 1))}
            onFlip={(a, axis) => updateArea(a.id, (cur) => flipArea(cur, axis))}
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

        {/* Bottom strip: continues the L under the left column + canvas */}
        <div className="design-motif-strip">
          {bottomMotifs.map((l) => (
            <MotifCard key={l.key} entry={l} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A draggable motif thumbnail used in both arms of the L. */
function MotifCard({ entry }: { entry: LibEntry }) {
  return (
    <div
      className="design-lib-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', entry.key);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={`${entry.pattern.name} · ${entry.pattern.width}×${entry.pattern.height}`}
    >
      <PatternThumb pattern={entry.pattern} width={104} height={82} />
      <div className="design-lib-card-name">{entry.pattern.name}</div>
    </div>
  );
}

// ---------- Cloth bar (top, full width) ----------

function ClothBar({
  design,
  onChange,
  onClose,
}: {
  design: Design;
  onChange: (d: Design) => void;
  onClose: () => void;
}) {
  const cloth = getCloth(design.clothId);
  return (
    <section className="design-clothbar">
      <button className="btn-ghost btn-sm" type="button" onClick={onClose}>
        ← Designs
      </button>
      <strong className="design-clothbar-name">{design.name}</strong>
      <label className="field field-inline">
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
      <label className="field field-inline">
        <span>Width (cm)</span>
        <input
          type="number"
          min={1}
          value={design.widthCm}
          onChange={(e) => {
            const widthCm = Math.max(1, Number(e.target.value) || 1);
            onChange({ ...design, widthCm, gridW: cmToCells(widthCm, cloth) });
          }}
        />
      </label>
      <label className="field field-inline">
        <span>Height (cm)</span>
        <input
          type="number"
          min={1}
          value={design.heightCm}
          onChange={(e) => {
            const heightCm = Math.max(1, Number(e.target.value) || 1);
            onChange({ ...design, heightCm, gridH: cmToCells(heightCm, cloth) });
          }}
        />
      </label>
      <label className="field field-inline">
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
      <span className="design-clothbar-meta">
        {design.gridW}×{design.gridH} stitches
      </span>
    </section>
  );
}

// ---------- Area inspector ----------

function AreaInspector({
  area,
  updateArea,
  onRotate,
  onFlip,
  onDeleteArea,
  onPlanArea,
}: {
  area: Area | null;
  updateArea: (id: string, fn: (a: Area) => Area) => void;
  onRotate: (a: Area) => void;
  onFlip: (a: Area, axis: 'x' | 'y') => void;
  onDeleteArea: (id: string) => void;
  onPlanArea: (a: Area) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-h">
        <span>Area</span>
        <span dir="rtl">المنطقة</span>
      </div>
      {!area ? (
        <p className="empty-hint">Drop a pattern on the canvas, then click it to select.</p>
      ) : (
        <AreaPanel
          area={area}
          updateArea={updateArea}
          onRotate={onRotate}
          onFlip={onFlip}
          onDeleteArea={onDeleteArea}
          onPlanArea={onPlanArea}
        />
      )}
    </section>
  );
}

function AreaPanel({
  area,
  updateArea,
  onRotate,
  onFlip,
  onDeleteArea,
  onPlanArea,
}: {
  area: Area;
  updateArea: (id: string, fn: (a: Area) => Area) => void;
  onRotate: (a: Area) => void;
  onFlip: (a: Area, axis: 'x' | 'y') => void;
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

      {/* Transform: rotate 90° + flip. Mirror the canvas rotate handle. */}
      <div className="design-transform">
        <button type="button" className="chip" onClick={() => onRotate(area)} title="Rotate 90° clockwise">
          ⟳ 90°
        </button>
        <button type="button" className="chip" onClick={() => onFlip(area, 'x')} title="Flip horizontally">
          ⇋ Flip X
        </button>
        <button type="button" className="chip" onClick={() => onFlip(area, 'y')} title="Flip vertically">
          ⇅ Flip Y
        </button>
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

// ---------- Filter UI helpers ----------

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
