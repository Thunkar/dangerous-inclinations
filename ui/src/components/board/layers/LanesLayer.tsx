/**
 * Transfer lanes. Each lane is two 4-sector arcs — one on Black Hole Ring 5,
 * one on a planet's Ring 3 — drawn in the planet's colour and lettered A or B
 * at both ends, so you can read which arc comes out where without a line
 * cutting across the map. The arc you could jump from right now is lit.
 */
import { memo } from 'react'
import type { TransferLane } from '@dangerous-inclinations/engine'
import { TRANSFER_LANES, getWellName } from '@dangerous-inclinations/engine'
import { FONT_MONO } from '../../../theme'
import { arcMidPoint, arcPathFor, wellColor } from '../geometry'

/** "beta-a" → "A". The two lanes to a planet are told apart by their letter. */
function laneLetter(laneId: string): string {
  return laneId.slice(-1).toUpperCase()
}

function laneTitle(lane: TransferLane): string {
  const bh = lane.blackHoleArc
  const pl = lane.planetArc
  return (
    `${getWellName(lane.planetId)} lane ${laneLetter(lane.id)} — ` +
    `Black Hole R${bh.ring} S${bh.startSector}–${bh.startSector + bh.length - 1} ` +
    `↔ ${getWellName(lane.planetId)} R${pl.ring} S${pl.startSector}–${pl.startSector + pl.length - 1}`
  )
}

const LABEL_OFFSET = 15

export const LanesLayer = memo(function LanesLayer({ highlightIds = [] }: { highlightIds?: string[] }) {
  return (
    <g className="lanes">
      {TRANSFER_LANES.map((lane) => {
        const color = wellColor(lane.planetId)
        const active = highlightIds.includes(lane.id)
        const letter = laneLetter(lane.id)
        const title = laneTitle(lane)

        return (
          <g key={lane.id}>
            <title>{title}</title>
            {[lane.blackHoleArc, lane.planetArc].map((arc) => {
              const mid = arcMidPoint(arc, LABEL_OFFSET)
              return (
                <g key={`${arc.wellId}-${arc.startSector}`}>
                  <path
                    d={arcPathFor(arc)}
                    fill="none"
                    stroke={color}
                    strokeWidth={active ? 10 : 7}
                    strokeLinecap="butt"
                    opacity={active ? 1 : 0.55}
                    style={active ? { filter: `drop-shadow(0 0 8px ${color})` } : undefined}
                  />
                  <circle
                    cx={mid.x}
                    cy={mid.y}
                    r={8.5}
                    fill="#080b11"
                    stroke={color}
                    strokeWidth={active ? 2 : 1.2}
                    opacity={active ? 1 : 0.8}
                  />
                  <text
                    x={mid.x}
                    y={mid.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fontFamily={FONT_MONO}
                    fontWeight={700}
                    fill={color}
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
