import type { Player, GameState, Station, ShipState } from '../../models/game.ts'
import {
  isDestroyShipMission,
  isDeliverCargoMission,
  isInterceptTransmissionMission,
} from '../../models/missions.ts'
import type {
  Mission,
  DestroyShipMission,
  DeliverCargoMission,
  InterceptTransmissionMission,
} from '../../models/missions.ts'
import type { BotGoal } from '../types.ts'
import {
  estimateTurnsToTarget,
  planStationMeetUp,
} from '../movementPlanner/index.ts'
import { getStationForPlanet, STATION_CONSTANTS } from '../../game/stations.ts'

/**
 * Cheap, planner-free turn estimate for goal **ranking**. We can't afford
 * to run a full BFS for every mission every turn (it's the dominant CPU
 * cost), so this approximates "how far is X from where I am?" with simple
 * orbital-geometry arithmetic. The chosen goal then gets a real plan.
 *
 * Same-well: ring distance + min(forward, backward) sector distance, both
 * scaled by average ring velocity (~3 sectors/turn).
 *
 * Cross-well: a fixed transfer overhead (well-transfers cost a few turns
 * to set up plus the target-side approach).
 *
 * Conservative bias toward overestimating: false negatives (saying a
 * mission is harder than it is) just nudge selection toward simpler ones,
 * which is the right behaviour when the planner is the limiting resource.
 */
function cheapTurnEstimate(
  ship: ShipState,
  target: { wellId: string; ring: number; sector: number },
): number {
  const ringDiff = Math.abs(ship.ring - target.ring)
  if (ship.wellId === target.wellId) {
    const sectorsInRing = STATION_CONSTANTS.SECTORS_PER_RING
    const rawDelta = Math.abs(ship.sector - target.sector)
    const sectorDiff = Math.min(rawDelta, sectorsInRing - rawDelta)
    // Avg sector velocity ~3 (planets R1 vel 4, R2 vel 2; BH similar mix).
    return ringDiff + Math.ceil(sectorDiff / 3)
  }
  // Cross-well: well-transfer + transit on each side.
  return 8 + ringDiff
}

/**
 * Compute mission-derived goals for the bot.
 *
 * **Performance contract**: this builds *lightweight* goals using a cheap
 * geometry heuristic. Goals do NOT carry a `plan` here — running the BFS
 * planner for every mission every turn was the dominant cost in the sim
 * profile (76% of total CPU). Only the chosen goal gets a real plan, via
 * {@link attachPlanToGoal}. Callers using the legacy entry point (UI,
 * tests) can opt back into eager planning by calling that helper after
 * {@link selectCurrentGoal}.
 *
 * The geometry estimate doesn't need to be exactly right — it just needs
 * to rank goals consistently enough that the bot picks a sane mission.
 * The actual movement (which is what matters for reaching the target) is
 * always computed by the real planner once a goal is selected.
 */
