# Library & Design Motif Categories — Design

**Date:** 2026-05-30
**Status:** Approved for planning

## Goal

Add subject-matter **category** filtering to the Library tab and the Design
tab's motif picker, on top of the existing region / colors / size / complexity
filters. Also give the Library the same **Borders** toggle the Design tab has,
so both tabs expose the structural border axis.

## Data analysis (grounded in the real archive)

- Archive `src/patterns/tirazainArchive.json` is a **flat object keyed by slug**:
  `{ "<slug>": { name, width, height, cells, palette, source } }` — NOT
  `{ motifs: [...] }`. **971 motifs.**
- `name` is a combined bilingual string `"English desc (n) | Arabic"`. The
  English half (lowercased) classifies well, and transliterated Arabic terms
  (sarwa, qamar, tayr, …) also appear there.
- Keyword auto-classification reaches ~80% coverage; the remaining ~20% match no
  category (the "Other" case = empty tag list, no chip selected matches them).
- Objects vs Architecture split verified: ~89 vs ~61, only 1 overlap — worth two
  chips.

## Locked decisions

1. **Auto-classify from name** via a pure helper in `src/ui/patternFilters.ts`,
   exactly like the existing `isBorderPattern`. No data changes; future imports
   classify automatically.
2. **Multiple tags per motif.** Category chips are multi-select; OR within the
   category axis.
3. **Both tabs** get the category filter, sharing one classifier.
4. **9 subject categories** (Objects separate from Architecture).
5. **Borders is a separate toggle**, not a subject chip. Reuse `isBorderPattern`.
   Add the toggle to the Library too (Design already has `bordersOnly`).
6. **Chip row UI in both tabs** (multi-select), with a **live count per chip**.

## The classifier (`src/ui/patternFilters.ts`)

```ts
export type Category =
  | 'plants' | 'animals' | 'flowers' | 'celestial'
  | 'geometric' | 'objects' | 'architecture' | 'amulets' | 'food';

export interface CategoryDef {
  key: Category;
  label: string;    // English chip label
  labelAr: string;  // Arabic chip label
  re: RegExp;       // word-boundary keyword match
}

export const CATEGORY_RULES: CategoryDef[];

/** Subject categories a pattern belongs to (may be empty = "Other"). Multi-tag. */
export function categoriesOf(p: Pattern): Category[];
```

`categoriesOf` builds the same haystack `isBorderPattern` uses —
`[p.name, p.nameAr, p.source?.originalName, p.source?.arabicName].filter(Boolean).join(' ').toLowerCase()`
— and returns each `key` whose `re` matches. Rules (word-boundary `\b…\b`,
case-insensitive):

- **plants** — `Trees & plants` / `الأشجار والنبات`: tree, trees, cypress,
  sarwa, saro, saru, shajara, nakhl, palm, branch, irq, leaf, leaves, vine,
  enab, grape, wheat, sonbola
- **animals** — `Animals` / `الحيوانات`: bird, birds, tayr, tair, asafeer,
  usfour, deek, rooster, dove, hamam, hamama, peacock, tawoos, reesh, feather,
  feathers, fish, samak, camel, jamal, horse, rabbit, arnab, lion, asad, deer,
  ghizlan, duck, chicken, dajaja, hoopoe, hudhud, butterfly, scorpion, snake
- **flowers** — `Flowers` / `الأزهار`: flower, flowers, ward, azhar, zahra,
  zahr, rose, zanbaq, lily, tulip, carnation, qoronfol, clove, blossom, bouquet,
  narjes
- **celestial** — `Celestial` / `الأجرام`: moon, qamar, star, stars, najma,
  najmeh, nojoum, nujoom, sun, shams, crescent, hilal
- **geometric** — `Geometric` / `هندسي`: geometric, disc, discs, aqras, qrs,
  qors, qowara, qowwara, square, squares, morabaat, triangle, diamond, chevron,
  zigzag, hexagon, octagon
