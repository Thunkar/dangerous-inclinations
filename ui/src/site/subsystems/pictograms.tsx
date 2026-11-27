/**
 * A picture of what each subsystem that aims at nobody does, in the card's
 * press: flat ink, square ends, the family's colour for what moves.
 * Each is drawn in a 40 x 20 box, the shape of a fan on its side, and every
 * count in it is the engine's.
 */
import {
  BLACKHOLE_RINGS,
  BURN_COSTS,
  MAX_HEAT,
  SUBSYSTEM_CONFIGS,
  shieldPointsPerEnergyOf,
} from '@dangerous-inclinations/engine'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { SUBSYSTEM_PATHS } from '../../art/subsystemArt'
import { TRACED_PATHS } from '../../art/paths'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Energy, Fuel, Heat, Hull } from '../marks'
import { useHairline } from '../print/hairline'
import type { UtilityType } from './facts'
import { NUM } from './facts'
import { SUBSYSTEM_CARD } from '../../text/subsystemCard'

const INK = PRESS.ink
const W = 1.1

/** The ship: a chevron, pointing up unless turned. */
function Chevron({ x, y, s = 1, r = 0 }: { x: number; y: number; s?: number; r?: number }) {
  return (
    <path
      d="M0 -1.9 L1.45 1.8 L0 0.95 L-1.45 1.8 Z"
      fill={INK}
      transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}
    />
  )
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  colour = INK,
  width = W,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  colour?: string
  width?: number
}) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const h = 2
  const p = (d: number) => `${x2 - h * Math.cos(a + d)} ${y2 - h * Math.sin(a + d)}`
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2 - 1.2 * Math.cos(a)}
        y2={y2 - 1.2 * Math.sin(a)}
        stroke={colour}
        strokeWidth={width}
      />
      <path d={`M${p(0.5)} L${x2} ${y2} L${p(-0.5)} Z`} fill={colour} />
    </g>
  )
}

/** An arc round (cx, cy) from one angle to another, degrees clockwise from east, with its head on the tangent at the end. */
function ArcArrow({
  cx,
  cy,
  r,
  from,
  to,
  colour,
  width = W,
}: {
  cx: number
  cy: number
  r: number
  from: number
  to: number
  colour: string
  width?: number
}) {
  const rad = (d: number) => (d * Math.PI) / 180
  const dir = Math.sign(to - from)
  const head = 2.2
  // The line stops where the head's base sits, so the head's tip lands on `to`.
  const stop = to - dir * ((head * 0.9) / r) * (180 / Math.PI)
  const p = (d: number) => ({ x: cx + r * Math.cos(rad(d)), y: cy + r * Math.sin(rad(d)) })
  const a = p(from)
  const b = p(stop)
  const tip = p(to)
  const base = p(to - dir * (head / r) * (180 / Math.PI))
  // Across the tangent at the head's base: along the radius.
  const nx = Math.cos(rad(to)) * head * 0.5
  const ny = Math.sin(rad(to)) * head * 0.5
  return (
    <g>
      <path
        d={`M${a.x} ${a.y} A${r} ${r} 0 ${Math.abs(stop - from) > 180 ? 1 : 0} ${dir > 0 ? 1 : 0} ${b.x} ${b.y}`}
        fill="none"
        stroke={colour}
        strokeWidth={width}
      />
      <path
        d={`M${tip.x} ${tip.y} L${base.x + nx} ${base.y + ny} L${base.x - nx} ${base.y - ny} Z`}
        fill={colour}
      />
    </g>
  )
}

/** Words and numbers in the picture, in the press's capitals. */
function Word({
  x,
  y,
  size = 2.4,
  fill = INK,
  anchor = 'middle',
  children,
}: {
  x: number
  y: number
  size?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  children: string | number
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontFamily={FONT_DISPLAY}
      fontWeight={700}
      textAnchor={anchor}
      fill={fill}
      stroke={PRESS.paper}
      strokeWidth={size * 0.25}
      paintOrder="stroke"
      style={{ textTransform: 'uppercase' }}
    >
      {children}
    </text>
  )
}

