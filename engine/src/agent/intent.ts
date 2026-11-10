/**
 * From what an agent wants to do to the actions the engine accepts. Cubes for
 * a burn, a rotation or a shot are not the agent's business at all: the engine
 * powers a subsystem from the action that uses it. What the builder does carry is
 * `power`, the shields, racks and sensor the agent wants up until its next
 * turn, and the order a turn is played in. The loadout is cleared at the start
 * of every turn, so a subsystem not named in `power` (and not used) is off.
 */
import type {
  BurnIntensity,
  Facing,
  GravityWellId,
  Player,
  PlayerAction,
  Position,
  ShipState,
} from '../models/game.ts'
import type { SubsystemId } from '../models/subsystems.ts'
import { LOAD_CRATES, SELL_FUEL, SELL_NOTHING } from '../models/missions.ts'
import { getSubsystemConfig, isPowerableType } from '../models/subsystems.ts'
import type { GameView } from '../game/view.ts'
import { powerActions, type EnergyTargets } from '../game/power.ts'
import { isInWeaponRange } from '../game/targeting.ts'
import { inScanRange } from '../game/scan.ts'
import { projectPosition, type MovementPreview } from '../game/movement.ts'
import { positionOf, samePosition } from '../game/geometry.ts'
import { isMooredMidTurn } from '../game/stations.ts'
import { escortCandidates, unplacedEscorts } from '../game/escort.ts'
import { onSurveyRing } from '../game/survey.ts'
import { getJumpOptions, phasedJumpDestination } from '../models/gravityWells.ts'
import { walkTurn } from '../game/walk.ts'
import { refusalText } from '../game/refusals.ts'

export interface FireIntent {
  weapon: SubsystemId
  target: string
  /** Slot to break on a critical; defaults to the engines. */
  critical?: SubsystemId
  compensateRecoil?: boolean
  /**
   * Missiles only: how many rounds go up in this one launch. A salvo of any
   * size is one use of the subsystem: no extra cubes and no extra heat, so the
   * magazine is what limits it.
   */
  count?: number
  /**
   * Fire before or after the move. Default: a railgun after the move (its
   * recoil would derail a burn) unless only the start of the move reaches the
   * target, anything else before the move if the target is in range from
   * where the ship stands, otherwise after.
   */
  when?: 'before' | 'after'
}