- **objects** — `Objects` / `أدوات`: vase, shamadan, candlestick, lamp, lamps,
  qanadil, cup, finjan, kas, kasaat, glass, glasses, jug, jarra, pitcher,
  amphora, musht, mosht, kohl, makhalah, razor, shafrat, scissors, net, shbak,
  bottle, salver, chair, kursi, watch, saat, clock
  — NB: use `mosht`/`musht` (the comb tool's own name), NOT bare `comb`, because
  `"rooster's comb"` (urf al deek) is an animal; verified against the data.
- **architecture** — `Architecture` / `عمارة`: arch, arches, aqwas, qaws, tent,
  tents, khiyam, khaymeh, house, bayt, mosque, masjid, mihrab, tile, tiles,
  balat, window, shubbak, church, kaneesa, gate, gates, bwab, storey, storeys,
  dome, qubba, tower
- **amulets** — `Amulets & symbols` / `تمائم ورموز`: amulet, amulets, hijab,
  hijabat, eye, ayn, khamsa, hand, kaff, cross, crosses, saleeb, silban
- **food** — `Food & drink` / `طعام وشراب`: coffee, binn, bean, beans, soap,
  saboon, fruit, fakha, seeds, bzoor, pomegranate, romman, fig, teen, berries,
  toot, raisins, zbeeb, chickpeas, humus, apple, toofah, baklava, egg, baydat,
  sabr

Disambiguation (verified against the data):
- The comb tool → objects via `mosht`/`musht` only; bare `comb` is NOT used
  because "rooster's comb" is an animal.
- `cross`/`crosses`/`saleeb`/`silban` → amulets only (~15 motifs).
- All keywords are anchored with `\b…\b` to avoid substring false positives
  (`\bsun\b` matched only "eye of the sun"; `\bbird\b` matched 31 real birds).

Also add a shared label table for the chip row:

```ts
export const CATEGORY_FILTERS: Array<[Category, string, string]>;
// [key, label, labelAr], in display order (plants, animals, flowers, celestial,
//  geometric, objects, architecture, amulets, food)
```

## Library tab (`src/ui/LibraryTab.tsx`)

- New state: `const [archiveCats, setArchiveCats] = useState<Set<Category>>(new Set())`
  and `const [archiveBorders, setArchiveBorders] = useState(false)`.
- Precompute `categoriesOf` per archive entry in the existing `archiveData`
  `useMemo` (store `cats: Category[]` alongside `colors`/`size`/`complexity`),
  so filtering and counts don't reclassify on every render.
- Per-chip counts: derive `categoryCounts` (a `Record<Category, number>`) from
  `archiveData` once via `useMemo` — count entries whose `cats` include each key.
- Add a **Category** `FilterRow` of chips after Region/Colors/Size/Complexity:
  one chip per `CATEGORY_FILTERS` entry, showing `label` + `<span class="chip-count">count</span>`
  (mirrors the Region chips), `active={archiveCats.has(key)}`, toggling
  membership in the set.
- Add a **Borders** chip/toggle (single boolean) in its own `FilterRow` labeled
  "Borders" / "حواشي" — a single active/inactive chip "Borders only".
- Extend the `archiveFiltered` predicate (AND across axes):
  - category: `archiveCats.size === 0 || e.cats.some((c) => archiveCats.has(c))`
  - borders: `!archiveBorders || isBorderPattern(e.pattern)`
- Extend `archiveIsFiltered` and `archiveClearAll` to include the two new pieces
  (`archiveCats.size > 0`, `archiveBorders`; clear resets the set to empty and
  borders to false).

## Design tab (`src/ui/DesignTab.tsx`)

The Design picker currently filters via `<select>` dropdowns + a `bordersOnly`
checkbox, with a single combined `filtered` predicate (~line 1846) and a
`anyFilter` flag (~line 1871). Changes:

- New state: `const [fCats, setFCats] = useState<Set<Category>>(new Set())`.
  Keep the existing `bordersOnly` checkbox unchanged.
- Add a **Category** chip row (multi-select, with counts) above or alongside the
  existing filter controls — using the same `Chip`/`FilterRow` pattern the tab
  already uses elsewhere (or the Library's, kept visually consistent). Counts
  derived from the tab's library list via `useMemo` over `categoriesOf`.
- Extend the `filtered` predicate with:
  `if (fCats.size > 0 && !categoriesOf(p).some((c) => fCats.has(c))) return false;`
  (Compute `categoriesOf(p)` once per item; the library list is modest.)
- Extend `anyFilter` to include `fCats.size > 0`, and any "clear filters" action
  to reset it.

## Filtering semantics (both tabs)

- **OR within the category axis** (any selected category matches).
- **AND across axes** (query, region, colors, size, complexity, category,
  borders) — unchanged from today; category and borders are just two more
  conjuncts.
- Empty category set = no category constraint (show all).

## Files

**New**
- `src/ui/patternFilters.test.ts` — unit tests for `categoriesOf` and a couple of
  `CATEGORY_RULES` sanity checks.

**Edited**
- `src/ui/patternFilters.ts` — `Category`, `CategoryDef`, `CATEGORY_RULES`,
  `CATEGORY_FILTERS`, `categoriesOf`.
- `src/ui/LibraryTab.tsx` — category + borders state, precomputed `cats` and
  counts, Category + Borders `FilterRow`s, predicate, clear-all.
- `src/ui/DesignTab.tsx` — category state, chip row with counts, predicate,
  `anyFilter`/clear update.

## Testing

- Unit-test `categoriesOf` (pure, fast):
  - "Sarwa / Cypress Tree Ramallah (1) | …" → includes `plants`.
  - "deek / rooster" → `animals`.
  - "mazhariya ward / vase of flowers" → includes both `objects` and `flowers`.
  - a discs/geometric name → `geometric`.
  - "mother's day / eid al oum" (untagged) → `[]`.
  - a border name still classifies by subject independently of `isBorderPattern`.
- Manual run-through in both tabs: toggle multiple category chips (OR), combine
  with region/size (AND), verify counts, Borders toggle, and clear-all — at
  desktop and iPad widths.

## Out of scope

- Per-pattern stored `category` overrides (auto-from-name only this pass).
- Categorizing built-in/saved patterns specially (they run through the same
  `categoriesOf`; built-ins like coffeeBean→food, cypress→plants will tag
  naturally).
- A "People & events" category (too few motifs; stays in Other).
