/**
 * The loadout cards on the cheatsheet page: the twelve presets on screen in
 * their roles, at true size behind a transform, and the A4 pages they print
 * on, hidden until this section's button prints them. They take the mission
 * decks' back (`missions/backs.tsx`) on ink with nothing on the wedge, and
 * print double-sided as the decks do (`missions/sheet.ts`).
 *
 * The page prints the player card by default; this section's button prints
 * these pages alone (`print/print.ts`).
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import { PRESETS_BY_ROLE } from '@dangerous-inclinations/engine'
import type { BotRole } from '@dangerous-inclinations/engine'
import { LoadoutBack } from '../missions/backs'
import { deckPages, type Flip } from '../missions/sheet'
import { FlipChoice, PrintPages, PrintSection, RowTitle } from '../print/PrintPages'
import { LOADOUT_CARDS } from '../../text/loadoutCards'
import { rich } from '../../utils/rich'
import { LoadoutCard } from './LoadoutCard'
import { roleInk } from './presets'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM } from './sheet'

const T = LOADOUT_CARDS.section

/** The roles in the order a first game meets them: the hunt, the scan, the haul. */
const ROLES: BotRole[] = ['hunter', 'interceptor', 'hauler']
const PRESETS = ROLES.flatMap(role => PRESETS_BY_ROLE[role])

export function LoadoutSection() {
  const [flip, setFlip] = useState<Flip>('long')
  const pages = deckPages(PRESETS, flip)
  return (
    <PrintSection
      name="loadouts"
      kicker={T.kicker}
      title={T.title}
      lede={rich(T.lede, { width: LOADOUT_WIDTH_MM, height: LOADOUT_HEIGHT_MM })}
      controls={<FlipChoice flip={flip} labels={T.flips} onChange={setFlip} />}
      print={T.print}
      note={rich(T.printNote, { pages: pages.length, edge: T.edges[flip] })}
    >
      <div className="di-lo-rows">
        <Box sx={{ mt: { xs: 3, sm: 4 } }}>
          <RowTitle>{T.back}</RowTitle>
          <div className="di-lo-row">
            <div className="di-lo-frame">
              <LoadoutBack />
            </div>
          </div>
        </Box>
        {ROLES.map(role => (
          <Box key={role} sx={{ mt: { xs: 3, sm: 4 } }}>
            <RowTitle ink={roleInk(role)}>{T.rows[role]}</RowTitle>
            <div className="di-lo-row">
              {PRESETS_BY_ROLE[role].map(id => (
                <div key={id} className="di-lo-frame">
                  <LoadoutCard id={id} />
                </div>
              ))}
            </div>
          </Box>
        ))}
      </div>
      <PrintPages pages={pages}>
        {slot => (slot.face === 'front' ? <LoadoutCard id={slot.card} /> : <LoadoutBack />)}
      </PrintPages>
    </PrintSection>
  )
}
