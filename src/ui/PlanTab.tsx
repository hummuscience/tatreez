import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plan } from '../engine/types';
import { generatePlans } from '../engine/plan';
import { scorePlan } from '../engine/scoring';
import { DEFAULT_WEIGHTS, optimizeColourOrder, type OptimalWeights } from '../engine/optimal';
import { getGroundTruth } from '../storage/storage';
import { getCanonicalGroundTruth } from '../patterns/groundTruths';
import { cellSize, clearCanvas, drawGridLines, drawPatternBackground } from './canvasUtil';
import { getPalette } from '../patterns/builtin';
import type { PatternState } from '../App';

interface Props {
  state: PatternState;
}

const VIEW_SIZE = 360;

export default function PlanTab({ state }: Props) {
  const { pattern, patternKey } = state;
  const frontRef = useRef<HTMLCanvasElement | null>(null);
  const backRef = useRef<HTMLCanvasElement | null>(null);

  const [activePlanIdx, setActivePlanIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [weights, setWeights] = useState<OptimalWeights>(DEFAULT_WEIGHTS);
  const [mergeRegions, setMergeRegions] = useState(false);
  const [maxThreads, setMaxThreads] = useState<number>(0); // 0 = unlimited
  // 0 = unlimited (legacy: only threadRestart cost decides). >0 caps the
  // back-distance the solver will pay to merge two same-colour regions
  // into one thread. Prevents long diagonal slashes across the chart.
  const [maxMergeDistance, setMaxMergeDistance] = useState<number>(8);
  // 0 = unlimited. >0 caps the longest axis-aligned back hop. Stops the
  // "wandering needle" pattern where a thread travels 20+ cells along a
  // column before reaching the next stitch — practical limit for keeping
  // the path easy to follow.
  const [maxAxisJump, setMaxAxisJump] = useState<number>(6);
  const [autoColourOrder, setAutoColourOrder] = useState(true);

  // Build the displayed list: ground truth first (if any) then engine plans
  const plans: Plan[] = useMemo(() => {
    const colorOrder = autoColourOrder ? optimizeColourOrder(pattern) : undefined;
    const enginePlans = generatePlans(pattern, weights, {
      mergeRegions,
      maxThreads: maxThreads || undefined,
      maxMergeDistance: maxMergeDistance || undefined,
      maxAxisJump: maxAxisJump || undefined,
      colorOrder,
    });
    let gt: Plan | null = null;
    if (patternKey) {
      const userGt = getGroundTruth(patternKey);
      if (userGt && userGt.steps.length > 0) {
        gt = {
          label: 'Ground truth (yours)',
          steps: userGt.steps,
          score: scorePlan(userGt.steps, weights),
          isGroundTruth: true,
        };
      } else if (patternKey.startsWith('builtin:')) {
        const canonical = getCanonicalGroundTruth(patternKey.slice('builtin:'.length));
        if (canonical && canonical.steps.length > 0) {
          gt = {
            label: 'Ground truth (canonical)',
            steps: canonical.steps,
            score: scorePlan(canonical.steps, weights),
            isGroundTruth: true,
          };
        }
      }
    }
    return gt ? [gt, ...enginePlans] : enginePlans;
  }, [pattern, patternKey, weights, mergeRegions, maxThreads, maxMergeDistance, maxAxisJump, autoColourOrder]);

  const groundTruth = plans[0]?.isGroundTruth ? plans[0] : null;
  const activePlan = plans[activePlanIdx] ?? null;
  const totalThreads = useMemo(() => {
    if (!activePlan) return 0;
    let n = 0;
    for (const s of activePlan.steps) if (s.kind === 'start') n++;
    return n;
  }, [activePlan]);
  // Compute the active thread index (0-based) from the current step cursor.
  // Walk through `step` steps and count 'start' events.
  const activeThread = useMemo(() => {
    if (!activePlan || step <= 0) return -1;
    let t = -1;
    const upTo = Math.min(step, activePlan.steps.length);
    for (let i = 0; i < upTo; i++) {
      if (activePlan.steps[i].kind === 'start') t++;
    }
    return t;
  }, [activePlan, step]);

  // Reset step / active plan when plan list changes
  useEffect(() => {
    setActivePlanIdx(0);
    setStep(plans[0]?.steps.length ?? 0);
  }, [plans]);

  // Reset step when switching active plan or when the plan length changes
  // (e.g. weights changed and the solver returned a different length).
  useEffect(() => {
    if (!activePlan) return;
    setStep((s) => {
      if (s > activePlan.steps.length) return activePlan.steps.length;
      // If we were "at the end" before, stay at the end of the new plan
      return s === 0 ? 0 : activePlan.steps.length;
    });
  }, [activePlanIdx, activePlan]);

  // Play loop
  useEffect(() => {
    if (!playing || !activePlan) return;
    const id = window.setInterval(() => {
      setStep((s) => {
        if (!activePlan) return s;
        if (s >= activePlan.steps.length) return 0;
        return s + 1;
      });
    }, 80);
    return () => window.clearInterval(id);
  }, [playing, activePlan]);

  // Effective per-pattern palette (falls back to global PALETTE)
  const palette = useMemo(() => getPalette(pattern), [pattern]);

  // Render front + back
  useEffect(() => {
    const fc = frontRef.current;
    const bc = backRef.current;
    if (!fc || !bc || !activePlan) return;
    const fctx = fc.getContext('2d');
    const bctx = bc.getContext('2d');
    if (!fctx || !bctx) return;

    const cs = cellSize(fc.width, fc.height, pattern.width, pattern.height);
    clearCanvas(fctx, fc.width, fc.height);
    clearCanvas(bctx, bc.width, bc.height);

    // Faded pattern on front
    drawPatternBackground(fctx, pattern, cs, 0.18);

    // Grid on both
    drawGridLines(fctx, cs, pattern.width, pattern.height, 'rgba(0,0,0,0.08)');
    drawGridLines(bctx, cs, pattern.width, pattern.height, 'rgba(0,0,0,0.08)');

    type LegState = { slash: boolean; back: boolean; thread: number };
    const legsDone: LegState[][] = Array.from({ length: pattern.height }, () =>
      Array.from({ length: pattern.width }, () => ({ slash: false, back: false, thread: -1 })),
    );
    let lastNeedle: [number, number] | null = null;

    // Walk the steps up to `step`, tracking which thread we're currently
    // on (incremented on every 'start' step).
    const stepsToShow = activePlan.steps.slice(0, step);
    let currentThread = -1; // -1 before the first start
    for (const s of stepsToShow) {
      if (s.kind === 'start') {
        currentThread++;
        lastNeedle = s.to;
      } else if (s.kind === 'front') {
        if (s.cell) {
          const [cx, cy] = s.cell;
          if (cy >= 0 && cy < pattern.height && cx >= 0 && cx < pattern.width) {
            if (s.leg === '/') legsDone[cy][cx].slash = true;
            else legsDone[cy][cx].back = true;
            legsDone[cy][cx].thread = currentThread;
          }
        }
        lastNeedle = s.to;
      } else if (s.kind === 'back' && s.from) {
        const [x1, y1] = s.from;
        const [x2, y2] = s.to;
        const isAxis = x1 === x2 || y1 === y2;
        bctx.strokeStyle = isAxis ? '#5DCAA5' : '#E24B4A';
        bctx.lineWidth = 2.5;
        bctx.beginPath();
        bctx.moveTo(x1 * cs, y1 * cs);
        bctx.lineTo(x2 * cs, y2 * cs);
        bctx.stroke();
        lastNeedle = s.to;
      }
    }

    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const L = legsDone[y][x];
        if (!L.slash && !L.back) continue;
        const both = L.slash && L.back;
        // Use the cell's palette colour so multi-colour patterns
        // (like Cypress Tree) render in the correct colours. Faded
        // when only one leg has been laid; full saturation for
        // completed crosses.
        const palIdx = pattern.cells[y][x] || 1;
        const baseColor = palette[palIdx] ?? '#D85A30';
        const isActiveThread = L.thread === activeThread && activeThread >= 0;

        // Highlight cells on the active thread with a coloured outline
        // before drawing the legs. This makes the current "in progress"
        // thread visually distinct from already-completed ones.
        if (isActiveThread) {
          fctx.fillStyle = 'rgba(24, 95, 165, 0.15)';
          fctx.fillRect(x * cs, y * cs, cs, cs);
        }

        fctx.strokeStyle = baseColor;
        fctx.lineWidth = isActiveThread ? 3 : 2.5;
        fctx.globalAlpha = both ? 1 : 0.45;
        if (L.slash) {
          fctx.beginPath();
          fctx.moveTo(x * cs, (y + 1) * cs);
          fctx.lineTo((x + 1) * cs, y * cs);
          fctx.stroke();
        }
        if (L.back) {
          fctx.beginPath();
          fctx.moveTo(x * cs, y * cs);
          fctx.lineTo((x + 1) * cs, (y + 1) * cs);
          fctx.stroke();
        }
        fctx.globalAlpha = 1;
      }
    }

    if (lastNeedle) {
      for (const ctx of [fctx, bctx]) {
        ctx.fillStyle = '#185FA5';
        ctx.beginPath();
        ctx.arc(lastNeedle[0] * cs, lastNeedle[1] * cs, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [pattern, activePlan, step, activeThread, palette]);

  if (plans.length === 0) {
    return (
      <div className="card">
        <p className="empty-hint">
          No stitches yet — paint cells in the editor or load a pattern from the library.
        </p>
      </div>
    );
  }

  const actionText = (() => {
    if (!activePlan || step <= 0 || step > activePlan.steps.length) return '—';
    const s = activePlan.steps[step - 1];
    if (!s) return '—';
    if (s.kind === 'start') return 'Knot & start';
    if (s.kind === 'front') return `Lay ${s.leg} on (${s.cell?.[0]}, ${s.cell?.[1]})`;
    if (s.kind === 'back' && s.from) {
      const dx = Math.abs(s.to[0] - s.from[0]);
      const dy = Math.abs(s.to[1] - s.from[1]);
      const len = Math.hypot(dx, dy);
      return dx === 0 || dy === 0 ? `Back: axis ${Math.round(len)}` : `Back: diag ${len.toFixed(1)}`;
    }
    return '—';
  })();

  return (
    <div>
      <p className="section-label">Solver settings</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '0 0 12px',
            padding: '8px 10px',
            background: 'var(--bg-soft)',
            borderRadius: 6,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={mergeRegions}
              onChange={(e) => setMergeRegions(e.target.checked)}
            />
            <strong>Merge regions into shared threads</strong>
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            {mergeRegions
              ? 'Math-optimal: one big thread per colour, may zig-zag across the chart.'
              : 'Practical: one thread per visual region, easy to follow by hand.'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '0 0 12px',
            padding: '8px 10px',
            background: 'var(--bg-soft)',
            borderRadius: 6,
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoColourOrder}
              onChange={(e) => setAutoColourOrder(e.target.checked)}
            />
            <strong>Auto-order colours</strong>
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            {autoColourOrder
              ? 'Greedy nearest-neighbour over per-colour centroids — minimises walking between threads.'
              : 'Stitches colours in palette index order (1, 2, …).'}
          </span>
        </div>

        {!mergeRegions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              margin: '0 0 12px',
              padding: '8px 10px',
              background: 'var(--bg-soft)',
              borderRadius: 6,
              flexWrap: 'wrap',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong>Max threads per colour:</strong>
              <input
                type="number"
                min={0}
                max={100}
                value={maxThreads || ''}
                placeholder="unlimited"
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setMaxThreads(isNaN(v) || v < 0 ? 0 : v);
                }}
                style={{ width: 80 }}
              />
            </label>
            <span className="muted" style={{ fontSize: 12 }}>
              {maxThreads > 0
                ? `Greedily merges nearest same-colour regions until each colour has at most ${maxThreads} thread${maxThreads === 1 ? '' : 's'}.`
                : 'Empty / 0 = unlimited (one thread per visual region).'}
            </span>
            <button
              onClick={() => setMaxThreads(0)}
              style={{ marginLeft: 'auto' }}
              disabled={maxThreads === 0}
            >
              Clear cap
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '0 0 12px',
            padding: '8px 10px',
            background: 'var(--bg-soft)',
            borderRadius: 6,
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>Max merge distance:</strong>
            <input
              type="number"
              min={0}
              max={200}
              value={maxMergeDistance || ''}
              placeholder="unlimited"
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setMaxMergeDistance(isNaN(v) || v < 0 ? 0 : v);
              }}
              style={{ width: 80 }}
            />
            <span className="muted" style={{ fontSize: 11 }}>cells</span>
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            {maxMergeDistance > 0
              ? `Merges two regions into one thread only if their nearest corners are within ${maxMergeDistance} cells. Stops long diagonal slashes across the chart.`
              : 'Empty / 0 = unlimited (cost-only merge decisions).'}
          </span>
          <button
            onClick={() => setMaxMergeDistance(0)}
            style={{ marginLeft: 'auto' }}
            disabled={maxMergeDistance === 0}
          >
            Clear cap
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '0 0 12px',
            padding: '8px 10px',
            background: 'var(--bg-soft)',
            borderRadius: 6,
            flexWrap: 'wrap',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong>Max axis jump:</strong>
            <input
              type="number"
              min={0}
              max={200}
              value={maxAxisJump || ''}
              placeholder="unlimited"
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setMaxAxisJump(isNaN(v) || v < 0 ? 0 : v);
              }}
              style={{ width: 80 }}
            />
            <span className="muted" style={{ fontSize: 11 }}>cells</span>
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            {maxAxisJump > 0
              ? `Forbids any single axis-aligned back hop longer than ${maxAxisJump} cells. The solver picks a thread restart instead, keeping the path easier to follow.`
              : 'Empty / 0 = unlimited (the solver may produce long axis hops).'}
          </span>
          <button
            onClick={() => setMaxAxisJump(0)}
            style={{ marginLeft: 'auto' }}
            disabled={maxAxisJump === 0}
          >
            Clear cap
          </button>
        </div>

        <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
          Diagonal back-travel is forbidden — the back of the work has only horizontal and
          vertical thread runs. Higher <em>vertical</em> / <em>horizontal</em> weights bias
          which axis the solver prefers when both are available. Higher <em>thread restart</em>
          means fewer threads (longer continuous runs, more back-travel between motifs).
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          <WeightSlider
            label="Horizontal back-travel"
            min={0}
            max={20}
            step={0.5}
            value={weights.horiz}
            onChange={(v) => setWeights((w) => ({ ...w, horiz: v }))}
          />
          <WeightSlider
            label="Vertical back-travel"
            min={0}
            max={20}
            step={0.5}
            value={weights.vert}
            onChange={(v) => setWeights((w) => ({ ...w, vert: v }))}
          />
          <WeightSlider
            label="Diagonal back-travel"
            min={0}
            max={20}
            step={0.5}
            value={weights.diag}
            onChange={(v) => setWeights((w) => ({ ...w, diag: v }))}
          />
          <WeightSlider
            label="Thread restart"
            min={0}
            max={200}
            step={1}
            value={weights.threadRestart}
            onChange={(v) => setWeights((w) => ({ ...w, threadRestart: v }))}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset to defaults</button>
          <button
            onClick={() =>
              setWeights({ horiz: 1, vert: 1, diag: 10, threadRestart: 8 })
            }
            title="Cheap restarts — solver prefers many short threads over long back-travel"
          >
            Many threads
          </button>
          <button
            onClick={() =>
              setWeights({ horiz: 1, vert: 1, diag: 10, threadRestart: 100 })
            }
            title="Big penalty for restarts — solver favours one long thread per colour"
          >
            One thread / colour
          </button>
          <button
            onClick={() =>
              setWeights({ horiz: 1, vert: 10, diag: 20, threadRestart: 15 })
            }
            title="Strict horizontal-only back: penalises both vertical and diagonal"
          >
            Horizontal-only back
          </button>
        </div>
      </div>

      <p className="section-label">Ranked stitch plans</p>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="cand-grid">
          {plans.map((p, i) => {
            const axisPct = Math.round(p.score.axisFraction * 100);
            const isActive = i === activePlanIdx;
            let extra: React.ReactNode = null;
            if (p.isGroundTruth) {
              extra = (
                <span className="pill success" style={{ marginLeft: 6 }}>
                  Reference
                </span>
              );
            } else if (groundTruth) {
              const delta = Math.round(p.score.composite - groundTruth.score.composite);
              const sign = delta >= 0 ? '+' : '';
              extra = (
                <span className="pill" style={{ marginLeft: 6 }}>
                  {sign}
                  {delta} vs GT
                </span>
              );
            }
            return (
              <div
                key={i}
                className={`cand ${isActive ? 'active' : ''}`}
                onClick={() => setActivePlanIdx(i)}
              >
                <div className="cand-title">
                  {p.label}
                  {extra}
                </div>
                <div className="cand-meta">
                  Score {Math.round(p.score.composite)} · {axisPct}% neat back · {p.score.starts}{' '}
                  thread{p.score.starts === 1 ? '' : 's'}
                </div>
                <div className="cand-meta">
                  {Math.round(p.score.axis)} units neat, {Math.round(p.score.diag)} units diagonal
                </div>
                {(p.score.parityViolations > 0 || p.score.underOverViolations > 0) && (
                  <div className="cand-meta" style={{ marginTop: 2 }}>
                    {p.score.parityViolations > 0 && (
                      <span
                        className="pill"
                        title="Per Biedl 2005 Theorem 6, a perfect stitching has matching start/end parity within each thread. This plan has threads where the first and last stitch differ in (x+y) mod 2 — likely improvable."
                      >
                        {p.score.parityViolations} parity {p.score.parityViolations === 1 ? 'violation' : 'violations'}
                      </span>
                    )}
                    {p.score.underOverViolations > 0 && (
                      <>
                        {p.score.parityViolations > 0 && ' '}
                        <span
                          className="pill"
                          title="Cells where the over-diagonal `\\` was stitched before the under-diagonal `/`. The cross looks reversed and reflects light differently. The CPP solver does not currently enforce this ordering."
                        >
                          {p.score.underOverViolations} under/over
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="section-label">Step through</p>
      <div className="card">
        <div className="row" style={{ gap: 24 }}>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>
              Front
            </div>
            <div className="grid-wrap">
              <canvas
                ref={frontRef}
                width={VIEW_SIZE}
                height={VIEW_SIZE}
                style={{ display: 'block' }}
              />
            </div>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>
              Back
            </div>
            <div className="grid-wrap">
              <canvas
                ref={backRef}
                width={VIEW_SIZE}
                height={VIEW_SIZE}
                style={{ display: 'block' }}
              />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div className="stat">
              <div className="stat-label">Step</div>
              <div className="stat-val">
                {step} / {activePlan?.steps.length ?? 0}
              </div>
            </div>
            <div className="stat" style={{ marginTop: 8 }}>
              <div className="stat-label">Thread</div>
              <div className="stat-val">
                {activeThread >= 0 ? `${activeThread + 1} / ${totalThreads}` : `– / ${totalThreads}`}
              </div>
            </div>
            <div className="stat" style={{ marginTop: 8 }}>
              <div className="stat-label">Action</div>
              <div className="stat-val" style={{ fontSize: 13 }}>
                {actionText}
              </div>
            </div>
          </div>
        </div>

        <div className="step-bar">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={!activePlan}>
            ←
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            disabled={!activePlan}
            className={playing ? '' : 'primary'}
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
          <input
            type="range"
            min={0}
            max={activePlan?.steps.length ?? 0}
            value={step}
            onChange={(e) => setStep(parseInt(e.target.value, 10))}
          />
          <button
            onClick={() =>
              setStep((s) => Math.min(activePlan?.steps.length ?? 0, s + 1))
            }
            disabled={!activePlan}
          >
            →
          </button>
        </div>

        <div className="legend">
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#D85A30' }} />
            Front: cross
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#F0997B' }} />
            Front: half
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#5DCAA5' }} />
            Back: neat (axis)
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: '#E24B4A' }} />
            Back: messy (diag)
          </div>
          <div className="legend-item">
            <div
              className="legend-dot"
              style={{ background: 'rgba(24, 95, 165, 0.25)', border: '1px solid #185fa5' }}
            />
            Current thread
          </div>
        </div>
      </div>
    </div>
  );
}

interface WeightSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

function WeightSlider({ label, min, max, step, value, onChange }: WeightSliderProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {label}: <strong style={{ color: 'var(--text-primary)' }}>{value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ padding: 0 }}
      />
    </label>
  );
}