export interface TurnIntent {
  /**
   * Subsystems to power this turn and the cubes to put on each: shields 1 or 2, a
   * ballistic rack 2, a sensor array 2. They work until your next turn, and
   * they run first, so a sensor widens every shot this turn. Ones not named
   * are off: the loadout is cleared at the start of the turn. Nothing else
   * takes cubes here: the engines, the thrusters, the scoop and every weapon
   * are powered by the action that uses them, and a rack that fires or a
   * sensor that scans is left up by it (a subsystem does one thing a turn, so do
   * not also power it).
   */
  power?: Partial<Record<SubsystemId, number>>
  /**
   * Turn the ship to the other facing (the thrusters, once a turn). `true`
   * turns it before a move that leaves the facing free (a coast, or a burn
   * that names no facing) and right after one that already has the facing it
   * needs (a burn naming the facing the ship has, or a jump while prograde),
   * so it can scan or fire along the ring it arrives on. "before" and "after"
   * place it explicitly. A move that needs the other facing always turns the
   * ship before it.
   */
  rotate?: boolean | 'before' | 'after'
  move?:
    | { kind: 'coast'; scoop?: boolean }
    | { kind: 'burn'; intensity: BurnIntensity; adjustment?: number; facing?: Facing }
    | { kind: 'jump'; destinationWellId: string; adjustment?: number }
  /**
   * Shots in the order given within each side of the move. Order matters: a
   * salvo that lands flies and attacks as it is launched, so list it before
   * a disruptor it should strip a wall for.
   */
  fire?: FireIntent[]
  scan?: { target: string; slot?: SubsystemId }
  /**
   * A broken subsystem to repair at the heat check. It only lands if the turn makes
   * no heat at all: no move but a coast without the scoop, no shot, no scan,
   * and no shields powered.
   */
  repair?: SubsystemId
  /**
   * What the station buys if this turn arrives at one: an item aboard by its
   * cargo id, "fuel" for a Tanker's pump, or "none" to sell nothing. A
   * station buys one item from you, once per game. Left out, or one the
   * visit cannot make, and the visit sells whatever completes the most
   * mission points (ties to crates, then data, then fuel).
   */
  sell?: string
  /**
   * Rivals to put an Escort marker on, one per marker in hand, each a
   * different ship. A "you may": nothing is placed unless named here. Each is
   * an action in the sequence: before the move when the rival can take it
   * where you start, otherwise right after the move, and either way ahead of
   * every shot and seizure on that side of the move. One that does not
   * qualify at that point (not on your ring, carrying nothing, already
   * marked, just back from Home, either of you moored) is refused.
   */
  escort?: string[]
  /**
   * Survey: take the data. An action in the sequence: before the move when
   * you start on Black Hole Ring 1, otherwise right after the move. One a
   * turn, for the first undone Survey with no data aboard. Refused if you are
   * not on the ring at that point.
   */
  survey?: boolean
  /**
   * Salvage: take this wreck's black box (its id, from `view.wrecks`). An
   * action in the sequence: before the move when the wreck is in your sector
   * where you start, otherwise right after the move. One wreck a turn, moored
   * or not. Refused if the wreck is not in your sector at that point.
   *
   * `true` names no wreck: the first one in your sector where the salvage
   * comes. Before the move with a wreck where you start, right after it with
   * one where the move ends, and otherwise last of all, after your shots, so
   * a ship they destroy in that sector leaves its wreck for it (a ship is
   * settled the moment it dies). Finding no wreck there, it is not taken.
   */
  salvage?: string | true
  /**
   * Items to seize, one per free Piracy card, each a different item. A "you
   * may": nothing is taken unless named here. Each is an action in the
   * sequence: before the move when the victim shares your sector where you
   * start, otherwise right after the move, and either way ahead of every shot
   * on that side of the move, so a shot that destroys the victim cannot take
   * the item down with it. An item that is not there to take at that point
   * is refused.
   */
  seize?: { victim: string; cargoId: string }[]
}

export interface BuiltTurn {
  actions: PlayerAction[]
  /**
   * What the builder filled in or changed, and anything in the turn as built
   * that the engine will refuse, for the agent's log.
   */
  notes: string[]
}

type Side = 'before' | 'after'
type Move = NonNullable<TurnIntent['move']>
/** Where the ship stands, and which way it faces there. */
type Stance = Position & { facing: Facing }
/** Hands out the sequence numbers, in the order the actions are placed. */
type Sequence = () => number

/** What the intent places on each side of the move, before it is numbered. */
interface TurnPlan {
  move: Move
  rotation: Side | null
  /** The facing a rotation turns the ship to. */
  turned: Facing
  marks: { carrierId: string; before: boolean }[]
  seizes: { victim: string; cargoId: string; before: boolean }[]
  survey: Side | null
  salvage: { place: Side | 'last'; wreckId?: string } | null
  scan: { target: string; slot: SubsystemId; before: boolean } | null
  shots: FireIntent[]
}

/** Turn an intent into the engine's actions for `view.me`. Pure; validate with a preview before submitting. */
export function buildTurn(view: GameView, intent: TurnIntent): BuiltTurn {
  const me = view.me
  if (!me) throw new Error('A spectator cannot act')
  const ship = me.ship
  const notes: string[] = []

  const targets = energyTargets(ship, intent, notes)
  const move = intent.move ?? { kind: 'coast' as const }
  const { rotation, turned } = planRotation(ship, move, intent.rotate, notes)
  /** Facing before and during the move, and after it. */
  const facing: Facing = rotation === 'before' ? turned : ship.facing
  const postFacing: Facing = rotation === null ? ship.facing : turned
  const { pre, post } = stances(view, ship, move, facing, postFacing)

  const plan: TurnPlan = {
    move,
    rotation,
    turned,
    shots: planShots(view, ship, intent.fire ?? [], pre, post, notes),
    scan: planScan(view, ship, intent.scan, pre, notes),
    seizes: planSeizures(view, me.id, intent.seize ?? [], pre, notes),
    marks: planEscorts(view, me, intent.escort, pre, notes),
    survey: intent.survey === true ? (onSurveyRing(pre) ? 'before' : 'after') : null,
    salvage: planSalvage(view, intent.salvage, pre, post, notes),
  }

  // Power first: a sensor widens only the shots after it.
  const actions: PlayerAction[] = powerActions(me as Player, targets)
  actions.push(...sequenceTurn(me.id, plan, actions.length))
  const repair = repairAction(me, intent.repair, notes)
  if (repair) actions.push(repair)
  const sale = saleAction(me, intent.sell, notes)
  if (sale) actions.push(sale)
  notes.push(...foreseenRefusals(view, actions))
  return { actions, notes }
}

