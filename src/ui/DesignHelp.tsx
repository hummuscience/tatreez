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
      { gesture: 'Borders only filter', what: 'Library checkbox that narrows the catalog to border patterns (Sinsal, Nafnoof Border, Dayer Qabbeh, etc.).' },
      { gesture: 'Drag a library card (desktop)', what: 'HTML5 drag-and-drop. Drop onto the canvas to place. iPad uses the tap-arm path above.' },
    ],
  },
  {
    title: 'Canvas — placing & moving',
    items: [
      { gesture: 'Tap on empty canvas (motif armed)', what: 'Places the armed motif at the tap point.' },
      { gesture: 'Drag on empty canvas (no motif armed)', what: 'Marks an empty "place a motif here later" area. Only one empty marker at a time — a new mark replaces the previous.' },
      { gesture: 'Drag a box around existing motifs', what: 'Multi-selects every area fully enclosed by the rectangle. Rotate / flip / move then acts on the whole group.' },
      { gesture: 'Drag inside an area', what: 'Moves it. If the area is part of a multi-selection, the whole group moves.' },
      { gesture: 'Shift+drag', what: 'Rubber-band selects every area the rectangle touches.' },
    ],
  },
  {
    title: 'Borders',
    items: [
      { gesture: 'Arm a border pattern → drag horizontal', what: 'Tiles the repeating unit across the drag length. Detects period + end caps automatically; vertical-native patterns rotate to fit.' },
      { gesture: 'Arm a border pattern → drag vertical', what: 'Same, but the strip reads down the canvas.' },
      { gesture: 'Drag a border\'s end (left/right or top/bottom)', what: 'Extends or trims the border along its tiling axis. The opposite end stays anchored. Length snaps to whole periods.' },
      { gesture: '+ Border chip (canvas foot)', what: 'Manual override — turn on for non-border patterns if you want to tile them as borders. Off for normal placement.' },
    ],
  },
  {
    title: 'Rotate, flip, duplicate',
    items: [
      { gesture: 'Rotate handle (above selection)', what: 'Drag the small knob above a selected area. Rotates 90° on release. Alt-drag (desktop) snaps live to quarter turns.' },
      { gesture: 'Flip', what: 'Use the inspector\'s Flip H / Flip V buttons (open the Inspector panel from the top bar).' },
      { gesture: 'Duplicate', what: 'Cmd/Ctrl+D copies the selection. Cmd/Ctrl+C / +V also works.' },
      { gesture: 'Delete', what: 'Tap the × button on a selected area, or press Delete/Backspace.' },
    ],
  },
  {
    title: 'Pen, Eraser, Undo',
    items: [
      { gesture: 'Pen tool (floating toolbar)', what: 'Tap or drag to paint single cells. Inside a pattern: edits that cell directly. Outside: creates a new "freehand" area to hold your strokes.' },
      { gesture: 'Pen color', what: 'Quick swatches show the design\'s current colors. Tap "…" to pick any DMC color. The picker remembers your last choice.' },
      { gesture: 'Eraser tool', what: 'Tap or drag to clear cells (sets them empty). Works inside patterns; no effect on empty canvas.' },
      { gesture: 'Undo', what: 'Tap the ↶ Undo button or press Cmd/Ctrl+Z. Undoes pen/eraser strokes and color changes. Up to 50 steps remembered.' },
    ],
  },
  {
    title: 'Zoom & pan',
    items: [
      { gesture: 'Pinch (iPad)', what: 'Two-finger pinch on the canvas. Zoom is anchored under your fingers.' },
      { gesture: 'Shift + scroll wheel (desktop)', what: 'Zooms the canvas. Plain scroll pans within the scroll container.' },
      { gesture: 'Zoom −/+/Fit (canvas foot)', what: 'Discrete zoom buttons. "Fit" snaps back to 100%.' },
    ],
  },
  {
    title: 'Canvas size',
    items: [
      { gesture: 'Cloth bar → Edit', what: 'Open the cloth/size/strands form. Choose your unit: cm, inches, or stitches.' },
      { gesture: 'Fit to content', what: 'Shrinks the canvas to a tight box around all placed motifs, with 4 stitches of padding on each side.' },
      { gesture: 'Auto-grow on overflow', what: 'If you place a motif larger than the canvas, a banner offers to grow the canvas to fit. Tap "Grow to fit" or dismiss.' },
    ],
  },
  {
    title: 'View toggles',
    items: [
      { gesture: '+ Patterns chip', what: 'Shows/hides the pattern library. Off by default to maximise canvas width.' },
      { gesture: '+ Inspector chip', what: 'Shows/hides the right rail with per-area controls.' },
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
