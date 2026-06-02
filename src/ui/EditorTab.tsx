import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColorIndex, PaletteColor, Pattern } from '../engine/types';
import { emptyPattern, getPaletteColors } from '../patterns/builtin';
import { BUILTIN_PATTERNS } from '../patterns/builtin';
import { TIRAZAIN_ARCHIVE } from '../patterns/tirazainArchive';
import { libraryDmcNumbers } from '../patterns/dmcCatalog';
import { countRegions, countStitches } from '../engine/regions';
import { savePattern, savedPatternKey } from '../storage/storage';
import { GUTTER, cellSize, clearCanvas, drawAxisLabels, drawGridLines, drawPatternBackground } from './canvasUtil';
import ColorReplacePopover from './ColorReplacePopover';
import DesignPicker from './DesignPicker';
import type { PatternState } from '../App';

interface Props {
  state: PatternState;
  onChangePattern: (p: Pattern) => void;
  onSaved: (p: Pattern, key: string) => void;
  onGoToPlans: () => void;
  /** Place the current pattern into a design (existing id, or null = new). */
  onAddToDesign: (pattern: Pattern, key: string, designId: string | null) => void;
}

const CANVAS_SIZE = 480;

export default function EditorTab({ state, onChangePattern, onSaved, onGoToPlans, onAddToDesign }: Props) {
  const { pattern } = state;
  const [activeColor, setActiveColor] = useState<ColorIndex>(1);
  const [replacing, setReplacing] = useState(false);
  const [name, setName] = useState(pattern.name);
  const [nameAr, setNameAr] = useState(pattern.nameAr ?? '');
  const [w, setW] = useState(pattern.width);
  const [h, setH] = useState(pattern.height);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef<{ active: boolean; mode: 'paint' | 'erase' } | null>(null);

  // Sync editable fields when the loaded pattern changes externally.
  useEffect(() => {
    setName(pattern.name);
    setNameAr(pattern.nameAr ?? '');
    setW(pattern.width);
    setH(pattern.height);
  }, [pattern]);

  // Render the editor canvas whenever pattern changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cs = cellSize(canvas.width - GUTTER, canvas.height - GUTTER, pattern.width, pattern.height);
    clearCanvas(ctx, canvas.width, canvas.height);
    drawAxisLabels(ctx, cs, pattern.width, pattern.height);
    ctx.save();
    ctx.translate(GUTTER, GUTTER);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pattern.width * cs, pattern.height * cs);
    drawPatternBackground(ctx, pattern, cs);
    drawGridLines(ctx, cs, pattern.width, pattern.height, 'rgba(0,0,0,0.12)');
    ctx.restore();
  }, [pattern]);

  const cellAt = (clientX: number, clientY: number): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const cs = cellSize(canvas.width - GUTTER, canvas.height - GUTTER, pattern.width, pattern.height);
    const scale = r.width / canvas.width;
    const x = Math.floor((clientX - r.left - GUTTER * scale) / (cs * scale));
    const y = Math.floor((clientY - r.top - GUTTER * scale) / (cs * scale));
    if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return null;
    return [x, y];
  };

  const setCell = (x: number, y: number, val: ColorIndex) => {
    const next = pattern.cells.map((row) => row.slice());
    next[y][x] = val;
    onChangePattern({ ...pattern, cells: next });
  };

  // DMC numbers used across the whole library — the "traditional" set the
  // Replace picker can filter to. Computed once; the library is static.
  const libraryNumbers = useMemo(
    () =>
      libraryDmcNumbers([
        ...Object.values(BUILTIN_PATTERNS),
        ...Object.values(TIRAZAIN_ARCHIVE),
      ]),
    [],
  );

  // Replace the colour in palette slot `idx` with `color`. Cells already
  // reference the slot by index, so swapping the palette entry recolours
  // every cell of that colour — no cell rewrite needed.
  const replaceColor = (idx: ColorIndex, color: PaletteColor) => {
    const palette = getPaletteColors(pattern).slice();
    palette[idx] = color;
    onChangePattern({ ...pattern, palette });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const xy = cellAt(e.clientX, e.clientY);
    if (!xy) return;
    const [x, y] = xy;
    if (pattern.cells[y][x] === activeColor) {
      paintingRef.current = { active: true, mode: 'erase' };
      setCell(x, y, 0);
    } else {
      paintingRef.current = { active: true, mode: 'paint' };
      setCell(x, y, activeColor);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current?.active) return;
    const xy = cellAt(e.clientX, e.clientY);
    if (!xy) return;
    const [x, y] = xy;
    const target: ColorIndex = paintingRef.current.mode === 'paint' ? activeColor : 0;
    if (pattern.cells[y][x] !== target) setCell(x, y, target);
  };

  useEffect(() => {
    const stop = () => {
      if (paintingRef.current) paintingRef.current.active = false;
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  const onResize = () => {
    if (w < 3 || h < 3 || w > 60 || h > 60) return;
    onChangePattern(emptyPattern(w, h, name));
  };

  const onClear = () => {
    onChangePattern(emptyPattern(pattern.width, pattern.height, name));
  };

  // Build the pattern with the current name/Arabic-name applied — shared by
  // "Save to library" and "Add to design".
  const finalizedPattern = (): Pattern => ({
    ...pattern,
    name: name.trim() || 'Untitled',
    ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
  });

  const onSave = () => {
    const toSave = finalizedPattern();
    const id = savePattern(toSave);
    onSaved(toSave, savedPatternKey(id));
  };

  const [pickingDesign, setPickingDesign] = useState(false);
  const addToDesign = (designId: string | null) => {
    const p = finalizedPattern();
    // Provenance key: reuse the saved key if this pattern came from the
    // library, else a synthetic editor key (placeMotif only stores it as the
    // motif's patternKey — it never needs to resolve to a library entry).
    const key = state.patternKey ?? `editor:${p.name}`;
    onAddToDesign(p, key, designId);
    setPickingDesign(false);
  };

  // Decide which palette to show (objects carry hex + optional DMC).
  const palette = getPaletteColors(pattern);

  return (
    <div className="editor">
      <aside className="editor-side">
        <div className="panel">
          <div className="panel-h">
            <span>Pattern info</span>
            <span dir="rtl">معلومات النمط</span>
          </div>
          <div className="info-row">
            <span className="info-k">Name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pattern name"
            />
          </div>
          <div className="info-row">
            <span className="info-k">Arabic name</span>
            <input
              className="input ar-input"
              dir="rtl"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder="الاسم بالعربية"
            />
          </div>
          <div className="info-row info-row-split">
            <div>
              <span className="info-k">Width</span>
              <input
                className="input input-sm"
                type="number"
                min={3}
                max={60}
                value={w}
                onChange={(e) => setW(parseInt(e.target.value, 10) || 3)}
              />
            </div>
            <div>
              <span className="info-k">Height</span>
              <input
                className="input input-sm"
                type="number"
                min={3}
                max={60}
                value={h}
                onChange={(e) => setH(parseInt(e.target.value, 10) || 3)}
              />
            </div>
          </div>
          <div className="info-row info-row-split">
            <button className="btn-ghost btn-sm" onClick={onResize}>
              Resize
            </button>
            <button className="btn-ghost btn-sm" onClick={onClear}>
              Clear
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">
            <span>Palette</span>
            <span dir="rtl">لوحة الألوان</span>
          </div>
          <div className="palette">
            <button
              type="button"
              className={`swatch swatch-empty${activeColor === 0 ? ' swatch-on' : ''}`}
              onClick={() => setActiveColor(0)}
              title="Empty (eraser)"
              aria-label="Empty"
            />
            {palette.slice(1).map((color, i) => {
              const idx = (i + 1) as ColorIndex;
              if (!color) return null;
              const label = color.dmc
                ? `DMC ${color.dmc.number} · ${color.dmc.name}`
                : color.hex;
              return (
                <button
                  type="button"
                  key={i}
                  className={`swatch${activeColor === idx ? ' swatch-on' : ''}`}
                  style={{ background: color.hex }}
                  onClick={() => setActiveColor(idx)}
                  title={label}
                  aria-label={label}
                />
              );
            })}
          </div>
          {activeColor > 0 && palette[activeColor] && (
            <div className="palette-active">
              <span className="palette-active-label">
                {palette[activeColor]!.dmc
                  ? `DMC ${palette[activeColor]!.dmc!.number} · ${palette[activeColor]!.dmc!.name}`
                  : palette[activeColor]!.hex}
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setReplacing(true)}
              >
                Replace…
              </button>
            </div>
          )}
          {replacing && activeColor > 0 && palette[activeColor] && (
            <ColorReplacePopover
              current={palette[activeColor]!}
              libraryNumbers={libraryNumbers}
              onPick={(c) => {
                replaceColor(activeColor, c);
                setReplacing(false);
              }}
              onClose={() => setReplacing(false)}
            />
          )}
        </div>

        <div className="panel panel-stats">
          <div className="panel-h">
            <span>Stats</span>
            <span dir="rtl">إحصائيات</span>
          </div>
          <div className="stat">
            <span className="stat-label">Stitches</span>
            <span className="stat-val">{countStitches(pattern)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Regions</span>
            <span className="stat-val">{countRegions(pattern)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Size</span>
            <span className="stat-val">
              {pattern.width}×{pattern.height}
            </span>
          </div>
        </div>
      </aside>

      <main className="editor-main">
        {pattern.source && (
          <div className="panel" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span className="info-k" style={{ marginBottom: 0 }}>
                From
              </span>
              <strong>{pattern.source.archive}</strong>
              {pattern.source.region && (
                <>
                  <span className="pat-dot">·</span>
                  <span>{pattern.source.region}</span>
                </>
              )}
              {(pattern.nameAr || pattern.source.arabicName) && (
                <>
                  <span className="pat-dot">·</span>
                  <span dir="rtl">{pattern.nameAr ?? pattern.source.arabicName}</span>
                </>
              )}
              <a
                href={pattern.source.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginLeft: 'auto', fontSize: 11 }}
              >
                View original ↗
              </a>
            </div>
          </div>
        )}

        <div className="editor-toolbar">
          <div className="zoom-ctrl">
            <span className="info-k" style={{ marginBottom: 0 }}>
              Active
            </span>
            <span>
              {activeColor === 0
                ? 'eraser'
                : (palette[activeColor]?.dmc?.name ?? `color ${activeColor}`)}
            </span>
          </div>
          <div className="editor-actions">
            <button className="btn-ghost" onClick={onGoToPlans}>
              Generate plans →
            </button>
            <button className="btn-ghost" onClick={() => setPickingDesign(true)}>
              Add to design
            </button>
            <button className="btn-primary" onClick={onSave}>
              Save to library
            </button>
            {pickingDesign && (
              <DesignPicker
                onCancel={() => setPickingDesign(false)}
                onChoose={addToDesign}
              />
            )}
          </div>
        </div>

        <div className="canvas-stage">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ cursor: 'crosshair', display: 'block' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
          />
        </div>
      </main>
    </div>
  );
}
