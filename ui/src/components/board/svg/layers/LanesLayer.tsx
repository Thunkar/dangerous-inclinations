/**
 * Transfer lanes. Each lane is two 4-sector arcs (one on Black Hole Ring 5,
 * one on a planet's Ring 4) drawn in the planet's colour and lettered A or B
 * at both ends, so you can read which arc comes out where without a line
 * cutting across the map. Lanes are one-way: the departure arc is solid with a
 * filled letter, the arrival arc dashed with a hollow one. The arc you could
 * jump from right now is lit: printed wider and at full strength, never glowing.
 */
import { memo } from 'react'
import type { TransferLane } from '@dangerous-inclinations/engine'
import { TRANSFER_LANES, getWellName, laneDepartureArc } from '@dangerous-inclinations/engine'
import { BOARD, FONT_DISPLAY } from '../palette'
import { PRINT_SCALE, arcMidPoint, arcPathFor, wellLineColor } from '../../geometry'

/** "beta-a" → "A". The two lanes to a planet are told apart by their letter. */
function laneLetter(laneId: string): string {
  return laneId.slice(-1).toUpperCase()
}

function laneTitle(lane: TransferLane): string {
  const bh = lane.blackHoleArc
  const pl = lane.planetArc
  const span = (arc: typeof bh) =>
    `R${arc.ring} S${arc.startSector}–${arc.startSector + arc.length - 1}`
  const planet = getWellName(lane.planetId)
  return lane.direction === 'outbound'
    ? `${planet} lane ${laneLetter(lane.id)} · one way: jump from Black Hole ${span(bh)} to ${planet} ${span(pl)}`
    : `${planet} lane ${laneLetter(lane.id)} · one way: jump from ${planet} ${span(pl)} to Black Hole ${span(bh)}`
}

const LABEL_OFFSET = 15 * PRINT_SCALE

export const LanesLayer = memo(function LanesLayer({
  highlightIds = [],
}: {
  highlightIds?: string[]
}) {
  return (
    <g className="lanes">
      {TRANSFER_LANES.map(lane => {
        const color = wellLineColor(lane.planetId)
        const active = highlightIds.includes(lane.id)
        const letter = laneLetter(lane.id)
        const title = laneTitle(lane)

        return (
          <g key={lane.id}>
            <title>{title}</title>
            {[lane.blackHoleArc, lane.planetArc].map(arc => {
              const mid = arcMidPoint(arc, LABEL_OFFSET)
              const departure = arc === laneDepartureArc(lane)
              return (
                <g key={`${arc.wellId}-${arc.startSector}`}>
                  <path
                    d={arcPathFor(arc)}
                    fill="none"
                    stroke={color}
                    strokeWidth={(active ? 10 : departure ? 7 : 5) * PRINT_SCALE}
                    strokeLinecap="butt"
                    strokeDasharray={
                      departure ? undefined : `${6 * PRINT_SCALE} ${5 * PRINT_SCALE}`
                    }
                    opacity={active ? 1 : departure ? 0.85 : 0.6}
                  />
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={8.5 * PRINT_SCALE}
                    fill={departure ? color : BOARD.deep}
                    stroke={active ? BOARD.ink : color}
                    strokeWidth={(active ? 2 : 1.2) * PRINT_SCALE}
                  />
                  <text
                    x={mid.x}
                    y={mid.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11 * PRINT_SCALE}
                    fontFamily={FONT_DISPLAY}
                    fontWeight={600}
                    fill={departure ? BOARD.ink : color}
                  >
                    {letter}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
})
