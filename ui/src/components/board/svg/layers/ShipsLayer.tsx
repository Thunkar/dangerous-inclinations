/**
 * Ship tokens. A ship is a wedge pointing the way it faces, in its player's
 * colour; the active player's token wears a ring. Hull and heat are printed
 * on the loadouts, not here — the board stays readable.
 *
 * A token carrying a `motion` is mid-slide: this layer eases it along the
 * ring between the sector it left and the one it is heading for, against the
 * board's own clock. The model never resolves that — the 3D board slides the
 * same tokens against `performance.now()` in its frame loop.
 *
 * Where several ships share a sector the model has already numbered them, and
 * `crowdOffset` turns that number into the radial nudge that keeps them apart;
 * the 3D board applies the same one, so the two boards crowd alike.
 */
import { memo } from 'react'
import type { ShipToken } from '../../model'
import {
  crowdOffset,
  facingAngle,
  headingAtPoint,
  interpolatePositions,
  positionPoint,
  radialPoint,
  type Point,
} from '../../geometry'

interface ShipsLayerProps {
  ships: ReadonlyArray<ShipToken>
  /** Board clock, in `performance.now()` milliseconds. */
  now: number
  onSelect?: (playerId: string) => void
  /** Ships that can be targeted right now. */
  selectableIds?: ReadonlyArray<string>
}

/**
 * Where a sliding token sits right now, and which way it points. Ease-in-out
 * quad along the ring, with the slot it is arriving into eased in over the same
 * beat: at t = 1 the token stands exactly on `rest`, and a ship sliding into an
 * empty sector never moves off the ring at all.
 */
function slide(ship: ShipToken, now: number, rest: Point) {
  if (!ship.motion) return null
  const raw = Math.min(1, Math.max(0, (now - ship.motion.start) / ship.motion.duration))
  if (raw >= 1) return null
  const t = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2
  const arc = interpolatePositions(ship.motion.from, ship.position, t)
  const centred = positionPoint(ship.position)
  const point = {
    x: arc.x + (rest.x - centred.x) * t,
    y: arc.y + (rest.y - centred.y) * t,
  }
  const heading =
    ship.motion.from.wellId === ship.position.wellId
      ? headingAtPoint(ship.position.wellId, point, ship.facing)
      : undefined
  return { point, heading }
}

export const ShipsLayer = memo(function ShipsLayer({
  ships,
  now,
  onSelect,
  selectableIds = [],
}: ShipsLayerProps) {
  return (
    <g className="ships">
      {ships.map(ship => {
        const rest = radialPoint(ship.position, crowdOffset(ship.crowd))
        const sliding = slide(ship, now, rest)
        const p = sliding?.point ?? rest
        const angle =
          ((sliding?.heading ?? facingAngle(ship.position, ship.facing)) * 180) / Math.PI
        const selectable = selectableIds.includes(ship.playerId)
        return (
          <g
            key={ship.playerId}
            style={{ cursor: onSelect && selectable ? 'pointer' : 'default' }}
            onClick={onSelect && selectable ? () => onSelect(ship.playerId) : undefined}
          >
            <title>{`${ship.name} — hull ${ship.hitPoints}/${ship.maxHitPoints}, heat ${ship.heat}, facing ${ship.facing}`}</title>
            {selectable && (
              <circle
                cx={p.x}
                cy={p.y}
                r={22}
                fill="none"
                stroke="#ffb445"
                strokeWidth={2}
                strokeDasharray="4 3"
              >
                <animate
                  attributeName="opacity"
                  values="0.4;1;0.4"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {ship.isActive && (
              <circle
                cx={p.x}
                cy={p.y}
                r={17}
                fill="none"
                stroke={ship.color}
                strokeWidth={2}
                opacity={0.75}
              />
            )}
            <g transform={`translate(${p.x} ${p.y}) rotate(${angle})`}>
              <path
                d="M 15 0 L -9 8 L -9 -8 Z"
                fill={ship.color}
                stroke="#05070b"
                strokeWidth={1.5}
                strokeLinejoin="miter"
              />
              {/* Engine glow at the stern: reads as "this end is the back". */}
              <rect x={-10.5} y={-4} width={2} height={8} fill="#e7eef6" opacity={0.8} />
              {ship.isMe && <circle cx={-1} cy={0} r={2.4} fill="#05070b" />}
            </g>
          </g>
        )
      })}
    </g>
  )
})
