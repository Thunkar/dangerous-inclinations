/**
 * Wrecks: what a destroyed ship leaves where it died, until a Salvage holder
 * takes its black box (RULES §Missions, Salvage).
 *
 * A wreck is a ship's wedge broken in two, hollow (the ground colour) and
 * edged in faint cream, with a few shards beside it: the same shape as a hull
 * so it reads as one, and none of a hull's colour, so it is never mistaken for
 * a live ship. It is not red: a wreck is not a threat and not a thing you
 * click. `geometry.wreckPoint` puts it in the wrecks' band of its sector (the
 * 3D board uses the same one), and a wreck carrying a `motion` is drifting
 * with the stations' step and is eased along its ring against the board clock.
 */
import { memo } from 'react'
import type { WreckToken } from '../../model'
import { driftProgress, wreckHeading, wreckPoint } from '../../geometry'
import { wreckLabel } from '../../labels'
import { WRECK_BOW, WRECK_STERN, outlinePath } from '../../shapes'
import { BOARD } from '../palette'

interface WrecksLayerProps {
  wrecks: ReadonlyArray<WreckToken>
  /** Board clock, in `performance.now()` milliseconds. */
  now: number
}

/** A wreck is drawn a little smaller than a hull. */
const SCALE = 1.2
/** The ship's wedge at 0.6, split along a jagged crack (`shapes.ts`). */
const BOW = outlinePath(WRECK_BOW)
const STERN = outlinePath(WRECK_STERN)
/** Loose plating, round the break. */
const SHARDS = [
  'M 7 5 L 9.5 6.2 L 7.4 7.4 Z',
  'M -1 -7.5 L 1.6 -6.4 L -0.6 -5.6 Z',
  'M 11 -3 L 12.6 -1.4 L 10.6 -1.8 Z',
]

export const WrecksLayer = memo(function WrecksLayer({ wrecks, now }: WrecksLayerProps) {
  return (
    <g className="wrecks">
      {wrecks.map(wreck => {
        const t = driftProgress(wreck, now)
        const p = wreckPoint(wreck.position, wreck.crowd, wreck.motion?.from, t)
        const angle = (wreckHeading(p, wreck.position.wellId, wreck.id) * 180) / Math.PI
        return (
          <g key={wreck.id} transform={`translate(${p.x} ${p.y}) rotate(${angle}) scale(${SCALE})`}>
            <title>{wreckLabel(wreck.position)}</title>
            <g transform="translate(2.4 -1.4) rotate(16)">
              <path
                d={BOW}
                fill={BOARD.deep}
                stroke={BOARD.inkSoft}
                strokeWidth={1.3}
                strokeLinejoin="miter"
              />
            </g>
            <g transform="translate(-1.2 0.8) rotate(-9)">
              <path
                d={STERN}
                fill={BOARD.deep}
                stroke={BOARD.inkSoft}
                strokeWidth={1.3}
                strokeLinejoin="miter"
              />
              <rect x={-6.4} y={-2.4} width={1.3} height={4.8} fill={BOARD.inkSoft} />
            </g>
            {SHARDS.map(d => (
              <path key={d} d={d} fill={BOARD.inkFaint} />
            ))}
          </g>
        )
      })}
    </g>
  )
})
