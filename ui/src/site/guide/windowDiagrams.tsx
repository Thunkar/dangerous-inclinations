/**
 * The orbital windows, drawn: a planet with the six places its station can
 * be, the black hole's ring of lanes, the circuit between the planets, and a
 * strip of turns for each reading of the station clock.
 *
 * Seen from above with sector 0 at the top and clockwise the way ships drift,
 * as the board is. Every arc, station and arrow is read from the engine
 * through `windows.ts`; the figures only choose where to put them.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import {
  BLACK_HOLE_OUTER_RING,
  PLANET_RINGS,
  SECTORS_PER_RING,
  STATION_RING,
  fill,
  wrapSector,
} from '@dangerous-inclinations/engine'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body } from '../poster'
import { useArrowHeads, type ArrowHeadSet } from '../diagram'
import { ArrowHeads } from '../DiagramParts'
import type { Row } from './windows'
import { STATION_DRIFT } from '../turn'
import {
  CIRCUIT,
  CIRCUIT_ORDER,
  CLOCK,
  PLANET_ARRIVE,
  PLANET_LEAVE,
  RING_LANES,
  bestClocks,
  planetName,
  span,
} from './windows'
import { CHEATSHEET } from '../../text/cheatsheet'

const T = CHEATSHEET.windows

/** The angle of a sector's leading edge: 0 at the top, clockwise. */
const angle = (sector: number) => (sector / SECTORS_PER_RING) * 2 * Math.PI - Math.PI / 2

const point = (cx: number, cy: number, r: number, sector: number): [number, number] => [
  cx + r * Math.cos(angle(sector)),
  cy + r * Math.sin(angle(sector)),
]

const f = (n: number) => n.toFixed(1)

