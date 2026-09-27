/**
 * Missiles in flight, with the path they will take at the end of their
 * owner's next turn: the orbital drift first (a solid arc), then the flight
 * steps toward the target (dashed, rings closed first).
 *
 * A missile on its launch turn does not ride its orbit, so it has no drift
 * segment: the model asks the engine for the path, and this layer draws
 * exactly what comes back. Missiles sharing a sector stand abreast where the
 * model puts them.
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
import type { Position } from '@dangerous-inclinations/engine'
import { samePosition } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../../theme'
import type { MissilePreview, MissileToken } from '../../model'
import { BOARD } from '../palette'
import { positionPoint } from '../../geometry'
import { trackAttr, trackPoints } from '../../trajectory'
import { Track } from './OverlaysLayer'

interface MissilesLayerProps {
  missiles: ReadonlyArray<MissileToken>
  previews?: ReadonlyArray<MissilePreview>
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
  previews = [],
}: MissilesLayerProps) {
  return (
    <g className="missiles">
      {previews.map(preview => {
        const path = preview.path
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
        const { position: at, color, path, point: here, tooltip } = missile
        const drift = path[0]
        const flight = path.slice(1)

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
              <circle r={6} fill={BOARD.deep} opacity={0.6} />
              <path
                d="M 0 -6 L 3.4 4 L 0 2 L -3.4 4 Z"
                fill={color}
                stroke={BOARD.ink}
                strokeWidth={1.2}
              />
            </g>
          </g>
        )
      })}
    </g>
  )
})
