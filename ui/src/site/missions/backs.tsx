/**
 * The backs of the two mission piles: the same on every card of a pile, and
 * the two piles told apart at a glance. The landing page's picture
 * (`PosterArt.tsx`) cropped close on the hole, on ink for the primaries and
 * on paper for the secondaries, with the pile's points riding the wedge.
 */
import type { CSSProperties } from 'react'
import { fill } from '@dangerous-inclinations/engine'
import { BAND_ANGLE, FONT_DISPLAY, PRESS } from '../../design/press'
import { PosterShapes } from '../PosterArt'
import { POSTER_HOLE } from '../posterGeometry'
import { MISSION_DECK } from '../../text/missionDeck'
import { PILE_POINTS, type Pile } from './decks'

const B = MISSION_DECK.back

const GROUND: Record<Pile, { bg: string; fg: string }> = {
  primary: { bg: PRESS.ink, fg: PRESS.paper },
  secondary: { bg: PRESS.paper, fg: PRESS.ink },
}

/** A pile's back: the same on every card of it. */
export function Back({ pile }: { pile: Pile }) {
  const g = GROUND[pile]
  const width = 330
  const height = (width * 88) / 63
  const { x: cx, y: cy } = POSTER_HOLE
  const rad = (BAND_ANGLE * Math.PI) / 180
  // Along the wedge from the hole's centre, where it is wide enough for the words.
  const along = 70
  const game: CSSProperties = {
    position: 'absolute',
    top: '3.5mm',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '0.8mm 1.4mm',
    background: g.bg,
    color: g.fg,
    fontFamily: FONT_DISPLAY,
    textTransform: 'uppercase',
    lineHeight: 1,
    fontSize: '2.4mm',
    fontWeight: 600,
    letterSpacing: '0.16em',
    whiteSpace: 'nowrap',
  }
  return (
    <div className="di-mc-card di-mc-back" style={{ background: g.bg }}>
      <svg
        viewBox={[cx - width / 2, cy - height / 2, width, height].join(' ')}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        aria-hidden
      >
        <PosterShapes line={g.fg} stamp={false} />
        <text
          transform={`translate(${cx + along * Math.cos(rad)} ${cy - along * Math.sin(rad)}) rotate(-${BAND_ANGLE})`}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={FONT_DISPLAY}
          fontWeight={700}
          fontSize={44}
          letterSpacing={1}
          fill={PRESS.paper}
        >
          {fill(B[pile], { points: PILE_POINTS[pile] }).toUpperCase()}
        </text>
      </svg>
      <div style={game}>{B.game}</div>
    </div>
  )
}
