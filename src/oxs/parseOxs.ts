import type { ColorIndex, Pattern } from '../engine/types';

/**
 * Parse an Open X-Stitch (OXS) XML file into a Pattern.
 *
 * OXS is the de-facto interchange format for cross-stitch design tools
 * (PCStitch, Pattern Maker, Ursa, Stitchsoft, etc.). It's plain XML with:
 *   - <properties chartwidth="..." chartheight="..." charttitle="..."/>
 *   - <palette>
 *       <palette_item index="0" number="cloth" color="FFFFFF"/>
 *       <palette_item index="1" number="DMC 310" name="Black" color="0C0C0C"/>
 *       ...
 *     </palette>
 *   - <fullstitches>
 *       <stitch x="1" y="12" palindex="18"/>
 *       ...
 *     </fullstitches>
 *
 * We currently support full stitches only (no partial/back/knot stitches),
 * which covers all the tatreez patterns we care about. Coordinates are
 * 1-indexed in OXS; we convert to the engine's 0-indexed convention.
 *
 * The OXS palette can have up to ~100 entries (a full DMC subset). We
 * map only the entries actually USED by the chart into the per-pattern
 * palette to keep the editor's color picker manageable.
 */

export interface OxsParseResult {
  pattern: Pattern;
  /** Maps OXS palindex → engine palette index (0-based). */
  palindexMap: Map<number, ColorIndex>;
  /** Number of full stitches that were parsed. */
  stitchCount: number;
  /** Whether the file contained partial stitches (we skip those). */
  hadPartialStitches: boolean;
  /** Whether the file contained backstitches (we skip those). */
  hadBackstitches: boolean;
}

interface PaletteEntry {
  /** OXS palette index (0 = cloth/empty, 1..N = colours) */
  index: number;
  /** Hex colour string with leading '#' */
  color: string;
  /** Human-readable name, e.g. "DMC 310 Black" */
  label: string;
}

export function parseOxs(xmlText: string, name?: string): OxsParseResult {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');

  // Browsers report parse errors via a <parsererror> child element.
  const errEl = doc.querySelector('parsererror');
  if (errEl) {
    throw new Error(`OXS XML parse error: ${errEl.textContent?.slice(0, 200)}`);
  }

  const props = doc.querySelector('properties');
  if (!props) throw new Error('OXS file missing <properties> element');
  const chartWidth = parseInt(props.getAttribute('chartwidth') ?? '0', 10);
  const chartHeight = parseInt(props.getAttribute('chartheight') ?? '0', 10);
  if (chartWidth <= 0 || chartHeight <= 0) {
    throw new Error(`OXS file has invalid chart dimensions: ${chartWidth}×${chartHeight}`);
  }
  const chartTitle = props.getAttribute('charttitle') ?? '';

  // Read the palette (index → hex color + label)
  const oxsPalette = new Map<number, PaletteEntry>();
  for (const item of Array.from(doc.querySelectorAll('palette_item'))) {
    const index = parseInt(item.getAttribute('index') ?? '-1', 10);
    if (index < 0) continue;
    const colorRaw = (item.getAttribute('color') ?? 'FFFFFF').trim();
    const colorHex =
      colorRaw.startsWith('#') ? colorRaw : '#' + colorRaw.toUpperCase();
    const number = item.getAttribute('number') ?? '';
    const niceName = item.getAttribute('name') ?? '';
    const label = [number, niceName].filter((s) => s && s !== 'cloth').join(' ').trim();
    oxsPalette.set(index, { index, color: colorHex, label });
  }

  // Read full stitches and figure out which palindexes are actually used
  const stitches = Array.from(doc.querySelectorAll('fullstitches > stitch'));
  const usedPalindexes = new Set<number>();
  for (const s of stitches) {
    const pi = parseInt(s.getAttribute('palindex') ?? '-1', 10);
    if (pi > 0) usedPalindexes.add(pi);
  }

  // Build the per-pattern palette: index 0 = empty, then one slot per used
  // OXS palindex in numerical order.
  const usedSorted = [...usedPalindexes].sort((a, b) => a - b);
  const palindexMap = new Map<number, ColorIndex>();
  const palette: (string | null)[] = [null];
  usedSorted.forEach((pi, i) => {
    const entry = oxsPalette.get(pi);
    if (!entry) return;
    palette.push(entry.color);
    palindexMap.set(pi, (i + 1) as ColorIndex);
  });

  // Initialise an empty grid
  const cells: ColorIndex[][] = Array.from({ length: chartHeight }, () =>
    Array.from({ length: chartWidth }, () => 0 as ColorIndex),
  );

  // Place every full stitch.
  // OXS coordinates are 1-indexed (x=1, y=1 is the top-left cell). Convert.
  for (const s of stitches) {
    const x = parseInt(s.getAttribute('x') ?? '-1', 10);
    const y = parseInt(s.getAttribute('y') ?? '-1', 10);
    const pi = parseInt(s.getAttribute('palindex') ?? '-1', 10);
    if (x < 1 || y < 1 || x > chartWidth || y > chartHeight) continue;
    const enginePi = palindexMap.get(pi);
    if (enginePi === undefined) continue;
    cells[y - 1][x - 1] = enginePi;
  }

  const partialNodes = doc.querySelectorAll('partstitches > stitch');
  const backstitchNodes = doc.querySelectorAll('backstitches > stitch');

  const finalName = name ?? (chartTitle.replace(/\.chart$/i, '') || 'OXS pattern');

  const pattern: Pattern = {
    name: finalName,
    width: chartWidth,
    height: chartHeight,
    cells,
    palette,
  };

  return {
    pattern,
    palindexMap,
    stitchCount: stitches.length,
    hadPartialStitches: partialNodes.length > 0,
    hadBackstitches: backstitchNodes.length > 0,
  };
}
