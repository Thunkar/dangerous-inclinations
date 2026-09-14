/**
 * Ship tokens. A ship is a wedge pointing the way it faces, in its player's
 * colour; the active player's token wears a ring. Hull and heat are printed
 * on the mats, not here — the board stays readable.
 */
import { memo } from 'react'
import type { Facing, Position } from '@dangerous-inclinations/engine'
import { facingAngle, positionPoint } from '../geometry'

export interface ShipToken {
  playerId: string
  name: string
  color: string
  position: Position
  facing: Facing
  isActive: boolean
  isMe: boolean
  hitPoints: number
  maxHitPoints: number
  heat: number
}

interface ShipsLayerProps {
  ships: ReadonlyArray<ShipToken>
  onSelect?: (playerId: string) => void
  /** Ships that can be targeted right now. */
  selectableIds?: ReadonlyArray<string>
}

export const ShipsLayer = memo(function ShipsLayer({ ships, onSelect, selectableIds = [] }: ShipsLayerProps) {
  return (
    <g className="ships">
      {ships.map((ship) => {
        const p = positionPoint(ship.position)
        const angle = (facingAngle(ship.position, ship.facing) * 180) / Math.PI
        const selectable = selectableIds.includes(ship.playerId)
        return (
          <g
            key={ship.playerId}
            style={{ cursor: onSelect && selectable ? 'pointer' : 'default' }}
            onClick={onSelect && selectable ? () => onSelect(ship.playerId) : undefined}
          >
            <title>{`${ship.name} — hull ${ship.hitPoints}/${ship.maxHitPoints}, heat ${ship.heat}, facing ${ship.facing}`}</title>
            {selectable && (
              <circle cx={p.x} cy={p.y} r={22} fill="none" stroke="#ffb445" strokeWidth={2} strokeDasharray="4 3">
                <animate attributeName="opacity" values="0.4;1;0.4" dur="1.4s" repeatCount="indefinite" />
              </circle>
            )}
            {ship.isActive && (
              <circle cx={p.x} cy={p.y} r={17} fill="none" stroke={ship.color} strokeWidth={2} opacity={0.75} />
            )}
            <g transform={`translate(${p.x} ${p.y}) rotate(${angle})`}>
              <path
                d="M 13 0 L -8 8 L -4 0 L -8 -8 Z"
                fill={ship.color}
                stroke="#05070b"
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {ship.isMe && <circle cx={-1} cy={0} r={2.6} fill="#e7eef6" />}
            </g>
          </g>
        )
      })}
    </g>
  )
})
