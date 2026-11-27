/**
 * The card's own stylesheet.
 *
 * Everything else in this app is styled through emotion, and this is the one
 * place that cannot be: a printed card needs `@page`, millimetres and a
 * guarantee that nothing inherits the page it is previewed on. So the card is
 * plain CSS with its own prefix, injected once by the page that shows it.
 *
 * It is printed the way the site is drawn (`design/press.ts`): black ink and
 * one red on white stock, condensed capitals for everything that is a label,
 * solid blocks and rules, no radius. Two colours survive a black-and-white
 * printer too: the red prints as a mid grey and every red block still reads.
 *
 * The card is cut 102x152 (`print/frame.ts`) with a band of solid ink at
 * its edge, so a cut off its line, or a back that a duplex printer shifts off
 * its front, lands on ink and not on a sliver of paper. Inside the band the
 * printed face is drawn at scale 1 and zoomed by `CARD_SCALE` to fill it: the
 * head strip and the sections' rules run into the band and join it, and the
 * words keep `PLAYER_PAD` of paper off it.
 *
 * The card is drawn at its true size and the preview scales it with a
 * transform, so what you see on screen is exactly the geometry that reaches
 * the printer. In print the preview is hidden and the sheets are shown
 * instead: A4 pages with no margin of their own, every face at true size at the
 * millimetre `card/sheet.ts` gives it, and the crop marks round it.
 */
import { INK, RED } from '../diagram'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, CLEAR_MM, INSIDE_MM } from '../print/frame'
import type { Face } from './sheet'

/**
 * The plain frame of paper round every printed face of the loadout cards and
 * the mission decks, between its ink and the cut: a cut that misses its line,
 * or a back the duplex shifts off its front, lands in it.
 */
export const FRONT_FRAME_MM = 2.5
/** The height each face's content needs at scale 1, measured: the head, then the turn and the moves, or the fight. */
export const PLAYER_CONTENT: Record<Face, number> = { front: 119.4, back: 116.6 }
/** The paper round the faces' words, as printed: the band's clearance and a little more. */
export const PLAYER_PAD = { x: 2.5, bottom: CLEAR_MM + 0.5 }
/** How much larger than drawn the faces print: the largest scale at which both fill their band. */
export const CARD_SCALE = Math.min(
  ...(['front', 'back'] as Face[]).map(
    f => (INSIDE_MM[f].height - PLAYER_PAD.bottom) / PLAYER_CONTENT[f]
  )
)
/** A face's printed box inside its band, as drawn at scale 1. */
export function playerBox(face: Face) {
  return { width: INSIDE_MM[face].width / CARD_SCALE, height: INSIDE_MM[face].height / CARD_SCALE }
}
/** The width a face's words and drawings span, as drawn at scale 1. */
export const playerWidth = (face: Face) => playerBox(face).width - (2 * PLAYER_PAD.x) / CARD_SCALE
/** The paper it is printed on: A4 portrait. */
export const SHEET_WIDTH_MM = 210
export const SHEET_HEIGHT_MM = 297

