import { describe, expect, it } from 'vitest';
import {
  cmToCells,
  compositeArea,
  mergePalette,
  remapCells,
  repeatFit,
  type Area,
} from './design';
import { getCloth } from './cloth';

describe('cmToCells', () => {
  it('converts cm to cells on Aida-14', () => {
    // 20cm / 2.54in/cm * 14 ct ≈ 110.2 → 110
    expect(cmToCells(20, getCloth('aida-14'))).toBe(110);
  });
  it('rounds to nearest cell', () => {
    // 1cm @ 14ct = 5.51 → 6
    expect(cmToCells(1, getCloth('aida-14'))).toBe(6);
  });
  it('never returns less than 1', () => {
    expect(cmToCells(0, getCloth('aida-14'))).toBe(1);
  });
});

describe('mergePalette', () => {
  it('keeps index 0 as empty and maps to 0', () => {
    const { palette, indexMap } = mergePalette([null], [null, '#aa0000']);
    expect(palette[0]).toBeNull();
    expect(indexMap[0]).toBe(0);
    expect(palette[indexMap[1]]).toBe('#aa0000');
  });

  it('dedupes identical hex case-insensitively', () => {
    const design = [null, '#AA0000'];
    const { palette, indexMap } = mergePalette(design, [null, '#aa0000', '#00ff00']);
    // #aa0000 already present at index 1 → reuse; #00ff00 appended at 2
    expect(palette).toEqual([null, '#AA0000', '#00ff00']);
    expect(indexMap[1]).toBe(1);
    expect(indexMap[2]).toBe(2);
  });

  it('concatenates disjoint palettes', () => {
    const { palette, indexMap } = mergePalette([null, '#111111'], [null, '#222222', '#333333']);
    expect(palette).toEqual([null, '#111111', '#222222', '#333333']);
    expect(indexMap).toEqual([0, 2, 3]);
  });

  it('maps palette holes to empty', () => {
    const { indexMap } = mergePalette([null], [null, null, '#444444']);
    expect(indexMap[1]).toBe(0);
    expect(indexMap[2]).toBe(1);
  });
});

describe('remapCells', () => {
  it('remaps each cell through the index map', () => {
    const out = remapCells(
      [
        [0, 1],
        [2, 0],
      ],
      [0, 5, 6],
    );
    expect(out).toEqual([
      [0, 5],
      [6, 0],
    ]);
  });
});

function area(over: Partial<Area>): Area {
  return { id: 'a', name: 'a', x: 0, y: 0, w: 4, h: 4, motifs: [], ...over };
}

describe('compositeArea', () => {
  const palette = [null, '#aa0000', '#00aa00'];

  it('empty area composites to all zeros', () => {
    const p = compositeArea(area({ w: 3, h: 2 }), palette);
    expect(p.width).toBe(3);
    expect(p.height).toBe(2);
    expect(p.cells).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it('paints a motif at its offset', () => {
    const p = compositeArea(
      area({ w: 4, h: 4, motifs: [{ patternKey: 'k', x: 1, y: 1, cells: [[1, 2]] }] }),
      palette,
    );
    expect(p.cells[1][1]).toBe(1);
    expect(p.cells[1][2]).toBe(2);
    expect(p.cells[0][0]).toBe(0);
  });

  it('clips a motif that runs out of bounds', () => {
    const p = compositeArea(
      area({ w: 2, h: 2, motifs: [{ patternKey: 'k', x: 1, y: 1, cells: [[1, 1], [1, 1]] }] }),
      palette,
    );
    expect(p.cells[1][1]).toBe(1);
    // only the in-bounds corner survives
    expect(p.cells[0][0]).toBe(0);
  });

  it('later motifs paint over earlier ones (nonzero only)', () => {
    const p = compositeArea(
      area({
        w: 2,
        h: 1,
        motifs: [
          { patternKey: 'a', x: 0, y: 0, cells: [[1, 1]] },
          { patternKey: 'b', x: 0, y: 0, cells: [[0, 2]] },
        ],
      }),
      palette,
    );
    // second motif has a 0 in cell 0 → does not erase; nonzero in cell 1 → overwrites
    expect(p.cells[0][0]).toBe(1);
    expect(p.cells[0][1]).toBe(2);
  });
});

describe('repeatFit', () => {
  it('horizontal: counts whole copies across, single row, reports leftover', () => {
    const fit = repeatFit(area({ w: 17, h: 4 }), 5, 4, 'horizontal');
    expect(fit.cols).toBe(3);
    expect(fit.rows).toBe(1);
    expect(fit.leftoverX).toBe(2);
    expect(fit.leftoverY).toBe(0);
  });

  it('grid: counts copies in both axes', () => {
    const fit = repeatFit(area({ w: 10, h: 7 }), 3, 2, 'grid');
    expect(fit.cols).toBe(3);
    expect(fit.rows).toBe(3);
    expect(fit.leftoverX).toBe(1);
    expect(fit.leftoverY).toBe(1);
  });

  it('motif larger than area → 0 copies, full remainder', () => {
    const fit = repeatFit(area({ w: 4, h: 4 }), 6, 6, 'grid');
    expect(fit.cols).toBe(0);
    expect(fit.rows).toBe(0);
    expect(fit.leftoverX).toBe(4);
    expect(fit.leftoverY).toBe(4);
  });

  it('exact fit → 0 leftover', () => {
    const fit = repeatFit(area({ w: 12, h: 6 }), 4, 3, 'grid');
    expect(fit.cols).toBe(3);
    expect(fit.rows).toBe(2);
    expect(fit.leftoverX).toBe(0);
    expect(fit.leftoverY).toBe(0);
  });

  it('composites a repeating motif tiled across the area', () => {
    const palette = [null, '#aa0000'];
    const a = area({
      w: 4,
      h: 1,
      repeat: { mode: 'horizontal', patternKey: 'k', cells: [[1, 0]] },
    });
    const p = compositeArea(a, palette);
    // motif [1,0] repeated twice across width 4 → [1,0,1,0]
    expect(p.cells[0]).toEqual([1, 0, 1, 0]);
  });
});
