import type { Facing } from "../../models/game.ts";
import { MAX_REACTION_MASS } from "../../models/game.ts";
import {
  BURN_COSTS,
  SECTORS_PER_RING,
  getAdjustmentRange,
  WELL_TRANSFER_COSTS,
} from "../../models/rings.ts";
import {
  getGravityWell,
  getRingConfigForWell,
  TRANSFER_POINTS,
} from "../../models/gravityWells.ts";
import { getPredecessors } from "./predecessors.ts";
import type {
  OrbitalPosition,
  OrientedPosition,
  MovementPlan,
  MovementStep,
  PlannerOptions,
  PlannerMode,
  SearchNode,
  MovementAlternatives,
} from "./types.ts";
import { positionKey, positionsMatch } from "./types.ts";

/**
 * Default planner options
 */
const DEFAULT_OPTIONS: PlannerOptions = {
  mode: "fastest",
  maxTurns: 20,
  availableMass: MAX_REACTION_MASS,
  currentFacing: "prograde",
  allowWellTransfers: true,
  fuelReserve: 0,
  hasFuelScoop: false,
  maxFuelCapacity: MAX_REACTION_MASS,
};

/**
 * Plan optimal movement from origin to destination.
 *
 * Uses reverse turn-layered BFS: starts from destination, expands predecessors
 * layer by layer (one turn per layer). This correctly handles negative edge
 * weights from fuel scoop recovery, which breaks standard Dijkstra.
 *
 * - "fastest" mode: early-terminates on first origin find (turns only increase)
 * - "economical" mode: processes all layers to find globally cheapest path
 *
 * @param origin - Starting position with facing
 * @param destination - Target position (facing doesn't matter)
 * @param options - Planner configuration
 * @returns Movement plan or null if no path found
 */
export function planMovement(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: Partial<PlannerOptions> = {},
): MovementPlan | null {
  const opts: PlannerOptions = { ...DEFAULT_OPTIONS, ...options };

  // bestAt: tracks Pareto-optimal paths to each spatial position.
  // With negative edge weights (scoop), a position may be reached at turn T with
  // massCost M1, and again at turn T+1 with massCost M2 < M1. Both are useful:
  // the T-path is faster, but the (T+1)-path has more fuel for subsequent burns.
  // We keep all non-dominated entries (lower turns OR lower massCost).
  const bestAt = new Map<
    string,
    Array<{ turns: number; massCost: number; node: SearchNode }>
  >();

  // Seed destination into turn-0 layer (both facings)
  let currentLayer: SearchNode[] = [];
  for (const facing of ["prograde", "retrograde"] as const) {
    currentLayer.push({
      position: { ...destination, facing },
      turns: 0,
      massCost: 0,
      action: null,
      burnIntensity: null,
      sectorAdjustment: 0,
      nextInPath: null,
    });
  }

  // For economical mode, track best origin node across all layers
  let bestOriginNode: SearchNode | null = null;

  for (let turn = 0; turn <= opts.maxTurns; turn++) {
    if (currentLayer.length === 0) break;

    // Deduplicate within layer: keep best massCost per positionKey
    const layerBest = new Map<string, SearchNode>();
    for (const node of currentLayer) {
      const key = positionKey(node.position);
      const existing = layerBest.get(key);
      if (!existing || node.massCost < existing.massCost) {
        layerBest.set(key, node);
      }
    }

    const nextLayer: SearchNode[] = [];

    for (const [key, node] of layerBest) {
      // Check against Pareto frontier — skip if dominated by any existing entry.
      // A node is dominated if some previous entry has turns <= node.turns AND
      // massCost <= node.massCost (i.e., it's at least as good in both dimensions).
      const frontier = bestAt.get(key);
      if (frontier) {
        const dominated = frontier.some(
          (e) => e.turns <= node.turns && e.massCost <= node.massCost,
        );
        if (dominated) continue;
      }

      // Add to frontier (and prune entries this node dominates)
      const newFrontier = frontier
        ? frontier.filter(
            (e) => !(node.turns <= e.turns && node.massCost <= e.massCost),
          )
        : [];
      newFrontier.push({ turns: node.turns, massCost: node.massCost, node });
      bestAt.set(key, newFrontier);

      // Check if origin found (accept either facing — rotation is free)
      if (positionsMatch(node.position, origin)) {
        if (opts.mode === "fastest") {
          // First find at minimum turn = optimal. Return immediately.
          return reconstructPlan(node, origin, destination, opts);
        } else {
          // Track best for economical mode — keep searching for cheaper
          if (
            !bestOriginNode ||
            node.massCost < bestOriginNode.massCost ||
            (node.massCost === bestOriginNode.massCost &&
              node.turns < bestOriginNode.turns)
          ) {
            bestOriginNode = node;
          }
        }
      }

      // Expand predecessors (positions that can reach this node in one turn)
      const predecessors = getPredecessors(
        node.position,
        opts.availableMass,
        opts.allowWellTransfers,
      );

      for (const pred of predecessors) {
        // Calculate mass cost for this step
        let stepMassCost = pred.massCost;

        // Fuel scoop: coasting recovers mass equal to ring velocity
        if (opts.hasFuelScoop && pred.actionType === "coast") {
          const ringConfig = getRingConfigForWell(
            pred.position.wellId,
            pred.position.ring,
          );
          const scoopRecovery = ringConfig?.velocity ?? 0;
          stepMassCost = -scoopRecovery;
        }

        let newMassCost = node.massCost + stepMassCost;

        // Clamp: fuel on hand can't exceed maxFuelCapacity
        const minMassCost = -(opts.maxFuelCapacity - opts.availableMass);
        if (newMassCost < minMassCost) {
          newMassCost = minMassCost;
        }

        // Prune over-budget paths
        if (newMassCost > opts.availableMass) continue;

        nextLayer.push({
          position: pred.position,
          turns: turn + 1,
          massCost: newMassCost,
          action: pred.actionType,
          burnIntensity: pred.burnIntensity || null,
          sectorAdjustment: pred.sectorAdjustment,
          nextInPath: node,
        });
      }
    }

    currentLayer = nextLayer;
  }

  // For economical mode, return best origin found across all layers
  if (bestOriginNode) {
    return reconstructPlan(bestOriginNode, origin, destination, opts);
  }

  // No path found
  return null;
}