/** Damage: the traced hull-damage mark (the Hull mark's picture), centred on a point. */
function Burst({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <path
      d={TRACED_PATHS.damage}
      fill={INK}
      fillRule="evenodd"
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 64})`}
    />
  )
}

/** Another subsystem's stencil, centred on a point. */
function Stencil({
  type,
  x,
  y,
  size,
  fill = PRESS.red,
}: {
  type: SubsystemType
  x: number
  y: number
  size: number
  fill?: string
}) {
  return (
    <path
      fillRule="evenodd"
      d={SUBSYSTEM_PATHS[type]}
      fill={fill}
      transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 64})`}
    />
  )
}

/** What a full wall does to one shot: the points it stops (heat on the defender) and the points that reach the hull. */
function blocked(type: 'railgun' | 'plasma_cannon' | 'laser') {
  const stats = SUBSYSTEM_CONFIGS[type].weaponStats!
  const cubes = SUBSYSTEM_CONFIGS.shields.maxEnergy
  const stops = stats.ignoresShields
    ? 0
    : Math.min(stats.damage, cubes * shieldPointsPerEnergyOf(stats))
  return { damage: stats.damage, stops, through: stats.damage - stops }
}

function Shields({ ink }: { ink: string }) {
  // A worked case, read left to right: a full wall of two cubes meets a
  // railgun, a plasma cannon and a laser. What it stops is heat on its
  // owner; what gets past is hull damage.
  const wall = 18.2
  const rows = (['railgun', 'plasma_cannon', 'laser'] as const).map((type, i) => ({
    type,
    y: 6.6 + i * 5.3,
    ...blocked(type),
  }))
  const pt = 6.2
  const mid = pt * 0.3528 * 0.36
  return (
    <>
      {/* The wall, and the energy on it. */}
      <rect x={wall - 0.8} y={3.9} width={1.6} height={15.8} fill={ink} />
      <Energy
        x={wall - 3.2}
        y={2.6}
        size={pt}
        type="shields"
        value={SUBSYSTEM_CONFIGS.shields.maxEnergy}
      />
      <Chevron x={37.9} y={11.9} s={1.25} r={-90} />
      {rows.map(row => (
        <g key={row.type}>
          <Stencil type={row.type} x={1.9} y={row.y} size={3.6} />
          <Burst x={5.4} y={row.y} size={2.6} />
          <Word x={6.9} y={row.y + 1.1} size={3} anchor="start">
            {`${row.damage}`}
          </Word>
          <Arrow
            x1={9.2}
            y1={row.y}
            x2={row.stops > 0 ? wall - 0.9 : 29.6}
            y2={row.y}
            colour={PRESS.red}
            width={0.8}
          />
          {row.stops > 0 && <Heat x={wall + 1.6} y={row.y + mid} size={pt} value={row.stops} />}
          {row.stops > 0 && row.through > 0 && (
            <Arrow x1={26} y1={row.y} x2={29.6} y2={row.y} colour={PRESS.red} width={0.8} />
          )}
          {row.through > 0 && <Hull x={30.2} y={row.y + mid} size={pt} value={row.through} />}
        </g>
      ))}
    </>
  )
}

function Radiator() {
  // The heat track: every check takes a bare hull's dissipation off it, and
  // the radiator takes more. Red is heat and nothing else.
  const cells = MAX_HEAT
  const pitch = 34 / cells
  const x0 = 3
  const pt = 5.6
  const cube = pt * 0.3528 * 1.5
  const centre = 12.6
  const baseline = centre + pt * 0.3528 * 0.36
  const hot = NUM.cooled
  // An empty cell is a black hairline, not a grey one: a printer screens grey into dots.
  const hair = useHairline()
  const bracket = (from: number, to: number) => {
    const a = x0 + from * pitch + 0.3
    const b = x0 + to * pitch - 0.3
    return `M${a} 9.4 L${a} 8.4 L${b} 8.4 L${b} 9.4`
  }
  const mid = (from: number, to: number) => x0 + ((from + to) / 2) * pitch
  return (
    <>
      {Array.from({ length: cells }, (_, i) =>
        i < hot ? (
          <Heat key={i} x={x0 + i * pitch + (pitch - cube) / 2} y={baseline} size={pt} />
        ) : (
          <rect
            key={i}
            x={x0 + i * pitch + (pitch - cube) / 2}
            y={centre - cube / 2}
            width={cube}
            height={cube}
            fill="none"
            stroke={INK}
            strokeWidth={hair}
          />
        )
      )}
      <path d={bracket(0, NUM.base)} fill="none" stroke={INK} strokeWidth={0.4} />
      <path d={bracket(NUM.base, hot)} fill="none" stroke={INK} strokeWidth={0.4} />
      <Word x={mid(0, NUM.base)} y={6.6} size={3.2}>
        {`−${NUM.base}`}
      </Word>
      <Stencil type="radiator" x={mid(NUM.base, hot) - 2.3} y={5.5} size={3} fill={INK} />
      <Word x={mid(NUM.base, hot) + 1.2} y={6.6} size={3.2}>
        {`−${NUM.radiator}`}
      </Word>
    </>
  )
}

