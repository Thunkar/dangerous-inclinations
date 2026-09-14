/**
 * Loose tokens on the board: station discs and the players' Home markers.
 */
import { memo } from 'react'
import type { Position, Station } from '@dangerous-inclinations/engine'
import { getWellName } from '@dangerous-inclinations/engine'
import { positionPoint, wellColor } from '../geometry'

export interface HomeMarker {
  playerId: string
  name: string
  color: string
  position: Position
}

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
          <g key={`home-${home.playerId}`} opacity={0.85}>
            <title>{`${home.name}'s Home — ${getWellName(home.position.wellId)} R${home.position.ring} S${home.position.sector}`}</title>
            <path
              d={`M ${p.x} ${p.y - 13} L ${p.x + 10} ${p.y - 3} L ${p.x + 10} ${p.y + 11} L ${p.x - 10} ${p.y + 11} L ${p.x - 10} ${p.y - 3} Z`}
              fill="none"
              stroke={home.color}
              strokeWidth={1.6}
              strokeDasharray="3 2"
            />
          </g>
        )
      })}

      {stations.map((station) => {
        const p = positionPoint({ wellId: station.planetId, ring: station.ring, sector: station.sector })
        const color = wellColor(station.planetId)
        return (
          <g key={station.id}>
            <title>{`${getWellName(station.planetId)} Station — dock here to load, deliver, repair and reload`}</title>
            <circle cx={p.x} cy={p.y} r={10} fill="#080b11" stroke={color} strokeWidth={2.5} />
            <circle cx={p.x} cy={p.y} r={3.5} fill={color} />
            <line x1={p.x - 15} y1={p.y} x2={p.x + 15} y2={p.y} stroke={color} strokeWidth={1.6} />
            <line x1={p.x} y1={p.y - 15} x2={p.x} y2={p.y + 15} stroke={color} strokeWidth={1.6} />
          </g>
        )
      })}
    </g>
  )
})
