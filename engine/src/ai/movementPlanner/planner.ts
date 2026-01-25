import type { Facing } from '../../models/game'
import { BURN_COSTS, SECTORS_PER_RING, getAdjustmentRange, WELL_TRANSFER_COSTS } from '../../models/rings'
import { getGravityWell, getRingConfigForWell, TRANSFER_POINTS } from '../../models/gravityWells'
import { PriorityQueue } from './priorityQueue'
import { getPredecessors } from './predecessors'
import type {
  OrbitalPosition,
  OrientedPosition,
  MovementPlan,
  MovementStep,
  PlannerOptions,
  PlannerMode,
  SearchNode,
  MovementAlternatives,
} from './types'
import { positionKey, positionsMatch } from './types'

/**
 * Default planner options
 */
const DEFAULT_OPTIONS: PlannerOptions = {
  mode: 'fastest',
  maxTurns: 20,
  availableMass: 100,
  currentFacing: 'prograde',
  allowWellTransfers: true,
  considerSlingshots: false,
}

/**
 * Plan optimal movement from origin to destination.
 *
 * Uses reverse Dijkstra search: starts from destination, finds all positions
 * that can reach it in one turn (predecessors), expands until origin is found.
 *
 * @param origin - Starting position with facing
 * @param destination - Target position (facing doesn't matter)
 * @param options - Planner configuration
 * @returns Movement plan or null if no path found
 */
export function planMovement(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: Partial<PlannerOptions> = {}
): MovementPlan | null {
  const opts: PlannerOptions = { ...DEFAULT_OPTIONS, ...options }

  // Priority queue ordered by cost (turns for fastest, mass for economical)
  const compareFn =
    opts.mode === 'fastest'
      ? (a: SearchNode, b: SearchNode) => a.turns - b.turns || a.massCost - b.massCost
      : (a: SearchNode, b: SearchNode) => a.massCost - b.massCost || a.turns - b.turns

  const openSet = new PriorityQueue<SearchNode>(compareFn)
  const visited = new Map<string, SearchNode>()

  // Start from destination with both facings (we don't care about final facing)
  for (const facing of ['prograde', 'retrograde'] as const) {
    const startNode: SearchNode = {
      position: { ...destination, facing },
      turns: 0,
      massCost: 0,
      action: null,
      burnIntensity: null,
      sectorAdjustment: 0,
      nextInPath: null,
    }
    openSet.enqueue(startNode)
  }

  while (!openSet.isEmpty()) {
    const current = openSet.dequeue()
    if (!current) break

    const key = positionKey(current.position)

    // Skip if already visited with better cost
    if (visited.has(key)) continue
    visited.set(key, current)

    // Check if we've exceeded max turns
    if (current.turns > opts.maxTurns) continue

    // Found origin?
    if (positionsMatch(current.position, origin)) {
      // Check if facing matches (we need to rotate if not)
      if (current.position.facing === origin.facing) {
        return reconstructPlan(current, origin, destination, opts)
      }
      // If facing doesn't match, we can still use this path - rotation is free but uses heat
      // We'll accept this path but note that rotation is needed at the start
      return reconstructPlan(current, origin, destination, opts)
    }

    // Expand predecessors (positions that can reach current in one turn)
    const predecessors = getPredecessors(current.position, opts.availableMass, opts.allowWellTransfers)

    for (const pred of predecessors) {
      const predKey = positionKey(pred.position)

      // Skip if already visited
      if (visited.has(predKey)) continue

      const newNode: SearchNode = {
        position: pred.position,
        turns: current.turns + 1,
        massCost: current.massCost + pred.massCost,
        action: pred.actionType,
        burnIntensity: pred.burnIntensity || null,
        sectorAdjustment: pred.sectorAdjustment,
        nextInPath: current,
      }

      // Check mass constraint
      if (newNode.massCost > opts.availableMass) continue

      openSet.enqueue(newNode)
    }
  }

  // No path found
  return null
}