function Compressor() {
  // A jump's fuel: the lane's three drops, all but one struck out.
  return (
    <>
      <path
        d="M5 16 Q20 0 35 16"
        fill="none"
        stroke={INK}
        strokeWidth={0.9}
        strokeDasharray="1.4 1"
      />
      <path d="M33 13.2 L35.2 16.4 L31.6 16.2 Z" fill={INK} />
      {Array.from({ length: NUM.jump }, (_, i) => {
        const x = 20 - ((NUM.jump - 1) / 2) * 5.4 + i * 5.4
        const kept = i < NUM.compressed
        return (
          <g key={i}>
            <g opacity={kept ? 1 : 0.3}>
              <Fuel x={x - 2.1} y={15} size={11} />
            </g>
            {!kept && (
              <line
                x1={x - 2.4}
                y1={17.2}
                x2={x + 2.4}
                y2={9.6}
                stroke={PRESS.red}
                strokeWidth={1.2}
              />
            )}
          </g>
        )
      })}
    </>
  )
}

function JumpDrive({ ink }: { ink: string }) {
  // The black hole between two planets: round your own well, across to a
  // planet and back, never planet to planet.
  const hole = { x: 20, y: 11 }
  const left = { x: 4, y: 11 }
  const right = { x: 36, y: 11 }
  const ring = 5
  return (
    <>
      <path
        d={`M${left.x + 1} ${left.y - 3} Q20 -4 ${right.x - 1} ${right.y - 3}`}
        fill="none"
        stroke={PRESS.inkFaint}
        strokeWidth={0.9}
        strokeDasharray="1.2 1"
      />
      <g stroke={PRESS.red} strokeWidth={1.2}>
        <line x1={18.4} y1={0.4} x2={21.6} y2={3.6} />
        <line x1={21.6} y1={0.4} x2={18.4} y2={3.6} />
      </g>
      <ArcArrow cx={hole.x} cy={hole.y} r={ring} from={-60} to={250} colour={ink} width={0.9} />
      <circle cx={hole.x} cy={hole.y} r={2.4} fill={INK} />
      <Arrow x1={hole.x + ring + 0.8} y1={hole.y} x2={right.x - 2.6} y2={right.y} colour={ink} />
      <Arrow x1={left.x + 2.6} y1={left.y} x2={hole.x - ring - 0.8} y2={hole.y} colour={ink} />
      {[left, right].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={PRESS.paper} stroke={INK} strokeWidth={1} />
      ))}
    </>
  )
}

