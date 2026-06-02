/**
 * Shared pattern-filtering helpers used by both the Library tab and the
 * Design tab's library panel, so the two stay in lock-step. Pure functions
 * over `Pattern` — no React, no DOM.
 */

import type { Pattern } from '../engine/types';

/** Lower-case ASCII normalize so "Sarwa" matches "sarwa" / "SARWA". */
export function norm(s: string | undefined): string {
  return (s ?? '').toLowerCase();
}

/** Match query against name, arabic name, and region. Empty query = match. */
export function matchesQuery(p: Pattern, q: string): boolean {
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
export function colorCount(p: Pattern): number {
  if (!p.palette) return 0;
  let n = 0;
  for (const c of p.palette) if (c !== null) n++;
  return n;
}

export function paintedCells(p: Pattern): number {
  let n = 0;
  for (const row of p.cells) {
    for (const c of row) if (c) n++;
  }
  return n;
}

/**
 * Dimensions of a pattern's painted bounding box (ignoring blank margin rows
 * and columns), in stitches. This matches what a motif occupies once placed
 * (placement trims to the painted box), so it's the size to compare against a
 * marked area. An all-empty pattern returns {w:0,h:0}.
 */
export function paintedSize(p: Pattern): { w: number; h: number } {
  let top = Infinity;
  let left = Infinity;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < p.cells.length; y++) {
    const row = p.cells[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return { w: 0, h: 0 };
  return { w: right - left + 1, h: bottom - top + 1 };
}

export type SizeBucket = 'small' | 'medium' | 'large';
export type ComplexityBucket = 'simple' | 'medium' | 'complex';
export type ColorBucket = 1 | 2 | 3 | 4 | 5;

/**
 * Arabic names for the Palestinian regions the archive tags patterns with.
 * The archive stores only the English `source.region`, so the UI maps it to
 * Arabic here for display. Keyed by the exact English region string.
 */
export const REGION_AR: Record<string, string> = {
  Ramallah: 'رام الله',
  Hebron: 'الخليل',
  Gaza: 'غزة',
  Bethlehem: 'بيت لحم',
  Jaffa: 'يافا',
  Jerusalem: 'القدس',
  Galilee: 'الجليل',
  Nablus: 'نابلس',
};

/** Arabic label for an English region, falling back to the English name. */
export function regionAr(region: string): string {
  return REGION_AR[region] ?? region;
}

/** "English · العربية" for a region, or just the English when unmapped. */
export function regionBilingual(region: string): string {
  const ar = REGION_AR[region];
  return ar ? `${region} · ${ar}` : region;
}

/**
 * Heuristic: is this pattern a border? Matches names that mention "border"
 * (English), "sinsal"/"haashia"/"dayer" (Palestinian border terms), or the
 * Arabic ٍسنسال / حاشية / داير. Source-of-truth is name text — many tirazain
 * archive entries follow "Sinsal / Border (N)" or "Nafnoof Border" patterns.
 */
const BORDER_PATTERNS = /border|sinsal|haashia|dayer|سنسال|حاشية|داير/i;
export function isBorderPatternByName(p: Pattern): boolean {
  const haystack = [p.name, p.nameAr, p.source?.originalName, p.source?.arabicName]
    .filter(Boolean)
    .join(' ');
  return BORDER_PATTERNS.test(haystack);
}

/**
 * Stronger check: structural border eligibility. Returns true if the
 * pattern is usable as a continuous border, by any of these criteria —
 *
 *   1. The name says so (Sinsal, Nafnoof Border, Dayer Qabbeh, etc.).
 *   2. There's a continuous spine — a row or column with ≥80% painted cells
 *      running the long axis. Tiles like Sarwa (cypress tree with a central
 *      trunk) qualify here even though their name doesn't say "border."
 *   3. The pattern decomposes to a smaller period along its long axis —
 *      i.e., its own data contains visible repetition (Coffee Bean and
 *      similar small rhythmic motifs).
 *
 * Anything ≥10 cells on the short axis is excluded as too "blocky" to read
 * as a border line.
 */
export function isBorderPattern(p: Pattern): boolean {
  if (isBorderPatternByName(p)) return true;
  // Name aside, structural cues.
  const w = p.width;
  const h = p.height;
  // Strip-like aspect; we look at the *long axis* for the spine.
  const longIsH = h >= w;
  const longLen = longIsH ? h : w;
  const shortLen = longIsH ? w : h;
  // Allow up to ~15 short-axis cells to call it a border-eligible strip.
  if (shortLen > 15) return false;
  // Continuous spine: any row (when long axis = w) or column (long axis = h)
  // with ≥80% painted cells along the long axis is a "spine."
  const SPINE_FRACTION = 0.8;
  const threshold = Math.ceil(longLen * SPINE_FRACTION);
  if (longIsH) {
    // Look for a column where ≥threshold of the rows have a painted cell.
    for (let x = 0; x < w; x++) {
      let count = 0;
      for (let y = 0; y < h; y++) {
        if ((p.cells[y]?.[x] ?? 0) > 0) count++;
      }
      if (count >= threshold) return true;
    }
  } else {
    // Look for a row.
    for (let y = 0; y < h; y++) {
      let count = 0;
      const row = p.cells[y] ?? [];
      for (let x = 0; x < w; x++) {
        if (row[x] > 0) count++;
      }
      if (count >= threshold) return true;
    }
  }
  return false;
}

export function sizeBucket(p: Pattern): SizeBucket {
  const m = Math.max(p.width, p.height);
  if (m <= 30) return 'small';
  if (m <= 60) return 'medium';
  return 'large';
}

export function complexityBucket(painted: number): ComplexityBucket {
  if (painted <= 300) return 'simple';
  if (painted <= 1000) return 'medium';
  return 'complex';
}

/** Label tables for the filter chip rows (English + Arabic), shared by both tabs. */
export const SIZE_FILTERS: Array<[SizeBucket, string]> = [
  ['small', 'Small (≤30)'],
  ['medium', 'Medium (31–60)'],
  ['large', 'Large (>60)'],
];

export const COMPLEXITY_FILTERS: Array<[ComplexityBucket, string]> = [
  ['simple', 'Simple'],
  ['medium', 'Medium'],
  ['complex', 'Complex'],
];

export const COLOR_BUCKETS: ColorBucket[] = [1, 2, 3, 4, 5];

/**
 * Subject-matter categories. A motif may belong to several (multi-tag) or none
 * ("Other"). Classification is by keyword match on the motif's name text — the
 * same approach as {@link isBorderPatternByName}. Border is intentionally NOT a
 * subject category; it is a separate structural axis (see isBorderPattern).
 */
export type Category =
  | 'plants'
  | 'animals'
  | 'flowers'
  | 'celestial'
  | 'geometric'
  | 'objects'
  | 'architecture'
  | 'amulets'
  | 'food'
  | 'other';

export interface CategoryDef {
  key: Category;
  label: string;
  labelAr: string;
  re: RegExp;
}

/**
 * One rule per category. Keywords are matched with word boundaries (\b) to
 * avoid substring false positives, case-insensitively, against the combined
 * name haystack. Keyword sets were validated against the Tirazain archive;
 * notably the comb tool uses `mosht`/`musht` (NOT bare `comb`, which collides
 * with "rooster's comb"), and crosses go to amulets.
 */
export const CATEGORY_RULES: CategoryDef[] = [
  {
    key: 'plants',
    label: 'Trees & plants',
    labelAr: 'الأشجار والنبات',
    re: /\b(tree|trees|cypress|sarwa|saro|saru|shajara|nakhl|palm|branch|irq|leaf|leaves|vine|enab|grape|wheat|sonbola)\b/i,
  },
  {
    key: 'animals',
    label: 'Animals',
    labelAr: 'الحيوانات',
    re: /\b(bird|birds|tayr|tair|asafeer|usfour|deek|rooster|dove|hamam|hamama|peacock|tawoos|reesh|feather|feathers|fish|samak|camel|jamal|horse|rabbit|arnab|lion|asad|deer|ghizlan|duck|chicken|dajaja|hoopoe|hudhud|butterfly|scorpion|snake)\b/i,
  },
  {
    key: 'flowers',
    label: 'Flowers',
    labelAr: 'الأزهار',
    re: /\b(flower|flowers|ward|azhar|zahra|zahr|rose|zanbaq|lily|tulip|carnation|qoronfol|clove|blossom|bouquet|narjes)\b/i,
  },
  {
    key: 'celestial',
    label: 'Celestial',
    labelAr: 'الأجرام',
    re: /\b(moon|qamar|star|stars|najma|najmeh|nojoum|nujoom|sun|shams|crescent|hilal)\b|(قمر|نجمة|نجوم|شمس|هلال)/i,
  },
  {
    key: 'geometric',
    label: 'Geometric',
    labelAr: 'هندسي',
    re: /\b(geometric|disc|discs|aqras|qrs|qors|qowara|qowwara|square|squares|morabaat|triangle|diamond|chevron|zigzag|hexagon|octagon)\b/i,
  },
  {
    key: 'objects',
    label: 'Objects',
    labelAr: 'أدوات',
    re: /\b(vase|shamadan|candlestick|lamp|lamps|qanadil|cup|finjan|kas|kasaat|glass|glasses|jug|jarra|pitcher|amphora|musht|mosht|kohl|makhalah|razor|shafrat|scissors|net|shbak|bottle|salver|chair|kursi|watch|saat|clock)\b/i,
  },
  {
    key: 'architecture',
    label: 'Architecture',
    labelAr: 'عمارة',
    re: /\b(arch|arches|aqwas|qaws|tent|tents|khiyam|khaymeh|house|bayt|mosque|masjid|mihrab|tile|tiles|balat|window|shubbak|church|kaneesa|gate|gates|bwab|storey|storeys|dome|qubba|tower)\b/i,
  },
  {
    key: 'amulets',
    label: 'Amulets & symbols',
    labelAr: 'تمائم ورموز',
    re: /\b(amulet|amulets|hijab|hijabat|eye|ayn|khamsa|hand|kaff|cross|crosses|saleeb|silban)\b/i,
  },
  {
    key: 'food',
    label: 'Food & drink',
    labelAr: 'طعام وشراب',
    re: /\b(coffee|binn|bean|beans|soap|saboon|fruit|fakha|seeds|bzoor|pomegranate|romman|fig|teen|berries|toot|raisins|zbeeb|chickpeas|humus|apple|toofah|baklava|egg|baydat|sabr)\b/i,
  },
];

/** [key, label, labelAr] in display order — for rendering the chip row.
 * "Other" is appended manually: it has no keyword rule (it means "matched
 * nothing"), so it isn't in CATEGORY_RULES. */
export const CATEGORY_FILTERS: Array<[Category, string, string]> = [
  ...CATEGORY_RULES.map((r): [Category, string, string] => [r.key, r.label, r.labelAr]),
  ['other', 'Other', 'أخرى'],
];

/**
 * The subject categories a pattern belongs to (possibly empty). Builds the same
 * haystack as {@link isBorderPatternByName} and returns each category whose rule
 * matches. Multi-tag: a "vase of flowers" returns both `objects` and `flowers`.
 */
export function categoriesOf(p: Pattern): Category[] {
  const haystack = [p.name, p.nameAr, p.source?.originalName, p.source?.arabicName]
    .filter(Boolean)
    .join(' ');
  return CATEGORY_RULES.filter((r) => r.re.test(haystack)).map((r) => r.key);
}

/**
 * Like {@link categoriesOf}, but a motif that matches no subject rule is
 * bucketed into `['other']` instead of an empty list — so the "Other" filter
 * chip surfaces exactly the motifs no keyword rule catches, and nothing is
 * unreachable when a category filter is active.
 */
export function categoriesOfWithOther(p: Pattern): Category[] {
  const cats = categoriesOf(p);
  return cats.length > 0 ? cats : ['other'];
}