/**
 * Reconstruct the movement plan from the search result.
 * The search went backwards (destination → origin), so we need to reverse the steps.
 */
function reconstructPlan(
  endNode: SearchNode,
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: PlannerOptions
): MovementPlan {
  const steps: MovementStep[] = []
  let crossesWells = false

  // Walk the path from origin toward destination
  let current: SearchNode | null = endNode

  while (current && current.nextInPath) {
    const next: SearchNode = current.nextInPath

    // The action stored in `current` is the action that reaches `next`
    // So the step is: from current.position -> to next.position
    const step: MovementStep = {
      from: current.position,
      to: {
        wellId: next.position.wellId,
        ring: next.position.ring,
        sector: next.position.sector,
      },
      actionType: current.action!,
      burnIntensity: current.burnIntensity ?? undefined,
      sectorAdjustment: current.sectorAdjustment,
      requiresRotation: current.position.facing !== origin.facing && steps.length === 0,
      massCost: current.massCost - (current.nextInPath?.massCost ?? 0),
    }

    if (step.actionType === 'well_transfer') {
      crossesWells = true
    }

    steps.push(step)
    current = next
  }

  return {
    origin,
    destination,
    steps,
    totalMassCost: endNode.massCost,
    totalTurns: endNode.turns,
    crossesWells,
    mode: options.mode,
  }
}

/**
 * Check if a destination is reachable within the given constraints.
 * Faster than full planning when you just need to know if it's possible.
 */
export function isReachable(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  maxTurns: number,
  availableMass: number,
  allowWellTransfers: boolean = true
): boolean {
  const plan = planMovement(origin, destination, {
    mode: 'fastest',
    maxTurns,
    availableMass,
    allowWellTransfers,
  })
  return plan !== null
}

/**
 * Get all positions reachable from origin within N turns.
 * Useful for visualizing movement range.
 *
 * @param origin - Starting position
 * @param maxTurns - Maximum number of turns to explore
 * @param availableMass - Maximum reaction mass to spend
 * @returns Map of reachable positions to their minimum turn count
 */
export function getReachablePositions(
  origin: OrientedPosition,
  maxTurns: number,
  availableMass: number,
  allowWellTransfers: boolean = true
): Map<string, { position: OrbitalPosition; turns: number; massCost: number }> {
  const reachable = new Map<string, { position: OrbitalPosition; turns: number; massCost: number }>()

  // Use forward BFS from origin
  const visited = new Map<string, SearchNode>()
  const queue: SearchNode[] = []

  // Start from origin with both facings
  for (const facing of ['prograde', 'retrograde'] as Facing[]) {
    queue.push({
      position: { ...origin, facing },
      turns: 0,
      massCost: 0,
      action: null,
      burnIntensity: null,
      sectorAdjustment: 0,
      nextInPath: null,
    })
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const key = positionKey(current.position)

    if (visited.has(key)) continue
    visited.set(key, current)

    // Record this position as reachable (use position without facing for result)
    const posKey = `${current.position.wellId}:${current.position.ring}:${current.position.sector}`
    const existing = reachable.get(posKey)
    if (!existing || existing.turns > current.turns) {
      reachable.set(posKey, {
        position: {
          wellId: current.position.wellId,
          ring: current.position.ring,
          sector: current.position.sector,
        },
        turns: current.turns,
        massCost: current.massCost,
      })
    }

    // Stop expanding if at max turns
    if (current.turns >= maxTurns) continue

    // Get all positions this can reach in one turn (forward expansion)
    const successors = getSuccessors(current.position, availableMass - current.massCost, allowWellTransfers)

    for (const succ of successors) {
      const succKey = positionKey(succ.position)
      if (visited.has(succKey)) continue

      queue.push({
        position: succ.position,
        turns: current.turns + 1,
        massCost: current.massCost + succ.massCost,
        action: succ.actionType,
        burnIntensity: succ.burnIntensity || null,
        sectorAdjustment: succ.sectorAdjustment,
        nextInPath: current,
      })
    }
  }

  return reachable
}

