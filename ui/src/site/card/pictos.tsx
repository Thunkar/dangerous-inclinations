/**
 * The pictograms the player card is drawn from, in millimetres: an
 * `<svg>` set by `Pic` has one user unit to the printed millimetre, so a
 * length here is the length that prints and a type size is `pt(n)`.
 *
 * Two inks. Red never carries a fact alone: heat is a solid cube where energy
 * is an open one, a critical face has a double rule, a broken tile is crossed.
 */
import type { ReactNode } from 'react'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import type { FaceKind } from './draw'
import { SUBSYSTEM_PATHS } from '../../art/subsystemArt'
import { INK, PAPER, RED, arc, polar, pt } from './draw'
import { Energy, Heat } from '../marks'

const DISPLAY = 'var(--di-display)'
const SANS = 'var(--di-sans)'

/** An svg whose user unit is a millimetre. */
export function Pic({
  w,
  h,
  children,
  className,
}: {
  w: number
  h: number
  children: ReactNode
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: `${w}mm`, height: `${h}mm`, display: 'block', overflow: 'visible' }}
    >
      {children}
    </svg>
  )
}

/** Capitals in the poster face. */
export function Cap({
  x,
  y,
  size = 6,
  anchor = 'start',
  color = INK,
  weight = 700,
  spacing = 0.04,
  rotate,
  children,
}: {
  x: number
  y: number
  size?: number
  anchor?: 'start' | 'middle' | 'end'
  color?: string
  weight?: number
  spacing?: number
  rotate?: number
  children: ReactNode
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={DISPLAY}
      fontWeight={weight}
      fontSize={pt(size)}
      letterSpacing={`${spacing}em`}
      fill={color}
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
      style={{ textTransform: 'uppercase' }}
    >
      {children}
    </text>
  )
}

/** Lines of body text, one `<tspan>` a line. */
export function Lines({
  x,
  y,
  lines,
  size = 5.6,
  lead = 1.22,
  anchor = 'start',
  color = INK,
  weight = 400,
}: {
  x: number
  y: number
  lines: readonly ReactNode[]
  size?: number
  lead?: number
  anchor?: 'start' | 'middle' | 'end'
  color?: string
  weight?: number
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={SANS}
      fontSize={pt(size)}
      fontWeight={weight}
      fill={color}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : pt(size) * lead}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

/**
 * The ship: a dart, nose along `angle` (degrees, 0 = right). The flat mark of
 * the board's token, small enough to sit on a ring.
 */
export function Ship({
  x,
  y,
  angle = 0,
  size = 2.4,
  fill = INK,
  ghost,
}: {
  x: number
  y: number
  angle?: number
  size?: number
  fill?: string
  /** Drawn as an outline: where a ship was, or where it is not yet. */
  ghost?: boolean
}) {
  const s = size
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path
        d={`M${s} 0L${-0.75 * s} ${-0.8 * s}L${-0.35 * s} 0L${-0.75 * s} ${0.8 * s}z`}
        fill={ghost ? PAPER : fill}
        stroke={ghost ? fill : 'none'}
        strokeWidth={ghost ? 0.3 : 0}
        strokeDasharray={ghost ? '0.6 0.4' : undefined}
        strokeLinejoin="round"
      />
      {/* the cockpit: what tells a ship from an arrowhead */}
      {!ghost && s >= 1.2 && <circle cx={s * 0.12} cy={0} r={s * 0.13} fill={PAPER} />}
    </g>
  )
}

/** An energy cube by its top-left corner: the shared Energy mark, bare. */
export function Cube({ x, y, s = 1.7 }: { x: number; y: number; s?: number }) {
  const size = s / (0.3528 * 1.5)
  return <Energy x={x} y={y + s / 2 + size * 0.3528 * 0.36} size={size} />
}

/** A heat cube by its top-left corner: the shared Heat mark, solid red. */
export function HeatCube({ x, y, s = 1.7 }: { x: number; y: number; s?: number }) {
  const size = s / (0.3528 * 1.5)
  return <Heat x={x} y={y + s / 2 + size * 0.3528 * 0.36} size={size} />
}

