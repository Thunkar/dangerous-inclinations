/**
 * Planning overlays drawn over the board: which sectors a weapon reaches,
 * the path the turn you are building will take, and the sectors you may
 * deploy into.
 *
 * Every range answer comes from the engine (`isInWeaponRange`), tested sector
 * by sector — the UI never re-implements a rule.
 */
import { memo, useState } from 'react'
import type { Facing, MovementPlan, Position, Subsystem } from '@dangerous-inclinations/engine'
import {
  SECTORS_PER_RING,
  getSubsystemConfig,
  getWellName,
  isInWeaponRange,
} from '@dangerous-inclinations/engine'
import { FONT_MONO } from '../../../theme'
import {
  allWells,
  interpolatePositions,
  positionPoint,
  ringRadius,
  ringsOf,
  sectorWedgePath,
  type Point,
} from '../geometry'

/**
 * The one accent used for anything you may click. Every deployment sector is
 * on the same ring of the same well now, so the wedges carry no well colour —
 * they are simply the thing on the board you are being asked to click, and the
 * black hole's own colour is all but black.
 */
const DEPLOY_ACCENT = '#ffb445'
/** Route planner colour: a cool cyan, so it never reads as a lane or a weapon. */
const ROUTE_ACCENT = '#5fd3ff'

// ---------------------------------------------------------------------------
// Route planner: pick a destination sector, draw the turns to get there
// ---------------------------------------------------------------------------

/** Every sector of every ring, clickable, while a destination is being chosen. */
export const SectorPicker = memo(function SectorPicker({
  onPick,
}: {
  onPick: (position: Position) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  return (
    <g className="sector-picker" style={{ cursor: 'crosshair' }}>
      {allWells().flatMap(well =>
        ringsOf(well.id).flatMap(ring => {
          const radius = ringRadius(well.id, ring.ring)
          return Array.from({ length: SECTORS_PER_RING }, (_, sector) => {
            const key = `${well.id}:${ring.ring}:${sector}`
            const position: Position = { wellId: well.id, ring: ring.ring, sector }
            const lit = hovered === key
            return (
              <path
                key={key}
                d={sectorWedgePath(well.id, sector, radius - 13, radius + 13)}
                fill={lit ? ROUTE_ACCENT : 'rgba(126,165,205,0.04)'}
                fillOpacity={lit ? 0.5 : 1}
                stroke={lit ? ROUTE_ACCENT : 'none'}
                strokeWidth={1}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation()
                  onPick(position)
                }}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(h => (h === key ? null : h))}
              >
                <title>{`Route to ${getWellName(well.id)} R${ring.ring} S${sector}`}</title>
              </path>
            )
          })
        })
      )}
    </g>
  )
})

/** Points along one step: around the ring when staying in the well, straight across when jumping. */
function stepPoints(from: Position, to: Position): Point[] {
  if (from.wellId !== to.wellId) return [positionPoint(from), positionPoint(to)]
  const samples = 10
  return Array.from({ length: samples + 1 }, (_, i) => interpolatePositions(from, to, i / samples))
}

/** The turns of a planned route: dotted path, a numbered pip per turn, a diamond on the destination. */
export const RouteOverlay = memo(function RouteOverlay({
  route,
  color,
}: {
  route: MovementPlan
  color: string
}) {
  const dest = positionPoint(route.destination)
  return (
    <g className="route" pointerEvents="none">
      {route.steps.map((step, i) => {
        const pts = stepPoints(step.from, step.to)
        const end = pts[pts.length - 1]
        const jump = step.actionType === 'well_transfer'
        return (
          <g key={i}>
            <polyline
              points={pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeDasharray={jump ? '3 6' : '2 4'}
              opacity={0.75}
            />
            <circle
              cx={end.x}
              cy={end.y}
              r={7}
              fill="#080b11"
              stroke={color}
              strokeWidth={1.2}
              opacity={0.9}
            />
            <text
              x={end.x}
              y={end.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={8.5}
              fontFamily={FONT_MONO}
              fontWeight={700}
              fill={color}
            >
              {i + 1}
            </text>
          </g>
        )
      })}
      <path
        d={`M ${dest.x} ${dest.y - 12} L ${dest.x + 12} ${dest.y} L ${dest.x} ${dest.y + 12} L ${dest.x - 12} ${dest.y} Z`}
        fill="none"
        stroke={ROUTE_ACCENT}
        strokeWidth={2}
        opacity={0.95}
      />
    </g>
  )
})

// ---------------------------------------------------------------------------
// Weapon range
// ---------------------------------------------------------------------------

interface RangeOverlayProps {
  weapon: Subsystem
  from: Position
  facing: Facing
}

export const RangeOverlay = memo(function RangeOverlay({
  weapon,
  from,
  facing,
}: RangeOverlayProps) {
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
        points={screen.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray="7 5"
        opacity={0.9}
      />
      <circle
        cx={end.x}
        cy={end.y}
        r={9}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        opacity={0.95}
      />
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
      {positions.map(position => {
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
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
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
