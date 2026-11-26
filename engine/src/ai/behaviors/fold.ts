/**
 * The jump drive (RULES §Movement, Fold): when to fold, and where to.
 *
 * A fold is the turn's whole move and puts the ship on a sector of its own
 * well or between the black hole and a planet, never a station's, for its
 * fuel and its energy as heat. The bot weighs it against the route it
 * already has: for the current goal it looks at sectors of the goal's well
 * (or, out of reach, the black hole's mouth of the lane to it), plans the
 * rest of the trip from each with the same forward search the goal's own
 * route used (the target moved on by the fold's turn), and folds when that
 * arrives at least {@link FOLD_MIN_SAVING} turns sooner. Running for repairs
 * is a dock goal like any other, so a ship low on hull folds to a station's
 * well this way.
 *
 * The drive is also the emergency button ({@link planEscape}): when where the
 * turn's move would end leaves the ship to fire that would gut it before its
 * next turn, it folds out, even with no turns to save, to a landing nothing
 * reaches, the one best for the goal among those. Every fold, for the goal or
 * out of danger, lands only where the table cannot cost it hull before its
 * next check (behaviors/exposure.ts).
 */
import type { Position } from '../../models/game.ts'
import type { SubsystemId } from '../../models/subsystems.ts'
import { SECTORS_PER_RING } from '../../models/rings.ts'
import { getSubsystemConfig } from '../../models/subsystems.ts'
import { samePosition, sectorDistance } from '../../game/geometry.ts'
import {
  foldEngines,
  foldFuel,
  foldReaches,
  isStationSector,
  jumpDriveOf,
} from '../../game/fold.ts'
import { heatDamage } from '../../game/heat.ts'
import {
  BLACK_HOLE_ID,
  GRAVITY_WELLS,
  getMaxRing,
  TRANSFER_LANES,
} from '../../models/gravityWells.ts'
import type { TacticalSituation } from '../types.ts'
import type { PlannerTarget } from '../movementPlanner/index.ts'
import { planShipToTarget } from '../movementPlanner/index.ts'
import { PLAN_TURNS, goalTarget } from './missions.ts'
import { cheapTurnEstimate } from './danger.ts'
import { exposureAt, isSafe } from './exposure.ts'

/**
 * Turns a fold must save on the goal's route to be worth the drive. A fold
 * costs most of a tank and its heat rides into the check, so a fold that
 * saves a turn or two is a poor trade.
 */
export const FOLD_MIN_SAVING = 3

/**
 * Landing sectors planned from, nearest the goal first. Enough to cover the
 * goal's ring and the rings either side of it around where the goal will be.
 */
const FOLD_CANDIDATES = 24

/**
 * Safe landings an escape plans the goal's route from, best first by the
 * cheap estimate: the rest are ranked by that estimate alone.
 */
const ESCAPE_PLANS = 6

/** Where to fold to, and what it buys. */
export type FoldPlan =
  | {
      kind: 'goal'
      driveId: SubsystemId
      to: Position
      /** Turns to the goal with the fold, the fold's own turn included. */
      turns: number
      /** Turns the fold saves on the goal's route. */
      saving: number
    }
  | {
      kind: 'escape'
      driveId: SubsystemId
      to: Position
      /** Hull the ship would lose by its next check without the fold. */
      stayLoss: number
      /** Hull it loses with the fold: the landing's exposure and the fold's own heat damage. */
      loss: number
    }

/** Heat a fold puts on the loadout: the drive's cubes and the engines'. */
export function foldHeat(): number {
  return getSubsystemConfig('jump_drive').minEnergy + foldEngines()
}

/** The drive, when a fold is on this turn: aboard, unbroken, unused, and the fuel in the tank. */
function readyDrive(situation: TacticalSituation) {
  const drive = jumpDriveOf(situation.ship)
  if (!drive || drive.isBroken || drive.usedThisTurn) return null
  return situation.status.reactionMass < foldFuel() ? null : drive
}

/** `target` as the search from the landing sees it: one turn later than from here. */
function afterFold(target: PlannerTarget): PlannerTarget {
  return {
    positionAt: turn => target.positionAt(turn + 1),
    isMatch: (pos, turn) =>
      target.isMatch
        ? target.isMatch(pos, turn + 1)
        : samePosition(pos, target.positionAt(turn + 1)),
    period: target.period,
  }
}

/**
 * The fold the bot makes this turn for its goal, or null. Only with a drive
 * aboard that is neither broken nor used, a goal with somewhere to be, the
 * fold's fuel in the tank and its heat inside the track (it costs no hull at
 * the check), onto a landing that is safe ({@link isSafe}): the soonest
 * arrival among the safe landings nearest the goal.
 */
