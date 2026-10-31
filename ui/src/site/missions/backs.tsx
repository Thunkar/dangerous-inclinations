/**
 * The back every printed card shares: the landing page's picture
 * (`PosterArt.tsx`) cropped close on the hole. The mission piles are told
 * apart at a glance, on ink for the primaries and on paper for the
 * secondaries, with the pile's points riding the wedge; the loadout cards
 * take the ink back with nothing on the wedge.
 */
import type { CSSProperties } from 'react'
import { fill } from '@dangerous-inclinations/engine'
import { BAND_ANGLE, FONT_DISPLAY, PRESS } from '../../design/press'
import { PosterShapes } from '../PosterArt'
import { POSTER_HOLE } from '../posterGeometry'
import { MISSION_DECK } from '../../text/missionDeck'
import { PILE_POINTS, type Pile } from './decks'

const B = MISSION_DECK.back

type Ground = 'ink' | 'paper'

const GROUND: Record<Ground, { bg: string; fg: string }> = {
  ink: { bg: PRESS.ink, fg: PRESS.paper },
  paper: { bg: PRESS.paper, fg: PRESS.ink },
}

const PILE_GROUND: Record<Pile, Ground> = { primary: 'ink', secondary: 'paper' }

/** A pile's back: the same on every card of it. */
export function Back({ pile }: { pile: Pile }) {
  return (
    <CardBack
      className="di-mc-card di-mc-back"
      ground={PILE_GROUND[pile]}
      label={fill(B[pile], { points: PILE_POINTS[pile] })}
    />
  )
}

/** A card's back on `ground`, `label` along the wedge if it has one; `className` sizes it. */
export function CardBack({
  className,
  ground,
  label,
}: {
  className: string
  ground: Ground
  label?: string
}) {
  const g = GROUND[ground]
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
    <div className={className} style={{ background: g.bg }}>
      <svg
        viewBox={[cx - width / 2, cy - height / 2, width, height].join(' ')}
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        aria-hidden
      >
        <PosterShapes line={g.fg} stamp={false} />
        {label && (
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
            {label.toUpperCase()}
          </text>
        )}
      </svg>
      <div style={game}>{B.game}</div>
    </div>
  )
}