/**
 * The cubes the intent asks for. Only what it asks for: the loadout starts
 * the turn clear, so nothing is up unless this turn powers it. A subsystem an
 * action powers is not named here and never needs to be.
 */
function energyTargets(ship: ShipState, intent: TurnIntent, notes: string[]): EnergyTargets {
  const targets: EnergyTargets = new Map()
  for (const [id, cubes] of Object.entries(intent.power ?? {}) as Array<[SubsystemId, number]>) {
    const sub = ship.subsystems.find(s => s.id === id)
    if (!sub) {
      notes.push(`no subsystem ${id} aboard; ignored`)
      continue
    }
    if (!isPowerableType(sub.type)) {
      notes.push(`${id} is powered by the action that uses it; it takes no cubes here`)
      continue
    }
    if (sub.isBroken) {
      notes.push(`${id} is broken and cannot be powered; ignored`)
      continue
    }
    const c = getSubsystemConfig(sub.type)
    const wanted = Math.max(0, Math.min(c.maxEnergy, Math.round(cubes)))
    if (wanted === 0) continue
    if (wanted < c.minEnergy) {
      notes.push(`${id} needs at least ${c.minEnergy} cubes to work; set to ${c.minEnergy}`)
      targets.set(id, c.minEnergy)
    } else targets.set(id, wanted)
  }
  // A subsystem does one thing a turn. The engine refuses the pair, and says so;
  // this note is only the reason, in advance.
  const used = new Set<SubsystemId>([
    ...(intent.fire ?? []).map(f => f.weapon),
    ...(intent.scan ? ship.subsystems.filter(s => s.type === 'sensor_array').map(s => s.id) : []),
  ])
  for (const id of targets.keys()) {
    if (used.has(id))
      notes.push(
        `${id} is powered and also used this turn; a subsystem does one thing a turn, and using it leaves it up anyway`
      )
  }
  return targets
}

/**
 * The thrusters turn the ship once a turn, before the move or right after
 * it. A move that needs a facing decides it: a burn's own facing when it
 * names one, prograde for a jump. Asked with `true`, the rotation goes
 * before a move that leaves the facing free (or names none) and right after
 * a move that already has the facing it needs, so a burn onto a ring can
 * turn the ship to scan or fire along it; "before" and "after" say which.
 */
function planRotation(
  ship: ShipState,
  move: Move,
  rotate: TurnIntent['rotate'],
  notes: string[]
): { rotation: Side | null; turned: Facing } {
  const moveFacing: Facing | undefined =
    move.kind === 'burn' ? move.facing : move.kind === 'jump' ? 'prograde' : undefined
  const asked = rotate === true ? 'auto' : rotate === 'before' || rotate === 'after' ? rotate : null
  if (rotate !== undefined && rotate !== false && asked === null)
    notes.push(`"rotate" is true, "before" or "after", not ${JSON.stringify(rotate)}; ignored`)
  let rotation: Side | null = null
  if (moveFacing !== undefined && moveFacing !== ship.facing) {
    rotation = 'before'
    if (asked === 'after')
      notes.push(
        `the ${move.kind} needs ${moveFacing} facing, so the rotation goes before it; the thrusters turn once a turn, so there is none after it`
      )
  } else if (asked === 'auto') rotation = moveFacing === undefined ? 'before' : 'after'
  else if (asked === 'after') rotation = 'after'
  else if (asked === 'before') {
    if (moveFacing !== undefined)
      notes.push(
        `the ${move.kind} needs ${moveFacing} facing, which the ship already has; a rotation before it is dropped ("rotate": "after" turns the ship after the move)`
      )
    else rotation = 'before'
  }
  const turned: Facing = ship.facing === 'prograde' ? 'retrograde' : 'prograde'
  return { rotation, turned }
}

