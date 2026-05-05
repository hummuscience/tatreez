import { useEffect, useMemo, useRef, useState } from 'react';
import type { Corner, GroundTruthPart } from '../engine/types';
import { pointsToSteps } from '../engine/groundTruth';
import { getGroundTruth, setGroundTruth } from '../storage/storage';
import { getCanonicalGroundTruth } from '../patterns/groundTruths';
import { cellSize, clearCanvas, drawGridLines, drawPatternBackground } from './canvasUtil';
import type { PatternState } from '../App';

interface Props {
  state: PatternState;
  showToast: (msg: string) => void;
}

const CANVAS_SIZE = 500;

// Distinct colours for parts, cycled by index.
const PART_COLORS = [
  '#A32D2D',
  '#185FA5',
  '#3F7A3D',
  '#C39E3F',
  '#7A3F8C',
  '#1E7A7A',
  '#D85A30',
  '#5E1A2C',
];

export default function GroundTruthTab({ state, showToast }: Props) {
  const { pattern, patternKey } = state;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [points, setPoints] = useState<Corner[]>([]);
  const [threadStarts, setThreadStarts] = useState<number[]>([0]);
  const [parts, setParts] = useState<GroundTruthPart[]>([]);
  // Index of the currently-recording part (last in `parts` while open).
  // null = no active part; clicks land in "unassigned" (no part).
  const [activePartIdx, setActivePartIdx] = useState<number | null>(null);

  // Load existing ground truth when pattern changes; fall back to canonical
  useEffect(() => {
    if (patternKey) {
      const gt = getGroundTruth(patternKey);
      if (gt && gt.points) {
        setPoints(gt.points);
        setThreadStarts(gt.threadStarts || [0]);
        setParts(gt.parts ?? []);
        setActivePartIdx(null);
        return;
      }
      if (patternKey.startsWith('builtin:')) {
        const canonical = getCanonicalGroundTruth(patternKey.slice('builtin:'.length));
        if (canonical && canonical.points.length > 0) {
          setPoints(canonical.points);
          setThreadStarts(canonical.threadStarts);
          setParts([]);
          setActivePartIdx(null);
          return;
        }
      }
    }
    setPoints([]);
    setThreadStarts([0]);
    setParts([]);
    setActivePartIdx(null);
  }, [patternKey, pattern]);

  // Helper: which part contains a given point index, or -1 for unassigned.
  const partOfPoint = useMemo(() => {
    const arr = new Array<number>(points.length).fill(-1);
    parts.forEach((part, i) => {
      for (let p = part.pointStart; p < part.pointEnd; p++) {
        if (p >= 0 && p < arr.length) arr[p] = i;
      }
    });
    return arr;
  }, [points.length, parts]);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cs = cellSize(canvas.width, canvas.height, pattern.width, pattern.height);

    clearCanvas(ctx, canvas.width, canvas.height);
    drawPatternBackground(ctx, pattern, cs, 0.25);
    drawGridLines(ctx, cs, pattern.width, pattern.height, 'rgba(0,0,0,0.10)');

    // Corner dots
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let y = 0; y <= pattern.height; y++) {
      for (let x = 0; x <= pattern.width; x++) {
        ctx.beginPath();
        ctx.arc(x * cs, y * cs, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const startSet = new Set(threadStarts);
    let frontLegs = 0;
    for (let i = 1; i < points.length; i++) {
      if (startSet.has(i)) continue;
      const a = points[i - 1];
      const b = points[i];
      const dx = Math.abs(b[0] - a[0]);
      const dy = Math.abs(b[1] - a[1]);

      // Color the leg by its part. Unassigned points get the legacy red.
      const partIdx = partOfPoint[i];
      const partColor =
        partIdx >= 0 ? PART_COLORS[partIdx % PART_COLORS.length] : '#A32D2D';

      if (dx === 1 && dy === 1) {
        ctx.strokeStyle = partColor;
        ctx.lineWidth = 3;
        frontLegs++;
      } else {
        ctx.strokeStyle = dx === 0 || dy === 0 ? '#5DCAA5' : '#E24B4A';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
      }
      ctx.beginPath();
      ctx.moveTo(a[0] * cs, a[1] * cs);
      ctx.lineTo(b[0] * cs, b[1] * cs);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (points.length > 0) {
      const lp = points[points.length - 1];
      ctx.fillStyle = '#185FA5';
      ctx.beginPath();
      ctx.arc(lp[0] * cs, lp[1] * cs, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(24,95,165,0.8)';
    ctx.font = '10px sans-serif';
    for (let i = 0; i < Math.min(points.length, 50); i++) {
      const p = points[i];
      ctx.fillText(String(i + 1), p[0] * cs + 4, p[1] * cs - 2);
    }

    canvas.dataset.frontLegs = String(frontLegs);
  }, [pattern, points, threadStarts, partOfPoint]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const cs = cellSize(canvas.width, canvas.height, pattern.width, pattern.height);
    const scale = r.width / canvas.width;
    const fx = (e.clientX - r.left) / (cs * scale);
    const fy = (e.clientY - r.top) / (cs * scale);
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x < 0 || y < 0 || x > pattern.width || y > pattern.height) return;
    const last = points[points.length - 1];
    if (last && last[0] === x && last[1] === y) {
      // Same corner clicked twice → mark a thread restart at the next index
      setThreadStarts((cur) => [...cur, points.length]);
    } else {
      setPoints((cur) => [...cur, [x, y]]);
      // Extend the active part's end to include this point.
      if (activePartIdx !== null) {
        setParts((cur) =>
          cur.map((p, i) =>
            i === activePartIdx ? { ...p, pointEnd: points.length + 1 } : p,
          ),
        );
      }
    }
  };

  const onReset = () => {
    if (!confirm('Clear current recording?')) return;
    setPoints([]);
    setThreadStarts([0]);
    setParts([]);
    setActivePartIdx(null);
  };

  const onUndo = () => {
    if (points.length === 0) return;
    if (threadStarts[threadStarts.length - 1] === points.length) {
      setThreadStarts((ts) => ts.slice(0, -1));
    }
    // If undo removes the last point of the active part, shrink its end.
    if (activePartIdx !== null) {
      setParts((cur) =>
        cur.map((p, i) =>
          i === activePartIdx
            ? { ...p, pointEnd: Math.max(p.pointStart, points.length - 1) }
            : p,
        ),
      );
    }
    setPoints((p) => p.slice(0, -1));
  };

  const onStartPart = () => {
    const name = (prompt('Name this part (e.g. "stalk", "bean")', '') || '').trim();
    if (!name) return;
    // The new part starts at the next point that will be added.
    const newPart: GroundTruthPart = {
      name,
      pointStart: points.length,
      pointEnd: points.length,
    };
    setParts((cur) => [...cur, newPart]);
    setActivePartIdx(parts.length);
  };

  const onEndPart = () => {
    setActivePartIdx(null);
  };

  const onDeletePart = (idx: number) => {
    const part = parts[idx];
    if (!confirm(`Delete part "${part.name}" and its ${part.pointEnd - part.pointStart} points?`)) {
      return;
    }
    // Remove the part's points; shift later parts' indices down.
    const removed = part.pointEnd - part.pointStart;
    setPoints((cur) => [...cur.slice(0, part.pointStart), ...cur.slice(part.pointEnd)]);
    setThreadStarts((cur) =>
      cur
        .map((ts) => {
          if (ts >= part.pointEnd) return ts - removed;
          if (ts > part.pointStart) return part.pointStart;
          return ts;
        })
        .filter((ts, i, arr) => i === 0 || ts !== arr[i - 1]),
    );
    setParts((cur) =>
      cur
        .filter((_, i) => i !== idx)
        .map((p) =>
          p.pointStart >= part.pointEnd
            ? { ...p, pointStart: p.pointStart - removed, pointEnd: p.pointEnd - removed }
            : p,
        ),
    );
    setActivePartIdx((cur) => {
      if (cur === null) return null;
      if (cur === idx) return null;
      if (cur > idx) return cur - 1;
      return cur;
    });
  };

  const onRenamePart = (idx: number) => {
    const newName = (prompt('Rename part', parts[idx].name) || '').trim();
    if (!newName) return;
    setParts((cur) => cur.map((p, i) => (i === idx ? { ...p, name: newName } : p)));
  };

  // Make a part the active one. Only the LAST part can resume cleanly:
  // appending points to a non-last part would shift every later part's
  // indices, which is doable but adds complexity we can revisit if needed.
  const onResumePart = (idx: number) => {
    if (idx !== parts.length - 1) {
      alert(
        'Only the most recent part can be resumed. Move this part to the end first ' +
          '(use the down arrow on later parts to reorder).',
      );
      return;
    }
    // Truncate any trailing points after this part's end (they're unassigned).
    const part = parts[idx];
    if (points.length > part.pointEnd) {
      const trim = part.pointEnd;
      setPoints((cur) => cur.slice(0, trim));
      setThreadStarts((cur) => cur.filter((ts) => ts <= trim));
    }
    setActivePartIdx(idx);
  };

  // Reorder a part by moving its points slice. `direction` = -1 for up,
  // +1 for down. Updates the parts array AND the points array so the
  // recording's playback order reflects the new ordering.
  const onMovePart = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= parts.length) return;
    const a = direction === -1 ? target : idx; // upper part
    const b = direction === -1 ? idx : target; // lower part
    const partA = parts[a];
    const partB = parts[b];
    // Layout: [ before | A | middleAB | B | after ] →
    //         [ before | B | middleAB | A | after ]
    const before = points.slice(0, partA.pointStart);
    const sliceA = points.slice(partA.pointStart, partA.pointEnd);
    const middleAB = points.slice(partA.pointEnd, partB.pointStart);
    const sliceB = points.slice(partB.pointStart, partB.pointEnd);
    const after = points.slice(partB.pointEnd);
    const newPoints = [...before, ...sliceB, ...middleAB, ...sliceA, ...after];

    // Recompute part bounds: A and B swap, but parts between them keep their
    // relative position with shifted start/end.
    const lenA = sliceA.length;
    const lenB = sliceB.length;
    const middleLen = middleAB.length;
    const newPartB: GroundTruthPart = {
      ...partB,
      pointStart: partA.pointStart,
      pointEnd: partA.pointStart + lenB,
    };
    const newPartA: GroundTruthPart = {
      ...partA,
      pointStart: partA.pointStart + lenB + middleLen,
      pointEnd: partA.pointStart + lenB + middleLen + lenA,
    };
    const newParts = parts.map((p, i) => {
      if (i === a) return newPartB;
      if (i === b) return newPartA;
      // Parts between a and b shift left by (lenA - lenB) since they move
      // out of A's old slot but get B's old slot before them.
      if (i > a && i < b) {
        const shift = lenB - lenA;
        return { ...p, pointStart: p.pointStart + shift, pointEnd: p.pointEnd + shift };
      }
      return p;
    });
    // Swap positions in the parts array.
    [newParts[a], newParts[b]] = [newParts[b], newParts[a]];

    // Thread starts: rebuild from scratch by computing them per part. The
    // first point of each part is treated as a thread start.
    const newThreadStarts = newParts.map((p) => p.pointStart);

    setPoints(newPoints);
    setParts(newParts);
    setThreadStarts(newThreadStarts.length ? newThreadStarts : [0]);
    setActivePartIdx(null);
  };

  const onSave = () => {
    if (!patternKey) {
      alert('Load a pattern from the library or save your edited pattern first.');
      return;
    }
    if (points.length < 2) {
      alert('Click at least two corners to record a stitch path.');
      return;
    }
    const steps = pointsToSteps(points, threadStarts);
    setGroundTruth(patternKey, { points, threadStarts, steps, parts });
    showToast(`Saved ground truth for ${pattern.name}`);
  };

  const frontLegs = useMemo(() => {
    let n = 0;
    const startSet = new Set(threadStarts);
    for (let i = 1; i < points.length; i++) {
      if (startSet.has(i)) continue;
      const a = points[i - 1];
      const b = points[i];
      if (Math.abs(b[0] - a[0]) === 1 && Math.abs(b[1] - a[1]) === 1) n++;
    }
    return n;
  }, [points, threadStarts]);

  const unassignedCount = useMemo(
    () => partOfPoint.filter((p) => p === -1).length,
    [partOfPoint],
  );

  return (
    <section className="panel">
      <div className="panel-h">
        <span>Ground truth recorder</span>
        <span dir="rtl">مسجّل المرجع</span>
      </div>
      <p className="gt-explainer">
        Click corners on the chart in the order you'd actually stitch them. The recorder pairs
        them up into stitches automatically. Click the <strong>same corner twice</strong> to mark
        a thread restart. Use <strong>Start part</strong> to mark a logical unit (e.g. "stalk",
        "bean", "leaf"). Points clicked while a part is active belong to it. The same part shape
        can later be recognized in other charts and stitched the same way.
      </p>
      <div
        className="toolbar"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}
      >
        <button className="btn-ghost btn-sm" onClick={onReset}>
          Reset recording
        </button>
        <button
          className="btn-ghost btn-sm"
          onClick={onUndo}
          disabled={points.length === 0}
        >
          Undo last point
        </button>
        {activePartIdx === null ? (
          <button className="btn-ghost btn-sm" onClick={onStartPart}>
            Start part
          </button>
        ) : (
          <button className="btn-primary btn-sm" onClick={onEndPart}>
            End part: {parts[activePartIdx]?.name}
          </button>
        )}
        <button
          className="btn-primary btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={onSave}
        >
          Save as ground truth
        </button>
      </div>
      <div className="row">
        <div className="grid-wrap">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ cursor: 'crosshair', display: 'block' }}
            onClick={handleClick}
          />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="stat">
            <div className="stat-label">Points clicked</div>
            <div className="stat-val">{points.length}</div>
          </div>
          <div className="stat" style={{ marginTop: 8 }}>
            <div className="stat-label">Front legs laid</div>
            <div className="stat-val">{frontLegs}</div>
          </div>
          <div className="stat" style={{ marginTop: 8 }}>
            <div className="stat-label">Pattern</div>
            <div className="stat-val" style={{ fontSize: 13 }}>
              {patternKey ? pattern.name : '(load or save a pattern first)'}
            </div>
          </div>
          <div className="stat" style={{ marginTop: 8 }}>
            <div className="stat-label">Thread restarts</div>
            <div className="stat-val">{Math.max(0, threadStarts.length - 1)}</div>
          </div>

          <div className="section-label" style={{ marginTop: 16, marginBottom: 6 }}>
            Parts
          </div>
          {parts.length === 0 && (
            <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
              No parts yet. Click <em>Start part</em> to define one.
            </p>
          )}
          {parts.map((p, i) => {
            const color = PART_COLORS[i % PART_COLORS.length];
            const count = p.pointEnd - p.pointStart;
            const isActive = i === activePartIdx;
            const isLast = i === parts.length - 1;
            const btnStyle = { fontSize: 11, padding: '2px 6px' };
            return (
              <div
                key={i}
                style={{
                  padding: '4px 6px',
                  marginBottom: 3,
                  background: isActive ? 'rgba(24, 95, 165, 0.10)' : 'transparent',
                  borderLeft: `4px solid ${color}`,
                  borderRadius: 3,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1 }}>
                    <strong>{p.name}</strong>
                    <span className="muted"> ({count} pts)</span>
                    {isActive && <span className="muted"> • recording</span>}
                  </span>
                  <button
                    onClick={() => onMovePart(i, -1)}
                    disabled={i === 0}
                    title="Move up"
                    style={btnStyle}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => onMovePart(i, 1)}
                    disabled={i === parts.length - 1}
                    title="Move down"
                    style={btnStyle}
                  >
                    ↓
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {!isActive && isLast && (
                    <button
                      onClick={() => onResumePart(i)}
                      style={btnStyle}
                      title="Continue recording in this part"
                    >
                      Resume
                    </button>
                  )}
                  <button onClick={() => onRenamePart(i)} style={btnStyle}>
                    Rename
                  </button>
                  <button onClick={() => onDeletePart(i)} style={btnStyle}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
          {unassignedCount > 0 && (
            <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>
              {unassignedCount} point{unassignedCount === 1 ? '' : 's'} not assigned to any part.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
