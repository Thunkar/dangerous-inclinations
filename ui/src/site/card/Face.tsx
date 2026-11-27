/**
 * A face of the player card: the card as it is cut, its frame
 * (`print/frame.ts`), and inside it the printed face, drawn at
 * `PLAYER_CONTENT`'s size and zoomed by `CARD_SCALE`, the black head strip
 * across its top naming the game and the face.
 */
import type { ReactNode } from 'react'
import { PRINTED_CARD } from '../../text/printedCard'
import { frameStyle } from '../print/frame'
import { PrintScale } from '../print/hairline'
import { CARD_SCALE, playerBox } from './cardStyles'
import type { Face as Side } from './sheet'

export function Face({
  side,
  face,
  className,
  children,
}: {
  side: Side
  face: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className="di-frame">
      <div className="di-trim" style={frameStyle(side)}>
        <div className="di-scaled">
          <PrintScale.Provider value={CARD_SCALE}>
            <div
              className={className ? `di-card ${className}` : 'di-card'}
              style={{ width: `${playerBox(side).width}mm`, height: `${playerBox(side).height}mm` }}
            >
              <div className="di-head">
                <b>{PRINTED_CARD.head}</b>
                <span>{face}</span>
              </div>
              {children}
            </div>
          </PrintScale.Provider>
        </div>
      </div>
    </div>
  )
}
