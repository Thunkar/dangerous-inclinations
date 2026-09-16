/**
 * The printed board: the black hole, the three planets, their rings, the
 * sector ticks and every sector number.
 *
 * Every ring carries all 24 labels — the inner rings simply print theirs
 * smaller, because a number you have to count around to is no number at all.
 * Static: nothing here reads game state.
 */
import { memo } from 'react'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { FONT_MONO } from '../../../../theme'
import {
  allWells,
  polar,
  ringRadius,
  sectorAngle,
  sectorEdgeAngle,
  wellCenter,
  wellVisual,
} from '../../geometry'

const RING_STROKE = 'rgba(126,165,205,0.20)'
const TICK_STROKE = 'rgba(126,165,205,0.26)'
const LABEL_FILL = 'rgba(186,210,234,0.78)'
const ZERO_FILL = '#ffb445'

/**
 * Sector numbers shrink with the ring they sit on: a ring 1 sector is a
 * third the width of a ring 5 one, so the label is scaled to the arc it has
 * to fit into rather than dropped.
 */
function labelSize(radius: number): number {
  const perSector = (2 * Math.PI * radius) / SECTORS_PER_RING
  return Math.max(7, Math.min(14, perSector * 0.3))
}

export const WellsLayer = memo(function WellsLayer() {
  return (
    <g className="wells">
      {allWells().map((well) => {
        const center = wellCenter(well.id)
        const visual = wellVisual(well.id)
        const outer = ringRadius(well.id, well.rings.length)
        return (
          <g key={well.id}>
            {/* The plate this well is printed on */}
            <circle cx={center.x} cy={center.y} r={outer + 26} fill="rgba(10,15,22,0.55)" />
            <circle
              cx={center.x}
              cy={center.y}
              r={outer + 26}
              fill="none"
              stroke="rgba(126,165,205,0.14)"
              strokeWidth={1}
            />

            {/* The body */}
            {well.type === 'blackhole' ? (
              <>
                <circle cx={center.x} cy={center.y} r={visual.bodyRadius + 18} fill="url(#bh-halo)" />
                <circle cx={center.x} cy={center.y} r={visual.bodyRadius} fill="#04060a" />
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={visual.bodyRadius}
                  fill="none"
                  stroke="#ffb445"
                  strokeWidth={2}
                  opacity={0.75}
                />
              </>
            ) : (
              <>
                <circle cx={center.x} cy={center.y} r={visual.bodyRadius} fill={visual.color} />
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={visual.bodyRadius}
                  fill="url(#planet-shade)"
                  opacity={0.55}
                />
              </>
            )}
            <text
              x={center.x}
              y={center.y + visual.bodyRadius + 20}
              textAnchor="middle"
              fontSize={16}
              fontFamily={FONT_MONO}
              fontWeight={600}
              letterSpacing="2"
              fill="#e7eef6"
              opacity={0.85}
            >
              {well.name.toUpperCase()}
            </text>

            {/* Rings */}
            {well.rings.map((ring) => {
              const radius = ringRadius(well.id, ring.ring)
              const size = labelSize(radius)
              return (
                <g key={ring.ring}>
                  <circle
                    cx={center.x}
                    cy={center.y}
                    r={radius}
                    fill="none"
                    stroke={RING_STROKE}
                    strokeWidth={1.2}
                  />
                  <text
                    x={center.x}
                    y={center.y - radius - 7}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontFamily={FONT_MONO}
                    fill={LABEL_FILL}
                  >
                    R{ring.ring} · v{ring.velocity}
                  </text>
                  {Array.from({ length: SECTORS_PER_RING }, (_, sector) => {
                    const edge = sectorEdgeAngle(well.id, sector)
                    const tickLength = sector === 0 ? 10 : 5
                    const a = polar(center, radius - tickLength, edge)
                    const b = polar(center, radius, edge)
                    const label = polar(center, radius - size * 1.3 - 3, sectorAngle(well.id, sector))
                    return (
                      <g key={sector}>
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke={sector === 0 ? ZERO_FILL : TICK_STROKE}
                          strokeWidth={sector === 0 ? 1.8 : 0.9}
                        />
                        <text
                          x={label.x}
                          y={label.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={size}
                          fontFamily={FONT_MONO}
                          fill={sector === 0 ? ZERO_FILL : LABEL_FILL}
                          opacity={sector === 0 ? 1 : 0.8}
                        >
                          {sector}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </g>
        )
      })}
    </g>
  )
})
