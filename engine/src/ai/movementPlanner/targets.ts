/**
 * Target abstraction for the movement planner.
 *
 * Targets describe **where** the planner should try to land. They can be
 * **static** (a fixed orbital position — e.g. "Black-Hole R3 S5") or
 * **dynamic** (a position that varies with time — e.g. an orbiting station,
 * or a moving enemy ship). The planner's forward search asks the target
 * "are we matching at this turn?" at each layer of expansion, so dynamic
 * targets just have to answer that question.
 *
 * Time inside the planner is measured in **bot turns** (= rounds in the
 * 4-player game): layer 0 is the origin (no action taken), layer k (k ≥ 1)
 * is the ship's state immediately after taking k actions. Cargo / collision
 * checks fire at the end of each bot action, so {@link PlannerTarget.isMatch}
 * is consulted on every reachable state at layer ≥ 1.
 */

import { SECTORS_PER_RING } from "../../models/rings.ts";
import type { OrbitalPosition } from "./types.ts";
import { positionsMatch } from "./types.ts";

export interface PlannerTarget {
  /**
   * Where the target sits at planner turn `turn`.
   *
   * - `turn = 0` represents the moment **before** the ship takes its first
   *   action. For dynamic targets this should be their current position.
   * - `turn = k ≥ 1` represents the moment the ship's k-th action completes
   *   and its match-check fires.
   *
   * The default {@link isMatch} consults this; custom matchers may override.
   */
  positionAt(turn: number): OrbitalPosition;

  /**
   * Whether the ship being at `pos` at planner turn `turn` counts as a
   * "match". Defaults to a strict spatial equality with `positionAt(turn)`,
   * which is correct for stations and intercept points. Override for fuzzy
   * targets (e.g. "within ±3 sectors of an enemy ship in the same ring").
   */
  isMatch?(pos: OrbitalPosition, turn: number): boolean;

  /** Optional human-readable description for plan logs / debug dumps. */
  describe?(): string;
}

/**
 * Wrap a fixed `OrbitalPosition` as a static target. The planner sees the
 * destination as time-invariant — same behavior as the legacy reverse BFS
 * planner's destination handling.
 */
export function staticTarget(pos: OrbitalPosition): PlannerTarget {
  return {
    positionAt: () => pos,
    isMatch: (p) => positionsMatch(p, pos),
    describe: () => `${pos.wellId} R${pos.ring} S${pos.sector}`,
  };
}

/**
 * A target orbiting at a constant sector velocity, advancing exactly once
 * per **round** in game time. Stations are the canonical example.
 *
 * Round-end (and thus the orbit advance) happens **after** every player has
 * acted, so the order within one bot's perspective is:
 *
 *   1. Bot's own action executes
 *   2. Match check fires (cargo pickup / delivery, etc.)
 *   3. Other players act in sequence
 *   4. Round ends — station advances by `sectorsPerRound`
 *   5. Repeat: bot's next action starts here
 *
 * That means at the bot's k-th action (k ≥ 1), the station has advanced
 * exactly `k − 1` times from its initial position:
 *
 * ```text
 *   layer 0    →  start                       (origin, before any action)
 *   layer 1    →  start                       (round hasn't ended yet)
 *   layer 2    →  start +  1 × sectorsPerRound
 *   layer k    →  start + (k − 1) × sectorsPerRound
 * ```
 *
 * This matches the engine's {@link updateStationPositions} call site: it
 * fires only when the active-player rotation wraps to player 0
 * (`isNewRound`), which always sits *after* the previous bot's match check.
 */
export function orbitingTarget(
  start: OrbitalPosition,
  sectorsPerRound: number,
  sectorsInRing: number = SECTORS_PER_RING,
): PlannerTarget {
  const positionAt = (turn: number): OrbitalPosition => {
    const advances = Math.max(0, turn - 1);
    const wrapped =
      ((start.sector + sectorsPerRound * advances) % sectorsInRing +
        sectorsInRing) %
      sectorsInRing;
    return { ...start, sector: wrapped };
  };

  return {
    positionAt,
    isMatch: (pos, turn) => positionsMatch(pos, positionAt(turn)),
    describe: () =>
      `orbit@${start.wellId}R${start.ring}S${start.sector}+${sectorsPerRound}/round`,
  };
}
