/**
 * How a missile flies, drawn: the one weapon whose shot takes turns to land.
 *
 * Two cases, each followed for two turns: a missile fired before its ship
 * moves stays behind and rides its ring before it flies; one fired after the
 * move has already ridden along with the ship, so it skips the ride on its
 * first turn. Between the two turns the target drifts on its own turn, and the
 * second flight goes where the target is then.
 *
 * Every position is the engine's: `driftPosition` for a ride and `stepToward`
 * one step at a time for a flight (rings first, then sectors), so the picture
 * is the rule, not a drawing of it.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import type { Position } from '@dangerous-inclinations/engine'
import {
  BLACK_HOLE_ID,
  BLACK_HOLE_OUTER_RING,
  driftPosition,
  getMissileStats,
  getRingConfig,
  stepToward,
} from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body } from '../poster'
import { INTERCEPT_ON } from '../numbers'

const MISSILE = getMissileStats()
/** The two outer rings of the black hole: the slowest, so two turns fit across a page. */
const OUTER = BLACK_HOLE_OUTER_RING
const INNER = OUTER - 1
const RINGS = [INNER, OUTER]
const at = (ring: number, sector: number): Position => ({ wellId: BLACK_HOLE_ID, ring, sector })

/** Where the target is when each flight is flown: it drifts on its own turn in between. */
const TARGET_1 = at(INNER, 6)
const TARGET_2 = driftPosition(TARGET_1)

interface Turn {
  /** Where the missile starts the turn's move, before any ride. */
  from: Position
  /** After the ride, or `from` again when it skips it. */
  rode: Position
  /** Each step of the flight, ending on the target if it got there. */
  steps: Position[]
  hit: boolean
}

const same = (a: Position, b: Position) => a.ring === b.ring && a.sector === b.sector

function flyTurn(from: Position, target: Position, ride: boolean): Turn {
  const rode = ride ? driftPosition(from) : from
  const steps: Position[] = []
  let here = rode
  for (let left = MISSILE.fuelPerTurn; left > 0 && !same(here, target); left--) {
    here = stepToward(here, target, 1)
    steps.push(here)
  }
  return { from, rode, steps, hit: same(here, target) }
}

/** Two turns of one missile, launched at `launch`, riding on its first turn or not. */
function twoTurns(launch: Position, launchedAfterMove: boolean): Turn[] {
  const first = flyTurn(launch, TARGET_1, !launchedAfterMove)
  const end = first.steps[first.steps.length - 1] ?? first.rode
  return [first, flyTurn(end, TARGET_2, true)]
}

const COLUMNS = 10
const CELL = 50
const STEP = 54
const LEFT = 104
const ROW = 64
const TOP = 26
const x = (sector: number) => LEFT + sector * STEP
const cx = (sector: number) => x(sector) + CELL / 2
const rowOf = (ring: number) => RINGS.indexOf(ring)
const y = (ring: number) => TOP + rowOf(ring) * ROW
const cy = (ring: number) => y(ring) + CELL / 2
const WIDTH = x(COLUMNS - 1) + CELL + 4
const HEIGHT = TOP + RINGS.length * ROW + 14

/** Turn one in red, turn two in black. */
const TURN_COLOR = [PRESS.red, PRESS.ink]

function Tag({
  x: left,
  y: base,
  children,
  color = PRESS.ink,
}: {
  x: number
  y: number
  children: string
  color?: string
}) {
  return (
    <text
      x={left}
      y={base}
      textAnchor="middle"
      fontFamily={FONT_DISPLAY}
      fontWeight={600}
      fontSize={13}
      letterSpacing="0.08em"
      fill={color}
    >
      {children.toUpperCase()}
    </text>
  )
}

