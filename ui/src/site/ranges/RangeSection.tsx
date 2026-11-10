/**
 * The range cards on the cheatsheet page: the seven cards on screen at true
 * size behind a transform, and the A4 pages they print on, hidden until this
 * section's button prints them. They take the loadout cards' stock, layout
 * and back (`loadouts/`), and print double-sided as the decks do
 * (`missions/sheet.ts`).
 *
 * The page prints the player card by default. This button marks the body
 * `data-printing="ranges"` for the length of its print, and the stylesheet
 * (`rangeStyles.ts`) shows only these pages while it is set.
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Kicker, Slab } from '../poster'
import { COLUMN } from '../guide/parts'
import { INK } from '../diagram'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { cropMarks } from '../card/sheet'
import { Segments } from '../tools/controls'
import { CardBack } from '../missions/backs'
import { deckPages, type Flip } from '../missions/sheet'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM } from '../loadouts/sheet'
import { RANGE_CARDS as TEXT } from '../../text/rangeCards'
import { rich } from '../../utils/rich'
import { RangeCard } from './RangeCard'
import { RANGE_CARDS } from './reach'

const T = TEXT.section

function Back() {
  return <CardBack className="di-lo-card" ground="ink" />
}

/** The fonts must be in before the sheets are laid out, as for the player card. */
function printRanges() {
  void document.fonts.ready.then(() => {
    document.body.dataset.printing = 'ranges'
    const done = () => {
      delete document.body.dataset.printing
    }
    window.addEventListener('afterprint', done, { once: true })
    window.print()
  })
}

function RangeSheets({ flip }: { flip: Flip }) {
  return (
    <div className="di-lo-sheets">
      {deckPages(RANGE_CARDS, flip).map((cards, page) => (
        <div key={page} className="di-page">
          <svg
            className="di-marks"
            width={`${SHEET_WIDTH_MM}mm`}
            height={`${SHEET_HEIGHT_MM}mm`}
            viewBox={`0 0 ${SHEET_WIDTH_MM} ${SHEET_HEIGHT_MM}`}
            aria-hidden
          >
            {cropMarks(cards).map((m, i) => (
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
          {cards.map(slot => (
            <div
              key={slot.card}
              className={slot.rotated ? 'di-lo-slot di-turned' : 'di-lo-slot'}
              style={{ left: `${slot.x}mm`, top: `${slot.y}mm` }}
            >
              {slot.face === 'front' ? <RangeCard type={slot.card} /> : <Back />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function RowTitle({ children }: { children: string }) {
  return (
    <Box
      component="h3"
      sx={{
        m: 0,
        mb: 1.5,
        fontFamily: FONT_DISPLAY,
        fontWeight: 600,
        fontSize: '1.3rem',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Box>
  )
}

export function RangeSection() {
  const [flip, setFlip] = useState<Flip>('long')
  return (
    <Box
      component="section"
      id="ranges"
      className="di-print-area"
      aria-labelledby="ranges-title"
      sx={{ bgcolor: PRESS.paper, borderTop: `8px solid ${PRESS.ink}`, scrollMarginTop: 64 }}
    >
      <Box className="di-print" sx={{ ...COLUMN, py: { xs: 5, sm: 7 } }}>
        <Box className="di-screen-only" sx={{ mb: 4 }}>
          <Kicker>{T.kicker}</Kicker>
          <Box id="ranges-title">
            <Display component="h2" size={{ xs: '2.4rem', sm: '3.4rem' }} sx={{ mt: 0.75 }}>
              {T.title}
            </Display>
          </Box>
          <Body size={{ xs: '1.02rem', sm: '1.12rem' }} sx={{ mt: 1.5 }}>
            {rich(T.lede, { width: LOADOUT_WIDTH_MM, height: LOADOUT_HEIGHT_MM })}
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mt: 3 }}>
            <Segments
              value={flip}
              options={(['long', 'short'] as const).map(value => ({
                value,
                label: T.flips[value],
              }))}
              onChange={setFlip}
            />
            <Slab tone="red" onClick={printRanges}>
              <PrintIcon sx={{ fontSize: 20 }} />
              {T.print}
            </Slab>
          </Box>
          <Body size="0.92rem" color={PRESS.inkSoft} sx={{ maxWidth: '62ch', mt: 1.5 }}>
            {rich(T.printNote, {
              pages: deckPages(RANGE_CARDS, flip).length,
              edge: T.edges[flip],
            })}
          </Body>
        </Box>

        <div className="di-lo-rows">
          <Box sx={{ mt: { xs: 3, sm: 4 } }}>
            <RowTitle>{T.back}</RowTitle>
            <div className="di-lo-row">
              <div className="di-lo-frame">
                <Back />
              </div>
            </div>
          </Box>
          <Box sx={{ mt: { xs: 3, sm: 4 } }}>
            <RowTitle>{T.cards}</RowTitle>
            <div className="di-lo-row">
              {RANGE_CARDS.map(type => (
                <div key={type} className="di-lo-frame">
                  <RangeCard type={type} />
                </div>
              ))}
            </div>
          </Box>
        </div>
        <RangeSheets flip={flip} />
      </Box>
    </Box>
  )
}
