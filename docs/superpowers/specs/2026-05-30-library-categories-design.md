# Library & Design Motif Categories — Design (WIP)

**Date:** 2026-05-30
**Status:** Brainstorming — category set + key decisions locked; UI wiring not yet specced.

## Goal

Add subject-matter **category** filtering to the Library tab and the Design tab's
motif picker, on top of the existing region / colors / size / complexity filters.

## Data analysis (done, grounded in real data)

- Archive: `src/patterns/tirazainArchive.json` is a **flat object keyed by slug**
  (`{ "<slug>": { name, width, height, cells, palette, source } }`), **NOT**
  `{motifs:[...]}`. **971 motifs.** 601 have `source.region`.
- Names are bilingual: `"English desc (n) | Arabic"`. Split on `|`; the English
  half (lowercased) classifies well. Transliterated Arabic terms appear in the
  English half too (sarwa, qamar, tayr, etc.), so keyword rules catch a lot.
- Auto-classification by name keyword reaches ~80% coverage; ~20% "Other".

## Locked decisions (from the user)

1. **Auto-classify from name** via a shared helper (like the existing
   `isBorderPattern` in `src/ui/patternFilters.ts`). No data changes; future
   imports classify automatically.
2. **Multiple tags per motif** (a motif can match several categories; chips
   OR-filter).
3. **Both Library and Design** get the filter (logic written once in
   `patternFilters.ts`, consumed by both tabs).
4. **9 subject categories** (Objects split from Architecture — verified 89 vs 61,
   only 1 overlap).
5. **Borders stays a SEPARATE toggle** (structural axis, not subject). Reuse the
   existing `isBorderPattern` / Design-tab borders handling; do NOT fold border
   into the subject chips.

## Category set (with approx counts and matching keywords)

Match against the lowercased English name half. Multi-tag.

1. **Trees & plants** (~166): tree, trees, cypress, sarwa, saro, saru, shajara,
   nakhl, palm, branch, irq, leaf, leaves, vine, enab, grape, wheat, sonbola
2. **Animals** (~145): bird, birds, tayr, tair, asafeer, usfour, deek, rooster,
   dove, hamam, hamama, peacock, tawoos, reesh, feather, feathers, fish, samak,
   camel, jamal, horse, rabbit, arnab, lion, asad, deer, ghizlan, duck, bat,
   chicken, dajaja, hoopoe, hudhud, butterfly, scorpion, snake
3. **Flowers** (~95): flower, flowers, ward, azhar, zahra, zahr, rose, zanbaq,
   lily, tulip, carnation, qoronfol, clove, blossom, bouquet, narjes
4. **Celestial** (~83): moon, qamar, star, stars, najma, najmeh, nojoum, nujoom,
   sun, shams, crescent, hilal
5. **Geometric** (~116): geometric, disc, discs, aqras, qrs, qors, qowara,
   qowwara, square, squares, morabaat, triangle, diamond, chevron, zigzag, key,
   hexagon, octagon
6. **Objects** (~89): vase, shamadan, candlestick, lamp, lamps, qanadil, cup,
   finjan, kas, kasaat, glass, glasses, jug, jarra, pitcher, amphora, comb,
   musht, kohl, makhalah, razor, shafrat, scissors, net, shbak, bottle, salver,
   chair, kursi, watch, saat, clock
7. **Architecture** (~61): arch, arches, aqwas, qaws, tent, tents, khiyam,
   khaymeh, house, bayt, mosque, masjid, mihrab, tile, tiles, balat, window,
   shubbak, church, kaneesa, gate, gates, bwab, storey, storeys, dome, qubba,
   tower
8. **Amulets & symbols** (~53): amulet, amulets, hijab, hijabat, eye, ayn,
   khamsa, hand, kaff, cross, crosses, saleeb, silban, comb? (comb is in Objects
   — pick one; suggest Objects)
9. **Food & drink** (~45): coffee, binn, bean, beans, soap, saboon, fruit,
   fakha, seeds, bzoor, drink, pomegranate, romman, fig, teen, berries, toot,
   raisins, zbeeb, chickpeas, humus, apple, toofah, baklava, egg, baydat,
   prickly pear, sabr

Border (separate toggle): border, sinsal, nafnoof, nafnof, haashia, hashia,
dayer, sajj, frame (already in `isBorderPattern`).

Note: a few keywords (comb, cross) could match two categories; that's acceptable
under multi-tag, but assign deliberately to avoid noise.

## Planned implementation shape (NOT yet user-approved)

- **`src/ui/patternFilters.ts`**: add
  `export type Category = 'plants' | 'animals' | 'flowers' | 'celestial' | 'geometric' | 'objects' | 'architecture' | 'amulets' | 'food'`,
  a `CATEGORY_RULES: Array<{ key: Category; label: string; labelAr?: string; re: RegExp }>`,
  and `export function categoriesOf(p: Pattern): Category[]` that tests each rule
  against the lowercased name (english half) + nameAr/source fields.
  Add `CATEGORY_FILTERS` label table for the chip row.
- **Library (`LibraryTab.tsx`)** and **Design (`DesignTab.tsx`)**: add a
  `Category` `FilterRow` of chips (multi-select set of `Category`), and include
  it in the existing `archiveFiltered` / library `useMemo` predicate: a motif
  passes if the selected category set is empty OR `categoriesOf(p)` intersects it.
  Both tabs already import from `patternFilters.ts` and have a `FilterRow`/`Chip`
  pattern + a borders toggle to mirror.
- Filtering predicate stays OR within categories; AND across different filter
  axes (region, colors, size, complexity, category), matching current behavior.

## Open questions for next session

- Confirm the 9 labels + emoji/Arabic labels for the chips.
- Decide comb/cross assignment (suggest: comb→Objects, cross→Amulets).
- Whether to show a live count on each category chip (like the region chips do).
- Multi-select interaction detail: clicking multiple category chips = OR (show
  motifs in ANY selected category) — confirm that's the desired semantics.

## Codebase notes (verified)

- `src/ui/patternFilters.ts` exports: norm, matchesQuery, colorCount,
  paintedCells, paintedSize, isBorderPattern, sizeBucket, complexityBucket,
  SIZE_FILTERS, COMPLEXITY_FILTERS, COLOR_BUCKETS. Pure, no React — correct home
  for `categoriesOf`.
- Both `LibraryTab.tsx` and `DesignTab.tsx` already import these and render
  `FilterRow` + `Chip` components; Design tab has a `bordersOnly`/`borderMode`
  toggle to keep consistent with the separate-border decision.
- Tirazain entries also expose `source.originalName` / `source.arabicName`;
  the in-file `name` is the `"English | Arabic"` combined string.
