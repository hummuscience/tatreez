import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColorIndex, Palette, PaletteColor, Pattern } from '../engine/types';
import {
  type Area,
  type Design,
  type RepeatMode,
  areaUsedColors,
  cellsToCm,
  cmToCells,
  composeBorder,
  compositeArea,
  createDesign,
  decomposeBorder,
  flipX,
  flipY,
  inchesToCells,
  mergePalette,
  newId,
  patternPalette,
  placeMotif,
  recolorAreaIndex,
  remapCells,
  repeatFit,
  rotateTurns,
  trimCells,
} from '../project/design';
import { libraryDmcNumbers } from '../patterns/dmcCatalog';
import ColorReplacePopover from './ColorReplacePopover';
import {
  CLOTH_OPTIONS,
  DEFAULT_CLOTH_ID,
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
  isBorderPattern,
  matchesQuery,
  paintedCells,
  paintedSize,
  sizeBucket,
  type ColorBucket,
  type ComplexityBucket,
  type SizeBucket,
} from './patternFilters';

/**
 * Slack (in stitches) for the "fits area" filter: a pattern up to this many
 * cells larger than the marked area on either dimension still counts as
 * fitting, so a near-fit isn't excluded over a few stitches.
 */
const FIT_TOLERANCE = 5;

interface Props {
  /** Route a composited area to the Plan tab. */
  onPlanArea: (pattern: Pattern, key: string) => void;
  showToast: (msg: string) => void;
  /**
   * A motif handed off from the library "Add to design" action: open this
   * design and auto-place the motif as a new area. Null when there's nothing
   * pending.
   */
  pendingMotif?: { key: string; pattern: Pattern; designId: string } | null;
  /** Called once the pending motif has been placed, so the parent can clear it. */
  onConsumedMotif?: () => void;
}

/** A library entry the browser can show and drag. */
interface LibEntry {
  key: string;
  pattern: Pattern;
  /** Painted bounding-box size (what the motif occupies once placed/trimmed). */
  fitW: number;
  fitH: number;
}

function buildLibrary(): LibEntry[] {
  const out: LibEntry[] = [];
  const add = (key: string, pattern: Pattern) => {
    const { w, h } = paintedSize(pattern);
    // Fall back to the full chart size for an all-empty pattern.
    out.push({ key, pattern, fitW: w || pattern.width, fitH: h || pattern.height });
  };
  for (const [id, p] of Object.entries(BUILTIN_PATTERNS)) add(builtinPatternKey(id), p);
  for (const s of listSavedPatterns()) add(savedPatternKey(s.id), s.pattern);
  for (const [slug, p] of Object.entries(TIRAZAIN_ARCHIVE)) add(`tirazain:${slug}`, p);
  return out;
}

