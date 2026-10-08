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
 * The card is drawn at its true size and the preview scales it with a
 * transform, so what you see on screen is exactly the geometry that reaches
 * the printer. In print the preview is hidden and the sheets are shown
 * instead: A4 pages with no margin of their own, every face at scale 1 at the
 * millimetre `card/sheet.ts` gives it, and the crop marks between.
 */
import { INK, RED } from '../diagram'

/** Tarot / oversized: the smallest card the turn and the moves fit on. */
export const CARD_WIDTH_MM = 70
export const CARD_HEIGHT_MM = 120
/** The paper it is printed on: A4 portrait. */
export const SHEET_WIDTH_MM = 210
export const SHEET_HEIGHT_MM = 297

export const CARD_CSS = `
.di-cards {
  --card-zoom: 1.75;
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
}
@media (max-width: 899px) {
  .di-cards { --card-zoom: 1.2; justify-content: center; }
}

.di-frame {
  width: calc(${CARD_WIDTH_MM}mm * var(--card-zoom));
  height: calc(${CARD_HEIGHT_MM}mm * var(--card-zoom));
  flex: none;
}

.di-card {
  width: ${CARD_WIDTH_MM}mm;
  height: ${CARD_HEIGHT_MM}mm;
  transform: scale(var(--card-zoom));
  transform-origin: top left;
  box-sizing: border-box;
  padding: 0 3mm 0;
  display: flex;
  flex-direction: column;
  gap: 0.9mm;
  background: #fff;
  color: ${INK};
  border: 0.3mm solid ${INK};
  overflow: hidden;
  font-family: var(--di-sans);
  font-size: 5.4pt;
  line-height: 1.2;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.di-card b { font-weight: 700; }

/* A flex column shrinks its children when they do not fit, which quietly
   squeezes a section instead of showing that the card is over budget. Nothing
   here shrinks: content that does not fit is content to cut. */
.di-card > * { flex: none; }

/* The title strip, full bleed: the game in paper on black, the face in a red block. */
.di-head {
  display: flex; align-items: stretch; margin: 0 -3mm; background: ${INK}; color: #fff;
  font-family: var(--di-display); text-transform: uppercase;
}
.di-head b { font-size: 8.6pt; font-weight: 600; letter-spacing: 0.05em; padding: 1.3mm 3mm 1.1mm; }
.di-head span {
  margin-left: auto; background: ${RED}; padding: 0 3mm; display: flex; align-items: center;
  font-size: 7pt; font-weight: 600; letter-spacing: 0.08em;
}

/* The goal: the one thing a first game must not forget. */
.di-goal { background: ${RED}; color: #fff; padding: 1.1mm 1.8mm 1.2mm; }
.di-goal strong {
  display: block; font-family: var(--di-display); font-weight: 700; font-size: 9.4pt;
  text-transform: uppercase; letter-spacing: 0.01em; line-height: 1;
}
.di-goal span { display: block; margin-top: 0.6mm; font-size: 5.2pt; line-height: 1.22; }

/* A section: its name in capitals on a heavy rule, with an aside on the right. */
.di-band {
  display: flex; align-items: baseline; gap: 1.5mm;
  font-family: var(--di-display); font-weight: 600; font-size: 6.6pt;
  letter-spacing: 0.08em; text-transform: uppercase;
  border-bottom: 0.55mm solid ${INK}; padding-bottom: 0.35mm; margin-bottom: 0.7mm;
}
.di-band em { margin-left: auto; font-style: normal; color: ${RED}; font-size: 5.6pt; letter-spacing: 0.06em; }
.di-sec { display: flex; flex-direction: column; }

/* The turn, as numbered rows. */
.di-steps { display: grid; grid-template-columns: 3.4mm 14.5mm 1fr; column-gap: 1.2mm; row-gap: 0.45mm; }
.di-steps i {
  font-style: normal; background: ${INK}; color: #fff; text-align: center;
  font-family: var(--di-display); font-weight: 700; font-size: 6.2pt; line-height: 3.2mm; height: 3.2mm;
}
.di-steps i.e { background: ${RED}; }
.di-steps u {
  text-decoration: none; font-family: var(--di-display); font-weight: 600; font-size: 6pt;
  text-transform: uppercase; letter-spacing: 0.02em; line-height: 1.05; padding-top: 0.3mm;
}
.di-steps span { font-size: 5.3pt; line-height: 1.2; padding-top: 0.2mm; }
.di-quiet {
  margin-top: 0.5mm; font-family: var(--di-display); font-weight: 600; font-size: 5.8pt;
  letter-spacing: 0.04em; text-transform: uppercase; color: ${RED};
}

/* Tables. One shape for all of them (CardTable): icon, name, numbers with
   energy first, then the text, at the same column widths on every face, so a
   column read in one table is the same column in the next. Numbers in the
   poster face so columns line up; words in the sans. */
.di-t { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 5.2pt; line-height: 1.15; }
.di-c-ic { width: 3.6mm; }
.di-c-k { width: 13mm; }
.di-c-n { width: 4.4mm; }
/* A number column is as narrow as its figures; its header may run left into the name's. */
.di-t th > span { display: inline-block; margin-left: -8mm; }
.di-t th {
  font-family: var(--di-display); font-weight: 600; font-size: 5pt; letter-spacing: 0.08em;
  text-transform: uppercase; text-align: right; white-space: nowrap;
  padding: 0 0 0.35mm 0; border-bottom: 0.3mm solid ${INK};
}
.di-t th:first-child { text-align: left; }
.di-t th.di-l { text-align: left; padding-left: 1.4mm; }
/* Under a table with the same columns the header is not repeated: it keeps the column
   widths and its rule, and prints nothing. */
.di-quiet-head th { font-size: 0; line-height: 0; padding: 0; border: 0; }
.di-t td { padding: 0.35mm 0 0.3mm 0; vertical-align: top; }
.di-t .n {
  font-family: var(--di-display); font-weight: 700; font-size: 6pt; text-align: right; white-space: nowrap;
  line-height: 1.05;
}
/* A long name takes two lines, as its text usually does. */
.di-t .k {
  font-family: var(--di-display); font-weight: 600; font-size: 6pt; text-transform: uppercase;
  letter-spacing: 0.02em; line-height: 1.05;
}
.di-t .di-ic { padding-top: 0.3mm; }
.di-t td.di-w { padding-left: 1.4mm; }
.di-t tbody tr + tr td { border-top: 0.15mm solid #bbb; }
.di-t .r { color: ${RED}; }

/* Phasing, as the sectors a burn can land on and what each costs. */
.di-phase { display: flex; align-items: center; gap: 1.2mm; margin-top: 0.9mm; }
.di-phase b {
  font-family: var(--di-display); font-weight: 600; font-size: 5.4pt; letter-spacing: 0.04em;
  text-transform: uppercase; flex: none; width: 10.5mm;
}
.di-phase-strip { flex: none; display: block; }
.di-phase-note { font-size: 4.8pt; line-height: 1.2; }

/* A line of qualification under a table, where the table cannot hold it. */
.di-fine { font-size: 5pt; line-height: 1.25; margin-top: 0.7mm; }

/* The d10, as ten faces you can point at: the same shading as the cheatsheet. */
.di-roll { display: grid; grid-template-columns: repeat(10, 1fr); gap: 0.6mm; margin-bottom: 0.8mm; }
.di-roll span {
  position: relative; text-align: center; font-family: var(--di-display); font-weight: 700;
  font-size: 7pt; line-height: 4.2mm; height: 4.2mm; box-sizing: border-box; overflow: hidden;
}
.di-roll .di-miss { border: 0.3mm solid ${INK}; color: ${INK}; line-height: 3.6mm; }
.di-roll .di-hit { background: ${INK}; color: #fff; }
.di-roll .di-crit { background: ${RED}; color: #fff; }
.di-roll .di-sensor { background: ${INK}; color: #fff; box-shadow: inset 0 -0.9mm 0 ${RED}; }

/* Short facts, one per line, label then value. */
.di-notes { display: flex; flex-direction: column; gap: 0.55mm; font-size: 5.2pt; }
.di-notes div { display: flex; gap: 1.2mm; }
.di-notes b {
  font-family: var(--di-display); font-weight: 600; font-size: 5.4pt; letter-spacing: 0.04em;
  text-transform: uppercase; flex: none; width: 10.5mm; padding-top: 0.1mm;
}
.di-notes span { flex: 1; }

/* The heat check, as a tree: the sum forks three ways and every branch joins
   again for the dissipation and the carry. The fork's bars run from the middle
   of its first row to the middle of its last, which is why a row has a fixed
   height. */
.di-tree { display: flex; align-items: center; }
.di-tree span {
  border: 0.3mm solid ${INK}; padding: 0.4mm 0.8mm; font-size: 5pt; line-height: 1.15;
  flex: none;
}
.di-tree span.x { background: ${RED}; border-color: ${RED}; color: #fff; }
.di-tree span.k { background: ${INK}; color: #fff; }
.di-tree i { font-style: normal; flex: none; }
.di-tree i.l { width: 1.4mm; border-top: 0.3mm solid ${INK}; }
.di-tree i.a { font-family: var(--di-display); font-weight: 700; font-size: 6pt; padding: 0 0.6mm; }
.di-fork { position: relative; display: flex; flex-direction: column; gap: 0.6mm; padding: 0 1.4mm; flex: none; }
.di-fork::before, .di-fork::after {
  content: ''; position: absolute; top: 1.35mm; bottom: 1.35mm; border-left: 0.3mm solid ${INK};
}
.di-fork::before { left: 0; }
.di-fork::after { right: 0; }
.di-fork span {
  position: relative; box-sizing: border-box; height: 3mm;
  display: flex; align-items: center; white-space: nowrap;
}
.di-fork span::before, .di-fork span::after {
  content: ''; position: absolute; top: calc(50% - 0.15mm); width: 1.4mm; border-top: 0.3mm solid ${INK};
}
.di-fork span::before { left: calc(-1.4mm - 0.3mm); }
.di-fork span::after { right: calc(-1.4mm - 0.3mm); }

/* The printed pages: hidden on screen, and drawn to the millimetre in print. */
.di-sheets { display: none; --card-zoom: 1; }
.di-page {
  position: relative; width: ${SHEET_WIDTH_MM}mm; height: ${SHEET_HEIGHT_MM}mm;
  overflow: hidden; background: #fff;
}
.di-page + .di-page { break-before: page; }
.di-marks { position: absolute; left: 0; top: 0; }
.di-slot { position: absolute; width: ${CARD_WIDTH_MM}mm; height: ${CARD_HEIGHT_MM}mm; }
.di-slot.di-turned { transform: rotate(180deg); }

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
