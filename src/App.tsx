import { useCallback, useEffect, useState } from 'react';
import type { Pattern } from './engine/types';
import { emptyPattern } from './patterns/builtin';
import { useToast } from './ui/useToast';
import LibraryTab from './ui/LibraryTab';
import EditorTab from './ui/EditorTab';
import PlanTab from './ui/PlanTab';
import GroundTruthTab from './ui/GroundTruthTab';
import ImportTab from './ui/ImportTab';
import DesignTab from './ui/DesignTab';

type TabName = 'library' | 'editor' | 'import' | 'design' | 'plans' | 'gt';

interface TabDef {
  key: TabName;
  en: string;
  ar: string;
}

const TABS: TabDef[] = [
  { key: 'library', en: 'Library', ar: 'المكتبة' },
  { key: 'editor', en: 'Editor', ar: 'المحرر' },
  { key: 'import', en: 'Import', ar: 'استيراد' },
  { key: 'design', en: 'Design', ar: 'التصميم' },
  { key: 'plans', en: 'Plans', ar: 'الخطط' },
  { key: 'gt', en: 'Ground truth', ar: 'الحقيقة المرجعية' },
];

export interface PatternState {
  pattern: Pattern;
  // null = not yet saved or loaded as a tracked pattern (e.g. edited from scratch)
  patternKey: string | null;
}

const VALID_TABS = new Set<TabName>(TABS.map((t) => t.key));

/** Parse a tab from a URL hash like "#editor", falling back to library. */
function tabFromHash(): TabName {
  const raw = window.location.hash.replace(/^#/, '') as TabName;
  return VALID_TABS.has(raw) ? raw : 'library';
}

export default function App() {
  const [tab, setTab] = useState<TabName>(tabFromHash);

  // Mirror the active tab into browser history so the back/forward buttons
  // return to the previously viewed tab. State is the source of truth; the
  // hash just reflects it. `navigate` pushes a new entry; `popstate` restores
  // without pushing.
  const navigate = useCallback((next: TabName) => {
    setTab(next);
    window.history.pushState({ tab: next }, '', '#' + next);
  }, []);

  useEffect(() => {
    // Seed the first history entry so the initial view is well-formed and a
    // refresh on a deep-linked tab stays put.
    window.history.replaceState({ tab }, '', '#' + tab);
    const onPop = (e: PopStateEvent) => {
      const next = (e.state?.tab as TabName) ?? tabFromHash();
      setTab(VALID_TABS.has(next) ? next : 'library');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // Run once on mount; `tab` here is only the initial value by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<PatternState>({
    pattern: emptyPattern(14, 14),
    patternKey: null,
  });
  const { toast, showToast } = useToast();

  const setPattern = useCallback(
    (pattern: Pattern, patternKey: string | null) =>
      setState({ pattern, patternKey }),
    [],
  );

  const updatePattern = useCallback((pattern: Pattern) => {
    setState((cur) => ({ pattern, patternKey: cur.patternKey }));
  }, []);

  const loadAndShowPlans = useCallback(
    (pattern: Pattern, patternKey: string | null) => {
      setPattern(pattern, patternKey);
      navigate('plans');
    },
    [setPattern, navigate],
  );

  return (
    <div className="tt tt-linen">
      <header className="hdr">
        <div className="hdr-left">
          <div className="hdr-mark" aria-hidden="true">
            <MarkLogo />
          </div>
          <div>
            <div className="hdr-title-en">Tatreez Stitch Planner</div>
            <div className="hdr-title-ar" dir="rtl">
              مخطط غُرز التطريز
            </div>
          </div>
        </div>
        <div className="hdr-meta">
          <div className="hdr-meta-row">
            <span className="hdr-meta-label">For a neat back</span>
            <span className="hdr-meta-val" lang="ar" dir="rtl">
              للظهر المرتب
            </span>
          </div>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? ' tab-active' : ''}`}
            onClick={() => navigate(t.key)}
            type="button"
          >
            <span className="tab-en">{t.en}</span>
            <span className="tab-ar" dir="rtl">
              {t.ar}
            </span>
          </button>
        ))}
      </nav>

      <main className="tt-body">
        {tab === 'library' && (
          <LibraryTab onLoad={loadAndShowPlans} showToast={showToast} />
        )}
        {tab === 'editor' && (
          <EditorTab
            state={state}
            onChangePattern={updatePattern}
            onSaved={(pattern, key) => {
              setPattern(pattern, key);
              showToast('Pattern saved to library');
            }}
            onGoToPlans={() => navigate('plans')}
          />
        )}
        {tab === 'import' && (
          <ImportTab
            onSendToEditor={(p) => {
              setPattern(p, null);
              navigate('editor');
            }}
            showToast={showToast}
          />
        )}
        {tab === 'design' && (
          <DesignTab onPlanArea={loadAndShowPlans} showToast={showToast} />
        )}
        {tab === 'plans' && <PlanTab state={state} />}
        {tab === 'gt' && <GroundTruthTab state={state} showToast={showToast} />}
      </main>

      <footer className="tt-foot">
        <span>Tatreez stitch planner — Linen &amp; Thread</span>
        <span className="tt-foot-r">
          Built with attribution to{' '}
          <a
            href="https://tirazain.com/archive/"
            target="_blank"
            rel="noopener noreferrer"
          >
            tirazain.com
          </a>
        </span>
      </footer>

      {toast && <div className="toast">{toast.message}</div>}
    </div>
  );
}

/** Tiny "TT" mark used as the corner badge. */
function MarkLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3 5 H17 M10 5 V15 M5 15 H15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