/** One turn of a flight: its lines, or its numbered steps (drawn over every line). */
function TurnPath({ turn, index, layer }: { turn: Turn; index: number; layer: 'lines' | 'steps' }) {
  const last = turn.steps.length - 1
  const color = TURN_COLOR[index]
  const flight = [turn.rode, ...turn.steps].map(p => `${cx(p.sector)} ${cy(p.ring)}`).join('L')
  return (
    <g>
      {layer === 'lines' && !same(turn.from, turn.rode) && (
        <path
          d={`M${cx(turn.from.sector)} ${cy(turn.from.ring)}H${cx(turn.rode.sector)}`}
          stroke={color}
          strokeWidth={5}
          strokeDasharray="9 6"
          fill="none"
        />
      )}
      {layer === 'lines' && turn.steps.length > 0 && (
        <path d={`M${flight}`} stroke={color} strokeWidth={5} fill="none" />
      )}
      {layer === 'steps' &&
        turn.steps.map((step, n) => (
          <g key={n}>
            <circle
              cx={cx(step.sector)}
              cy={cy(step.ring)}
              r={12}
              fill={color}
              // The step that lands on the target sits on a black cell: ring it in paper.
              stroke={turn.hit && n === last ? PRESS.paper : 'none'}
              strokeWidth={3}
            />
            <text
              x={cx(step.sector)}
              y={cy(step.ring) + 5}
              textAnchor="middle"
              fontFamily={FONT_DISPLAY}
              fontWeight={700}
              fontSize={15}
              fill={PRESS.paper}
            >
              {n + 1}
            </text>
          </g>
        ))}
    </g>
  )
}

/** The ship, nose along its ring; outlined where it stood before its move. */
function Ship({ at: where, hollow = false }: { at: Position; hollow?: boolean }) {
  const [px, py] = [cx(where.sector), cy(where.ring)]
  return (
    <path
      d={`M${px + 11} ${py}L${px - 8} ${py - 9}V${py + 9}z`}
      fill={hollow ? 'none' : PRESS.ink}
      stroke={PRESS.ink}
      strokeWidth={2}
    />
  )
}

function Case({
  title,
  launch,
  afterMove,
  shipFrom,
}: {
  title: string
  launch: Position
  afterMove: boolean
  /** Where the ship made its move from, when the missile is fired after it. */
  shipFrom?: Position
}) {
  const turns = twoTurns(launch, afterMove)
  const hitTurn = turns.findIndex(t => t.hit)
  const label = `${title}: the missile ${
    afterMove
      ? 'starts where the move left the ship and skips the ride on its first turn'
      : 'stays behind, rides its ring, then flies'
  }, and reaches the target on turn ${hitTurn + 1}`
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: '1.15rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          mb: 0.5,
        }}
      >
        {title}
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={label}
          style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }}
        >
          {RINGS.map(ring => (
            <g key={ring}>
              <text
                x={0}
                y={cy(ring) + 1}
                fontFamily={FONT_DISPLAY}
                fontWeight={700}
                fontSize={18}
                fill={PRESS.ink}
              >
                RING {ring}
              </text>
              <text
                x={0}
                y={cy(ring) + 18}
                fontFamily={FONT_DISPLAY}
                fontSize={12}
                letterSpacing="0.06em"
                fill={PRESS.ink}
              >
                SPEED {getRingConfig(BLACK_HOLE_ID, ring)?.velocity}
              </text>
              {Array.from({ length: COLUMNS }, (_, sector) => (
                <rect
                  key={sector}
                  x={x(sector)}
                  y={y(ring)}
                  width={CELL}
                  height={CELL}
                  fill="none"
                  stroke={PRESS.inkFaint}
                  strokeWidth={2}
                />
              ))}
            </g>
          ))}

          {/* The target on the first flight, and where its own turn drifts it. */}
          <rect
            x={x(TARGET_1.sector) + 3}
            y={y(TARGET_1.ring) + 3}
            width={CELL - 6}
            height={CELL - 6}
            fill="none"
            stroke={PRESS.ink}
            strokeWidth={3}
            strokeDasharray="5 4"
          />
          <rect
            x={x(TARGET_2.sector)}
            y={y(TARGET_2.ring)}
            width={CELL}
            height={CELL}
            fill={PRESS.ink}
          />
          <path
            d={`M${cx(TARGET_2.sector) + 12} ${cy(TARGET_2.ring)}L${cx(TARGET_2.sector) - 9} ${cy(TARGET_2.ring) - 10}V${
              cy(TARGET_2.ring) + 10
            }z`}
            fill={PRESS.paper}
          />
          <Tag x={(cx(TARGET_1.sector) + cx(TARGET_2.sector)) / 2} y={y(TARGET_1.ring) - 9}>
            target drifts
          </Tag>

          {/* The ship's own move, when the shot comes after it. */}
          {shipFrom && (
            <>
              <path
                d={`M${cx(shipFrom.sector) + 12} ${cy(shipFrom.ring)}H${cx(launch.sector)}V${cy(launch.ring) + 12}`}
                stroke={PRESS.ink}
                strokeWidth={2}
                strokeDasharray="3 4"
                fill="none"
              />
              <Ship at={shipFrom} hollow />
              <Tag x={cx(shipFrom.sector)} y={y(shipFrom.ring) + CELL + 13}>
                your move
              </Tag>
            </>
          )}

          {turns.map((turn, index) => (
            <TurnPath key={`l${index}`} turn={turn} index={index} layer="lines" />
          ))}
          {turns.map((turn, index) => (
            <TurnPath key={`s${index}`} turn={turn} index={index} layer="steps" />
          ))}

          {/* Launched: the missile starts on its ship's sector. */}
          <circle cx={cx(launch.sector)} cy={cy(launch.ring)} r={8} fill={PRESS.red} />
          <Tag
            x={cx(launch.sector)}
            y={rowOf(launch.ring) === 0 ? y(launch.ring) - 9 : y(launch.ring) + CELL + 13}
            color={PRESS.redText}
          >
            launch
          </Tag>
          {hitTurn >= 0 && (
            <Tag x={cx(TARGET_2.sector)} y={y(TARGET_2.ring) + CELL + 13} color={PRESS.redText}>
              {`hit, turn ${hitTurn + 1}`}
            </Tag>
          )}
        </svg>
      </Box>
    </Box>
  )
}