/**
 * Get positions reachable from a position in one turn (forward direction).
 * This is the inverse of getPredecessors.
 */
function getSuccessors(
  position: OrientedPosition,
  availableMass: number,
  allowWellTransfers: boolean
): Array<{
  position: OrientedPosition
  actionType: 'coast' | 'burn_prograde' | 'burn_retrograde' | 'well_transfer'
  burnIntensity?: 'soft' | 'medium' | 'hard'
  sectorAdjustment: number
  massCost: number
}> {
  // For now, we can approximate by finding positions that have `position` as a predecessor
  // This is less efficient but correct
  // TODO: Implement direct forward calculation for better performance

  const results: Array<{
    position: OrientedPosition
    actionType: 'coast' | 'burn_prograde' | 'burn_retrograde' | 'well_transfer'
    burnIntensity?: 'soft' | 'medium' | 'hard'
    sectorAdjustment: number
    massCost: number
  }> = []

  const well = getGravityWell(position.wellId)
  if (!well) return results

  const ringConfig = getRingConfigForWell(position.wellId, position.ring)
  if (!ringConfig) return results

  const velocity = ringConfig.velocity

  // 1. Coast: apply orbital movement
  const coastSector = (position.sector + velocity) % SECTORS_PER_RING
  results.push({
    position: { wellId: position.wellId, ring: position.ring, sector: coastSector, facing: position.facing },
    actionType: 'coast',
    sectorAdjustment: 0,
    massCost: 0,
  })

  // 2. Burns (real orbital mechanics)
  const burnIntensities = ['soft', 'medium', 'hard'] as const
  for (const intensity of burnIntensities) {
    const burnCost = BURN_COSTS[intensity]
    if (burnCost.mass > availableMass) continue

    // Prograde burn: accelerates with orbit = raises orbit = move to HIGHER ring (outward)
    if (position.facing === 'prograde') {
      const destRing = position.ring + burnCost.rings
      if (destRing <= well.rings.length) {
        const adjustmentRange = getAdjustmentRange(velocity)
        for (let adj = adjustmentRange.min; adj <= adjustmentRange.max; adj++) {
          const totalMass = burnCost.mass + Math.abs(adj)
          if (totalMass > availableMass) continue

          // Orbital movement first, then ring change + adjustment
          const destSector = (position.sector + velocity + adj + 2 * SECTORS_PER_RING) % SECTORS_PER_RING
          results.push({
            position: { wellId: position.wellId, ring: destRing, sector: destSector, facing: position.facing },
            actionType: 'burn_prograde',
            burnIntensity: intensity,
            sectorAdjustment: adj,
            massCost: totalMass,
          })
        }
      }
    }

    // Retrograde burn: decelerates = lowers orbit = move to LOWER ring (inward)
    if (position.facing === 'retrograde') {
      const destRing = position.ring - burnCost.rings
      if (destRing >= 1) {
        const adjustmentRange = getAdjustmentRange(velocity)
        for (let adj = adjustmentRange.min; adj <= adjustmentRange.max; adj++) {
          const totalMass = burnCost.mass + Math.abs(adj)
          if (totalMass > availableMass) continue

          const destSector = (position.sector + velocity + adj + 2 * SECTORS_PER_RING) % SECTORS_PER_RING
          results.push({
            position: { wellId: position.wellId, ring: destRing, sector: destSector, facing: position.facing },
            actionType: 'burn_retrograde',
            burnIntensity: intensity,
            sectorAdjustment: adj,
            massCost: totalMass,
          })
        }
      }
    }
  }

  // 3. Well transfers
  if (allowWellTransfers && WELL_TRANSFER_COSTS.mass <= availableMass) {
    for (const tp of TRANSFER_POINTS) {
      if (tp.fromWellId === position.wellId && tp.fromRing === position.ring && tp.fromSector === position.sector) {
        // Found valid transfer point
        const destRingConfig = getRingConfigForWell(tp.toWellId, tp.toRing)
        if (!destRingConfig) continue

        // After transfer, orbital movement happens
        const finalSector = (tp.toSector + destRingConfig.velocity) % SECTORS_PER_RING
        results.push({
          position: { wellId: tp.toWellId, ring: tp.toRing, sector: finalSector, facing: position.facing },
          actionType: 'well_transfer',
          sectorAdjustment: 0,
          massCost: WELL_TRANSFER_COSTS.mass,
        })
      }
    }
  }

  return results
}