/** Where the ship stands before and after the move, for choosing when a shot fires. */
function stances(
  view: GameView,
  ship: ShipState,
  move: Move,
  facing: Facing,
  postFacing: Facing
): { pre: Stance; post: Stance } {
  const pre = { wellId: ship.wellId, ring: ship.ring, sector: ship.sector, facing }
  const jumpOption =
    move.kind === 'jump'
      ? getJumpOptions(pre).find(o => o.destination.wellId === move.destinationWellId)
      : undefined
  const preview: MovementPreview =
    move.kind === 'coast'
      ? { kind: 'coast', moored: isMooredMidTurn(view.stations, ship, pre) }
      : move.kind === 'burn'
        ? { kind: 'burn', burnIntensity: move.intensity, sectorAdjustment: move.adjustment ?? 0 }
        : {
            kind: 'jump',
            jumpDestination: jumpOption
              ? phasedJumpDestination(jumpOption, move.adjustment ?? 0)
              : undefined,
          }
  const post = { ...projectPosition(ship, facing, preview), facing: postFacing }
  return { pre, post }
}

function shipPosition(view: GameView, id: string): Position | null {
  const s = view.players.find(p => p.id === id)?.ship
  return s ? positionOf(s) : null
}

/**
 * The shots aboard, each with its side of the move. Default: a railgun after
 * the move unless only the start has the shot, anything else before it
 * unless only the end has it.
 */
function planShots(
  view: GameView,
  ship: ShipState,
  fire: FireIntent[],
  pre: Stance,
  post: Stance,
  notes: string[]
): FireIntent[] {
  const find = (id: SubsystemId) => ship.subsystems.find(s => s.id === id)
  for (const f of fire) {
    if (!find(f.weapon)) notes.push(`no weapon ${f.weapon} aboard; shot dropped`)
  }
  const phaseOf = (f: FireIntent): Side => {
    if (f.when) return f.when
    const weapon = find(f.weapon)!
    const at = shipPosition(view, f.target)
    const before = !!at && isInWeaponRange(weapon, pre, at)
    const after = !!at && isInWeaponRange(weapon, post, at)
    // A railgun's recoil moves the ship a ring, so it waits for the move
    // unless only the start of the move has the shot.
    if (weapon.type === 'railgun') return before && !after ? 'before' : 'after'
    // Reaching from neither, it goes before the move and the walk says why.
    return before || !after ? 'before' : 'after'
  }
  return fire.filter(f => find(f.weapon)).map(f => ({ ...f, when: phaseOf(f) }))
}

/**
 * A scan widens the critical range of every shot after it, so it goes as
 * early as it reaches: before the move when the target is in scan range
 * from where the ship starts (facing as the rotation leaves it), otherwise
 * right after the move.
 */
function planScan(
  view: GameView,
  ship: ShipState,
  scan: TurnIntent['scan'],
  pre: Stance,
  notes: string[]
): TurnPlan['scan'] {
  const sensor = ship.subsystems.find(s => s.type === 'sensor_array')
  if (scan && !sensor) notes.push('no sensor array aboard; scan dropped')
  if (!scan || !sensor) return null
  const at = shipPosition(view, scan.target)
  return {
    target: scan.target,
    // The engine turns a peek at a slot the scanner already knows into a
    // peek at the first one it does not, so the bow is a safe default.
    slot: scan.slot ?? 'forward-0',
    before: !!at && inScanRange(pre, at),
  }
}

/**
 * Seizures: each named once, against a rival at the table. One the victim
 * shares the start's sector for goes before the move, the rest right after
 * it, and both ahead of the shots on their side of the move.
 */
