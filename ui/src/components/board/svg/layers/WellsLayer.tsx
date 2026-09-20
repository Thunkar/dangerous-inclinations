/**
 * The printed board: the black hole, the three planets, their rings, the
 * sector ticks and every sector number.
 *
 * Every ring carries all 24 labels: the inner rings simply print theirs
 * smaller, because a number you have to count around to is no number at all.
 * Static: nothing here reads game state.
 */
import { memo } from 'react'
import { SECTORS_PER_RING } from '@dangerous-inclinations/engine'
import { FONT_MONO } from '../../../../theme'
import {
  PLATE_MARGIN,
  PRINT_SCALE,
  allWells,
  polar,
  ringRadius,
  sectorAngle,
  sectorEdgeAngle,
  wellCenter,
  wellVisual,
} from '../../geometry'

/**
 * The ring line, and why it is drawn the way it is.
 *
 * At the view the board opens in, a printed unit is about 0.58 screen pixels,
 * so the old 1.2 printed units was already a one-pixel hairline: taking it
 * thinner only makes the browser draw the same pixel more faintly, which is a
 * paler ring rather than a finer one. So the width comes down for every view
 * that is zoomed in past the default (where it is a real line and reads
 * visibly finer) and the ink comes up to hold it at the default, where the
 * screen has nothing thinner to offer.
 */
const RING_STROKE = 'rgba(126,165,205,0.26)'
const RING_WIDTH = 0.85 * PRINT_SCALE
const TICK_STROKE = 'rgba(126,165,205,0.26)'
const LABEL_FILL = 'rgba(186,210,234,0.78)'
const ZERO_FILL = '#ffb445'

/**
 * Sector numbers shrink with the ring they sit on: a ring 1 sector is a
 * third the width of a ring 5 one, so the label is scaled to the arc it has
 * to fit into rather than dropped.
 *
 * The cap came down from 14 with the 3D board's, but by less: the flat board
 * prints its numbers at about half the height the lit one does, so at the
 * default view a digit here stands seven pixels rather than twelve and there is
 * much less to give back before a two-digit sector number stops being readable
 * at 1440x900. Twelve is as far as it goes.
 */
function labelSize(radius: number): number {
  const perSector = (2 * Math.PI * radius) / SECTORS_PER_RING
  return Math.max(7 * PRINT_SCALE, Math.min(12 * PRINT_SCALE, perSector * 0.3))
}

export const WellsLayer = memo(function WellsLayer() {
  return (
    <g className="wells">
      {allWells().map(well => {
        const center = wellCenter(well.id)
        const visual = wellVisual(well.id)
        const outer = ringRadius(well.id, well.rings.length)
        return (
          <g key={well.id}>
            {/* The plate this well is printed on */}
            <circle
              cx={center.x}
              cy={center.y}
              r={outer + PLATE_MARGIN}
              fill="rgba(10,15,22,0.55)"
            />
            <circle
              cx={center.x}
              cy={center.y}
              r={outer + PLATE_MARGIN}
              fill="none"
              stroke="rgba(126,165,205,0.14)"
              strokeWidth={1 * PRINT_SCALE}
            />

            {/* The body */}
            {well.type === 'blackhole' ? (
              <>
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={visual.bodyRadius + 18 * PRINT_SCALE}
                  fill="url(#bh-halo)"
                />
                <circle cx={center.x} cy={center.y} r={visual.bodyRadius} fill="#04060a" />
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={visual.bodyRadius}
                  fill="none"
                  stroke="#ffb445"
                  strokeWidth={2 * PRINT_SCALE}
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
              y={center.y + visual.bodyRadius + 20 * PRINT_SCALE}
              textAnchor="middle"
              fontSize={16 * PRINT_SCALE}
              fontFamily={FONT_MONO}
              fontWeight={600}
              letterSpacing={2 * PRINT_SCALE}
              fill="#e7eef6"
              opacity={0.85}
            >
              {well.name.toUpperCase()}
            </text>

            {/* Rings */}
            {well.rings.map(ring => {
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
                    strokeWidth={RING_WIDTH}
                  />
                  {/* The ring's own caption, printed outside it. It gives way to
                      the next ring's sector numbers, which reach further in than
                      they used to now that the rings sit closer together. */}
                  <text
                    x={center.x}
                    y={center.y - radius - 5 * PRINT_SCALE}
                    textAnchor="middle"
                    fontSize={9 * PRINT_SCALE}
                    fontFamily={FONT_MONO}
                    fill={LABEL_FILL}
                  >
                    R{ring.ring} · v{ring.velocity}
                  </text>
                  {Array.from({ length: SECTORS_PER_RING }, (_, sector) => {
                    const edge = sectorEdgeAngle(well.id, sector)
                    const tickLength = (sector === 0 ? 10 : 5) * PRINT_SCALE
                    const a = polar(center, radius - tickLength, edge)
                    const b = polar(center, radius, edge)
                    const label = polar(
                      center,
                      radius - size * 1.3 - 3 * PRINT_SCALE,
                      sectorAngle(well.id, sector)
                    )
                    return (
                      <g key={sector}>
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke={sector === 0 ? ZERO_FILL : TICK_STROKE}
                          strokeWidth={(sector === 0 ? 1.8 : 0.9) * PRINT_SCALE}
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
