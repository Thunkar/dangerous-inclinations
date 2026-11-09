/**
 * The range cards' own stylesheet, injected with the loadout cards' by the
 * page that shows both (`Cheatsheet.tsx`). A range card is a loadout card
 * (`loadouts/loadoutStyles.ts`) in its stock, its stripe, its name and its
 * bar, and takes those classes as they are; this adds what differs: the mark
 * over the name, the fan, the numbers, the key.
 *
 * Which sheets print is the page's call: the player card's unless the body
 * says `data-printing="ranges"`, set by this section's button only while it
 * prints.
 */
import { FONT_BODY, FONT_DISPLAY, PRESS } from '../../design/press'

const BAR_MM = 18.5
const STRIPE_MM = 14

export const RANGE_CSS = `
.di-rg-stripe { flex-direction: column; justify-content: flex-start; gap: 3mm; padding-top: 3mm; }
.di-rg-mark { width: 9mm; height: 9mm; display: block; flex: none; }

.di-rg-fanbox { position: absolute; left: ${STRIPE_MM}mm; right: 0; top: 0; bottom: ${BAR_MM}mm; overflow: hidden; }
.di-rg-fan { display: block; }
.di-rg-step { font-family: ${FONT_DISPLAY}; font-weight: 700; }

.di-rg-top { position: absolute; left: ${STRIPE_MM + 3}mm; top: 3.5mm; display: flex; flex-direction: column; }
/* The fan leaves the left a narrow column: each number under its label, one above the other. */
.di-rg-stat { display: flex; flex-direction: column; margin-top: 2mm; }
.di-rg-stat span { font-size: 1.9mm; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 500; color: ${PRESS.inkSoft}; line-height: 1; }
.di-rg-stat b { font-size: 8.5mm; font-weight: 700; line-height: 1; margin-top: 0.6mm; }

.di-rg-keys {
  position: absolute; left: ${STRIPE_MM + 3}mm; bottom: ${BAR_MM + 2.6}mm;
  display: flex; flex-direction: column; gap: 0.9mm;
}
.di-rg-key {
  display: flex; align-items: center; gap: 1.2mm; font-size: 1.9mm; font-weight: 500;
  letter-spacing: 0.1em; text-transform: uppercase; line-height: 1;
}
.di-rg-key i { width: 2.6mm; height: 2.6mm; flex: none; box-sizing: border-box; }

.di-rg-bar { justify-content: center; }
.di-rg-line { font-family: ${FONT_BODY}; font-size: 2.45mm; line-height: 1.3; color: ${PRESS.paper}; }

@media print {
  #ranges { display: none !important; }
  body[data-printing="ranges"] #ranges { display: block !important; }
  body[data-printing="ranges"] #card { display: none !important; }
}
`