/** An open arc along a circle, clockwise from sector `s0` to `s1`. */
function arcPath(cx: number, cy: number, r: number, s0: number, s1: number) {
  const [x0, y0] = point(cx, cy, r, s0)
  const [x1, y1] = point(cx, cy, r, s1)
  const large = (s1 - s0) / SECTORS_PER_RING > 0.5 ? 1 : 0
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`
}

/** A band between two radii, clockwise from sector `s0` to `s1`: a lane arc. */
function bandPath(cx: number, cy: number, r0: number, r1: number, s0: number, s1: number) {
  const [ax, ay] = point(cx, cy, r1, s0)
  const [bx, by] = point(cx, cy, r1, s1)
  const [cx2, cy2] = point(cx, cy, r0, s1)
  const [dx, dy] = point(cx, cy, r0, s0)
  const large = (s1 - s0) / SECTORS_PER_RING > 0.5 ? 1 : 0
  return (
    `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 ${large} 1 ${f(bx)} ${f(by)}` +
    `L${f(cx2)} ${f(cy2)}A${r0} ${r0} 0 ${large} 0 ${f(dx)} ${f(dy)}Z`
  )
}

/** A figure: the drawing, and what to read off it. */
export function Figure({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <Box component="figure" sx={{ m: 0, minWidth: 0 }}>
      {children}
      <Box component="figcaption" sx={{ mt: 1 }}>
        <Body size="0.9rem" color={PRESS.inkSoft}>
          {caption}
        </Body>
      </Box>
    </Box>
  )
}

/** The arrowheads every one of these diagrams draws with. */
const HEADS = { red: 3.4, ink: 4 }

function Svg({
  width,
  height,
  label,
  maxWidth,
  heads,
  children,
}: {
  width: number
  height: number
  label: string
  maxWidth?: number
  /** The diagram's own arrowheads (`useArrowHeads`), if it draws any. */
  heads?: ArrowHeadSet
  children: ReactNode
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      style={{ width: '100%', maxWidth, height: 'auto', display: 'block' }}
    >
      {heads && <ArrowHeads heads={heads} />}
      {children}
    </svg>
  )
}

/** Capitals in the poster face, placed on a sector around a circle. */
function Cap({
  x,
  y,
  children,
  anchor = 'middle',
  size = 13,
  color = PRESS.ink,
  weight = 600,
}: {
  x: number
  y: number
  children: ReactNode
  anchor?: 'start' | 'middle' | 'end'
  size?: number
  color?: string
  weight?: number
}) {
  return (
    <text
      x={f(x)}
      y={f(y)}
      textAnchor={anchor}
      dominantBaseline="central"
      fontFamily={FONT_DISPLAY}
      fontWeight={weight}
      fontSize={size}
      letterSpacing="0.08em"
      fill={color}
    >
      {children}
    </text>
  )
}

/**
 * A label outside a circle, hung away from it: one at three or nine o'clock
 * never runs back across the ring it names. Two short lines rather than one
 * long one, so the drawing stays narrow enough to read on a phone.
 */
function OuterLabel(props: {
  cx: number
  cy: number
  r: number
  sector: number
  lines: [string, string]
}) {
  const [x, y] = point(props.cx, props.cy, props.r, props.sector)
  const anchor = x < props.cx - 25 ? 'end' : x > props.cx + 25 ? 'start' : 'middle'
  return (
    <>
      {props.lines.map((line, i) => (
        <Cap key={i} x={x} y={y + (i - 0.5) * 17} anchor={anchor} size={14}>
          {line.toUpperCase()}
        </Cap>
      ))}
    </>
  )
}

const arcRange = (start: number, length: number) => span(start, start + length - 1)

/** Any planet: its rings, its two lane arcs, and the six places a station can be. */
export function StationClockDiagram() {
  const heads = useArrowHeads(HEADS)
  const W = 440
  const H = 340
  const cx = W / 2
  const cy = H / 2
  const outer = 148
  const inner = 58
  const radius = (ring: number) =>
    inner + ((ring - 1) * (outer - inner)) / (PLANET_RINGS.length - 1)
  const lane = (arc: typeof PLANET_ARRIVE) => ({
    d: bandPath(
      cx,
      cy,
      radius(arc.ring) - 8,
      radius(arc.ring) + 8,
      arc.startSector,
      arc.startSector + arc.length
    ),
    mid: arc.startSector + arc.length / 2,
    label: arcRange(arc.startSector, arc.length),
  })
  const arrive = lane(PLANET_ARRIVE)
  const leave = lane(PLANET_LEAVE)
  const stationR = radius(STATION_RING)
  const numberR = (stationR + radius(STATION_RING + 1)) / 2
  const flowR = (stationR + radius(STATION_RING - 1)) / 2
  return (
    <Svg
      heads={heads}
      width={W}
      height={H}
      maxWidth={480}
      label={fill(T.clock.diagram.label, {
        ring: STATION_RING,
        drift: STATION_DRIFT,
        readings: CLOCK.join(', '),
        arriveRing: PLANET_ARRIVE.ring,
        arriveSectors: arrive.label,
        leaveRing: PLANET_LEAVE.ring,
        leaveSectors: leave.label,
      })}
    >
      {PLANET_RINGS.map(({ ring }) => (
        <circle
          key={ring}
          cx={cx}
          cy={cy}
          r={radius(ring)}
          fill="none"
          stroke={ring === STATION_RING ? PRESS.ink : PRESS.inkFaint}
          strokeWidth={ring === STATION_RING ? 2 : 1.5}
          strokeDasharray={ring === STATION_RING ? '5 4' : undefined}
        />
      ))}
      <circle cx={cx} cy={cy} r={30} fill={PRESS.paperDeep} stroke={PRESS.ink} strokeWidth={2} />
      <Cap x={cx} y={cy} size={11}>
        {T.clock.diagram.planet}
      </Cap>

      <path d={arrive.d} fill={PRESS.paperDeep} stroke={PRESS.ink} strokeWidth={2} />
      <path d={leave.d} fill={PRESS.ink} />
      <OuterLabel
        cx={cx}
        cy={cy}
        r={outer + 16}
        sector={arrive.mid}
        lines={[T.clock.diagram.arrive, arrive.label]}
      />
      <OuterLabel
        cx={cx}
        cy={cy}
        r={outer + 16}
        sector={leave.mid}
        lines={[T.clock.diagram.leave, leave.label]}
      />

      {CLOCK.map(sector => {
        const [x, y] = point(cx, cy, stationR, sector + 0.5)
        const [lx, ly] = point(cx, cy, numberR, sector + 0.5)
        return (
          <g key={sector}>
            <rect x={f(x - 7)} y={f(y - 7)} width={14} height={14} fill={PRESS.red} />
            <Cap x={lx} y={ly} size={14} weight={700} color={PRESS.redText}>
              {sector}
            </Cap>
          </g>
        )
      })}
      <path
        d={arcPath(cx, cy, flowR, 1.5, STATION_DRIFT + 1.5)}
        fill="none"
        stroke={PRESS.ink}
        strokeWidth={2.5}
        markerEnd={heads.ink}
      />
      <text
        x={W - 8}
        y={H - 8}
        textAnchor="end"
        fontFamily={FONT_SANS}
        fontSize={11}
        fill={PRESS.inkSoft}
      >
        {fill(T.clock.diagram.foot, {
          stationRing: STATION_RING,
          laneRing: PLANET_ARRIVE.ring,
          drift: STATION_DRIFT,
        })}
      </text>
    </Svg>
  )
}

/** Black hole ring 5: six one-way lane arcs, and the short hops of the circuit. */
export function LaneRingDiagram() {
  const heads = useArrowHeads(HEADS)
  const W = 460
  const H = 340
  const cx = W / 2
  const cy = H / 2
  const r0 = 112
  const r1 = 154
  const words = (lane: (typeof RING_LANES)[number]): [string, string] => [
    lane.direction === 'outbound' ? T.lanes.diagram.out : T.lanes.diagram.in,
    planetName(lane.planetId),
  ]
  const describe = RING_LANES.map(
    lane =>
      `${words(lane).join(' ')} ${arcRange(lane.blackHoleArc.startSector, lane.blackHoleArc.length)}`
  ).join(', ')
  // A hop: off the end of an arrival arc and onto the departure arc after it.
  const hops = RING_LANES.filter(lane => lane.direction === 'inbound').filter(lane => {
    const end = wrapSector(lane.blackHoleArc.startSector + lane.blackHoleArc.length)
    return RING_LANES.some(l => l.direction === 'outbound' && l.blackHoleArc.startSector === end)
  })
  const circuit = [...CIRCUIT_ORDER, CIRCUIT_ORDER[0]].map(planetName)
  return (
    <Svg
      heads={heads}
      width={W}
      height={H}
      maxWidth={500}
      label={fill(T.lanes.diagram.label, {
        ring: BLACK_HOLE_OUTER_RING,
        arcs: describe,
        circuit: circuit.join(' to '),
      })}
    >
      {RING_LANES.map(lane => {
        const { startSector: s, length } = lane.blackHoleArc
        const out = lane.direction === 'outbound'
        const [nx, ny] = point(cx, cy, (r0 + r1) / 2, s + length / 2)
        return (
          <g key={lane.id}>
            <path
              d={bandPath(cx, cy, r0, r1, s, s + length)}
              fill={out ? PRESS.ink : PRESS.paperDeep}
              stroke={PRESS.ink}
              strokeWidth={2}
            />
            <Cap x={nx} y={ny} size={15} weight={700} color={out ? PRESS.paper : PRESS.ink}>
              {arcRange(s, length)}
            </Cap>
            <OuterLabel cx={cx} cy={cy} r={r1 + 14} sector={s + length / 2} lines={words(lane)} />
          </g>
        )
      })}
      {RING_LANES.map(lane => {
        const [x0, y0] = point(cx, cy, r0 - 5, lane.blackHoleArc.startSector)
        const [x1, y1] = point(cx, cy, r1 + 5, lane.blackHoleArc.startSector)
        return (
          <line
            key={`edge-${lane.id}`}
            x1={f(x0)}
            y1={f(y0)}
            x2={f(x1)}
            y2={f(y1)}
            stroke={PRESS.paper}
            strokeWidth={3}
          />
        )
      })}
      {hops.map(lane => {
        const { startSector: s, length } = lane.blackHoleArc
        return (
          <path
            key={`hop-${lane.id}`}
            d={arcPath(cx, cy, r0 - 18, s + length / 2 + 0.2, s + length + 1.6)}
            fill="none"
            stroke={PRESS.red}
            strokeWidth={4}
            markerEnd={heads.red}
          />
        )
      })}
      <circle cx={cx} cy={cy} r={60} fill={PRESS.ink} />
      <Cap x={cx} y={cy - 9} size={13} color={PRESS.paper}>
        {T.lanes.diagram.hole}
      </Cap>
      <Cap x={cx} y={cy + 11} size={11} weight={500} color={PRESS.paperSoft}>
        {fill(T.lanes.diagram.ring, { ring: BLACK_HOLE_OUTER_RING })}
      </Cap>
    </Svg>
  )
}

/**
 * The circuit: the planets in the order the Deliver deck's routes join them,
 * placed clockwise so the arrows turn the way the black hole does, each leg
 * labelled with the turns it takes.
 */
export function CircuitDiagram({ legTurns }: { legTurns: string }) {
  const heads = useArrowHeads(HEADS)
  const W = 460
  const H = 290
  const cx = W / 2
  const cy = 160
  const order = CIRCUIT_ORDER
  const place = new Map(
    order.map((id, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / order.length
      return [id, [cx + 165 * Math.cos(a), cy + 108 * Math.sin(a)] as [number, number]]
    })
  )
  const names = order.map(planetName)
  return (
    <Svg
      heads={heads}
      width={W}
      height={H}
      maxWidth={460}
      label={fill(T.leg.diagram.label, {
        circuit: [...names, names[0]].join(' to '),
        turns: legTurns,
      })}
    >
      {CIRCUIT.map(([from, to]) => {
        const [x0, y0] = place.get(from)!
        const [x1, y1] = place.get(to)!
        const dx = x1 - x0
        const dy = y1 - y0
        // Outward from the middle, so the label sits clear of the arrow.
        const mx = (x0 + x1) / 2
        const my = (y0 + y1) / 2
        const ox = mx - cx
        const oy = my - cy
        const len = Math.hypot(ox, oy) || 1
        return (
          <g key={`${from}-${to}`}>
            <line
              x1={f(x0 + dx * 0.2)}
              y1={f(y0 + dy * 0.2)}
              x2={f(x0 + dx * 0.78)}
              y2={f(y0 + dy * 0.78)}
              stroke={PRESS.red}
              strokeWidth={5}
              markerEnd={heads.red}
            />
            <Cap
              x={mx + (ox / len) * 22}
              y={my + (oy / len) * 22}
              size={17}
              weight={700}
              color={PRESS.redText}
            >
              {legTurns}
            </Cap>
          </g>
        )
      })}
      {order.map(id => {
        const [x, y] = place.get(id)!
        return (
          <g key={id}>
            <circle
              cx={f(x)}
              cy={f(y)}
              r={30}
              fill={PRESS.paperDeep}
              stroke={PRESS.ink}
              strokeWidth={2}
            />
            <Cap x={x} y={y} size={12}>
              {planetName(id).toUpperCase()}
            </Cap>
          </g>
        )
      })}
      <text
        x={W / 2}
        y={H - 6}
        textAnchor="middle"
        fontFamily={FONT_SANS}
        fontSize={11}
        fill={PRESS.inkSoft}
      >
        {T.leg.diagram.foot}
      </text>
    </Svg>
  )
}

/**
 * Turns for each reading of the station clock, the quickest in a solid block.
 * `row` is null while the planner is still working, and the strip holds its
 * shape with nothing in it.
 */
export function ClockStrip({
  row,
  label,
  tone = 'red',
}: {
  row: Row | null
  label: string
  tone?: 'red' | 'ink'
}) {
  const w = 64
  const h = 58
  const gap = 6
  const W = CLOCK.length * (w + gap) - gap
  const H = h + 26
  const best = row ? bestClocks(row) : []
  const solid = tone === 'red' ? PRESS.red : PRESS.ink
  const aria = row
    ? fill(T.strip.label, {
        label,
        readings: CLOCK.map((clock, i) =>
          fill(T.strip.reading, { reading: clock, turns: `${row[i] ?? T.strip.noRoute}` })
        ).join('; '),
        best: best.join(' or '),
      })
    : fill(T.strip.working, { label })
  return (
    <Box sx={{ maxWidth: 460 }}>
      <Box
        sx={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '0.8rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: PRESS.inkSoft,
          mb: 0.75,
        }}
      >
        {label}
      </Box>
      <Svg width={W} height={H} label={aria}>
        {CLOCK.map((clock, i) => {
          const x = i * (w + gap)
          const top = best.includes(clock)
          const value = row ? (row[i] ?? '–') : ''
          return (
            <g key={clock}>
              <Cap x={x + w / 2} y={9} size={13} color={PRESS.inkSoft}>
                {clock}
              </Cap>
              <rect
                x={x + 1}
                y={20}
                width={w - 2}
                height={h}
                fill={top ? solid : 'none'}
                stroke={top ? solid : row ? PRESS.ink : PRESS.inkFaint}
                strokeWidth={2}
              />
              <Cap
                x={x + w / 2}
                y={20 + h / 2 - 5}
                size={28}
                weight={700}
                color={top ? PRESS.paper : PRESS.ink}
              >
                {value}
              </Cap>
              {row && (
                <text
                  x={x + w / 2}
                  y={20 + h - 9}
                  textAnchor="middle"
                  fontFamily={FONT_DISPLAY}
                  fontSize={10}
                  letterSpacing="0.1em"
                  fill={top ? PRESS.paper : PRESS.inkSoft}
                >
                  {T.strip.turns}
                </text>
              )}
            </g>
          )
        })}
      </Svg>
    </Box>
  )
}
