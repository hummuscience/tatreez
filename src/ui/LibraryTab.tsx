import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_PATTERNS, clonePattern } from '../patterns/builtin';
import { TIRAZAIN_ARCHIVE } from '../patterns/tirazainArchive';
import {
  builtinPatternKey,
  deletePattern,
  getGroundTruth,
  listSavedPatterns,
  savePattern,
  savedPatternKey,
  type SavedPattern,
} from '../storage/storage';
import { hasCanonicalGroundTruth } from '../patterns/groundTruths';
import type { Pattern } from '../engine/types';
import PatternThumb from './PatternThumb';
import { parseOxs } from '../oxs/parseOxs';

const archivePatternKey = (slug: string) => `tirazain:${slug}`;

const ARCHIVE_PAGE_SIZE = 60;

/** Lower-case ASCII normalize so "Sarwa" matches "sarwa" / "SARWA". */
function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}

/** Match query against name, arabic name, and region. Empty query = match. */
function matchesQuery(p: Pattern, q: string): boolean {
  if (!q) return true;
  const ql = q.toLowerCase();
  if (norm(p.name).includes(ql)) return true;
  // Builtin Arabic — substring on raw value (don't lowercase RTL).
  if ((p.nameAr ?? '').includes(q)) return true;
  if ((p.regionAr ?? '').includes(q)) return true;
  const src = p.source;
  if (src) {
    if (norm(src.originalName).includes(ql)) return true;
    if (norm(src.region).includes(ql)) return true;
    if ((src.arabicName ?? '').includes(q)) return true;
  }
  return false;
}

/** Number of non-empty palette entries. */
function colorCount(p: Pattern): number {
  if (!p.palette) return 0;
  let n = 0;
  for (const c of p.palette) if (c !== null) n++;
  return n;
}

function paintedCells(p: Pattern): number {
  let n = 0;
  for (const row of p.cells) {
    for (const c of row) if (c) n++;
  }
  return n;
}

type SizeBucket = 'small' | 'medium' | 'large';
type ComplexityBucket = 'simple' | 'medium' | 'complex';
type ColorBucket = 1 | 2 | 3 | 4 | 5;

function sizeBucket(p: Pattern): SizeBucket {
  const m = Math.max(p.width, p.height);
  if (m <= 30) return 'small';
  if (m <= 60) return 'medium';
  return 'large';
}

function complexityBucket(painted: number): ComplexityBucket {
  if (painted <= 300) return 'simple';
  if (painted <= 1000) return 'medium';
  return 'complex';
}

interface Props {
  onLoad: (pattern: Pattern, patternKey: string) => void;
  showToast: (msg: string) => void;
}

