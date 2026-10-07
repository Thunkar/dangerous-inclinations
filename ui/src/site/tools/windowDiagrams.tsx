/**
 * The orbital windows, drawn: a planet with the six places its station can
 * be, and a strip of turns for each reading of the station clock.
 *
 * Seen from above with sector 0 at the top and clockwise the way ships drift,
 * as the board is. Every arc, station and arrow is read from the engine
 * through `windows.ts`; the figures only choose where to put them.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import { PLANET_RINGS, SECTORS_PER_RING, STATION_RING, fill } from '@dangerous-inclinations/engine'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body } from '../poster'
import { useArrowHeads, type ArrowHeadSet } from '../diagram'
import { ArrowHeads } from '../DiagramParts'
import type { Row } from './windows'
import { STATION_DRIFT } from '../turn'
import { CLOCK, PLANET_ARRIVE, PLANET_LEAVE, bestClocks, span } from './windows'
import { WINDOWS as T } from '../../text/windows'

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

/** A figure: the drawing, and what to read off it when the text around it does not say. */
export function Figure({ caption, children }: { caption?: ReactNode; children: ReactNode }) {
  return (
    <Box component="figure" sx={{ m: 0, minWidth: 0 }}>
      {children}
      {caption && (
        <Box component="figcaption" sx={{ mt: 1 }}>
          <Body size="0.9rem" color={PRESS.inkSoft}>
            {caption}
          </Body>
        </Box>
      )}
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

/**
 * Turns for each reading of the station clock, the quickest in a solid block,
 * and the reading the route planner is set to (`now`) tabbed underneath.
 * `row` is null while the planner is still working, and the strip holds its
 * shape with nothing in it.
 */
export function ClockStrip({
  row,
  label,
  now,
  tone = 'red',
}: {
  row: Row | null
  label: string
  now: number
  tone?: 'red' | 'ink'
}) {
  const w = 64
  const h = 58
  const gap = 6
  const tab = 16
  const W = CLOCK.length * (w + gap) - gap
  const H = h + 26 + tab
  const best = row ? bestClocks(row) : []
  const solid = tone === 'red' ? PRESS.red : PRESS.ink
  const aria = row
    ? fill(T.strip.label, {
        label,
        readings: CLOCK.map((clock, i) =>
          fill(T.strip.reading, { reading: clock, turns: `${row[i] ?? T.strip.noRoute}` })
        ).join('; '),
        best: best.join(' or '),
      }) +
      ' ' +
      fill(T.strip.now, { reading: now })
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
          const here = clock === now
          const value = row ? (row[i] ?? '–') : ''
          return (
            <g key={clock}>
              <Cap
                x={x + w / 2}
                y={9}
                size={13}
                weight={here ? 700 : 600}
                color={here ? PRESS.redText : PRESS.inkSoft}
              >
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
              {here && (
                <>
                  <rect x={x + 1} y={20 + h + 2} width={w - 2} height={tab - 2} fill={PRESS.ink} />
                  <Cap x={x + w / 2} y={20 + h + 1 + tab / 2} size={10} color={PRESS.paper}>
                    {T.strip.nowTab}
                  </Cap>
                </>
              )}
            </g>
          )
        })}
      </Svg>
    </Box>
  )
}
