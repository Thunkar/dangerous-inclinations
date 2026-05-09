/**
 * Forward, time-layered BFS path planner.
 *
 * Given an oriented origin and a {@link PlannerTarget}, find the shortest
 * action sequence that lands the ship on the target — where "the target"
 * may move with time (stations, intercept points, moving enemies). The
 * search expands the ship's reachable states layer by layer, where each
 * layer is one bot action; at every newly reached state the target's
 * `isMatch` is consulted with the current layer index. The first match
 * is the optimal plan (BFS layered by turn = uniform cost in turns).
 *
 *
 *                ┌─────────────────────────────────────────────────┐
 *                │                                                 │
 *                │  Layer 0:    {origin}                           │
 *                │     │                                           │
 *                │     ▼ getSuccessors                             │
 *                │  Layer 1:    {states after 1 action}            │
 *                │     │   ── isMatch(state, 1)? → return plan     │
 *                │     ▼ getSuccessors                             │
 *                │  Layer 2:    {states after 2 actions}           │
 *                │     │   ── isMatch(state, 2)? → return plan     │
 *                │     ▼ ...                                       │
 *                │  Layer K:    {states after K actions}           │
 *                │                                                 │
 *                └─────────────────────────────────────────────────┘
 *
 *
 * Why forward (not reverse, like {@link ./planner.ts:planMovement})?
 *
 * - Reverse BFS expands predecessors of the destination. That requires the
 *   destination to be **fixed** so you can seed a single starting layer.
 * - Dynamic targets (e.g. orbiting stations) make the destination depend
 *   on the layer depth — so the seed itself depends on what we're trying
 *   to find. Forward BFS naturally has time = layer depth: at each layer
 *   we know exactly how many turns have passed, so we can ask the target
 *   `where are you now?` and check for a match.
 *
 * State deduplication: positions are keyed by (wellId, ring, sector,
 * facing) plus a coarse mass bucket. With a fuel scoop, paths can come
 * back to the same spatial position with *more* fuel (negative-cost edges
 * make plain shortest-path break), so we keep the Pareto frontier per
 * (position, mass-bucket) and drop dominated entries.
 */

import { MAX_REACTION_MASS } from "../../models/game.ts";
import type {
  OrbitalPosition,
  OrientedPosition,
  MovementPlan,
  MovementStep,
  PlannerOptions,
  MovementActionType,
} from "./types.ts";
import { positionKeyInt } from "./types.ts";
import type { BurnIntensity } from "../../models/game.ts";
import { getSuccessors } from "./successors.ts";
import type { PlannerTarget } from "./targets.ts";

/**
 * Forward search node. We track parent for reconstruction; this is the
 * **previous** state in the executed path (search direction = path
 * direction here).
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
 * Plan a movement to any target — static or dynamic. Returns `null` if no
 * path is found within `options.maxTurns`.
 *
 * For static targets, prefer the legacy {@link ./planner.ts:planMovement}
 * (reverse BFS): both produce optimal plans, but reverse BFS is faster
 * when the destination is fixed because it prunes the search space from
 * the goal end. Use this function whenever the target is dynamic, or
 * whenever a uniform planning API is desirable (UI, scripted scenarios).
 *
 * @param origin - Oriented starting position. Both facings will be tried at
 *   layer 0 since rotation is free.
 * @param target - {@link PlannerTarget}; usually built via
 *   {@link ./targets.ts:staticTarget} or
 *   {@link ./targets.ts:orbitingTarget}.
 * @param options - Mass budget, well-transfer policy, scoop, etc.
 * @returns A {@link MovementPlan} or `null` if no valid path.
 */
