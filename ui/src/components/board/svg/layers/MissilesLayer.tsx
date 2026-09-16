/**
 * Missiles in flight, with the path they will take at the end of their
 * owner's next turn: the orbital drift first (a solid arc), then up to three
 * flight steps toward the target (dashed, rings closed first).
 *
 * A missile launched after its ship had already moved rode along with the
 * ship, so it has no drift segment this turn — the model asks the engine for
 * the path, and this layer draws exactly what comes back.
 *
 * A launch you have queued but not yet sent is drawn the same way, from the
 * position it would be fired at, so you can see where it lands before you
 * commit the turn.
 *
 * Both tracks bow clear of the ring they ride (`trajectory.ts`) and carry the
 * planning layer's dark edge (`Track`), so a drift is never mistaken for the
 * ring that carries it.
 */
import { memo } from 'react'
import type { Missile, Position } from '@dangerous-inclinations/engine'
import { samePosition } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import type { MissilePreview } from '../../model'
import { positionPoint } from '../../geometry'
import { trackAttr, trackPoints } from '../../trajectory'
import { Track } from './OverlaysLayer'

const MISSILE_TOOLTIP =
  'Rides its orbit, then flies up to 3 steps toward the target (rings first). ' +
  'Launched after moving? It already rode along — no drift this turn. 3 flights max.'

interface MissilesLayerProps {
  missiles: ReadonlyArray<Missile>
  colorOf: (playerId: string) => string
  nameOf: (playerId: string) => string
  previews?: ReadonlyArray<MissilePreview>
  /** Projected path per missile id and per preview id, from the model. */
  paths: Record<string, Position[]>
}

/** The drift: the arc the ring carries the warhead along, bowed clear of it. */
function driftPoints(from: Position, to: Position): string {
  return trackAttr(trackPoints([from, to], 'arc'))
}

/** The flight: the straight steps toward the target, bowed where one rides a ring. */
function flightPoints(path: ReadonlyArray<Position>): string {
  return trackAttr(trackPoints(path, 'chord'))
}

export const MissilesLayer = memo(function MissilesLayer({
  missiles,
  colorOf,
  nameOf,
  previews = [],
  paths,
}: MissilesLayerProps) {
  return (
    <g className="missiles">
      {previews.map(preview => {
        const path = paths[preview.id] ?? []
        const start = positionPoint(preview.from)
        const drift = path[0]
        const end = path.length > 0 ? positionPoint(path[path.length - 1]) : start
        return (
          <g key={`preview-${preview.id}`} opacity={0.55} pointerEvents="none">
            <title>{preview.label}</title>
            {drift && !samePosition(preview.from, drift) && (
              <Track
                points={driftPoints(preview.from, drift)}
                color={preview.color}
                width={1.6}
                dash="2 3"
              />
            )}
            {path.length > 1 && (
              <Track points={flightPoints(path)} color={preview.color} width={1.6} dash="4 5" />
            )}
            <circle
              cx={start.x}
              cy={start.y}
              r={4}
              fill="none"
              stroke={TABLE.felt}
              strokeWidth={3.4}
            />
            <circle
              cx={start.x}
              cy={start.y}
              r={4}
              fill="none"
              stroke={preview.color}
              strokeWidth={1.6}
            />
            <circle cx={end.x} cy={end.y} r={4.5} fill={TABLE.felt} />
            <circle cx={end.x} cy={end.y} r={3} fill={preview.color} />
          </g>
        )
      })}

      {missiles.map(missile => {
        const at: Position = { wellId: missile.wellId, ring: missile.ring, sector: missile.sector }
        const color = colorOf(missile.ownerId)
        const path = paths[missile.id] ?? []
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
              <Track points={driftPoints(at, drift)} color={color} width={2} opacity={0.8} />
            )}

            {flight.length > 0 && drift && (
              <Track
                points={flightPoints([drift, ...flight])}
                color={color}
                width={1.8}
                dash="5 4"
                opacity={0.8}
              />
            )}

            {flight.length > 0 &&
              (() => {
                const end = positionPoint(flight[flight.length - 1])
                return (
                  <g>
                    <circle cx={end.x} cy={end.y} r={5.2} fill={TABLE.felt} opacity={0.8} />
                    <circle cx={end.x} cy={end.y} r={3.5} fill={color} opacity={0.85} />
                  </g>
                )
              })()}

            <g transform={`translate(${here.x} ${here.y})`}>
              <circle r={6} fill="#05070b" opacity={0.6} />
              <path
                d="M 0 -6 L 3.4 4 L 0 2 L -3.4 4 Z"
                fill={color}
                stroke="#05070b"
                strokeWidth={1.2}
              />
            </g>
          </g>
        )
      })}
    </g>
  )
})
