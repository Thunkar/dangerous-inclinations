/**
 * The marks the player card and the subsystems card share, so one meaning has
 * one picture on both: energy is a square with the subsystem's mark and a number,
 * fuel is a drop with a number, heat is a red cube with a number, hull damage
 * is the hull die's traced mark with a number, and a roll is a d10 with the
 * faces it needs.
 *
 * Each draws inside an `<svg>` whose user unit is a millimetre. `x` is the
 * mark's left edge and `y` the baseline of its number, so a mark sits on a
 * line of text like a word. `size` is the number's type size in points; the
 * picture scales with it. Each returns its width in millimetres through
 * `markWidth`, for laying marks out in a row.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { TRACED_PATHS } from '../art/paths'
import { SUBSYSTEM_PATHS } from '../art/subsystemArt'
import { INK, RED } from './diagram'
import { useHairline } from './print/hairline'

/** The paper lines drawn on a solid mark (the die's kite) are white; a mark's own ground is transparent, so it sits on any stock. */
const PAPER = '#fff'
/** The display face, with a fallback for a page that does not set the card's variable. */
const DISPLAY = 'var(--di-display, "Oswald Variable", Oswald, "Arial Narrow", sans-serif)'
const PT = 0.3528

/** The picture's side for a number set at `size` points. */
const side = (size: number) => size * PT * 1.5
/** A square's outline, thinner on a small square so it stays a square and not a blot, but never under a hairline. */
const line = (s: number, hair: number) => Math.min(0.35, Math.max(hair, s * 0.11))
/** The gap between the picture and its number. */
const GAP = 0.7

interface MarkProps {
  x: number
  y: number
  /** The number or range beside the picture, e.g. 3, "1–3", "2+". Omit for the picture alone. */
  value?: string | number
  /** The number's type size in points (default 5.6). */
  size?: number
}

function Value({
  x,
  y,
  value,
  size,
  color = INK,
}: Required<Omit<MarkProps, 'x'>> & { x: number; color?: string }) {
  return (
    <text
      x={x}
      y={y}
      fontFamily={DISPLAY}
      fontWeight={700}
      fontSize={size * PT}
      fill={color}
      style={{ textTransform: 'uppercase' }}
    >
      {value}
    </text>
  )
}

/** The picture's top, so it is centred on the number's capitals. */
const top = (y: number, size: number) => y - size * PT * 0.36 - side(size) / 2

/**
 * Energy: a square with the subsystem's mark and the cubes it takes. Without
 * `type` the square is a plain energy cube.
 */
export function Energy({
  x,
  y,
  value,
  size = 5.6,
  type,
  fill = 'none',
}: MarkProps & {
  type?: SubsystemType
  /** The square's ground: transparent by default, so it takes the stock it is printed on. */
  fill?: string
}) {
  const s = side(size)
  const t = top(y, size)
  const hair = useHairline()
  return (
    <g>
      <rect x={x} y={t} width={s} height={s} fill={fill} stroke={INK} strokeWidth={line(s, hair)} />
      {type && (
        <path
          d={SUBSYSTEM_PATHS[type]}
          transform={`translate(${x + s * 0.12} ${t + s * 0.12}) scale(${(s * 0.76) / 64})`}
          fill={INK}
          fillRule="evenodd"
        />
      )}
      {value !== undefined && <Value x={x + s + GAP} y={y} value={value} size={size} />}
    </g>
  )
}

/** Fuel: a drop and the fuel it costs or gains. */
export function Fuel({ x, y, value, size = 5.6 }: MarkProps) {
  const s = side(size)
  const t = top(y, size)
  const w = s * 0.72
  const cx = x + w / 2
  const r = w / 2
  return (
    <g>
      <path
        d={`M${cx} ${t}C${cx + r * 0.4} ${t + s * 0.35} ${cx + r} ${t + s * 0.5} ${cx + r} ${t + s - r}A${r} ${r} 0 0 1 ${cx - r} ${t + s - r}C${cx - r} ${t + s * 0.5} ${cx - r * 0.4} ${t + s * 0.35} ${cx} ${t}z`}
        fill={INK}
      />
      {value !== undefined && <Value x={x + w + GAP} y={y} value={value} size={size} />}
    </g>
  )
}

/** Heat: a solid red cube, as the table's heat cubes are, and the heat it is. */
export function Heat({ x, y, value, size = 5.6 }: MarkProps) {
  const s = side(size)
  const t = top(y, size)
  const hair = useHairline()
  return (
    <g>
      <rect
        x={x}
        y={t}
        width={s}
        height={s}
        fill={RED}
        stroke={INK}
        strokeWidth={Math.max(hair, line(s, hair) * 0.6)}
      />
      {value !== undefined && <Value x={x + s + GAP} y={y} value={value} size={size} color={RED} />}
    </g>
  )
}

