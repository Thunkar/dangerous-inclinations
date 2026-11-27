/**
 * Two small fans side by side, the ship facing prograde and then retrograde,
 * for the weapons whose reach turns with the ship: the railgun, whose recoil
 * pushes against the facing, and the two broadsides, whose port and
 * starboard mounts each fire off their own side.
 *
 * Unlike the single fans these are drawn in the board's frame, so the two
 * facings can be compared: the black hole below, prograde to the right,
 * outward up. Every cell is asked of the engine's `isInWeaponRange` from a
 * ship on black hole ring 3 facing each way, and the recoil of `recoilRing`.
 */
import {
  BLACK_HOLE_ID,
  isInWeaponRange,
  recoilRing,
  type Facing,
  type Position,
  type Subsystem,
} from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { MOUNTS } from '../../ships/mounts'
import { cellCentre, every, fanFor, wedge, type FanSize } from './fan'
import { SUBSYSTEM_CARD } from '../../text/subsystemCard'
import { useHairline } from '../print/hairline'

export type FacingType = 'railgun' | 'laser' | 'plasma_cannon'
export const FACING_TYPES: readonly FacingType[] = ['railgun', 'laser', 'plasma_cannon']

const SHIP_RING = 3
const SHIP_SECTOR = 12
const FACINGS: Facing[] = ['prograde', 'retrograde']

/** The four flank mounts, port first, as the loadout cards name them. */
const SIDE_MOUNTS = MOUNTS.filter(m => m.group === 'side')
const isPort = (index: number) => index < 2
const PORT_CODES = SIDE_MOUNTS.filter(m => isPort(m.index)).map(m => m.short)
const STARBOARD_CODES = SIDE_MOUNTS.filter(m => !isPort(m.index)).map(m => m.short)

function mounted(type: FacingType, group: 'forward' | 'side', index: number): Subsystem {
  return {
    id: 'probe',
    type,
    allocatedEnergy: 0,
    usedThisTurn: false,
    spentThisTurn: 0,
    isBroken: false,
    isRevealed: true,
    slotGroup: group,
    slotIndex: index,
  }
}

interface BoardCell {
  /** Rings outward of the ship. */
  out: number
  /** Sectors prograde of the ship. */
  along: number
  zone: 'bow' | 'port' | 'starboard'
}

/** What a weapon reaches from a ship facing one way, in the board's frame. */
function reachFacing(type: FacingType, facing: Facing): BoardCell[] {
  const ship = { wellId: BLACK_HOLE_ID, ring: SHIP_RING, sector: SHIP_SECTOR, facing }
  const at = (out: number, along: number): Position => ({
    wellId: BLACK_HOLE_ID,
    ring: SHIP_RING + out,
    sector: SHIP_SECTOR + along,
  })
  const cells: BoardCell[] = []
  for (const { port: out, ahead: along } of every()) {
    if (out === 0 && along === 0) continue
    if (type === 'railgun') {
      if (isInWeaponRange(mounted(type, 'forward', 0), ship, at(out, along)))
        cells.push({ out, along, zone: 'bow' })
      continue
    }
    const hits = SIDE_MOUNTS.filter(m =>
      isInWeaponRange(mounted(type, 'side', m.index), ship, at(out, along))
    )
    if (hits.length === 0) continue
    cells.push({ out, along, zone: isPort(hits[0].index) ? 'port' : 'starboard' })
  }
  return cells
}