function planSeizures(
  view: GameView,
  myId: string,
  seize: NonNullable<TurnIntent['seize']>,
  pre: Stance,
  notes: string[]
): TurnPlan['seizes'] {
  const seizes: TurnPlan['seizes'] = []
  for (const { victim, cargoId } of seize) {
    const at = shipPosition(view, victim)
    if (victim === myId) notes.push('a seizure is made from a rival, not you; dropped')
    else if (!view.players.some(p => p.id === victim))
      notes.push(`no player ${String(victim)} to seize from; dropped`)
    else if (seizes.some(x => x.victim === victim && x.cargoId === cargoId))
      notes.push(`${cargoId} named twice for a seizure; once kept`)
    else seizes.push({ victim, cargoId, before: !!at && samePosition(at, pre) })
  }
  return seizes
}

/**
 * Escort markers: each named once, against a rival at the table, one per
 * marker in hand. One the rival can take where the ship starts goes before
 * the move, the rest right after it, ahead of the seizures (a seizure could
 * empty the carrier) and the shots on their side of the move.
 */
function planEscorts(
  view: GameView,
  me: Player,
  escort: TurnIntent['escort'],
  pre: Stance,
  notes: string[]
): TurnPlan['marks'] {
  const marks: TurnPlan['marks'] = []
  if (escort === undefined) return marks
  const inHand = unplacedEscorts(me.missions).length
  const atStart = new Set(escortCandidates(view, me.id, pre, pre))
  for (const carrierId of escort) {
    if (carrierId === me.id) notes.push('an Escort marker goes on a rival, not you; dropped')
    else if (!view.players.some(p => p.id === carrierId))
      notes.push(`no player ${String(carrierId)} to escort; dropped`)
    else if (marks.some(m => m.carrierId === carrierId))
      notes.push(`${carrierId} named twice for Escort; once kept`)
    else if (marks.length >= inHand)
      notes.push(`only ${inHand} Escort marker(s) in hand; ${carrierId} dropped`)
    else marks.push({ carrierId, before: atStart.has(carrierId) })
  }
  return marks
}

/**
 * A named wreck goes where the ship meets it; `true` names none, and goes
 * where a wreck is (the start, then the move's end) or else after every
 * shot, for the wreck a kill leaves.
 */
function planSalvage(
  view: GameView,
  salvage: TurnIntent['salvage'],
  pre: Stance,
  post: Stance,
  notes: string[]
): TurnPlan['salvage'] {
  if (typeof salvage === 'string') {
    const named = view.wrecks.find(w => w.id === salvage)
    if (!named) {
      notes.push(`no wreck ${String(salvage)} on the board; salvage dropped`)
      return null
    }
    return { place: samePosition(named, pre) ? 'before' : 'after', wreckId: named.id }
  }
  if (salvage !== true) return null
  return {
    place: view.wrecks.some(w => samePosition(w, pre))
      ? 'before'
      : view.wrecks.some(w => samePosition(w, post))
        ? 'after'
        : 'last',
  }
}

/**
 * The plan in the order it is played, numbered from after the power actions:
 * on each side of the move a rotation, then the markers, the seizures, the
 * survey, the salvage, the scan and the shots; and last a salvage that waits
 * for a kill.
 */
function sequenceTurn(playerId: string, plan: TurnPlan, powered: number): PlayerAction[] {
  let sequence = powered
  const seq: Sequence = () => ++sequence
  const side = (s: Side): PlayerAction[] => [
    ...(plan.rotation === s
      ? [
          {
            type: 'rotate',
            playerId,
            sequence: seq(),
            data: { targetFacing: plan.turned },
          } as const,
        ]
      : []),
    ...plan.marks
      .filter(m => m.before === (s === 'before'))
      .map(
        m =>
          ({
            type: 'escort_mark',
            playerId,
            sequence: seq(),
            data: { carrierId: m.carrierId },
          }) as const
      ),
    ...plan.seizes
      .filter(x => x.before === (s === 'before'))
      .map(
        x =>
          ({
            type: 'seize',
            playerId,
            sequence: seq(),
            data: { victimId: x.victim, cargoId: x.cargoId },
          }) as const
      ),
    ...(plan.survey === s
      ? [{ type: 'survey', playerId, sequence: seq(), data: {} } as const]
      : []),
    ...salvageAction(playerId, plan, s, seq),
    ...(plan.scan && plan.scan.before === (s === 'before')
      ? [
          {
            type: 'scan',
            playerId,
            sequence: seq(),
            data: { targetPlayerId: plan.scan.target, peekSlot: plan.scan.slot },
          } as const,
        ]
      : []),
    ...plan.shots
      .filter(f => (f.when === 'before') === (s === 'before'))
      .map(f => fireAction(playerId, f, seq)),
  ]
  return [
    ...side('before'),
    moveAction(playerId, plan.move, seq),
    ...side('after'),
    ...salvageAction(playerId, plan, 'last', seq),
  ]
}

