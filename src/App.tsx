import { useCallback, useState } from 'react';
import type { Pattern } from './engine/types';
import { emptyPattern } from './patterns/builtin';
import { useToast } from './ui/useToast';
import LibraryTab from './ui/LibraryTab';
import EditorTab from './ui/EditorTab';
import PlanTab from './ui/PlanTab';
import GroundTruthTab from './ui/GroundTruthTab';
import ImportTab from './ui/ImportTab';

type TabName = 'library' | 'editor' | 'import' | 'plans' | 'gt';

export interface PatternState {
  pattern: Pattern;
  // null = not yet saved or loaded as a tracked pattern (e.g. edited from scratch)
  patternKey: string | null;
}

export default function App() {
  const [tab, setTab] = useState<TabName>('library');
  const [state, setState] = useState<PatternState>({
    pattern: emptyPattern(14, 14),
    patternKey: null,
  });
  const { toast, showToast } = useToast();

  const setPattern = useCallback(
    (pattern: Pattern, patternKey: string | null) => setState({ pattern, patternKey }),
    [],
  );

  const updatePattern = useCallback((pattern: Pattern) => {
    // Editing breaks the link to the saved/builtin pattern identity until re-saved
    setState((cur) => ({ pattern, patternKey: cur.patternKey }));
  }, []);

  const loadAndShowPlans = useCallback(
    (pattern: Pattern, patternKey: string | null) => {
      setPattern(pattern, patternKey);
      setTab('plans');
    },
    [setPattern],
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Tatreez Stitch Planner</h1>
        <span className="app-subtitle">Cross-stitch path planning for a neat back</span>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'library' ? 'active' : ''}`}
          onClick={() => setTab('library')}
        >
          Library
        </button>
        <button
          className={`tab ${tab === 'editor' ? 'active' : ''}`}
          onClick={() => setTab('editor')}
        >
          Editor
        </button>
        <button
          className={`tab ${tab === 'import' ? 'active' : ''}`}
          onClick={() => setTab('import')}
        >
          Import
        </button>
        <button
          className={`tab ${tab === 'plans' ? 'active' : ''}`}
          onClick={() => setTab('plans')}
        >
          Plans
        </button>
        <button className={`tab ${tab === 'gt' ? 'active' : ''}`} onClick={() => setTab('gt')}>
          Ground truth
        </button>
      </nav>

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
          onGoToPlans={() => setTab('plans')}
        />
      )}
      {tab === 'import' && (
        <ImportTab
          onSendToEditor={(p) => {
            setPattern(p, null);
            setTab('editor');
          }}
          showToast={showToast}
        />
      )}
      {tab === 'plans' && <PlanTab state={state} />}
      {tab === 'gt' && (
        <GroundTruthTab state={state} showToast={showToast} />
      )}

      {toast && <div className="toast">{toast.message}</div>}
    </div>
  );
}
