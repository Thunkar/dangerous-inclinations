/**
 * The range cards on the cheatsheet page: the seven cards on screen at true
 * size behind a transform, and the A4 pages they print on, hidden until this
 * section's button prints them. They take the loadout cards' stock, layout
 * and back (`loadouts/`), and print double-sided as the decks do
 * (`missions/sheet.ts`).
 *
 * The page prints the player card by default; this section's button prints
 * these pages alone (`print/print.ts`).
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import { LoadoutBack } from '../missions/backs'
import { deckPages, type Flip } from '../missions/sheet'
import { FlipChoice, PrintPages, PrintSection, RowTitle } from '../print/PrintPages'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM } from '../loadouts/sheet'
import { RANGE_CARDS as TEXT } from '../../text/rangeCards'
import { rich } from '../../utils/rich'
import { RangeCard } from './RangeCard'
import { RANGE_CARDS } from './reach'

const T = TEXT.section

export function RangeSection() {
  const [flip, setFlip] = useState<Flip>('long')
  const pages = deckPages(RANGE_CARDS, flip)
  return (
    <PrintSection
      name="ranges"
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
      <PrintPages pages={pages}>
        {slot => (slot.face === 'front' ? <RangeCard type={slot.card} /> : <LoadoutBack />)}
      </PrintPages>
    </PrintSection>
  )
}
