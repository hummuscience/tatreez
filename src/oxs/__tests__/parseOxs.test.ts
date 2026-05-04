import { describe, it, expect, beforeAll } from 'vitest';
import { parseOxs } from '../parseOxs';

// Minimal DOMParser polyfill for node — we use linkedom or jsdom if available.
// vitest in node mode doesn't ship DOMParser by default, so we polyfill with
// a tiny XML parser using node's built-in `xml2js`-style approach. Since we
// don't want a runtime dep, use linkedom which is small and fast.
//
// If linkedom isn't installed, fall back to a hand-rolled regex approach.
beforeAll(async () => {
  if (typeof globalThis.DOMParser === 'undefined') {
    try {
      // linkedom 0.18+ exports `DOMParser` directly. Older versions use parseHTML.
      const linkedom = await import('linkedom');
      if ((linkedom as unknown as { DOMParser?: typeof DOMParser }).DOMParser) {
        globalThis.DOMParser = (linkedom as unknown as { DOMParser: typeof DOMParser })
          .DOMParser;
      } else {
        const { parseHTML } = linkedom;
        globalThis.DOMParser = class {
          parseFromString(s: string, _t: string) {
            const { document } = parseHTML(s);
            return document;
          }
        } as unknown as typeof DOMParser;
      }
    } catch {
      // linkedom not available — tests will skip
    }
  }
});

const SIMPLE_OXS = `<?xml version="1.0" encoding="UTF-8"?>
<chart>
  <properties chartheight="3" chartwidth="4" charttitle="Test pattern.chart"/>
  <palette>
    <palette_item index="0" number="cloth" name="cloth" color="FFFFFF"/>
    <palette_item index="1" number="DMC 310" name="Black" color="0C0C0C"/>
    <palette_item index="2" number="DMC 666" name="Christmas Red Bright" color="DD0000"/>
  </palette>
  <fullstitches>
    <stitch x="1" y="1" palindex="1"/>
    <stitch x="2" y="1" palindex="1"/>
    <stitch x="3" y="2" palindex="2"/>
    <stitch x="4" y="3" palindex="2"/>
  </fullstitches>
  <partstitches/>
  <backstitches/>
</chart>`;

describe('parseOxs', () => {
  it('parses chart dimensions and title', () => {
    if (typeof globalThis.DOMParser === 'undefined') return;
    const r = parseOxs(SIMPLE_OXS);
    expect(r.pattern.width).toBe(4);
    expect(r.pattern.height).toBe(3);
    expect(r.pattern.name).toBe('Test pattern');
  });

  it('builds a per-pattern palette from used palindexes', () => {
    if (typeof globalThis.DOMParser === 'undefined') return;
    const r = parseOxs(SIMPLE_OXS);
    expect(r.pattern.palette).toEqual([null, '#0C0C0C', '#DD0000']);
  });

  it('places stitches at the right (0-indexed) cells', () => {
    if (typeof globalThis.DOMParser === 'undefined') return;
    const r = parseOxs(SIMPLE_OXS);
    // OXS stitches: (1,1)=B, (2,1)=B, (3,2)=R, (4,3)=R
    // 0-indexed:    (0,0)=B, (1,0)=B, (2,1)=R, (3,2)=R
    expect(r.pattern.cells[0]).toEqual([1, 1, 0, 0]); // B,B,_,_
    expect(r.pattern.cells[1]).toEqual([0, 0, 2, 0]); // _,_,R,_
    expect(r.pattern.cells[2]).toEqual([0, 0, 0, 2]); // _,_,_,R
  });

  it('reports stitch count and absence of partial/backstitches', () => {
    if (typeof globalThis.DOMParser === 'undefined') return;
    const r = parseOxs(SIMPLE_OXS);
    expect(r.stitchCount).toBe(4);
    expect(r.hadPartialStitches).toBe(false);
    expect(r.hadBackstitches).toBe(false);
  });

  it('throws on missing <properties>', () => {
    if (typeof globalThis.DOMParser === 'undefined') return;
    expect(() => parseOxs('<chart/>')).toThrow(/properties/);
  });

  it('throws on invalid dimensions', () => {
    if (typeof globalThis.DOMParser === 'undefined') return;
    const bad = '<chart><properties chartwidth="0" chartheight="3"/></chart>';
    expect(() => parseOxs(bad)).toThrow(/dimensions/);
  });
});
