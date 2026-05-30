# Motif Categories Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select subject-matter category filtering (9 categories) plus a borders toggle to both the Library tab and the Design tab's motif picker, driven by one shared name-keyword classifier.

**Architecture:** A pure `categoriesOf(pattern)` classifier and a `CATEGORY_FILTERS` label table live in `src/ui/patternFilters.ts` (next to the existing `isBorderPattern`). Both `LibraryTab.tsx` and `DesignTab.tsx` hold a `Set<Category>` of selected chips, render a chip row with per-category counts, and add one conjunct to their existing filter predicate (OR within categories, AND across axes). The Library also gains the borders toggle the Design tab already has.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest. Pure functions in `patternFilters.ts`; per-tab `useState` + `useMemo`.

---

## File Structure

**New**
- `src/ui/patternFilters.test.ts` — unit tests for `categoriesOf` + `CATEGORY_RULES` sanity.

**Edited**
- `src/ui/patternFilters.ts` — add `Category`, `CategoryDef`, `CATEGORY_RULES`, `CATEGORY_FILTERS`, `categoriesOf`.
- `src/ui/LibraryTab.tsx` — category + borders state, precomputed `cats`, counts, two `FilterRow`s, predicate, clear-all.
- `src/ui/DesignTab.tsx` — category state, inline category chip row with counts, predicate conjunct.

