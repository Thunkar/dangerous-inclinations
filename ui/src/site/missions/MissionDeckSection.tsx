/**
 * The mission decks on the cheatsheet page: both piles on screen in deck
 * order, each card the game's own `MissionCard` at true size behind a
 * transform, and the A4 pages they print on (`sheet.ts`), hidden until this
 * section's button prints them.
 *
 * The decks are drawn face-down, so they print double-sided: each page of
 * fronts and then its backs, each pile on pages of its own, so a misprint
 * costs one pile. The section's button prints these pages alone
 * (`print/print.ts`).
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import { MAX_PLAYERS, fill } from '@dangerous-inclinations/engine'
import type { Mission } from '@dangerous-inclinations/engine'
import { MissionCard } from '../../components/common/MissionCard'
import { FlipChoice, PrintPages, PrintSection, RowTitle } from '../print/PrintPages'
import { MISSION_DECK } from '../../text/missionDeck'
import { rich } from '../../utils/rich'
import { Back } from './backs'
import { PILES, nameOf, type Pile } from './decks'
import { MISSION_HEIGHT_MM, MISSION_WIDTH_MM, deckPages, type Flip } from './sheet'

const T = MISSION_DECK.section
const ORDER: Pile[] = ['primary', 'secondary']

function Front({ mission }: { mission: Mission }) {
  return (
    <div className="di-mc-card" data-card={mission.id}>
      <div className="di-mc-front">
        <MissionCard mission={mission} nameOf={nameOf} />
      </div>
    </div>
  )
}

export function MissionDeckSection() {
  const [flip, setFlip] = useState<Flip>('long')
  /** Each pile on pages of its own, so a misprint costs one pile. */
  const pages = ORDER.flatMap(pile =>
    deckPages(PILES[pile], flip).map(cards => cards.map(slot => ({ ...slot, pile })))
  )
  return (
    <PrintSection
      name="missions"
      kicker={T.kicker}
      title={T.title}
      lede={rich(T.lede, {
        players: MAX_PLAYERS,
        primaries: PILES.primary.length,
        secondaries: PILES.secondary.length,
        width: MISSION_WIDTH_MM,
        height: MISSION_HEIGHT_MM,
      })}
      controls={<FlipChoice flip={flip} labels={T.flips} onChange={setFlip} />}
      print={T.print}
      note={rich(T.printNote, { pages: pages.length, edge: T.edges[flip] })}
    >
      <div className="di-mc-rows">
        {ORDER.map(pile => (
          <Box key={pile} sx={{ mt: { xs: 3, sm: 4 } }}>
            <RowTitle>{fill(T.rows[pile], { cards: PILES[pile].length })}</RowTitle>
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
      <PrintPages pages={pages}>
        {slot =>
          slot.face === 'front' ? <Front mission={slot.card} /> : <Back pile={slot.pile} />
        }
      </PrintPages>
    </PrintSection>
  )
}
