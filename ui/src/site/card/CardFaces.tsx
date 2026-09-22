/**
 * The two faces of the printed card.
 *
 * Front: your turn. The goal, the seven steps in order, and the three moves
 * with what they cost, which is what a player looks down at while it is their
 * go. Back: the fight. The roll, the four guns, what a hit does, the tiles you
 * hold up, the heat check and what gives a tile away, which is what they look
 * at when somebody is shooting.
 *
 * What is **not** here is anything the board or the tiles already print: ring
 * speeds and lane sectors are on the board, mission text is on the missions.
 * What the board does not show is the *shape* of a move, so that is drawn
 * (`MovementDiagram`).
 *
 * Every number is read from the engine. What is written out is the wording,
 * which RULES.md owns and this compresses.
 */
import type { ReactNode } from 'react'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  BASE_CRITICAL_CHANCE,
  BLACKHOLE_RINGS,
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  DEFAULT_POINTS_TO_WIN,
  MAX_HEAT,
  MISSION_POINTS,
  SCAN_SECTOR_RANGE,
  SHIELD_ENERGY_PER_POINT,
  SHIELD_HEAT_PER_POINT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  interceptsPerRack,
  rollToResult,
} from '@dangerous-inclinations/engine'
import { TileIcon } from '../../art/glyphs'
import { PRESS } from '../../design/press'
import {
  BASE_CRIT,
  D10,
  INTERCEPT_ON,
  MISS_TOP,
  RADIATOR_DISSIPATION,
  SENSOR_CRIT,
  SENSOR_CRIT_BONUS,
  energyLabel,
  phasingStrip,
  tileName,
  weaponStats,
} from '../numbers'
import { TURN_STEPS } from '../turn'
import { MovementDiagram } from './MovementDiagram'

const INK = PRESS.ink
const RED = PRESS.red

