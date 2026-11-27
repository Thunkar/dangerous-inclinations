/**
 * The player card's two faces, one diagram a face. The front is the turn as a
 * short numbered list, a pictogram a step, over the four moves drawn on one
 * large fan of the black hole's rings, their costs drawn as the subsystems
 * that take them. The back draws a shot, from the roll through the shield to
 * heat and hull, and the heat check as one worked sum; the drawings carry the
 * rules and the words are captions. Every word is in `text/printedCard.ts`.
 */
import { useId, type ReactNode } from 'react'
import { fill } from '@dangerous-inclinations/engine'
import { PRINTED_CARD } from '../../text/printedCard'
import { Face } from './Face'
import { CARD_SCALE, PLAYER_PAD, playerWidth } from './cardStyles'
import { HEAT_EXAMPLE, N, SHOT_EXAMPLE } from './numbers'
import { Compressed as CompressedFuel, Energy, Fuel, Heat, Hull } from '../marks'
import {
  ArcArrow,
  Arrow,
  Cap,
  Card,
  Cube,
  Cubes,
  HeatCube,
  D10,
  Head,
  Home,
  Lines,
  Pic,
  Ship,
  Station,
  Tile,
} from './pictos'
import { INK, PAPER, RED, arc, polar, pt, faceKind } from './draw'

const F = PRINTED_CARD.front
const B = PRINTED_CARD.back

/** The width the drawings were laid out for, millimetres as drawn. */
const W = 64
/** The front's width: its drawings span it, so the goal's cards and the moves' labels sit at its right. */
const FW = playerWidth('front')
/** How much wider the front is than the drawings were laid out for. */
const SPREAD = FW - W
/** The back's width: the dice strip and the heat check spread across it. */
const BW = playerWidth('back')
/** The turn's step that is the heat check: its number in the list and on the back. */
const HEAT_STEP = 4
/** The energy on the slot the worked critical breaks, which goes onto the heat track. */
const CRIT_CUBES = 2

// ---------------------------------------------------------------------------
// Front: the turn, then the moves
// ---------------------------------------------------------------------------

/** A step's pictogram, 7.2 by 4.6 millimetres. */
const IW = 7.2
const IH = 3.8

function Icon({ children }: { children: ReactNode }) {
  return (
    <Pic w={IW} h={IH}>
      {children}
    </Pic>
  )
}

const ICONS = {
  destroyed: (
    <Icon>
      <Ship x={1.4} y={1.9} size={1.3} />
      <path d="M0.4 0.5L2.6 3.3M2.6 0.5L0.4 3.3" stroke={RED} strokeWidth={0.45} />
      <Arrow x1={3.1} y1={1.9} x2={4.6} y2={1.9} w={0.45} head={1} />
      <Home x={6} y={1.9} s={2.3} />
    </Icon>
  ),
  clear: (
    <Icon>
      <Tile x={0.2} y={0.1} s={2.4} cubes={2} />
      <Arrow x1={3.1} y1={1.6} x2={4.6} y2={1.6} w={0.45} head={1} />
      <Cube x={5} y={2.2} s={1.4} />
      <Cube x={5.8} y={0.7} s={1.4} />
    </Icon>
  ),
  actions: (
    <Icon>
      <Tile x={0.1} y={0.2} s={2.2} type="railgun" />
      <Tile x={2.5} y={0.2} s={2.2} type="laser" />
      <Tile x={4.9} y={0.2} s={2.2} type="shields" />
      <Cubes x={0.3} y={2.9} n={2} s={0.9} gap={0.25} />
      <Cubes x={2.7} y={2.9} n={2} s={0.9} gap={0.25} />
    </Icon>
  ),
  missiles: (
    <Icon>
      {[0.8, 2.4, 4].map(x => (
        <circle key={x} cx={x} cy={1.9} r={0.35} fill={RED} />
      ))}
      <line x1={0.8} y1={1.9} x2={5.4} y2={1.9} stroke={RED} strokeWidth={0.25} />
      <Head x={6.3} y={1.9} angle={0} s={1.3} fill={INK} />
    </Icon>
  ),
  heat: (
    <Icon>
      <Cube x={0.4} y={0.9} s={2} />
      <Arrow x1={2.7} y1={1.9} x2={4.3} y2={1.9} w={0.45} head={1} />
      <HeatCube x={4.8} y={0.9} s={2} />
    </Icon>
  ),
  dock: (
    <Icon>
      <Station x={4.6} y={2.2} w={5} />
      <path
        d="M0.2 0.5Q1.6 0.4 2.4 1"
        fill="none"
        stroke={RED}
        strokeWidth={0.4}
        strokeDasharray="0.5 0.3"
      />
      <Ship x={2.9} y={1.2} size={1.1} angle={25} fill={RED} />
    </Icon>
  ),
  missions: (
    <Icon>
      <Card x={0.4} y={0.2} w={2.5} h={3.4} />
      <Arrow x1={3.3} y1={1.9} x2={4.7} y2={1.9} w={0.45} head={1} />
      <Card x={5} y={0.2} w={2.1} h={3.4} points={N.secondary} />
    </Icon>
  ),
  stations: (
    <Icon>
      <Station x={1.9} y={1.9} w={3.4} />
      <Arrow x1={3.8} y1={1.9} x2={7} y2={1.9} w={0.45} head={1} />
    </Icon>
  ),
}