function Engines({ ink }: { ink: string }) {
  // Rings as steps, the hole below: facing prograde you burn out, facing retrograde in.
  const max = Object.values(BURN_COSTS).length
  const lineY = (k: number) => 17.5 - k * 4.3
  return (
    <>
      <rect x={0} y={19.2} width={40} height={0.8} fill={INK} />
      {Array.from({ length: max + 1 }, (_, k) => (
        <line
          key={k}
          x1={1}
          y1={lineY(k)}
          x2={39}
          y2={lineY(k)}
          stroke={PRESS.inkFaint}
          strokeWidth={0.6}
        />
      ))}
      <Chevron x={8} y={lineY(0)} s={1.2} r={90} />
      <Arrow x1={12} y1={lineY(0) - 0.6} x2={12} y2={lineY(max) - 0.2} colour={ink} />
      <Chevron x={32} y={lineY(max)} s={1.2} r={-90} />
      <Arrow x1={28} y1={lineY(max) + 0.6} x2={28} y2={lineY(0) + 0.2} colour={ink} />
      {Array.from({ length: max }, (_, i) => (
        <g key={i}>
          <Word x={14} y={lineY(i + 1) + 0.9} size={2.6} anchor="start">
            {i + 1}
          </Word>
          <Word x={26} y={lineY(max - i - 1) + 0.9} size={2.6} anchor="end">
            {i + 1}
          </Word>
        </g>
      ))}
    </>
  )
}

function Thrusters({ ink }: { ink: string }) {
  // Prograde and retrograde, one turn apart.
  return (
    <>
      <Chevron x={11} y={8.5} s={2} r={90} />
      <Chevron x={29} y={8.5} s={2} r={-90} />
      <ArcArrow cx={20} cy={8.5} r={8} from={-142} to={-38} colour={ink} />
      <ArcArrow cx={20} cy={8.5} r={8} from={38} to={142} colour={ink} />
      <Word x={11} y={19.4} size={2.2}>
        {SUBSYSTEM_CARD.pictures.prograde}
      </Word>
      <Word x={29} y={19.4} size={2.2}>
        {SUBSYSTEM_CARD.pictures.retrograde}
      </Word>
    </>
  )
}

function Scoop() {
  // A coast along the ring: as many sectors as its speed, as much fuel in.
  const v = BLACKHOLE_RINGS[2].velocity
  const cx = 20
  const cy = 39
  const R = 32
  const span = 62
  const at = (deg: number, r = R) => {
    const a = ((-90 - span / 2 + deg) * Math.PI) / 180
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }
  const arc = (r: number, from: number, to: number) => {
    const a = at(from, r)
    const b = at(to, r)
    return `M${a.x} ${a.y} A${r} ${r} 0 0 1 ${b.x} ${b.y}`
  }
  const ship = at(span * 0.06)
  const head = at(span - 1, R + 3.6)
  const tail = at(span - 6, R + 3.6)
  const dir = Math.atan2(head.y - tail.y, head.x - tail.x)
  const tip = (d: number) =>
    `${head.x - 2.2 * Math.cos(dir + d)} ${head.y - 2.2 * Math.sin(dir + d)}`
  return (
    <>
      <path d={arc(R, 0, span)} fill="none" stroke={PRESS.inkFaint} strokeWidth={3.6} />
      {Array.from({ length: v + 1 }, (_, i) => {
        const p = at((span * i) / v, R - 2)
        const q = at((span * i) / v, R + 2)
        return (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            stroke={PRESS.paper}
            strokeWidth={0.6}
          />
        )
      })}
      <path d={arc(R + 3.6, span * 0.14, span - 3)} fill="none" stroke={INK} strokeWidth={0.9} />
      <path d={`M${tip(0.5)} L${head.x} ${head.y} L${tip(-0.5)} Z`} fill={INK} />
      <Chevron x={ship.x} y={ship.y} s={1.3} r={90 - span / 2 + span * 0.06} />
      <Fuel x={16.4} y={18} size={10} value={`+${v}`} />
    </>
  )
}

const PICTURES: Record<UtilityType, (p: { ink: string }) => React.ReactElement> = {
  shields: Shields,
  radiator: Radiator,
  fuel_compressor: Compressor,
  jump_drive: JumpDrive,
  engines: Engines,
  rotation: Thrusters,
  scoop: Scoop,
}

export function Pictogram({
  type,
  ink,
  w,
  h,
}: {
  type: UtilityType
  ink: string
  w: number
  h: number
}) {
  const Picture = PICTURES[type]
  return (
    <svg
      viewBox="0 0 40 20"
      style={{ width: `${w}mm`, height: `${h}mm`, display: 'block', overflow: 'hidden' }}
      aria-hidden="true"
      focusable="false"
    >
      <Picture ink={ink} />
    </svg>
  )
}
