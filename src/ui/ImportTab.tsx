import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pattern } from '../engine/types';
import {
  detectPatternFromImage,
  patternFromDetectionAuto,
  type DetectionResult,
  type DetectionMode,
} from '../detect';
import { autoCrop } from '../detect/crop';
import { rgbToHex } from '../detect/imageData';
import type { CropBox } from '../detect/types';

interface Props {
  onSendToEditor: (p: Pattern) => void;
  showToast: (msg: string) => void;
}

type DragMode =
  | { kind: 'move'; startCrop: CropBox; startX: number; startY: number }
  | {
      kind: 'resize';
      side: 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';
      startCrop: CropBox;
      startX: number;
      startY: number;
    }
  | { kind: 'create'; startX: number; startY: number };

export default function ImportTab({ onSendToEditor, showToast }: Props) {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [crop, setCrop] = useState<CropBox | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [paletteSize, setPaletteSize] = useState(3);
  // Index of the cluster the user has marked as "empty" (background).
  // When null, auto-pick the lightest cluster.
  const [emptyCluster, setEmptyCluster] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<DragMode | null>(null);
  // Manual grid-size override (for borderless images). 0 = auto-detect.
  const [manualGridW, setManualGridW] = useState<number>(0);
  const [manualGridH, setManualGridH] = useState<number>(0);
  const [detectionMode, setDetectionMode] = useState<DetectionMode>('auto');
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // When a new image is loaded OR detection mode changes, auto-crop and
  // re-seed manual grid from auto-detection so the user has a sensible
  // starting point under the chosen mode.
  useEffect(() => {
    if (!imageData) {
      setCrop(null);
      setManualGridW(0);
      setManualGridH(0);
      return;
    }
    const existingCrop = crop ?? autoCrop(imageData);
    if (!crop) setCrop(existingCrop);
    try {
      const seed = detectPatternFromImage(imageData, {
        paletteSize: 3,
        cropOverride: existingCrop,
        detectionMode,
      });
      setManualGridW(seed.samples.width);
      setManualGridH(seed.samples.height);
    } catch {
      /* If seeding fails, leave grid as-is */
    }
    // Note: we deliberately depend on imageData and detectionMode but
    // not crop, to avoid re-seeding when the user drags the crop box
    // (that re-runs the detection effect anyway).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageData, detectionMode]);

  // Re-run detection whenever crop / paletteSize / manual grid changes.
  // Manual grid is now ALWAYS used (after seeding from auto on load).
  useEffect(() => {
    if (!imageData || !crop || manualGridW <= 0 || manualGridH <= 0) {
      setDetection(null);
      return;
    }
    setBusy(true);
    const handle = window.setTimeout(() => {
      try {
        const det = detectPatternFromImage(imageData, {
          paletteSize,
          cropOverride: crop,
          gridSize: { width: manualGridW, height: manualGridH },
          detectionMode,
        });
        setDetection(det);
        // Auto-pick empty: prefer the transparent cluster if any, else
        // the lightest cluster.
        let bestI = 0;
        const transparentIdx = det.clusters.findIndex((c) => c.transparent);
        if (transparentIdx >= 0) {
          bestI = transparentIdx;
        } else {
          let bestSum = -1;
          det.clusters.forEach((c, i) => {
            const s = c.centroid.r + c.centroid.g + c.centroid.b;
            if (s > bestSum) {
              bestSum = s;
              bestI = i;
            }
          });
        }
        setEmptyCluster(bestI);
      } finally {
        setBusy(false);
      }
    }, 30);
    return () => window.clearTimeout(handle);
  }, [imageData, crop, paletteSize, manualGridW, manualGridH, detectionMode]);

  // Compute display scale for the preview canvas
  const displayScale = useMemo(() => {
    if (!imageData) return 1;
    const maxW = 760;
    return Math.min(1, maxW / imageData.width);
  }, [imageData]);

  const canvasW = imageData ? Math.round(imageData.width * displayScale) : 0;
  const canvasH = imageData ? Math.round(imageData.height * displayScale) : 0;

  // Render preview
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !imageData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvasW;
    canvas.height = canvasH;

    const off = document.createElement('canvas');
    off.width = imageData.width;
    off.height = imageData.height;
    off.getContext('2d')!.putImageData(imageData, 0, 0);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);

    if (!detection || !crop) return;
    const { gridlines, samples, assignments } = detection;
    ctx.save();
    ctx.scale(displayScale, displayScale);
    ctx.translate(crop.x, crop.y);

    // Cell colour overlays — paint each cell with the actual detected
    // cluster RGB centroid, except cells in the chosen empty cluster.
    for (let cy = 0; cy < samples.height; cy++) {
      for (let cx = 0; cx < samples.width; cx++) {
        const cluster = assignments[cy][cx];
        if (cluster === emptyCluster) continue;
        const x0 = gridlines.xs[cx];
        const x1 = gridlines.xs[cx + 1];
        const y0 = gridlines.ys[cy];
        const y1 = gridlines.ys[cy + 1];
        const c = detection.clusters[cluster]?.centroid;
        if (!c) continue;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = rgbToHex(c);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    ctx.globalAlpha = 1;

    // Gridlines
    ctx.strokeStyle = 'rgba(24, 95, 165, 0.85)';
    ctx.lineWidth = 1 / displayScale;
    const lastX = gridlines.xs[gridlines.xs.length - 1] ?? crop.w;
    const lastY = gridlines.ys[gridlines.ys.length - 1] ?? crop.h;
    for (const x of gridlines.xs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, lastY);
      ctx.stroke();
    }
    for (const y of gridlines.ys) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(lastX, y);
      ctx.stroke();
    }
    ctx.restore();
  }, [imageData, detection, emptyCluster, crop, canvasW, canvasH, displayScale]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = img.naturalWidth;
        off.height = img.naturalHeight;
        const ctx = off.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
        setImageData(data);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const sendToEditor = () => {
    if (!detection) return;
    const p = patternFromDetectionAuto(
      detection,
      emptyCluster ?? undefined,
      'Imported',
    );
    if (p.width === 0 || p.height === 0) {
      showToast('Detection produced an empty pattern — try a clearer chart');
      return;
    }
    onSendToEditor(p);
    showToast(`Sent ${p.width}×${p.height} pattern to editor`);
  };

  // Crop drag handling — coordinates are in image pixel space
  const screenToImage = (clientX: number, clientY: number): [number, number] | null => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !imageData) return null;
    const r = wrapper.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * imageData.width;
    const y = ((clientY - r.top) / r.height) * imageData.height;
    return [Math.max(0, Math.min(imageData.width, x)), Math.max(0, Math.min(imageData.height, y))];
  };

  type ResizeSide = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';
  const onMouseDownCrop = (e: React.MouseEvent, side?: ResizeSide) => {
    if (!imageData || !crop) return;
    const xy = screenToImage(e.clientX, e.clientY);
    if (!xy) return;
    e.stopPropagation();
    if (side) {
      setDrag({ kind: 'resize', side, startCrop: crop, startX: xy[0], startY: xy[1] });
    } else {
      setDrag({ kind: 'move', startCrop: crop, startX: xy[0], startY: xy[1] });
    }
  };

  const onMouseDownEmpty = (e: React.MouseEvent) => {
    if (!imageData) return;
    const xy = screenToImage(e.clientX, e.clientY);
    if (!xy) return;
    setDrag({ kind: 'create', startX: xy[0], startY: xy[1] });
    setCrop({ x: xy[0], y: xy[1], w: 1, h: 1 });
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      if (!imageData) return;
      const xy = screenToImage(e.clientX, e.clientY);
      if (!xy) return;
      if (drag.kind === 'move') {
        const dx = xy[0] - drag.startX;
        const dy = xy[1] - drag.startY;
        const c = drag.startCrop;
        const x = Math.max(0, Math.min(imageData.width - c.w, c.x + dx));
        const y = Math.max(0, Math.min(imageData.height - c.h, c.y + dy));
        setCrop({ x, y, w: c.w, h: c.h });
      } else if (drag.kind === 'resize') {
        const c = drag.startCrop;
        let x = c.x;
        let y = c.y;
        let w = c.w;
        let h = c.h;
        const right = c.x + c.w;
        const bottom = c.y + c.h;
        const newX = xy[0];
        const newY = xy[1];
        if (drag.side.includes('l')) {
          x = Math.min(newX, right - 10);
          w = right - x;
        }
        if (drag.side.includes('r')) {
          w = Math.max(10, newX - c.x);
        }
        if (drag.side.includes('t')) {
          y = Math.min(newY, bottom - 10);
          h = bottom - y;
        }
        if (drag.side.includes('b')) {
          h = Math.max(10, newY - c.y);
        }
        setCrop({ x, y, w, h });
      } else if (drag.kind === 'create') {
        const x0 = Math.min(drag.startX, xy[0]);
        const y0 = Math.min(drag.startY, xy[1]);
        const x1 = Math.max(drag.startX, xy[0]);
        const y1 = Math.max(drag.startY, xy[1]);
        setCrop({ x: x0, y: y0, w: Math.max(10, x1 - x0), h: Math.max(10, y1 - y0) });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, imageData]);

  const cropDisplay = crop && imageData
    ? {
        left: (crop.x / imageData.width) * 100,
        top: (crop.y / imageData.height) * 100,
        width: (crop.w / imageData.width) * 100,
        height: (crop.h / imageData.height) * 100,
      }
    : null;

  return (
    <div className="import">
      <section className="panel">
        <div className="panel-h">
          <span>Import from image</span>
          <span dir="rtl">استيراد من صورة</span>
        </div>
        <p className="section-sub" style={{ marginTop: 0, marginBottom: 14 }}>
          Drop a chart screenshot. The detector finds the chart border, the gridlines, and
          clusters the cell colours. <strong>Drag the red crop box</strong> to refine which
          region of the image is the chart, then send the pattern to the Editor.
        </p>
        <div className="toolbar">
          <button onClick={() => fileInputRef.current?.click()}>Choose image…</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
          <span className="muted" style={{ marginLeft: 12 }}>
            Colours:
          </span>
          <select
            value={paletteSize}
            onChange={(e) => setPaletteSize(parseInt(e.target.value, 10))}
            title="Number of distinct colours to detect (including the background)"
          >
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="muted" style={{ marginLeft: 12 }}>
            Detect:
          </span>
          <select
            value={detectionMode}
            onChange={(e) => setDetectionMode(e.target.value as DetectionMode)}
            title="How to find the grid"
          >
            <option value="auto">auto</option>
            <option value="gridlines">gridlines (PDF charts)</option>
            <option value="blocks">uniform cells (pixel art)</option>
          </select>
          <button
            onClick={() => imageData && setCrop(autoCrop(imageData))}
            disabled={!imageData}
            title="Reset crop to auto-detected bounds"
          >
            Auto-crop
          </button>
          <button
            className="btn-primary btn-sm"
            style={{ marginLeft: 'auto' }}
            disabled={!detection || busy}
            onClick={sendToEditor}
          >
            Send to editor →
          </button>
        </div>

        {!imageData ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{
              border: '2px dashed var(--border-strong)',
              borderRadius: 12,
              padding: 60,
              textAlign: 'center',
              color: 'var(--text-secondary)',
              background: 'var(--bg-soft)',
            }}
          >
            Drop a chart image here, or click <em>Choose image…</em> above.
          </div>
        ) : (
          <>
            {/* Prominent grid-size panel: this is the primary control for
                pixel-art images where detection can't be relied on. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                margin: '0 0 12px',
                padding: '10px 14px',
                background: 'var(--bg-soft)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                flexWrap: 'wrap',
              }}
            >
              <strong style={{ fontSize: 14 }}>Grid size:</strong>
              <GridNudger
                value={manualGridW}
                onChange={setManualGridW}
                label="cells across"
              />
              <span style={{ fontSize: 18, color: 'var(--text-secondary)' }}>×</span>
              <GridNudger
                value={manualGridH}
                onChange={setManualGridH}
                label="cells down"
              />
              <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>
                Auto-detected from image. Adjust if it's off.
              </span>
              <button
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  if (!imageData || !crop) return;
                  // Re-run auto-detect using current detection mode
                  try {
                    const det = detectPatternFromImage(imageData, {
                      paletteSize: 3,
                      cropOverride: crop,
                      detectionMode,
                    });
                    setManualGridW(det.samples.width);
                    setManualGridH(det.samples.height);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                Re-detect
              </button>
            </div>
          </>
        )}
        {imageData && (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 540px', minWidth: 320 }}>
              <div className="muted" style={{ marginBottom: 4 }}>
                Detected grid (drag the red box; corners + sides resize)
              </div>
              <div
                ref={wrapperRef}
                style={{
                  position: 'relative',
                  width: canvasW,
                  height: canvasH,
                  background: 'var(--bg-soft)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  userSelect: 'none',
                  cursor: drag?.kind === 'create' ? 'crosshair' : 'default',
                }}
                onMouseDown={onMouseDownEmpty}
              >
                <canvas ref={previewRef} style={{ display: 'block', pointerEvents: 'none' }} />
                {cropDisplay && (
                  <CropOverlay
                    pos={cropDisplay}
                    onMoveStart={(e) => onMouseDownCrop(e)}
                    onResizeStart={(e, side) => onMouseDownCrop(e, side)}
                  />
                )}
              </div>
            </div>
            <div style={{ flex: '0 0 240px' }}>
              <div className="muted" style={{ marginBottom: 4 }}>
                Detection summary
              </div>
              {busy ? (
                <p className="muted">Detecting…</p>
              ) : detection ? (
                <>
                  <div className="stat">
                    <div className="stat-label">Grid</div>
                    <div className="stat-val">
                      {detection.samples.width} × {detection.samples.height}
                    </div>
                  </div>
                  <div className="stat" style={{ marginTop: 8 }}>
                    <div className="stat-label">Crop</div>
                    <div className="stat-val" style={{ fontSize: 13 }}>
                      {detection.crop.w} × {detection.crop.h}px
                    </div>
                  </div>
                  <div className="muted" style={{ marginTop: 12, marginBottom: 6 }}>
                    Detected colours — pick the empty/background:
                  </div>
                  {detection.clusters.map((cl, i) => {
                    const isEmpty = i === emptyCluster;
                    return (
                      <label
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 6,
                          padding: 6,
                          borderRadius: 4,
                          background: isEmpty
                            ? 'var(--bg-soft)'
                            : 'transparent',
                          border: isEmpty
                            ? '1px solid var(--border-strong)'
                            : '1px solid transparent',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="emptyCluster"
                          checked={isEmpty}
                          onChange={() => setEmptyCluster(i)}
                        />
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            background: cl.transparent
                              ? 'repeating-linear-gradient(45deg, #fff, #fff 4px, #ddd 4px, #ddd 8px)'
                              : rgbToHex(cl.centroid),
                            border: '1px solid var(--border)',
                            flexShrink: 0,
                          }}
                          title={
                            cl.transparent
                              ? `Transparent (${cl.count} cells)`
                              : `Detected: ${rgbToHex(cl.centroid)} (${cl.count} cells)`
                          }
                        />
                        <span style={{ fontSize: 12, fontFamily: 'monospace' }}>
                          {cl.transparent ? 'transparent' : rgbToHex(cl.centroid)}
                        </span>
                        <span
                          className="muted"
                          style={{ minWidth: 36, fontSize: 11, marginLeft: 'auto' }}
                        >
                          ×{cl.count}
                        </span>
                        {isEmpty && (
                          <span
                            className="muted"
                            style={{
                              fontSize: 11,
                              fontStyle: 'italic',
                              marginLeft: 4,
                            }}
                          >
                            empty
                          </span>
                        )}
                      </label>
                    );
                  })}
                </>
              ) : (
                <p className="muted">No detection yet.</p>
              )}
            </div>
          </div>
        )}
        {imageData && (
          <button
            style={{ marginTop: 12 }}
            onClick={() => {
              setImageData(null);
              setCrop(null);
              setDetection(null);
              setEmptyCluster(null);
            }}
          >
            Remove image
          </button>
        )}
      </section>
    </div>
  );
}

type ResizeSide = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'bl' | 'br';
interface CropOverlayProps {
  pos: { left: number; top: number; width: number; height: number };
  onMoveStart: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, side: ResizeSide) => void;
}

function CropOverlay({ pos, onMoveStart, onResizeStart }: CropOverlayProps) {
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#E24B4A',
    border: '1px solid white',
    borderRadius: 2,
  };
  const sides: Array<{ side: ResizeSide; style: React.CSSProperties }> = [
    { side: 'tl', style: { left: -5, top: -5, cursor: 'nwse-resize' } },
    { side: 'tr', style: { right: -5, top: -5, cursor: 'nesw-resize' } },
    { side: 'bl', style: { left: -5, bottom: -5, cursor: 'nesw-resize' } },
    { side: 'br', style: { right: -5, bottom: -5, cursor: 'nwse-resize' } },
    { side: 't', style: { left: '50%', top: -5, transform: 'translateX(-50%)', cursor: 'ns-resize' } },
    { side: 'b', style: { left: '50%', bottom: -5, transform: 'translateX(-50%)', cursor: 'ns-resize' } },
    { side: 'l', style: { left: -5, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' } },
    { side: 'r', style: { right: -5, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' } },
  ];
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        onMoveStart(e);
      }}
      style={{
        position: 'absolute',
        left: `${pos.left}%`,
        top: `${pos.top}%`,
        width: `${pos.width}%`,
        height: `${pos.height}%`,
        border: '2px solid #E24B4A',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.18)',
        cursor: 'move',
      }}
    >
      {sides.map(({ side, style }) => (
        <div
          key={side}
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, side);
          }}
          style={{ ...handleStyle, ...style }}
        />
      ))}
    </div>
  );
}

/**
 * Big numeric input with ± buttons. Used for grid dimensions where the
 * exact integer matters and the user often wants to nudge by 1.
 */
function GridNudger({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const clamp = (v: number) => Math.max(1, Math.min(200, v));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        title={`Decrease ${label}`}
        style={{ padding: '2px 10px', fontSize: 16, fontWeight: 600 }}
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={200}
        value={value || ''}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(isNaN(n) ? 0 : clamp(n));
        }}
        style={{
          width: 64,
          fontSize: 18,
          fontWeight: 600,
          textAlign: 'center',
          padding: '4px 6px',
        }}
        title={label}
      />
      <button
        onClick={() => onChange(clamp(value + 1))}
        title={`Increase ${label}`}
        style={{ padding: '2px 10px', fontSize: 16, fontWeight: 600 }}
      >
        +
      </button>
    </div>
  );
}
