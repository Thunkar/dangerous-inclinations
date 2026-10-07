/**
 * Forward, time-layered BFS path planner.
 *
 * Given an oriented origin and a {@link PlannerTarget}, find an action
 * sequence that lands the ship on the target, where "the target" may move
 * with time (stations, drifting enemies). The search expands the ship's
 * reachable states layer by layer, one movement action per layer; at every
 * newly reached state the target's `isMatch` is consulted with the current
 * layer index.
 *
 *   Layer 0:    {origin, both facings}
 *      │  getSuccessors
 *   Layer 1:    {states after 1 action}   ── isMatch(state, 1)? → plan
 *      │  getSuccessors
 *   Layer 2:    {states after 2 actions}  ── isMatch(state, 2)? → plan
 *      │  ...
 *
 * Two modes, as the reverse search has:
 *   - "fastest": the first match is the plan (BFS layered by turn = uniform
 *     cost in turns).
 *   - "economical": every layer up to `maxTurns` is expanded and the plan is
 *     the match with the lowest fuel; ties go to fewer turns, then to the
 *     first found. A state that has arrived (matched, with the fuel asked
 *     for) is not expanded further: the ship is there.
 *
 * Why forward (not reverse, like {@link ./planner.ts:planMovement})? Reverse
 * BFS expands predecessors of a fixed destination. Dynamic targets make the
 * destination depend on the layer depth, so the seed itself would depend on
 * what we are trying to find. Forward BFS has time = layer depth, so at each
 * layer we can ask the target where it is.
 *
 * State deduplication: states are keyed by (position, facing, mass bucket,
 * turn mod target.period). With a fuel scoop, paths can come back to the
 * same position with more fuel (negative-cost edges), hence the mass
 * bucket. The time phase matters for moving targets: being at P when the
 * station is 4 sectors away is a different state from being at P when it is
 * there. Since target motion is periodic, (turn mod period) captures
 * everything that affects future matches, and the earlier visit dominates.
 * The bucket is exact (mass runs from minus the tank to the fuel aboard,
 * well inside its 64 values), so two states with one key have the same fuel
 * and the same future, and dropping the later one is sound in both modes: a
 * cheaper arrival at a state already visited has another bucket and is kept.
 *
 * Economical mode prunes one step further, by dominance: per (position,
 * facing, phase) it keeps the lowest mass of a state it carried on from, and
 * drops a state unless its mass is strictly lower. That is sound because
 * more fuel never hurts: `getSuccessors` offers every move whose cost fits
 * the fuel aboard (a superset with more), each step's cost does not depend
 * on the fuel, the tank clamp `max(mass, minMassCost)` keeps the order of two fuel levels,
 * and both the match (periodic in the turn) and the arrival-fuel check are
 * at least as easy with more fuel aboard. The state seen first was reached
 * no later, so it dominates in turns as well. An arrival is left out of it:
 * it is not expanded, so a lighter state on the same place and phase (one
 * that matched without the fuel asked for) must still carry on, where it may
 * scoop up and come round cheaper. Fastest mode does not use the prune, so
 * the plan it returns, which the bots fly, is the one it always was.
 */

import type { BurnIntensity } from "../../models/game.ts";
import type {
  OrbitalPosition,
  OrientedPosition,
  MovementPlan,
  MovementStep,
  PlannerOptions,
  MovementActionType,
} from "./types.ts";
import { samePosition } from "../../game/geometry.ts";
import { DEFAULT_PLANNER_OPTIONS, positionKeyInt } from "./types.ts";
import { getSuccessors } from "./successors.ts";
import type { PlannerTarget } from "./targets.ts";

/**
 * Forward search node. `parent` is the previous state in the executed path
 * (search direction = path direction here).
 */
interface ForwardNode {
  position: OrientedPosition;
  turns: number;
  /** Cumulative mass used (negative means net recovered via scoop). */
  massCost: number;
  /** The action taken from `parent.position` to reach `position`. */
  action: MovementActionType | null;
  burnIntensity: BurnIntensity | null;
  sectorAdjustment: number;
  parent: ForwardNode | null;
}

/**
 * Plan a movement to any target, static or dynamic, the fastest or the
 * cheapest in fuel (`options.mode`). Returns `null` if no path is found
 * within `options.maxTurns`.
 *
 * For static targets, {@link ./planner.ts:planMovement} (reverse BFS) is
 * faster; use this whenever the target moves or matches fuzzily, or the ship
 * must arrive with fuel aboard.
 */