function Step({
  icon,
  n,
  title,
  red,
  children,
}: {
  icon: ReactNode
  n?: number
  title: string
  red?: boolean
  children: ReactNode
}) {
  return (
    <li className={red ? 'cs-red' : undefined}>
      {icon}
      <p>
        {n !== undefined && <i className="cs-n">{n}</i>}
        <span className="cs-t">{title}</span>
        {children}
      </p>
    </li>
  )
}

/** The goal: the points, and the two hands that make them. */
function Goal() {
  const y = 0.6
  const w = 3
  const h = 4.2
  return (
    <Pic w={FW} h={5}>
      <Cap x={0} y={4.3} size={9} color={RED} spacing={0.01}>
        {fill(F.goal, { points: N.points })}
      </Cap>
      <Card x={SPREAD + 38.4} y={y} w={w} h={h} points={N.primary} primary />
      <Cap x={SPREAD + 42.6} y={3.6} size={7} anchor="middle">
        +
      </Cap>
      <Card x={SPREAD + 43.8} y={y} w={w} h={h} points={N.secondary} />
      <Cap x={SPREAD + 50.2} y={3.5} size={5.6} anchor="middle">
        {F.or}
      </Cap>
      {[52.6, 56.3, 60]
        .map(x => SPREAD + x)
        .map(x => (
          <Card key={x} x={x} y={y} w={w} h={h} points={N.secondary} />
        ))}
    </Pic>
  )
}

/** Fire, scan and seize, struck out: what the first round, and a ship back from Home, do not do. */
function Quiet() {
  return (
    <Pic w={5} h={4}>
      <circle cx={2} cy={2} r={1.4} fill="none" stroke={INK} strokeWidth={0.4} />
      <path d="M2 0V1.2M2 2.8V4M0.1 2H1.2M2.8 2H3.9" stroke={INK} strokeWidth={0.4} />
      <path d="M0.3 3.7L3.9 0.3" stroke={RED} strokeWidth={0.6} />
    </Pic>
  )
}

export function CardFront() {
  const S = F.steps
  return (
    <Face side="front" face={F.face}>
      <Goal />
      <div className="cs-sec">{F.turn}</div>
      <ol className="cs-list">
        <Step icon={ICONS.destroyed} title={S.destroyed.title} red>
          {S.destroyed.text}
        </Step>
        <Step icon={ICONS.clear} n={1} title={S.clear.title}>
          {S.clear.text}
        </Step>
        <Step icon={ICONS.actions} n={2} title={S.actions.title}>
          {S.actions.text}
        </Step>
        <Step icon={ICONS.missiles} n={3} title={S.missiles.title}>
          {fill(S.missiles.text, { steps: N.missileSteps })}
        </Step>
        <Step icon={ICONS.heat} n={HEAT_STEP} title={S.heat.title}>
          {S.heat.text}
        </Step>
        <Step icon={ICONS.dock} n={5} title={S.dock.title}>
          {S.dock.text}
        </Step>
        <Step icon={ICONS.missions} n={6} title={S.missions.title}>
          {S.missions.text}
        </Step>
        <Step icon={ICONS.stations} title={S.roundEnd.title} red>
          {fill(S.roundEnd.text, { drift: N.stationDrift })}
        </Step>
      </ol>
      <Fan />
      <div className="cs-row">
        <Quiet />
        <p className="cs-quiet">{F.quiet}</p>
      </div>
    </Face>
  )
}