export default function LibraryTab({ onLoad, showToast }: Props) {
  const [saved, setSaved] = useState<SavedPattern[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [gtKeys, setGtKeys] = useState<Set<string>>(new Set());
  const oxsInputRef = useRef<HTMLInputElement | null>(null);

  // Tirazain archive filter state
  const [archiveQuery, setArchiveQuery] = useState('');
  const [archiveRegion, setArchiveRegion] = useState<string | null>(null);
  const [archiveColors, setArchiveColors] = useState<ColorBucket | null>(null);
  const [archiveSize, setArchiveSize] = useState<SizeBucket | null>(null);
  const [archiveComplexity, setArchiveComplexity] = useState<ComplexityBucket | null>(
    null,
  );
  const [archiveShowAll, setArchiveShowAll] = useState(false);

  const archiveData = useMemo(() => {
    return Object.entries(TIRAZAIN_ARCHIVE).map(([slug, p]) => {
      const painted = paintedCells(p);
      return {
        slug,
        pattern: p,
        colors: colorCount(p),
        painted,
        size: sizeBucket(p),
        complexity: complexityBucket(painted),
      };
    });
  }, []);
  const archiveEntries = archiveData;

  const archiveRegions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of archiveEntries) {
      const r = e.pattern.source?.region;
      if (r) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [archiveEntries]);

  const archiveFiltered = useMemo(() => {
    return archiveEntries.filter((e) => {
      if (archiveRegion && e.pattern.source?.region !== archiveRegion) return false;
      if (archiveColors !== null) {
        if (archiveColors === 5 ? e.colors < 5 : e.colors !== archiveColors) {
          return false;
        }
      }
      if (archiveSize && e.size !== archiveSize) return false;
      if (archiveComplexity && e.complexity !== archiveComplexity) return false;
      if (!matchesQuery(e.pattern, archiveQuery)) return false;
      return true;
    });
  }, [
    archiveEntries,
    archiveQuery,
    archiveRegion,
    archiveColors,
    archiveSize,
    archiveComplexity,
  ]);

  const archiveIsFiltered =
    archiveQuery.length > 0 ||
    archiveRegion !== null ||
    archiveColors !== null ||
    archiveSize !== null ||
    archiveComplexity !== null;

  const archiveVisible =
    archiveShowAll || archiveIsFiltered
      ? archiveFiltered
      : archiveFiltered.slice(0, ARCHIVE_PAGE_SIZE);

  const archiveClearAll = () => {
    setArchiveQuery('');
    setArchiveRegion(null);
    setArchiveColors(null);
    setArchiveSize(null);
    setArchiveComplexity(null);
  };

  useEffect(() => {
    setSaved(listSavedPatterns());
    const keys = new Set<string>();
    for (const id of Object.keys(BUILTIN_PATTERNS)) {
      const k = builtinPatternKey(id);
      if (getGroundTruth(k) || hasCanonicalGroundTruth(id)) keys.add(k);
    }
    for (const s of listSavedPatterns()) {
      if (getGroundTruth(savedPatternKey(s.id))) keys.add(savedPatternKey(s.id));
    }
    setGtKeys(keys);
  }, [refreshTick]);

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    deletePattern(id);
    setRefreshTick((t) => t + 1);
    showToast('Pattern deleted');
  };

  const handleOxsFile = async (file: File) => {
    try {
      const text = await file.text();
      const result = parseOxs(text, file.name.replace(/\.(oxs|xml)$/i, ''));
      const id = savePattern(result.pattern);
      setRefreshTick((t) => t + 1);
      const extras: string[] = [];
      if (result.hadPartialStitches) extras.push('partial stitches were skipped');
      if (result.hadBackstitches) extras.push('backstitches were skipped');
      const extraMsg = extras.length > 0 ? ` (${extras.join('; ')})` : '';
      showToast(
        `Imported ${result.pattern.width}×${result.pattern.height} (${result.stitchCount} stitches)${extraMsg}`,
      );
      onLoad(result.pattern, savedPatternKey(id));
    } catch (err) {
      showToast(
        `OXS import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const builtinCount = Object.keys(BUILTIN_PATTERNS).length;

  return (
    <div className="lib">
      {/* ---- Built-in patterns ---- */}
      <section>
        <div className="lib-section-head">
          <h2 className="section-h">
            <span>Built-in patterns</span>
            <span className="section-h-ar" dir="rtl">
              الأنماط المدمجة
            </span>
          </h2>
          <span className="section-meta">
            {builtinCount} canonical motifs
          </span>
        </div>
        <div className="grid">
          {Object.entries(BUILTIN_PATTERNS).map(([id, p]) => {
            const key = builtinPatternKey(id);
            const hasGt = gtKeys.has(key);
            return (
              <PatternCard
                key={id}
                pattern={p}
                onClick={() => onLoad(clonePattern(p), key)}
                badge={hasGt ? 'GT' : undefined}
              />
            );
          })}
        </div>
      </section>

      {/* ---- Tirazain Archive ---- */}
      {archiveEntries.length > 0 && (
        <section>
          <div className="lib-section-head">
            <div>
              <h2 className="section-h">
                <span>Tirazain Archive</span>
                <span className="section-h-ar" dir="rtl">
                  أرشيف طرازين
                </span>
              </h2>
              <p className="section-sub">
                Patterns from the{' '}
                <a
                  href="https://tirazain.com/archive/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Tirazain community archive
                </a>{' '}
                of Palestinian tatreez. Each pattern keeps a link back to its
                source page.
              </p>
            </div>
            <span className="section-meta">
              {archiveIsFiltered
                ? `${archiveFiltered.length} of ${archiveEntries.length}`
                : `${archiveEntries.length} patterns`}
            </span>
          </div>

          {/* Filter panel */}
          <div className="filters">
            <label className="filter-search">
              <SearchIcon />
              <input
                type="search"
                placeholder="Search by name, region, Arabic name…"
                value={archiveQuery}
                onChange={(e) => setArchiveQuery(e.target.value)}
                aria-label="Search Tirazain archive"
              />
              {archiveIsFiltered && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={archiveClearAll}
                >
                  Clear
                </button>
              )}
            </label>

            <FilterRow label="Region" labelAr="المنطقة">
              {archiveRegions.map(([region, count]) => (
                <Chip
                  key={region}
                  active={archiveRegion === region}
                  onClick={() =>
                    setArchiveRegion(archiveRegion === region ? null : region)
                  }
                >
                  {region} <span className="chip-count">{count}</span>
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Colors" labelAr="الألوان">
              {([1, 2, 3, 4, 5] as ColorBucket[]).map((n) => (
                <Chip
                  key={n}
                  active={archiveColors === n}
                  onClick={() =>
                    setArchiveColors(archiveColors === n ? null : n)
                  }
                >
                  {n === 5 ? '5+' : n}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Size" labelAr="الحجم">
              {(
                [
                  ['small', 'Small (≤30)'],
                  ['medium', 'Medium (31–60)'],
                  ['large', 'Large (>60)'],
                ] as Array<[SizeBucket, string]>
              ).map(([bucket, label]) => (
                <Chip
                  key={bucket}
                  active={archiveSize === bucket}
                  onClick={() =>
                    setArchiveSize(archiveSize === bucket ? null : bucket)
                  }
                >
                  {label}
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Complexity" labelAr="التعقيد">
              {(
                [
                  ['simple', 'Simple'],
                  ['medium', 'Medium'],
                  ['complex', 'Complex'],
                ] as Array<[ComplexityBucket, string]>
              ).map(([bucket, label]) => (
                <Chip
                  key={bucket}
                  active={archiveComplexity === bucket}
                  onClick={() =>
                    setArchiveComplexity(
                      archiveComplexity === bucket ? null : bucket,
                    )
                  }
                >
                  {label}
                </Chip>
              ))}
            </FilterRow>
          </div>

          {archiveFiltered.length === 0 ? (
            <p className="empty-hint">No patterns match.</p>
          ) : (
            <>
              <div className="grid">
                {archiveVisible.map(({ slug, pattern: p }) => (
                  <PatternCard
                    key={slug}
                    pattern={p}
                    onClick={() =>
                      onLoad(clonePattern(p), archivePatternKey(slug))
                    }
                  />
                ))}
              </div>
              {!archiveIsFiltered &&
                !archiveShowAll &&
                archiveFiltered.length > ARCHIVE_PAGE_SIZE && (
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setArchiveShowAll(true)}
                    >
                      Show all {archiveFiltered.length}
                    </button>
                  </div>
                )}
            </>
          )}
        </section>
      )}

      {/* ---- Saved patterns ---- */}
      <section>
        <div className="lib-section-head">
          <h2 className="section-h">
            <span>Your saved patterns</span>
            <span className="section-h-ar" dir="rtl">
              الأنماط المحفوظة
            </span>
          </h2>
          <input
            ref={oxsInputRef}
            type="file"
            accept=".oxs,.xml,application/xml,text/xml"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleOxsFile(f);
              e.target.value = '';
            }}
          />
          <button
            className="btn-ghost btn-sm"
            onClick={() => oxsInputRef.current?.click()}
            title="Import a chart from an Open X-Stitch (.oxs) file"
          >
            Import OXS file…
          </button>
        </div>
        {saved.length === 0 ? (
          <p className="empty-hint">
            No saved patterns yet. Paint one in the Editor and click{' '}
            <em>save to library</em>.
          </p>
        ) : (
          <div className="grid">
            {saved.map((entry) => {
              const key = savedPatternKey(entry.id);
              const name = entry.pattern.name || 'Untitled';
              return (
                <PatternCard
                  key={entry.id}
                  pattern={entry.pattern}
                  onClick={() => onLoad(clonePattern(entry.pattern), key)}
                  badge={gtKeys.has(key) ? 'GT' : undefined}
                  onDelete={() => handleDelete(entry.id, name)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Sub-components ----------

interface PatternCardProps {
  pattern: Pattern;
  onClick: () => void;
  badge?: string;
  onDelete?: () => void;
}

function PatternCard({ pattern: p, onClick, badge, onDelete }: PatternCardProps) {
  const arabicName = p.nameAr ?? p.source?.arabicName ?? '';
  const region = p.source?.region;
  const sourceUrl = p.source?.url;
  return (
    <button className="card pat-card" onClick={onClick} type="button">
      <div className="pat-thumb-wrap">
        <PatternThumb pattern={p} />
      </div>
      <div className="pat-meta">
        <div className="pat-name">{p.name}</div>
        {arabicName && (
          <div className="pat-name-ar" dir="rtl">
            {arabicName}
          </div>
        )}
        <div className="pat-foot">
          <span>
            {p.width}×{p.height}
          </span>
          {region && (
            <>
              <span className="pat-dot">·</span>
              <span>{region}</span>
            </>
          )}
          {badge && <span className="pat-badge">{badge}</span>}
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="pat-foot"
            style={{ marginTop: 0, textTransform: 'none', fontSize: 10 }}
          >
            source ↗
          </a>
        )}
        {onDelete && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            style={{ marginTop: 6 }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            Delete
          </button>
        )}
      </div>
    </button>
  );
}

function FilterRow({
  label,
  labelAr,
  children,
}: {
  label: string;
  labelAr?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="filter-row">
      <div className="filter-label">
        <span>{label}</span>
        {labelAr && (
          <span className="filter-label-ar" dir="rtl">
            {labelAr}
          </span>
        )}
      </div>
      <div className="filter-chips">{children}</div>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`chip${active ? ' chip-active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

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
