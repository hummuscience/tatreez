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
  const src = p.source;
  if (!src) return false;
  if (norm(src.originalName).includes(ql)) return true;
  if (norm(src.region).includes(ql)) return true;
  // Arabic — substring on the raw value (don't lowercase RTL).
  if ((src.arabicName ?? '').includes(q)) return true;
  return false;
}

/** Number of non-empty palette entries — patterns with N colours show N. */
function colorCount(p: Pattern): number {
  if (!p.palette) return 0;
  let n = 0;
  for (const c of p.palette) if (c !== null) n++;
  return n;
}

/** Sum of painted (non-zero) cells. Proxy for stitching effort. */
function paintedCells(p: Pattern): number {
  let n = 0;
  for (const row of p.cells) {
    for (const c of row) if (c) n++;
  }
  return n;
}

type SizeBucket = 'small' | 'medium' | 'large';
type ComplexityBucket = 'simple' | 'medium' | 'complex';
type ColorBucket = 1 | 2 | 3 | 4 | 5; // 5 means "5 or more"

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
  const [archiveComplexity, setArchiveComplexity] = useState<ComplexityBucket | null>(null);
  const [archiveShowAll, setArchiveShowAll] = useState(false);

  // Pre-compute archive entries with derived facets (color count, painted
  // cells) so we don't recompute per render. Doing this once at mount.
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

  // Filter entries by all active facets. Each filter is independent;
  // an entry must pass every active filter to be included.
  const archiveFiltered = useMemo(() => {
    return archiveEntries.filter((e) => {
      if (archiveRegion && e.pattern.source?.region !== archiveRegion) return false;
      if (archiveColors !== null) {
        // Bucket 5 means "5 or more"; lower buckets are exact match.
        if (archiveColors === 5 ? e.colors < 5 : e.colors !== archiveColors) {
          return false;
        }
      }
      if (archiveSize && e.size !== archiveSize) return false;
      if (archiveComplexity && e.complexity !== archiveComplexity) return false;
      if (!matchesQuery(e.pattern, archiveQuery)) return false;
      return true;
    });
  }, [archiveEntries, archiveQuery, archiveRegion, archiveColors, archiveSize, archiveComplexity]);

  const archiveIsFiltered =
    archiveQuery.length > 0 ||
    archiveRegion !== null ||
    archiveColors !== null ||
    archiveSize !== null ||
    archiveComplexity !== null;

  const archiveVisible = archiveShowAll || archiveIsFiltered
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
      // Open the newly-imported pattern in the editor flow
      onLoad(result.pattern, savedPatternKey(id));
    } catch (err) {
      showToast(
        `OXS import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div>
      <p className="section-label">Built-in patterns</p>
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="lib-grid">
          {Object.entries(BUILTIN_PATTERNS).map(([id, p]) => {
            const key = builtinPatternKey(id);
            return (
              <div
                className="lib-item"
                key={id}
                onClick={() => onLoad(clonePattern(p), key)}
              >
                <PatternThumb pattern={p} />
                <div className="name">{p.name}</div>
                <div className="meta">
                  {p.width}×{p.height}
                  {gtKeys.has(key) && (
                    <>
                      {' '}
                      <span className="pill success">GT</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {archiveEntries.length > 0 && (
        <>
          <p className="section-label">
            Tirazain Archive{' '}
            <a
              href="https://tirazain.com/archive/"
              target="_blank"
              rel="noopener noreferrer"
              className="muted"
              style={{ fontSize: 12, fontWeight: 'normal', marginLeft: 8 }}
            >
              tirazain.com/archive →
            </a>
          </p>
          <div className="card" style={{ marginBottom: 24 }}>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>
              Patterns from the Tirazain community archive of Palestinian
              tatreez. Each pattern keeps a link back to its source page.
            </p>

            {/* Search + count + clear row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
                flexWrap: 'wrap',
              }}
            >
              <input
                type="search"
                placeholder="Search by name, region, Arabic name…"
                value={archiveQuery}
                onChange={(e) => setArchiveQuery(e.target.value)}
                style={{
                  flex: '1 1 280px',
                  minWidth: 200,
                  padding: '6px 10px',
                  fontSize: 13,
                }}
                aria-label="Search Tirazain archive"
              />
              <span className="muted" style={{ fontSize: 12 }}>
                {archiveIsFiltered
                  ? `${archiveFiltered.length} of ${archiveEntries.length}`
                  : `${archiveEntries.length} patterns`}
              </span>
              {archiveIsFiltered && (
                <button
                  onClick={archiveClearAll}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Filter rows: region / colors / size / complexity */}
            <FilterRow label="Region">
              {archiveRegions.map(([region, count]) => {
                const active = archiveRegion === region;
                return (
                  <FilterChip
                    key={region}
                    label={`${region} (${count})`}
                    active={active}
                    onClick={() => setArchiveRegion(active ? null : region)}
                  />
                );
              })}
            </FilterRow>

            <FilterRow label="Colors">
              {([1, 2, 3, 4, 5] as ColorBucket[]).map((n) => {
                const active = archiveColors === n;
                return (
                  <FilterChip
                    key={n}
                    label={n === 5 ? '5+' : String(n)}
                    active={active}
                    onClick={() => setArchiveColors(active ? null : n)}
                  />
                );
              })}
            </FilterRow>

            <FilterRow label="Size">
              {(
                [
                  ['small', 'Small (≤30)'],
                  ['medium', 'Medium (31–60)'],
                  ['large', 'Large (>60)'],
                ] as Array<[SizeBucket, string]>
              ).map(([bucket, label]) => {
                const active = archiveSize === bucket;
                return (
                  <FilterChip
                    key={bucket}
                    label={label}
                    active={active}
                    onClick={() => setArchiveSize(active ? null : bucket)}
                  />
                );
              })}
            </FilterRow>

            <FilterRow label="Complexity">
              {(
                [
                  ['simple', 'Simple'],
                  ['medium', 'Medium'],
                  ['complex', 'Complex'],
                ] as Array<[ComplexityBucket, string]>
              ).map(([bucket, label]) => {
                const active = archiveComplexity === bucket;
                return (
                  <FilterChip
                    key={bucket}
                    label={label}
                    active={active}
                    onClick={() => setArchiveComplexity(active ? null : bucket)}
                  />
                );
              })}
            </FilterRow>

            {archiveFiltered.length === 0 ? (
              <p className="empty-hint">No patterns match.</p>
            ) : (
              <>
                <div className="lib-grid">
                  {archiveVisible.map(({ slug, pattern: p }) => {
                    const key = archivePatternKey(slug);
                    return (
                      <div
                        className="lib-item"
                        key={slug}
                        onClick={() => onLoad(clonePattern(p), key)}
                      >
                        <PatternThumb pattern={p} />
                        <div className="name">{p.name}</div>
                        <div className="meta">
                          {p.width}×{p.height}
                          {p.source?.region && (
                            <>
                              {' · '}
                              <span>{p.source.region}</span>
                            </>
                          )}
                        </div>
                        {p.source?.url && (
                          <a
                            href={p.source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="muted"
                            style={{
                              fontSize: 11,
                              marginTop: 4,
                              display: 'block',
                            }}
                          >
                            source ↗
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!archiveIsFiltered &&
                  !archiveShowAll &&
                  archiveFiltered.length > ARCHIVE_PAGE_SIZE && (
                    <div
                      style={{
                        textAlign: 'center',
                        marginTop: 12,
                      }}
                    >
                      <button
                        onClick={() => setArchiveShowAll(true)}
                        style={{ fontSize: 12 }}
                      >
                        Show all {archiveFiltered.length}
                      </button>
                    </div>
                  )}
              </>
            )}
          </div>
        </>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <p className="section-label" style={{ margin: 0 }}>
          Your saved patterns
        </p>
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
          onClick={() => oxsInputRef.current?.click()}
          title="Import a chart from an Open X-Stitch (.oxs) file"
        >
          Import OXS file…
        </button>
      </div>
      <div className="card" style={{ minHeight: 60 }}>
        {saved.length === 0 ? (
          <p className="empty-hint">
            No saved patterns yet. Paint one in the Editor and click <em>save to library</em>.
          </p>
        ) : (
          <div className="lib-grid">
            {saved.map((entry) => {
              const key = savedPatternKey(entry.id);
              const name = entry.pattern.name || 'Untitled';
              return (
                <div
                  className="lib-item"
                  key={entry.id}
                  onClick={() => onLoad(clonePattern(entry.pattern), key)}
                >
                  <PatternThumb pattern={entry.pattern} />
                  <div className="name">{name}</div>
                  <div className="meta">
                    {entry.pattern.width}×{entry.pattern.height}
                    {gtKeys.has(key) && (
                      <>
                        {' '}
                        <span className="pill success">GT</span>
                      </>
                    )}
                  </div>
                  <button
                    style={{ marginTop: 6, fontSize: 11, padding: '2px 8px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id, name);
                    }}
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Single row in the filter stack: a label on the left, chips on the right.
 * Keeps row spacing/alignment consistent across the four filter rows.
 */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        marginBottom: 6,
        flexWrap: 'wrap',
      }}
    >
      <span
        className="muted"
        style={{ fontSize: 11, minWidth: 70, fontWeight: 600 }}
      >
        {label}:
      </span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={active ? 'primary' : ''}
      style={{ fontSize: 11, padding: '2px 8px' }}
    >
      {label}
    </button>
  );
}
