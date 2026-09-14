/**
 * Reverse, turn-layered BFS for static destinations, plus route
 * alternatives and reachability helpers.
 */
import type { Facing } from "../../models/game.ts";
import { ringVelocity, samePosition } from "../../game/geometry.ts";
import { getPredecessors } from "./predecessors.ts";
import { getSuccessors } from "./successors.ts";
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
import { DEFAULT_PLANNER_OPTIONS, positionKey, positionKeyInt } from "./types.ts";

/**
 * Plan optimal movement from origin to destination.
 *
 * Uses reverse turn-layered BFS: starts from the destination and expands
 * predecessors layer by layer (one turn per layer). This correctly handles
 * the negative edge weights of scoop recovery, which break plain Dijkstra.
 *
 * - "fastest": returns on the first layer that contains the origin
 * - "economical": processes all layers to find the globally cheapest path
 */
export function planMovement(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: Partial<PlannerOptions> = {}
): MovementPlan | null {
  const opts: PlannerOptions = { ...DEFAULT_PLANNER_OPTIONS, ...options };

  // Pareto frontier per position: with scoop recovery a position may be
  // reached at turn T with mass M1 and at T+1 with M2 < M1; both are useful.
  const bestAt = new Map<number, Array<{ turns: number; massCost: number; node: SearchNode }>>();

  let currentLayer: SearchNode[] = (["prograde", "retrograde"] as const).map((facing) => ({
    position: { ...destination, facing },
    turns: 0,
    massCost: 0,
    action: null,
    burnIntensity: null,
    sectorAdjustment: 0,
    nextInPath: null,
  }));

  let bestOriginNode: SearchNode | null = null;
  const predecessorOptions = {
    allowWellTransfers: opts.allowWellTransfers,
    hasFuelCompressor: opts.hasFuelCompressor,
  };
  const minMassCost = -(opts.maxFuelCapacity - opts.availableMass);

  for (let turn = 0; turn <= opts.maxTurns; turn++) {
    if (currentLayer.length === 0) break;

    // Deduplicate within the layer: keep the best massCost per position.
    const layerBest = new Map<number, SearchNode>();
    for (const node of currentLayer) {
      const key = positionKeyInt(node.position);
      const existing = layerBest.get(key);
      if (!existing || node.massCost < existing.massCost) layerBest.set(key, node);
    }

    const nextLayer: SearchNode[] = [];

    for (const [key, node] of layerBest) {
      const frontier = bestAt.get(key);
      if (frontier && frontier.some((e) => e.turns <= node.turns && e.massCost <= node.massCost))
        continue;
      const newFrontier = frontier
        ? frontier.filter((e) => !(node.turns <= e.turns && node.massCost <= e.massCost))
        : [];
      newFrontier.push({ turns: node.turns, massCost: node.massCost, node });
      bestAt.set(key, newFrontier);

      // Either facing counts: rotation before the first move is free.
      if (samePosition(node.position, origin)) {
        if (opts.mode === "fastest") return reconstructPlan(node, origin, destination, opts);
        if (
          !bestOriginNode ||
          node.massCost < bestOriginNode.massCost ||
          (node.massCost === bestOriginNode.massCost && node.turns < bestOriginNode.turns)
        ) {
          bestOriginNode = node;
        }
      }

      for (const pred of getPredecessors(node.position, opts.availableMass, predecessorOptions)) {
        let stepMassCost = pred.massCost;
        if (opts.hasFuelScoop && pred.actionType === "coast") {
          stepMassCost = -ringVelocity(pred.position.wellId, pred.position.ring);
        }
        let newMassCost = node.massCost + stepMassCost;
        if (newMassCost < minMassCost) newMassCost = minMassCost;
        if (newMassCost > opts.availableMass) continue;

        nextLayer.push({
          position: pred.position,
          turns: turn + 1,
          massCost: newMassCost,
          action: pred.actionType,
          burnIntensity: pred.burnIntensity ?? null,
          sectorAdjustment: pred.sectorAdjustment,
          nextInPath: node,
        });
      }
    }

    currentLayer = nextLayer;
  }

  return bestOriginNode ? reconstructPlan(bestOriginNode, origin, destination, opts) : null;
}

/**
 * The search went destination → origin; the plan reads origin → destination.
 */
