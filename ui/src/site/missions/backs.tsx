/**
 * The back every printed card shares: the landing page's picture
 * (`PosterArt.tsx`) cropped close on the hole. The mission piles are told
 * apart at a glance, on ink for the primaries and on paper for the
 * secondaries, with the pile's points riding the wedge; the loadout cards
 * take the ink back with nothing on the wedge.
 *
 * The backs are one surface: the sheet's cards touch and are cut on the
 * fronts' marks, and the duplex shifts every back alike, so a cut lands
 * anywhere on it. Each back draws the hole's rings whole and its neighbours'
 * where they reach, so the orbits run on from card to card under the wedge
 * and over the hole, and keeps the wedge and the hole `FRAME_MM` inside its
 * edge; a shifted back shows the
 * orbits running on and never its neighbour's wedge. On the printed sheet
 * each back also runs past its card (`bleed`), so the outer cards' cuts land
 * on back too.
 */
import { useId, type CSSProperties } from 'react'
import { fill } from '@dangerous-inclinations/engine'
import { BAND_ANGLE, FONT_DISPLAY, PRESS } from '../../design/press'
import { PosterShapes } from '../PosterArt'
import { POSTER_HOLE, POSTER_HOLE_RADIUS, POSTER_RINGS } from '../posterGeometry'
import { MISSION_DECK } from '../../text/missionDeck'
import { PILE_POINTS, type Pile } from './decks'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM } from '../loadouts/sheet'

const B = MISSION_DECK.back

type Ground = 'ink' | 'paper'

const GROUND: Record<Ground, { bg: string; fg: string }> = {
  ink: { bg: PRESS.ink, fg: PRESS.paper },
  paper: { bg: PRESS.paper, fg: PRESS.ink },
}

const PILE_GROUND: Record<Pile, Ground> = { primary: 'ink', secondary: 'paper' }

/** How far inside its edge a back keeps its wedge: as far as it may sit off its front. */
const FRAME_MM = 3
/** How far a printed back runs past its card: as far as it may sit off its front. */
const BLEED_MM = FRAME_MM

/** The cards whose rings reach a back: itself and the eight round it, in cards. */
const AROUND = [-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => [dx, dy] as const))

/** A pile's back: the same on every card of it; `bleed` on the printed sheet. */
export function Back({ pile, bleed = false }: { pile: Pile; bleed?: boolean }) {
  return (
    <CardBack
      className="di-mc-card di-mc-back"
      ground={PILE_GROUND[pile]}
      label={fill(B[pile], { points: PILE_POINTS[pile] })}
      bleed={bleed}
    />
  )
}

/** The loadout and range cards' back: the ink ground, nothing on the wedge. */
export function LoadoutBack({ bleed = false }: { bleed?: boolean }) {
  return <CardBack className="di-lo-card" ground="ink" bleed={bleed} />
}

/**
 * A card's back on `ground`, `label` along the wedge if it has one; `className`
 * sizes it. With `bleed` it is drawn `BLEED_MM` larger on every side, over its
 * card's slot, the art staying where it was.
 */
function CardBack({
  className,
  ground,
  label,
  bleed,
}: {
  className: string
  ground: Ground
  label?: string
  bleed: boolean
}) {
  const clip = useId()
  const g = GROUND[ground]
  const out = bleed ? BLEED_MM : 0
  // The picture's units: the card is `width` across, so `k` of them to a millimetre.
  const width = 330
  const height = (width * LOADOUT_HEIGHT_MM) / LOADOUT_WIDTH_MM
  const k = width / LOADOUT_WIDTH_MM
  const { x: cx, y: cy } = POSTER_HOLE
  const left = cx - width / 2
  const top = cy - height / 2
  const rad = (BAND_ANGLE * Math.PI) / 180
  // Along the wedge from the hole's centre, where it is wide enough for the words
  // and clear of the edge.
  const along = 45
  const game: CSSProperties = {
    position: 'absolute',
    top: `${out + FRAME_MM + 1.5}mm`,
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
  const box: CSSProperties = {
    background: g.bg,
    ...(bleed && {
      width: `${LOADOUT_WIDTH_MM + 2 * out}mm`,
      height: `${LOADOUT_HEIGHT_MM + 2 * out}mm`,
      margin: `-${out}mm 0 0 -${out}mm`,
    }),
  }
  return (
    <div className={className} style={box}>
      <svg
        viewBox={[left - out * k, top - out * k, width + 2 * out * k, height + 2 * out * k].join(
          ' '
        )}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        aria-hidden
      >
        <clipPath id={clip}>
          <rect
            x={left + FRAME_MM * k}
            y={top + FRAME_MM * k}
            width={width - 2 * FRAME_MM * k}
            height={height - 2 * FRAME_MM * k}
          />
        </clipPath>
        <circle
          cx={cx}
          cy={cy}
          r={POSTER_HOLE_RADIUS}
          fill={PRESS.ink}
          clipPath={`url(#${CSS.escape(clip)})`}
        />
        {AROUND.flatMap(([dx, dy]) =>
          POSTER_RINGS.map(r => (
            <circle
              key={`${dx},${dy},${r}`}
              cx={cx + dx * width}
              cy={cy + dy * height}
              r={r}
              fill="none"
              stroke={g.fg}
              strokeWidth={3}
            />
          ))
        )}
        <g clipPath={`url(#${CSS.escape(clip)})`}>
          <PosterShapes line={g.fg} stamp={false} orbits={false} />
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
        </g>
      </svg>
      <div style={game}>{B.game}</div>
    </div>
  )
}
