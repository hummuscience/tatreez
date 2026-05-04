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
  const [w, setW] = useState(pattern.width);
  const [h, setH] = useState(pattern.height);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintingRef = useRef<{ active: boolean; mode: 'paint' | 'erase' } | null>(null);

  // Sync name and dims when pattern changes externally (e.g. loaded from library)
  useEffect(() => {
    setName(pattern.name);
    setW(pattern.width);
    setH(pattern.height);
  }, [pattern]);

  // Render the editor canvas whenever pattern changes
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

  // Stop painting on global mouseup so dragging off-canvas doesn't leave it stuck
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
    onChangePattern({ ...emptyPattern(pattern.width, pattern.height, name) });
  };

  const onSave = () => {
    const finalName = name.trim() || 'Untitled';
    const toSave: Pattern = { ...pattern, name: finalName };
    const id = savePattern(toSave);
    onSaved(toSave, savedPatternKey(id));
  };

  return (
    <div>
      {pattern.source && (
        <div
          className="card"
          style={{
            marginBottom: 8,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
          }}
        >
          <span className="muted">From</span>
          <strong>{pattern.source.archive}</strong>
          {pattern.source.region && (
            <>
              <span className="muted">·</span>
              <span>{pattern.source.region}</span>
            </>
          )}
          {pattern.source.arabicName && (
            <>
              <span className="muted">·</span>
              <span dir="rtl">{pattern.source.arabicName}</span>
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
      )}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="toolbar">
          <input
            type="text"
            placeholder="Pattern name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: 220 }}
          />
          <span className="muted">Color:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(() => {
              // If the pattern has its own palette (e.g. imported from an
              // image), show that. Otherwise show the global PALETTE.
              const colors = pattern.palette
                ? pattern.palette
                : PALETTE.map((p) => p.color);
              return colors.map((color, i) => (
                <div
                  key={i}
                  className={`swatch ${i === activeColor ? 'active' : ''} ${color ? '' : 'empty'}`}
                  style={color ? { background: color } : undefined}
                  title={
                    pattern.palette
                      ? color === null
                        ? 'empty'
                        : color
                      : PALETTE[i]?.name ?? color ?? ''
                  }
                  onClick={() => setActiveColor(i as ColorIndex)}
                />
              ));
            })()}
          </div>
          <span className="muted" style={{ marginLeft: 8 }}>
            Size:
          </span>
          <input
            type="number"
            min={3}
            max={60}
            value={w}
            onChange={(e) => setW(parseInt(e.target.value, 10) || 3)}
            style={{ width: 60 }}
          />
          <span style={{ fontSize: 13 }}>×</span>
          <input
            type="number"
            min={3}
            max={60}
            value={h}
            onChange={(e) => setH(parseInt(e.target.value, 10) || 3)}
            style={{ width: 60 }}
          />
          <button onClick={onResize}>Resize</button>
          <button onClick={onClear}>Clear</button>
          <button className="primary" style={{ marginLeft: 'auto' }} onClick={onSave}>
            Save to library
          </button>
        </div>

        <div className="row">
          <div className="grid-wrap">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              style={{ cursor: 'crosshair', display: 'block' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <div className="stat">
                <div className="stat-label">Stitches</div>
                <div className="stat-val">{countStitches(pattern)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Regions</div>
                <div className="stat-val">{countRegions(pattern)}</div>
              </div>
            </div>
            <button
              className="primary"
              style={{ marginTop: 12, width: '100%' }}
              onClick={onGoToPlans}
            >
              Generate plans →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