/**
 * Compare two plans and return the better one based on mode
 */
export function comparePlans(
  a: MovementPlan | null,
  b: MovementPlan | null,
  mode: PlannerMode
): MovementPlan | null {
  if (!a) return b
  if (!b) return a

  if (mode === 'fastest') {
    if (a.totalTurns !== b.totalTurns) {
      return a.totalTurns < b.totalTurns ? a : b
    }
    return a.totalMassCost < b.totalMassCost ? a : b
  } else {
    if (a.totalMassCost !== b.totalMassCost) {
      return a.totalMassCost < b.totalMassCost ? a : b
    }
    return a.totalTurns < b.totalTurns ? a : b
  }
}

/**
 * Generate a unique signature for a plan based on its steps.
 * Used for deduplication.
 */
function planSignature(plan: MovementPlan): string {
  return plan.steps
    .map(s => `${s.actionType}:${s.to.wellId}:${s.to.ring}:${s.to.sector}:${s.sectorAdjustment}`)
    .join('|')
}

/**
 * Check if two plans are essentially the same route
 */
function plansAreEquivalent(a: MovementPlan, b: MovementPlan): boolean {
  return planSignature(a) === planSignature(b)
}

/**
 * Plan multiple alternative routes from origin to destination.
 * Returns up to 3 distinct paths: fastest, economical, and balanced (if different).
 *
 * For cross-well routes, alternatives are computed in two phases:
 * 1. Origin → transfer point (in source well)
 * 2. Landing sector → destination (in destination well)
 *
 * @param origin - Starting position with facing
 * @param destination - Target position (facing doesn't matter)
 * @param options - Planner configuration (mode is ignored, all modes are tried)
 * @returns Collection of alternative routes, or null if no path found
 */
export function planMovementAlternatives(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: Partial<Omit<PlannerOptions, 'mode'>> = {}
): MovementAlternatives | null {
  const baseOptions = { ...DEFAULT_OPTIONS, ...options }

  // Check if this is a cross-well route
  if (origin.wellId !== destination.wellId && baseOptions.allowWellTransfers) {
    return planCrossWellAlternatives(origin, destination, baseOptions)
  }

  // Same-well route - use standard logic
  return planSameWellAlternatives(origin, destination, baseOptions)
}

/**
 * Plan alternatives for same-well routes
 */
function planSameWellAlternatives(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  baseOptions: PlannerOptions
): MovementAlternatives | null {
  const alternatives: MovementPlan[] = []

  // 1. Find fastest route
  const fastest = planMovement(origin, destination, { ...baseOptions, mode: 'fastest' })
  if (fastest) {
    fastest.label = '⚡ Fastest'
    alternatives.push(fastest)
  }

  // 2. Find most economical route
  const economical = planMovement(origin, destination, { ...baseOptions, mode: 'economical' })
  if (economical) {
    // Only add if different from fastest
    if (!fastest || !plansAreEquivalent(economical, fastest)) {
      economical.label = '💰 Economical'
      alternatives.push(economical)
    }
  }

  // 3. Try to find a "balanced" route by limiting turns slightly beyond fastest
  if (fastest && economical && !plansAreEquivalent(fastest, economical)) {
    const balancedOptions = {
      ...baseOptions,
      mode: 'economical' as PlannerMode,
      maxTurns: fastest.totalTurns + 1,
    }
    const balanced = planMovement(origin, destination, balancedOptions)

    if (balanced) {
      const isDifferentFromFastest = !plansAreEquivalent(balanced, fastest)
      const isDifferentFromEconomical = !plansAreEquivalent(balanced, economical)
      const isTrulyBalanced =
        balanced.totalTurns <= economical.totalTurns &&
        balanced.totalMassCost <= fastest.totalMassCost

      if (isDifferentFromFastest && isDifferentFromEconomical && isTrulyBalanced) {
        balanced.label = '⚖️ Balanced'
        alternatives.splice(1, 0, balanced)
      }
    }
  }

  if (alternatives.length === 0) {
    return null
  }

  return { destination, alternatives }
}

