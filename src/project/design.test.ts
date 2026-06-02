import { describe, expect, it } from 'vitest';
import {
  areaUsedColors,
  cmToCells,
  composeBorder,
  compositeArea,
  decomposeBorder,
  flipX,
  flipY,
  mergePalette,
  placeMotif,
  recolorAreaIndex,
  refitAreaToContent,
  remapCells,
  repeatFit,
  quarterTurnsFromAngle,
  rotateCW,
  rotateTurns,
  trimCells,
  type Area,
  type Design,
} from './design';
import { getCloth } from './cloth';
import type { Pattern } from '../engine/types';

function motifArea(cells: number[][]): Area {
  return { id: 'a', name: 'a', x: 0, y: 0, w: cells[0].length, h: cells.length, motifs: [{ patternKey: 'k', x: 0, y: 0, cells }] };
}

describe('areaUsedColors', () => {
  it('returns distinct nonzero indices, sorted, excluding empty', () => {
    expect(areaUsedColors(motifArea([[0, 2], [1, 2]]))).toEqual([1, 2]);
  });
  it('includes repeat-motif colours', () => {
    const a: Area = { id: 'a', name: 'a', x: 0, y: 0, w: 2, h: 1, motifs: [], repeat: { mode: 'horizontal', patternKey: 'k', cells: [[3, 0]] } };
    expect(areaUsedColors(a)).toEqual([3]);
  });
});

