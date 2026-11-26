/**
 * Exposure: what a ship standing at a position until its next turn would
 * lose to the table, read from the view alone. The fold (behaviors/fold.ts)
 * asks it of where the turn's move would end and of every landing.
 *
 * Between this turn and the next the ship does not move (a fold has no
 * drift, and a ship drifts only on its own coast), so what reaches it is
 * every rival's next turn and every missile already aimed at it:
 *
 * - **a rival's guns**, as the threat estimate reads them
 *   (`analyzer.rivalGun`: face-up and scanned weapons, and what a face-down
 *   slot's cubes suggest), from anywhere the rival may fire on its next
 *   turn: where it is, after a coast, after a burn of one to three rings
 *   phased as its tank allows, facing either way. A launcher counts when its launch flight lands
 *   (`landsOnLaunch`); its later flights come after the ship's own turn.
 * - **missiles in the air** at the ship whose next move ends on it
 *   (`planMissileMove`), less what the ship's racks would answer.
 *
 * The shields the ship can still power after the turn's heat take what they
 * stop, and every point they stop is heat at the next check, so the hull lost
 * is what gets through plus what that heat pushes over the track. A berth is
 * safe (RULES §Stations), and a rival just back from Home fires at nobody.
 */
import type { Facing, Position } from '../../models/game.ts'
import {
  INTERCEPT_HEAT,
  INTERCEPT_ROLL,
  getMissileStats,
  getSubsystemConfig,
  interceptsPerRack,
  SHIELD_POINTS_PER_ENERGY,
} from '../../models/subsystems.ts'
import type { Subsystem } from '../../models/subsystems.ts'
import { BURN_COSTS, getAdjustmentRange } from '../../models/rings.ts'
import { getMaxRing } from '../../models/gravityWells.ts'
import { oppositeFacing } from '../../models/game.ts'
import { driftPosition, ringVelocity, wrapSector } from '../../game/geometry.ts'
import { getStationInReach } from '../../game/stations.ts'
import { isInWeaponRange } from '../../game/targeting.ts'
import { landsOnLaunch, planMissileMove } from '../../game/missiles.ts'
import { heatAfterCheck, heatDamage } from '../../game/heat.ts'
import { rivalGun } from '../analyzer.ts'
import type { Opponent, TacticalSituation } from '../types.ts'
import { hullThrough, isDisruptor, shieldPerCubeOf } from './combat.ts'

export interface Exposure {
  /** Damage the shots and missiles that reach the position may do, before shields. */
  damage: number
  /**
   * Hull the ship would lose there by its next check: what gets through the
   * shields it can still power, and the heat their absorbed points push over
   * the top of the track.
   */
  hullLoss: number
  /**
   * A rival with missiles in the air at the ship reaches the position. That
   * is the one public sign of a ship hunting this one (Destroy cards are
   * secret), so the fold lands out of its reach whatever the shields hold.
   */
  hunted: boolean
}

const NONE: Exposure = { damage: 0, hullLoss: 0, hunted: false }

/** Chance a rack's roll destroys a missile: the d10 at {@link INTERCEPT_ROLL} or better. */
const INTERCEPT_CHANCE = (11 - INTERCEPT_ROLL) / 10

type Pose = Position & { facing: Facing }

/** Poses read once per rival and turn: the table is the same for every landing asked about. */
const POSES = new WeakMap<Opponent, Pose[]>()

/**
 * Where a rival may stand when it fires on its next turn, facing either way
 * (the thrusters turn it once): where it is, which a shot before its move
 * fires from; after a coast; after a burn of one to three rings, which
 * drifts first and lands on the drifted sector phased by what its public
 * tank pays for. A jump out of the well takes it out of reach.
 */
