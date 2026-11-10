/**
 * A range card: what one weapon (or the sensor's scan) reaches, drawn on the
 * black hole's rings, for the table to hold against the board.
 *
 * The loadout cards' cut, 63x88mm (`loadouts/`), and their press: the
 * subsystem's mark and name up a stripe of the card's ink (red for a weapon,
 * the intel violet for the sensor), the numbers top left, the one line in the
 * black bar. The rest of the face is a fan of the five rings round the black
 * hole, which the card's right edge cuts in half, with the ship on ring 3
 * facing prograde: up the card, so port is on its left and looks outward.
 * Every shaded sector is the engine's (`reach.ts`); the words are in
 * `text/rangeCards.ts`.
 */
import {
  BURN_COSTS,
  SUBSYSTEM_CONFIGS,
  fill,
  interceptsPerRack,
} from '@dangerous-inclinations/engine'
import { SUBSYSTEM_PATHS } from '../../art/subsystemArt'
import { PRESS } from '../../design/press'
import { RANGE_CARDS as T } from '../../text/rangeCards'
import { INTERCEPT_ON, PLASMA_SHIELD_POINTS, SENSOR_CRIT, tileName } from '../numbers'
import { LOADOUT_HEIGHT_MM, LOADOUT_WIDTH_MM } from '../loadouts/sheet'
import { PATCH, isOneSided, reach, recoils, type RangeCardType } from './reach'

/** The black bar across the foot and the stripe up the left: the loadout card's. */
const BAR_MM = 18.5
const STRIPE_MM = 14

/** The fan, in the card's millimetres: the hole sits on the right edge, half off the card. */
const FAN_W = LOADOUT_WIDTH_MM - STRIPE_MM
const FAN_H = LOADOUT_HEIGHT_MM - BAR_MM
const CX = FAN_W
const CY = FAN_H / 2
const HOLE = 4.5
const R0 = 5.5
const BAND = 5.5
/** The board's own sector: 24 to a ring. */
const STEP = 15
const SHIP_RING = 3

/** The card's ink: the intel violet for the sensor, the combat red for every weapon. */
export const cardInk = (type: RangeCardType) => (type === 'sensor_array' ? PRESS.violet : PRESS.red)

const radius = (ring: number) => R0 + (ring - 1) * BAND
/** Ahead runs up the card; the ship's sector straddles the line left of the hole. */
const angleOf = (ahead: number) => ((180 + ahead * STEP) * Math.PI) / 180
const point = (r: number, a: number) =>
  `${(CX + r * Math.cos(a)).toFixed(3)} ${(CY + r * Math.sin(a)).toFixed(3)}`

/** One sector of one ring; facing prograde, a ring to port is a ring further out. */
function wedge(port: number, ahead: number): string {
  const ring = SHIP_RING + port
  const half = (STEP / 2) * (Math.PI / 180)
  const a0 = angleOf(ahead) - half
  const a1 = angleOf(ahead) + half
  const ri = radius(ring)
  const ro = radius(ring + 1)
  return `M${point(ri, a0)} L${point(ro, a0)} A${ro} ${ro} 0 0 1 ${point(ro, a1)} L${point(ri, a1)} A${ri} ${ri} 0 0 0 ${point(ri, a0)} Z`
}

const centre = (port: number, ahead: number) => {
  const r = radius(SHIP_RING + port) + BAND / 2
  const a = angleOf(ahead)
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), r }
}

/** The card's one line with the engine's numbers in it. */
export function cardLine(type: RangeCardType): string {
  return fill(T.lines[type] as string, {
    fuel: BURN_COSTS.soft.mass,
    points: PLASMA_SHIELD_POINTS,
    intercepts: interceptsPerRack(),
    roll: INTERCEPT_ON,
    steps: SUBSYSTEM_CONFIGS.missiles.weaponStats?.stepsPerMove ?? 0,
    crit: SENSOR_CRIT,
  })
}