/**
 * Plan alternatives for cross-well routes.
 * Computes routes in two phases and explores different transfer points.
 */
function planCrossWellAlternatives(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  baseOptions: PlannerOptions
): MovementAlternatives | null {
  const alternatives: MovementPlan[] = []

  // Find all transfer points from origin well to destination well
  const relevantTransferPoints = TRANSFER_POINTS.filter(
    tp => tp.fromWellId === origin.wellId && tp.toWellId === destination.wellId
  )

  if (relevantTransferPoints.length === 0) {
    // No direct transfer - try the single-phase planner which might find multi-hop routes
    return planSameWellAlternatives(origin, destination, baseOptions)
  }

  // For each transfer point, compute two-phase routes
  for (const tp of relevantTransferPoints) {
    // Phase 1: Plan from origin to transfer point
    const transferSectorPosition: OrbitalPosition = {
      wellId: origin.wellId,
      ring: tp.fromRing,
      sector: tp.fromSector,
    }

    // Try both fastest and economical for leg 1
    for (const mode of ['fastest', 'economical'] as PlannerMode[]) {
      const leg1 = planMovement(origin, transferSectorPosition, {
        ...baseOptions,
        mode,
        allowWellTransfers: false, // Stay in source well for this leg
      })

      if (!leg1) continue

      // Calculate landing position after transfer
      // After well transfer, ship lands at toSector then orbital movement applies
      const destRingConfig = getRingConfigForWell(destination.wellId, tp.toRing)
      if (!destRingConfig) continue

      const landingSector = (tp.toSector + destRingConfig.velocity) % SECTORS_PER_RING
      const landingPosition: OrientedPosition = {
        wellId: destination.wellId,
        ring: tp.toRing,
        sector: landingSector,
        facing: origin.facing, // Facing is preserved through transfer
      }

      // Check if we're already at destination after landing
      if (positionsMatch(landingPosition, destination)) {
        // No leg 2 needed - just the transfer
        const fullPlan = buildCrossWellPlan(origin, destination, leg1, null, tp, baseOptions.mode)
        addUniqueAlternative(alternatives, fullPlan)
        continue
      }

      // Phase 2: Plan from landing position to destination
      const remainingMass = baseOptions.availableMass - leg1.totalMassCost - WELL_TRANSFER_COSTS.mass

      // Try both modes for leg 2
      for (const mode2 of ['fastest', 'economical'] as PlannerMode[]) {
        const leg2 = planMovement(landingPosition, destination, {
          ...baseOptions,
          mode: mode2,
          availableMass: remainingMass,
          allowWellTransfers: false, // Stay in destination well
        })

        if (!leg2) continue

        // Build combined plan
        const combinedMode = mode === 'fastest' && mode2 === 'fastest' ? 'fastest' : 'economical'
        const fullPlan = buildCrossWellPlan(origin, destination, leg1, leg2, tp, combinedMode)
        addUniqueAlternative(alternatives, fullPlan)
      }
    }
  }

  if (alternatives.length === 0) {
    // Fallback to single-phase planner
    return planSameWellAlternatives(origin, destination, baseOptions)
  }

  // Sort alternatives by turns first, then by mass cost
  alternatives.sort((a, b) => {
    if (a.totalTurns !== b.totalTurns) return a.totalTurns - b.totalTurns
    return a.totalMassCost - b.totalMassCost
  })

  // Before limiting, ensure we include the most economical option if it would be cut
  // Find the most economical (lowest mass)
  let economicalIndex = 0
  for (let i = 1; i < alternatives.length; i++) {
    if (alternatives[i].totalMassCost < alternatives[economicalIndex].totalMassCost) {
      economicalIndex = i
    }
  }

  // If the economical option would be cut off (index >= 3), swap it in
  if (economicalIndex >= 3 && alternatives.length > 3) {
    // Swap the economical one into position 2 (third spot)
    const economical = alternatives[economicalIndex]
    alternatives.splice(economicalIndex, 1)
    alternatives.splice(2, 0, economical)
    economicalIndex = 2
  }

  // Limit to 3 alternatives
  const finalAlternatives = alternatives.slice(0, 3)

  // Label the alternatives
  // First (fastest by turns) gets "Fastest"
  if (finalAlternatives.length >= 1) {
    finalAlternatives[0].label = '⚡ Fastest'
  }

  // Label the economical one if it's in the final set and different from fastest
  if (finalAlternatives.length >= 2) {
    // Find most economical in the final set
    let finalEconomicalIndex = 0
    for (let i = 1; i < finalAlternatives.length; i++) {
      if (finalAlternatives[i].totalMassCost < finalAlternatives[finalEconomicalIndex].totalMassCost) {
        finalEconomicalIndex = i
      }
    }
    if (finalEconomicalIndex !== 0) {
      finalAlternatives[finalEconomicalIndex].label = '💰 Economical'
    }
  }

  // Label remaining unlabeled alternatives as "Balanced"
  for (const alt of finalAlternatives) {
    if (!alt.label) {
      alt.label = '⚖️ Balanced'
    }
  }

  return {
    destination,
    alternatives: finalAlternatives,
  }
}

