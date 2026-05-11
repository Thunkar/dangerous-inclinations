import type { FireWeaponAction, ShipState } from '../../models/game.ts'
import type { TacticalSituation, Target, BotParameters, SubsystemStatus } from '../types.ts'
import { SUBSYSTEM_CONFIGS, getMissileStats } from '../../models/subsystems.ts'
import { BURN_COSTS, SECTORS_PER_RING } from '../../models/rings.ts'
import { getGravityWell } from '../../models/gravityWells.ts'

function ringVelocity(wellId: string, ring: number): number {
  const well = getGravityWell(wellId)
  return well?.rings.find(r => r.ring === ring)?.velocity ?? 1
}

/**
 * Best-case simulation of a missile's flight against a target the engine
 * considers "in range" by static ring-and-sector geometry. Returns `true`
 * if a missile fired *now* can land on the target before expiring, given:
 *
 *   - `maxTurnsAlive` turns of life, `fuelPerTurn` fuel each — both
 *     pulled from {@link getMissileStats} so this code stays in sync if
 *     missile balance changes in the engine.
 *   - Orbital advance every turn (skipped on the first turn since the
 *     bot fires after movement — see actionProcessors.ts:225).
 *   - Fuel spent on ring change first, then sector approach (mirroring
 *     {@link ../../game/missiles.ts:calculateMissileMovement}).
 *   - Target moves only via its own ring's orbital velocity (best-case
 *     for the missile — assumes target doesn't burn away).
 *
 * Why this matters: the engine's static "in range" check is a per-turn
 * snapshot, but missile flight takes multiple turns and orbital mechanics
 * shift the target during that time. The fuel budget is **per turn** —
 * 3 units of (ring + sector) movement each turn — so a 6-unit gap over
 * 1 turn is unreachable even if the *total* lifetime budget would suffice.
 * Trailing targets at faster rings are the classic offender: the missile
 * inherits our slow orbit while the target's sector accelerates away
 * each round.
 *
 * We deliberately do NOT model the sector-remap on ring change (the
 * engine has it, but our wells use a uniform 24 sectors so it's a no-op).
 */
function missileCanHit(botShip: ShipState, targetShip: ShipState): boolean {
  if (botShip.wellId !== targetShip.wellId) return false

  const stats = getMissileStats()
  let mRing = botShip.ring
  let mSector = botShip.sector
  let tRing = targetShip.ring
  let tSector = targetShip.sector

  for (let turn = 0; turn < stats.maxTurnsAlive; turn++) {
    // Step 1: missile orbital (skipped on first turn — fired post-move).
    if (turn > 0) {
      mSector = (mSector + ringVelocity(botShip.wellId, mRing)) % SECTORS_PER_RING
    }

    // Step 2: spend this turn's fuel toward target. Ring change has
    // priority over sector adjustment (engine rule). The fuel budget is
    // PER TURN, not over the whole flight — leftover fuel does not roll
    // over.
    let fuel = stats.fuelPerTurn
    const ringDiff = tRing - mRing
    if (ringDiff !== 0 && fuel > 0) {
      const ringSteps = Math.min(Math.abs(ringDiff), fuel)
      mRing += Math.sign(ringDiff) * ringSteps
      fuel -= ringSteps
    }
    if (fuel > 0) {
      const raw = (tSector - mSector + SECTORS_PER_RING) % SECTORS_PER_RING
      const signed = raw > SECTORS_PER_RING / 2 ? raw - SECTORS_PER_RING : raw
      const sectorSteps = Math.min(Math.abs(signed), fuel)
      mSector =
        ((mSector + Math.sign(signed) * sectorSteps) % SECTORS_PER_RING +
          SECTORS_PER_RING) %
        SECTORS_PER_RING
    }

    if (mRing === tRing && mSector === tSector) return true

    // Step 3: target orbital advances at its own ring's velocity (we're
    // optimistic and assume the target doesn't burn this turn).
    tSector = (tSector + ringVelocity(targetShip.wellId, tRing)) % SECTORS_PER_RING
  }

  return false
}

/**
 * Select best target based on parameters
 */