function Fan({ type }: { type: RangeCardType }) {
  const ink = cardInk(type)
  const cells = reach(type)
  const all: Array<{ port: number; ahead: number }> = []
  for (let port = -PATCH.rings; port <= PATCH.rings; port++)
    for (let ahead = -PATCH.sectors; ahead <= PATCH.sectors; ahead++) all.push({ port, ahead })
  const ship = centre(0, 0)
  return (
    <svg
      className="di-rg-fan"
      viewBox={`0 0 ${FAN_W} ${FAN_H}`}
      style={{ width: `${FAN_W}mm`, height: `${FAN_H}mm` }}
      aria-hidden="true"
      focusable="false"
    >
      {all.map(({ port, ahead }) => (
        <path
          key={`${port},${ahead}`}
          d={wedge(port, ahead)}
          fill="none"
          stroke={PRESS.inkFaint}
          strokeWidth={0.2}
        />
      ))}
      {cells.map(c => {
        const fillColour =
          c.zone === 'starboard'
            ? PRESS.ink
            : c.wellwide && c.steps === undefined
              ? PRESS.paperDeep
              : ink
        return (
          <path
            key={`${c.port},${c.ahead}`}
            d={wedge(c.port, c.ahead)}
            fill={fillColour}
            stroke={PRESS.paper}
            strokeWidth={0.45}
          />
        )
      })}
      {cells
        .filter(c => c.steps !== undefined)
        .map(c => {
          const { x, y, r } = centre(c.port, c.ahead)
          const size = Math.min(BAND * 0.55, r * ((STEP * Math.PI) / 180) * 0.62)
          return (
            <text
              key={`n${c.port},${c.ahead}`}
              x={x}
              y={y + size * 0.36}
              fontSize={size}
              textAnchor="middle"
              fill={PRESS.paper}
              className="di-rg-step"
            >
              {c.steps}
            </text>
          )
        })}
      <path d={wedge(0, 0)} fill={PRESS.paper} stroke={ink} strokeWidth={0.7} />
      {/* The ship: a chevron pointing ahead, up the card. */}
      <path
        d="M0 -1.9 L1.45 1.8 L0 0.95 L-1.45 1.8 Z"
        fill={PRESS.ink}
        transform={`translate(${ship.x} ${ship.y})`}
      />
      {recoils(type) && (
        <g stroke={PRESS.ink} strokeWidth={0.55} fill="none">
          <line x1={ship.x + 1.9} y1={ship.y} x2={ship.x + BAND - 0.6} y2={ship.y} />
          <path
            d={`M${ship.x + BAND - 1.8} ${ship.y - 1} L${ship.x + BAND - 0.5} ${ship.y} L${ship.x + BAND - 1.8} ${ship.y + 1}`}
          />
        </g>
      )}
      <circle cx={CX} cy={CY} r={HOLE} fill={PRESS.ink} />
    </svg>
  )
}

/** A swatch in the key. */
function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <div className="di-rg-key">
      <i style={{ background: colour }} />
      {label}
    </div>
  )
}

export function RangeCard({ type }: { type: RangeCardType }) {
  const ink = cardInk(type)
  const config = SUBSYSTEM_CONFIGS[type]
  const name = tileName(type)
  const cells = reach(type)
  const wellwide = cells.some(c => c.wellwide)
  // The name fills the stripe's length, as the loadout cards' do, and no more.
  const nameSize = Math.min(10.5, 48 / (name.length * 0.5))
  return (
    <div className="di-lo-card di-rg-card" role="group" aria-label={name}>
      <div className="di-lo-stripe di-rg-stripe" style={{ background: ink }}>
        <svg
          viewBox="0 0 64 64"
          fill={PRESS.paper}
          className="di-rg-mark"
          aria-hidden="true"
          focusable="false"
        >
          <path fillRule="evenodd" d={SUBSYSTEM_PATHS[type]} />
        </svg>
        <div className="di-lo-name" style={{ fontSize: `${nameSize}mm` }}>
          {name}
        </div>
      </div>

      <div className="di-rg-fanbox">
        <Fan type={type} />
      </div>

      <div className="di-rg-top">
        <div className="di-lo-eyebrow" style={{ color: ink }}>
          {T.slots[config.slotType as 'forward' | 'side' | 'either']}
        </div>
        {type !== 'sensor_array' && (
          <div className="di-rg-stat">
            <span>{T.damage}</span>
            <b>{config.weaponStats!.damage}</b>
          </div>
        )}
        <div className="di-rg-stat">
          <span>{T.energy}</span>
          <b>{config.minEnergy}</b>
        </div>
      </div>

      <div className="di-rg-keys">
        {isOneSided(type) && <Key colour={ink} label={T.portMounts} />}
        {isOneSided(type) && <Key colour={PRESS.ink} label={T.starboardMounts} />}
        {wellwide && <Key colour={ink} label={T.firstFlight} />}
        {wellwide && <Key colour={PRESS.paperDeep} label={T.wellwide} />}
      </div>

      <div className="di-lo-bar di-rg-bar">
        <div className="di-rg-line">{cardLine(type)}</div>
      </div>
    </div>
  )
}
