/**
 * The mission decks' own stylesheet, injected with the player card's by the
 * page that shows them (`Cheatsheet.tsx`), for the same reason: a printed
 * card needs millimetres and print media (see `card/cardStyles.ts`).
 *
 * A front is the game's `MissionCard` at its full cut, 168x235 px, scaled by
 * a transform to the 63x88mm stock. The two are 5:7 within 0.2%, so the
 * scale is taken on each axis and the card fills the trim exactly. A back is
 * drawn in millimetres and runs to the trim (`backs.tsx`).
 */
import { PRESS } from '../../design/press'
import { MISSION_HEIGHT_MM, MISSION_WIDTH_MM } from './sheet'

/** The full cut of `MissionCard`, in CSS pixels. */
const FRONT_WIDTH_PX = 168
const FRONT_HEIGHT_PX = 235
const MM_PER_PX = 25.4 / 96
const FRONT_SCALE_X = MISSION_WIDTH_MM / (FRONT_WIDTH_PX * MM_PER_PX)
const FRONT_SCALE_Y = MISSION_HEIGHT_MM / (FRONT_HEIGHT_PX * MM_PER_PX)

export const MISSION_DECK_CSS = `
/* A pile on screen: every card in deck order, its back first. */
.di-mc-row { display: flex; flex-wrap: wrap; gap: 12px; --mc-zoom: 0.8; }
@media (max-width: 899px) { .di-mc-row { --mc-zoom: 0.7; } }
@media (max-width: 599px) { .di-mc-row { --mc-zoom: 0.62; justify-content: center; } }

.di-mc-frame {
  width: calc(${MISSION_WIDTH_MM}mm * var(--mc-zoom));
  height: calc(${MISSION_HEIGHT_MM}mm * var(--mc-zoom));
  flex: none;
}
.di-mc-card {
  position: relative;
  width: ${MISSION_WIDTH_MM}mm;
  height: ${MISSION_HEIGHT_MM}mm;
  transform: scale(var(--mc-zoom));
  transform-origin: top left;
  box-sizing: border-box;
  overflow: hidden;
  background: ${PRESS.paper};
  color: ${PRESS.ink};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.di-mc-card * { box-sizing: border-box; }
.di-mc-row .di-mc-back { outline: 1px solid ${PRESS.inkFaint}; outline-offset: -1px; }

.di-mc-front {
  width: ${FRONT_WIDTH_PX}px;
  height: ${FRONT_HEIGHT_PX}px;
  transform: scale(${FRONT_SCALE_X.toFixed(5)}, ${FRONT_SCALE_Y.toFixed(5)});
  transform-origin: top left;
}

/* The preview: in print only the pages are left. */
@media print {
  .di-mc-rows { display: none !important; }
}
`
