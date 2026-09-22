/**
 * The three moves, drawn big enough to read on a screen: a coast, a burn and
 * a jump. The rings are unrolled into straight lines and the sector ticks are
 * unnumbered, because how far a drift carries you is printed on the board and
 * a number here would be read as the number. Red is always the move.
 */
import type { ReactNode } from 'react'
import { BLACK_HOLE_OUTER_RING, PLANET_OUTER_RING } from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'

const W = 320
const H = 170

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <defs>
        <marker
          id="g-head-red"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="3.4"
          markerHeight="3.4"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" fill={PRESS.red} />
        </marker>
        <marker
          id="g-head-ink"
          viewBox="0 0 10 10"
          refX="6"
          refY="5"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" fill={PRESS.ink} />
        </marker>
      </defs>
      {children}
    </svg>
  )
}

function Tag({
  x,
  y,
  children,
  anchor = 'start',
  color = PRESS.ink,
}: {
  x: number
  y: number
  children: string
  anchor?: 'start' | 'middle' | 'end'
  color?: string
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={FONT_DISPLAY}
      fontWeight={600}
      fontSize={13}
      letterSpacing="0.08em"
      fill={color}
    >
      {children.toUpperCase()}
    </text>
  )
}

/** A ring, unrolled, ticked off in sectors. */
function Ring({ y, weight = 3 }: { y: number; weight?: number }) {
  const ticks: number[] = []
  for (let x = 22; x < W - 8; x += 24) ticks.push(x)
  return (
    <>
      <line x1={8} y1={y} x2={W - 8} y2={y} stroke={PRESS.ink} strokeWidth={weight} />
      {ticks.map(x => (
        <line key={x} x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={PRESS.ink} strokeWidth={2} />
      ))}
    </>
  )
}

/** The ship, nose in the direction it faces. */
function Ship({ x, y }: { x: number; y: number }) {
  return <path d={`M${x + 13} ${y}L${x - 9} ${y - 10}L${x - 9} ${y + 10}z`} fill={PRESS.ink} />
}

export function CoastDiagram() {
  return (
    <Frame label="A coast: the ship drifts forward along its ring by the ring's speed">
      <Tag x={8} y={52}>
        your ring
      </Tag>
      <Ring y={90} />
      <Ship x={34} y={90} />
      <path
        d="M58 90H230"
        stroke={PRESS.red}
        strokeWidth={8}
        strokeDasharray="14 8"
        fill="none"
        markerEnd="url(#g-head-red)"
      />
      <Tag x={144} y={124} anchor="middle" color={PRESS.redText}>
        drift = the ring&apos;s speed
      </Tag>
    </Frame>
  )
}

export function BurnDiagram() {
  return (
    <Frame label="A burn: drift first, then change ring; prograde burns outward, retrograde inward">
      <Ring y={30} />
      <Ring y={85} />
      <Ring y={140} />
      <Tag x={W - 8} y={20} anchor="end">
        outer ring
      </Tag>
      <Tag x={W - 8} y={162} anchor="end">
        inner ring
      </Tag>
      <Ship x={30} y={85} />
      <path d="M52 85H128" stroke={PRESS.ink} strokeWidth={5} strokeDasharray="10 6" fill="none" />
      <path
        d="M128 85C160 85 164 30 200 30H228"
        stroke={PRESS.red}
        strokeWidth={8}
        fill="none"
        markerEnd="url(#g-head-red)"
      />
      <path
        d="M128 85C160 85 164 140 200 140H216"
        stroke={PRESS.ink}
        strokeWidth={3}
        strokeDasharray="6 5"
        fill="none"
        markerEnd="url(#g-head-ink)"
      />
      <Tag x={52} y={68}>
        drift first
      </Tag>
      <Tag x={W - 8} y={62} anchor="end" color={PRESS.redText}>
        prograde: out
      </Tag>
      <Tag x={W - 8} y={117} anchor="end">
        retrograde: in
      </Tag>
    </Frame>
  )
}

export function JumpDiagram() {
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
    <Frame label="A jump: from a lane's departure arc on the black hole's outer ring to the matching sector of the planet's arrival arc, with no drift">
      <circle cx={28} cy={78} r={24} fill={PRESS.ink} />
      {[0, 1, 2, 3].map(i => cell(60 + i * 22, 68, i === 1, `d${i}`))}
      <path
        d="M152 78H182"
        stroke={PRESS.red}
        strokeWidth={8}
        fill="none"
        markerEnd="url(#g-head-red)"
      />
      {[0, 1, 2, 3].map(i => cell(192 + i * 22, 68, i === 1, `a${i}`))}
      <circle cx={W - 16} cy={78} r={14} fill={PRESS.teal} />
      <Tag x={60} y={54}>
        depart
      </Tag>
      <Tag x={192} y={54}>
        arrive
      </Tag>
      <Tag x={8} y={130}>{`black hole ring ${BLACK_HOLE_OUTER_RING}`}</Tag>
      <Tag x={W - 8} y={130} anchor="end">
        {`planet ring ${PLANET_OUTER_RING}`}
      </Tag>
      <Tag x={W / 2} y={160} anchor="middle" color={PRESS.redText}>
        same sector of the arc · no drift
      </Tag>
    </Frame>
  )
}