/**
 * Reconstruct the movement plan from the search result.
 * The search went backwards (destination → origin), so we need to reverse the steps.
 */
function reconstructPlan(
  endNode: SearchNode,
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: PlannerOptions,
): MovementPlan {
  const steps: MovementStep[] = [];
  let crossesWells = false;

  // Walk the path from origin toward destination
  let current: SearchNode | null = endNode;

  while (current && current.nextInPath) {
    const next: SearchNode = current.nextInPath;

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
      requiresRotation:
        current.position.facing !== origin.facing && steps.length === 0,
      massCost: current.massCost - (current.nextInPath?.massCost ?? 0),
    };

    if (step.actionType === "well_transfer") {
      crossesWells = true;
    }

    steps.push(step);
    current = next;
  }

  return {
    origin,
    destination,
    steps,
    totalMassCost: endNode.massCost,
    totalTurns: endNode.turns,
    crossesWells,
    mode: options.mode,
  };
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
  allowWellTransfers: boolean = true,
): boolean {
  const plan = planMovement(origin, destination, {
    mode: "fastest",
    maxTurns,
    availableMass,
    allowWellTransfers,
  });
  return plan !== null;
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
  allowWellTransfers: boolean = true,
): Map<string, { position: OrbitalPosition; turns: number; massCost: number }> {
  const reachable = new Map<
    string,
    { position: OrbitalPosition; turns: number; massCost: number }
  >();

  // Use forward BFS from origin
  const visited = new Map<string, SearchNode>();
  const queue: SearchNode[] = [];

  // Start from origin with both facings
  for (const facing of ["prograde", "retrograde"] as Facing[]) {
    queue.push({
      position: { ...origin, facing },
      turns: 0,
      massCost: 0,
      action: null,
      burnIntensity: null,
      sectorAdjustment: 0,
      nextInPath: null,
    });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = positionKey(current.position);

    if (visited.has(key)) continue;
    visited.set(key, current);

    // Record this position as reachable (use position without facing for result)
    const posKey = `${current.position.wellId}:${current.position.ring}:${current.position.sector}`;
    const existing = reachable.get(posKey);
    if (!existing || existing.turns > current.turns) {
      reachable.set(posKey, {
        position: {
          wellId: current.position.wellId,
          ring: current.position.ring,
          sector: current.position.sector,
        },
        turns: current.turns,
        massCost: current.massCost,
      });
    }

    // Stop expanding if at max turns
    if (current.turns >= maxTurns) continue;

    // Get all positions this can reach in one turn (forward expansion)
    const successors = getSuccessors(
      current.position,
      availableMass - current.massCost,
      allowWellTransfers,
    );

    for (const succ of successors) {
      const succKey = positionKey(succ.position);
      if (visited.has(succKey)) continue;

      queue.push({
        position: succ.position,
        turns: current.turns + 1,
        massCost: current.massCost + succ.massCost,
        action: succ.actionType,
        burnIntensity: succ.burnIntensity || null,
        sectorAdjustment: succ.sectorAdjustment,
        nextInPath: current,
      });
    }
  }

  return reachable;
}

