/**
 * The parts every print on the cheatsheet page shares (`print.ts` says which
 * one prints): the section around a print, with its words, its controls and
 * its button; the title over a row of cards on screen; and the A4 pages,
 * hidden on screen, each card at scale 1 at the millimetre its sheet puts it
 * and the cut lines drawn under them on the pages of fronts (`card/sheet.ts`).
 */
import type { CSSProperties, ReactNode } from 'react'
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Kicker, Slab } from '../poster'
import { COLUMN } from '../guide/parts'
import { INK } from '../diagram'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { CUT_BAND_MM, cropMarks, type PlacedFace, type Rect } from '../card/sheet'
import type { Flip } from '../missions/sheet'
import { Segments } from '../tools/controls'
import { FRAME_BLEED_MM, MARK_FROM_MM } from './frame'
import { printAs, type PrintName } from './print'

/** A face's frame run `FRAME_BLEED_MM` past its cut on every side, under it. */
function Bleed({ face, color }: { face: Rect; color: string }) {
  return (
    <div
      className="di-slot"
      style={{
        left: `${face.x - FRAME_BLEED_MM}mm`,
        top: `${face.y - FRAME_BLEED_MM}mm`,
        width: `${face.width + 2 * FRAME_BLEED_MM}mm`,
        height: `${face.height + 2 * FRAME_BLEED_MM}mm`,
        background: color,
      }}
    />
  )
}

/**
 * A face turned in its slot, about its top left corner and moved back into
 * the slot: what is drawn upright `width` by `height` lies in a slot of the
 * slot's own size, a quarter turn in a slot as wide as it is tall.
 */
function turnStyle({ turn, width, height }: PlacedFace): CSSProperties {
  const sideways = turn === 90 || turn === 270
  const move = { 90: `${width}mm, 0`, 180: `${width}mm, ${height}mm`, 270: `0, ${height}mm` }[
    turn as 90 | 180 | 270
  ]
  return {
    width: `${sideways ? height : width}mm`,
    height: `${sideways ? width : height}mm`,
    transform: `translate(${move}) rotate(${turn}deg)`,
  }
}

/**
 * The printed pages: every face in its slot, turned where the flip turns it.
 * A card with a frame of its own colour (`bleed`, `frame.ts`) has the frame
 * run `FRAME_BLEED_MM` past every face, under it, so a cut that misses its
 * line outward lands on the frame too; its crop marks start past that.
 */
export function PrintPages<F extends PlacedFace>({
  pages,
  bleed,
  children,
}: {
  pages: F[][]
  bleed?: string
  children: (face: F) => ReactNode
}) {
  return (
    <div className="di-sheets">
      {pages.map((faces, page) => (
        <div key={page} className="di-page">
          {bleed && faces.map((face, i) => <Bleed key={i} face={face} color={bleed} />)}
          {/* The cards are cut from the fronts; a back page's marks would be off by the duplex. */}
          {faces.some(f => f.face === 'front') && (
            <svg
              className="di-marks"
              width={`${SHEET_WIDTH_MM}mm`}
              height={`${SHEET_HEIGHT_MM}mm`}
              viewBox={`0 0 ${SHEET_WIDTH_MM} ${SHEET_HEIGHT_MM}`}
              aria-hidden
            >
              {cropMarks(faces, bleed ? MARK_FROM_MM : undefined).map((m, i) => (
                <g key={i}>
                  <line
                    x1={m.x1}
                    y1={m.y1}
                    x2={m.x2}
                    y2={m.y2}
                    stroke={PRESS.inkFaint}
                    strokeWidth={CUT_BAND_MM}
                  />
                  <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={INK} strokeWidth={0.2} />
                </g>
              ))}
            </svg>
          )}
          {faces.map((face, i) => (
            <div
              key={i}
              className="di-slot"
              style={{
                left: `${face.x}mm`,
                top: `${face.y}mm`,
                width: `${face.width}mm`,
                height: `${face.height}mm`,
              }}
            >
              {face.turn === 0 ? (
                children(face)
              ) : (
                <div className="di-turn" style={turnStyle(face)}>
                  {children(face)}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * A print's section: on screen its words, `controls` beside the print
 * button and `note` under them, then `children` (the preview and the pages).
 * In print only the pages are left.
 */
export function PrintSection({
  name,
  kicker,
  title,
  lede,
  controls,
  print,
  note,
  children,
}: {
  name: PrintName
  kicker: ReactNode
  title: ReactNode
  lede: ReactNode
  controls: ReactNode
  print: ReactNode
  note: ReactNode
  children: ReactNode
}) {
  return (
    <Box
      component="section"
      id={name}
      className="di-print-area"
      aria-labelledby={`${name}-title`}
      sx={{ bgcolor: PRESS.paper, borderTop: `8px solid ${PRESS.ink}`, scrollMarginTop: 64 }}
    >
      <Box className="di-print" sx={{ ...COLUMN, py: { xs: 5, sm: 7 } }}>
        <Box className="di-screen-only" sx={{ mb: 4 }}>
          <Kicker>{kicker}</Kicker>
          <Box id={`${name}-title`}>
            <Display component="h2" size={{ xs: '2.4rem', sm: '3.4rem' }} sx={{ mt: 0.75 }}>
              {title}
            </Display>
          </Box>
          <Body size={{ xs: '1.02rem', sm: '1.12rem' }} sx={{ mt: 1.5 }}>
            {lede}
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mt: 3 }}>
            {controls}
            <Slab tone="red" onClick={() => printAs(name)}>
              <PrintIcon sx={{ fontSize: 20 }} />
              {print}
            </Slab>
          </Box>
          <Body size="0.92rem" color={PRESS.inkSoft} sx={{ maxWidth: '62ch', mt: 1.5 }}>
            {note}
          </Body>
        </Box>
        {children}
      </Box>
    </Box>
  )
}

/** The title over a row of cards on screen, behind a square of the row's `ink` if it has one. */
export function RowTitle({ ink, children }: { ink?: string; children: ReactNode }) {
  return (
    <Box
      component="h3"
      sx={{
        ...(ink && { display: 'flex', alignItems: 'center', gap: 1.25 }),
        m: 0,
        mb: 1.5,
        fontFamily: FONT_DISPLAY,
        fontWeight: 600,
        fontSize: '1.3rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {ink && <Box component="span" sx={{ width: 14, height: 14, bgcolor: ink, flex: 'none' }} />}
      {children}
    </Box>
  )
}

/** Which edge a double-sided print turns over on. */
export function FlipChoice({
  flip,
  labels,
  onChange,
}: {
  flip: Flip
  labels: Record<Flip, string>
  onChange: (flip: Flip) => void
}) {
  return (
    <Segments
      value={flip}
      options={(['long', 'short'] as const).map(value => ({ value, label: labels[value] }))}
      onChange={onChange}
    />
  )
}
