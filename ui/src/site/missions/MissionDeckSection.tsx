/**
 * The mission decks on the cheatsheet page: both piles on screen in deck
 * order, each card the game's own `MissionCard` at true size behind a
 * transform, and the A4 pages they print on (`sheet.ts`), hidden until this
 * section's button prints them.
 *
 * The decks are drawn face-down, so they print double-sided: each page of
 * fronts and then its backs, each pile on pages of its own, so a misprint
 * costs one pile. The button marks the body `data-printing="missions"` for
 * the length of its print, and the stylesheet (`missionDeckStyles.ts`) shows
 * only these pages while it is set.
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import PrintIcon from '@mui/icons-material/Print'
import { MAX_PLAYERS, fill } from '@dangerous-inclinations/engine'
import type { Mission } from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { MissionCard } from '../../components/common/MissionCard'
import { Body, Display, Kicker, Slab } from '../poster'
import { COLUMN } from '../guide/parts'
import { INK } from '../diagram'
import { SHEET_HEIGHT_MM, SHEET_WIDTH_MM } from '../card/cardStyles'
import { cropMarks } from '../card/sheet'
import { Segments } from '../tools/controls'
import { MISSION_DECK } from '../../text/missionDeck'
import { rich } from '../../utils/rich'
import { Back } from './backs'
import { PILES, nameOf, type Pile } from './decks'
import { MISSION_HEIGHT_MM, MISSION_WIDTH_MM, deckPages, type Flip } from './sheet'

const T = MISSION_DECK.section
const ORDER: Pile[] = ['primary', 'secondary']

/** The fonts must be in before the sheets are laid out, as for the player card. */
function printMissions() {
  void document.fonts.ready.then(() => {
    document.body.dataset.printing = 'missions'
    const done = () => {
      delete document.body.dataset.printing
    }
    window.addEventListener('afterprint', done, { once: true })
    window.print()
  })
}

function Front({ mission }: { mission: Mission }) {
  return (
    <div className="di-mc-card" data-card={mission.id}>
      <div className="di-mc-front">
        <MissionCard mission={mission} nameOf={nameOf} />
      </div>
    </div>
  )
}

function DeckSheets({ flip }: { flip: Flip }) {
  const pages = ORDER.flatMap(pile => deckPages(PILES[pile], flip).map(cards => ({ pile, cards })))
  return (
    <div className="di-mc-sheets">
      {pages.map(({ pile, cards }, page) => (
        <div key={page} className="di-page" data-pile={pile} data-face={cards[0].face}>
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
              key={slot.card.id}
              className={slot.rotated ? 'di-mc-slot di-turned' : 'di-mc-slot'}
              style={{ left: `${slot.x}mm`, top: `${slot.y}mm` }}
            >
              {slot.face === 'front' ? <Front mission={slot.card} /> : <Back pile={pile} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function MissionDeckSection() {
  const [flip, setFlip] = useState<Flip>('long')
  const pages = ORDER.reduce((n, pile) => n + deckPages(PILES[pile], flip).length, 0)
  return (
    <Box
      component="section"
      id="missions"
      className="di-print-area"
      aria-labelledby="missions-title"
      sx={{ bgcolor: PRESS.paper, borderTop: `8px solid ${PRESS.ink}`, scrollMarginTop: 64 }}
    >
      <Box className="di-print" sx={{ ...COLUMN, py: { xs: 5, sm: 7 } }}>
        <Box className="di-screen-only" sx={{ mb: 4 }}>
          <Kicker>{T.kicker}</Kicker>
          <Box id="missions-title">
            <Display component="h2" size={{ xs: '2.4rem', sm: '3.4rem' }} sx={{ mt: 0.75 }}>
              {T.title}
            </Display>
          </Box>
          <Body size={{ xs: '1.02rem', sm: '1.12rem' }} sx={{ mt: 1.5 }}>
            {rich(T.lede, {
              players: MAX_PLAYERS,
              primaries: PILES.primary.length,
              secondaries: PILES.secondary.length,
              width: MISSION_WIDTH_MM,
              height: MISSION_HEIGHT_MM,
            })}
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
            <Slab tone="red" onClick={printMissions}>
              <PrintIcon sx={{ fontSize: 20 }} />
              {T.print}
            </Slab>
          </Box>
          <Body size="0.92rem" color={PRESS.inkSoft} sx={{ maxWidth: '62ch', mt: 1.5 }}>
            {rich(T.printNote, { pages, edge: T.edges[flip] })}
          </Body>
        </Box>

        <div className="di-mc-rows">
          {ORDER.map(pile => (
            <Box key={pile} sx={{ mt: { xs: 3, sm: 4 } }}>
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
                {fill(T.rows[pile], { cards: PILES[pile].length })}
              </Box>
              <div className="di-mc-row">
                <div className="di-mc-frame">
                  <Back pile={pile} />
                </div>
                {PILES[pile].map(mission => (
                  <div key={mission.id} className="di-mc-frame">
                    <Front mission={mission} />
                  </div>
                ))}
              </div>
            </Box>
          ))}
        </div>
        <DeckSheets flip={flip} />
      </Box>
    </Box>
  )
}