export function computeMissionGoals(
  player: Player,
  gameState: GameState,
): BotGoal[] {
  const goals: BotGoal[] = []

  for (const mission of player.missions) {
    if (mission.isCompleted) continue

    if (isDestroyShipMission(mission)) {
      const targetPlayer = gameState.players.find(p => p.id === mission.targetPlayerId)
      if (!targetPlayer || targetPlayer.ship.hitPoints <= 0) continue

      const cheap = cheapTurnEstimate(player.ship, {
        wellId: targetPlayer.ship.wellId,
        ring: targetPlayer.ship.ring,
        sector: targetPlayer.ship.sector,
      })
      goals.push({
        type: 'destroy_target',
        missionId: mission.id,
        targetPlayerId: mission.targetPlayerId,
        estimatedTurns: cheap + 3, // combat resolution buffer
      })
    } else if (isDeliverCargoMission(mission)) {
      const cargo = player.cargo.find(c => c.missionId === mission.id)
      const isPickedUp = cargo?.isPickedUp ?? false
      const stationPlanetId = isPickedUp
        ? mission.deliveryPlanetId
        : mission.pickupPlanetId
      const station = getStationForPlanet(gameState.stations, stationPlanetId)
      if (!station) continue

      // Cost = leg to current target. For not-yet-picked-up missions we
      // also factor the future delivery leg so ranking sees the *full*
      // mission cost (otherwise pickup-only missions look artificially
      // cheaper than mid-flight ones).
      let cheap = cheapTurnEstimate(player.ship, {
        wellId: stationPlanetId,
        ring: station.ring,
        sector: station.sector,
      })
      if (!isPickedUp) {
        const deliveryStation = getStationForPlanet(
          gameState.stations,
          mission.deliveryPlanetId,
        )
        if (deliveryStation) {
          // Delivery leg estimated from pickup station — approximate, but
          // consistent across all candidate cargo missions.
          cheap += cheapTurnEstimate(
            {
              ...player.ship,
              wellId: mission.pickupPlanetId,
              ring: station.ring,
              sector: station.sector,
            },
            {
              wellId: mission.deliveryPlanetId,
              ring: deliveryStation.ring,
              sector: deliveryStation.sector,
            },
          )
        }
      }

      goals.push({
        type: isPickedUp ? 'deliver_cargo' : 'pickup_cargo',
        missionId: mission.id,
        targetWellId: stationPlanetId,
        targetRing: station.ring,
        targetSector: station.sector,
        estimatedTurns: cheap,
      })
    } else if (isInterceptTransmissionMission(mission)) {
      const targetPlayer = gameState.players.find(p => p.id === mission.targetPlayerId)
      if (!targetPlayer || targetPlayer.ship.hitPoints <= 0) continue

      if (!mission.scanAcquired) {
        const cheap = cheapTurnEstimate(player.ship, {
          wellId: targetPlayer.ship.wellId,
          ring: targetPlayer.ship.ring,
          sector: targetPlayer.ship.sector,
        })
        goals.push({
          type: 'shadow_target',
          missionId: mission.id,
          targetPlayerId: mission.targetPlayerId,
          targetWellId: targetPlayer.ship.wellId,
          targetRing: targetPlayer.ship.ring,
          targetSector: targetPlayer.ship.sector,
          estimatedTurns: cheap + 1, // +1 to power sensor + scan
        })
      } else {
        // Pick the cheapest station to deliver scan to (any station works).
        let bestStation: Station | undefined
        let bestCost = Infinity
        for (const station of gameState.stations) {
          const cost = cheapTurnEstimate(player.ship, {
            wellId: station.planetId,
            ring: station.ring,
            sector: station.sector,
          })
          if (cost < bestCost) {
            bestCost = cost
            bestStation = station
          }
        }
        if (bestStation) {
          goals.push({
            type: 'deliver_scan',
            missionId: mission.id,
            targetWellId: bestStation.planetId,
            targetRing: bestStation.ring,
            targetSector: bestStation.sector,
            estimatedTurns: bestCost,
          })
        }
      }
    }
  }

  goals.sort((a, b) => a.estimatedTurns - b.estimatedTurns)
  return goals
}

/**
 * Enrich a goal with a real movement plan from the BFS planner. Called
 * once per turn — only on the goal the bot has actually chosen to pursue
 * — so we pay the BFS cost for one mission rather than three.
 *
 * For station meet-ups (cargo, scan delivery), uses the dynamic-target
 * forward BFS via {@link planStationMeetUp}. For destroy/shadow goals,
 * the existing positioning logic uses `planFromShip` (reverse BFS) on
 * the goal's target sector — no plan attachment needed here, since those
 * targets are essentially static (predicted enemy position).
 *
 * Returns the goal with the plan attached when applicable, or the goal
 * unchanged when no plan is needed (or planning fails).
 */
export function attachPlanToGoal(
  goal: BotGoal,
  player: Player,
  gameState: GameState,
): BotGoal {
  if (goal.plan) return goal // already planned

  // Only station-meet goals benefit from the dynamic planner here.
  // Destroy/shadow goals navigate via positioning.ts using planFromShip.
  if (
    goal.type !== 'pickup_cargo' &&
    goal.type !== 'deliver_cargo' &&
    goal.type !== 'deliver_scan'
  ) {
    return goal
  }

  if (goal.targetWellId == null) return goal
  // For deliver_scan, find the actual station object (target sector matches
  // the chosen one's current sector, so a Station object is at hand).
  const station = gameState.stations.find(
    s =>
      s.planetId === goal.targetWellId &&
      s.ring === goal.targetRing &&
      s.sector === goal.targetSector,
  )
  if (!station) return goal

  const meet = planStationMeetUp(player.ship, station)
  if (!meet) return goal

  return {
    ...goal,
    targetRing: meet.meetPosition.ring,
    targetSector: meet.meetPosition.sector,
    estimatedTurns: meet.totalTurns,
    plan: meet.plan,
  }
}

/**
 * Select the current goal to pursue.
 * Strategy-based selection:
 * - 'combat': Prefer destroy missions
 * - 'cargo': Prefer cargo missions
 * - 'balanced'/'auto': Pick cheapest (lowest estimatedTurns)
 */
