import { useEffect, useMemo, useRef, useState } from 'react';
import type { Plan } from '../engine/types';
import { generatePlans } from '../engine/plan';
import { scorePlan } from '../engine/scoring';
import { DEFAULT_WEIGHTS, optimizeColourOrder, type OptimalWeights } from '../engine/optimal';
import { planAsPrimitives, describePrimitive, type Primitive } from '../engine/primitives';
import { getGroundTruth } from '../storage/storage';
import { getCanonicalGroundTruth } from '../patterns/groundTruths';
import { cellSize, clearCanvas, drawGridLines, drawPatternBackground } from './canvasUtil';
import { getPalette } from '../patterns/builtin';
import {
  CLOTH_OPTIONS,
  STRAND_OPTIONS,
  DEFAULT_CLOTH_ID,
  DEFAULT_STRANDS_ID,
  flossPerStitchMm,
  getCloth,
  getStrands,
  SKEIN_MM,
} from '../project/cloth';
import type { PatternState } from '../App';

interface Props {
  state: PatternState;
}

const VIEW_SIZE = 360;

type AugPlan = Plan & {
  primitives?: Primitive[];
  /** stepToPrimitive[i] = index into `primitives` for step `i`, or -1. */
  stepToPrimitive?: number[];
};

export default function PlanTab({ state }: Props) {
  const { pattern, patternKey } = state;
  const frontRef = useRef<HTMLCanvasElement | null>(null);
  const backRef = useRef<HTMLCanvasElement | null>(null);

  const [activePlanIdx, setActivePlanIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [weights, setWeights] = useState<OptimalWeights>(DEFAULT_WEIGHTS);
  const [mergeRegions, setMergeRegions] = useState(false);
  const [maxThreads, setMaxThreads] = useState<number>(0);
  const [maxMergeDistance, setMaxMergeDistance] = useState<number>(8);
  const [maxAxisJump, setMaxAxisJump] = useState<number>(6);
  const [autoColourOrder, setAutoColourOrder] = useState(true);
  const [showAdvancedSolver, setShowAdvancedSolver] = useState(false);

  // Project setup state
  const [clothId, setClothId] = useState<string>(DEFAULT_CLOTH_ID);
  const [strandsId, setStrandsId] = useState<string>(DEFAULT_STRANDS_ID);
  const cloth = getCloth(clothId);
  const strands = getStrands(strandsId);

  // ---------- Plan list ----------
  const plans: AugPlan[] = useMemo(() => {
    const colorOrder = autoColourOrder ? optimizeColourOrder(pattern) : undefined;
    const enginePlans = generatePlans(pattern, weights, {
      mergeRegions,
      maxThreads: maxThreads || undefined,
      maxMergeDistance: maxMergeDistance || undefined,
      maxAxisJump: maxAxisJump || undefined,
      colorOrder,
    });

    let primitivePlan: AugPlan | null = null;
    try {
      const pp = planAsPrimitives(pattern, {
        maxAxisJump: maxAxisJump || undefined,
      });
      if (pp.steps.length > 0) {
        primitivePlan = {
          label: 'Primitive plan (instructions)',
          steps: pp.steps,
          score: scorePlan(pp.steps, weights),
          primitives: pp.primitives,
          stepToPrimitive: pp.stepToPrimitive,
        };
      }
    } catch (e) {
      console.warn('planAsPrimitives failed:', e);
    }
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
    const ordered: AugPlan[] = [];
    if (gt) ordered.push(gt);
    if (primitivePlan) ordered.push(primitivePlan);
    ordered.push(...enginePlans);
    return ordered;
  }, [pattern, patternKey, weights, mergeRegions, maxThreads, maxMergeDistance, maxAxisJump, autoColourOrder]);

  const groundTruth = plans[0]?.isGroundTruth ? plans[0] : null;
  const activePlan = plans[activePlanIdx] ?? null;

  // ---------- Stitch counts ----------
  const stitchesByColor = useMemo(() => {
    const counts = new Map<number, number>();
    for (let y = 0; y < pattern.height; y++) {
      for (let x = 0; x < pattern.width; x++) {
        const v = pattern.cells[y][x];
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
    return counts;
  }, [pattern]);
  const totalStitches = useMemo(
    () => [...stitchesByColor.values()].reduce((a, b) => a + b, 0),
    [stitchesByColor],
  );

  // ---------- Thread navigation state ----------
  const totalThreads = useMemo(() => {
    if (!activePlan) return 0;
    let n = 0;
    for (const s of activePlan.steps) if (s.kind === 'start') n++;
    return n;
  }, [activePlan]);
  const activeThread = useMemo(() => {
    if (!activePlan || step <= 0) return -1;
    let t = -1;
    const upTo = Math.min(step, activePlan.steps.length);
    for (let i = 0; i < upTo; i++) {
      if (activePlan.steps[i].kind === 'start') t++;
    }
    return t;
  }, [activePlan, step]);

  useEffect(() => {
    setActivePlanIdx(0);
    setStep(plans[0]?.steps.length ?? 0);
  }, [plans]);

  useEffect(() => {
    if (!activePlan) return;
    setStep((s) => {
      if (s > activePlan.steps.length) return activePlan.steps.length;
      return s === 0 ? 0 : activePlan.steps.length;
    });
  }, [activePlanIdx, activePlan]);

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

  // ---------- Canvas rendering (unchanged from old PlanTab) ----------
  const palette = useMemo(() => getPalette(pattern), [pattern]);
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

    drawPatternBackground(fctx, pattern, cs, 0.18);
    drawGridLines(fctx, cs, pattern.width, pattern.height, 'rgba(0,0,0,0.08)');
    drawGridLines(bctx, cs, pattern.width, pattern.height, 'rgba(0,0,0,0.08)');

    type LegState = { slash: boolean; back: boolean; thread: number };
    const legsDone: LegState[][] = Array.from({ length: pattern.height }, () =>
      Array.from({ length: pattern.width }, () => ({ slash: false, back: false, thread: -1 })),
    );
    let lastNeedle: [number, number] | null = null;

    const stepsToShow = activePlan.steps.slice(0, step);
    let currentThread = -1;
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
        const palIdx = pattern.cells[y][x] || 1;
        const baseColor = palette[palIdx] ?? '#D85A30';
        const isActiveThread = L.thread === activeThread && activeThread >= 0;

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

  // ---------- Action panel text ----------
  const actionText = (() => {
    if (!activePlan || step <= 0 || step > activePlan.steps.length) return '—';
    if (activePlan.primitives && activePlan.stepToPrimitive) {
      const pi = activePlan.stepToPrimitive[step - 1];
      const prim = pi >= 0 ? activePlan.primitives[pi] : null;
      if (prim) return describePrimitive(prim);
    }
    const s = activePlan.steps[step - 1];
    if (!s) return '—';
    if (s.kind === 'start') return 'Knot & start';
    if (s.kind === 'front') return `Lay ${s.leg} on (${s.cell?.[0]}, ${s.cell?.[1]})`;
    if (s.kind === 'back' && s.from) {
      const dx = Math.abs(s.to[0] - s.from[0]);
      const dy = Math.abs(s.to[1] - s.from[1]);
      const len = Math.hypot(dx, dy);
      return dx === 0 || dy === 0
        ? `Back: axis ${Math.round(len)}`
        : `Back: diag ${len.toFixed(1)}`;
    }
    return '—';
  })();

  const activePrimitiveIdx = (() => {
    if (!activePlan?.stepToPrimitive || step <= 0) return -1;
    const i = step - 1;
    if (i < 0 || i >= activePlan.stepToPrimitive.length) return -1;
    return activePlan.stepToPrimitive[i];
  })();
  const totalPrimitives = activePlan?.primitives
    ? activePlan.primitives.filter((p) => p.kind !== 'restart').length
    : 0;

  // ---------- Thread requirement math ----------
  /** Real back-travel multiplier from the active plan's score. */
  const activeBackMult = useMemo(() => {
    if (!activePlan || totalStitches === 0) return 1;
    const stitchMm = totalStitches * flossPerStitchMm(cloth);
    const backMm = (activePlan.score.axis + activePlan.score.diag) * cloth.holeMm;
    if (stitchMm === 0) return 1;
    return 1 + backMm / stitchMm;
  }, [activePlan, totalStitches, cloth]);

  const threadNeeds = useMemo(() => {
    const flossMm = flossPerStitchMm(cloth);
    const out: Array<{
      idx: number;
      color: string;
      stitches: number;
      totalMm: number;
      skeins: number;
    }> = [];
    const palLen = pattern.palette?.length ?? palette.length;
    for (let i = 1; i < palLen; i++) {
      const colorVal = pattern.palette ? pattern.palette[i] : palette[i];
      if (!colorVal) continue;
      const stitches = stitchesByColor.get(i) ?? 0;
      if (stitches === 0) continue;
      const totalMm = stitches * flossMm * activeBackMult * strands.mult;
      out.push({
        idx: i,
        color: colorVal,
        stitches,
        totalMm,
        skeins: totalMm / SKEIN_MM,
      });
    }
    return out;
  }, [pattern.palette, palette, stitchesByColor, cloth, strands, activeBackMult]);

  const totalFlossMm = threadNeeds.reduce((a, b) => a + b.totalMm, 0);
  const maxSkeins = threadNeeds.reduce((m, t) => Math.max(m, t.skeins), 0.5);

  // ---------- Finished size ----------
  const finishedW = ((pattern.width / cloth.count) * 2.54).toFixed(1);
  const finishedH = ((pattern.height / cloth.count) * 2.54).toFixed(1);

  if (plans.length === 0) {
    return (
      <div className="panel">
        <p className="empty-hint">
          No stitches yet — paint cells in the editor or load a pattern from the
          library.
        </p>
      </div>
    );
  }

  return (
    <div className="plan-layout">
      {/* ---- Project setup strip ---- */}
      <section className="panel project-setup">
        <div className="panel-h">
          <span>Project setup</span>
          <span dir="rtl">إعداد المشروع</span>
        </div>
        <div className="setup-grid">
          <div className="setup-field">
            <div className="setup-label">
              <span>Cloth</span>
              <span className="setup-label-ar" dir="rtl">
                القماش
              </span>
            </div>
            <select
              className="input"
              value={clothId}
              onChange={(e) => setClothId(e.target.value)}
            >
              {CLOTH_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} — {c.holeMm.toFixed(2)} mm
                </option>
              ))}
            </select>
          </div>
          <div className="setup-field">
            <div className="setup-label">
              <span>Floss thickness</span>
              <span className="setup-label-ar" dir="rtl">
                سُمك الخيط
              </span>
            </div>
            <select
              className="input"
              value={strandsId}
              onChange={(e) => setStrandsId(e.target.value)}
            >
              {STRAND_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="setup-field">
            <div className="setup-label">
              <span>Finished size</span>
              <span className="setup-label-ar" dir="rtl">
                المقاس النهائي
              </span>
            </div>
            <div className="setup-readout">
              <span className="setup-readout-val">
                {finishedW} × {finishedH}
              </span>
              <span className="setup-readout-unit">cm</span>
            </div>
          </div>
          <div className="setup-field">
            <div className="setup-label">
              <span>Total stitches</span>
              <span className="setup-label-ar" dir="rtl">
                عدد الغرز
              </span>
            </div>
            <div className="setup-readout">
              <span className="setup-readout-val">
                {totalStitches.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Main two-column body ---- */}
      <div className="plan-body">
        {/* Left: front + back canvases */}
        <section className="panel plan-stage">
          <div className="panel-h">
            <span>Stitch playback</span>
            <span dir="rtl">معاينة الغرز</span>
          </div>

          <div className="plan-canvases">
            <div>
              <div className="info-k" style={{ marginBottom: 4 }}>
                Front
              </div>
              <div className="canvas-stage" style={{ minHeight: 0, padding: 12 }}>
                <canvas
                  ref={frontRef}
                  width={VIEW_SIZE}
                  height={VIEW_SIZE}
                  style={{ display: 'block' }}
                />
              </div>
            </div>
            <div>
              <div className="info-k" style={{ marginBottom: 4 }}>
                Back
              </div>
              <div className="canvas-stage" style={{ minHeight: 0, padding: 12 }}>
                <canvas
                  ref={backRef}
                  width={VIEW_SIZE}
                  height={VIEW_SIZE}
                  style={{ display: 'block' }}
                />
              </div>
            </div>
          </div>

          <div className="step-bar">
            <button
              className="btn-ghost btn-sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={!activePlan}
            >
              ←
            </button>
            <button
              className={`${playing ? 'btn-ghost' : 'btn-primary'} btn-sm`}
              onClick={() => setPlaying((p) => !p)}
              disabled={!activePlan}
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
            <span className="step-count info-k">
              {step} / {activePlan?.steps.length ?? 0}
            </span>
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                setStep((s) => Math.min(activePlan?.steps.length ?? 0, s + 1))
              }
              disabled={!activePlan}
            >
              →
            </button>
          </div>

          <div className="legend">
            <div>
              <span className="dot" style={{ background: '#D85A30' }} />
              Front: cross
            </div>
            <div>
              <span className="dot" style={{ background: '#F0997B' }} />
              Front: half
            </div>
            <div>
              <span className="dot dot-neat" />
              Back: neat (axis)
            </div>
            <div>
              <span className="dot dot-messy" />
              Back: messy (diag)
            </div>
            <div>
              <span className="dot dot-thread" />
              Current thread
            </div>
          </div>
        </section>

        {/* Right: side column */}
        <aside className="plan-side">
          {/* Ranked plans */}
          <div className="panel">
            <div className="panel-h">
              <span>Ranked stitch plans</span>
              <span dir="rtl">الخطط المرتبة</span>
            </div>
            <div className="plan-list">
              {plans.map((p, i) => {
                const axisPct = Math.round(p.score.axisFraction * 100);
                const isActive = i === activePlanIdx;
                let badge: React.ReactNode = null;
                if (p.isGroundTruth) {
                  badge = <span className="badge-ref">REF</span>;
                } else if (groundTruth) {
                  const delta = Math.round(
                    p.score.composite - groundTruth.score.composite,
                  );
                  const sign = delta >= 0 ? '+' : '';
                  badge = (
                    <span className="badge-delta">
                      {sign}
                      {delta} vs GT
                    </span>
                  );
                }
                return (
                  <button
                    key={i}
                    type="button"
                    className={`plan-item${isActive ? ' plan-item-on' : ''}`}
                    onClick={() => setActivePlanIdx(i)}
                  >
                    <div className="plan-item-row">
                      <span className="plan-item-name">{p.label}</span>
                      {badge}
                    </div>
                    <div className="plan-item-stats">
                      <span>score {Math.round(p.score.composite)}</span>
                      <span>· {axisPct}% neat</span>
                      <span>
                        · {p.score.starts} thread
                        {p.score.starts === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="plan-item-stats">
                      <span>{Math.round(p.score.axis)} axis</span>
                      <span>· {Math.round(p.score.diag)} diag</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Solver settings */}
          <div className="panel">
            <div className="panel-h">
              <span>Solver settings</span>
              <span dir="rtl">إعدادات المُحَلِّل</span>
            </div>

            <label className="info-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={mergeRegions}
                onChange={(e) => setMergeRegions(e.target.checked)}
              />
              <span style={{ fontSize: 12 }}>Merge regions into shared threads</span>
            </label>

            <label className="info-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={autoColourOrder}
                onChange={(e) => setAutoColourOrder(e.target.checked)}
              />
              <span style={{ fontSize: 12 }}>Auto-order colours</span>
            </label>

            <div className="info-row info-row-split" style={{ marginTop: 6 }}>
              <div>
                <span className="info-k">Max threads / colour</span>
                <input
                  className="input input-sm"
                  type="number"
                  min={0}
                  max={100}
                  value={maxThreads || ''}
                  placeholder="∞"
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setMaxThreads(isNaN(v) || v < 0 ? 0 : v);
                  }}
                />
              </div>
              <div>
                <span className="info-k">Max merge dist</span>
                <input
                  className="input input-sm"
                  type="number"
                  min={0}
                  max={200}
                  value={maxMergeDistance || ''}
                  placeholder="∞"
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setMaxMergeDistance(isNaN(v) || v < 0 ? 0 : v);
                  }}
                />
              </div>
            </div>

            <div className="info-row info-row-split">
              <div>
                <span className="info-k">Max axis jump</span>
                <input
                  className="input input-sm"
                  type="number"
                  min={0}
                  max={200}
                  value={maxAxisJump || ''}
                  placeholder="∞"
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setMaxAxisJump(isNaN(v) || v < 0 ? 0 : v);
                  }}
                />
              </div>
              <div style={{ alignSelf: 'end' }}>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setShowAdvancedSolver((v) => !v)}
                  style={{ width: '100%' }}
                >
                  {showAdvancedSolver ? 'Hide weights' : 'Show weights'}
                </button>
              </div>
            </div>

            {showAdvancedSolver && (
              <>
                <WeightSlider
                  label="Horizontal back"
                  min={0}
                  max={20}
                  step={0.5}
                  value={weights.horiz}
                  onChange={(v) => setWeights((w) => ({ ...w, horiz: v }))}
                />
                <WeightSlider
                  label="Vertical back"
                  min={0}
                  max={20}
                  step={0.5}
                  value={weights.vert}
                  onChange={(v) => setWeights((w) => ({ ...w, vert: v }))}
                />
                <WeightSlider
                  label="Diagonal back"
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
                  onChange={(v) =>
                    setWeights((w) => ({ ...w, threadRestart: v }))
                  }
                />
                <div className="preset-row">
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => setWeights(DEFAULT_WEIGHTS)}
                  >
                    Defaults
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() =>
                      setWeights({ horiz: 1, vert: 1, diag: 10, threadRestart: 8 })
                    }
                  >
                    Many threads
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() =>
                      setWeights({ horiz: 1, vert: 1, diag: 10, threadRestart: 100 })
                    }
                  >
                    One per colour
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Thread requirements */}
          {threadNeeds.length > 0 && (
            <div className="panel">
              <div className="panel-h">
                <span>Thread requirements</span>
                <span dir="rtl">احتياجات الخيط</span>
              </div>
              <div className="thread-needs">
                {threadNeeds.map((t) => (
                  <div key={t.idx} className="thread-need">
                    <div className="tn-swatch" style={{ background: t.color }} />
                    <div className="tn-meta">
                      <div className="tn-row">
                        <span className="tn-stitches">
                          {t.stitches} stitches
                        </span>
                        <span className="tn-skeins">
                          {t.skeins.toFixed(2)} skeins
                        </span>
                      </div>
                      <div className="tn-bar">
                        <div
                          className="tn-bar-fill"
                          style={{
                            width: `${Math.min(100, (t.skeins / maxSkeins) * 100)}%`,
                            background: t.color,
                          }}
                        />
                      </div>
                      <div className="tn-len">
                        {(t.totalMm / 1000).toFixed(2)} m floss ·{' '}
                        {t.totalMm.toFixed(0)} mm
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="thread-total">
                <span>Total floss</span>
                <strong>{(totalFlossMm / 1000).toFixed(2)} m</strong>
              </div>
              <div className="thread-note">
                Includes ~{Math.round((activeBackMult - 1) * 100)}% back-travel
                for <em>{activePlan?.label ?? 'plan'}</em>. Allow extra for
                knots and tail-ends.
              </div>
            </div>
          )}

          {/* Action / step meta */}
          <div className="panel">
            <div className="panel-h">
              <span>This step</span>
              <span dir="rtl">هذه الخطوة</span>
            </div>
            <div className="step-meta">
              <div className="stat">
                <span className="stat-label">Step</span>
                <span className="stat-val">
                  {step} / {activePlan?.steps.length ?? 0}
                </span>
              </div>
              <div className="stat">
                <span className="stat-label">Thread</span>
                <span className="stat-val">
                  {activeThread >= 0
                    ? `${activeThread + 1} / ${totalThreads}`
                    : `– / ${totalThreads}`}
                </span>
              </div>
              {totalPrimitives > 0 && (
                <div className="stat">
                  <span className="stat-label">Primitive</span>
                  <span className="stat-val">
                    {activePrimitiveIdx >= 0
                      ? `${activePrimitiveIdx + 1} / ${activePlan?.primitives?.length ?? 0}`
                      : `– / ${activePlan?.primitives?.length ?? 0}`}
                  </span>
                </div>
              )}
            </div>
            <div className="step-action">{actionText}</div>
          </div>
        </aside>
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
    <label className="slider">
      <span className="slider-h">
        <span>{label}</span>
        <strong>{value}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}