**Reference (read, don't edit)**
- `src/ui/patternFilters.ts:77-83` — `isBorderPattern` (the haystack pattern to mirror).
- `src/engine/types.ts` — `Pattern` (`name`, `nameAr?`, `source?.{originalName,arabicName,region}`).

---

## Task 1: The `categoriesOf` classifier + tests

**Files:**
- Modify: `src/ui/patternFilters.ts`
- Test: `src/ui/patternFilters.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/ui/patternFilters.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { categoriesOf, CATEGORY_RULES, CATEGORY_FILTERS } from './patternFilters';
import type { Pattern } from '../engine/types';

/** Minimal pattern with just a name (classifier only reads name text fields). */
function named(name: string, nameAr?: string): Pattern {
  return { name, nameAr, width: 1, height: 1, cells: [[0]] };
}

describe('categoriesOf', () => {
  it('tags a cypress tree as plants', () => {
    expect(categoriesOf(named('Sarwa / Cypress Tree Ramallah (1)'))).toContain('plants');
  });
  it('tags a rooster as animals', () => {
    expect(categoriesOf(named('deek / rooster'))).toContain('animals');
  });
  it('multi-tags a vase of flowers as both objects and flowers', () => {
    const c = categoriesOf(named('mazhariya ward / vase of flowers'));
    expect(c).toContain('objects');
    expect(c).toContain('flowers');
  });
  it('tags discs as geometric', () => {
    expect(categoriesOf(named('aqras / discs (2)'))).toContain('geometric');
  });
  it('tags the moon as celestial', () => {
    expect(categoriesOf(named('qamar / moon'))).toContain('celestial');
  });
  it("does not tag a rooster's comb as objects (comb collision avoided)", () => {
    const c = categoriesOf(named("urf al deek / rooster's comb"));
    expect(c).toContain('animals');
    expect(c).not.toContain('objects');
  });
  it('returns an empty array for an unrecognized name', () => {
    expect(categoriesOf(named('eid al oum / mother\'s day'))).toEqual([]);
  });
  it('matches against the Arabic name field too', () => {
    // English half blank-ish, Arabic carries the signal
    expect(categoriesOf(named('—', 'قمر'))).toContain('celestial');
  });
});

describe('CATEGORY_FILTERS / CATEGORY_RULES', () => {
  it('exposes all 9 categories in display order', () => {
    expect(CATEGORY_FILTERS.map(([k]) => k)).toEqual([
      'plants', 'animals', 'flowers', 'celestial', 'geometric',
      'objects', 'architecture', 'amulets', 'food',
    ]);
  });
  it('has one rule per category', () => {
    expect(CATEGORY_RULES.map((r) => r.key).sort()).toEqual(
      CATEGORY_FILTERS.map(([k]) => k).sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/patternFilters.test.ts`
Expected: FAIL — `categoriesOf is not exported` / cannot find name.

- [ ] **Step 3: Implement the classifier**

In `src/ui/patternFilters.ts`, append (after the existing `isBorderPattern`/`BORDER_PATTERNS` block):

```typescript
/**
 * Subject-matter categories. A motif may belong to several (multi-tag) or none
 * ("Other"). Classification is by keyword match on the motif's name text — the
 * same approach as {@link isBorderPattern}. Border is intentionally NOT a
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
  | 'food';

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
    re: /\b(moon|qamar|star|stars|najma|najmeh|nojoum|nujoom|sun|shams|crescent|hilal|قمر|نجمة|نجوم|شمس|هلال)\b/i,
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

/** [key, label, labelAr] in display order — for rendering the chip row. */
export const CATEGORY_FILTERS: Array<[Category, string, string]> =
  CATEGORY_RULES.map((r) => [r.key, r.label, r.labelAr]);

/**
 * The subject categories a pattern belongs to (possibly empty). Builds the same
 * haystack as {@link isBorderPattern} and returns each category whose rule
 * matches. Multi-tag: a "vase of flowers" returns both `objects` and `flowers`.
 */
export function categoriesOf(p: Pattern): Category[] {
  const haystack = [p.name, p.nameAr, p.source?.originalName, p.source?.arabicName]
    .filter(Boolean)
    .join(' ');
  return CATEGORY_RULES.filter((r) => r.re.test(haystack)).map((r) => r.key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/patternFilters.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean (exit 0).

```bash
git add src/ui/patternFilters.ts src/ui/patternFilters.test.ts
git commit -m "feat(filters): add subject-matter category classifier (categoriesOf)"
```

---

## Task 2: Category + borders filter in the Library tab

**Files:**
- Modify: `src/ui/LibraryTab.tsx`

The Library uses `FilterRow` + `Chip` components (defined at the bottom of the file) and a `Set`-free single-value filter model today. We add a multi-select category set and a borders boolean.

- [ ] **Step 1: Import the category API**

VERIFIED: `LibraryTab.tsx` does NOT import from `'./patternFilters'`, and it
defines its OWN local `matchesQuery`, `colorCount`, `paintedCells`, `sizeBucket`,
`complexityBucket` (and local `SizeBucket`/`ComplexityBucket`/`ColorBucket`
types). So import ONLY the new names — do NOT import the five names above (they
would collide with the local definitions). `isBorderPattern` and `categoriesOf`
are NOT defined locally, so they are safe to import.

Add after the `import { parseOxs } from '../oxs/parseOxs';` line (line 16):

```typescript
import {
  CATEGORY_FILTERS,
  categoriesOf,
  isBorderPattern,
  type Category,
} from './patternFilters';
```

- [ ] **Step 2: Add state**

In `LibraryTab` (after the existing `const [archiveComplexity, ...]` / `const [archiveShowAll, ...]` state, around line 96), add:

```typescript
  const [archiveCats, setArchiveCats] = useState<Set<Category>>(new Set());
  const [archiveBorders, setArchiveBorders] = useState(false);
```

- [ ] **Step 3: Precompute per-entry categories in `archiveData`**

Replace the existing `archiveData` `useMemo` (lines 98-110) with one that also stores `cats`:

```typescript
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
        cats: categoriesOf(p),
        isBorder: isBorderPattern(p),
      };
    });
  }, []);
```

- [ ] **Step 4: Compute per-category counts**

After `archiveRegions` (ends ~line 120), add:

```typescript
  const archiveCategoryCounts = useMemo(() => {
    const counts = {} as Record<Category, number>;
    for (const [key] of CATEGORY_FILTERS) counts[key] = 0;
    for (const e of archiveEntries) for (const c of e.cats) counts[c]++;
    return counts;
  }, [archiveEntries]);
```

- [ ] **Step 5: Extend the filter predicate**

In the `archiveFiltered` `useMemo` (lines 122-142), add two conjuncts inside the
`.filter` callback (after the `archiveComplexity` line, before the `matchesQuery`
line) and add the new deps:

```typescript
      if (archiveSize && e.size !== archiveSize) return false;
      if (archiveComplexity && e.complexity !== archiveComplexity) return false;
      if (archiveCats.size > 0 && !e.cats.some((c) => archiveCats.has(c))) {
        return false;
      }
      if (archiveBorders && !e.isBorder) return false;
      if (!matchesQuery(e.pattern, archiveQuery)) return false;
      return true;
