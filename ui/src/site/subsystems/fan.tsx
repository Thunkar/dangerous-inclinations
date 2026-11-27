/**
 * A weapon's or the sensor's reach as a fan of the black hole's rings, laid
 * on its side to fill a wide tile. Every cell is the engine's (`reach.ts`);
 * this file only draws.
 *
 * The black hole sits at the foot of the fan, the ship on ring 3 above it
 * faces prograde to the right, and port (outward) is up. A weapon that fires
 * to one side has its port mounts' reach in the card's ink and its starboard
 * mounts' in black, each block lettered P or S as the loadout's slot codes
 * are. A missile's launch flight is numbered by the step that reaches it.
 */
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { SUBSYSTEM_CARD } from '../../text/subsystemCard'
import { PATCH, reach, recoils, type Cell } from './reach'
import type { TargetingType } from './facts'
import { useHairline } from '../print/hairline'

export const STEP = 360 / SECTORS_PER_RING
const SHIP_RING = 3
const RINGS = SHIP_RING + PATCH.rings

export interface FanSize {
  /** A ring's width, mm. */
  band: number
  /** Ring 1's inner radius, mm. */
  r0: number
  /** The hole's radius, mm. */
  hole: number
}

/** The fan that fills a box `height` tall (and twice as wide). */
export function fanFor(height: number): FanSize {
  const band = (height - 0.3) / (RINGS + 0.8)
  return { band, r0: band * 0.8, hole: band * 0.62 }
}

const outer = (g: FanSize) => g.r0 + RINGS * g.band
const radius = (g: FanSize, ring: number) => g.r0 + (ring - 1) * g.band
/** Ahead is clockwise from straight up. */
const angleOf = (ahead: number) => ((-90 + ahead * STEP) * Math.PI) / 180
const pt = (r: number, a: number) =>
  `${(r * Math.cos(a)).toFixed(3)} ${(r * Math.sin(a)).toFixed(3)}`

export function wedge(g: FanSize, port: number, ahead: number): string {
  const half = ((STEP / 2) * Math.PI) / 180
  const a0 = angleOf(ahead) - half
  const a1 = angleOf(ahead) + half
  const ri = radius(g, SHIP_RING + port)
  const ro = radius(g, SHIP_RING + port + 1)
  return `M${pt(ri, a0)} L${pt(ro, a0)} A${ro} ${ro} 0 0 1 ${pt(ro, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 0 0 ${pt(ri, a0)} Z`
}

export function cellCentre(g: FanSize, port: number, ahead: number) {
  const r = radius(g, SHIP_RING + port) + g.band / 2
  const a = angleOf(ahead)
  return { x: r * Math.cos(a), y: r * Math.sin(a), r }
}

export function every(): Array<{ port: number; ahead: number }> {
  const all: Array<{ port: number; ahead: number }> = []
  for (let port = -PATCH.rings; port <= PATCH.rings; port++)
    for (let ahead = -PATCH.sectors; ahead <= PATCH.sectors; ahead++) all.push({ port, ahead })
  return all
}

/** Where a block of cells sits: the mean of their centres. */
function centreOf(g: FanSize, cells: Cell[]) {
  const ps = cells.map(c => cellCentre(g, c.port, c.ahead))
  return {
    x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
    y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
  }
}

/** A letter or number set on a cell, haloed in the cell's own colour so the hairlines stay off it. */
export function Label({
  x,
  y,
  size,
  ground,
  children,
}: {
  x: number
  y: number
  size: number
  ground: string
  children: string | number
}) {
  return (
    <text
      x={x}
      y={y + size * 0.36}
      fontSize={size}
      fontFamily={FONT_DISPLAY}
      fontWeight={700}
      textAnchor="middle"
      fill={PRESS.paper}
      stroke={ground}
      strokeWidth={size * 0.28}
      paintOrder="stroke"
    >
      {children}
    </text>
  )
}

/**
 * One subsystem's reach: the cells in the tile's
 * ink, a side weapon's starboard reach in black, a missile's well in the deep
 * paper with its launch flight in the ink.
 */
