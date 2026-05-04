import { useEffect, useRef, useState } from 'react';
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

interface Props {
  onLoad: (pattern: Pattern, patternKey: string) => void;
  showToast: (msg: string) => void;
}

export default function LibraryTab({ onLoad, showToast }: Props) {
  const [saved, setSaved] = useState<SavedPattern[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [gtKeys, setGtKeys] = useState<Set<string>>(new Set());
  const oxsInputRef = useRef<HTMLInputElement | null>(null);

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

      {Object.keys(TIRAZAIN_ARCHIVE).length > 0 && (
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
            <div className="lib-grid">
              {Object.entries(TIRAZAIN_ARCHIVE).map(([slug, p]) => {
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
                        style={{ fontSize: 11, marginTop: 4, display: 'block' }}
                      >
                        source ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
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
