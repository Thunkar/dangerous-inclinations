/**
 * Loose tokens on the board: station discs and the players' Home markers.
 * A station's disc sits on its truss, an arc along its ring out to the far
 * walls of the sectors either side, where a ship docks from (the yard's
 * `STATION_REACH`). Under a station, a square in the colour of each player
 * it has bought from: a station buys one item from each player, once.
 */
import { memo } from 'react'
import type { HomeMarker, StationMarker } from '../../model'
import {
  polar,
  positionPoint,
  ringRadius,
  sectorEdgeAngle,
  wellCenter,
  wellColor,
} from '../../geometry'
import { STATION_REACH } from '../../../../ships/station'
import { BOARD } from '../palette'
import { homeLabel, stationLabel } from '../../labels'

/** The sold-at squares under a station: their side and the step between them. */
const SOLD_SIZE = 7
const SOLD_PITCH = 9
/** The truss's stroke, and how far its end posts stand either side of the ring. */
const TRUSS_WIDTH = 3
const POST_HALF = 9

interface MarkersLayerProps {
  stations: ReadonlyArray<StationMarker>
  homes: ReadonlyArray<HomeMarker>
}

export const MarkersLayer = memo(function MarkersLayer({ stations, homes }: MarkersLayerProps) {
  return (
    <g className="markers">
      {homes.map(home => {
        const p = positionPoint(home.position)
        return (
          <g key={`home-${home.playerId}`} opacity={0.8}>
            <title>{homeLabel(home)}</title>
            {/* Landing-pad brackets at the four corners: a berth, not a hull outline
                (a ship parked on its Home sits inside them). */}
            {[
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ].map(([sx, sy]) => (
              <path
                key={`${sx}${sy}`}
                d={`M ${p.x + sx * 13} ${p.y + sy * 7} L ${p.x + sx * 13} ${p.y + sy * 13} L ${p.x + sx * 7} ${p.y + sy * 13}`}
                fill="none"
                stroke={home.color}
                strokeWidth={1.6}
                strokeLinecap="square"
              />
            ))}
          </g>
        )
      })}

      {stations.map(station => {
        const p = positionPoint(station.position)
        const color = wellColor(station.planetId)
        const { wellId, ring, sector } = station.position
        const centre = wellCenter(wellId)
        const radius = ringRadius(wellId, ring)
        const ends = [sector - STATION_REACH, sector + STATION_REACH + 1].map(edge =>
          sectorEdgeAngle(wellId, edge)
        )
        const [t0, t1] = ends.map(a => polar(centre, radius, a))
        return (
          <g key={station.id}>
            <title>{stationLabel(station)}</title>
            <path
              d={`M ${t0.x} ${t0.y} A ${radius} ${radius} 0 0 1 ${t1.x} ${t1.y}`}
              fill="none"
              stroke={color}
              strokeWidth={TRUSS_WIDTH}
            />
            {ends.map(a => {
              const inner = polar(centre, radius - POST_HALF, a)
              const outer = polar(centre, radius + POST_HALF, a)
              return (
                <line
                  key={a}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={color}
                  strokeWidth={TRUSS_WIDTH}
                />
              )
            })}
            <circle cx={p.x} cy={p.y} r={10} fill={BOARD.deep} stroke={color} strokeWidth={2.5} />
            <circle cx={p.x} cy={p.y} r={3.5} fill={color} />
            <line x1={p.x - 15} y1={p.y} x2={p.x + 15} y2={p.y} stroke={color} strokeWidth={1.6} />
            <line x1={p.x} y1={p.y - 15} x2={p.x} y2={p.y + 15} stroke={color} strokeWidth={1.6} />
            {station.soldBy.map((seller, i) => (
              <rect
                key={seller.playerId}
                x={p.x + (i - (station.soldBy.length - 1) / 2) * SOLD_PITCH - SOLD_SIZE / 2}
                y={p.y + 18}
                width={SOLD_SIZE}
                height={SOLD_SIZE}
                fill={seller.color}
                stroke={BOARD.deep}
                strokeWidth={1}
              />
            ))}
          </g>
        )
      })}
    </g>
  )
})
