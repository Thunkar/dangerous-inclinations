/**
 * Planning overlays drawn over the board: which sectors a weapon reaches,
 * the path the turn you are building will take, and the sectors you may
 * deploy into.
 *
 * Every range answer comes from the engine, tested sector by sector — the
 * sweep lives in the board model now, so both boards shade the same wedges
 * and no renderer re-implements a rule.
 *
 * The shape of a track is shared too: `trajectory.ts` bows a path off the ring
 * it rides so the dashes are not drawn on the ring's own ink, and both boards
 * ask it for the same polyline. It names no renderer and imports no `three`;
 * it only happens to sit beside the 3D overlays that first needed it. `Track`,
 * the polyline drawn twice so it carries a dark edge, lives here and the
 * missile layer borrows it, for the same reason: one ink for every plan.
 */
import { memo, useState } from 'react'
import type { MovementPlan, Position } from '@dangerous-inclinations/engine'
import { SECTORS_PER_RING, getWellName } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../../../theme'
import { allWells, positionPoint, ringRadius, ringsOf, sectorWedgePath } from '../../geometry'
import { trackAttr, trackPoints } from '../../trajectory'

/**
 * The one accent used for anything you may click. Every deployment sector is
 * on the same ring of the same well now, so the wedges carry no well colour —
 * they are simply the thing on the board you are being asked to click, and the
 * black hole's own colour is all but black.
 */
const DEPLOY_ACCENT = '#ffb445'
/** Route planner colour: a cool cyan, so it never reads as a lane or a weapon. */
const ROUTE_ACCENT = '#5fd3ff'

/**
 * Every track on the board is drawn twice: once in the table's felt, a little
 * wider, and then in its own colour. The felt is what separates a dashed path
 * from the ring, the lane or the shaded wedge it crosses, and it is measured
 * against the line's own width so it stays in proportion at any board scale.
 * The edge is only ever wider, never longer: a rounded cap on a two-unit dot
 * would swallow the dot it is supposed to set off.
 */
const EDGE_SCALE = 1.9
const EDGE_OPACITY = 0.8

/** A track and the felt edge under it: the same polyline, drawn twice. */
export function Track({
  points,
  color,
  width,
  dash,
  opacity = 1,
}: {
  points: string
  color: string
  width: number
  dash?: string
  opacity?: number
}) {
  return (
    <>
      <polyline
        points={points}
        fill="none"
        stroke={TABLE.felt}
        strokeWidth={width * EDGE_SCALE}
        strokeDasharray={dash}
        opacity={EDGE_OPACITY}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        opacity={opacity}
      />
    </>
  )
}

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

/**
 * The turns of a planned route: dotted path, a numbered pip per turn, a diamond
 * on the destination.
 *
 * All of it in the route accent, never the player's colour. A route is a
 * proposal the planner found, several turns long; the planned path beside it is
 * the move you are actually committing this turn, and that one is yours. Drawing
 * both in your colour made two different things look like one — and this board
 * already printed the route's destination diamond in the accent, so the legs
 * were the half that was out of step. The 3D board has always drawn it this way.
 */
export const RouteOverlay = memo(function RouteOverlay({ route }: { route: MovementPlan }) {
  const dest = positionPoint(route.destination)
  return (
    <g className="route" pointerEvents="none">
      {route.steps.map((step, i) => {
        const jump = step.actionType === 'well_transfer'
        // A jump is neither an arc nor a ride along any ring: it is the straight
        // line between two wells, and it is the one leg that is never bowed.
        const pts = trackPoints([step.from, step.to], jump ? 'chord' : 'arc')
        const end = positionPoint(step.to)
        return (
          <g key={i}>
            <Track
              points={trackAttr(pts)}
              color={ROUTE_ACCENT}
              width={1.8}
              dash={jump ? '3 6' : '2 4'}
              opacity={0.75}
            />
            <circle
              cx={end.x}
              cy={end.y}
              r={7}
              fill="#080b11"
              stroke={ROUTE_ACCENT}
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
              fill={ROUTE_ACCENT}
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

/** The sectors the focus weapon reaches — asked of the engine in the model. */
export const RangeOverlay = memo(function RangeOverlay({ cells }: { cells: Position[] }) {
  if (cells.length === 0) return null

  return (
    <g className="range-overlay" pointerEvents="none">
      {cells.map(({ wellId, ring, sector }) => {
        const radius = ringRadius(wellId, ring)
        return (
          <path
            key={`${ring}-${sector}`}
            d={sectorWedgePath(wellId, sector, radius - 13, radius + 13)}
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
  // The arcs the ship actually rides, bowed clear of the rings they ride — the
  // same polyline the 3D board draws, from the same helper.
  const track = trackPoints(points, 'arc')
  const end = positionPoint(points[points.length - 1])
  return (
    <g className="planned-path" pointerEvents="none">
      <Track points={trackAttr(track)} color={color} width={2.5} dash="7 5" opacity={0.9} />
      <circle
        cx={end.x}
        cy={end.y}
        r={9}
        fill="none"
        stroke={TABLE.felt}
        strokeWidth={5}
        opacity={EDGE_OPACITY}
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
      <circle cx={end.x} cy={end.y} r={4.5} fill={TABLE.felt} opacity={EDGE_OPACITY} />
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
            key={`${position.wellId}-${position.ring}-${position.sector}`}
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
