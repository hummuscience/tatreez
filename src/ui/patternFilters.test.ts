import { describe, it, expect } from 'vitest';
import { isBorderPattern, isBorderPatternByName, categoriesOf, categoriesOfWithOther, CATEGORY_RULES, CATEGORY_FILTERS } from './patternFilters';
import type { Pattern } from '../engine/types';

function pattern(name: string, cells: number[][]): Pattern {
  return {
    name,
    width: cells[0]?.length ?? 0,
    height: cells.length,
    cells,
    palette: [null, { hex: '#000000' }, { hex: '#888888' }, { hex: '#ffffff' }, { hex: '#ff0000' }],
  };
}

describe('isBorderPatternByName', () => {
  it('matches the explicit border vocabulary', () => {
    expect(isBorderPatternByName(pattern('Sinsal (1)', [[1]]))).toBe(true);
    expect(isBorderPatternByName(pattern('Nafnoof / Border (3)', [[1]]))).toBe(true);
    expect(isBorderPatternByName(pattern('Dayer Qabbeh', [[1]]))).toBe(true);
    expect(isBorderPatternByName(pattern('Arabic سنسال', [[1]]))).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(isBorderPatternByName(pattern('Pomegranate', [[1]]))).toBe(false);
    expect(isBorderPatternByName(pattern('Coffee Bean', [[1]]))).toBe(false);
  });
});

describe('isBorderPattern (structural)', () => {
  it('returns true when the name says border (delegates)', () => {
    expect(isBorderPattern(pattern('Sinsal (1)', [[1]]))).toBe(true);
  });

  it('detects a long vertical spine — Sarwa-style cypress trunk', () => {
    // A 5-wide × 20-tall pattern with a fully-painted column 2 (the "trunk")
    // and decorative cells around it. The trunk column makes it tile cleanly.
    const cells: number[][] = [];
    for (let y = 0; y < 20; y++) {
      const row = [0, 0, 1, 0, 0]; // trunk at col 2
      cells.push(row);
    }
    expect(isBorderPattern(pattern('Cypress', cells))).toBe(true);
  });

  it('detects a fully-filled strip', () => {
    const cells = Array.from({ length: 4 }, () => Array(20).fill(1));
    expect(isBorderPattern(pattern('Filled strip', cells))).toBe(true);
  });

  it('rejects a wide solid block (no border use)', () => {
    const cells = Array.from({ length: 30 }, () => Array(30).fill(1));
    expect(isBorderPattern(pattern('Big block', cells))).toBe(false);
  });

  it('rejects a sparse pattern with no continuous spine', () => {
    // A scattering of single painted cells across a 20×20 grid; no row or
    // column has anywhere near 80% coverage.
    const cells = Array.from({ length: 20 }, () => Array(20).fill(0));
    cells[3][5] = 1;
    cells[10][15] = 1;
    cells[18][2] = 1;
    expect(isBorderPattern(pattern('Sparse', cells))).toBe(false);
  });

  it('handles small dense patterns like Coffee Bean', () => {
    // 5×5 with a fully painted middle column — tiles vertically as a border.
    const cells = [
      [0, 1, 1, 1, 0],
      [1, 1, 2, 1, 1],
      [1, 2, 2, 2, 1],
      [1, 1, 2, 1, 1],
      [0, 1, 1, 1, 0],
    ];
    expect(isBorderPattern(pattern('Coffee Bean', cells))).toBe(true);
  });

  it('honours the 15-cell short-axis cap', () => {
    // 16-wide, 30-tall: too thick on the short axis to read as a border line.
    const cells = Array.from({ length: 30 }, () => Array(16).fill(1));
    expect(isBorderPattern(pattern('Thick block', cells))).toBe(false);
  });
});

// ─── categoriesOf ────────────────────────────────────────────────────────────

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
  it('exposes all 9 subject categories followed by other in display order', () => {
    expect(CATEGORY_FILTERS.map(([k]) => k)).toEqual([
      'plants', 'animals', 'flowers', 'celestial', 'geometric',
      'objects', 'architecture', 'amulets', 'food', 'other',
    ]);
  });
  it('CATEGORY_RULES has one rule per subject category (other is not in rules)', () => {
    expect(CATEGORY_RULES.map((r) => r.key).sort()).toEqual(
      ['plants', 'animals', 'flowers', 'celestial', 'geometric',
       'objects', 'architecture', 'amulets', 'food'].sort(),
    );
  });
});

const pat = (name: string): Pattern => ({
  name, width: 1, height: 1, cells: [[0]], palette: [null],
});

describe('categoriesOfWithOther', () => {
  it('returns ["other"] when no subject rule matches', () => {
    expect(categoriesOfWithOther(pat('Zzz Qabbeh Panel'))).toEqual(['other']);
  });

  it('returns the matched categories (never other) when something matches', () => {
    const cats = categoriesOfWithOther(pat('Cypress Tree Sarwa'));
    expect(cats).toContain('plants');
    expect(cats).not.toContain('other');
  });

  it('includes an "other" entry in the filter chip list', () => {
    expect(CATEGORY_FILTERS.some(([k]) => k === 'other')).toBe(true);
  });
});