const PRIMARY = MISSION_POINTS.destroy_ship
const SECONDARY = MISSION_POINTS.survey
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`)

function Card({ face, children }: { face: string; children: ReactNode }) {
  return (
    <div className="di-frame">
      <div className="di-card">
        <div className="di-head">
          <b>Dangerous Inclinations</b>
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

function Notes({ rows }: { rows: Array<[string, ReactNode]> }) {
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

// ---------------------------------------------------------------------------
// Front: your turn
// ---------------------------------------------------------------------------

export function CardFront() {
  const soft = BURN_COSTS.soft
  const hard = BURN_COSTS.hard
  return (
    <Card face="Turn/movement">
      <div className="di-goal">
        <strong>{DEFAULT_POINTS_TO_WIN} points end the round</strong>
        <span>
          Primary {PRIMARY} + either secondary {SECONDARY} wins. Ties: hull, then fuel.
        </span>
      </div>

      <Section title="The turn" aside="in order">
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
        <div className="di-quiet">Round 1, and your first turn back: nobody fires or scans</div>
      </Section>

      <Section title="Movement" aside="along the orbit">
        <MovementDiagram />
      </Section>

      <Section title="Costs">
        <table className="di-t">
          <thead>
            <tr>
              <th colSpan={2}>move</th>
              <th>fuel</th>
              <th>energy</th>
              <th className="di-l">and</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="di-ic">
                <Icon type="scoop" />
              </td>
              <td className="k">Coast</td>
              <td className="n">0</td>
              <td className="n">0</td>
              <td className="di-w">
                Scoop ({SUBSYSTEM_CONFIGS.scoop.minEnergy} energy): +fuel equal to ring speed
              </td>
            </tr>
            <tr>
              <td className="di-ic">
                <Icon type="engines" />
              </td>
              <td className="k">Burn</td>
              <td className="n">{range(soft.mass, hard.mass)}</td>
              <td className="n">{range(soft.energy, hard.energy)}</td>
              <td className="di-w">1 of each a ring; prograde out</td>
            </tr>
            <tr>
              <td className="di-ic">
                <Icon type="engines" />
              </td>
              <td className="k">Jump</td>
              <td className="n">
                {WELL_TRANSFER_COSTS.mass}
                <span className="r">/{COMPRESSED_JUMP_MASS}</span>
              </td>
              <td className="n">{WELL_TRANSFER_COSTS.energy}</td>
              <td className="di-w">
                No drift; <b className="r">{COMPRESSED_JUMP_MASS}</b> fuel with a compressor
              </td>
            </tr>
            <tr>
              <td className="di-ic">
                <Icon type="rotation" />
              </td>
              <td className="k">Rotate</td>
              <td className="n">0</td>
              <td className="n">{SUBSYSTEM_CONFIGS.rotation.minEnergy}</td>
              <td className="di-w">Flip facing</td>
            </tr>
          </tbody>
        </table>
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
      <b>phase</b>
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
      <span className="di-phase-note">fuel to land, from speed {drift}</span>
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
  const bare = rollToResult(face, BASE_CRITICAL_CHANCE)
  if (bare === 'miss') return 'di-miss'
  if (bare === 'critical') return 'di-crit'
  return rollToResult(face, BASE_CRITICAL_CHANCE + SENSOR_CRIT_BONUS) === 'critical'
    ? 'di-sensor'
    : 'di-hit'
}

const WEAPONS: Array<{ type: SubsystemType; reach: ReactNode }> = [
  {
    type: 'railgun',
    reach: <>same ring, 1&ndash;{weaponStats('railgun').sectorRange} ahead; recoils a ring</>,
  },
  {
    type: 'laser',
    reach: (
      <>
        &plusmn;{weaponStats('laser').ringRange} rings &plusmn;{weaponStats('laser').sectorRange},
        one side; <b className="r">ignores shields</b>
      </>
    ),
  },
  {
    type: 'ballistic_rack',
    reach: (
      <>
        &plusmn;{weaponStats('ballistic_rack').ringRange} ring &plusmn;
        {weaponStats('ballistic_rack').sectorRange} either side, or 1 along your ring
      </>
    ),
  },
  {
    type: 'missiles',
    reach: (
      <>
        anyone in your well; a salvo is one action. {weaponStats('missiles').maxAmmo} aboard, fly{' '}
        {weaponStats('missiles').fuelPerTurn} a turn for {weaponStats('missiles').maxMoves}
      </>
    ),
  },
]

const POWERED: Array<{ type: SubsystemType; effect: ReactNode }> = [
  {
    type: 'shields',
    effect: `${SHIELD_ENERGY_PER_POINT} energy stop 1 damage, as ${SHIELD_HEAT_PER_POINT} heat; not lasers`,
  },
  {
    type: 'ballistic_rack',
    effect: `shoots down ${interceptsPerRack()} missiles a turn, each on ${INTERCEPT_ON}+`,
  },
  {
    type: 'sensor_array',
    effect: `your shots after it crit on ${SENSOR_CRIT}+; scan: your ring, within ${SCAN_SECTOR_RANGE}, see a subsystem`,
  },
]

const PASSIVE: Array<{ type: SubsystemType; effect: ReactNode }> = [
  {
    type: 'radiator',
    effect: `+${RADIATOR_DISSIPATION} dissipation; shows above ${DEFAULT_DISSIPATION_CAPACITY} heat`,
  },
  {
    type: 'fuel_compressor',
    effect: `a jump costs ${COMPRESSED_JUMP_MASS} fuel, not ${WELL_TRANSFER_COSTS.mass}`,
  },
]

function TileRows({ rows }: { rows: Array<{ type: SubsystemType; effect: ReactNode }> }) {
  return (
    <table className="di-t">
      <tbody>
        {rows.map(({ type, effect }) => (
          <tr key={type}>
            <td className="di-ic">
              <Icon type={type} />
            </td>
            <td className="k">{tileName(type)}</td>
            <td className="n">{energyLabel(type)}</td>
            <td className="di-w">{effect}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CardBack() {
  return (
    <Card face="Subsystems">
      <Section title="The roll" aside="one d10 a shot">
        <div className="di-roll">
          {D10.map(face => (
            <span key={face} className={rollClass(face)}>
              {face}
            </span>
          ))}
        </div>
        <Notes
          rows={[
            ['name', `A slot to be the target in case of a critical hit`],

            [
              'Roll a d10',
              <>
                {MISS_TOP} miss · {MISS_TOP + 1}&ndash;{BASE_CRIT - 1} hit · {BASE_CRIT} crit ·{' '}
                <b className="r">
                  {SENSOR_CRIT}&ndash;{BASE_CRIT - 1} crit with a powered sensor
                </b>
              </>,
            ],
            ['hit', 'Shields absorb first, except lasers'],
            [
              'critical',
              'Breaks the named subsystem through the shields, face-up. Its energy goes onto its owner’s heat',
            ],
          ]}
        />
      </Section>

      <Section title="Weapons" aside="each fires once a turn">
        <table className="di-t">
          <thead>
            <tr>
              <th colSpan={2}>subsystem</th>
              <th>energy</th>
              <th>dmg</th>
              <th className="di-l">reaches</th>
            </tr>
          </thead>
          <tbody>
            {WEAPONS.map(({ type, reach }) => (
              <tr key={type}>
                <td className="di-ic">
                  <Icon type={type} />
                </td>
                <td className="k">{tileName(type)}</td>
                <td className="n">{energyLabel(type)}</td>
                <td className="n r">{weaponStats(type).damage}</td>
                <td className="di-w">{reach}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Powered" aside="works until your next turn">
        <TileRows rows={POWERED} />
      </Section>

      <Section title="Passive" aside="nothing to power">
        <TileRows rows={PASSIVE} />
      </Section>

      <Section title="Heat check" aside="energy turns to heat">
        {/* One sum, three outcomes, then the same two steps for every one of them. */}
        <div className="di-tree">
          <span className="k">
            carried
            <br />+ energy
          </span>
          <i className="l" />
          <div className="di-fork">
            <span>
              <b>0</b>&nbsp;repair 1 subsystem
            </span>
            <span>
              <b>1&ndash;{MAX_HEAT}</b>
            </span>
            <span className="x">
              <b>over {MAX_HEAT}</b>&nbsp;excess to hull
            </span>
          </div>
          <i className="l" />
          <span>
            dissipate {DEFAULT_DISSIPATION_CAPACITY}
            <br />+{RADIATOR_DISSIPATION} a radiator
          </span>
          <i className="a">&rarr;</i>
          <span className="k">carry</span>
        </div>
      </Section>

      <Section title="Face-down" aside="energy is public">
        <div className="di-fine" style={{ marginTop: 0 }}>
          Using a subsystem turns it face-up; powering it does not.
        </div>
      </Section>
    </Card>
  )
}
