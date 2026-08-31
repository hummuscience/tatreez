/**
 * A help overlay for the Design workspace.
 *
 * Renders a dismissable modal explaining every interaction in the tab,
 * organised by topic. Triggered from the cloth bar's "?" button and
 * elsewhere; the parent owns the open/closed state.
 *
 * The content is intentionally inline (not pulled from a doc file) so it
 * stays close to the code it documents — if a feature changes, the help
 * change rides along in the same diff.
 */

interface Props {
  onClose: () => void;
}

interface Section {
  title: string;
  items: { gesture: string; what: string }[];
}

const SECTIONS: Section[] = [
  {
    title: 'Patterns',
    items: [
      { gesture: 'Tap a library card', what: 'Arms the motif (red outline). Tap the canvas to place it; the highlight clears.' },
      { gesture: 'Tap a border card', what: 'Arms the motif AND auto-enables Border mode. Drag on the canvas to draw a border.' },
      { gesture: 'Search & filters (below the canvas)', what: 'The search box, region/colour/size/complexity dropdowns and category chips sit under the canvas with the library strip, so the top of the screen stays canvas.' },
      { gesture: 'Borders only filter', what: 'Checkbox in that filter row that narrows the catalog to border patterns (Sinsal, Nafnoof Border, Dayer Qabbeh, etc.).' },
      { gesture: 'Drag a library card (desktop)', what: 'HTML5 drag-and-drop. Drop onto the canvas to place. iPad uses the tap-arm path above.' },
    ],
  },
  {
    title: 'Canvas — placing & moving',
    items: [
      { gesture: 'Drag the canvas (no tool armed)', what: 'Pans the view — useful when zoomed in. One finger on tablet, click-drag on desktop. This is the default, so the canvas never moves a pattern by accident while you pinch-zoom.' },
      { gesture: 'Move a pattern', what: 'Press and hold a pattern for a moment, then drag (tablet). On desktop, just click-drag the pattern. No tool needed.' },
      { gesture: 'Tap a pattern', what: 'Selects the area there and floats the motif bar beside it (rotate, flip, duplicate, delete, ⋯). Only the painted shape responds. The bar hides while you drag or pinch, and comes back when you let go.' },
      { gesture: 'Tap on empty canvas (motif armed)', what: 'Places the armed motif at the tap point.' },
      { gesture: 'Select tool (✥, canvas cluster)', what: 'Turn on for empty-canvas gestures: marking a new area, marquee-grouping, Shift-drag rubber-band. Off by default — selecting and moving a pattern works without it.' },
      { gesture: 'Drag a box around motifs (Select on)', what: 'Multi-selects every area fully enclosed by the rectangle. The motif bar then acts on the whole group.' },
      { gesture: 'Shift+drag (Select on)', what: 'Rubber-band selects every area the rectangle touches.' },
    ],
  },
  {
    title: 'Borders',
    items: [
      { gesture: 'Arm a border pattern → drag horizontal', what: 'Tiles the repeating unit across the drag length. Detects period + end caps automatically; vertical-native patterns rotate to fit.' },
      { gesture: 'Arm a border pattern → drag vertical', what: 'Same, but the strip reads down the canvas.' },
      { gesture: 'Drag a border\'s end (left/right or top/bottom)', what: 'Extends or trims the border along its tiling axis. The opposite end stays anchored. Length snaps to whole periods.' },
      { gesture: '+ Border chip (canvas cluster)', what: 'Manual override — turn on for non-border patterns if you want to tile them as borders. Off for normal placement. Needs a pattern armed first; it stays disabled until then.' },
    ],
  },
  {
    title: 'The motif bar — rotate, flip, duplicate, delete',
    items: [
      { gesture: 'Where it is', what: 'Select a pattern and a small toolbar floats next to it, above or below depending on room. It follows the selection, so the buttons come to you instead of you reaching for a panel. With several areas selected it acts on all of them.' },
      { gesture: 'Rotate (↺)', what: 'Turns the selection 90° clockwise per tap. Cross-stitch only rotates cleanly in quarter turns, so other angles aren\'t offered — they\'d scramble the stitches.' },
      { gesture: 'Flip (⇔ / ⇕)', what: 'Mirrors the selection left-right (⇔) or top-bottom (⇕).' },
      { gesture: 'Duplicate (⧉)', what: 'Copies the selection. Cmd/Ctrl+D does the same, and Cmd/Ctrl+C / +V also works.' },
      { gesture: 'Delete (⌫)', what: 'Removes the selected areas. Asks first — it sits right beside rotate and flip, so a mis-tap on a tablet is easy.' },
      { gesture: 'More options (⋯)', what: 'Opens the motif details sheet: name, size, colours, repeat, "Plan this area". Single selection only.' },
    ],
  },
  {
    title: 'Motif details sheet',
    items: [
      { gesture: 'Opening it', what: 'The ⋯ on the motif bar, for the selected motif. Or turn on the Inspector chip in the top bar to keep it open for whatever you select. Either way it needs a selection — with nothing selected there is no sheet.' },
      { gesture: 'What it holds', what: 'Name, position and size, the colours used (tap a swatch to swap that colour throughout the area), the repeat-to-fill toggle, "Plan this area", Duplicate and Delete area.' },
      { gesture: 'Repeat one motif to fill', what: 'Turns the area into a repeating band or grid seeded from its first motif. Choose Horizontal band or Full grid; the sheet reports how many copies fit and what is left over. With repeat on, W/H become editable so you can size the fill region.' },
      { gesture: 'Several areas selected', what: 'Per-area fields don\'t apply, so the sheet shows only Duplicate all / Delete all.' },
      { gesture: 'Closing it', what: 'Tap ✕ or press Esc.' },
    ],
  },
  {
    title: 'The canvas cluster — pen, eraser, undo, zoom',
    items: [
      { gesture: 'Where it is', what: 'One small toolbar pinned to a corner of the canvas itself, holding Select, Pen, Eraser, Undo, the zoom buttons and + Border. These are canvas-wide modes, so they stay put rather than following the selection the way the motif bar does.' },
      { gesture: 'Pen tool (✎)', what: 'Tap or drag to paint single cells. Inside a pattern: edits that cell directly. Outside: creates a new "freehand" area to hold your strokes.' },
      { gesture: 'Pen color', what: 'With the Pen on, quick swatches appear in the cluster showing the design\'s current colors. Tap "…" to pick any DMC color. The picker remembers your last choice.' },
      { gesture: 'Eraser tool (⌫)', what: 'Tap or drag to clear cells (sets them empty). Works inside patterns; no effect on empty canvas. An area erased away completely is removed.' },
      { gesture: 'Undo (↶)', what: 'Tap ↶ Undo or press Cmd/Ctrl+Z. Undoes pen/eraser strokes and color changes. Up to 50 steps remembered. It lives here rather than on the motif bar because it is global — it reverses the last edit whatever it was.' },
    ],
  },
  {
    title: 'Zoom & pan',
    items: [
      { gesture: 'Pinch (iPad)', what: 'Two-finger pinch on the canvas. Zoom is anchored under your fingers.' },
      { gesture: 'Shift + scroll wheel (desktop)', what: 'Zooms the canvas. Plain scroll pans within the scroll container.' },
      { gesture: 'Zoom −/+/Fit (canvas cluster)', what: 'Discrete zoom buttons either side of the current percentage. "Fit" snaps back to 100%.' },
    ],
  },
  {
    title: 'Canvas size',
    items: [
      { gesture: 'Top bar → "14ct · 100×100 st ▾"', what: 'Tap the cloth/size summary in the top bar to open the Canvas settings sheet: cloth, unit (cm, inches or stitches), width, height, strands. Close it with ✕ or Esc.' },
      { gesture: 'Fit to content', what: 'In the same Canvas settings sheet, once something is placed. Shrinks the canvas to a tight box around all placed motifs, with 4 stitches of padding on each side.' },
      { gesture: 'Auto-grow on overflow', what: 'If you place a motif larger than the canvas, a banner offers to grow the canvas to fit. Tap "Grow to fit" or dismiss.' },
    ],
  },
  {
    title: 'View toggles (top bar)',
    items: [
      { gesture: '+ Patterns chip', what: 'Shows/hides the pattern library and its filter row below the canvas. Off by default to leave the canvas as large as possible; turning it on scrolls the strip into view.' },
      { gesture: '+ Inspector chip', what: 'Keeps the motif details sheet open for whatever is selected, so it doesn\'t have to be summoned per motif. The sheet only appears when something is actually selected. Both chips remember their setting between sessions.' },
      { gesture: '? button', what: 'Opens this help.' },
    ],
  },
];

export default function DesignHelp({ onClose }: Props) {
  return (
    <div className="design-help-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Help">
      <div className="design-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="design-help-head">
          <h2>Design workspace</h2>
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="Close help">
            Close
          </button>
        </div>
        <div className="design-help-body">
          {SECTIONS.map((section) => (
            <section key={section.title} className="design-help-section">
              <h3>{section.title}</h3>
              <dl>
                {section.items.map((item) => (
                  <div key={item.gesture} className="design-help-row">
                    <dt>{item.gesture}</dt>
                    <dd>{item.what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