export function planFold(situation: TacticalSituation): FoldPlan | null {
  const { me, ship, status, view, currentGoal } = situation
  const drive = readyDrive(situation)
  if (!drive || !currentGoal || foldHeat() > status.heatBudget) return null
  const fuel = foldFuel()
  const aim = goalTarget(currentGoal, me, view, situation.opponents, status)
  if (!aim) return null

  // A goal with no route inside the planning horizon is at least one turn past it.
  const normal = currentGoal.plan?.totalTurns ?? PLAN_TURNS + 1
  // The fold is this turn; the moves after it must arrive this much sooner.
  let horizon = normal - FOLD_MIN_SAVING - 1
  if (horizon < 1) return null

  // Where the goal is when the first move after the fold ends.
  const goal = aim.target.positionAt(2)
  const here = status.position
  // Out of a fold's reach, land at the black hole's mouth of the lane to the goal's planet.
  const lane = TRANSFER_LANES.find(l => l.planetId === goal.wellId && l.direction === 'outbound')
  const goalAt =
    foldReaches(here, goal) || !lane
      ? goal
      : {
          wellId: BLACK_HOLE_ID,
          ring: lane.blackHoleArc.ring,
          sector: lane.blackHoleArc.startSector,
        }
  const landings: Position[] = []
  for (let ring = 1; ring <= getMaxRing(goalAt.wellId); ring++) {
    for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
      const to = { wellId: goalAt.wellId, ring, sector }
      if (samePosition(to, here) || isStationSector(view.stations, to)) continue
      landings.push(to)
    }
  }
  const nearness = (p: Position) =>
    Math.abs(p.ring - goalAt.ring) + sectorDistance(p.sector, goalAt.sector) / 3
  landings.sort((a, b) => nearness(a) - nearness(b) || a.ring - b.ring || a.sector - b.sector)

  const target = afterFold(aim.target)
  let best: FoldPlan | null = null
  let tried = 0
  for (const to of landings) {
    if (tried >= FOLD_CANDIDATES) break
    if (!isSafe(exposureAt(situation, to, foldHeat()))) continue
    tried++
    const landed = { ...ship, ...to, reactionMass: ship.reactionMass - fuel }
    const plan = planShipToTarget(landed, target, horizon, aim.reserve)
    if (!plan) continue
    best = {
      kind: 'goal',
      driveId: drive.id,
      to,
      turns: 1 + plan.totalTurns,
      saving: normal - 1 - plan.totalTurns,
    }
    horizon = plan.totalTurns - 1
    if (horizon < 1) break
  }
  return best
}

/** Every sector a fold from `here` may land on: its own well, or across the black hole, never a station. */
function foldLandings(situation: TacticalSituation, here: Position): Position[] {
  const landings: Position[] = []
  for (const well of GRAVITY_WELLS) {
    if (!foldReaches(here, { wellId: well.id })) continue
    for (let ring = 1; ring <= getMaxRing(well.id); ring++) {
      for (let sector = 0; sector < SECTORS_PER_RING; sector++) {
        const to = { wellId: well.id, ring, sector }
        if (samePosition(to, here) || isStationSector(situation.view.stations, to)) continue
        landings.push(to)
      }
    }
  }
  return landings
}

/** Where the turn's move would end without a fold, and the heat it puts on the loadout. */
export interface Stay {
  at: Position
  heat: number
}

/**
 * The emergency fold, or null. The bot folds out when every move it would
 * make otherwise (`stays`: the goal's step and a coast) ends where the
 * table's fire leaves it at `hullFloor` hull or less by its next check
 * ({@link exposureAt}): a lethal volley, or one that sends it home for
 * repairs. No turns need to be saved.
 *
 * It lands where nothing costs it hull and no hunter reaches it, and among
 * those where the goal's route is soonest (the cheap estimate ranks them and
 * the forward search plans the best few). With no safe landing it takes the
 * least exposed one, if that is still better than staying. The fold's 6 heat
 * must not push its own check into hull damage, unless staying costs more:
 * then the fold's burn is counted against the landing.
 */
export function planEscape(
  situation: TacticalSituation,
  stays: readonly Stay[],
  hullFloor: number
): FoldPlan | null {
  const { me, ship, status, view, currentGoal } = situation
  const drive = readyDrive(situation)
  if (!drive || stays.length === 0) return null
  const stayLoss = Math.min(...stays.map(s => exposureAt(situation, s.at, s.heat).hullLoss))
  if (stayLoss === 0 || status.hull - stayLoss > hullFloor) return null
  const burn = heatDamage(status.heat + foldHeat())
  if (burn >= stayLoss || burn >= status.hull) return null

  const here = status.position
  const scored = foldLandings(situation, here).map(to => {
    const exposure = exposureAt(situation, to, foldHeat())
    return { to, exposure, loss: burn + exposure.hullLoss }
  })
  const safe = scored.filter(c => isSafe(c.exposure))
  const pool = safe.length > 0 ? safe : scored.filter(c => c.loss < stayLoss)
  if (pool.length === 0) return null
  const least = Math.min(...pool.map(c => c.loss))
  const candidates = pool.filter(c => c.loss === least)

  const aim = currentGoal ? goalTarget(currentGoal, me, view, situation.opponents, status) : null
  const goal = aim?.target.positionAt(2)
  const rank = (p: Position) => (goal ? cheapTurnEstimate(p, goal) : cheapTurnEstimate(here, p))
  candidates.sort(
    (a, b) =>
      rank(a.to) - rank(b.to) ||
      a.exposure.damage - b.exposure.damage ||
      a.to.ring - b.to.ring ||
      a.to.sector - b.to.sector
  )
  let pick = candidates[0]
  if (aim) {
    const target = afterFold(aim.target)
    let soonest = Infinity
    for (const c of candidates.slice(0, ESCAPE_PLANS)) {
      const landed = { ...ship, ...c.to, reactionMass: ship.reactionMass - foldFuel() }
      const turns = planShipToTarget(landed, target, PLAN_TURNS, aim.reserve)?.totalTurns
      if (turns !== undefined && turns < soonest) {
        soonest = turns
        pick = c
      }
    }
  }
  return { kind: 'escape', driveId: drive.id, to: pick.to, stayLoss, loss: pick.loss }
}
