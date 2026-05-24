import { useMemo, useState } from 'react';
import type { PaletteColor } from '../engine/types';
import { DMC_CATALOG } from '../patterns/dmcCatalog';

interface Props {
  /** The colour currently in the slot being replaced. */
  current: PaletteColor;
  /** DMC numbers used across the library (for the "library only" filter). */
  libraryNumbers: ReadonlySet<string>;
  /**
   * Optional quick-pick colours shown above the search list (e.g. the other
   * colours already used on the design canvas). Deduped by hex; the current
   * colour is excluded.
   */
  suggested?: PaletteColor[];
  /** Heading for the suggested section (defaults to "On the canvas"). */
  suggestedLabel?: string;
  /** Called with the chosen replacement colour. */
  onPick: (color: PaletteColor) => void;
  /** Called to dismiss without picking. */
  onClose: () => void;
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/**
 * Searchable colour picker for the editor's "Replace" action. Three ways to
 * choose a replacement:
 *   - search the DMC catalogue by number or name,
 *   - filter that list to colours used across the library (traditional set),
 *   - enter a free hex colour that isn't a DMC thread.
 */
export default function ColorReplacePopover({
  current,
  libraryNumbers,
  suggested,
  suggestedLabel = 'On the canvas',
  onPick,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [hex, setHex] = useState('');

  // Quick-pick swatches: dedupe by hex, drop the current colour.
  const quickPicks = useMemo(() => {
    if (!suggested) return [];
    const seen = new Set<string>([current.hex.toLowerCase()]);
    const out: PaletteColor[] = [];
    for (const c of suggested) {
      const k = c.hex.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out;
  }, [suggested, current.hex]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DMC_CATALOG.filter((e) => {
      if (libraryOnly && !libraryNumbers.has(e.number)) return false;
      if (!q) return true;
      return (
        e.number.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
      );
    });
  }, [query, libraryOnly, libraryNumbers]);

  const hexValid = HEX_RE.test(hex.trim());
  const submitHex = () => {
    if (!hexValid) return;
    const h = hex.trim();
    onPick({ hex: h.startsWith('#') ? h.toUpperCase() : '#' + h.toUpperCase() });
  };

  return (
    <div className="color-replace" role="dialog" aria-label="Replace colour">
      <div className="cr-head">
        <span className="cr-current">
          <span className="cr-chip" style={{ background: current.hex }} />
          {current.dmc ? `DMC ${current.dmc.number} · ${current.dmc.name}` : current.hex}
        </span>
        <button type="button" className="cr-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {quickPicks.length > 0 && (
        <div className="cr-suggested">
          <div className="cr-suggested-label">{suggestedLabel}</div>
          <div className="cr-swatches">
            {quickPicks.map((c) => (
              <button
                type="button"
                key={c.hex}
                className="cr-swatch"
                style={{ background: c.hex }}
                title={c.dmc ? `DMC ${c.dmc.number} · ${c.dmc.name}` : c.hex}
                onClick={() => onPick(c)}
                aria-label={c.dmc ? `DMC ${c.dmc.number}` : c.hex}
              />
            ))}
          </div>
        </div>
      )}

      <input
        className="input cr-search"
        autoFocus
        placeholder="Search DMC number or name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <label className="cr-filter">
        <input
          type="checkbox"
          checked={libraryOnly}
          onChange={(e) => setLibraryOnly(e.target.checked)}
        />
        Only library colours (traditional)
      </label>

      <div className="cr-list">
        {results.length === 0 && <div className="cr-empty">No matches</div>}
        {results.map((e) => (
          <button
            type="button"
            key={e.number}
            className="cr-row"
            onClick={() => onPick({ hex: e.hex, dmc: { number: e.number, name: e.name } })}
          >
            <span className="cr-chip" style={{ background: e.hex }} />
            <span className="cr-num">DMC {e.number}</span>
            <span className="cr-name">{e.name}</span>
          </button>
        ))}
      </div>

      <div className="cr-hex">
        <span className="cr-chip" style={{ background: hexValid ? hex : 'transparent' }} />
        <input
          className="input cr-hex-input"
          placeholder="Custom #RRGGBB"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitHex();
          }}
        />
        <button type="button" className="btn-ghost" disabled={!hexValid} onClick={submitHex}>
          Use hex
        </button>
      </div>
    </div>
  );
}