/** The ship, its port half in the card's ink and its starboard half black when its sides matter. */
function Ship({
  x,
  y,
  facing,
  scale,
  ink,
  sided,
}: {
  x: number
  y: number
  facing: Facing
  scale: number
  ink: string
  sided: boolean
}) {
  // Drawn nose up, port on the left; turned to face along the ring.
  const turn = facing === 'prograde' ? 90 : -90
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn}) scale(${scale})`}>
      <path
        d="M0 -2.2 L1.7 2 L0 1.1 L-1.7 2 Z"
        fill="none"
        stroke={PRESS.paper}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <path d="M0 -2.2 L0 1.1 L-1.7 2 Z" fill={sided ? ink : PRESS.ink} />
      <path d="M0 -2.2 L1.7 2 L0 1.1 Z" fill={PRESS.ink} />
    </g>
  )
}

/** One fan, its hole at (cx, cy). */
function Fan({
  type,
  facing,
  g,
  cx,
  cy,
  ink,
}: {
  type: FacingType
  facing: Facing
  g: FanSize
  cx: number
  cy: number
  ink: string
}) {
  const cells = reachFacing(type, facing)
  const thin = Math.max(0.12, g.band * 0.035)
  // The grid is pure black, not a tint: a laser printer screens a tint into dots,
  // and a 0.1mm line of dots prints soft. A solid K line a hairline wide prints sharp.
  const hair = useHairline()
  const grid = Math.max(hair, g.band * 0.04)
  const s = cellCentre(g, 0, 0)
  const recoil =
    type === 'railgun'
      ? (recoilRing({ wellId: BLACK_HOLE_ID, ring: SHIP_RING, facing }) ?? SHIP_RING) - SHIP_RING
      : 0
  return (
    <g transform={`translate(${cx} ${cy})`}>
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
          key={`${c.out},${c.along}`}
          d={wedge(g, c.out, c.along)}
          fill={c.zone === 'starboard' ? PRESS.ink : ink}
          stroke={PRESS.paper}
          strokeWidth={Math.max(hair, thin * 1.8)}
        />
      ))}
      <path d={wedge(g, 0, 0)} fill={PRESS.paper} stroke={ink} strokeWidth={thin * 2.5} />
      {recoil !== 0 && (
        <g fill={PRESS.ink}>
          {/* One ring against the facing: an arrow from the ship onto the ring it is pushed to. */}
          <rect
            x={s.x - g.band * 0.11}
            y={recoil < 0 ? s.y + g.band * 0.4 : s.y - g.band * 1.3}
            width={g.band * 0.22}
            height={g.band * 0.9}
          />
          <path
            d={
              recoil < 0
                ? `M${s.x - g.band * 0.4} ${s.y + g.band * 1.2} L${s.x + g.band * 0.4} ${s.y + g.band * 1.2} L${s.x} ${s.y + g.band * 1.85} Z`
                : `M${s.x - g.band * 0.4} ${s.y - g.band * 1.2} L${s.x + g.band * 0.4} ${s.y - g.band * 1.2} L${s.x} ${s.y - g.band * 1.85} Z`
            }
          />
        </g>
      )}
      <Ship
        x={s.x}
        y={s.y}
        facing={facing}
        scale={g.band / 5.4}
        ink={ink}
        sided={type !== 'railgun'}
      />
      {/* The hole's upper half: the lower would run into the fan below. */}
      <path d={`M${-g.hole} 0 A${g.hole} ${g.hole} 0 0 1 ${g.hole} 0 Z`} fill={PRESS.ink} />
    </g>
  )
}

function Caption({
  x,
  y,
  size,
  anchor = 'middle',
  weight = 700,
  children,
}: {
  x: number
  y: number
  size: number
  anchor?: 'start' | 'middle' | 'end'
  weight?: number
  children: string
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontFamily={FONT_DISPLAY}
      fontWeight={weight}
      textAnchor={anchor}
      letterSpacing={size * 0.06}
      fill={PRESS.ink}
      style={{ textTransform: 'uppercase' }}
    >
      {children}
    </text>
  )
}

/** The gap between the two fans, mm. */
const FAN_GAP = 0.6

/** The labels' column beside fans set in a box `w` x `h`: what the stacked fans leave. */
export const labelColumn = (w: number, h: number) => w - (h - FAN_GAP) - 1.2

/**
 * Both facings in one box `w` x `h` mm: the fans stacked on the left, as
 * large as the box's height allows, each named beside it, the mounts' key
 * under the first name.
 */
export function FacingFans({
  type,
  ink,
  w,
  h,
}: {
  type: FacingType
  ink: string
  w: number
  h: number
}) {
  const R = (h - FAN_GAP) / 2
  const g = fanFor(R)
  const sided = type !== 'railgun'
  const x0 = 2 * R + 1.2
  const label = 2.3
  const key = 2
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: `${w}mm`, height: `${h}mm`, display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      {FACINGS.map((facing, i) => {
        const top = i * (R + FAN_GAP)
        return (
          <g key={facing}>
            <Fan type={type} facing={facing} g={g} cx={R} cy={top + R} ink={ink} />
            <Caption x={x0} y={top + 2.4} size={label} anchor="start">
              {SUBSYSTEM_CARD.pictures[facing]}
            </Caption>
          </g>
        )
      })}
      {sided && (
        <g>
          <rect x={x0} y={4.6} width={2.2} height={2.2} fill={ink} />
          <Caption x={x0 + 3} y={6.5} size={key} anchor="start" weight={600}>
            {PORT_CODES.join(' ')}
          </Caption>
          <rect x={x0} y={7.9} width={2.2} height={2.2} fill={PRESS.ink} />
          <Caption x={x0 + 3} y={9.8} size={key} anchor="start" weight={600}>
            {STARBOARD_CODES.join(' ')}
          </Caption>
        </g>
      )}
    </svg>
  )
}

export const isFacingType = (type: string): type is FacingType =>
  (FACING_TYPES as readonly string[]).includes(type)