export function MiniFan({ type, size, ink }: { type: TargetingType; size: FanSize; ink: string }) {
  const g = size
  const cells = reach(type)
  const R = outer(g) + 0.3
  const thin = Math.max(0.12, g.band * 0.035)
  // The grid is pure black, not a tint: a laser printer screens a tint into dots,
  // and a 0.1mm line of dots prints soft. A solid K line a hairline wide prints sharp.
  const hair = useHairline()
  const grid = Math.max(hair, g.band * 0.04)
  const s = cellCentre(g, 0, 0)
  const port = cells.filter(c => c.zone === 'port')
  const starboard = cells.filter(c => c.zone === 'starboard')
  const flight = cells.filter(c => c.steps !== undefined)
  const note = g.band * 0.5
  return (
    <svg
      viewBox={`${-R} ${-R} ${2 * R} ${R}`}
      style={{ width: `${2 * R}mm`, height: `${R}mm`, display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      {every().map(({ port, ahead }) => (
        <path
          key={`${port},${ahead}`}
          d={wedge(g, port, ahead)}
          fill="none"
          stroke="#000"
          strokeWidth={grid}
        />
      ))}
      {cells.map(c => (
        <path
          key={`${c.port},${c.ahead}`}
          d={wedge(g, c.port, c.ahead)}
          fill={
            c.zone === 'starboard'
              ? PRESS.ink
              : c.wellwide && c.steps === undefined
                ? PRESS.paperDeep
                : ink
          }
          stroke={PRESS.paper}
          strokeWidth={Math.max(hair, thin * 1.8)}
        />
      ))}
      <path d={wedge(g, 0, 0)} fill={PRESS.paper} stroke={ink} strokeWidth={thin * 3} />
      <path
        d="M0 -1.9 L1.45 1.8 L0 0.95 L-1.45 1.8 Z"
        fill={PRESS.ink}
        transform={`translate(${s.x} ${s.y}) rotate(90) scale(${g.band / 5})`}
      />
      {recoils(type) && (
        <g fill={PRESS.ink}>
          <rect
            x={s.x - g.band * 0.06}
            y={s.y + g.band * 0.5}
            width={g.band * 0.12}
            height={g.band * 0.55}
          />
          <path
            d={`M${s.x - g.band * 0.24} ${s.y + g.band * 1.0} L${s.x + g.band * 0.24} ${s.y + g.band * 1.0} L${s.x} ${s.y + g.band * 1.38} Z`}
          />
        </g>
      )}
      {port.length > 0 && (
        <Label {...centreOf(g, port)} size={g.band * 0.7} ground={ink}>
          P
        </Label>
      )}
      {starboard.length > 0 && (
        <Label {...centreOf(g, starboard)} size={g.band * 0.7} ground={PRESS.ink}>
          S
        </Label>
      )}
      {flight.map(c => {
        const { x, y, r } = cellCentre(g, c.port, c.ahead)
        const size = Math.min(g.band * 0.55, r * ((STEP * Math.PI) / 180) * 0.7)
        if (size < 1.5) return null
        return (
          <Label key={`n${c.port},${c.ahead}`} x={x} y={y} size={size} ground={ink}>
            {c.steps!}
          </Label>
        )
      })}
      <circle cx={0} cy={0} r={g.hole} fill={PRESS.ink} />
      {port.length > 0 && starboard.length > 0 && (
        <g>
          {SUBSYSTEM_CARD.oneSide.map((line, i) => (
            <text
              key={line}
              x={-R + 0.2}
              y={-R + note * (1.05 + i * 1.12)}
              fontSize={note}
              fontFamily={FONT_DISPLAY}
              fontWeight={i === 0 ? 500 : 700}
              letterSpacing={note * 0.04}
              fill={PRESS.ink}
              stroke={PRESS.paper}
              strokeWidth={note * 0.3}
              paintOrder="stroke"
              style={{ textTransform: 'uppercase' }}
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </svg>
  )
}