/**
 * Build a complete cross-well plan from two legs
 */
function buildCrossWellPlan(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  leg1: MovementPlan,
  leg2: MovementPlan | null,
  transferPoint: typeof TRANSFER_POINTS[0],
  mode: PlannerMode
): MovementPlan {
  const destRingConfig = getRingConfigForWell(destination.wellId, transferPoint.toRing)
  const landingSector = destRingConfig
    ? (transferPoint.toSector + destRingConfig.velocity) % SECTORS_PER_RING
    : transferPoint.toSector

  // Create the transfer step
  const lastLeg1Step = leg1.steps[leg1.steps.length - 1]
  const transferFrom: OrientedPosition = lastLeg1Step
    ? { ...lastLeg1Step.to, facing: origin.facing }
    : origin

  const transferStep: MovementStep = {
    from: transferFrom,
    to: {
      wellId: destination.wellId,
      ring: transferPoint.toRing,
      sector: landingSector,
    },
    actionType: 'well_transfer',
    sectorAdjustment: 0,
    requiresRotation: false,
    massCost: WELL_TRANSFER_COSTS.mass,
  }

  // Combine all steps
  const allSteps: MovementStep[] = [
    ...leg1.steps,
    transferStep,
    ...(leg2?.steps || []),
  ]

  const totalMassCost =
    leg1.totalMassCost +
    WELL_TRANSFER_COSTS.mass +
    (leg2?.totalMassCost || 0)

  const totalTurns =
    leg1.totalTurns +
    1 + // Transfer turn
    (leg2?.totalTurns || 0)

  return {
    origin,
    destination,
    steps: allSteps,
    totalMassCost,
    totalTurns,
    crossesWells: true,
    mode,
  }
}

/**
 * Add a plan to alternatives if it's unique
 */
function addUniqueAlternative(alternatives: MovementPlan[], plan: MovementPlan): void {
  const isDuplicate = alternatives.some(existing => plansAreEquivalent(existing, plan))
  if (!isDuplicate) {
    alternatives.push(plan)
  }
}