function rivalPoses(o: Opponent): Pose[] {
  const cached = POSES.get(o)
  if (cached) return cached
  const here = o.position
  const drifted = driftPosition(here)
  const max = getMaxRing(here.wellId)
  const fuel = o.player.ship?.fuel ?? 0
  const phasing = getAdjustmentRange(ringVelocity(here.wellId, here.ring))
  const spots = new Map<string, Position>()
  const add = (p: Position) => spots.set(`${p.ring}:${p.sector}`, p)
  add(here)
  add(drifted)
  for (const cost of Object.values(BURN_COSTS)) {
    for (const ring of [drifted.ring - cost.rings, drifted.ring + cost.rings]) {
      if (ring < 1 || ring > max) continue
      for (let shift = phasing.min; shift <= phasing.max; shift++) {
        if (cost.mass + Math.abs(shift) > fuel) continue
        add({ ...drifted, ring, sector: wrapSector(drifted.sector + shift) })
      }
    }
  }
  const poses = [...spots.values()].flatMap(p => [
    { ...p, facing: o.facing },
    { ...p, facing: oppositeFacing(o.facing) },
  ])
  POSES.set(o, poses)
  return poses
}

/** Whether `gun` fired from `pose` reaches `at` before the ship's next turn. */
function strikes(gun: Subsystem, pose: Pose, at: Position): boolean {
  if (!isInWeaponRange(gun, pose, at)) return false
  return gun.type !== 'missiles' || landsOnLaunch(pose, at)
}

/**
 * What the ship would lose standing at `at` until its next turn, having put
 * `turnHeat` on its loadout this turn (the move's and what the turn fires).
 */
export function exposureAt(situation: TacticalSituation, at: Position, turnHeat: number): Exposure {
  const { me, status, view } = situation
  if (getStationInReach(view.stations, at)) return NONE

  const shots: Array<{ damage: number; shieldPerCube: number | null }> = []
  const hunters = new Set(view.missiles.filter(m => m.targetId === me.id).map(m => m.ownerId))
  let hunted = false
  for (const o of situation.opponents) {
    if (o.recovering || o.position.wellId !== at.wellId) continue
    const poses = rivalPoses(o)
    let reaches = false
    for (const slot of o.player.slots) {
      const gun = rivalGun(slot)
      if (!gun || !poses.some(p => strikes(gun.weapon, p, at))) continue
      reaches = true
      // A disruptor breaks a slot and takes no hull.
      if (!isDisruptor(gun.weapon))
        shots.push({ damage: gun.damage, shieldPerCube: shieldPerCubeOf(gun.weapon) })
    }
    if (reaches && hunters.has(o.player.id)) hunted = true
  }

  // Heat the ship can still spend on its defences this turn, racks first.
  let room = Math.max(0, status.heatBudget - turnHeat)
  let defence = 0
  const incoming = view.missiles.filter(
    m =>
      m.targetId === me.id &&
      m.wellId === at.wellId &&
      m.movesMade < getMissileStats().maxMoves &&
      planMissileMove(m, at).hits
  ).length
  let answered = 0
  if (incoming > 0) {
    const rackCubes = getSubsystemConfig('ballistic_rack').minEnergy
    for (const rack of status.racks) {
      if (rack.isBroken || room < rackCubes || answered >= incoming) continue
      room -= rackCubes
      defence += rackCubes
      answered += interceptsPerRack()
    }
    answered = Math.min(answered, incoming)
    const missileDamage = getSubsystemConfig('missiles').weaponStats?.damage ?? 0
    shots.push({
      damage: (incoming - answered * INTERCEPT_CHANCE) * missileDamage,
      shieldPerCube: shieldPerCubeOf({ type: 'missiles' }),
    })
  }

  const damage = shots.reduce((sum, s) => sum + s.damage, 0)
  if (damage === 0) return { damage, hullLoss: 0, hunted }
  const shieldMax = getSubsystemConfig('shields').maxEnergy
  let cubes = 0
  for (const shield of status.shields) {
    if (shield.isBroken) continue
    const take = Math.min(shieldMax, room)
    cubes += take
    room -= take
  }
  defence += cubes
  const through = hullThrough(shots, cubes * SHIELD_POINTS_PER_ENERGY)
  const carried = heatAfterCheck(status.heat + turnHeat + defence, status.dissipation)
  const absorbed = damage - through
  const answerHeat = answered > 0 ? INTERCEPT_HEAT : 0
  return { damage, hullLoss: through + heatDamage(carried + absorbed + answerHeat), hunted }
}

/** A landing the fold may take: nothing there costs hull, and no hunter reaches it. */
export function isSafe(exposure: Exposure): boolean {
  return exposure.hullLoss === 0 && !exposure.hunted
}
