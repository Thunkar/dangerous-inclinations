/**
 * The parts every print on the cheatsheet page shares (`print.ts` says which
 * one prints): the section around a print, with its words, its controls and
 * its button; the title over a row of cards on screen; and the A4 pages,
 * hidden on screen, each card at scale 1 at the millimetre its sheet puts it
 * and the crop marks drawn under them (`card/sheet.ts`).
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Kicker, Slab } from '../poster'
import { COLUMN } from '../guide/parts'
import { INK } from '../diagram'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { cropMarks, type PlacedFace } from '../card/sheet'
import type { Flip } from '../missions/sheet'
import { Segments } from '../tools/controls'
import { printAs, type PrintName } from './print'

/** The printed pages: every face in its slot, turned where the flip turns it. */
export function PrintPages<F extends PlacedFace>({
  pages,
  children,
}: {
  pages: F[][]
  children: (face: F) => ReactNode
}) {
  return (
    <div className="di-sheets">
      {pages.map((faces, page) => (
        <div key={page} className="di-page">
          <svg
            className="di-marks"
            width={`${SHEET_WIDTH_MM}mm`}
            height={`${SHEET_HEIGHT_MM}mm`}
            viewBox={`0 0 ${SHEET_WIDTH_MM} ${SHEET_HEIGHT_MM}`}
            aria-hidden
          >
            {cropMarks(faces).map((m, i) => (
              <line
                key={i}
                x1={m.x1}
                y1={m.y1}
                x2={m.x2}
                y2={m.y2}
                stroke={INK}
                strokeWidth={0.2}
              />
            ))}
          </svg>
          {faces.map((face, i) => (
            <div
              key={i}
              className={face.rotated ? 'di-slot di-turned' : 'di-slot'}
              style={{
                left: `${face.x}mm`,
                top: `${face.y}mm`,
                width: `${face.width}mm`,
                height: `${face.height}mm`,
              }}
            >
              {children(face)}
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