export function selectTarget(
  situation: TacticalSituation,
  parameters: BotParameters
): Target | null {
  const { targets } = situation

  if (targets.length === 0) {
    return null
  }

  switch (parameters.targetPreference) {
    case 'closest':
      return targets.reduce(
        (closest, t) => (t.distance < closest.distance ? t : closest),
        targets[0]
      )

    case 'weakest':
      return targets.reduce(
        (weakest, t) => (t.priority > weakest.priority ? t : weakest),
        targets[0]
      )

    case 'threatening': {
      const threat = situation.primaryThreat
      if (threat) {
        return targets.find(t => t.player.id === threat.player.id) || targets[0]
      }
      return targets[0]
    }

    case 'mission': {
      // Prioritize destroy mission target
      const goal = situation.currentGoal
      if (goal && goal.type === 'destroy_target' && goal.targetPlayerId) {
        const missionTarget = targets.find(t => t.player.id === goal.targetPlayerId)
        if (missionTarget) return missionTarget
      }
      // Fall back to closest
      return targets.reduce(
        (closest, t) => (t.distance < closest.distance ? t : closest),
        targets[0]
      )
    }

    default:
      return targets[0]
  }
}

/**
 * Weapon priority for firing order.
 * Lower number = fires first.
 */
function getWeaponPriority(type: string): number {
  switch (type) {
    case 'railgun': return 0 // Highest damage, fires first
    case 'laser': return 1
    case 'ballistic_rack': return 2
    case 'missiles': return 3 // Lowest priority (conserve ammo)
    default: return 4
  }
}

/**
 * Generate weapon firing actions for the selected target.
 * Iterates ALL weapon subsystems dynamically.
 * Includes missile conservation logic.
 *
 * @param projectedEnergy - Map of subsystem index → projected energy after allocations
 */