/**
 * Get positions reachable from a position in one turn (forward direction).
 * This is the inverse of getPredecessors.
 */
function getSuccessors(
  position: OrientedPosition,
  availableMass: number,
  allowWellTransfers: boolean,
): Array<{
  position: OrientedPosition;
  actionType: "coast" | "burn_prograde" | "burn_retrograde" | "well_transfer";
  burnIntensity?: "soft" | "medium" | "hard";
  sectorAdjustment: number;
  massCost: number;
}> {
  // For now, we can approximate by finding positions that have `position` as a predecessor
  // This is less efficient but correct
  // TODO: Implement direct forward calculation for better performance

  const results: Array<{
    position: OrientedPosition;
    actionType: "coast" | "burn_prograde" | "burn_retrograde" | "well_transfer";
    burnIntensity?: "soft" | "medium" | "hard";
    sectorAdjustment: number;
    massCost: number;
  }> = [];

  const well = getGravityWell(position.wellId);
  if (!well) return results;

  const ringConfig = getRingConfigForWell(position.wellId, position.ring);
  if (!ringConfig) return results;

  const velocity = ringConfig.velocity;

  // 1. Coast: apply orbital movement
  const coastSector = (position.sector + velocity) % SECTORS_PER_RING;
  results.push({
    position: {
      wellId: position.wellId,
      ring: position.ring,
      sector: coastSector,
      facing: position.facing,
    },
    actionType: "coast",
    sectorAdjustment: 0,
    massCost: 0,
  });

  // 2. Burns (real orbital mechanics)
  const burnIntensities = ["soft", "medium", "hard"] as const;
  for (const intensity of burnIntensities) {
    const burnCost = BURN_COSTS[intensity];
    if (burnCost.mass > availableMass) continue;

    // Prograde burn: accelerates with orbit = raises orbit = move to HIGHER ring (outward)
    if (position.facing === "prograde") {
      const destRing = position.ring + burnCost.rings;
      if (destRing <= well.rings.length) {
        const adjustmentRange = getAdjustmentRange(velocity);
        for (let adj = adjustmentRange.min; adj <= adjustmentRange.max; adj++) {
          const totalMass = burnCost.mass + Math.abs(adj);
          if (totalMass > availableMass) continue;

          // Orbital movement first, then ring change + adjustment
          const destSector =
            (position.sector + velocity + adj + 2 * SECTORS_PER_RING) %
            SECTORS_PER_RING;
          results.push({
            position: {
              wellId: position.wellId,
              ring: destRing,
              sector: destSector,
              facing: position.facing,
            },
            actionType: "burn_prograde",
            burnIntensity: intensity,
            sectorAdjustment: adj,
            massCost: totalMass,
          });
        }
      }
    }

    // Retrograde burn: decelerates = lowers orbit = move to LOWER ring (inward)
    if (position.facing === "retrograde") {
      const destRing = position.ring - burnCost.rings;
      if (destRing >= 1) {
        const adjustmentRange = getAdjustmentRange(velocity);
        for (let adj = adjustmentRange.min; adj <= adjustmentRange.max; adj++) {
          const totalMass = burnCost.mass + Math.abs(adj);
          if (totalMass > availableMass) continue;

          const destSector =
            (position.sector + velocity + adj + 2 * SECTORS_PER_RING) %
            SECTORS_PER_RING;
          results.push({
            position: {
              wellId: position.wellId,
              ring: destRing,
              sector: destSector,
              facing: position.facing,
            },
            actionType: "burn_retrograde",
            burnIntensity: intensity,
            sectorAdjustment: adj,
            massCost: totalMass,
          });
        }
      }
    }
  }

  // 3. Well transfers
  if (allowWellTransfers && WELL_TRANSFER_COSTS.mass <= availableMass) {
    for (const tp of TRANSFER_POINTS) {
      if (
        tp.fromWellId === position.wellId &&
        tp.fromRing === position.ring &&
        tp.fromSector === position.sector
      ) {
        // Found valid transfer point
        const destRingConfig = getRingConfigForWell(tp.toWellId, tp.toRing);
        if (!destRingConfig) continue;

        // After transfer, orbital movement happens
        const finalSector =
          (tp.toSector + destRingConfig.velocity) % SECTORS_PER_RING;
        results.push({
          position: {
            wellId: tp.toWellId,
            ring: tp.toRing,
            sector: finalSector,
            facing: position.facing,
          },
          actionType: "well_transfer",
          sectorAdjustment: 0,
          massCost: WELL_TRANSFER_COSTS.mass,
        });
      }
    }
  }

  return results;
}

