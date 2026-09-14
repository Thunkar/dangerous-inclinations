/**
 * Planning overlays drawn over the board: which sectors a weapon reaches,
 * the path the turn you are building will take, and the sectors you may
 * deploy into.
 *
 * Every range answer comes from the engine (`isInWeaponRange`), tested sector
 * by sector — the UI never re-implements a rule.
 */
import { memo } from 'react'
import type { Facing, Position, Subsystem } from '@dangerous-inclinations/engine'
import {
  SECTORS_PER_RING,
  getSubsystemConfig,
  getWellName,
  isInWeaponRange,
} from '@dangerous-inclinations/engine'
import { positionPoint, ringRadius, ringsOf, sectorWedgePath } from '../geometry'

/**
 * The one accent used for anything you may click. Every deployment sector is
 * on the same ring of the same well now, so the wedges carry no well colour —
 * they are simply the thing on the board you are being asked to click, and the
 * black hole's own colour is all but black.
 */
const DEPLOY_ACCENT = '#ffb445'

// ---------------------------------------------------------------------------
// Weapon range
// ---------------------------------------------------------------------------

interface RangeOverlayProps {
  weapon: Subsystem
  from: Position
  facing: Facing
}

export const RangeOverlay = memo(function RangeOverlay({ weapon, from, facing }: RangeOverlayProps) {
  if (!getSubsystemConfig(weapon.type).weaponStats) return null
  const attacker = { wellId: from.wellId, ring: from.ring, sector: from.sector, facing }
  const cells: Array<{ ring: number; sector: number }> = []
  for (const ring of ringsOf(from.wellId)) {
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      if (isInWeaponRange(weapon, attacker, { wellId: from.wellId, ring: ring.ring, sector })) {
        cells.push({ ring: ring.ring, sector })
      }
    }
  }
  if (cells.length === 0) return null

  return (
    <g className="range-overlay" pointerEvents="none">
      {cells.map(({ ring, sector }) => {
        const radius = ringRadius(from.wellId, ring)
        return (
          <path
            key={`${ring}-${sector}`}
            d={sectorWedgePath(from.wellId, sector, radius - 13, radius + 13)}
            fill="#ffb445"
            opacity={0.14}
            stroke="#ffb445"
            strokeWidth={0.6}
            strokeOpacity={0.4}
          />
        )
      })}
    </g>
  )
})

// ---------------------------------------------------------------------------
// Planned path
// ---------------------------------------------------------------------------

export const PlannedPath = memo(function PlannedPath({
  points,
  color,
}: {
  points: ReadonlyArray<Position>
  color: string
}) {
  if (points.length < 2) return null
  const screen = points.map(positionPoint)
  const end = screen[screen.length - 1]
  return (
    <g className="planned-path" pointerEvents="none">
      <polyline
        points={screen.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray="7 5"
        opacity={0.9}
      />
      <circle cx={end.x} cy={end.y} r={9} fill="none" stroke={color} strokeWidth={2.5} opacity={0.95} />
      <circle cx={end.x} cy={end.y} r={3} fill={color} />
    </g>
  )
})

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

export const DeploymentSectors = memo(function DeploymentSectors({
  positions,
  onPick,
  hovered,
  onHover,
}: {
  positions: ReadonlyArray<Position>
  onPick: (position: Position) => void
  hovered: Position | null
  onHover: (position: Position | null) => void
}) {
  return (
    <g className="deployment">
      {positions.map((position) => {
        const radius = ringRadius(position.wellId, position.ring)
        const isHovered =
          hovered?.wellId === position.wellId &&
          hovered.ring === position.ring &&
          hovered.sector === position.sector
        return (
          <g
            key={`${position.wellId}-${position.sector}`}
            style={{ cursor: 'pointer' }}
            /* Claim the gesture before the board's pan handler sees it. */
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onPick(position)
            }}
            onMouseEnter={() => onHover(position)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{`Place your ship here — ${getWellName(position.wellId)} R${position.ring} S${position.sector}. This sector becomes your Home.`}</title>
            <path
              d={sectorWedgePath(position.wellId, position.sector, radius - 16, radius + 16)}
              fill={DEPLOY_ACCENT}
              fillOpacity={isHovered ? 0.55 : 0.22}
              stroke={DEPLOY_ACCENT}
              strokeWidth={isHovered ? 2 : 1}
              style={{
                filter: isHovered ? `drop-shadow(0 0 10px ${DEPLOY_ACCENT})` : undefined,
                animation: isHovered ? undefined : 'di-breathe 2.6s ease-in-out infinite',
              }}
            />
          </g>
        )
      })}
    </g>
  )
})