/** Hull damage: the traced mark the hull die's stand carries, and the hull it costs. */
export function Hull({ x, y, value, size = 5.6 }: MarkProps) {
  const s = side(size) * 1.1
  const t = top(y, size) - side(size) * 0.05
  return (
    <g>
      <path
        d={TRACED_PATHS.damage}
        transform={`translate(${x} ${t}) scale(${s / 64})`}
        fill={INK}
        fillRule="evenodd"
      />
      {value !== undefined && <Value x={x + s + GAP} y={y} value={value} size={size} />}
    </g>
  )
}

/**
 * A roll: the d10 as a solid decagon with the kite of its facing side in
 * white lines (a printed "d10" was illegible at the 3 mm a mark is drawn at),
 * and the faces that do it beside it. `red` for a critical.
 */
export function Die({ x, y, value, size = 5.6, red }: MarkProps & { red?: boolean }) {
  const s = side(size) * 1.08
  const r = s / 2
  const cx = x + r
  const cy = top(y, size) + side(size) / 2
  const hair = useHairline()
  const d =
    Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 10 + Math.PI / 10
      return `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}`
    }).join('') + 'z'
  return (
    <g>
      <path d={d} fill={red ? RED : INK} />
      {/* the facing kite of a d10, in paper lines */}
      <path
        d={`M${cx} ${cy - r * 0.62}L${cx - r * 0.56} ${cy + r * 0.12}L${cx} ${cy + r * 0.62}L${cx + r * 0.56} ${cy + r * 0.12}z`}
        fill="none"
        stroke={PAPER}
        strokeWidth={Math.max(hair, 0.2)}
        strokeLinejoin="round"
      />
      {value !== undefined && (
        <Value x={x + s + GAP} y={y} value={value} size={size} color={red ? RED : INK} />
      )}
    </g>
  )
}

/**
 * The width a mark takes, picture, gap and number, for setting marks in a row.
 * The number's width is estimated at the display face's average capital.
 */
export function markWidth(
  kind: 'energy' | 'fuel' | 'heat' | 'hull' | 'die',
  value?: string | number,
  size = 5.6
): number {
  const scale = { energy: 1, heat: 1, fuel: 0.72, hull: 1.1, die: 1.08 }[kind]
  const s = side(size) * scale
  const chars = value === undefined ? 0 : String(value).length
  return s + (chars ? GAP + chars * size * PT * 0.52 : 0)
}

/**
 * A compressor's saving: the compressor, then the engines' fuel struck out
 * for what it costs with one aboard (a jump's 3 for 1, and so a fold's
 * engines' share). `from` and `to` are the engine's numbers.
 */
export function Compressed({
  x,
  y,
  from,
  to,
  size = 5.6,
}: {
  x: number
  y: number
  from: number
  to: number
  size?: number
}) {
  const k = size / 5.6
  const fuelX = x + side(size) + 1.4 * k
  const num = fuelX + markWidth('fuel', undefined, size) + GAP
  const mid = y - size * PT * 0.36
  const a1 = num + 1.6 * k
  const a2 = a1 + 2 * k
  return (
    <g>
      <Energy x={x} y={y} type="fuel_compressor" size={size} />
      <Fuel x={fuelX} y={y} value={from} size={size} />
      <line
        x1={num - 0.2 * k}
        y1={y + 0.1 * k}
        x2={num + 1.2 * k}
        y2={y - 1.5 * k}
        stroke={RED}
        strokeWidth={0.4 * k}
      />
      <line x1={a1} y1={mid} x2={a2 - 0.8 * k} y2={mid} stroke={INK} strokeWidth={0.35 * k} />
      <path
        d={`M${a2} ${mid}L${a2 - 0.9 * k} ${mid - 0.5 * k}L${a2 - 0.9 * k} ${mid + 0.5 * k}z`}
        fill={INK}
      />
      <Fuel x={a2 + 0.6 * k} y={y} value={to} size={size} />
    </g>
  )
}

/** The width of a `Compressed` row, in millimetres. */
export function compressedWidth(to: number, size = 5.6): number {
  const k = size / 5.6
  return (
    side(size) +
    1.4 * k +
    markWidth('fuel', undefined, size) +
    GAP +
    3.6 * k +
    0.6 * k +
    markWidth('fuel', to, size)
  )
}
