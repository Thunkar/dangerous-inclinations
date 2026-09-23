/**
 * Loose tokens on the board: station discs and the players' Home markers.
 */
import { memo } from 'react'
import type { Station } from '@dangerous-inclinations/engine'
import { getWellName } from '@dangerous-inclinations/engine'
import type { HomeMarker } from '../../model'
import { positionPoint, wellColor } from '../../geometry'
import { BOARD } from '../palette'

interface MarkersLayerProps {
  stations: ReadonlyArray<Station>
  homes: ReadonlyArray<HomeMarker>
}

export const MarkersLayer = memo(function MarkersLayer({ stations, homes }: MarkersLayerProps) {
  return (
    <g className="markers">
      {homes.map((home) => {
        const p = positionPoint(home.position)
        return (
          <g key={`home-${home.playerId}`} opacity={0.8}>
            <title>{`${home.name}'s Home · ${getWellName(home.position.wellId)} R${home.position.ring} S${home.position.sector}`}</title>
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

      {stations.map((station) => {
        const p = positionPoint({ wellId: station.planetId, ring: station.ring, sector: station.sector })
        const color = wellColor(station.planetId)
        return (
          <g key={station.id}>
            <title>{`${getWellName(station.planetId)} Station · dock here to load, deliver, repair and reload`}</title>
            <circle cx={p.x} cy={p.y} r={10} fill={BOARD.deep} stroke={color} strokeWidth={2.5} />
            <circle cx={p.x} cy={p.y} r={3.5} fill={color} />
            <line x1={p.x - 15} y1={p.y} x2={p.x + 15} y2={p.y} stroke={color} strokeWidth={1.6} />
            <line x1={p.x} y1={p.y - 15} x2={p.x} y2={p.y + 15} stroke={color} strokeWidth={1.6} />
          </g>
        )
      })}
    </g>
  )
})