export const CARD_CSS = `
.di-cards {
  --card-zoom: 1.3;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
}
@media (max-width: 899px) {
  .di-cards { --card-zoom: 0.9; justify-content: center; }
}

.di-frame {
  width: calc(${CARD_WIDTH_MM}mm * var(--card-zoom));
  height: calc(${CARD_HEIGHT_MM}mm * var(--card-zoom));
  flex: none;
}

/* The card as it is cut: the band of ink and the paper inside it (frameStyle in print/frame.ts). */
.di-trim {
  transform: scale(var(--card-zoom));
  transform-origin: top left;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* The printed face, drawn at PLAYER_CONTENT's scale and zoomed into the frame. Zoom, not a
   transform: a transformed box keeps its unscaled size in print layout. */
.di-scaled { zoom: ${CARD_SCALE}; }
.di-card {
  box-sizing: border-box;
  padding: 0 ${PLAYER_PAD.x / CARD_SCALE}mm ${PLAYER_PAD.bottom / CARD_SCALE}mm;
  display: flex;
  flex-direction: column;
  gap: 0.9mm;
  color: ${INK};
  overflow: hidden;
  font-family: var(--di-sans);
  font-size: 5.6pt;
  line-height: 1.2;
}
.di-card b { font-weight: 700; }

/* A flex column shrinks its children when they do not fit, which quietly
   squeezes a section instead of showing that the card is over budget. Nothing
   here shrinks: content that does not fit is content to cut. */
.di-card > * { flex: none; }

/* The title strip, across the printed face: the game in paper on black, the face in a red block. */
.di-head {
  display: flex; align-items: stretch; margin: 0 -${PLAYER_PAD.x / CARD_SCALE}mm; background: ${INK}; color: #fff;
  font-family: var(--di-display); text-transform: uppercase;
}
.di-head b { font-size: 8.6pt; font-weight: 600; letter-spacing: 0.05em; padding: 1.3mm 3mm 1.1mm ${PLAYER_PAD.x / CARD_SCALE}mm; }
.di-head span {
  margin-left: auto; background: ${RED}; padding: 0 ${PLAYER_PAD.x / CARD_SCALE}mm 0 3mm; display: flex; align-items: center;
  font-size: 7pt; font-weight: 600; letter-spacing: 0.08em;
}

/* The faces' lists, rules and drawings (CardFaces.tsx). Every drawing is an
   svg in millimetres (pictos.tsx); these set the words round them. A
   section's rule runs out to the band on both sides and joins it, as the
   head strip does; its words stay in line with the rest. */
.di-card p { margin: 0; font-size: 5.4pt; }
.cs-sec {
  display: flex; align-items: baseline; justify-content: space-between; gap: 2mm;
  border-bottom: 0.5mm solid ${INK}; padding: 0 ${PLAYER_PAD.x / CARD_SCALE}mm 0.3mm;
  margin: 0.4mm -${PLAYER_PAD.x / CARD_SCALE}mm 0;
  font-family: var(--di-display); font-weight: 700; text-transform: uppercase;
  font-size: 7pt; letter-spacing: 0.04em; line-height: 1;
}
.cs-sec em { font-style: normal; font-weight: 500; font-size: 5.6pt; letter-spacing: 0.03em; color: ${RED}; }
.cs-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.9mm; }
.cs-list li { display: grid; grid-template-columns: 7.2mm 1fr; column-gap: 1.3mm; align-items: center; }
.cs-list li > svg { margin-top: 0.15mm; }
.cs-list p { line-height: 1.17; }
.cs-n {
  display: inline-block; font-style: normal; background: ${INK}; color: #fff; width: 2.6mm; height: 2.6mm;
  line-height: 2.6mm; text-align: center; font-family: var(--di-display); font-weight: 700; font-size: 5.8pt;
  margin-right: 0.8mm; vertical-align: 0.05mm;
}
.cs-red .cs-n { background: ${RED}; }
.cs-t {
  font-family: var(--di-display); font-weight: 700; text-transform: uppercase; font-size: 6.2pt;
  letter-spacing: 0.03em; margin-right: 0.8mm;
}
.cs-red .cs-t { color: ${RED}; }
.cs-quiet { color: ${RED}; font-weight: 600; line-height: 1.17; }
.cs-row { display: flex; align-items: center; gap: 1.2mm; }
.cs-row p { line-height: 1.15; }
.cs-sees {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
  grid-auto-rows: 1fr; column-gap: 1.6mm; row-gap: 1.4mm; align-items: center;
}
.cs-sees p { line-height: 1.15; }
.cs-roomy { gap: 3.2mm; }
.cs-roomy p { font-size: 6pt; }
.cs-roomy .cs-sees { row-gap: 4.2mm; }

/* The printed pages of every print on the page (print/PrintPages.tsx):
   hidden on screen, and every card drawn to the millimetre, at scale 1, in print. */
.di-sheets { display: none; --card-zoom: 1; --lo-zoom: 1; --mc-zoom: 1; --sx-zoom: 1; }
.di-page {
  position: relative; width: ${SHEET_WIDTH_MM}mm; height: ${SHEET_HEIGHT_MM}mm;
  overflow: hidden; background: #fff;
}
.di-page + .di-page { break-before: page; }
.di-marks { position: absolute; left: 0; top: 0; }
.di-slot { position: absolute; }
.di-turn { transform-origin: top left; }

@media print {
  .di-cards { display: none !important; }
  .di-sheets { display: block; }
  /* The app fills the window on screen; a printed document is as tall as its pages. */
  html, body, #root { height: auto !important; }
  .site-page { min-height: 0 !important; overflow: visible !important; }
  .site-only, .di-screen-only { display: none !important; }
  /* The page around the cards is paper-coloured on screen. The printed sheet
     is the stock, so it is told to be white. */
  html, body, .site-page, .di-print-area { background: #fff !important; }
  .di-print-area { border: 0 !important; }
  .di-print { max-width: none !important; padding: 0 !important; margin: 0 !important; }
}
`

export const CARD_PAGE_CSS = `
@page { size: A4 portrait; margin: 0; }
`
