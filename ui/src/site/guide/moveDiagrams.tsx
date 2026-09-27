/**
 * The three moves, drawn big enough to read on a screen: a coast, a burn and
 * a jump. The rings are unrolled into straight lines and the sector ticks are
 * unnumbered, because how far a drift carries you is printed on the board and
 * a number here would be read as the number. Red is always the move.
 */
import type { ReactNode } from 'react'
import { BLACK_HOLE_OUTER_RING, PLANET_OUTER_RING, fill } from '@dangerous-inclinations/engine'
import { PRESS } from '../../design/press'
import { useArrowHeads, type ArrowHeadSet } from '../diagram'
import { ArrowHeads, Ring, Tag } from '../DiagramParts'
import { CHEATSHEET } from '../../text/cheatsheet'

const T = CHEATSHEET.move

const W = 320
const H = 170

function Frame({
  label,
  heads,
  children,
}: {
  label: string
  heads: ArrowHeadSet
  children: ReactNode
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <ArrowHeads heads={heads} />
      {children}
    </svg>
  )
}

/** The arrowheads every one of these diagrams draws with. */
const HEADS = { red: 3.4, ink: 4 }

/** A ring, unrolled across the frame, ticked off in sectors. */
function GuideRing({ y, weight = 3 }: { y: number; weight?: number }) {
  return (
    <Ring y={y} from={8} to={W - 8} first={22} step={24} tick={5} weight={weight} tickWeight={2} />
  )
}

/** The ship, nose in the direction it faces. */
function Ship({ x, y }: { x: number; y: number }) {
  return <path d={`M${x + 13} ${y}L${x - 9} ${y - 10}L${x - 9} ${y + 10}z`} fill={PRESS.ink} />
}

export function CoastDiagram() {
  const heads = useArrowHeads(HEADS)
  return (
    <Frame heads={heads} label={T.coast.diagram.label}>
      <Tag x={8} y={52}>
        {T.coast.diagram.ring}
      </Tag>
      <GuideRing y={90} />
      <Ship x={34} y={90} />
      <path
        d="M58 90H230"
        stroke={PRESS.red}
        strokeWidth={8}
        strokeDasharray="14 8"
        fill="none"
        markerEnd={heads.red}
      />
      <Tag x={144} y={124} anchor="middle" color={PRESS.redText}>
        {T.coast.diagram.drift}
      </Tag>
    </Frame>
  )
}

export function BurnDiagram() {
  const heads = useArrowHeads(HEADS)
  return (
    <Frame heads={heads} label={T.burn.diagram.label}>
      <GuideRing y={30} />
      <GuideRing y={85} />
      <GuideRing y={140} />
      <Tag x={W - 8} y={20} anchor="end">
        {T.burn.diagram.outer}
      </Tag>
      <Tag x={W - 8} y={162} anchor="end">
        {T.burn.diagram.inner}
      </Tag>
      <Ship x={30} y={85} />
      <path d="M52 85H128" stroke={PRESS.ink} strokeWidth={5} strokeDasharray="10 6" fill="none" />
      <path
        d="M128 85C160 85 164 30 200 30H228"
        stroke={PRESS.red}
        strokeWidth={8}
        fill="none"
        markerEnd={heads.red}
      />
      <path
        d="M128 85C160 85 164 140 200 140H216"
        stroke={PRESS.ink}
        strokeWidth={3}
        strokeDasharray="6 5"
        fill="none"
        markerEnd={heads.ink}
      />
      <Tag x={52} y={68}>
        {T.burn.diagram.drift}
      </Tag>
      <Tag x={W - 8} y={62} anchor="end" color={PRESS.redText}>
        {T.burn.diagram.prograde}
      </Tag>
      <Tag x={W - 8} y={117} anchor="end">
        {T.burn.diagram.retrograde}
      </Tag>
    </Frame>
  )
}

export function JumpDiagram() {
  const heads = useArrowHeads(HEADS)
  const cell = (x: number, y: number, on: boolean, key: string) => (
    <rect
      key={key}
      x={x}
      y={y}
      width={20}
      height={20}
      fill={on ? PRESS.red : PRESS.paper}
      stroke={PRESS.ink}
      strokeWidth={3}
    />
  )
  return (
    <Frame heads={heads} label={T.jump.diagram.label}>
      <circle cx={28} cy={78} r={24} fill={PRESS.ink} />
      {[0, 1, 2, 3].map(i => cell(60 + i * 22, 68, i === 1, `d${i}`))}
      <path d="M152 78H182" stroke={PRESS.red} strokeWidth={8} fill="none" markerEnd={heads.red} />
      {[0, 1, 2, 3].map(i => cell(192 + i * 22, 68, i === 1, `a${i}`))}
      <circle cx={W - 16} cy={78} r={14} fill={PRESS.teal} />
      <Tag x={60} y={54}>
        {T.jump.diagram.depart}
      </Tag>
      <Tag x={192} y={54}>
        {T.jump.diagram.arrive}
      </Tag>
      <Tag x={8} y={130}>
        {fill(T.jump.diagram.from, { ring: BLACK_HOLE_OUTER_RING })}
      </Tag>
      <Tag x={W - 8} y={130} anchor="end">
        {fill(T.jump.diagram.to, { ring: PLANET_OUTER_RING })}
      </Tag>
      <Tag x={W / 2} y={160} anchor="middle" color={PRESS.redText}>
        {T.jump.diagram.note}
      </Tag>
    </Frame>
  )
}