/** The legend the two cases share. */
function Key() {
  const item = (swatch: ReactNode, text: string) => (
    <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      {swatch}
      <Box
        component="span"
        sx={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '0.9rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {text}
      </Box>
    </Box>
  )
  const dot = (color: string) => (
    <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: color }} />
  )
  const line = (dashed: boolean) => (
    <svg width={34} height={8} aria-hidden focusable="false">
      <path
        d="M0 4H34"
        stroke={PRESS.ink}
        strokeWidth={4}
        strokeDasharray={dashed ? '7 5' : undefined}
      />
    </svg>
  )
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', mb: 2 }}>
      {item(dot(PRESS.red), 'turn 1')}
      {item(dot(PRESS.ink), 'turn 2')}
      {item(line(true), 'rides its orbit')}
      {item(line(false), `flies ${MISSILE.fuelPerTurn}, rings first`)}
    </Box>
  )
}

export function MissileFlight() {
  const shipFrom = at(OUTER, 0)
  // Move, then fire: a soft burn inward from the outer ring (the ship drifts
  // with it, then drops a ring) and the missile is dropped where it ended.
  const afterBurn = { ...driftPosition(shipFrom), ring: INNER }
  return (
    <Box>
      <Key />
      <Box sx={{ display: 'grid', gap: 3, maxWidth: 760 }}>
        <Case title="Fire, then move" launch={shipFrom} afterMove={false} />
        <Case title="Move, then fire" launch={afterBurn} afterMove shipFrom={shipFrom} />
      </Box>
      <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 1.5 }}>
        At the end of each of your turns a missile rides its orbit, then flies {MISSILE.fuelPerTurn}{' '}
        steps. Fired after you move, it has already ridden with you: no ride that turn. On the
        target&rsquo;s sector it attacks like a weapon ({MISSILE.damage} damage), unless a rack with
        energy on it shoots it down on {INTERCEPT_ON}+. It lasts {MISSILE.maxMoves} turns.
      </Body>
    </Box>
  )
}