export default function DesignTab({
  onPlanArea,
  pendingMotif,
  onConsumedMotif,
}: Props) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [design, setDesign] = useState<Design | null>(null);

  useEffect(() => {
    setDesigns(listDesigns());
  }, []);

  // Consume a motif handed off from the library "Add to design" action: open
  // the chosen design (from storage so it's the persisted copy) and place the
  // motif as a new area, then tell the parent we've consumed it.
  useEffect(() => {
    if (!pendingMotif) return;
    const target = listDesigns().find((d) => d.id === pendingMotif.designId);
    if (!target) {
      onConsumedMotif?.();
      return;
    }
    const next = placeMotif(
      target,
      { key: pendingMotif.key, pattern: pendingMotif.pattern },
      0,
      0,
    );
    setDesign(next); // the persist effect saves it and refreshes the list
    onConsumedMotif?.();
    // Re-run only when a new motif arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMotif]);

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
  type SizeUnit = 'cm' | 'in' | 'st';
  const [unit, setUnit] = useState<SizeUnit>(() => {
    try { return (localStorage.getItem('design:sizeUnit') as SizeUnit) || 'cm'; } catch { return 'cm'; }
  });
  useEffect(() => {
    try { localStorage.setItem('design:sizeUnit', unit); } catch { /* noop */ }
  }, [unit]);

  const cloth = getCloth(clothId);
  const gridW = cmToCells(widthCm, cloth);
  const gridH = cmToCells(heightCm, cloth);

  // Display + edit values in the chosen unit (storage is always cm).
  const displayW = unit === 'cm' ? widthCm : unit === 'in' ? Math.round((widthCm / 2.54) * 10) / 10 : gridW;
  const displayH = unit === 'cm' ? heightCm : unit === 'in' ? Math.round((heightCm / 2.54) * 10) / 10 : gridH;
  const setFromInput = (raw: string, setCm: (cm: number) => void) => {
    const v = Math.max(1, Number(raw) || 1);
    if (unit === 'cm') setCm(v);
    else if (unit === 'in') setCm(v * 2.54);
    else setCm(cellsToCm(v, cloth));
  };

  const create = () => {
    onCreate(createDesign({ name, clothId, widthCm, heightCm }));
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
            <span>Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)}>
              <option value="cm">cm</option>
              <option value="in">inches</option>
              <option value="st">stitches</option>
            </select>
          </label>
          <label className="field">
            <span>Width ({unit})</span>
            <input
              type="number"
              min={1}
              step={unit === 'st' ? 1 : 0.1}
              value={displayW}
              onChange={(e) => setFromInput(e.target.value, setWidthCm)}
            />
          </label>
          <label className="field">
            <span>Height ({unit})</span>
            <input
              type="number"
              min={1}
              step={unit === 'st' ? 1 : 0.1}
              value={displayH}
              onChange={(e) => setFromInput(e.target.value, setHeightCm)}
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
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(640);
  const [zoom, setZoom] = useState(1);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(
    design.areas[0]?.id ?? null,
  );
  // Multi-selection of area ids. The "active" id (above) is the primary one
  // that drives the inspector + fit-filter; it is always part of this set.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(design.areas[0]?.id ? [design.areas[0].id] : []),
  );
  // Copy/paste clipboard for duplicating areas (cells, size, repeat).
  const clipboardRef = useRef<Area[] | null>(null);

  // Select a single area (clears any multi-selection).
  const selectOne = (id: string | null) => {
    setActiveAreaId(id);
    setSelectedIds(id ? new Set([id]) : new Set());
  };
  // Toggle one area in/out of the multi-selection (shift/ctrl-click).
  const toggleSelected = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) {
        next.delete(id);
        if (activeAreaId === id) setActiveAreaId(next.values().next().value ?? null);
      } else {
        next.add(id);
        setActiveAreaId(id);
      }
      return next;
    });
  };
  const [query, setQuery] = useState('');
  const [fitOnly, setFitOnly] = useState(false);
  const [fRegion, setFRegion] = useState<string | null>(null);
  const [fColors, setFColors] = useState<ColorBucket | null>(null);
  const [fSize, setFSize] = useState<SizeBucket | null>(null);
  const [fComplexity, setFComplexity] = useState<ComplexityBucket | null>(null);
  // "Border" library filter: shows only patterns whose name reads as a
  // border (Sinsal, Nafnoof Border, Dayer Qabbeh, etc.). Derived from name
  // text — no curation needed.
  const [bordersOnly, setBordersOnly] = useState(false);
  // Border-draw tool: when on, dragging on the canvas tiles the armed motif
  // along the drag axis instead of marking a filter area.
  const [borderMode, setBorderMode] = useState(false);
  // Overflow banner: surfaced when a placed/drawn motif's natural size
  // exceeds the canvas grid. Carries the suggested grow-to size so the
  // banner button can apply it in one tap.
  const [overflowSuggest, setOverflowSuggest] =
    useState<{ gridW: number; gridH: number } | null>(null);
  const BUFFER = 4;
  // Compare the requested cell extents to the current grid and, if either
  // dimension overflows, set a suggestion to grow with a small buffer on
  // each side. Caller still places the (clamped) motif; this just opens a
  // dismissable banner.
  const suggestGrowIfOverflow = (needW: number, needH: number) => {
    if (needW <= design.gridW && needH <= design.gridH) return;
    const nextW = Math.max(design.gridW, needW + BUFFER * 2);
    const nextH = Math.max(design.gridH, needH + BUFFER * 2);
    setOverflowSuggest({ gridW: nextW, gridH: nextH });
  };
  // Apply the suggestion: bump the grid and convert the new size to cm so
  // storage stays unit-consistent.
  const growCanvasToSuggestion = () => {
    if (!overflowSuggest) return;
    const cloth = getCloth(design.clothId);
    onChange({
      ...design,
      gridW: overflowSuggest.gridW,
      gridH: overflowSuggest.gridH,
      widthCm: cellsToCm(overflowSuggest.gridW, cloth),
      heightCm: cellsToCm(overflowSuggest.gridH, cloth),
    });
    setOverflowSuggest(null);
  };

  // Shrink the canvas to a tight fit around all concrete areas (motif or
  // repeat areas — empty markers are ignored, they're transient drawing
  // aids). Adds BUFFER stitches of margin on every side so motifs aren't
  // touching the edge. Shifts every area so the bounding-box top-left lands
  // at (BUFFER, BUFFER). No-op when the canvas has no painted areas.
  const fitCanvasToContent = () => {
    const concrete = design.areas.filter((a) => a.motifs.length > 0 || a.repeat);
    if (concrete.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of concrete) {
      if (a.x < minX) minX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.x + a.w > maxX) maxX = a.x + a.w;
      if (a.y + a.h > maxY) maxY = a.y + a.h;
    }
    const dx = BUFFER - minX;
    const dy = BUFFER - minY;
    const nextW = (maxX - minX) + BUFFER * 2;
    const nextH = (maxY - minY) + BUFFER * 2;
    if (nextW === design.gridW && nextH === design.gridH && dx === 0 && dy === 0) return;
    const cloth = getCloth(design.clothId);
    onChange({
      ...design,
      gridW: nextW,
      gridH: nextH,
      widthCm: cellsToCm(nextW, cloth),
      heightCm: cellsToCm(nextH, cloth),
      // Shift every area (including empty markers — they should stay where
      // they are relative to neighbours) by the same delta so the layout
      // looks identical, just within a smaller canvas.
      areas: design.areas.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
    });
  };
  // View toggles. Hiding either side widens the canvas (the grid template
  // collapses the dropped column). Persisted so the user's preferred
  // working surface survives a refresh.
  // Default both panels OFF so a first-time visitor lands on a wide canvas;
  // the user opens what they need. Choices persist (storage value '1' = on,
  // '0' = off; absence = default off).
  const [showPatterns, setShowPatterns] = useState<boolean>(() => {
    try { return localStorage.getItem('design:showPatterns') === '1'; } catch { return false; }
  });
  const [showInspector, setShowInspector] = useState<boolean>(() => {
    try { return localStorage.getItem('design:showInspector') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('design:showPatterns', showPatterns ? '1' : '0'); } catch { /* noop */ }
  }, [showPatterns]);
  useEffect(() => {
    try { localStorage.setItem('design:showInspector', showInspector ? '1' : '0'); } catch { /* noop */ }
  }, [showInspector]);

  const library = useMemo(() => buildLibrary(), []);
  // DMC numbers used across the library — powers the picker's "library only"
  // (traditional) filter.
  const libraryNumbers = useMemo(
    () => libraryDmcNumbers(library.map((l) => l.pattern)),
    [library],
  );
  const activeArea = design.areas.find((a) => a.id === activeAreaId) ?? null;
  // An "empty" area (no motif, no repeat) is a marked filter target — drawn to
  // size the tray to it. Selecting one auto-filters the library to fit.
  const activeIsEmpty = !!activeArea && activeArea.motifs.length === 0 && !activeArea.repeat;
  const fitsActive = (fitOnly || activeIsEmpty) && activeArea !== null;

  // Region chips from the loaded library (same source as the Library tab).
  const regions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of library) {
      const r = l.pattern.source?.region;
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [library]);

  // Pointer interaction on the canvas:
  //  - move: drag the grabbed area; if it's part of the multi-selection, the
  //    whole selection moves by the same offset (offX/offY from the grabbed).
  //  - rotate: live preview angle that snaps to 90° on release; rotates the
  //    whole selection around its combined centre.
  //  - marquee: a dragged-out rectangle. mode 'mark' makes an empty filter
  //    area (plain drag on empty canvas); mode 'select' rubber-band-selects
  //    every area it touches (Shift+drag on empty canvas).
  type Interaction =
    | { kind: 'move'; areaId: string; offX: number; offY: number }
    | { kind: 'rotate'; cx: number; cy: number; angle: number }
    | { kind: 'marquee'; mode: 'mark' | 'select'; x0: number; y0: number; x1: number; y1: number };
  const interactionRef = useRef<Interaction | null>(null);

  // Canvas fills the residual column width; height follows the cloth aspect
  // ratio. We measure the *displayed* canvas-scroll height (which the CSS
  // caps at max-height) so the motif arms hug the canvas as actually shown,
  // not the raw backing height.
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

  const [displayedCanvasH, setDisplayedCanvasH] = useState(420);
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h && h > 0) setDisplayedCanvasH(Math.floor(h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Shift + wheel zooms the canvas. Attached non-passively so we can prevent
  // the page from scrolling while zooming.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const step = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom((z) => Math.max(0.5, Math.min(4, z * step)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Reserve GUTTER px on the top + left for row/column number labels; the
  // grid is drawn translated by GUTTER so all `x*cs` drawing stays unchanged.
  // The canvas fills the full available width at zoom 1; Shift+wheel zooms.
  const aspect = design.gridH / design.gridW;
  const canvasW = Math.round(wrapW * zoom);
  const canvasH = Math.round((canvasW - GUTTER) * aspect) + GUTTER;
  const cs = cellSize(canvasW - GUTTER, canvasH - GUTTER, design.gridW, design.gridH);

  // Pixel length of the rotate handle's stem above an area.
  const HANDLE_STEM = 22;
  // Mouse pointers get a 9px radius (precise); fingertip and pencil get a
  // much larger one (~30px) because the visible handle is hard to land on
  // with a fat tip. The drawn knob stays the same; this is invisible slack.
  const HANDLE_HIT_MOUSE = 9;
  const HANDLE_HIT_TOUCH = 30;
  // Radius of the per-area delete (×) button, drawn at the top-right corner.
  const DELETE_R = 8;
  const DELETE_R_TOUCH = 22;
  const deleteButtonCenter = (a: Area) => ({ cx: (a.x + a.w) * cs, cy: a.y * cs });

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

    // While rotating, the whole selection spins around its combined centre.
    const rotating = interaction?.kind === 'rotate' ? interaction : null;
    const groupCenter = rotating ? { x: rotating.cx * cs, y: rotating.cy * cs } : null;

    for (const area of design.areas) {
      const isSelected = selectedIds.has(area.id);
      const sub = compositeArea(area, design.palette);

      ctx.save();
      if (rotating && isSelected && groupCenter) {
        // Rotate the selection as a unit: spin the whole canvas about the
        // group centre, then draw each selected area in place.
        ctx.translate(groupCenter.x, groupCenter.y);
        ctx.rotate(rotating.angle);
        ctx.translate(-groupCenter.x, -groupCenter.y);
        ctx.translate(area.x * cs, area.y * cs);
        drawPatternBackground(ctx, sub, cs);
      } else {
        ctx.translate(area.x * cs, area.y * cs);
        drawPatternBackground(ctx, sub, cs);
      }
      ctx.restore();

      // area frame — selected areas in accent, others muted
      ctx.save();
      ctx.strokeStyle = isSelected ? '#b5654a' : 'rgba(154,123,181,0.7)';
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(area.x * cs + 0.5, area.y * cs + 0.5, area.w * cs, area.h * cs);
      ctx.restore();

      // Delete (×) button in the top-right corner of a selected area.
      if (isSelected && !rotating) {
        const { cx: bx, cy: by } = deleteButtonCenter(area);
        ctx.save();
        ctx.setLineDash([]);
        ctx.fillStyle = '#b5654a';
        ctx.beginPath();
        ctx.arc(bx, by, DELETE_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        const k = DELETE_R * 0.45;
        ctx.beginPath();
        ctx.moveTo(bx - k, by - k);
        ctx.lineTo(bx + k, by + k);
        ctx.moveTo(bx + k, by - k);
        ctx.lineTo(bx - k, by + k);
        ctx.stroke();
        ctx.restore();
      }
    }

    // One rotate handle for the selection, above the combined bounding box.
    const selAreas = design.areas.filter((a) => selectedIds.has(a.id));
    if (selAreas.length > 0 && !rotating) {
      const minX = Math.min(...selAreas.map((a) => a.x));
      const minY = Math.min(...selAreas.map((a) => a.y));
      const maxX = Math.max(...selAreas.map((a) => a.x + a.w));
      const hx = ((minX + maxX) / 2) * cs;
      const topY = minY * cs;
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

    // Marquee preview (mark = filter area; select = rubber-band).
    if (interaction?.kind === 'marquee') {
      const mx = Math.min(interaction.x0, interaction.x1);
      const my = Math.min(interaction.y0, interaction.y1);
      const mw = Math.abs(interaction.x1 - interaction.x0) + 1;
      const mh = Math.abs(interaction.y1 - interaction.y0) + 1;
      const sel = interaction.mode === 'select';
      ctx.save();
      ctx.strokeStyle = sel ? '#9a7bb5' : '#b5654a';
      ctx.fillStyle = sel ? 'rgba(154,123,181,0.10)' : 'rgba(181,101,74,0.10)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(mx * cs, my * cs, mw * cs, mh * cs);
      ctx.strokeRect(mx * cs + 0.5, my * cs + 0.5, mw * cs, mh * cs);
      ctx.restore();
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

  // Combined bounding box of the current selection (in cells), or null.
  const selectionBox = (): { x: number; y: number; w: number; h: number } | null => {
    const sel = design.areas.filter((a) => selectedIds.has(a.id));
    if (sel.length === 0) return null;
    const minX = Math.min(...sel.map((a) => a.x));
    const minY = Math.min(...sel.map((a) => a.y));
    const maxX = Math.max(...sel.map((a) => a.x + a.w));
    const maxY = Math.max(...sel.map((a) => a.y + a.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  // Does the pointer hit the selection's rotate knob (above its bbox)?
  // `pointerType` is used to grow the invisible hit radius for touch/pen so
  // a fingertip can actually grab the knob (the rendered knob is small).
  const overRotateHandle = (
    clientX: number,
    clientY: number,
    pointerType: string = 'mouse',
  ): boolean => {
    const box = selectionBox();
    if (!box) return false;
    const [px, py] = pointerPx(clientX, clientY);
    const hx = (box.x + box.w / 2) * cs;
    const hy = box.y * cs - HANDLE_STEM;
    const r = pointerType === 'mouse' ? HANDLE_HIT_MOUSE : HANDLE_HIT_TOUCH;
    return Math.hypot(px - hx, py - hy) <= r;
  };

  const updateArea = (id: string, fn: (a: Area) => Area) => {
    onChange({
      ...design,
      areas: design.areas.map((a) => (a.id === id ? fn(a) : a)),
    });
  };

  // Recolour one palette index within a single area: remaps that area's cells
  // and extends the design palette if needed (other areas keep the old index).
  const recolorActiveArea = (oldIndex: number, color: PaletteColor) => {
    if (!activeArea) return;
    const { palette, area } = recolorAreaIndex(activeArea, oldIndex, color, design.palette);
    onChange({
      ...design,
      palette,
      areas: design.areas.map((a) => (a.id === area.id ? area : a)),
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

  // Rotate every selected area as a group around the selection's combined
  // centre by N quarter-turns: each area's own content rotates, and its
  // position is re-placed relative to the group centre (clamped on-grid).
  const rotateGroup = (turns: number) => {
    const n = ((turns % 4) + 4) % 4;
    if (n === 0) return;
    const box = selectionBox();
    if (!box) return;
    const ccx = box.x + box.w / 2;
    const ccy = box.y + box.h / 2;
    const areas = design.areas.map((a) => {
      if (!selectedIds.has(a.id)) return a;
      const rotated = rotateArea(a, n); // content rotated, w/h swapped, centred on itself
      // Re-place the rotated area's centre by rotating its centre about the
      // group centre (CW for positive turns).
      const acx = a.x + a.w / 2;
      const acy = a.y + a.h / 2;
      let dx = acx - ccx;
      let dy = acy - ccy;
      for (let i = 0; i < n; i++) {
        const ndx = -dy;
        const ndy = dx;
        dx = ndx;
        dy = ndy;
      }
      const nxc = ccx + dx;
      const nyc = ccy + dy;
      const nx = Math.round(nxc - rotated.w / 2);
      const ny = Math.round(nyc - rotated.h / 2);
      return {
        ...rotated,
        x: Math.max(0, Math.min(nx, design.gridW - rotated.w)),
        y: Math.max(0, Math.min(ny, design.gridH - rotated.h)),
      };
    });
    onChange({ ...design, areas });
  };

  // Duplicate a set of areas (new ids, offset by a few cells, clamped on-grid)
  // and select the copies. Used by the keyboard paste and inspector button.
  const duplicateAreas = (srcs: Area[]): Area[] => {
    if (srcs.length === 0) return [];
    const off = 2;
    const copies = srcs.map((src) => ({
      ...src,
      id: newId('area'),
      x: Math.max(0, Math.min(src.x + off, design.gridW - src.w)),
      y: Math.max(0, Math.min(src.y + off, design.gridH - src.h)),
      motifs: src.motifs.map((m) => ({ ...m, cells: m.cells.map((r) => r.slice()) })),
      repeat: src.repeat ? { ...src.repeat, cells: src.repeat.cells.map((r) => r.slice()) } : undefined,
    }));
    onChange({ ...design, areas: [...design.areas, ...copies] });
    setSelectedIds(new Set(copies.map((c) => c.id)));
    setActiveAreaId(copies[copies.length - 1].id);
    return copies;
  };

  const selectedAreas = () => design.areas.filter((a) => selectedIds.has(a.id));

  // Copy/paste: Cmd/Ctrl+C copies the selection, +V pastes copies, +D duplicates.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input/select/textarea.
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      const sel = selectedAreas();
      if (mod && e.key === 'c' && sel.length > 0) {
        clipboardRef.current = sel;
        e.preventDefault();
      } else if (mod && e.key === 'v' && clipboardRef.current) {
        duplicateAreas(clipboardRef.current);
        e.preventDefault();
      } else if (mod && e.key === 'd' && sel.length > 0) {
        duplicateAreas(sel);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, design]);

  // Delete one area; skip the confirm for an empty (motif-less) area.
  const deleteArea = (a: Area) => {
    const isEmpty = a.motifs.length === 0 && !a.repeat;
    if (!isEmpty && !confirm(`Delete area "${a.name}"?`)) return;
    onChange({ ...design, areas: design.areas.filter((x) => x.id !== a.id) });
    setSelectedIds((cur) => {
      const next = new Set(cur);
      next.delete(a.id);
      return next;
    });
    if (activeAreaId === a.id) setActiveAreaId(null);
  };

  // ----- pointer: select / move / rotate / marquee -----
  // Pointer events instead of mouse events so a fingertip on iPad drives
  // the same code as a mouse on desktop. Pointers expose `shiftKey/altKey`
  // too, so modifier-driven behaviour (Shift = additive, Alt = snap) still
  // works wherever the hardware/OS lets the user trigger them.
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Two-finger pinch is handled separately — let the pinch effect see
    // both pointers and skip the selection logic.
    if (registerPinchPointer(e)) return;
    // Capture this pointer so move/up keep firing even if the finger drags
    // outside the canvas; without it iPad gives us a single down and never
    // the matching up.
    e.currentTarget.setPointerCapture(e.pointerId);
    // If a library motif is armed, a plain tap places it immediately.
    // EXCEPT in Border mode — there a "tap" is just the start of a drag the
    // user will extend to define the border length. We defer to the marquee
    // path, which sees the full drag at pointerup and tiles accordingly.
    if (armedKeyRef.current && !borderMode) {
      placeArmedMotif(e.clientX, e.clientY);
      return;
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const touch = e.pointerType !== 'mouse';

    // Delete (×) button on a selected area takes priority over everything.
    // Use a fingertip-sized hit on touch/pen so the delete button is
    // actually tappable; mouse keeps the precise radius.
    {
      const [px, py] = pointerPx(e.clientX, e.clientY);
      const r = touch ? DELETE_R_TOUCH : DELETE_R + 2;
      for (const a of design.areas) {
        if (!selectedIds.has(a.id)) continue;
        const { cx: bx, cy: by } = deleteButtonCenter(a);
        if (Math.hypot(px - bx, py - by) <= r) {
          deleteArea(a);
          return;
        }
      }
    }

    // Rotate handle (on the selection) takes priority over body hits.
    if (overRotateHandle(e.clientX, e.clientY, e.pointerType)) {
      const box = selectionBox();
      if (box) {
        interactionRef.current = {
          kind: 'rotate',
          cx: box.x + box.w / 2,
          cy: box.y + box.h / 2,
          angle: 0,
        };
        return;
      }
    }

    const [cx, cy] = cellAt(e.clientX, e.clientY);
    const hit = areaAt(cx, cy);
    if (hit) {
      if (additive) {
        // Toggle this area in/out of the selection; no drag.
        toggleSelected(hit.id);
        return;
      }
      // Plain click: if it's already selected, keep the whole selection (so a
      // group drag moves all); otherwise select just this one.
      if (!selectedIds.has(hit.id)) selectOne(hit.id);
      else setActiveAreaId(hit.id);
      interactionRef.current = { kind: 'move', areaId: hit.id, offX: cx - hit.x, offY: cy - hit.y };
    } else {
      // Empty canvas: Shift+drag rubber-band selects; plain drag marks a
      // filter area.
      if (!additive) selectOne(null);
      interactionRef.current = {
        kind: 'marquee',
        mode: additive ? 'select' : 'mark',
        x0: cx,
        y0: cy,
        x1: cx,
        y1: cy,
      };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pinchPointersRef.current.has(e.pointerId)) {
      updatePinch(e);
      return;
    }
    const it = interactionRef.current;
    if (!it) return;
    if (it.kind === 'move') {
      const [cx, cy] = cellAt(e.clientX, e.clientY);
      const grabbed = design.areas.find((a) => a.id === it.areaId);
      if (!grabbed) return;
      // Desired top-left of the grabbed area, then derive the group delta.
      const wantX = cx - it.offX;
      const wantY = cy - it.offY;
      let dx = wantX - grabbed.x;
      let dy = wantY - grabbed.y;
      if (dx === 0 && dy === 0) return;
      const moving = selectedIds.has(it.areaId) ? selectedIds : new Set([it.areaId]);
      // Clamp the delta so no moving area leaves the grid.
      for (const a of design.areas) {
        if (!moving.has(a.id)) continue;
        dx = Math.max(-a.x, Math.min(dx, design.gridW - a.w - a.x));
        dy = Math.max(-a.y, Math.min(dy, design.gridH - a.h - a.y));
      }
      if (dx === 0 && dy === 0) return;
      onChange({
        ...design,
        areas: design.areas.map((a) =>
          moving.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a,
        ),
      });
    } else if (it.kind === 'marquee') {
      const [cx, cy] = cellAt(e.clientX, e.clientY);
      interactionRef.current = { ...it, x1: cx, y1: cy };
      draw();
    } else {
      // rotate: angle from group centre to pointer; Alt snaps to 90° live.
      const [px, py] = pointerPx(e.clientX, e.clientY);
      const ccx = it.cx * cs;
      const ccy = it.cy * cs;
      let angle = Math.atan2(py - ccy, px - ccx) + Math.PI / 2; // 0 = pointing up
      if (e.altKey) angle = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
      interactionRef.current = { ...it, angle };
      draw();
    }
  };

  const onPointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e && pinchPointersRef.current.has(e.pointerId)) {
      endPinch(e);
      return;
    }
    const it = interactionRef.current;
    interactionRef.current = null;
    if (!it) return;
    if (it.kind === 'rotate') {
      // Snap the free angle to the nearest quarter turn (clockwise positive).
      const turns = Math.round(it.angle / (Math.PI / 2));
      if (((turns % 4) + 4) % 4 !== 0) {
        rotateGroup(turns);
      } else {
        draw(); // clear the preview transform
      }
    } else if (it.kind === 'marquee' && it.mode === 'select') {
      // Rubber-band: select every area the box touches.
      const x = Math.min(it.x0, it.x1);
      const y = Math.min(it.y0, it.y1);
      const x2 = Math.max(it.x0, it.x1);
      const y2 = Math.max(it.y0, it.y1);
      const hits = design.areas.filter(
        (a) => a.x <= x2 && a.x + a.w - 1 >= x && a.y <= y2 && a.y + a.h - 1 >= y,
      );
      if (hits.length > 0) {
        setSelectedIds(new Set(hits.map((a) => a.id)));
        setActiveAreaId(hits[hits.length - 1].id);
      } else {
        selectOne(null);
      }
      draw();
    } else if (it.kind === 'marquee') {
      const x = Math.min(it.x0, it.x1);
      const y = Math.min(it.y0, it.y1);
      const w = Math.abs(it.x1 - it.x0) + 1;
      const h = Math.abs(it.y1 - it.y0) + 1;
      if (w < 2 && h < 2) {
        draw(); // a click, not a drag — clear preview
        return;
      }
      // Border tool: tile the armed motif along the dominant drag axis.
      // The result is a thin area sized to the motif (h) × span (w), filled
      // as a repeat so the user can still edit/move it like any other area.
      // Vertical drags rotate the motif 90° so the pattern reads along the
      // line. Falls through to the normal marquee logic if not armed.
      if (borderMode && armedKeyRef.current) {
        const entry = library.find((l) => l.key === armedKeyRef.current);
        if (entry) {
          const merged = mergePalette(design.palette, patternPalette(entry.pattern));
          const baseCells = trimCells(remapCells(entry.pattern.cells, merged.indexMap));
          const horizontal = w >= h;
          // For a horizontal strip, decompose along the cell grid as-is.
          // For a vertical strip, rotate 90° first so the "tiles left-to-
          // right" period detection runs on the visually-horizontal axis,
          // then rotate the composed strip back.
          const sourceForDecomp = horizontal ? baseCells : rotateTurns(baseCells, 1);
          const decomp = decomposeBorder(sourceForDecomp);
          const mh = sourceForDecomp.length;
          const periodW = decomp.period[0]?.length ?? 1;
          // Build a strip exactly long enough to fit the drag, padded to a
          // whole number of periods after the left cap so the right cap
          // lines up. (composeBorder handles partial periods by overlaying
          // the right cap, but a clean whole-period fill reads best.)
          const leftCapW = decomp.leftCap[0]?.length ?? 0;
          const rightCapW = decomp.rightCap[0]?.length ?? 0;
          const dragLen = horizontal ? w : h;
          const innerLen = Math.max(periodW, dragLen - leftCapW - rightCapW);
          const periods = Math.max(1, Math.round(innerLen / periodW));
          const stripLen = leftCapW + periods * periodW + rightCapW;
          let stripCells = composeBorder(decomp, stripLen);
          // Rotate the composed strip back for vertical borders.
          if (!horizontal) stripCells = rotateTurns(stripCells, 3); // 270° = -90°
          const sh = stripCells.length;
          const sw = sh > 0 ? stripCells[0].length : 1;
          const ax = horizontal ? x : Math.min(it.x0, it.x1);
          const ay = horizontal ? Math.min(it.y0, it.y1) : y;
          const aw = Math.min(sw, design.gridW - ax);
          const ah = Math.min(sh, design.gridH - ay);
          if (aw > 0 && ah > 0) {
            // Place as a single motif (not a repeat) since the cells already
            // contain the full tiled strip with end caps. Predictable, no
            // resampling at edges.
            const area: Area = {
              id: newId('area'),
              name: `border ${design.areas.length + 1}`,
              x: ax,
              y: ay,
              w: aw,
              h: ah,
              motifs: [{ patternKey: armedKeyRef.current, cells: stripCells, x: 0, y: 0 }],
            };
            // Skip ah/aw mismatches caused by grid-edge clipping — the
            // motif's own bounds may extend past `aw`; that's fine, the
            // canvas painter clips it.
            void mh;
            onChange({ ...design, palette: merged.palette, areas: [...design.areas, area] });
            selectOne(area.id);
            // Leave borderMode on so the user can lay several borders in a
            // row; they can turn it off explicitly when done.
            draw();
            return;
          }
        }
      }
      const isEmpty = (a: Area) => a.motifs.length === 0 && !a.repeat;
      // Areas fully enclosed by the dragged rectangle (concrete ones — empty
      // markers don't count, they'd be swept anyway).
      const x2 = x + w - 1;
      const y2 = y + h - 1;
      const enclosed = design.areas.filter(
        (a) =>
          !isEmpty(a) &&
          a.x >= x &&
          a.y >= y &&
          a.x + a.w - 1 <= x2 &&
          a.y + a.h - 1 <= y2,
      );
      if (enclosed.length > 0) {
        // Draw-around-motifs gesture: skip creating a frame and multi-select
        // the captured areas instead. The existing rotate-handle / move /
        // flip group logic then treats them as a single transformable unit.
        // Also sweep any leftover empty markers so the canvas stays clean.
        const kept = design.areas.filter((a) => !isEmpty(a));
        if (kept.length !== design.areas.length) {
          onChange({ ...design, areas: kept });
        }
        setSelectedIds(new Set(enclosed.map((a) => a.id)));
        setActiveAreaId(enclosed[enclosed.length - 1].id);
        draw();
        return;
      }
      // An empty area is just a "place a motif here later" marker — having
      // several of them on the canvas at once is noise. Sweep the previous
      // empty area(s) so each new mark replaces them. Areas that already
      // hold a motif or a repeat are kept.
      const kept = design.areas.filter((a) => !isEmpty(a));
      const area: Area = {
        id: newId('area'),
        name: `area ${kept.length + 1}`,
        x,
        y,
        w,
        h,
        motifs: [],
      };
      onChange({ ...design, areas: [...kept, area] });
      // Clear any stale selection/active pointer to a swept area.
      setSelectedIds((cur) => {
        const next = new Set<string>();
        for (const id of cur) if (kept.some((a) => a.id === id)) next.add(id);
        next.add(area.id);
        return next;
      });
      setActiveAreaId(area.id);
    }
  };

  // ----- place a library motif at a canvas position --------------------------
  // Drop OR tap-to-place both end up here so the two input paths behave
  // identically: pick the same area-merge or new-area rules.
  const placeMotifAt = (key: string, clientX: number, clientY: number) => {
    const entry = library.find((l) => l.key === key);
    if (!entry) return;
    const [cx, cy] = cellAt(clientX, clientY);

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
      selectOne(target.id);
      return;
    }

    const mh = cells.length;
    const mw = mh > 0 ? cells[0].length : 1;
    // Place clamped to grid; if the motif's natural size exceeds either
    // dimension, surface a "Grow canvas" banner so the user can fix it in
    // one tap rather than discovering the silent clip later.
    suggestGrowIfOverflow(mw, mh);
    const w = Math.min(mw, design.gridW);
    const h = Math.min(mh, design.gridH);

    // Dropping into an empty marked area tightens it to the motif (the marked
    // size was only a filter target). Anchor at the area's top-left.
    if (existing && existing.motifs.length === 0 && !existing.repeat) {
      const ax = Math.max(0, Math.min(existing.x, design.gridW - w));
      const ay = Math.max(0, Math.min(existing.y, design.gridH - h));
      const target: Area = {
        ...existing,
        name: existing.name || entry.pattern.name || 'motif',
        x: ax,
        y: ay,
        w,
        h,
        motifs: [{ patternKey: key, cells, x: 0, y: 0 }],
      };
      onChange({
        ...design,
        palette: merged.palette,
        areas: design.areas.map((a) => (a.id === target.id ? target : a)),
      });
      selectOne(target.id);
      return;
    }

    // Otherwise create a new tight area hugging the motif via the shared
    // pure helper, then select it.
    const next = placeMotif(design, { key, pattern: entry.pattern }, cx, cy);
    onChange(next);
    selectOne(next.areas[next.areas.length - 1].id);
  };

  // Desktop: HTML5 drag-and-drop. iOS Safari does not fire drag events for
  // touches, so the tap-arm path below is the iPad equivalent.
  const onDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    placeMotifAt(key, e.clientX, e.clientY);
  };

  // ----- tap-to-place (iPad) --------------------------------------------------
  // The user taps a library card to "arm" a motif, then taps the canvas to
  // place it. armedKey state drives the visual highlight; armedKeyRef holds
  // the same value so the canvas pointerdown handler can read it
  // synchronously without re-binding on each render.
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const armedKeyRef = useRef<string | null>(null);
  useEffect(() => { armedKeyRef.current = armedKey; }, [armedKey]);

  const armMotif = (key: string) => {
    setArmedKey((cur) => {
      const next = cur === key ? null : key;
      // Auto-enable border mode when the user arms a pattern whose name
      // reads as a border (Sinsal / Nafnoof Border / Dayer Qabbeh / etc.);
      // disarm it when the armed key clears or switches to a non-border.
      // The user can still toggle the + Border chip manually to override.
      if (next === null) {
        setBorderMode(false);
      } else {
        const entry = library.find((l) => l.key === next);
        setBorderMode(entry ? isBorderPattern(entry.pattern) : false);
      }
      return next;
    });
  };

  const placeArmedMotif = (clientX: number, clientY: number) => {
    const key = armedKeyRef.current;
    if (!key) return;
    placeMotifAt(key, clientX, clientY);
    setArmedKey(null);
  };

  // ----- pinch-to-zoom on the canvas ------------------------------------------
  //
  // iOS Safari is the awkward one: when two fingers land, it fires its
  // proprietary `gesturestart` and cancels all in-flight Pointer Events
  // (so a pointer-based pinch never accumulates two pointers). Our previous
  // attempt didn't account for this — that's why pinch felt broken on iPad.
  //
  // The fix follows the platform guidance:
  //   1. On WebKit (iPadOS Safari): listen to gesturestart/gesturechange/
  //      gestureend via ref + addEventListener with { passive: false }, so
  //      we can preventDefault() and use the accumulated `event.scale`
  //      directly. React doesn't proxy these — it has to be a ref + native
  //      addEventListener.
  //   2. Elsewhere with multi-pointer support (Android Chrome, etc.): use a
  //      two-Pointer-Events pinch as a fallback.
  //   3. Always: a passive:false touchstart that preventDefaults when ≥2
  //      touches land, suppressing iOS's default double-tap zoom and the
  //      page-level scroll the gesture would otherwise trigger.
  //
  // The midpoint-anchored zoom keeps the grid point under the fingers
  // stable while scaling by adjusting the scroll container's scrollLeft/
  // scrollTop after each zoom step.
  interface PinchState {
    startZoom: number;
    midClientX: number;
    midClientY: number;
    /** Pinch midpoint in canvas-local pixels at gesturestart. */
    startLocalX: number;
    startLocalY: number;
  }
  const pinchRef = useRef<PinchState | null>(null);
  // For the Pointer Events fallback path.
  const pinchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const supportsGestureEvents =
    typeof window !== 'undefined' && 'ongesturestart' in window;

  /** Common: compute and apply a new zoom level anchored on the pinch
   * midpoint. Called from both the gesture path and the pointer path. */
  const applyPinchZoom = (state: PinchState, nextZoom: number) => {
    const clamped = Math.max(0.5, Math.min(4, nextZoom));
    setZoom(clamped);
    const scaleRatio = clamped / state.startZoom;
    // Wait for React to rerender the canvas at the new size, then adjust
    // scroll so the pinch midpoint stays under the user's fingers.
    requestAnimationFrame(() => {
      const scroll = canvasScrollRef.current;
      const r = canvasRef.current?.getBoundingClientRect();
      if (!scroll || !r) return;
      const newLocalX = state.startLocalX * scaleRatio;
      const newLocalY = state.startLocalY * scaleRatio;
      scroll.scrollLeft = newLocalX - (state.midClientX - (r.left + scroll.scrollLeft));
      scroll.scrollTop = newLocalY - (state.midClientY - (r.top + scroll.scrollTop));
    });
  };

  // WebKit gesturestart/gesturechange/gestureend — primary path on iPad.
  useEffect(() => {
    if (!supportsGestureEvents) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      // Two-finger gesture started — cancel any in-flight selection drag.
      interactionRef.current = null;
      // GestureEvent carries clientX/clientY at the centroid of the touches.
      const ge = e as unknown as { clientX: number; clientY: number };
      const scroll = canvasScrollRef.current;
      const r = canvas.getBoundingClientRect();
      pinchRef.current = {
        startZoom: zoom,
        midClientX: ge.clientX,
        midClientY: ge.clientY,
        startLocalX: ge.clientX - r.left + (scroll?.scrollLeft ?? 0),
        startLocalY: ge.clientY - r.top + (scroll?.scrollTop ?? 0),
      };
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const state = pinchRef.current;
      if (!state) return;
      // event.scale is the *accumulated* multiplier since gesturestart.
      const scale = (e as unknown as { scale: number }).scale || 1;
      applyPinchZoom(state, state.startZoom * scale);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      pinchRef.current = null;
    };

    canvas.addEventListener('gesturestart', onGestureStart, { passive: false });
    canvas.addEventListener('gesturechange', onGestureChange, { passive: false });
    canvas.addEventListener('gestureend', onGestureEnd, { passive: false });
    return () => {
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
      canvas.removeEventListener('gestureend', onGestureEnd);
    };
    // Intentionally omit zoom — the handler reads the latest value via the
    // ref-stored startZoom snapshot; re-attaching on every zoom change
    // would lose the in-flight gesture state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsGestureEvents]);

  // Touch listener: preventDefault on multi-touch so iOS doesn't try to
  // page-scroll or double-tap-zoom while the user pinches the canvas. CSS
  // `touch-action: none` doesn't cover this on iOS Safari, which only
  // supports `auto` and `manipulation`.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // Pointer-events pinch fallback for non-WebKit touch (e.g. Android Chrome).
  // Skipped entirely on iPad — GestureEvents handle pinch there.
  const registerPinchPointer = (e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (supportsGestureEvents) return false;
    if (e.pointerType !== 'touch') return false;
    pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchPointersRef.current.size < 2) return false;
    interactionRef.current = null;
    const pts = [...pinchPointersRef.current.values()];
    const midX = (pts[0].x + pts[1].x) / 2;
    const midY = (pts[0].y + pts[1].y) / 2;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    const scroll = canvasScrollRef.current;
    const r = canvasRef.current?.getBoundingClientRect();
    pinchRef.current = {
      startZoom: zoom,
      midClientX: midX,
      midClientY: midY,
      startLocalX: r ? midX - r.left + (scroll?.scrollLeft ?? 0) : 0,
      startLocalY: r ? midY - r.top + (scroll?.scrollTop ?? 0) : 0,
    };
    // Stash startDist on the state object so updatePinch can compute scale.
    (pinchRef.current as PinchState & { startDist: number }).startDist = dist;
    return true;
  };

  const updatePinch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (supportsGestureEvents) return;
    if (!pinchPointersRef.current.has(e.pointerId)) return;
    pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const state = pinchRef.current as (PinchState & { startDist: number }) | null;
    if (!state || pinchPointersRef.current.size < 2) return;
    const pts = [...pinchPointersRef.current.values()];
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    applyPinchZoom(state, state.startZoom * (dist / state.startDist));
  };

  const endPinch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (supportsGestureEvents) return;
    pinchPointersRef.current.delete(e.pointerId);
    if (pinchPointersRef.current.size < 2) pinchRef.current = null;
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
    if (bordersOnly && !isBorderPattern(p)) return false;
    if (fitsActive && activeArea) {
      // Compare against the painted bounding box (fitW/fitH) — what the motif
      // actually occupies once placed (placement trims blank margins) — not
      // the raw chart size, so the ±FIT_TOLERANCE leeway is meaningful.
      // A pattern fits in either orientation (upright w×h or rotated h×w).
      const aw = activeArea.w + FIT_TOLERANCE;
      const ah = activeArea.h + FIT_TOLERANCE;
      const fitsUpright = l.fitW <= aw && l.fitH <= ah;
      const fitsRotated = l.fitH <= aw && l.fitW <= ah;
      if (!fitsUpright && !fitsRotated) return false;
    }
    return true;
  });

  const anyFilter =
    query.length > 0 ||
    fRegion !== null ||
    fColors !== null ||
    fSize !== null ||
    fComplexity !== null ||
    fitOnly ||
    bordersOnly;

  const clearFilters = () => {
    setQuery('');
    setFRegion(null);
    setFColors(null);
    setFSize(null);
    setFComplexity(null);
    setFitOnly(false);
    setBordersOnly(false);
  };

  // Split the capped results between the L's two arms: a left column and a
  // bottom strip. Caps keep the L full without per-strip scroll fights —
  // narrow the dropdowns to reach motifs beyond the cap.
  // Pack motifs into the space around the canvas, filling each region before
  // the next: (1) the left column top→bottom to the canvas bottom, (2) the
  // right column below the inspector to the canvas bottom, (3) full-width rows
  // beneath the whole band. Counts derive from how many ~106px cards fit each
  // region's height; overflow is reached by narrowing the filters.
  const CARD_PX = 106;
  // Use the canvas's *displayed* height (CSS-capped) so the arms match what's
  // on screen — a short design gives short arms, a tall one gives tall arms.
  const canvasPx = displayedCanvasH;
  const leftCount = Math.max(3, Math.floor(canvasPx / CARD_PX));
  // Right column starts below the inspector, so it has less height than the
  // canvas; estimate the inspector at ~300px.
  const rightCount = Math.max(0, Math.floor((canvasPx - 300) / CARD_PX));
  // Bottom rows: a few full-width rows of cards (the grid wraps to fill).
  const BOTTOM_ROWS = 3;
  const bottomCount = BOTTOM_ROWS * 10;

  const leftMotifs = filteredLib.slice(0, leftCount);
  const rightMotifs = filteredLib.slice(leftCount, leftCount + rightCount);
  const bottomMotifs = filteredLib.slice(
    leftCount + rightCount,
    leftCount + rightCount + bottomCount,
  );
  const totalShown = Math.min(
    filteredLib.length,
    leftCount + rightCount + bottomCount,
  );

  return (
    <div className="design-composer">
      {/* One header bar: ← Designs · name · cloth/size/strands summary or
          edit form · view toggles. Everything project-level lives here so
          the row above the canvas is a single shelf, not two. */}
      <ClothBar
        design={design}
        onChange={onChange}
        onClose={onClose}
        showPatterns={showPatterns}
        showInspector={showInspector}
        onTogglePatterns={() => setShowPatterns((v) => !v)}
        onToggleInspector={() => setShowInspector((v) => !v)}
        onFitToContent={fitCanvasToContent}
      />

      {/* Filter row: search + compact dropdowns, one line. Hidden when the
          Patterns library is off — without library cards there's nothing
          to filter. */}
      {showPatterns && (
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

        <label className="design-fit-toggle" title={activeIsEmpty ? 'On automatically for a marked area' : ''}>
          <input
            type="checkbox"
            checked={fitsActive}
            disabled={!activeArea || activeIsEmpty}
            onChange={(e) => setFitOnly(e.target.checked)}
          />
          Fits area{activeArea ? ` (≲ ${activeArea.w + FIT_TOLERANCE}×${activeArea.h + FIT_TOLERANCE})` : ''}
        </label>

        <label className="design-fit-toggle" title="Filter to border patterns (sinsal, nafnoof border, etc.)">
          <input
            type="checkbox"
            checked={bordersOnly}
            onChange={(e) => setBordersOnly(e.target.checked)}
          />
          Borders only
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
      )}

      {/* L-shape: left motif column + canvas + right inspector, then bottom strip.
          Modifier classes drop the relevant grid column when its panel is off,
          so the canvas naturally widens. */}
      <div className={`design-body-l${showPatterns ? '' : ' design-body-l-no-patterns'}${showInspector ? '' : ' design-body-l-no-inspector'}`}>
        {/* Cap the left column to the canvas's displayed height so the bottom
            strip hugs the canvas bottom instead of floating far below it. */}
        {showPatterns && (
          <aside className="design-motif-col" style={{ maxHeight: displayedCanvasH }}>
            {leftMotifs.length === 0 ? (
              <p className="empty-hint">No patterns match.</p>
            ) : (
              leftMotifs.map((l) => (
                <MotifCard key={l.key} entry={l} armed={armedKey === l.key} onArm={armMotif} />
              ))
            )}
          </aside>
        )}

        <div className="design-canvas-wrap" ref={wrapRef}>
          {overflowSuggest && (
            <div className="design-overflow-banner" role="status">
              <span>
                Pattern doesn't fit. Grow canvas to{' '}
                <strong>
                  {overflowSuggest.gridW}×{overflowSuggest.gridH}
                </strong>{' '}
                stitches?
              </span>
              <button type="button" className="btn-primary btn-sm" onClick={growCanvasToSuggestion}>
                Grow to fit
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setOverflowSuggest(null)}>
                Dismiss
              </button>
            </div>
          )}
          <div className="design-canvas-scroll" ref={canvasScrollRef}>
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={canvasH}
              className={`design-canvas${armedKey ? ' design-canvas-armed' : ''}`}
              // `touch-action: none` (set in CSS) tells iPad we'll handle
              // touches ourselves, so the page doesn't scroll/zoom while the
              // user is dragging or pinching the canvas.
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e)}
              onPointerCancel={(e) => onPointerUp(e)}
              onPointerLeave={(e) => {
                if (interactionRef.current) onPointerUp(e);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={onDrop}
            />
          </div>
          <div className="design-canvas-foot">
            <div className="design-zoom">
              <button type="button" className="chip" onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))} title="Zoom out">
                −
              </button>
              <span className="design-zoom-val">{Math.round(zoom * 100)}%</span>
              <button type="button" className="chip" onClick={() => setZoom((z) => Math.min(4, z * 1.2))} title="Zoom in">
                +
              </button>
              <button type="button" className="chip" onClick={() => setZoom(1)} title="Fit width">
                Fit
              </button>
            </div>
            {/* Border tool: requires an armed library motif. When on, dragging
                across the canvas tiles that motif along the drag axis. */}
            <button
              type="button"
              className={`chip chip-toggle${borderMode ? ' chip-active' : ''}`}
              aria-pressed={borderMode}
              disabled={!armedKey}
              onClick={() => setBorderMode((v) => !v)}
              title={armedKey ? 'Tile the armed motif along a drag' : 'Arm a pattern first to draw a border'}
            >
              {borderMode ? 'Border ✓' : '+ Border'}
            </button>
            <p className="design-canvas-hint">
              Drag on empty canvas to mark an area · drag a pattern on · drag a motif to move · handle
              rotates (Alt = snap 90°) · Shift + scroll to zoom
            </p>
          </div>
        </div>

        {showInspector && (
          <aside className="design-inspector">
            <AreaInspector
              area={activeArea}
              selectedCount={selectedIds.size}
              palette={design.palette}
              libraryNumbers={libraryNumbers}
              onRecolor={recolorActiveArea}
              updateArea={updateArea}
              onRotate={() => rotateGroup(1)}
              onFlip={(axis) => {
                const f = axis === 'x' ? flipX : flipY;
                onChange({
                  ...design,
                  areas: design.areas.map((a) =>
                    selectedIds.has(a.id)
                      ? {
                          ...a,
                          motifs: a.motifs.map((m) => ({ ...m, cells: f(m.cells) })),
                          repeat: a.repeat ? { ...a.repeat, cells: f(a.repeat.cells) } : undefined,
                        }
                      : a,
                  ),
                });
              }}
              onDuplicate={() => duplicateAreas(selectedAreas())}
              onDeleteArea={() => {
                onChange({ ...design, areas: design.areas.filter((a) => !selectedIds.has(a.id)) });
                selectOne(null);
              }}
              onPlanArea={(area) => {
                const sub = compositeArea(area, design.palette);
                onPlanArea(sub, `design:${design.id}:${area.id}`);
              }}
            />
            {/* Right arm: motifs fill the space below the inspector to the
                canvas bottom (clipped so they don't overrun it). Only shown
                while the Patterns library is on. */}
            {showPatterns && rightMotifs.length > 0 && (
              <div
                className="design-motif-col design-motif-col-right"
                style={{ maxHeight: Math.max(0, displayedCanvasH - 300) }}
              >
                {rightMotifs.map((l) => (
                  <MotifCard key={l.key} entry={l} armed={armedKey === l.key} onArm={armMotif} />
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom: full-width rows beneath the whole band, filled left→right. */}
      {showPatterns && bottomMotifs.length > 0 && (
        <div className="design-motif-strip">
          {bottomMotifs.map((l) => (
            <MotifCard key={l.key} entry={l} armed={armedKey === l.key} onArm={armMotif} />
          ))}
        </div>
      )}
    </div>
  );
}

/** A draggable motif thumbnail used in both arms of the L.
 *
 * Two placement paths:
 *  - desktop: HTML5 drag-and-drop (onDragStart sets the key, canvas onDrop reads it)
 *  - touch (iPad): a tap arms the motif via `onArm`; the next tap on the
 *    canvas places it. iOS Safari never fires drag events for fingers so
 *    this is the only path that works there.
 */
function MotifCard({
  entry,
  armed,
  onArm,
}: {
  entry: LibEntry;
  armed: boolean;
  onArm: (key: string) => void;
}) {
  // Track whether the current down-up sequence already armed the motif from
  // pointerdown (touch/pen path). The subsequent `click` would otherwise
  // toggle it back off — we skip the click handler in that case.
  const armedInGestureRef = useRef(false);
  return (
    <div
      className={`design-lib-card${armed ? ' design-lib-card-armed' : ''}`}
      draggable
      // HTML5 drag-and-drop on iPad is unreliable for Apple Pencil and
      // doesn't fire at all for fingers. We disable `draggable` on touch and
      // pen at pointerdown time so iPad never starts a half-broken drag,
      // and arm the motif right then (rather than waiting for `click`,
      // which doesn't fire if the user dragged the pen). Mouse keeps native
      // HTML5 drag-and-drop and arms via `onClick`.
      onPointerDown={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        if (e.pointerType !== 'mouse') {
          el.draggable = false;
          armedInGestureRef.current = true;
          onArm(entry.key);
        } else {
          el.draggable = true;
          armedInGestureRef.current = false;
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', entry.key);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        if (armedInGestureRef.current) {
          armedInGestureRef.current = false;
          return; // already armed from pointerdown — don't toggle off
        }
        onArm(entry.key);
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
  showPatterns,
  showInspector,
  onTogglePatterns,
  onToggleInspector,
  onFitToContent,
}: {
  design: Design;
  onChange: (d: Design) => void;
  onClose: () => void;
  showPatterns: boolean;
  showInspector: boolean;
  onTogglePatterns: () => void;
  onToggleInspector: () => void;
  onFitToContent: () => void;
}) {
  const cloth = getCloth(design.clothId);
  const strands = STRAND_OPTIONS.find((s) => s.id === design.strandsId);
  const hasContent = design.areas.some((a) => a.motifs.length > 0 || a.repeat);
  // Collapsed by default — once cloth/size/strands are picked the user mostly
  // works with the canvas. Persisted so an intentional open survives refresh.
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('design:clothBarOpen') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('design:clothBarOpen', open ? '1' : '0'); } catch { /* noop */ }
  }, [open]);
  // Unit the user enters dimensions in. Storage stays cm — this is purely
  // a display + input concern. Persisted per browser.
  type SizeUnit = 'cm' | 'in' | 'st';
  const [unit, setUnit] = useState<SizeUnit>(() => {
    try { return (localStorage.getItem('design:sizeUnit') as SizeUnit) || 'cm'; } catch { return 'cm'; }
  });
  useEffect(() => {
    try { localStorage.setItem('design:sizeUnit', unit); } catch { /* noop */ }
  }, [unit]);

  // Display values in the chosen unit, derived from the cm-stored width/height.
  const displayW = unit === 'cm'
    ? Math.round(design.widthCm * 10) / 10
    : unit === 'in'
      ? Math.round((design.widthCm / 2.54) * 10) / 10
      : design.gridW;
  const displayH = unit === 'cm'
    ? Math.round(design.heightCm * 10) / 10
    : unit === 'in'
      ? Math.round((design.heightCm / 2.54) * 10) / 10
      : design.gridH;
  // Convert a user-entered value (in the current unit) into cm + grid cells.
  const toCm = (v: number): number => {
    if (unit === 'cm') return v;
    if (unit === 'in') return v * 2.54;
    // stitches → cells → cm
    return cellsToCm(v, cloth);
  };
  const toCells = (v: number): number => {
    if (unit === 'cm') return cmToCells(v, cloth);
    if (unit === 'in') return inchesToCells(v, cloth);
    return Math.max(1, Math.round(v));
  };

  return (
    <section className="design-clothbar">
      <button className="btn-ghost btn-sm" type="button" onClick={onClose}>
        ← Designs
      </button>
      {/* Always-editable name. Empty falls back to "Untitled design" on blur
          so the design list never shows a blank card. */}
      <input
        className="design-clothbar-name-input"
        value={design.name}
        placeholder="Untitled design"
        aria-label="Design name"
        onChange={(e) => onChange({ ...design, name: e.target.value })}
        onBlur={(e) => {
          if (!e.target.value.trim()) onChange({ ...design, name: 'Untitled design' });
        }}
      />
      {!open && (
        // Compact summary: read-only chip of the current cloth/size/strands,
        // with one button to re-expand the full form.
        <>
          <span className="design-clothbar-summary">
            {cloth.label} · {design.widthCm}×{design.heightCm} cm · {design.gridW}×{design.gridH} st
            {strands ? ` · ${strands.label}` : ''}
          </span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setOpen(true)}
            title="Edit cloth, size, strands"
          >
            Edit
          </button>
          {hasContent && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={onFitToContent}
              title="Shrink the canvas to a tight fit around the placed patterns"
            >
              Fit to content
            </button>
          )}
        </>
      )}
      {open && (
        <>
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
            <span>Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as SizeUnit)}>
              <option value="cm">cm</option>
              <option value="in">inches</option>
              <option value="st">stitches</option>
            </select>
          </label>
          <label className="field field-inline">
            <span>Width ({unit})</span>
            <input
              type="number"
              min={1}
              step={unit === 'st' ? 1 : 0.1}
              value={displayW}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                onChange({ ...design, widthCm: toCm(v), gridW: toCells(v) });
              }}
            />
          </label>
          <label className="field field-inline">
            <span>Height ({unit})</span>
            <input
              type="number"
              min={1}
              step={unit === 'st' ? 1 : 0.1}
              value={displayH}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 1);
                onChange({ ...design, heightCm: toCm(v), gridH: toCells(v) });
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
          {hasContent && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={onFitToContent}
              title="Shrink the canvas to a tight fit around the placed patterns"
            >
              Fit to content
            </button>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setOpen(false)}
            title="Collapse"
          >
            Done
          </button>
        </>
      )}
      {/* View toggles: right-aligned, always visible in either open or
          collapsed state so panels can be revealed before the user touches
          the project settings. */}
      <span className="design-clothbar-views" role="group" aria-label="Panels">
        <button
          type="button"
          className={`chip chip-toggle${showPatterns ? ' chip-active' : ''}`}
          aria-pressed={showPatterns}
          onClick={onTogglePatterns}
          title={showPatterns ? 'Hide pattern library' : 'Show pattern library'}
        >
          {showPatterns ? 'Patterns ✓' : '+ Patterns'}
        </button>
        <button
          type="button"
          className={`chip chip-toggle${showInspector ? ' chip-active' : ''}`}
          aria-pressed={showInspector}
          onClick={onToggleInspector}
          title={showInspector ? 'Hide inspector' : 'Show inspector'}
        >
          {showInspector ? 'Inspector ✓' : '+ Inspector'}
        </button>
      </span>
    </section>
  );
}

