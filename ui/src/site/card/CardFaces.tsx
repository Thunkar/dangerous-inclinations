/**
 * The two faces of the printed card.
 *
 * Front: your turn. The goal, the seven steps in order, and the three moves
 * with what they cost, which is what a player looks down at while it is their
 * go. Back: the fight. The roll, the six weapons, what a hit does, the tiles you
 * hold up, the heat check and what gives a tile away, which is what they look
 * at when somebody is shooting. The radiator and the compressor have no row of
 * their own: the radiator is in the heat check and the compressor on the
 * front's jump.
 *
 * What is **not** here is anything the board or the tiles already print: ring
 * speeds and lane sectors are on the board, mission text is on the missions.
 * What the board does not show is the *shape* of a move, so that is drawn
 * (`MovementDiagram`).
 *
 * Every number is read from the engine. What is written out is the wording,
 * which RULES.md owns and this compresses; it lives in `text/printedCard.ts`.
 */
import type { ReactNode } from 'react'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  BLACKHOLE_RINGS,
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  INTERCEPT_HEAT,
  DEFAULT_DISSIPATION_CAPACITY,
  DEFAULT_POINTS_TO_WIN,
  MAX_HEAT,
  MISSION_POINTS,
  SCAN_SECTOR_RANGE,
  SHIELD_POINTS_PER_ENERGY,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  fill,
  interceptsPerRack,
} from '@dangerous-inclinations/engine'
import { TileIcon } from '../../art/glyphs'
import { INK, RED } from '../diagram'
import {
  BASE_CRIT,
  D10,
  INTERCEPT_ON,
  MISS_TOP,
  PLASMA_SHIELD_POINTS,
  RADIATOR_DISSIPATION,
  SENSOR_CRIT,
  energyLabel,
  faceResult,
  phasingStrip,
  tileName,
  weaponStats,
} from '../numbers'
import { TURN_STEPS } from '../turn'
import { MovementDiagram } from './MovementDiagram'
import { PRINTED_CARD } from '../../text/printedCard'
import { rich, type RichTags } from '../../utils/rich'
import { span } from '../tools/windows'

const F = PRINTED_CARD.front
const B = PRINTED_CARD.back
/** On the card, red words are bold. */
const RED_WORDS: RichTags = { red: text => <b className="r">{text}</b> }

/** A cost or a figure of nothing: a dash, as the weapons table prints a gun that deals none. */
const NONE = B.weapons.noDamage

const PRIMARY = MISSION_POINTS.destroy_ship
const SECONDARY = MISSION_POINTS.survey

function Card({ face, children }: { face: string; children: ReactNode }) {
  return (
    <div className="di-frame">
      <div className="di-card">
        <div className="di-head">
          <b>{PRINTED_CARD.head}</b>
          <span>{face}</span>
        </div>
        {children}
      </div>
    </div>
  )
}

function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: string
  children: ReactNode
}) {
  return (
    <div className="di-sec">
      <div className="di-band">
        {title}
        {aside && <em>{aside}</em>}
      </div>
      {children}
    </div>
  )
}

function Notes({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <div className="di-notes">
      {rows.map(([label, value]) => (
        <div key={label}>
          <b>{label}</b>
          <span>{value}</span>
        </div>
      ))}
    </div>
  )
}

const Icon = ({ type }: { type: SubsystemType }) => <TileIcon type={type} size={9} title={null} />

/** A row of a card table: an icon, a name, its numbers and a line of text. */
interface TableRow {
  key: string
  icon: SubsystemType
  name: string
  numbers: ReactNode[]
  text: ReactNode
}

/**
 * Every table on the card has one shape: icon, name, the numbers (energy
 * first), then the text that says what it does. Same header, same column
 * widths, same rules between rows, so a column read in one table is the same
 * column in the next. `red` marks the number columns set in red.
 */
