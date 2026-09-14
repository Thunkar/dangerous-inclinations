/**
 * Missiles in flight, with the path they will take at the end of their
 * owner's next turn: the orbital drift first (a solid arc), then up to three
 * flight steps toward the target (dashed, rings closed first).
 *
 * A missile launched after its ship had already moved rode along with the
 * ship, so it has no drift segment this turn — `projectMissilePath` returns a
 * path that starts where it sits, and we draw exactly that.
 *
 * A launch you have queued but not yet sent is drawn the same way, from the
 * position it would be fired at, so you can see where it lands before you
 * commit the turn.
 */
import { memo } from 'react'
import type { Missile, Position } from '@dangerous-inclinations/engine'
import { projectMissilePath, samePosition } from '@dangerous-inclinations/engine'
import { interpolatePositions, positionPoint } from '../geometry'

const MISSILE_TOOLTIP =
  'Rides its orbit, then flies up to 3 steps toward the target (rings first). ' +
  'Launched after moving? It already rode along — no drift this turn. 3 flights max.'

/** A launch sitting in the plan, not yet submitted. */
export interface MissilePreview {
  id: string
  from: Position
  target: Position
  /** Launched after the ship's move: it rode along, so it does not drift again. */
  launchedAfterMove: boolean
  color: string
  label: string
}

interface MissilesLayerProps {
  missiles: ReadonlyArray<Missile>
  /** Current position of a player's ship, for the missile's aim point. */
  positionOf: (playerId: string) => Position | null
  colorOf: (playerId: string) => string
  nameOf: (playerId: string) => string
  previews?: ReadonlyArray<MissilePreview>
}

function arcPoints(from: Position, to: Position): string {
  const samples = 6
  return Array.from({ length: samples + 1 }, (_, i) => {
    const p = interpolatePositions(from, to, i / samples)
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
  }).join(' ')
}

function pointsOf(path: ReadonlyArray<Position>): string {
  return path
    .map((p) => {
      const q = positionPoint(p)
      return `${q.x.toFixed(1)},${q.y.toFixed(1)}`
    })
    .join(' ')
}

export const MissilesLayer = memo(function MissilesLayer({
  missiles,
  positionOf,
  colorOf,
  nameOf,
  previews = [],
}: MissilesLayerProps) {
  return (
    <g className="missiles">
      {previews.map((preview) => {
        const path = projectMissilePath(
          { ...preview.from, launchedAfterMove: preview.launchedAfterMove },
          preview.target,
        )
        const start = positionPoint(preview.from)
        const drift = path[0]
        const end = path.length > 0 ? positionPoint(path[path.length - 1]) : start
        return (
          <g key={`preview-${preview.id}`} opacity={0.55} pointerEvents="none">
            <title>{preview.label}</title>
            {drift && !samePosition(preview.from, drift) && (
              <polyline
                points={arcPoints(preview.from, drift)}
                fill="none"
                stroke={preview.color}
                strokeWidth={1.6}
                strokeDasharray="2 3"
              />
            )}
            {path.length > 1 && (
              <polyline
                points={pointsOf(path)}
                fill="none"
                stroke={preview.color}
                strokeWidth={1.6}
                strokeDasharray="4 5"
              />
            )}
            <circle cx={start.x} cy={start.y} r={4} fill="none" stroke={preview.color} strokeWidth={1.6} />
            <circle cx={end.x} cy={end.y} r={3} fill={preview.color} />
          </g>
        )
      })}

      {missiles.map((missile) => {
        const at: Position = { wellId: missile.wellId, ring: missile.ring, sector: missile.sector }
        const target = positionOf(missile.targetId)
        const color = colorOf(missile.ownerId)
        const path = target ? projectMissilePath(missile, target) : []
        const drift = path[0]
        const flight = path.slice(1)
        const here = positionPoint(at)
        const tooltip = `${nameOf(missile.ownerId)}'s missile → ${nameOf(missile.targetId)} · ${
          3 - missile.movesMade
        } flight(s) left. ${MISSILE_TOOLTIP}`

        return (
          <g key={missile.id}>
            <title>{tooltip}</title>

            {drift && !samePosition(at, drift) && (
              <polyline
                points={arcPoints(at, drift)}
                fill="none"
                stroke={color}
                strokeWidth={2}
                opacity={0.55}
              />
            )}

            {flight.length > 0 && drift && (
              <polyline
                points={pointsOf([drift, ...flight])}
                fill="none"
                stroke={color}
                strokeWidth={1.8}
                strokeDasharray="5 4"
                opacity={0.8}
              />
            )}

            {flight.length > 0 &&
              (() => {
                const end = positionPoint(flight[flight.length - 1])
                return <circle cx={end.x} cy={end.y} r={3.5} fill={color} opacity={0.85} />
              })()}

            <g transform={`translate(${here.x} ${here.y})`}>
              <circle r={6} fill="#05070b" opacity={0.6} />
              <path d="M 0 -6 L 3.4 4 L 0 2 L -3.4 4 Z" fill={color} stroke="#05070b" strokeWidth={1.2} />
            </g>
          </g>
        )
      })}
    </g>
  )
})