// ---------- Area inspector ----------

interface AreaActions {
  onRotate: () => void;
  onFlip: (axis: 'x' | 'y') => void;
  onDuplicate: () => void;
  onDeleteArea: () => void;
  onPlanArea: (a: Area) => void;
}

function AreaInspector({
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
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <section className="panel">
      <div className="panel-h">
        <span>{selectedCount > 1 ? `${selectedCount} areas` : 'Area'}</span>
        {/* Right side: Arabic label + tiny ? toggle for the usage hint.
            Wrapped together so .panel-h's space-between layout still works. */}
        <span className="panel-h-right">
          <span dir="rtl">المنطقة</span>
          <button
            type="button"
            className={`help-toggle${helpOpen ? ' help-toggle-on' : ''}`}
            aria-pressed={helpOpen}
            aria-label="How to use areas"
            title="How to use areas"
            onClick={() => setHelpOpen((v) => !v)}
          >
            ?
          </button>
        </span>
      </div>
      {helpOpen && (
        <p className="empty-hint">
          Drop or tap a pattern on the canvas, then click it. Shift-click or drag a box to select several.
        </p>
      )}
      {area && (
        <AreaPanel
          area={area}
          multi={selectedCount > 1}
          palette={palette}
          libraryNumbers={libraryNumbers}
          onRecolor={onRecolor}
          updateArea={updateArea}
          {...actions}
        />
      )}
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
  onRotate,
  onFlip,
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
  // apply — show only the group transform + duplicate/delete actions.
  if (multi) {
    return (
      <div className="design-area">
        <p className="design-area-count">Transform, duplicate, or delete all selected areas.</p>
        <div className="design-transform">
          <button type="button" className="chip" onClick={onRotate} title="Rotate group 90°">
            ⟳ 90°
          </button>
          <button type="button" className="chip" onClick={() => onFlip('x')} title="Flip horizontally">
            ⇋ Flip X
          </button>
          <button type="button" className="chip" onClick={() => onFlip('y')} title="Flip vertically">
            ⇅ Flip Y
          </button>
        </div>
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

      {/* Transform: rotate 90° + flip. Mirror the canvas rotate handle. */}
      <div className="design-transform">
        <button type="button" className="chip" onClick={onRotate} title="Rotate 90° clockwise">
          ⟳ 90°
        </button>
        <button type="button" className="chip" onClick={() => onFlip('x')} title="Flip horizontally">
          ⇋ Flip X
        </button>
        <button type="button" className="chip" onClick={() => onFlip('y')} title="Flip vertically">
          ⇅ Flip Y
        </button>
      </div>

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