export function planMovementToTarget(
  origin: OrientedPosition,
  target: PlannerTarget,
  options: Partial<PlannerOptions> = {},
): MovementPlan | null {
  const opts: PlannerOptions = { ...DEFAULT_OPTIONS, ...options };

  // Layer 0 seeds: origin with both facings (rotation is free, so the
  // search treats them as equally good starting points). The first match
  // check at layer 1 will inherit whichever facing makes it cheaper.
  const layerZero: ForwardNode[] = [];
  for (const facing of ["prograde", "retrograde"] as const) {
    layerZero.push({
      position: { ...origin, facing },
      turns: 0,
      massCost: 0,
      action: null,
      burnIntensity: null,
      sectorAdjustment: 0,
      parent: null,
    });
  }

  // Visited frontier: int-encoded (position + mass-bucket) → best node.
  // Two paths to the same spatial position with the same mass are
  // equivalent; keep the one with fewer turns. Negative edge weights from
  // scoop coast mean a longer path can have *less* mass cost, so we keep
  // both if neither dominates. The integer key is materially faster than
  // a string key on this hot path — see {@link positionKeyInt}.
  const frontier = new Map<number, ForwardNode>();
  for (const node of layerZero) {
    frontier.set(frontierKeyInt(node.position, node.massCost), node);
  }

  let currentLayer: ForwardNode[] = layerZero;
  const maxTurns = opts.maxTurns;
  const availableMass = opts.availableMass;
  const minMassCost = -(opts.maxFuelCapacity - availableMass);
  const hasIsMatch = target.isMatch != null;

  for (let turn = 0; turn < maxTurns; turn++) {
    const nextLayer: ForwardNode[] = [];

    for (const node of currentLayer) {
      const successors = getSuccessors(
        node.position,
        availableMass - node.massCost,
        {
          allowWellTransfers: opts.allowWellTransfers,
          hasFuelScoop: opts.hasFuelScoop,
        },
      );

      const nodeMassCost = node.massCost;
      const nextTurn = turn + 1;
      for (let s = 0; s < successors.length; s++) {
        const succ = successors[s];
        let newMassCost = nodeMassCost + succ.massCost;
        // Clamp recovered mass so the ship can never carry more than the
        // tank holds (initial fuel + recovered ≤ maxFuelCapacity).
        if (newMassCost < minMassCost) newMassCost = minMassCost;
        if (newMassCost > availableMass) continue;

        // Dedup: skip if a strictly-better node already reached this
        // (position, mass-bucket).
        const key = frontierKeyInt(succ.position, newMassCost);
        const existing = frontier.get(key);
        if (existing !== undefined && existing.turns <= nextTurn) continue;

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
        nextLayer.push(child);

        // Goal check: did we just land on (or "match") the target this
        // turn? Spatial check is the default; targets may override.
        const matched = hasIsMatch
          ? target.isMatch!(child.position, nextTurn)
          : positionsEqual(child.position, target.positionAt(nextTurn));
        if (matched) {
          return reconstructForwardPlan(child, origin, target, opts);
        }
      }
    }

    if (nextLayer.length === 0) return null;
    currentLayer = nextLayer;
  }

  return null;
}

/**
 * Bit-packed key combining {@link positionKeyInt} (oriented position) with
 * a coarse mass bucket. We push the position into the high bits so the
 * mass bucket sits in low bits where small integers live in V8's smi range.
 */
function frontierKeyInt(position: OrientedPosition, mass: number): number {
  // Mass can be negative (fuel scoop recovery). Shift by 32 so the bucket
  // is non-negative, then put it in low 6 bits (range 0-63 covers full
  // recovery + tank size for any realistic loadout).
  const massBucket = (Math.round(mass) + 32) & 0x3f;
  return positionKeyInt(position) * 64 + massBucket;
}


function positionsEqual(a: OrbitalPosition, b: OrbitalPosition): boolean {
  return a.wellId === b.wellId && a.ring === b.ring && a.sector === b.sector;
}

function reconstructForwardPlan(
  endNode: ForwardNode,
  origin: OrientedPosition,
  target: PlannerTarget,
  options: PlannerOptions,
): MovementPlan {
  // Walk parent chain back to origin. Each link's `action` describes the
  // transition INTO that node from its parent — so the path written
  // origin → … → endNode preserves action order without any reversal.
  const chain: ForwardNode[] = [];
  let cursor: ForwardNode | null = endNode;
  while (cursor) {
    chain.push(cursor);
    cursor = cursor.parent;
  }
  chain.reverse(); // now [origin, step1, step2, …, endNode]

  const steps: MovementStep[] = [];
  let crossesWells = false;
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const curr = chain[i];
    if (curr.action === "well_transfer") crossesWells = true;
    steps.push({
      from: prev.position,
      to: {
        wellId: curr.position.wellId,
        ring: curr.position.ring,
        sector: curr.position.sector,
      },
      actionType: curr.action!,
      burnIntensity: curr.burnIntensity ?? undefined,
      sectorAdjustment: curr.sectorAdjustment,
      // Rotation is free; the planner doesn't model rotation as its own
      // step. Mark the first step as needing rotation when its required
      // facing differs from the ship's actual current facing.
      requiresRotation:
        i === 1 &&
        prev.position.facing !== origin.facing,
      massCost: curr.massCost - prev.massCost,
    });
  }

  return {
    origin,
    destination: target.positionAt(endNode.turns),
    steps,
    totalMassCost: endNode.massCost,
    totalTurns: endNode.turns,
    crossesWells,
    mode: options.mode,
  };
}
