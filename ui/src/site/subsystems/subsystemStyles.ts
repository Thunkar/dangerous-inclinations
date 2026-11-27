/**
 * The subsystems card's stylesheet, injected with the other prints' by the
 * page that shows them (`Cheatsheet.tsx`): the loadout cards' press
 * (`loadouts/loadoutStyles.ts`), in colour on the press's paper inside the
 * card's band of ink (`print/frame.ts`). Every face is drawn at its true size
 * in millimetres and previewed through `--sx-zoom`.
 */
import { FONT_BODY, FONT_DISPLAY, PRESS } from '../../design/press'
import { SX_GAP_MM, SX_SCALE, TILE } from './sheet'

/** A gutter, in the tiles' millimetres: the black round the key, as round every tile. */
const GUTTER = SX_GAP_MM / SX_SCALE

export const SUBSYSTEM_CSS = `
/* The two faces side by side on a wide column, one under the other below it. */
.sx-faces { display: flex; flex-wrap: wrap; gap: 32px; --sx-zoom: 1.25; }
@media (max-width: 899px) { .sx-faces { --sx-zoom: 1.2; justify-content: center; } }
@media (max-width: 599px) { .sx-faces { --sx-zoom: 0.85; } }
.sx-frame { flex: none; }

.sx-face {
  position: relative; transform: scale(var(--sx-zoom)); transform-origin: top left;
  box-sizing: border-box; background: ${PRESS.ink}; color: ${PRESS.ink};
  font-family: ${FONT_DISPLAY};
  --di-display: ${FONT_DISPLAY};
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.sx-face * { box-sizing: border-box; }
/* Nothing on a card shrinks: what does not fit is cut. */
.sx-face * { flex-shrink: 0; }
.sx-face b { font-weight: 700; }

.sx-grid { display: grid; }
/* The band is the tile's top edge; the border runs round the body, and the numbers fill the band's corner on a slab of paper. */
.sx-tile { position: relative; overflow: hidden; display: flex; flex-direction: column; background: ${PRESS.paper}; }
.sx-band { height: ${TILE.band}mm; display: flex; align-items: center; gap: 1.1mm; padding: 0 0 0 1.1mm; color: ${PRESS.paper}; }
.sx-band .sx-name { font-size: 3.3mm; font-weight: 700; text-transform: uppercase; line-height: 1; letter-spacing: 0.02em; white-space: nowrap; }
.sx-numbers { margin-left: auto; align-self: stretch; background: ${PRESS.paper}; color: ${PRESS.ink}; padding: 0 0.8mm 0 0.6mm; display: flex; align-items: center; }
.sx-tilebody { flex: 1; display: flex; flex-direction: column; padding: ${TILE.pad.top}mm ${TILE.pad.x}mm ${TILE.pad.bottom}mm; gap: ${TILE.gap}mm; border: ${TILE.border}mm solid; border-top: 0; }
.sx-line { display: flex; align-items: center; justify-content: space-between; height: ${TILE.line}mm; }
.sx-slot { font-size: 1.75mm; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; color: ${PRESS.ink}; white-space: nowrap; }
.sx-chip { display: flex; align-items: center; gap: 0.7mm; }
.sx-chip b { font-size: 2.82mm; line-height: 1; }
.sx-chip i { font-style: normal; font-size: 1.7mm; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 500; color: ${PRESS.ink}; }
.sx-faceup { display: flex; align-items: center; gap: 0.7mm; font-size: 1.75mm; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; color: ${PRESS.ink}; white-space: nowrap; }
.sx-draw { position: relative; display: flex; justify-content: center; align-items: flex-end; }
.sx-corner { position: absolute; left: 0; top: 0; gap: 0.15mm; color: ${PRESS.red}; }
.sx-corner-right { left: auto; right: 0; }
.sx-corner b { margin-left: 0.6mm; color: ${PRESS.ink}; font-size: 3mm; }
.sx-sentence { font-family: ${FONT_BODY}; font-size: 1.95mm; line-height: 1.22; }
.sx-facing { position: relative; flex: 1; }
.sx-aside { position: absolute; right: 0; bottom: 0; }

/* The title cell is the lattice's ink, and its key a pane of paper a gutter in from its edges; the title lines up with the key's words. */
.sx-titletile { position: relative; overflow: hidden; background: ${PRESS.ink}; color: ${PRESS.paper}; padding: 2.2mm ${GUTTER}mm ${GUTTER}mm; display: flex; flex-direction: column; }
/* The red wedge through the title's top right corner, past the cell's edge. */
.sx-titletile .sx-wedge { position: absolute; top: -2mm; right: -2.67mm; width: 9mm; height: 11mm; background: ${PRESS.red}; }
.sx-titletile .sx-title { position: relative; padding-left: 1.6mm; font-size: 6.3mm; font-weight: 700; text-transform: uppercase; line-height: 0.9; letter-spacing: 0.01em; }
.sx-titletile .sx-sub { position: relative; padding-left: 1.6mm; margin-top: 1.4mm; font-size: 1.8mm; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 500; line-height: 1.2; }
.sx-key { margin-top: auto; background: ${PRESS.paper}; color: ${PRESS.ink}; padding: 1.4mm 1.6mm; display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 1.6mm; font-size: 1.8mm; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 500; }
.sx-key span { display: flex; align-items: center; gap: 0.9mm; white-space: nowrap; }
.sx-key span:last-child { grid-column: 1 / -1; }

/* The preview: in print only the pages are left. */
@media print {
  .sx-faces { display: none !important; }
}
`