/** The fan: the hole's rings, cut by the frame, the four moves drawn on it. */
const FAN = { cx: 0.6, cy: 28, radii: [6, 10.7, 15.4, 20.1, 24.8] }
const FAN_H = 57
/** From the words' left edge to the frame, as drawn. */
const FRAME_GAP = PLAYER_PAD.x / CARD_SCALE

function Fan() {
  const clip = `fan${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const { cx, cy, radii } = FAN
  const ring = (n: number) => radii[n - 1]
  const at = (n: number, a: number, out = 0) => polar(cx, cy, ring(n) + out, a)
  /** A ship on a ring, nose prograde (clockwise on the page), or retrograde. */
  const shipAt = (
    n: number,
    a: number,
    props: { fill?: string; ghost?: boolean; retrograde?: boolean } = {}
  ) => {
    const [x, y] = at(n, a)
    const { retrograde, ...rest } = props
    return <Ship x={x} y={y} size={1.9} angle={a + (retrograde ? -90 : 90)} {...rest} />
  }

  // prograde: the way every ship orbits, outside the outer ring
  const proA = -86
  const proB = -68

  // coast: along the ring
  const coastA = -74

  // burn: along the ring, then out to the next ring (prograde) or in (retrograde)
  const burnA = -46
  const burnTo = -12
  const turn = burnA + 12

  // jump: the lane's departure arc on the hole's outer ring, the lane, the planet's arrival arc
  const laneA0 = 6
  const laneStep = 6.5
  const laneA1 = laneA0 + N.laneSectors * laneStep
  const planet = { x: 40, y: JUMP.y, r: 3 }
  const laneFrom = at(5, laneA0 + 2.5 * laneStep, 1.5)
  const laneVia: [number, number] = [laneFrom[0] + 1.2, planet.y]
  const laneTo: [number, number] = [planet.x - planet.r - 1.3, planet.y]

  // fold: a ghost where the ship was, a hop round the outside, the ship where it landed
  const foldA = 84
  const foldB = 54
  const hopFrom = at(5, foldA - 4, 0.9)
  const hopTo = at(5, foldB + 5, 1.8)
  const hopVia = at(5, (foldA + foldB) / 2, 5.8)
  const angleOf = (from: [number, number], to: [number, number]) =>
    (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI

  return (
    <Pic w={FW} h={FAN_H}>
      {/* The hole and its rings run on past the paper's edge and stop at the frame. */}
      <clipPath id={clip}>
        <rect x={-FRAME_GAP} y={-FAN_H} width={FW + FRAME_GAP} height={3 * FAN_H} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <circle cx={cx} cy={cy} r={3.6} fill={INK} />
        {radii.map(r => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={0.25} />
        ))}
      </g>
      {radii.map((r, i) => (
        <text
          key={r}
          x={cx + 0.7}
          y={cy - r + 2.2}
          fontFamily="var(--di-display)"
          fontWeight={600}
          fontSize={pt(5)}
          fill={INK}
        >
          {i + 1}
        </text>
      ))}

      {/* prograde */}
      <ArcArrow cx={cx} cy={cy} r={ring(5) + 1.4} a0={proA} a1={proB} w={0.5} head={1.2} />
      <Cap x={at(5, proB, 1.4)[0] + 1.4} y={at(5, proB, 1.4)[1] - 0.2} size={5.2} color={RED}>
        {F.moves.prograde}
      </Cap>

      {/* coast */}
      {shipAt(4, coastA)}
      <ArcArrow
        cx={cx}
        cy={cy}
        r={ring(4)}
        a0={coastA + 6}
        a1={coastA + 24}
        dash="1 0.5"
        w={0.6}
        head={1.3}
      />

      {/* burn: out facing prograde, in facing retrograde, each the orbit and then the change of ring */}
      {shipAt(3, burnA)}
      {(() => {
        /** The orbit along ring 3, then an easy spiral onto ring `n`, ending behind the ship there. */
        const path = (n: number) => {
          const end = burnTo - 4
          const pts: string[] = []
          for (let i = 0; i <= 40; i++) {
            const a = burnA + 5 + ((end - burnA - 5) * i) / 40
            const t = Math.min(1, Math.max(0, (a - turn) / (end - turn)))
            const ease = t * t * (3 - 2 * t)
            const [x, y] = polar(cx, cy, ring(3) + (ring(n) - ring(3)) * ease, a)
            pts.push(`${i ? 'L' : 'M'}${x.toFixed(3)} ${y.toFixed(3)}`)
          }
          return pts.join('')
        }
        const [ux, uy] = at(4, burnTo + 9, 0)
        const [nx, ny] = at(2, burnTo + 17, 0)
        return (
          <>
            <path
              d={path(2)}
              fill="none"
              stroke={INK}
              strokeWidth={0.4}
              strokeDasharray="0.6 0.4"
            />
            <path d={path(4)} fill="none" stroke={RED} strokeWidth={0.6} />
            <Cap x={ux + 0.4} y={uy + 0.6} size={4.8} color={RED}>
              {F.moves.out}
            </Cap>
            <Cap x={nx + 0.4} y={ny + 0.6} size={4.8}>
              {F.moves.in}
            </Cap>
          </>
        )
      })()}
      {shipAt(4, burnTo, { fill: RED })}
      {shipAt(2, burnTo, { ghost: true, retrograde: true })}

      {/* jump: the departure arc, a sector a tick, the lane and the planet's arrival arc */}
      <path
        d={arc(cx, cy, ring(5) + 1.3, laneA0, laneA1)}
        fill="none"
        stroke={INK}
        strokeWidth={0.5}
      />
      {Array.from({ length: N.laneSectors + 1 }, (_, i) => {
        const a = laneA0 + i * laneStep
        const [x0, y0] = at(5, a, -0.6)
        const [x1, y1] = at(5, a, 1.3)
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={INK} strokeWidth={0.3} />
      })}
      {shipAt(5, laneA0 + 0.5 * laneStep)}
      <path
        d={`M${laneFrom[0]} ${laneFrom[1]}Q${laneVia[0]} ${laneVia[1]} ${laneTo[0]} ${laneTo[1]}`}
        fill="none"
        stroke={RED}
        strokeWidth={0.6}
      />
      <Head x={laneTo[0]} y={laneTo[1]} angle={angleOf(laneVia, laneTo)} s={1.3} />
      <circle cx={planet.x} cy={planet.y} r={1.2} fill={INK} />
      <circle
        cx={planet.x}
        cy={planet.y}
        r={planet.r}
        fill="none"
        stroke={INK}
        strokeWidth={0.25}
      />
      <path
        d={arc(planet.x, planet.y, planet.r + 0.9, 145, 215)}
        fill="none"
        stroke={INK}
        strokeWidth={0.5}
      />

      {/* fold */}
      {shipAt(5, foldA, { ghost: true })}
      <path
        d={`M${hopFrom[0]} ${hopFrom[1]}Q${hopVia[0]} ${hopVia[1]} ${hopTo[0]} ${hopTo[1]}`}
        fill="none"
        stroke={RED}
        strokeWidth={0.5}
        strokeDasharray="0.9 0.5"
      />
      <Head x={hopTo[0]} y={hopTo[1]} angle={angleOf(hopVia, hopTo)} s={1.3} />
      {shipAt(5, foldB, { fill: RED })}

      {/* each move's name at the end of its path, a leader from the path to it */}
      <MoveLabel
        x={COAST.x}
        y={COAST.y}
        to={at(4, coastA + 24)}
        gap={1.4}
        title={F.moves.coast.title}
        line={F.moves.coast.line}
      >
        <Fuel x={0} y={0} value={0} />
        <Energy x={5} y={0} type="scoop" value={`+${N.scoop}`} />
        <Arrow x1={10.6} y1={-1} x2={12.6} y2={-1} color={INK} w={0.35} head={0.9} />
        <Fuel x={13.2} y={0} value={F.moves.speed} />
      </MoveLabel>
      <MoveLabel
        x={BURN.x}
        y={BURN.y}
        to={at(4, burnTo)}
        gap={1.8}
        title={F.moves.burn.title}
        line={F.moves.burn.line}
      >
        <Energy x={0} y={0} type="engines" value={N.burnEnergy} />
        <Fuel x={8} y={0} value={N.burnFuel} />
      </MoveLabel>
      <MoveLabel
        x={JUMP.x}
        y={JUMP.y}
        to={[planet.x + planet.r, planet.y]}
        gap={0.9}
        title={F.moves.jump.title}
      >
        <Energy x={0} y={0} type="engines" value={N.jumpEnergy} />
        <Fuel x={5.6} y={0} value={N.jumpFuel} />
        <Compressed x={0} y={4.6} />
      </MoveLabel>
      <MoveLabel
        x={FOLD.x}
        y={FOLD.y}
        to={at(5, foldB)}
        gap={1.8}
        title={F.moves.fold.title}
        line={F.moves.fold.line}
      >
        <Energy x={0} y={0} type="jump_drive" value={N.foldDrive} />
        <Fuel x={5.6} y={0} value={N.foldFuel - N.jumpFuel} />
        <Cap x={10.4} y={0} size={6}>
          +
        </Cap>
        <Energy x={12.4} y={0} type="engines" value={N.foldEngines} />
        <Fuel x={18} y={0} value={N.jumpFuel} />
        <Compressed x={12.4} y={4.2} />
      </MoveLabel>
    </Pic>
  )
}

/**
 * Where each move's name sits: its title's start and baseline, just past the
 * end of its path, the four spaced evenly down the fan.
 */
const MOVE_ROW = { first: 9.6, step: 12.4 }
const COAST = { x: 21, y: MOVE_ROW.first }
const BURN = { x: 28, y: MOVE_ROW.first + MOVE_ROW.step }
const JUMP = { x: 47.4, y: MOVE_ROW.first + 2 * MOVE_ROW.step }
const FOLD = { x: 19.6, y: MOVE_ROW.first + 3 * MOVE_ROW.step }

/** A compressor's saving, under a move's engines' fuel. */
function Compressed({ x, y }: { x: number; y: number }) {
  return <CompressedFuel x={x} y={y} from={N.jumpFuel} to={N.compressed} />
}

/**
 * A move's name, its costs drawn after it, and one sentence under; a leader
 * rule runs from the name towards the end of the move's path (`to`, in the
 * fan's millimetres) and stops `gap` short of it, so it covers nothing.
 */
function MoveLabel({
  x,
  y,
  to,
  gap,
  title,
  line,
  children,
}: {
  x: number
  y: number
  to: [number, number]
  gap: number
  title: string
  line?: string
  children: ReactNode
}) {
  const mid = y - pt(7.2) * 0.36
  const end: [number, number] = [x - 0.8, mid]
  const length = Math.hypot(end[0] - to[0], end[1] - to[1])
  const start = [0, 1].map(i => to[i] + ((end[i] - to[i]) * gap) / length)
  return (
    <g>
      <line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} stroke={INK} strokeWidth={0.3} />
      <g transform={`translate(${x} ${y})`}>
        <Cap x={0} y={0} size={7.2}>
          {title}
        </Cap>
        <g transform="translate(9.4 0)">{children}</g>
        {line && <Lines x={0} y={2.7} lines={[line]} size={5.4} />}
      </g>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Back: firing, and the heat check
// ---------------------------------------------------------------------------

export function CardBack() {
  return (
    <Face side="back" face={B.face} className="cs-roomy">
      <div className="cs-sec">{B.firing}</div>
      <Dice />
      <Shot />

      <div className="cs-sec">
        {B.heat.title} <em>{fill(B.heat.aside, { step: HEAT_STEP })}</em>
      </div>
      <HeatStrip />
      <p>{B.heat.note}</p>

      <div className="cs-sec">{B.sees.title}</div>
      <div className="cs-sees">
        <See text={B.sees.energy}>
          <Tile x={1.7} y={0.2} s={3.2} cubes={2} />
        </See>
        <See text={B.sees.faceUp}>
          <Tile x={1.7} y={1} s={3.2} type="railgun" />
        </See>
        <See text={B.sees.scan}>
          <g transform="translate(0.1 0.8)">
            <Eye x={1.5} y={1.8} />
            <Arrow x1={3.1} y1={1.8} x2={4.4} y2={1.8} color={INK} w={0.35} head={0.9} />
            <Tile x={4.6} y={0.2} s={1.8} />
          </g>
        </See>
        <See text={B.sees.docked}>
          <g transform="translate(0.1 0.6)">
            <Station x={3.2} y={2.4} w={6} />
            <Ship x={5.2} y={0.6} size={1.2} fill={RED} />
          </g>
        </See>
      </div>
    </Face>
  )
}

/** How much larger than drawn the table's pictograms print. */
const SEE = 1.45

/**
 * One thing the table sees: its pictogram centred in a cell of the grid's
 * icon column, every cell the same size, and its sentence beside it.
 */
function See({ text, children }: { text: string; children: ReactNode }) {
  return (
    <>
      <Pic w={6.6 * SEE} h={5.2 * SEE}>
        <g transform={`scale(${SEE})`}>{children}</g>
      </Pic>
      <p>{text}</p>
    </>
  )
}

/** An eye: what a scan is. */
function Eye({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path
        d={`M${x - 1.5} ${y}Q${x} ${y - 1.5} ${x + 1.5} ${y}Q${x} ${y + 1.5} ${x - 1.5} ${y}z`}
        fill={PAPER}
        stroke={INK}
        strokeWidth={0.35}
      />
      <circle cx={x} cy={y} r={0.5} fill={INK} />
    </g>
  )
}

/** Where each face of the dice strip sits: across the back, the 10 far enough in for the critical's title under it. */
const fx = (face: number) => 3.1 + ((face - 1) * (BW - 3.1 - 6.5)) / 9
/** The hit bracket's arrow comes down between two faces, and the hit's title and its drawing sit centred under it. */
const HIT_TITLE_X = (fx(N.hitFrom + 1) + fx(N.hitFrom + 2)) / 2
const HIT_X = HIT_TITLE_X - 15.6
/** The critical's column: its title under the 10, its words from the left of the column. */
const CRIT_TITLE_X = fx(N.top)
const CRIT_X = BW - 21
/** The dice strip's height: the faces, then the hit's and the critical's titles in one row under them. */
const DICE_H = 14.8

/** The d10's faces, what each does, the sensor that widens the critical, and the way to each title. */
function Dice() {
  const cy = 6.6
  const label = 9.7
  const title = DICE_H - 0.4
  const [sx] = [fx(N.sensorCrit) - 2.6]
  return (
    <Pic w={BW} h={DICE_H}>
      <Cap x={sx - 5.4} y={2.1} size={5.2} anchor="end" color={RED}>
        {B.with}
      </Cap>
      <Energy x={sx - 4.8} y={2.2} type="sensor_array" value={N.sensorEnergy} size={5.2} />
      <path
        d={`M${sx} 2.7V1.7H${fx(N.top) + 2.6}V2.7`}
        fill="none"
        stroke={RED}
        strokeWidth={0.45}
      />
      {N.d10.map(face => (
        <D10 key={face} cx={fx(face)} cy={cy} face={face} kind={faceKind(face)} />
      ))}
      <path
        d={`M${fx(N.hitFrom) - 2.4} ${label}V${label + 0.8}H${fx(N.hitTo) + 2.4}V${label}`}
        fill="none"
        stroke={INK}
        strokeWidth={0.35}
      />
      <Cap x={fx(1)} y={label + 2.9} size={5.8} anchor="middle">
        {B.miss}
      </Cap>
      <Arrow
        x1={HIT_TITLE_X}
        y1={label + 0.8}
        x2={HIT_TITLE_X}
        y2={title - 2.4}
        color={INK}
        w={0.5}
        head={1.1}
      />
      <Cap x={HIT_TITLE_X} y={title} size={6.2} anchor="middle">
        {B.hit.title}
      </Cap>
      <Arrow
        x1={CRIT_TITLE_X}
        y1={label}
        x2={CRIT_TITLE_X}
        y2={title - 2.4}
        color={RED}
        w={0.5}
        head={1.1}
      />
      <Cap x={CRIT_TITLE_X} y={title} size={6.2} anchor="middle" color={RED}>
        {B.critical.title}
      </Cap>
    </Pic>
  )
}

/**
 * The shot under its two titles. The hit, drawn as the worked railgun shot:
 * its points meet the shield, the shield's energy stops some and they go to
 * the heat track, the rest to the hull; a laser's points go straight
 * through. Each rule's words sit at the part of the drawing they explain.
 * The critical, beside it: a face-down slot named, turned up and broken, its
 * energy onto the heat track.
 */
function Shot() {
  const e = SHOT_EXAMPLE
  const text = { size: 6, lead: 1.15 }
  const y = 7
  const step = 1.3
  const dot = (x: number, yy: number) => <circle cx={x} cy={yy} r={0.55} fill={INK} />
  const shieldX = 4.8 + e.damage * step + 0.4
  const pass = shieldX + 3.4
  const hullX = pass + e.hull * step + 0.2
  const laserY = y + 12.8
  const c = { y: 0.6, x: CRIT_TITLE_X - 1.7 - 8.2 }
  return (
    <Pic w={BW} h={laserY + 2.2}>
      <g transform={`translate(${HIT_X} 0)`}>
        <Tile x={0} y={y - 1.7} s={3.4} type="railgun" />
        {Array.from({ length: e.damage }, (_, i) => (
          <g key={i}>{dot(4.8 + i * step, y)}</g>
        ))}
        {/* the shield, its energy over it and what it stops beside that */}
        <path
          d={`M${shieldX} ${y - 3.2}Q${shieldX + 2.4} ${y} ${shieldX} ${y + 3.2}`}
          fill="none"
          stroke={INK}
          strokeWidth={0.6}
        />
        <Energy x={shieldX + 1.4} y={y - 4.4} type="shields" value={e.cubes} />
        <Lines
          x={shieldX + 7.6}
          y={y - 5.4}
          {...text}
          lines={B.hit.shield.map(line =>
            fill(line, { points: N.shieldPoints, plasma: N.plasmaShieldPoints })
          )}
        />
        {Array.from({ length: e.hull }, (_, i) => (
          <g key={i}>{dot(pass + i * step, y)}</g>
        ))}
        <Arrow x1={hullX} y1={y} x2={hullX + 2.6} y2={y} color={INK} w={0.45} head={1} />
        <Hull x={hullX + 3.2} y={y + 1} size={6.4} value={fill(B.hit.hull, { hull: e.hull })} />
        <Lines x={hullX + 3.2} y={y + 4.6} {...text} lines={B.hit.wreck} />
        {/* what the shield stopped, onto the heat track */}
        <Arrow
          x1={shieldX + 1}
          y1={y + 3.4}
          x2={shieldX + 1}
          y2={y + 6.2}
          color={RED}
          w={0.45}
          head={1}
        />
        {Array.from({ length: e.stopped }, (_, i) => (
          <HeatCube key={i} x={shieldX - 0.9 + i * 2.1} y={y + 6.6} />
        ))}
        <Cap x={shieldX - 1.6} y={y + 8} size={6.4} color={RED} anchor="end">
          {fill(B.hit.heat, { heat: e.stopped })}
        </Cap>
        {/* a laser: straight through */}
        <Tile x={0} y={laserY - 1.7} s={3.4} type="laser" />
        <path
          d={`M${shieldX} ${laserY - 2.2}Q${shieldX + 1.6} ${laserY} ${shieldX} ${laserY + 2.2}`}
          fill="none"
          stroke={INK}
          strokeWidth={0.6}
          strokeDasharray="0.6 0.5"
        />
        <Arrow x1={4.4} y1={laserY} x2={pass + 1.4} y2={laserY} color={INK} w={0.45} head={1} />
        <Cap x={pass + 2} y={laserY + 0.9} size={5.2}>
          {B.hit.laser}
        </Cap>
      </g>

      <Tile x={c.x} y={c.y} s={3.4} cubes={CRIT_CUBES} />
      <Arrow
        x1={c.x + 4}
        y1={c.y + 1.7}
        x2={c.x + 7}
        y2={c.y + 1.7}
        color={RED}
        w={0.5}
        head={1.1}
      />
      <Tile x={c.x + 8.2} y={c.y} s={3.4} type="sensor_array" broken />
      <Arrow
        x1={CRIT_TITLE_X}
        y1={c.y + 4.4}
        x2={CRIT_TITLE_X}
        y2={c.y + 7}
        color={RED}
        w={0.45}
        head={1}
      />
      <HeatCube x={CRIT_TITLE_X - 1.85} y={c.y + 7.4} />
      <HeatCube x={CRIT_TITLE_X + 0.15} y={c.y + 7.4} />
      <Cap x={CRIT_TITLE_X - 2.6} y={c.y + 8.8} size={6.4} color={RED} anchor="end">
        {fill(B.critical.heat, { heat: CRIT_CUBES })}
      </Cap>
      <Lines x={CRIT_X} y={c.y + 12.6} {...text} lines={B.critical.text} />
    </Pic>
  )
}

/**
 * The heat check as one sum, worked from the example: the heat already on the
 * track and the loadout's energy cubes, the redline's hull, then dissipation.
 */
function HeatStrip() {
  const e = HEAT_EXAMPLE
  const size = 9.6
  const cube = size * 0.3528 * 1.5
  /** From a term's left to the arrow after it: the cube and its number. */
  const term = cube + (4.4 * size) / 8
  const y = 3
  const mid = y + cube / 2
  const base = mid + size * 0.3528 * 0.36
  const below = y + cube + 2.4
  const line2 = below + pt(5.8) * 1.15
  const Op = ({ x, c }: { x: number; c: string }) => (
    <Cap x={x} y={mid + pt(7) * 0.36} size={7} anchor="middle">
      {c}
    </Cap>
  )
  const Note = ({
    x,
    yy,
    color = INK,
    anchor = 'middle',
    children,
  }: {
    x: number
    yy: number
    color?: string
    anchor?: 'start' | 'middle' | 'end'
    children: ReactNode
  }) => (
    <Cap x={x} y={yy} size={5.8} color={color} anchor={anchor}>
      {children}
    </Cap>
  )
  /** Each term's x, laid out for `W` and spread across the back's width. */
  const k = BW / W
  const b = { track: 0, cubes: 12 * k, total: 19.6 * k, capped: 36.6 * k, left: 54.4 * k }
  const a1 = [b.total + term, b.capped - 0.6]
  const a2 = [b.capped + term, b.left - 0.6]
  const cell = cube / 3
  return (
    <Pic w={BW} h={line2 + 0.6}>
      <Heat x={b.track} y={base} value={e.carried} size={size} />
      <Note x={b.track} yy={below} anchor="start">
        {B.heat.track[0]}
      </Note>
      <Note x={b.track} yy={line2} anchor="start">
        {B.heat.track[1]}
      </Note>
      <Op x={(b.track + term + b.cubes) / 2} c="+" />
      {/* the loadout's energy cubes, three to a row, in a cube's square */}
      {Array.from({ length: e.cubes }, (_, i) => (
        <Cube
          key={i}
          x={b.cubes + (i % 3) * cell + 0.2}
          y={y + Math.floor(i / 3) * cell + 0.2}
          s={cell - 0.4}
        />
      ))}
      <Note x={b.cubes} yy={below} anchor="start">
        {B.heat.loadout[0]}
      </Note>
      <Note x={b.cubes} yy={line2} anchor="start">
        {B.heat.loadout[1]}
      </Note>
      <Op x={b.total - 1.8} c="=" />
      <Heat x={b.total} y={base} value={e.total} size={size} />
      <Arrow x1={a1[0]} y1={mid} x2={a1[1]} y2={mid} w={0.5} head={1.2} />
      <Note x={(a1[0] + a1[1]) / 2} yy={y - 0.9} color={RED}>
        {fill(B.heat.over, { maxHeat: N.maxHeat })}
      </Note>
      <Hull x={(a1[0] + a1[1]) / 2 - 3.6} y={below + 0.6} value={`−${e.damage}`} size={7} />
      <Heat x={b.capped} y={base} value={N.maxHeat} size={size} />
      <Arrow x1={a2[0]} y1={mid} x2={a2[1]} y2={mid} w={0.5} head={1.2} />
      <Note x={(a2[0] + a2[1]) / 2} yy={below}>
        {fill(B.heat.dissipate, { dissipation: N.dissipation, radiator: N.radiator })}
      </Note>
      <Heat x={b.left} y={base} value={e.carry} size={size} />
      <Note x={BW} yy={y - 0.9} anchor="end">
        {B.heat.carries}
      </Note>
    </Pic>
  )
}