export function planMovementToTarget(
  origin: OrientedPosition,
  target: PlannerTarget,
  options: Partial<PlannerOptions> = {}
): MovementPlan | null {
  const opts: PlannerOptions = { ...DEFAULT_PLANNER_OPTIONS, ...options };
  const period = Math.max(1, target.period);

  // Layer 0 seeds: origin with both facings (rotation is free before the
  // first movement).
  const layerZero: ForwardNode[] = (["prograde", "retrograde"] as const).map((facing) => ({
    position: { ...origin, facing },
    turns: 0,
    massCost: 0,
    action: null,
    burnIntensity: null,
    sectorAdjustment: 0,
    parent: null,
  }));

  const frontier = new Map<number, ForwardNode>();
  for (const node of layerZero) {
    frontier.set(frontierKeyInt(node.position, node.massCost, 0), node);
  }

  const economical = opts.mode === "economical";
  /** Economical mode: the lowest mass seen per (position, facing, phase). */
  const cheapest = new Map<number, number>();
  if (economical) {
    for (const node of layerZero) cheapest.set(dominanceKeyInt(node.position, 0), node.massCost);
  }
  /** Economical mode: the cheapest arrival so far. */
  let best: ForwardNode | null = null;

  let currentLayer: ForwardNode[] = layerZero;
  const availableMass = opts.availableMass;
  // Written so a full tank gives 0, not -0.
  const minMassCost = availableMass - opts.maxFuelCapacity;
  const successorOptions = {
    allowWellTransfers: opts.allowWellTransfers,
    hasFuelScoop: opts.hasFuelScoop,
    hasFuelCompressor: opts.hasFuelCompressor,
  };

  for (let turn = 0; turn < opts.maxTurns; turn++) {
    const nextLayer: ForwardNode[] = [];
    const nextTurn = turn + 1;
    const phase = nextTurn % period;

    for (const node of currentLayer) {
      const successors = getSuccessors(
        node.position,
        availableMass - node.massCost,
        successorOptions
      );
      for (const succ of successors) {
        let newMassCost = node.massCost + succ.massCost;
        // The tank can never hold more than its capacity.
        if (newMassCost < minMassCost) newMassCost = minMassCost;
        if (newMassCost > availableMass) continue;

        const key = frontierKeyInt(succ.position, newMassCost, phase);
        const existing = frontier.get(key);
        if (existing !== undefined && existing.turns <= nextTurn) continue;

        const matched = target.isMatch
          ? target.isMatch(succ.position, nextTurn)
          : samePosition(succ.position, target.positionAt(nextTurn));
        // Arriving light is not arriving: the search carries on for a path
        // that gets there with the fuel asked for.
        const enough = availableMass - newMassCost >= (opts.arrivalMass ?? 0);
        const arrived = matched && enough;

        // An arrival is not expanded, so it dominates nothing: only a state
        // the search carries on from may prune another.
        if (economical && !arrived) {
          const state = dominanceKeyInt(succ.position, phase);
          const seen = cheapest.get(state);
          if (seen !== undefined && seen <= newMassCost) continue;
          cheapest.set(state, newMassCost);
        }

        const child: ForwardNode = {
          position: succ.position,
          turns: nextTurn,
          massCost: newMassCost,
          action: succ.actionType,
          burnIntensity: succ.burnIntensity ?? null,
          sectorAdjustment: succ.sectorAdjustment,
          parent: node,
        };
        frontier.set(key, child);

        if (arrived) {
          if (!economical) return reconstructForwardPlan(child, origin, target, opts);
          // Layers run in order of turns, so strictly cheaper is the whole
          // tie-break: fewer turns, then the first found.
          if (!best || newMassCost < best.massCost) best = child;
          continue;
        }
        nextLayer.push(child);
      }
    }

    if (nextLayer.length === 0) break;
    currentLayer = nextLayer;
  }

  return best ? reconstructForwardPlan(best, origin, target, opts) : null;
}

/**
 * Key combining {@link positionKeyInt} with a mass bucket and the time
 * phase. Mass can be negative (scoop recovery); shift it into 0..63.
 */
function frontierKeyInt(position: OrientedPosition, mass: number, phase: number): number {
  const massBucket = (Math.round(mass) + 32) & 0x3f;
  return (positionKeyInt(position) * 64 + massBucket) * 32 + (phase & 0x1f);
}

/** (position, facing, phase): the state the economical mode compares fuel on. */
function dominanceKeyInt(position: OrientedPosition, phase: number): number {
  return positionKeyInt(position) * 32 + (phase & 0x1f);
}

function reconstructForwardPlan(
  endNode: ForwardNode,
  origin: OrientedPosition,
  target: PlannerTarget,
  options: PlannerOptions
): MovementPlan {
  const chain: ForwardNode[] = [];
  let cursor: ForwardNode | null = endNode;
  while (cursor) {
    chain.push(cursor);
    cursor = cursor.parent;
  }
  chain.reverse();

  const steps: MovementStep[] = [];
  let crossesWells = false;
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const curr = chain[i];
    if (curr.action === "well_transfer") crossesWells = true;
    steps.push({
      from: prev.position,
      to: { wellId: curr.position.wellId, ring: curr.position.ring, sector: curr.position.sector },
      actionType: curr.action!,
      burnIntensity: curr.burnIntensity ?? undefined,
      sectorAdjustment: curr.sectorAdjustment,
      // Rotation is free; the first step needs one when its facing differs
      // from the ship's actual facing.
      requiresRotation: i === 1 && prev.position.facing !== origin.facing,
      massCost: curr.massCost - prev.massCost,
    });
  }

  const last = steps[steps.length - 1];
  const destination: OrbitalPosition = last ? last.to : target.positionAt(endNode.turns);
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