export function selectCurrentGoal(
  goals: BotGoal[],
  strategy: 'combat' | 'cargo' | 'balanced' | 'auto'
): BotGoal | null {
  if (goals.length === 0) return null

  // Commitment rule: a cargo mission with the cargo already on board takes
  // precedence regardless of strategy. The bot has invested ~25-30 turns
  // getting the pickup; bailing now to chase a destroy target that wanders
  // into range means starting over. Scan delivery is intentionally NOT
  // committed — any station works for delivery so the trip is fast and
  // letting the bot keep its options open empirically yields more wins.
  const cargoInHand = goals.find(g => g.type === 'deliver_cargo')
  if (cargoInHand) return cargoInHand

  switch (strategy) {
    case 'combat': {
      const combatGoal = goals.find(g => g.type === 'destroy_target')
      return combatGoal ?? goals[0]
    }
    case 'cargo': {
      const cargoGoal = goals.find(
        g => g.type === 'pickup_cargo' || g.type === 'deliver_cargo'
      )
      return cargoGoal ?? goals[0]
    }
    case 'balanced':
    case 'auto':
    default:
      return goals[0] // already sorted by estimatedTurns
  }
}

// ============================================================================
// Smart mission selection — choose 3 of 5 offered missions
// ============================================================================

/**
 * Bot ship archetypes. The bot picks an archetype based on the cheapest
 * achievable trio of missions and matches its loadout to it.
 *
 * - **destroyer**: kill missions, heavy weapons (railgun + lasers + missiles)
 * - **cargo_trucker**: pickup/deliver across wells, fuel-heavy + long legs
 *   (sensor_array + fuel_compressor + radiator + light weapons)
 * - **stealth_interceptor**: shadow + scan delivery, sensor + flexible
 *   (sensor_array + fuel_compressor + missiles + shields)
 *
 * The same loadout sometimes serves multiple archetypes (cargo_trucker and
 * stealth_interceptor both want sensor_array + fuel_compressor) — the
 * archetype picks WHICH missions to prefer, the loadout picks the matching
 * tools.
 */
export type BotArchetype = 'destroyer' | 'cargo_trucker' | 'stealth_interceptor'

/**
 * Score a single offered mission as cost (turns to complete). Lower is
 * better. Returns `Infinity` for missions the bot cannot complete (e.g. the
 * destroy target is dead, or the planner finds no path).
 *
 * Uses the dynamic-target planner under the hood, so cargo and intercept
 * missions are scored against actual orbital meet-ups — not a flat
 * "20 turns" heuristic.
 */
function scoreMissionCost(
  mission: Mission,
  ship: ShipState,
  allPlayers: Player[],
  stations: Station[],
): number {
  if (isDestroyShipMission(mission)) {
    const target = allPlayers.find(p => p.id === mission.targetPlayerId)
    if (!target || target.ship.hitPoints <= 0) return Infinity
    const turns = estimateTurnsToTarget(ship, {
      wellId: target.ship.wellId,
      ring: target.ship.ring,
      sector: target.ship.sector,
    })
    if (turns === Infinity) return Infinity
    // Combat buffer is large because: (1) the target moves and may flee,
    // (2) destroying 10 HP takes several firing turns, (3) the bot must
    // line up firing solutions which often costs an extra burn.
    // Empirically destroy missions complete much less often than cargo,
    // so we cost them higher to bias selection toward achievable trios.
    return turns + 15
  }

  if (isDeliverCargoMission(mission)) {
    const pickup = getStationForPlanet(stations, mission.pickupPlanetId)
    const delivery = getStationForPlanet(stations, mission.deliveryPlanetId)
    if (!pickup || !delivery) return Infinity

    const pickupMeet = planStationMeetUp(ship, pickup)
    if (!pickupMeet) return Infinity

    // After pickup, bot is at the meet position; estimate the delivery leg
    // by treating that position as a fresh origin. Conservative — doesn't
    // account for fuel spent reaching pickup, but the static-leg estimate
    // is good enough for relative ranking across offers.
    const postPickupShip: ShipState = {
      ...ship,
      wellId: pickupMeet.meetPosition.wellId,
      ring: pickupMeet.meetPosition.ring,
      sector: pickupMeet.meetPosition.sector,
      facing: 'prograde',
    }
    const deliveryMeet = planStationMeetUp(postPickupShip, delivery)
    if (!deliveryMeet) return Infinity

    return pickupMeet.totalTurns + deliveryMeet.totalTurns
  }

  if (isInterceptTransmissionMission(mission)) {
    const target = allPlayers.find(p => p.id === mission.targetPlayerId)
    if (!target || target.ship.hitPoints <= 0) return Infinity
    const shadowTurns = estimateTurnsToTarget(ship, {
      wellId: target.ship.wellId,
      ring: target.ship.ring,
      sector: target.ship.sector,
    })
    if (shadowTurns === Infinity) return Infinity
    // +1 turn to actually acquire the scan, then ~6 to deliver to nearest
    // station (cheap end-of-mission leg, varies by spawn).
    return shadowTurns + 7
  }

  return Infinity
}