/**
 * Compare two plans and return the better one based on mode
 */
export function comparePlans(
  a: MovementPlan | null,
  b: MovementPlan | null,
  mode: PlannerMode,
): MovementPlan | null {
  if (!a) return b;
  if (!b) return a;

  if (mode === "fastest") {
    if (a.totalTurns !== b.totalTurns) {
      return a.totalTurns < b.totalTurns ? a : b;
    }
    return a.totalMassCost < b.totalMassCost ? a : b;
  } else {
    if (a.totalMassCost !== b.totalMassCost) {
      return a.totalMassCost < b.totalMassCost ? a : b;
    }
    return a.totalTurns < b.totalTurns ? a : b;
  }
}

/**
 * Generate a unique signature for a plan based on its steps.
 * Used for deduplication.
 */
function planSignature(plan: MovementPlan): string {
  return plan.steps
    .map(
      (s) =>
        `${s.actionType}:${s.to.wellId}:${s.to.ring}:${s.to.sector}:${s.sectorAdjustment}`,
    )
    .join("|");
}

/**
 * Check if two plans are essentially the same route
 */
function plansAreEquivalent(a: MovementPlan, b: MovementPlan): boolean {
  return planSignature(a) === planSignature(b);
}

/**
 * Plan multiple alternative routes from origin to destination.
 * Returns up to 3 distinct paths: fastest, economical, and balanced (if different).
 *
 * Uses the single-pass planMovement for all routes (including cross-well),
 * which correctly handles fuel scoop recovery and well transfers.
 *
 * @param origin - Starting position with facing
 * @param destination - Target position (facing doesn't matter)
 * @param options - Planner configuration (mode is ignored, all modes are tried)
 * @returns Collection of alternative routes, or null if no path found
 */
export function planMovementAlternatives(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: Partial<Omit<PlannerOptions, "mode">> = {},
): MovementAlternatives | null {
  const baseOptions = { ...DEFAULT_OPTIONS, ...options };
  const alternatives: MovementPlan[] = [];

  // 1. Find fastest route
  const fastest = planMovement(origin, destination, {
    ...baseOptions,
    mode: "fastest",
  });
  if (fastest) {
    fastest.label = "⚡ Fastest";
    alternatives.push(fastest);
  }

  // 2. Find most economical route
  const economical = planMovement(origin, destination, {
    ...baseOptions,
    mode: "economical",
  });
  if (economical) {
    if (!fastest || !plansAreEquivalent(economical, fastest)) {
      economical.label = "💰 Economical";
      alternatives.push(economical);
    }
  }

  // 3. Try to find a "balanced" route by limiting turns slightly beyond fastest
  if (fastest && economical && !plansAreEquivalent(fastest, economical)) {
    const balanced = planMovement(origin, destination, {
      ...baseOptions,
      mode: "economical" as PlannerMode,
      maxTurns: fastest.totalTurns + 1,
    });

    if (balanced) {
      const isDifferentFromFastest = !plansAreEquivalent(balanced, fastest);
      const isDifferentFromEconomical = !plansAreEquivalent(
        balanced,
        economical,
      );
      const isTrulyBalanced =
        balanced.totalTurns <= economical.totalTurns &&
        balanced.totalMassCost <= fastest.totalMassCost;

      if (
        isDifferentFromFastest &&
        isDifferentFromEconomical &&
        isTrulyBalanced
      ) {
        balanced.label = "⚖️ Balanced";
        alternatives.splice(1, 0, balanced);
      }
    }
  }

  if (alternatives.length === 0) {
    return null;
  }

  return { destination, alternatives };
}

