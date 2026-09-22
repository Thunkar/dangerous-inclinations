/**
 * The three moves, drawn for the card: a coast, a burn and a jump, one row
 * each, with red always the move and black the ring it happens on.
 *
 * The rules state movement in sentences and the board prints the numbers;
 * between the two is a thing neither shows, which is the *shape* of a move. A
 * turn drifts first and changes ring second, the facing decides which way,
 * and a jump does none of that because it does not drift at all. The rings
 * are unrolled into straight lines (three concentric arcs at 64mm are three
 * grey curves) and the ticks are unnumbered, because how far a drift carries
 * you is printed on the board and a number here would be read as the number.
 *
 * Laid out on a grid: a label column on the left, one band per move, every
 * caption on a baseline of its own, so nothing is placed by eye.
 */
import {
  BLACK_HOLE_OUTER_RING,
  BURN_COSTS,
  PLANET_OUTER_RING,
} from '@dangerous-inclinations/engine'
import { PRESS } from '../../design/press'

const W = 208
const H = 86
const TRACK_X = 40
const TRACK_END = W - 2

const INK = PRESS.ink
const RED = PRESS.red

function Label({ y, title, note }: { y: number; title: string; note: string[] }) {
  return (
    <>
      <text
        x={0}
        y={y}
        fontSize={7.6}
        fontWeight={700}
        fill={INK}
        fontFamily="var(--di-display)"
        letterSpacing="0.04em"
      >
        {title}
      </text>
      {note.map((line, index) => (
        <text
          key={line}
          x={0}
          y={y + 6.4 + index * 5.4}
          fontSize={4.9}
          fill={INK}
          fontFamily="var(--di-sans)"
        >
          {line}
        </text>
      ))}
    </>
  )
}

function Tag({
  x,
  y,
  children,
  color = INK,
}: {
  x: number
  y: number
  children: string
  color?: string
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={4.9}
      fontWeight={700}
      fill={color}
      fontFamily="var(--di-display)"
      letterSpacing="0.06em"
    >
      {children.toUpperCase()}
    </text>
  )
}

/** A ring, unrolled, ticked off in sectors. */
function Ring({ y }: { y: number }) {
  const ticks: number[] = []
  for (let x = TRACK_X + 8; x < TRACK_END; x += 12) ticks.push(x)
  return (
    <>
      <line x1={TRACK_X} y1={y} x2={TRACK_END} y2={y} stroke={INK} strokeWidth={0.9} />
      {ticks.map(x => (
        <line key={x} x1={x} y1={y - 1.8} x2={x} y2={y + 1.8} stroke={INK} strokeWidth={0.7} />
      ))}
    </>
  )
}

/** The ship, nose in the direction it faces. */
function Ship({ x, y }: { x: number; y: number }) {
  return <path d={`M${x + 5} ${y}L${x - 3.5} ${y - 3.8}L${x - 3.5} ${y + 3.8}z`} fill={INK} />
}

function Cell({ x, y, on }: { x: number; y: number; on: boolean }) {
  return (
    <rect
      x={x}
      y={y}
      width={9}
      height={9}
      fill={on ? RED : '#fff'}
      stroke={INK}
      strokeWidth={0.9}
    />
  )
}

export function MovementDiagram() {
  const hard = BURN_COSTS.hard.rings
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <defs>
        <marker
          id="di-head-red"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="3.2"
          markerHeight="3.2"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" fill={RED} />
        </marker>
        <marker
          id="di-head-ink"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="4.4"
          markerHeight="4.4"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" fill={INK} />
        </marker>
      </defs>

      {/* coast: the drift, which happens whatever else the turn does */}
      <Label y={8} title="COAST" note={['Drift only']} />
      <Ring y={9} />
      <Ship x={TRACK_X + 6} y={9} />
      <path
        d={`M${TRACK_X + 14} 9H118`}
        stroke={RED}
        strokeWidth={2.6}
        strokeDasharray="5 3"
        fill="none"
        markerEnd="url(#di-head-red)"
      />
      <Tag x={126} y={5.2}>
        by the ring&apos;s speed
      </Tag>

      {/* burn: drift first, ring second, and the facing picks the way */}
      <Label y={31} title="BURN" note={['Drift, then', `1\u2013${hard} rings`]} />
      <Ring y={24} />
      <Ring y={36} />
      <Ring y={48} />
      <Ship x={TRACK_X + 6} y={36} />
      <path
        d={`M${TRACK_X + 14} 36H96`}
        stroke={INK}
        strokeWidth={1.6}
        strokeDasharray="4 2.4"
        fill="none"
      />
      <path
        d="M96 36C110 36 110 24 124 24H138"
        stroke={RED}
        strokeWidth={2.6}
        fill="none"
        markerEnd="url(#di-head-red)"
      />
      <path
        d="M96 36C110 36 110 48 124 48H134"
        stroke={INK}
        strokeWidth={1}
        strokeDasharray="2.4 1.8"
        fill="none"
        markerEnd="url(#di-head-ink)"
      />
      <Tag x={146} y={20.5} color={PRESS.redText}>
        prograde: out
      </Tag>
      <Tag x={142} y={55}>
        retrograde: in
      </Tag>

      {/* jump: a lane between two wells, and no drift */}
      <Label y={68} title="JUMP" note={['Transfer sectors']} />
      <circle cx={TRACK_X + 5} cy={70} r={5} fill={INK} />
      {[0, 1, 2, 3].map(i => (
        <Cell key={`d${i}`} x={TRACK_X + 14 + i * 10} y={65.5} on={i === 1} />
      ))}
      <path
        d="M109 70H128"
        stroke={RED}
        strokeWidth={2.6}
        fill="none"
        markerEnd="url(#di-head-red)"
      />
      {[0, 1, 2, 3].map(i => (
        <Cell key={`a${i}`} x={136 + i * 10} y={65.5} on={i === 1} />
      ))}
      <circle cx={TRACK_END - 4} cy={70} r={4} fill={PRESS.teal} />
      <Tag x={TRACK_X + 14} y={83}>{`hole ring ${BLACK_HOLE_OUTER_RING}`}</Tag>
      <Tag x={136} y={83}>{`planet ring ${PLANET_OUTER_RING}`}</Tag>
      <Tag x={TRACK_X + 14} y={62}>
        same sector of the arc
      </Tag>
    </svg>
  )
}