```

and update the dependency array to include `archiveCats` and `archiveBorders`:

```typescript
  }, [
    archiveEntries,
    archiveQuery,
    archiveRegion,
    archiveColors,
    archiveSize,
    archiveComplexity,
    archiveCats,
    archiveBorders,
  ]);
```

- [ ] **Step 6: Include new filters in `archiveIsFiltered` and `archiveClearAll`**

Update `archiveIsFiltered` (lines 144-149):

```typescript
  const archiveIsFiltered =
    archiveQuery.length > 0 ||
    archiveRegion !== null ||
    archiveColors !== null ||
    archiveSize !== null ||
    archiveComplexity !== null ||
    archiveCats.size > 0 ||
    archiveBorders;
```

Update `archiveClearAll` (lines 156-162):

```typescript
  const archiveClearAll = () => {
    setArchiveQuery('');
    setArchiveRegion(null);
    setArchiveColors(null);
    setArchiveSize(null);
    setArchiveComplexity(null);
    setArchiveCats(new Set());
    setArchiveBorders(false);
  };
```

- [ ] **Step 7: Render the Category + Borders FilterRows**

Find the end of the Complexity `FilterRow` (the `</FilterRow>` before the closing
`</div>` of the filter panel, around line 349-350). Immediately after that
`</FilterRow>`, insert:

```tsx
            <FilterRow label="Category" labelAr="الفئة">
              {CATEGORY_FILTERS.map(([key, label, labelAr]) => (
                <Chip
                  key={key}
                  active={archiveCats.has(key)}
                  onClick={() =>
                    setArchiveCats((cur) => {
                      const next = new Set(cur);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                >
                  {label} <span dir="rtl">{labelAr}</span>{' '}
                  <span className="chip-count">{archiveCategoryCounts[key]}</span>
                </Chip>
              ))}
            </FilterRow>

            <FilterRow label="Borders" labelAr="الحواشي">
              <Chip
                active={archiveBorders}
                onClick={() => setArchiveBorders((v) => !v)}
              >
                Borders only <span dir="rtl">حواشي فقط</span>
              </Chip>
            </FilterRow>
```

(`chip-count` is an existing class used by the Region chips, so it's already styled.)

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; full suite still green (no test changes here).

- [ ] **Step 9: Commit**

```bash
git add src/ui/LibraryTab.tsx
git commit -m "feat(library): category and borders filters"
```

---

## Task 3: Category filter in the Design tab

**Files:**
- Modify: `src/ui/DesignTab.tsx`

The Design tab's motif picker uses `<select>` controls inside
`<div className="design-lib-filters">` and a `design-border-toggle` checkbox, plus
inline `className="chip chip-toggle"` toggles (no `Chip` component).

IMPORTANT (verified): `library` is `LibEntry[]` (a `useMemo` of `buildLibrary()`),
where `LibEntry = { key: string; pattern: Pattern; fitW: number; fitH: number }`.
`filtered` is a `useMemo` whose callback is `library.filter((e) => { const p = e.pattern; ... })`
(lines ~1837-1853). So inside the predicate, the pattern is `p = e.pattern`, and
any per-item classification uses `categoriesOf(p)`. There is no clear-all /
anyFilter boolean in this tab; the empty state is
`filtered.length === 0 && <p className="design-lib-empty">No motifs match.</p>`.

- [ ] **Step 1: Import the category API**

Add `CATEGORY_FILTERS`, `categoriesOf`, and `type Category` to the existing
import from `'./patternFilters'` (the block at lines 56-70). Result:

```typescript
import {
  CATEGORY_FILTERS,
  COLOR_BUCKETS,
  COMPLEXITY_FILTERS,
  SIZE_FILTERS,
  categoriesOf,
  colorCount,
  complexityBucket,
  isBorderPattern,
  matchesQuery,
  paintedCells,
  paintedSize,
  sizeBucket,
  type Category,
  type ColorBucket,
  type ComplexityBucket,
  type SizeBucket,
} from './patternFilters';
```

- [ ] **Step 2: Add state**

Next to the other filter state (after `const [bordersOnly, setBordersOnly] = useState(false);`
at line 378), add:

```typescript
  const [fCats, setFCats] = useState<Set<Category>>(new Set());
```

- [ ] **Step 3: Per-category counts over the library**

`library` is `LibEntry[]` and `useMemo` is already imported (line 1). Right
before the `const filtered = useMemo(...)` block (~line 1837), add a memoized
count map. Iterate `e.pattern`:

```typescript
  const catCounts = useMemo(() => {
    const counts = {} as Record<Category, number>;
    for (const [key] of CATEGORY_FILTERS) counts[key] = 0;
    for (const e of library) for (const c of categoriesOf(e.pattern)) counts[c]++;
    return counts;
  }, [library]);
```

- [ ] **Step 4: Extend the filter predicate**

In the `filtered` `useMemo` (~lines 1837-1853), the callback is
`library.filter((e) => { const p = e.pattern; ... })`. Add a category conjunct
after the `bordersOnly` line, and add `fCats` to the `useMemo` dependency array:

```typescript
      if (bordersOnly && !isBorderPattern(p)) return false;
      if (fCats.size > 0) {
        const cats = categoriesOf(p);
        if (!cats.some((c) => fCats.has(c))) return false;
      }
      return true;
```

Dependency array becomes:

```typescript
  }, [library, query, fRegion, fColors, fSize, fComplexity, bordersOnly, fCats]);
```

- [ ] **Step 5: Render the category chip row**

Inside `<div className="design-lib-filters">`, after the search `<input>` and
before the first `<label className="design-filter">` (Region), insert a chip
row. Use inline `className="chip"` to match this tab's convention:

```tsx
          <div className="design-cat-chips">
            {CATEGORY_FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`chip${fCats.has(key) ? ' chip-active' : ''}`}
                onClick={() =>
                  setFCats((cur) => {
                    const next = new Set(cur);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                title={`${catCounts[key]} motifs`}
              >
                {label} <span className="chip-count">{catCounts[key]}</span>
              </button>
            ))}
          </div>
```

(Arabic labels are omitted here to keep the Design picker compact; the English
label + count is enough. The `chip` and `chip-count` classes are already styled.)

- [ ] **Step 6: Add a wrapping style for the chip row**

In `src/styles.css`, append:

```css
.design-cat-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npx vitest run && npm run build`
Expected: all clean/green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/DesignTab.tsx src/styles.css
git commit -m "feat(design): category filter chips in the motif picker"
```

---

## Task 4: Manual verification

**Files:** none.

- [ ] **Step 1: Run the app**

Run: `npm run dev`, open the printed URL.

- [ ] **Step 2: Library checks**

- The archive filter panel shows a **Category** row of 9 chips with counts and a
  **Borders** row with one chip.
- Selecting **Animals** narrows to animal motifs; adding **Flowers** widens to
  animals OR flowers (count rises). Combining with a Region narrows further (AND).
- **Borders only** narrows to border/sinsal motifs; works together with a category.
- The Clear control resets categories and borders along with the other filters.

- [ ] **Step 3: Design checks**

- The motif picker shows the category chip row with counts.
- Selecting one/several categories filters the motif list (OR); the existing
  region/size/colors selects and `Borders only` checkbox still work alongside it.
- "No motifs match." shows when a combination yields nothing.

- [ ] **Step 4: iPad width**

Resize to ~820px (or DevTools iPad): the chip rows wrap and stay usable.

- [ ] **Step 5: Commit any fixes**

If QA surfaces issues, fix with focused commits and re-run the relevant check.

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** classifier + 9 categories + labels (Task 1); multi-tag OR /
  AND-across-axes semantics (Tasks 2 & 3 predicates); both tabs (Tasks 2 & 3);
  per-chip counts (Tasks 2 & 3); borders toggle in both — Design already had it,
  Library gains it (Task 2); comb→mosht and cross→amulets disambiguation baked
  into the rules (Task 1) and asserted by a test.
- **Type consistency:** `Category`, `CATEGORY_FILTERS` (`[key,label,labelAr][]`),
  `categoriesOf(p): Category[]` defined in Task 1 and used identically in Tasks
  2-3. `archiveCats`/`fCats` are both `Set<Category>`; toggle logic is identical.
- **No new state library:** per-tab `useState`/`useMemo`, matching the codebase.