function reconstructPlan(
  endNode: SearchNode,
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: PlannerOptions
): MovementPlan {
  const steps: MovementStep[] = [];
  let crossesWells = false;
  let current: SearchNode | null = endNode;

  while (current && current.nextInPath) {
    const next: SearchNode = current.nextInPath;
    const step: MovementStep = {
      from: current.position,
      to: { wellId: next.position.wellId, ring: next.position.ring, sector: next.position.sector },
      actionType: current.action!,
      burnIntensity: current.burnIntensity ?? undefined,
      sectorAdjustment: current.sectorAdjustment,
      requiresRotation: steps.length === 0 && current.position.facing !== origin.facing,
      massCost: current.massCost - next.massCost,
    };
    if (step.actionType === "well_transfer") crossesWells = true;
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
 */
export function isReachable(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  maxTurns: number,
  availableMass: number,
  allowWellTransfers: boolean = true
): boolean {
  return (
    planMovement(origin, destination, {
      mode: "fastest",
      maxTurns,
      availableMass,
      allowWellTransfers,
    }) !== null
  );
}

/**
 * All positions reachable from origin within N turns (forward BFS), keyed
 * by `${wellId}:${ring}:${sector}` with the minimum turn count.
 */
export function getReachablePositions(
  origin: OrientedPosition,
  maxTurns: number,
  availableMass: number,
  allowWellTransfers: boolean = true
): Map<string, { position: OrbitalPosition; turns: number; massCost: number }> {
  const reachable = new Map<
    string,
    { position: OrbitalPosition; turns: number; massCost: number }
  >();
  const visited = new Set<string>();
  const queue: SearchNode[] = (["prograde", "retrograde"] as Facing[]).map((facing) => ({
    position: { ...origin, facing },
    turns: 0,
    massCost: 0,
    action: null,
    burnIntensity: null,
    sectorAdjustment: 0,
    nextInPath: null,
  }));

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = positionKey(current.position);
    if (visited.has(key)) continue;
    visited.add(key);

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

    if (current.turns >= maxTurns) continue;

    for (const succ of getSuccessors(current.position, availableMass - current.massCost, {
      allowWellTransfers,
    })) {
      if (visited.has(positionKey(succ.position))) continue;
      queue.push({
        position: succ.position,
        turns: current.turns + 1,
        massCost: current.massCost + succ.massCost,
        action: succ.actionType,
        burnIntensity: succ.burnIntensity ?? null,
        sectorAdjustment: succ.sectorAdjustment,
        nextInPath: current,
      });
    }
  }

  return reachable;
}

function planSignature(plan: MovementPlan): string {
  return plan.steps
    .map((s) => `${s.actionType}:${s.to.wellId}:${s.to.ring}:${s.to.sector}:${s.sectorAdjustment}`)
    .join("|");
}

function plansAreEquivalent(a: MovementPlan, b: MovementPlan): boolean {
  return planSignature(a) === planSignature(b);
}

/**
 * Plan multiple alternative routes from origin to destination: fastest,
 * economical, and a balanced route between them when it differs from both.
 */
export function planMovementAlternatives(
  origin: OrientedPosition,
  destination: OrbitalPosition,
  options: Partial<Omit<PlannerOptions, "mode">> = {}
): MovementAlternatives | null {
  const baseOptions = { ...DEFAULT_PLANNER_OPTIONS, ...options };
  const alternatives: MovementPlan[] = [];

  const fastest = planMovement(origin, destination, { ...baseOptions, mode: "fastest" });
  if (fastest) {
    fastest.label = "⚡ Fastest";
    alternatives.push(fastest);
  }

  const economical = planMovement(origin, destination, { ...baseOptions, mode: "economical" });
  if (economical && (!fastest || !plansAreEquivalent(economical, fastest))) {
    economical.label = "💰 Economical";
    alternatives.push(economical);
  }

  if (fastest && economical && !plansAreEquivalent(fastest, economical)) {
    const balanced = planMovement(origin, destination, {
      ...baseOptions,
      mode: "economical" as PlannerMode,
      maxTurns: fastest.totalTurns + 1,
    });
    if (
      balanced &&
      !plansAreEquivalent(balanced, fastest) &&
      !plansAreEquivalent(balanced, economical) &&
      balanced.totalTurns <= economical.totalTurns &&
      balanced.totalMassCost <= fastest.totalMassCost
    ) {
      balanced.label = "⚖️ Balanced";
      alternatives.splice(1, 0, balanced);
    }
  }

  return alternatives.length === 0 ? null : { destination, alternatives };
}
