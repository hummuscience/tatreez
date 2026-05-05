import { useEffect, useRef, useState } from 'react';
import type { ColorIndex, Pattern } from '../engine/types';
import { PALETTE, emptyPattern } from '../patterns/builtin';
import { countRegions, countStitches } from '../engine/regions';
import { savePattern, savedPatternKey } from '../storage/storage';
import { cellSize, clearCanvas, drawGridLines, drawPatternBackground } from './canvasUtil';
import type { PatternState } from '../App';

interface Props {
  state: PatternState;
  onChangePattern: (p: Pattern) => void;
  onSaved: (p: Pattern, key: string) => void;
  onGoToPlans: () => void;
}

const CANVAS_SIZE = 480;

export default function EditorTab({ state, onChangePattern, onSaved, onGoToPlans }: Props) {
  const { pattern } = state;
  const [activeColor, setActiveColor] = useState<ColorIndex>(1);
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
    const cs = cellSize(canvas.width, canvas.height, pattern.width, pattern.height);
    clearCanvas(ctx, canvas.width, canvas.height);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, pattern.width * cs, pattern.height * cs);
    drawPatternBackground(ctx, pattern, cs);
    drawGridLines(ctx, cs, pattern.width, pattern.height, 'rgba(0,0,0,0.12)');
  }, [pattern]);

  const cellAt = (clientX: number, clientY: number): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const cs = cellSize(canvas.width, canvas.height, pattern.width, pattern.height);
    const scale = r.width / canvas.width;
    const x = Math.floor((clientX - r.left) / (cs * scale));
    const y = Math.floor((clientY - r.top) / (cs * scale));
    if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return null;
    return [x, y];
  };

  const setCell = (x: number, y: number, val: ColorIndex) => {
    const next = pattern.cells.map((row) => row.slice());
    next[y][x] = val;
    onChangePattern({ ...pattern, cells: next });
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

  const onSave = () => {
    const finalName = name.trim() || 'Untitled';
    const toSave: Pattern = {
      ...pattern,
      name: finalName,
      ...(nameAr.trim() ? { nameAr: nameAr.trim() } : {}),
    };
    const id = savePattern(toSave);
    onSaved(toSave, savedPatternKey(id));
  };

  // Decide which palette to show: per-pattern if present, else global.
  const palette = pattern.palette ?? PALETTE.map((p) => p.color);

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
              const label = PALETTE[idx]?.name ?? color ?? '';
              return color ? (
                <button
                  type="button"
                  key={i}
                  className={`swatch${activeColor === idx ? ' swatch-on' : ''}`}
                  style={{ background: color }}
                  onClick={() => setActiveColor(idx)}
                  title={label}
                  aria-label={label}
                />
              ) : null;
            })}
          </div>
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
                : (PALETTE[activeColor]?.name ?? `color ${activeColor}`)}
            </span>
          </div>
          <div className="editor-actions">
            <button className="btn-ghost" onClick={onGoToPlans}>
              Generate plans →
            </button>
            <button className="btn-primary" onClick={onSave}>
              Save to library
            </button>
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