function CardTable({
  head,
  rows,
  red = [],
}: {
  head: { name: string; numbers: string[]; text: string; hidden?: boolean }
  rows: TableRow[]
  red?: number[]
}) {
  return (
    <table className="di-t">
      <colgroup>
        <col className="di-c-ic" />
        <col className="di-c-k" />
        {head.numbers.map(n => (
          <col key={n} className="di-c-n" />
        ))}
        <col />
      </colgroup>
      <thead className={head.hidden ? 'di-quiet-head' : undefined}>
        <tr>
          <th colSpan={2}>{head.name}</th>
          {head.numbers.map(n => (
            <th key={n}>
              <span>{n}</span>
            </th>
          ))}
          <th className="di-l">{head.text}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key}>
            <td className="di-ic">
              <Icon type={row.icon} />
            </td>
            <td className="k">{row.name}</td>
            {row.numbers.map((n, i) => (
              <td key={i} className={red.includes(i) ? 'n r' : 'n'}>
                {n}
              </td>
            ))}
            <td className="di-w">{row.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Front: your turn
// ---------------------------------------------------------------------------

export function CardFront() {
  const soft = BURN_COSTS.soft
  const hard = BURN_COSTS.hard
  return (
    <Card face={F.face}>
      <div className="di-goal">
        <strong>{rich(F.goal.title, { points: DEFAULT_POINTS_TO_WIN })}</strong>
        <span>{rich(F.goal.text, { primary: PRIMARY, secondary: SECONDARY })}</span>
      </div>

      <Section title={F.turn.title} aside={F.turn.aside}>
        <div className="di-steps">
          {TURN_STEPS.map((step, index) => (
            <Row
              key={step.title}
              n={index + 1}
              title={step.title}
              text={step.terse}
              roundEnd={step.roundEnd}
            />
          ))}
        </div>
        <div className="di-quiet">{F.turn.quiet}</div>
      </Section>

      <Section title={F.movement.title} aside={F.movement.aside}>
        <MovementDiagram />
      </Section>

      <Section title={F.costs.title}>
        <CardTable
          head={{
            name: F.costs.columns.move,
            numbers: [F.costs.columns.energy, F.costs.columns.fuel],
            text: F.costs.columns.and,
          }}
          rows={[
            {
              key: 'coast',
              icon: 'scoop',
              name: F.costs.coast.move,
              numbers: [NONE, NONE],
              text: rich(F.costs.coast.and, { energy: SUBSYSTEM_CONFIGS.scoop.minEnergy }),
            },
            {
              key: 'burn',
              icon: 'engines',
              name: F.costs.burn.move,
              numbers: [span(soft.energy, hard.energy), span(soft.mass, hard.mass)],
              text: F.costs.burn.and,
            },
            {
              key: 'jump',
              icon: 'engines',
              name: F.costs.jump.move,
              numbers: [
                WELL_TRANSFER_COSTS.energy,
                rich(
                  F.costs.jump.fuel,
                  { fuel: WELL_TRANSFER_COSTS.mass, compressed: COMPRESSED_JUMP_MASS },
                  { red: text => <span className="r">{text}</span> }
                ),
              ],
              text: rich(F.costs.jump.and, { compressed: COMPRESSED_JUMP_MASS }, RED_WORDS),
            },
            {
              key: 'rotate',
              icon: 'rotation',
              name: F.costs.rotate.move,
              numbers: [SUBSYSTEM_CONFIGS.rotation.minEnergy, NONE],
              text: F.costs.rotate.and,
            },
          ]}
        />
        <Phasing />
      </Section>
    </Card>
  )
}

/**
 * Phasing on a burn, drawn across the two rings it happens between: the ship
 * and its drift on the ring it starts from (below), and what each landing
 * sector costs on the ring a soft burn out puts it on (above). Drawn in tenths
 * of a millimetre, so every length here is the length that prints.
 */
function Phasing() {
  const from = BLACKHOLE_RINGS[2]
  const strip = phasingStrip(from.velocity)
  const step = 45
  const cell = 40
  const x = (sector: number) => sector * step
  const mid = (sector: number) => x(sector) + cell / 2
  const width = x(strip.length) + cell
  const drift = from.velocity
  return (
    <div className="di-phase">
      <b>{F.costs.phase}</b>
      <svg
        className="di-phase-strip"
        viewBox={`0 0 ${width} 58`}
        style={{ width: `${width / 10}mm`, height: '5.8mm' }}
      >
        {strip.map(({ sector, fuel }) => (
          <g key={sector}>
            <rect x={x(sector)} y={0} width={cell} height={26} fill={fuel === 0 ? INK : RED} />
            <text
              x={mid(sector)}
              y={20}
              textAnchor="middle"
              fontFamily="var(--di-display)"
              fontWeight={700}
              fontSize={20}
              fill="#fff"
            >
              {fuel}
            </text>
          </g>
        ))}
        <line x1={0} y1={47} x2={width} y2={47} stroke={INK} strokeWidth={3} />
        <path d={`M${mid(0) + 9} 47L${mid(0) - 7} 40V54z`} fill={INK} />
        <path
          d={`M${mid(0) + 12} 47H${mid(drift) - 3}`}
          stroke={INK}
          strokeWidth={4}
          strokeDasharray="7 4"
          fill="none"
        />
        <path d={`M${mid(drift)} 42V30`} stroke={RED} strokeWidth={6} fill="none" />
        <path d={`M${mid(drift) - 7} 33L${mid(drift)} 26L${mid(drift) + 7} 33z`} fill={RED} />
      </svg>
      <span className="di-phase-note">{rich(F.costs.phaseNote, {})}</span>
    </div>
  )
}

function Row({
  n,
  title,
  text,
  roundEnd,
}: {
  n: number
  title: string
  text: string
  /** The round's step, not a turn's: its number is printed in red. */
  roundEnd?: boolean
}) {
  return (
    <>
      <i className={roundEnd ? 'e' : undefined}>{n}</i>
      <u>{title}</u>
      <span>{text}</span>
    </>
  )
}

// ---------------------------------------------------------------------------
// Back: the fight
// ---------------------------------------------------------------------------

function rollClass(face: number): string {
  const bare = faceResult(face)
  if (bare === 'miss') return 'di-miss'
  if (bare === 'critical') return 'di-crit'
  return faceResult(face, true) === 'critical' ? 'di-sensor' : 'di-hit'
}

const WEAPONS: Array<{ type: SubsystemType; reach: ReactNode }> = [
  {
    type: 'railgun',
    reach: rich(B.weapons.reach.railgun, { sectors: weaponStats('railgun').sectorRange! }),
  },
  {
    type: 'laser',
    reach: rich(
      B.weapons.reach.laser,
      { rings: weaponStats('laser').ringRange!, sectors: weaponStats('laser').sectorRange! },
      RED_WORDS
    ),
  },
  {
    type: 'plasma_cannon',
    reach: rich(
      B.weapons.reach.plasma_cannon,
      {
        rings: weaponStats('plasma_cannon').ringRange!,
        sectors: weaponStats('plasma_cannon').sectorRange!,
        points: PLASMA_SHIELD_POINTS,
      },
      RED_WORDS
    ),
  },
  {
    type: 'ballistic_rack',
    reach: rich(B.weapons.reach.ballistic_rack, {
      rings: weaponStats('ballistic_rack').ringRange!,
      sectors: weaponStats('ballistic_rack').sectorRange!,
    }),
  },
  {
    type: 'disruptor',
    reach: rich(
      B.weapons.reach.disruptor,
      {
        rings: weaponStats('disruptor').ringRange!,
        sectors: weaponStats('disruptor').sectorRange!,
      },
      RED_WORDS
    ),
  },
  {
    type: 'missiles',
    reach: rich(B.weapons.reach.missiles, {
      aboard: weaponStats('missiles').maxAmmo!,
      steps: weaponStats('missiles').stepsPerMove!,
      turns: weaponStats('missiles').maxMoves!,
    }),
  },
]

const POWERED: Array<{ type: SubsystemType; effect: ReactNode }> = [
  {
    type: 'shields',
    effect: fill(B.powered.shields, { points: SHIELD_POINTS_PER_ENERGY }),
  },
  {
    type: 'ballistic_rack',
    effect: fill(B.powered.ballistic_rack, {
      missiles: interceptsPerRack(),
      on: INTERCEPT_ON,
      heat: INTERCEPT_HEAT,
    }),
  },
  {
    type: 'sensor_array',
    effect: fill(B.powered.sensor_array, { crit: SENSOR_CRIT, sectors: SCAN_SECTOR_RANGE }),
  },
]

export function CardBack() {
  return (
    <Card face={B.face}>
      <Section title={B.roll.title} aside={B.roll.aside}>
        <div className="di-roll">
          {D10.map(face => (
            <span key={face} className={rollClass(face)}>
              {face}
            </span>
          ))}
        </div>
        <Notes
          rows={[
            B.roll.notes.name,
            [
              B.roll.notes.roll[0],
              rich(
                B.roll.notes.roll[1],
                {
                  miss: MISS_TOP,
                  hitFrom: MISS_TOP + 1,
                  hitTo: BASE_CRIT - 1,
                  crit: BASE_CRIT,
                  sensorFrom: SENSOR_CRIT,
                  sensorTo: BASE_CRIT - 1,
                },
                RED_WORDS
              ),
            ],
            B.roll.notes.hit,
            B.roll.notes.critical,
            B.roll.notes.moored,
          ]}
        />
      </Section>

      <Section title={B.weapons.title} aside={B.weapons.aside}>
        <CardTable
          head={{
            name: B.weapons.columns.subsystem,
            numbers: [B.weapons.columns.energy, B.weapons.columns.damage],
            text: B.weapons.columns.reaches,
          }}
          red={[1]}
          rows={WEAPONS.map(({ type, reach }) => ({
            key: type,
            icon: type,
            name: tileName(type),
            numbers: [energyLabel(type), weaponStats(type).damage || B.weapons.noDamage],
            text: reach,
          }))}
        />
      </Section>

      <Section title={B.powered.title} aside={B.powered.aside}>
        <CardTable
          head={{
            name: B.powered.columns.subsystem,
            numbers: [B.powered.columns.energy],
            text: B.powered.columns.effect,
            // The weapons table above names these columns already.
            hidden: true,
          }}
          rows={POWERED.map(({ type, effect }) => ({
            key: type,
            icon: type,
            name: tileName(type),
            numbers: [energyLabel(type)],
            text: effect,
          }))}
        />
      </Section>

      <Section title={B.heat.title} aside={B.heat.aside}>
        {/* One sum, three outcomes, then the same two steps for every one of them. */}
        <div className="di-tree">
          <span className="k">
            {B.heat.sum[0]}
            <br />
            {B.heat.sum[1]}
          </span>
          <i className="l" />
          <div className="di-fork">
            <span>{rich(B.heat.cold)}</span>
            <span>{rich(B.heat.normal, { maxHeat: MAX_HEAT })}</span>
            <span className="x">{rich(B.heat.over, { maxHeat: MAX_HEAT })}</span>
          </div>
          <i className="l" />
          <span>
            {rich(B.heat.dissipate[0], { dissipation: DEFAULT_DISSIPATION_CAPACITY })}
            <br />
            {rich(B.heat.dissipate[1], { radiator: RADIATOR_DISSIPATION })}
          </span>
          <i className="a">{B.heat.arrow}</i>
          <span className="k">{B.heat.carry}</span>
        </div>
      </Section>

      <Section title={B.faceDown.title} aside={B.faceDown.aside}>
        <div className="di-fine" style={{ marginTop: 0 }}>
          {fill(B.faceDown.text, { heat: DEFAULT_DISSIPATION_CAPACITY })}
        </div>
      </Section>
    </Card>
  )
}
