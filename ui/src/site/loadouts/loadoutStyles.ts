/**
 * The loadout cards' own stylesheet, injected with the player card's by the
 * page that shows both (`Cheatsheet.tsx`), for the same reason: a printed
 * card needs millimetres and print media, and must not inherit the page it is
 * previewed on (see `card/cardStyles.ts`).
 *
 * The poster cut: the role's family ink in a stripe up the left with the
 * preset's name in it, the insignia top right, the bow large, the four side
 * slots in two columns, and the missions it is kept with in the black bar.
 * Printed in colour on the press's paper. Drawn at true size; the preview
 * scales it with a transform.
 *
 * Which sheets print is the page's call: the player card's unless the body
 * says `data-printing="loadouts"` (set by this section's print button only
 * while it prints), so Ctrl+P and the player card's button print as before.
 */
import { FONT_BODY, FONT_DISPLAY, PRESS } from '../../design/press'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM } from './sheet'

/** The black bar across the foot. */
const BAR_MM = 18.5
/** The family stripe up the left. */
const STRIPE_MM = 14

export const LOADOUT_CSS = `
/* A role's four cards: in one row on a wide column, two by two below it, one
   at a time on a phone. Each zoom is the largest at which its width range
   fits that many cards and no more, so no row is left with an orphan. */
.di-lo-row { display: flex; flex-wrap: wrap; gap: 16px; --lo-zoom: 1.04; }
@media (max-width: 1119px) { .di-lo-row { --lo-zoom: 1.5; } }
@media (max-width: 899px) { .di-lo-row { --lo-zoom: 1.3; } }
@media (max-width: 749px) { .di-lo-row { --lo-zoom: 1.05; } }
@media (max-width: 599px) { .di-lo-row { --lo-zoom: 1.2; justify-content: center; } }

.di-lo-frame {
  width: calc(${LOADOUT_WIDTH_MM}mm * var(--lo-zoom));
  height: calc(${LOADOUT_HEIGHT_MM}mm * var(--lo-zoom));
  flex: none;
}
.di-lo-card {
  position: relative;
  width: ${LOADOUT_WIDTH_MM}mm;
  height: ${LOADOUT_HEIGHT_MM}mm;
  transform: scale(var(--lo-zoom));
  transform-origin: top left;
  box-sizing: border-box;
  overflow: hidden;
  background: ${PRESS.paper};
  color: ${PRESS.ink};
  font-family: ${FONT_DISPLAY};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.di-lo-card * { box-sizing: border-box; }
/* The edge on screen only: the sheet is cut at its marks. */
.di-lo-row .di-lo-card { outline: 1px solid ${PRESS.inkFaint}; }
/* Nothing on the card shrinks: content that does not fit is content to cut. */
.di-lo-card > *, .di-lo-col > *, .di-lo-bow > *, .di-lo-cell > *, .di-lo-bar > *, .di-lo-keep > * { flex: none; }

.di-lo-stripe {
  position: absolute; left: 0; top: 0; bottom: ${BAR_MM}mm; width: ${STRIPE_MM}mm;
  display: flex; align-items: center; justify-content: center;
}
.di-lo-name {
  writing-mode: vertical-rl; transform: rotate(180deg);
  font-size: 10.5mm; font-weight: 700; text-transform: uppercase;
  line-height: 0.9; letter-spacing: 0.005em; white-space: nowrap;
}
.di-lo-insignia { position: absolute; right: 3mm; top: 3mm; width: 9mm; height: 9mm; display: block; }

.di-lo-col { position: absolute; left: ${STRIPE_MM + 3}mm; right: 3mm; top: 3.5mm; display: flex; flex-direction: column; }
.di-lo-eyebrow {
  font-size: 2.5mm; letter-spacing: 0.16em; font-weight: 500; text-transform: uppercase; line-height: 1;
}
.di-lo-bow { display: flex; align-items: center; gap: 2.5mm; margin-top: 2.2mm; }
.di-lo-bowtile {
  position: relative; width: 17mm; height: 17mm; background: ${PRESS.ink}; color: ${PRESS.paper};
  display: flex; align-items: center; justify-content: center;
}
.di-lo-bowtile .di-lo-chip { background: ${PRESS.paper}; color: ${PRESS.ink}; }
/* The one box that takes the room left: the bow's name wraps in it, a word never squeezes. */
.di-lo-bow > .di-lo-bowname {
  flex: 1 1 0;
  font-size: 3mm; text-transform: uppercase; font-weight: 600; line-height: 1.05; letter-spacing: 0.02em;
}
.di-lo-bowname .di-lo-eyebrow { font-size: 1.9mm; color: ${PRESS.inkSoft}; margin-top: 1mm; }

.di-lo-flanks { display: grid; grid-template-columns: 1fr 1fr; gap: 1.1mm 2mm; margin-top: 3mm; }
.di-lo-flanks > .di-lo-eyebrow { font-size: 1.9mm; border-bottom: 0.5mm solid ${PRESS.ink}; padding-bottom: 0.8mm; }
.di-lo-cell { display: flex; flex-direction: column; align-items: center; gap: 0.7mm; min-width: 0; }
.di-lo-tile {
  position: relative; width: 10.5mm; height: 10.5mm; border: 0.4mm solid ${PRESS.ink};
  background: ${PRESS.paper}; display: flex; align-items: center; justify-content: center;
}
.di-lo-label {
  font-size: 2mm; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.08;
  font-weight: 500; text-align: center;
}
.di-lo-chip {
  position: absolute; left: 0; top: 0; background: ${PRESS.ink}; color: ${PRESS.paper};
  font-size: 2mm; padding: 0.25mm 0.6mm; line-height: 1; font-weight: 600; letter-spacing: 0.04em;
}
.di-lo-mark { display: block; }

.di-lo-bar {
  position: absolute; left: 0; right: 0; bottom: 0; height: ${BAR_MM}mm;
  background: ${PRESS.ink}; color: ${PRESS.paper}; padding: 2.2mm 3.5mm;
  display: flex; flex-direction: column; gap: 1.3mm;
}
.di-lo-keep { display: flex; align-items: center; gap: 1mm; flex-wrap: wrap; }
.di-lo-mission {
  display: inline-flex; align-items: center; gap: 0.8mm; font-size: 2.4mm;
  text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; line-height: 1;
}
.di-lo-mission.di-lo-or { font-weight: 400; }
.di-lo-mission i {
  display: flex; width: 5.4mm; height: 5.4mm; align-items: center; justify-content: center; color: ${PRESS.ink};
}
.di-lo-mission i svg { width: 4.2mm; height: 4.2mm; display: block; }
.di-lo-line { font-family: ${FONT_BODY}; font-size: 2.2mm; line-height: 1.32; color: ${PRESS.paperSoft}; }

/* The printed pages: hidden on screen, every card at scale 1 in print. */
.di-lo-sheets { display: none; --lo-zoom: 1; }
.di-lo-slot { position: absolute; width: ${LOADOUT_WIDTH_MM}mm; height: ${LOADOUT_HEIGHT_MM}mm; }

@media print {
  .di-lo-rows { display: none !important; }
  .di-lo-sheets { display: block; }
  /* One print at a time: the player card's, unless this section's button asked. */
  #loadouts { display: none !important; }
  body[data-printing="loadouts"] #loadouts { display: block !important; }
  body[data-printing="loadouts"] #card { display: none !important; }
}
`
