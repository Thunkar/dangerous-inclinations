/**
 * The subsystems card on the cheatsheet page: its two faces on screen at true
 * size behind a transform, and the A4 pages they print on, hidden until this
 * section's button prints them (`print/print.ts`). It prints as the player
 * card does, two faces a page (`card/sheet.ts`), its band of ink running past
 * the cut (`print/frame.ts`).
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import { cardPages, type PrintMode } from '../card/sheet'
import type { Flip } from '../missions/sheet'
import { FlipChoice, PrintPages, PrintSection, RowTitle } from '../print/PrintPages'
import { Segments } from '../tools/controls'
import { PRESS } from '../../design/press'
import { SUBSYSTEM_CARD } from '../../text/subsystemCard'
import { rich } from '../../utils/rich'
import { SubsystemBack, SubsystemFront } from './SubsystemCard'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from '../print/frame'

const T = SUBSYSTEM_CARD.section

type Sides = 'sheet' | 'duplex'

export function SubsystemSection() {
  const [sides, setSides] = useState<Sides>('sheet')
  const [flip, setFlip] = useState<Flip>('long')
  const mode: PrintMode = sides === 'sheet' ? 'sheet' : `duplex-${flip}`
  return (
    <PrintSection
      name="subsystems"
      kicker={T.kicker}
      title={T.title}
      lede={rich(T.lede, { width: CARD_WIDTH_MM, height: CARD_HEIGHT_MM })}
      controls={
        <>
          <Segments
            value={sides}
            options={(['sheet', 'duplex'] as const).map(value => ({
              value,
              label: T.modes[value],
            }))}
            onChange={setSides}
          />
          {sides === 'duplex' && <FlipChoice flip={flip} labels={T.flips} onChange={setFlip} />}
        </>
      }
      print={T.print}
      note={T.printNote[mode]}
    >
      <div className="sx-faces">
        <Box>
          <RowTitle>{T.front}</RowTitle>
          <SubsystemFront />
        </Box>
        <Box>
          <RowTitle>{T.back}</RowTitle>
          <SubsystemBack />
        </Box>
      </div>
      <PrintPages pages={cardPages(mode)} bleed={PRESS.ink}>
        {face => (face.face === 'front' ? <SubsystemFront /> : <SubsystemBack />)}
      </PrintPages>
    </PrintSection>
  )
}