describe('recolorAreaIndex', () => {
  const palette = [null, { hex: '#aa0000' }, { hex: '#00aa00' }];

  it('remaps the area to an existing palette colour (dedupe by hex)', () => {
    const a = motifArea([[1, 2], [1, 0]]);
    // recolour index 1 → #00AA00 which already exists at index 2
    const { palette: pal, area } = recolorAreaIndex(a, 1, { hex: '#00AA00' }, palette);
    expect(pal).toEqual([null, { hex: '#aa0000' }, { hex: '#00aa00' }]); // unchanged
    expect(area.motifs[0].cells).toEqual([[2, 2], [2, 0]]);
  });

  it('appends a new colour when the hex is not in the palette', () => {
    const a = motifArea([[1, 1]]);
    const { palette: pal, area } = recolorAreaIndex(a, 1, { hex: '#123456' }, palette);
    expect(pal[3]).toEqual({ hex: '#123456' });
    expect(area.motifs[0].cells).toEqual([[3, 3]]);
  });

  it('carries a DMC ref onto the new palette colour', () => {
    const a = motifArea([[1, 1]]);
    const { palette: pal } = recolorAreaIndex(a, 1, { hex: '#321321', dmc: { number: '321', name: 'Red' } }, palette);
    expect(pal[3]).toEqual({ hex: '#321321', dmc: { number: '321', name: 'Red' } });
  });

  it('leaves other indices untouched', () => {
    const a = motifArea([[1, 2]]);
    const { area } = recolorAreaIndex(a, 1, { hex: '#123456' }, palette);
    expect(area.motifs[0].cells[0][1]).toBe(2); // index 2 unchanged
  });

  it('never remaps the empty index 0', () => {
    const a = motifArea([[0, 1]]);
    const { area } = recolorAreaIndex(a, 0, { hex: '#123456' }, palette);
    expect(area).toBe(a);
  });
});

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
    const { palette, indexMap } = mergePalette([null], [null, { hex: '#aa0000' }]);
    expect(palette[0]).toBeNull();
    expect(indexMap[0]).toBe(0);
    expect(palette[indexMap[1]]?.hex).toBe('#aa0000');
  });

  it('dedupes identical hex case-insensitively', () => {
    const design = [null, { hex: '#AA0000' }];
    const { palette, indexMap } = mergePalette(design, [null, { hex: '#aa0000' }, { hex: '#00ff00' }]);
    // #aa0000 already present at index 1 → reuse; #00ff00 appended at 2
    expect(palette.map((c) => c?.hex ?? null)).toEqual([null, '#AA0000', '#00ff00']);
    expect(indexMap[1]).toBe(1);
    expect(indexMap[2]).toBe(2);
  });

  it('concatenates disjoint palettes', () => {
    const { palette, indexMap } = mergePalette(
      [null, { hex: '#111111' }],
      [null, { hex: '#222222' }, { hex: '#333333' }],
    );
    expect(palette.map((c) => c?.hex ?? null)).toEqual([null, '#111111', '#222222', '#333333']);
    expect(indexMap).toEqual([0, 2, 3]);
  });

  it('maps palette holes to empty', () => {
    const { indexMap } = mergePalette([null], [null, null, { hex: '#444444' }]);
    expect(indexMap[1]).toBe(0);
    expect(indexMap[2]).toBe(1);
  });

  it('carries a DMC ref through when appending', () => {
    const { palette } = mergePalette([null], [null, { hex: '#abc123', dmc: { number: '99', name: 'X' } }]);
    expect(palette[1]).toEqual({ hex: '#abc123', dmc: { number: '99', name: 'X' } });
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

describe('transforms', () => {
  // 2x3 grid (h=2, w=3):
  //   1 2 3
  //   4 5 6
  const g = [
    [1, 2, 3],
    [4, 5, 6],
  ];

  it('rotateCW turns h×w into w×h, mapping corners correctly', () => {
    // CW: top row becomes right column → first column is [4,1]
    expect(rotateCW(g)).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
  });

  it('rotateTurns is identity at 0 and 4 turns', () => {
    expect(rotateTurns(g, 0)).toEqual(g);
    expect(rotateTurns(g, 4)).toEqual(g);
  });

  it('rotateTurns(2) is 180° (reverse rows and columns)', () => {
    expect(rotateTurns(g, 2)).toEqual([
      [6, 5, 4],
      [3, 2, 1],
    ]);
  });

  it('rotateTurns handles negative turns', () => {
    expect(rotateTurns(g, -1)).toEqual(rotateTurns(g, 3));
  });

  it('flipX mirrors left↔right', () => {
    expect(flipX(g)).toEqual([
      [3, 2, 1],
      [6, 5, 4],
    ]);
  });

  it('flipY mirrors top↔bottom', () => {
    expect(flipY(g)).toEqual([
      [4, 5, 6],
      [1, 2, 3],
    ]);
  });

  it('does not mutate the input', () => {
    const copy = g.map((r) => r.slice());
    rotateCW(g);
    flipX(g);
    flipY(g);
    expect(g).toEqual(copy);
  });
});

describe('quarterTurnsFromAngle', () => {
  const Q = Math.PI / 2;

  it('rounds exact 90° multiples to the matching number of turns', () => {
    expect(quarterTurnsFromAngle(0)).toBe(0);
    expect(quarterTurnsFromAngle(Q)).toBe(1);
    expect(quarterTurnsFromAngle(2 * Q)).toBe(2);
    expect(quarterTurnsFromAngle(3 * Q)).toBe(3);
  });

  it('snaps a 45° angle to the nearest quarter turn (rounds up)', () => {
    // 45° is exactly between 0 and 90°; Math.round ties toward +∞ → 1 turn.
    expect(quarterTurnsFromAngle(Math.PI / 4)).toBe(1);
    // Just under 45° snaps down to 0; just over snaps up to 1.
    expect(quarterTurnsFromAngle(Math.PI / 4 - 0.1)).toBe(0);
    expect(quarterTurnsFromAngle(Math.PI / 4 + 0.1)).toBe(1);
  });

  it('normalizes into [0,3] for negative and large angles', () => {
    expect(quarterTurnsFromAngle(-Q)).toBe(3); // -90° == +270°
    expect(quarterTurnsFromAngle(-2 * Q)).toBe(2);
    expect(quarterTurnsFromAngle(2 * Math.PI)).toBe(0); // full turn
    expect(quarterTurnsFromAngle(2 * Math.PI + Q)).toBe(1);
  });

  it('composes with rotateTurns to give a lossless rotation', () => {
    // 2x3 grid; a ~90° angle rotates losslessly (no resampling).
    const g = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    expect(rotateTurns(g, quarterTurnsFromAngle(Q))).toEqual(rotateTurns(g, 1));
    // An off-axis angle still lands on a crisp quarter turn — never a
    // scrambled diamond.
    const out = rotateTurns(g, quarterTurnsFromAngle(Math.PI / 4));
    expect(out).toEqual(rotateTurns(g, 1));
  });
});

describe('trimCells', () => {
  it('crops blank margins to the painted bounding box', () => {
    const padded = [
      [0, 0, 0, 0],
      [0, 1, 2, 0],
      [0, 3, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(trimCells(padded)).toEqual([
      [1, 2],
      [3, 0],
    ]);
  });

  it('returns a single empty cell for an all-empty grid', () => {
    expect(trimCells([[0, 0], [0, 0]])).toEqual([[0]]);
  });

  it('leaves an already-tight grid unchanged', () => {
    const tight = [
      [1, 2],
      [3, 4],
    ];
    expect(trimCells(tight)).toEqual(tight);
  });
});

describe('compositeArea', () => {
  const palette = [null, { hex: '#aa0000' }, { hex: '#00aa00' }];

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
    const palette = [null, { hex: '#aa0000' }];
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

describe('placeMotif', () => {
  const motif: Pattern = {
    name: 'Dot',
    width: 4,
    height: 4,
    // a single painted cell with blank margins, so trim matters
    cells: [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    palette: [null, { hex: '#D21D22' }],
  };
  const entry = { key: 'builtin:dot', pattern: motif };

  const baseDesign: Design = {
    id: 'd1',
    name: 'D',
    clothId: 'aida-14',
    strandsId: '2',
    widthCm: 10,
    heightCm: 10,
    gridW: 20,
    gridH: 20,
    areas: [],
    palette: [null],
  };

  it('adds a new tight area hugging the trimmed motif at the drop point', () => {
    const next = placeMotif(baseDesign, entry, 5, 7);
    expect(next.areas).toHaveLength(1);
    const a = next.areas[0];
    expect(a.x).toBe(5);
    expect(a.y).toBe(7);
    expect(a.w).toBe(1); // trimmed to the single painted cell
    expect(a.h).toBe(1);
    expect(a.motifs).toHaveLength(1);
    expect(a.motifs[0].patternKey).toBe('builtin:dot');
    // palette merged: the motif colour appended at index 1
    expect(next.palette[1]?.hex).toBe('#D21D22');
    // the motif cell references the merged design index
    expect(a.motifs[0].cells).toEqual([[1]]);
  });

  it('clamps the area on-grid when the drop point is past the edge', () => {
    const next = placeMotif(baseDesign, entry, 19, 19);
    const a = next.areas[0];
    expect(a.x).toBe(19); // 1-wide area still fits at x=19 (gridW=20)
    expect(a.y).toBe(19);
  });

  it('does not mutate the input design', () => {
    placeMotif(baseDesign, entry, 0, 0);
    expect(baseDesign.areas).toHaveLength(0);
    expect(baseDesign.palette).toEqual([null]);
  });
});

describe('decomposeBorder', () => {
  it('finds the smallest period of a pure repeat', () => {
    // Three copies of [1,0,2] — period should be 3 wide.
    const cells = [
      [1, 0, 2, 1, 0, 2, 1, 0, 2],
      [0, 1, 0, 0, 1, 0, 0, 1, 0],
    ];
    const d = decomposeBorder(cells);
    expect(d.leftCap).toEqual([]);
    expect(d.rightCap).toEqual([]);
    expect(d.period).toEqual([
      [1, 0, 2],
      [0, 1, 0],
    ]);
  });

  it('detects end caps around a repeating middle', () => {
    // Left cap [9] · period [1,2] · period [1,2] · right cap [8].
    const cells = [
      [9, 1, 2, 1, 2, 8],
    ];
    const d = decomposeBorder(cells);
    expect(d.leftCap).toEqual([[9]]);
    expect(d.period).toEqual([[1, 2]]);
    expect(d.rightCap).toEqual([[8]]);
  });

  it('handles a pattern with no clean period by returning the whole as one tile', () => {
    const cells = [[1, 2, 3, 4, 5]]; // all different, no repeat possible
    const d = decomposeBorder(cells);
    expect(d.leftCap).toEqual([]);
    expect(d.rightCap).toEqual([]);
    expect(d.period).toEqual(cells);
  });

  it('returns an empty decomposition for an empty grid', () => {
    expect(decomposeBorder([])).toEqual({ leftCap: [], period: [], rightCap: [] });
  });
});

describe('composeBorder', () => {
  it('tiles period N times between the caps to fill the requested length', () => {
    const decomp = {
      leftCap: [[9]],
      period: [[1, 2]],
      rightCap: [[8]],
    };
    // length 9 = 1 (left) + 3 full periods (6) + 1 partial (1) + 1 (right)
    // But the right cap overlays at the end, so the partial is overwritten.
    const out = composeBorder(decomp, 9);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([9, 1, 2, 1, 2, 1, 2, 1, 8]);
  });

  it('returns an empty grid for length 0', () => {
    const decomp = { leftCap: [], period: [[1]], rightCap: [] };
    expect(composeBorder(decomp, 0)).toEqual([]);
  });
});

describe('refitAreaToContent', () => {
  const baseArea = (over: Partial<Area>): Area => ({
    id: 'a1', name: 'a', x: 0, y: 0, w: 4, h: 4, motifs: [], ...over,
  });

  it('shrinks the box to painted cells and keeps stitches on the global grid', () => {
    // Area at (10,10) sized 4x4, one motif at local (0,0) with a single
    // painted cell at local (1,1) → global (11,11).
    const area = baseArea({
      x: 10, y: 10, w: 4, h: 4,
      motifs: [{ patternKey: 'k', x: 0, y: 0, cells: [
        [0, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ] }],
    });
    const out = refitAreaToContent(area)!;
    expect(out.x).toBe(11);
    expect(out.y).toBe(11);
    expect(out.w).toBe(1);
    expect(out.h).toBe(1);
    // The single stitch is still at global (11,11): area (11,11) + motif (0,0) + cell (0,0).
    expect(out.motifs[0].x).toBe(0);
    expect(out.motifs[0].y).toBe(0);
    expect(out.motifs[0].cells).toEqual([[1]]);
  });

  it('only shifts the axis with margin', () => {
    // Painted column 0..1 across full height → trims width only.
    const area = baseArea({
      x: 5, y: 7, w: 3, h: 2,
      motifs: [{ patternKey: 'k', x: 0, y: 0, cells: [
        [1, 1, 0],
        [1, 1, 0],
      ] }],
    });
    const out = refitAreaToContent(area)!;
    expect(out.x).toBe(5);
    expect(out.y).toBe(7);
    expect(out.w).toBe(2);
    expect(out.h).toBe(2);
  });

  it('returns null when nothing is painted', () => {
    const area = baseArea({
      x: 0, y: 0, w: 2, h: 2,
      motifs: [{ patternKey: 'k', x: 0, y: 0, cells: [[0, 0], [0, 0]] }],
    });
    expect(refitAreaToContent(area)).toBeNull();
  });

  it('accounts for a motif with a non-zero local origin', () => {
    // Area 6x6 at (0,0); motif placed at local (2,2), one painted cell at
    // its (0,0) → area-local (2,2), global (2,2).
    const area = baseArea({
      x: 0, y: 0, w: 6, h: 6,
      motifs: [{ patternKey: 'k', x: 2, y: 2, cells: [[1]] }],
    });
    const out = refitAreaToContent(area)!;
    expect(out.x).toBe(2);
    expect(out.y).toBe(2);
    expect(out.w).toBe(1);
    expect(out.h).toBe(1);
    expect(out.motifs[0].x).toBe(0);
    expect(out.motifs[0].y).toBe(0);
  });

  it('returns a repeat area unchanged', () => {
    const area = baseArea({ repeat: { mode: 'horizontal', patternKey: 'k', cells: [[1]] } });
    expect(refitAreaToContent(area)).toBe(area); // identity, not a copy
  });
});