/** A row of cubes, left to right from `x`. */
export function Cubes({
  x,
  y,
  n,
  s = 1.7,
  gap = 0.4,
  heat,
}: {
  x: number
  y: number
  n: number
  s?: number
  gap?: number
  heat?: boolean
}) {
  return (
    <>
      {Array.from({ length: n }, (_, i) =>
        heat ? (
          <HeatCube key={i} x={x + i * (s + gap)} y={y} s={s} />
        ) : (
          <Cube key={i} x={x + i * (s + gap)} y={y} s={s} />
        )
      )}
    </>
  )
}

function decagon(cx: number, cy: number, r: number): string {
  return (
    Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 10 + Math.PI / 10
      return `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}`
    }).join('') + 'z'
  )
}

/**
 * One face of the d10 as a decagon. A miss is open, a hit solid black, a
 * critical solid red inside a second rule, and a face that is a critical only
 * with a powered sensor is black with that same second rule in red.
 */
export function D10({
  cx,
  cy,
  r = 2.6,
  face,
  kind,
  size = 7,
}: {
  cx: number
  cy: number
  r?: number
  face: number | string
  kind: FaceKind
  size?: number
}) {
  const fill = kind === 'miss' ? PAPER : kind === 'crit' ? RED : INK
  return (
    <g>
      {(kind === 'crit' || kind === 'sensor') && (
        <path
          d={decagon(cx, cy, r + 0.75)}
          fill="none"
          stroke={kind === 'crit' ? INK : RED}
          strokeWidth={0.35}
        />
      )}
      <path d={decagon(cx, cy, r)} fill={fill} stroke={INK} strokeWidth={0.35} />
      <text
        x={cx}
        y={cy + pt(size) * 0.36}
        textAnchor="middle"
        fontFamily={DISPLAY}
        fontWeight={700}
        fontSize={pt(size)}
        fill={kind === 'miss' ? INK : PAPER}
      >
        {face}
      </text>
    </g>
  )
}

/** A path of the 64-box icon sets, placed at `x, y` and `s` millimetres square. */
export function Glyph({
  d,
  x,
  y,
  s,
  fill = INK,
}: {
  d: string
  x: number
  y: number
  s: number
  fill?: string
}) {
  return (
    <path
      d={d}
      transform={`translate(${x} ${y}) scale(${s / 64})`}
      fill={fill}
      fillRule="evenodd"
    />
  )
}

/**
 * A subsystem tile: face-down it is a plain slot marked with a query, face-up
 * it carries its mark. Its cubes stand in the channel under it.
 */
export function Tile({
  x,
  y,
  s = 5,
  type,
  cubes = 0,
  broken,
  heatCubes,
}: {
  x: number
  y: number
  s?: number
  /** Face-up with this mark; face-down without. */
  type?: SubsystemType
  cubes?: number
  broken?: boolean
  /** Its cubes drawn as heat (a broken tile's dumped energy). */
  heatCubes?: boolean
}) {
  const cube = Math.min(1.5, (s - 0.4) / Math.max(cubes, 1) - 0.3)
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={s}
        height={s}
        fill={type ? PAPER : INK}
        stroke={INK}
        strokeWidth={0.35}
      />
      {type ? (
        <Glyph d={SUBSYSTEM_PATHS[type]} x={x + s * 0.12} y={y + s * 0.12} s={s * 0.76} />
      ) : (
        <text
          x={x + s / 2}
          y={y + s * 0.7}
          textAnchor="middle"
          fontFamily={DISPLAY}
          fontWeight={700}
          fontSize={s * 0.7}
          fill={PAPER}
        >
          ?
        </text>
      )}
      {broken && (
        <path
          d={`M${x - 0.6} ${y - 0.6}L${x + s + 0.6} ${y + s + 0.6}M${x + s + 0.6} ${y - 0.6}L${x - 0.6} ${y + s + 0.6}`}
          stroke={RED}
          strokeWidth={0.8}
        />
      )}
      {cubes > 0 && (
        <Cubes x={x + 0.2} y={y + s + 0.5} n={cubes} s={cube} gap={0.3} heat={heatCubes} />
      )}
    </g>
  )
}