export function generateWeaponActions(
  situation: TacticalSituation,
  target: Target | null,
  startSequence: number,
  parameters: BotParameters,
  projectedEnergy?: Map<number, number>,
  /**
   * Reaction mass projected to be available AFTER the planned movement
   * action has consumed fuel. Used by railgun recoil-compensation logic
   * which itself burns 1 reaction mass — without this, the bot can decide
   * to compensate on a turn where the burn has already drained its tank.
   * Falls back to current mass if not provided.
   */
  projectedReactionMass?: number,
  /**
   * Whether the planned movement (burn or well_transfer) will mark engines
   * as `usedThisTurn` before weapons fire. Recoil compensation also uses
   * engines, so when engines are already used this turn we can't
   * compensate — the validator rejects it.
   */
  enginesWillBeUsedByMovement?: boolean,
  /**
   * Ring/facing the ship will occupy when weapons fire — i.e. AFTER the
   * planned rotation and movement. Recoil safety depends on the post-move
   * ring (a burn from R5 → R3 makes recoil safe even if R5 wasn't).
   * Falls back to the current ship's position.
   */
  postMovementShip?: { ring: number; facing: 'prograde' | 'retrograde' }
): FireWeaponAction[] {
  if (!target) {
    return []
  }

  const actions: FireWeaponAction[] = []
  const { botPlayer, status } = situation
  const { firingSolutions } = target

  // Collect all eligible weapons with their priority
  const eligibleWeapons: Array<{
    sub: SubsystemStatus
    priority: number
  }> = []

  // Track whether we have any direct (non-missile) weapon in range
  let hasDirectWeaponInRange = false

  for (const sub of status.weapons) {
    if (sub.used || sub.broken) continue

    const config = SUBSYSTEM_CONFIGS[sub.type]
    if (!config.weaponStats) continue

    // Check if weapon has enough energy (projected or current)
    const energy = projectedEnergy?.get(sub.index) ?? sub.energy
    if (energy < config.minEnergy) continue

    // Check firing solution for this specific subsystem
    const solution = firingSolutions.get(sub.index)

    // For missiles, we check ammo not range (they're self-propelled)
    if (sub.type === 'missiles') {
      if (sub.ammo !== undefined && sub.ammo <= 0) continue
      // Missile eligible - range check handled by conservation logic below
    } else {
      // Direct weapons need to be in range
      if (!solution || !solution.inRange) continue
      hasDirectWeaponInRange = true
    }

    eligibleWeapons.push({
      sub,
      priority: getWeaponPriority(sub.type),
    })
  }

  // Sort by priority
  eligibleWeapons.sort((a, b) => a.priority - b.priority)

  // Engine limitation: `allocate_energy` targets subsystems by TYPE, not
  // by index — only the first matching subsystem of a given type can be
  // powered (see actionProcessors.ts:processAllocateEnergy). That makes
  // the second laser in the `combat` loadout effectively dead weight: we
  // can't power it, so we shouldn't try to fire it. Track which weapon
  // types we've already queued and skip duplicates.
  const firedTypes = new Set<string>()

  // Generate fire actions
  for (const { sub } of eligibleWeapons) {
    if (firedTypes.has(sub.type)) continue
    // Missile conservation logic
    if (sub.type === 'missiles') {
      const solution = firingSolutions.get(sub.index)
      const missileInRange = solution?.inRange ?? false

      // Check if this is a mission target
      const isMissionTarget = situation.currentGoal?.type === 'destroy_target' &&
        situation.currentGoal.targetPlayerId === target.player.id

      if (parameters.conserveAmmo) {
        // Only fire if: no direct weapon in range, OR it's a mission target with ammo >= 2
        if (hasDirectWeaponInRange) continue
        if (isMissionTarget && (sub.ammo ?? 0) < 2) continue
      } else {
        // Even without conserveAmmo, don't fire missiles if we have direct weapons
        // unless the missile is actually in range or it's a mission target
        if (hasDirectWeaponInRange && !missileInRange && !isMissionTarget) continue
      }

      // Feasibility gate: the engine's "in range" check for turrets is a
      // static per-turn snapshot, but missile flight takes multiple turns
      // and the per-turn fuel budget (3 units of ring+sector movement) is
      // tight. Simulate the flight optimistically (target only orbits,
      // doesn't burn) and refuse to fire when even the rosy sim says we
      // miss — trailing targets at faster rings are the classic case
      // where the missile can't outpace the target's per-turn drift.
      if (!missileCanHit(botPlayer.ship, target.player.ship)) continue
    }

    // Railgun recoil check: skip if recoil would be invalid and can't compensate.
    // Decisions use post-movement state — by the time the railgun fires,
    // the planned burn/transfer has already moved the ship and engines may
    // have been used. The energy budget may also have deallocated engines.
    let compensateRecoil: boolean | undefined
    if (sub.type === 'railgun') {
      const ship = botPlayer.ship
      const firingRing = postMovementShip?.ring ?? ship.ring
      const firingFacing = postMovementShip?.facing ?? ship.facing
      const recoilDir = firingFacing === 'prograde' ? 1 : -1
      const recoilRing = firingRing + recoilDir
      const maxRing = getGravityWell(ship.wellId)?.rings.length ?? 5
      const wouldBeInvalid = recoilRing < 1 || recoilRing > maxRing

      const engines = status.engines
      const projectedEngineEnergy = projectedEnergy?.get(engines.index) ?? engines.energy
      const massForRecoil = projectedReactionMass ?? ship.reactionMass
      const enginesUsed = engines.used || (enginesWillBeUsedByMovement ?? false)
      const canCompensate = !enginesUsed &&
        projectedEngineEnergy >= BURN_COSTS.soft.energy &&
        massForRecoil >= BURN_COSTS.soft.mass

      if (wouldBeInvalid && !canCompensate) continue // Can't fire safely
      compensateRecoil = wouldBeInvalid || canCompensate // Compensate if we can or must
    }

    actions.push({
      type: 'fire_weapon',
      playerId: botPlayer.id,
      sequence: startSequence + actions.length,
      data: {
        weaponType: sub.type as 'laser' | 'railgun' | 'missiles' | 'ballistic_rack',
        targetPlayerIds: [target.player.id],
        criticalTarget: 'shields',
        subsystemIndex: sub.index,
        ...(compensateRecoil !== undefined ? { compensateRecoil } : {}),
      },
    })
    firedTypes.add(sub.type)
  }

  return actions
}

/**
 * Determine if bot should face toward or away from target.
 * Considers mission target and railgun (spinal weapon needs correct facing).
 */
export function shouldFaceTarget(
  situation: TacticalSituation,
  target: Target | null,
  plannedMovementFacing?: 'prograde' | 'retrograde'
): 'prograde' | 'retrograde' | null {
  if (!target) {
    return plannedMovementFacing ?? null
  }

  const { status } = situation

  // Check if we have a railgun (spinal weapon) that could fire
  const hasRailgun = status.weapons.some(w =>
    w.type === 'railgun' && !w.used && !w.broken
  )

  if (hasRailgun) {
    // Railgun is spinal - needs facing direction. Check firing solution.
    for (const sub of status.weapons) {
      if (sub.type !== 'railgun') continue
      const solution = target.firingSolutions.get(sub.index)
      if (solution?.wrongFacing) {
        // Need to flip facing for railgun
        return status.facing === 'prograde' ? 'retrograde' : 'prograde'
      }
      if (solution?.inRange) {
        // Railgun is in range with current facing - keep it
        return status.facing
      }
    }
  }

  // If movement planner suggests a facing, use it
  if (plannedMovementFacing && plannedMovementFacing !== status.facing) {
    return plannedMovementFacing
  }

  // Default: keep current facing
  return null
}
