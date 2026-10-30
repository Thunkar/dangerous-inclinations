/**
 * The hero's picture: the black hole with its rings, pierced by the red wedge
 * every printed thing carries at the cards' angle, a planet with the lane out
 * to it, and a ship riding the drift. Straight cuts and circles, flat, the way
 * the cards are drawn.
 *
 * The landing page shows it whole (`PosterArt`); the mission card backs crop
 * it (`PosterShapes` inside an `<svg>` of their own, in the same coordinates,
 * `POSTER_VIEWBOX` in `posterGeometry.ts`).
 */
import { BAND_ANGLE, PRESS } from '../design/press'
import { POSTER_HOLE, POSTER_VIEWBOX } from './posterGeometry'

interface ShapesProps {
  /** The rings, the planet's orbit, the lane and the ship. Paper on an ink ground. */
  line?: string
  /** The stamp in the bottom right corner; the card backs leave it off. */
  stamp?: boolean
}

/** The picture's shapes, for an `<svg>` whose user units are the picture's. */
export function PosterShapes({ line = PRESS.ink, stamp = true }: ShapesProps) {
  const { x: cx, y: cy } = POSTER_HOLE
  const rings = [148, 194, 240]
  const rad = (deg: number) => (deg * Math.PI) / 180
  const at = (r: number, deg: number) =>
    [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const

  // The wedge: a point low on the left, widening along the band angle through
  // the hole and off the top right.
  const dir = [Math.cos(rad(BAND_ANGLE)), -Math.sin(rad(BAND_ANGLE))] as const
  const normal = [-dir[1], dir[0]] as const
  const tip = [cx - 330 * dir[0], cy - 330 * dir[1]] as const
  const far = [cx + 420 * dir[0], cy + 420 * dir[1]] as const
  const half = 92
  const wedge = `M${tip[0]} ${tip[1]}L${far[0] + half * normal[0]} ${far[1] + half * normal[1]}L${
    far[0] - half * normal[0]
  } ${far[1] - half * normal[1]}z`

  // The ship at the foot of the middle ring, with the arc it drifted.
  const shipAt = 104
  const [sx, sy] = at(rings[1], shipAt)

  // The lane: from the hole's outer ring up to the planet's.
  const planet = [82, 92] as const
  const [lx0, ly0] = at(rings[2], 180)

  return (
    <>
      <circle cx={cx} cy={cy} r={110} fill={PRESS.ink} />
      <path d={wedge} fill={PRESS.red} />
      {rings.map(r => (
        <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={line} strokeWidth={3} />
      ))}

      <circle cx={planet[0]} cy={planet[1]} r={62} fill="none" stroke={line} strokeWidth={3} />
      <circle cx={planet[0]} cy={planet[1]} r={36} fill={PRESS.teal} />
      <path
        d={`M${lx0} ${ly0}Q${lx0 - 6} ${ly0 - 58} ${planet[0] - 59} ${planet[1] + 20}`}
        fill="none"
        stroke={line}
        strokeWidth={7}
        strokeDasharray="12 8"
      />

      <path
        transform={`translate(${sx} ${sy}) rotate(${shipAt + 90})`}
        d="M24 0L-15 -16L-15 16z"
        fill={line}
      />

      {/* The stamp: the points that end the round. */}
      {stamp && (
        <g transform="translate(468 552)">
          <circle r={52} fill={PRESS.red} />
          <circle r={44} fill="none" stroke={PRESS.paper} strokeWidth={4} />
        </g>
      )}
    </>
  )
}

/** The whole picture, as the landing page's hero shows it. */
export function PosterArt({ label }: { label: string }) {
  return (
    <svg
      viewBox={`0 0 ${POSTER_VIEWBOX.width} ${POSTER_VIEWBOX.height}`}
      role="img"
      aria-label={label}
      style={{ width: '100%', display: 'block', overflow: 'visible' }}
    >
      <PosterShapes />
    </svg>
  )
}