function salvageAction(
  playerId: string,
  plan: TurnPlan,
  place: Side | 'last',
  seq: Sequence
): PlayerAction[] {
  if (plan.salvage?.place !== place) return []
  const wreckId = plan.salvage.wreckId
  return [{ type: 'salvage', playerId, sequence: seq(), data: wreckId ? { wreckId } : {} }]
}

function fireAction(playerId: string, f: FireIntent, seq: Sequence): PlayerAction {
  return {
    type: 'fire_weapon',
    playerId,
    sequence: seq(),
    data: {
      subsystemId: f.weapon,
      targetPlayerId: f.target,
      criticalTarget: f.critical ?? 'engines',
      ...(f.compensateRecoil ? { compensateRecoil: true } : {}),
      ...(f.count !== undefined ? { count: f.count } : {}),
    },
  }
}

function moveAction(playerId: string, move: Move, seq: Sequence): PlayerAction {
  if (move.kind === 'coast')
    return {
      type: 'coast',
      playerId,
      sequence: seq(),
      data: { activateScoop: move.scoop === true },
    }
  if (move.kind === 'burn')
    return {
      type: 'burn',
      playerId,
      sequence: seq(),
      data: { burnIntensity: move.intensity, sectorAdjustment: move.adjustment ?? 0 },
    }
  return {
    type: 'well_transfer',
    playerId,
    sequence: seq(),
    data: {
      destinationWellId: move.destinationWellId as GravityWellId,
      sectorAdjustment: move.adjustment ?? 0,
    },
  }
}

function repairAction(
  me: Player,
  repair: SubsystemId | undefined,
  notes: string[]
): PlayerAction | null {
  if (repair === undefined) return null
  const sub = me.ship.subsystems.find(s => s.id === repair)
  if (!sub) notes.push(`no subsystem ${repair}; repair dropped`)
  else if (!sub.isBroken) notes.push(`${repair} is not broken; repair dropped`)
  else return { type: 'repair', playerId: me.id, data: { subsystemId: repair } }
  return null
}

function saleAction(me: Player, sale: string | undefined, notes: string[]): PlayerAction | null {
  if (sale === undefined) return null
  const known =
    sale === SELL_FUEL ||
    sale === SELL_NOTHING ||
    sale === LOAD_CRATES ||
    me.cargo.some(c => c.id === sale)
  if (known) return { type: 'dock_sale', playerId: me.id, data: { sale } }
  notes.push(
    `${String(sale)} is not an item in your hold, "${SELL_FUEL}", "${LOAD_CRATES}" or "${SELL_NOTHING}"; sale dropped`
  )
  return null
}

/**
 * What the engine will refuse in the turn as built, and what it takes but
 * may come to nothing, from the engine's own walk of it (`walkTurn`): a
 * rotation turns the ship for everything after it, a shot or a scan is taken
 * from where the ship is when it comes up, an uncompensated railgun moves the
 * ship a ring on the spot, and the engines go once. The builder places the
 * actions but does not change what was asked (no autopilot): this is the
 * reason, in advance, for a refusal the agent would otherwise only meet in
 * the preview. Three notes are not refusals: a seizure or an Escort marker
 * after a shot at the same ship, which finds nothing if the shot kills, and
 * a salvage naming no wreck, which finds one only if a shot before it
 * destroys a ship in its sector.
 */
function foreseenRefusals(view: GameView, actions: PlayerAction[]): string[] {
  const walk = walkTurn(view, actions)
  return [...walk.refusals, ...walk.warnings].map(r => {
    const action = r.step === null ? null : actions[r.step]
    const where = action?.sequence !== undefined ? `step ${action.sequence} (${action.type}): ` : ''
    return `${where}${refusalText(r)}`
  })
}