/** An arrowhead at `x, y` pointing along `angle` (degrees). */
export function Head({
  x,
  y,
  angle,
  s = 1.4,
  fill = RED,
}: {
  x: number
  y: number
  angle: number
  s?: number
  fill?: string
}) {
  return (
    <path
      d={`M${s * 0.5} 0L${-s * 0.7} ${-s * 0.65}L${-s * 0.7} ${s * 0.65}z`}
      transform={`translate(${x} ${y}) rotate(${angle})`}
      fill={fill}
    />
  )
}

/** A straight arrow from one point to another, the head at the end. */
export function Arrow({
  x1,
  y1,
  x2,
  y2,
  color = RED,
  w = 0.6,
  dash,
  head = 1.4,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
  w?: number
  dash?: string
  head?: number
}) {
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  const t = (angle * Math.PI) / 180
  const back = head * 0.5
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2 - Math.cos(t) * back}
        y2={y2 - Math.sin(t) * back}
        stroke={color}
        strokeWidth={w}
        strokeDasharray={dash}
      />
      <Head
        x={x2 - Math.cos(t) * back}
        y={y2 - Math.sin(t) * back}
        angle={angle}
        s={head}
        fill={color}
      />
    </g>
  )
}

/** An arrow along an arc, the head at `a1`. */
export function ArcArrow({
  cx,
  cy,
  r,
  a0,
  a1,
  color = RED,
  w = 0.6,
  dash,
  head = 1.4,
}: {
  cx: number
  cy: number
  r: number
  a0: number
  a1: number
  color?: string
  w?: number
  dash?: string
  head?: number
}) {
  // Stop the line short of the head, along the arc.
  const back = ((head * 0.5) / r) * (180 / Math.PI) * Math.sign(a1 - a0)
  const [hx, hy] = polar(cx, cy, r, a1 - back)
  const tangent = a1 + 90 * Math.sign(a1 - a0)
  return (
    <g>
      <path
        d={arc(cx, cy, r, a0, a1 - back)}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeDasharray={dash}
      />
      <Head x={hx} y={hy} angle={tangent} s={head} fill={color} />
    </g>
  )
}

/** A station: a bar over its three sectors, a stem and a hub. */
export function Station({
  x,
  y,
  w = 5,
  angle = 0,
}: {
  x: number
  y: number
  /** The span of its three sectors. */
  w?: number
  angle?: number
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect x={-w / 2} y={-0.5} width={w} height={1} fill={INK} />
      <rect
        x={-0.9}
        y={-1.6}
        width={1.8}
        height={3.2}
        fill={PAPER}
        stroke={INK}
        strokeWidth={0.35}
      />
    </g>
  )
}

/** The Home marker: a house. */
export function Home({ x, y, s = 3.6 }: { x: number; y: number; s?: number }) {
  return (
    <path
      d={`M${x} ${y - s / 2}L${x + s / 2} ${y - s * 0.05}V${y + s / 2}H${x - s / 2}V${y - s * 0.05}z`}
      fill={PAPER}
      stroke={INK}
      strokeWidth={0.35}
      strokeLinejoin="miter"
    />
  )
}

/** A mission card: face-down it is solid with the red band, face-up it shows its points (solid for a primary). */
export function Card({
  x,
  y,
  w = 2.8,
  h = 3.9,
  points,
  primary,
}: {
  x: number
  y: number
  w?: number
  h?: number
  points?: number
  /** Solid, as a primary card is drawn. */
  primary?: boolean
}) {
  const faceDown = points === undefined
  const solid = faceDown || primary
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={solid ? INK : PAPER}
        stroke={INK}
        strokeWidth={0.3}
      />
      {faceDown ? (
        <path d={`M${x} ${y + h * 0.8}L${x + w} ${y + h * 0.25}`} stroke={RED} strokeWidth={0.7} />
      ) : (
        <text
          x={x + w / 2}
          y={y + h / 2 + pt(6.4) * 0.36}
          textAnchor="middle"
          fontFamily={DISPLAY}
          fontWeight={700}
          fontSize={pt(6.4)}
          fill={primary ? PAPER : INK}
        >
          {points}
        </text>
      )}
    </g>
  )
}