/**
 * Score a 3-mission combo. Combines individual costs with synergy bonuses
 * that reward sets of missions a coherent ship can pursue together:
 *
 *   - **Same target across destroy + intercept**: ~2 missions for the price
 *     of one approach.
 *   - **Cargo legs sharing a planet**: a delivery whose destination is
 *     another mission's pickup means one trip serves two missions.
 *   - **Monotype combos**: 3 missions of the same kind let the loadout
 *     fully specialize (cargo trucker doesn't need weapons, destroyer
 *     doesn't need fuel scoop, etc.).
 *
 * Returns a *score* (higher is better), not a cost — synergy bonuses are
 * additive after we negate the summed cost so combos are ranked uniformly.
 */
function scoreMissionCombo(
  combo: Mission[],
  ship: ShipState,
  allPlayers: Player[],
  stations: Station[],
): number {
  let totalCost = 0
  for (const mission of combo) {
    const cost = scoreMissionCost(mission, ship, allPlayers, stations)
    if (cost === Infinity) return -Infinity // any infeasible mission kills the combo
    totalCost += cost
  }

  let synergy = 0

  // Destroy + intercept on same target: shared approach, big saving
  const destroys = combo.filter(isDestroyShipMission) as DestroyShipMission[]
  const intercepts = combo.filter(isInterceptTransmissionMission) as InterceptTransmissionMission[]
  const destroyIds = new Set(destroys.map(m => m.targetPlayerId))
  const overlap = intercepts.filter(m => destroyIds.has(m.targetPlayerId)).length
  synergy += overlap * 8

  // Cargo legs sharing a planet — one trip serves two missions
  const cargos = combo.filter(isDeliverCargoMission) as DeliverCargoMission[]
  if (cargos.length >= 2) {
    const planets = new Set<string>()
    for (const m of cargos) {
      planets.add(m.pickupPlanetId)
      planets.add(m.deliveryPlanetId)
    }
    const expected = cargos.length * 2
    synergy += (expected - planets.size) * 5
  }

  // Monotype bonus: same mission TYPE means the loadout can fully specialize
  const types = combo.map(m => m.type)
  const monoCount = Math.max(
    types.filter(t => t === 'destroy_ship').length,
    types.filter(t => t === 'deliver_cargo').length,
    types.filter(t => t === 'intercept_transmission').length,
  )
  if (monoCount === 3) synergy += 6
  else if (monoCount === 2) synergy += 2

  return -totalCost + synergy
}

/**
 * Pick the most promising 3 of 5 offered missions for a bot.
 *
 * Iterates all C(5, 3) = 10 combinations, scores each via
 * {@link scoreMissionCombo}, and returns the highest-scoring trio. Falls
 * back to the first 3 offers if every combo is judged infeasible (e.g.
 * targets dead in a degenerate game state) so we never crash the loadout
 * phase on a corner case.
 *
 * The `ship` argument is the bot's ship as it exists *before* loadout —
 * default mass + no extra subsystems. That's a conservative feasibility
 * test: missions reachable here will be at least as reachable once the
 * loadout is finalized.
 */
export function selectBotMissions(
  offers: Mission[],
  ship: ShipState,
  allPlayers: Player[],
  stations: Station[],
): Mission[] {
  if (offers.length <= 3) return offers

  let best: Mission[] = offers.slice(0, 3)
  let bestScore = -Infinity

  for (let i = 0; i < offers.length - 2; i++) {
    for (let j = i + 1; j < offers.length - 1; j++) {
      for (let k = j + 1; k < offers.length; k++) {
        const combo = [offers[i], offers[j], offers[k]]
        const score = scoreMissionCombo(combo, ship, allPlayers, stations)
        if (score > bestScore) {
          bestScore = score
          best = combo
        }
      }
    }
  }

  return best
}

/**
 * Identify the dominant archetype for a chosen mission set. Drives loadout
 * selection — the loadout differs noticeably between archetypes (combat
 * ships carry railgun + missiles, cargo trucks carry sensor_array +
 * fuel_compressor, etc.).
 *
 * The classification is intentionally conservative: tied counts fall back
 * to `stealth_interceptor`, which uses a flexible sensor + missile loadout
 * that performs adequately for any mix.
 */
export function classifyArchetype(missions: Mission[]): BotArchetype {
  const incomplete = missions.filter(m => !m.isCompleted)
  const destroy = incomplete.filter(isDestroyShipMission).length
  const cargo = incomplete.filter(isDeliverCargoMission).length
  const intercept = incomplete.filter(isInterceptTransmissionMission).length

  if (destroy >= 2 && destroy >= cargo && destroy >= intercept) return 'destroyer'
  if (cargo >= 2 && cargo >= destroy && cargo >= intercept) return 'cargo_trucker'
  if (intercept >= 2 && intercept >= destroy && intercept >= cargo) return 'stealth_interceptor'
  // Mixed or single-type: stealth_interceptor's sensor + missile loadout
  // generalises the best across mission flavours.
  return 'stealth_interceptor'
}
