/**
 * Target abstraction for the movement planner.
 *
 * Targets describe where the planner should try to land. They can be
 * static (a fixed orbital position) or dynamic (a position that varies with
 * time: an orbiting station, a drifting enemy ship). The forward search asks
 * the target "are we matching at this turn?" at each layer of expansion, so
 * dynamic targets just have to answer that question.
 *
 * Time inside the planner is measured in bot turns (= rounds): layer 0 is
 * the origin (no action taken), layer k (k ≥ 1) is the ship's state right
 * after its k-th movement. Docking, scans and firing all resolve during the
 * bot's own turn, so {@link PlannerTarget.isMatch} is consulted on every
 * reachable state at layer ≥ 1.
 */

import { SECTORS_PER_RING } from "../../models/rings.ts";
import { ringVelocity, samePosition, sectorDistance, wrapSector } from "../../game/geometry.ts";
import type { OrbitalPosition } from "./types.ts";

export interface PlannerTarget {
  /**
   * Where the target sits at planner turn `turn`.
   *
   * - `turn = 0` is the moment before the ship takes its first action.
   * - `turn = k ≥ 1` is the moment the ship's k-th action completes.
   */
  positionAt(turn: number): OrbitalPosition;

  /**
   * Whether the ship being at `pos` at planner turn `turn` counts as a
   * match. Defaults to spatial equality with `positionAt(turn)`. Override
   * for fuzzy targets ("within ±3 sectors of the enemy on my ring").
   */
  isMatch?(pos: OrbitalPosition, turn: number): boolean;

  /**
   * Number of turns after which the target's motion repeats. The forward
   * BFS dedupes search states on (position, mass, turn mod period): two
   * visits to the same position with the same phase have identical futures,
   * so the earlier one dominates. Static targets have period 1 (time is
   * irrelevant); a station advancing 4 sectors per round has period 6.
   */
  period: number;

  /** Optional human-readable description for plan logs / debug dumps. */
  describe?(): string;
}

/** Turns until a body drifting `sectorsPerRound` per round is back where it started. */
export function driftPeriod(
  sectorsPerRound: number,
  sectorsInRing: number = SECTORS_PER_RING
): number {
  const v = Math.abs(sectorsPerRound) % sectorsInRing;
  if (v === 0) return 1;
  let a = sectorsInRing;
  let b = v;
  while (b !== 0) [a, b] = [b, a % b];
  return sectorsInRing / a;
}

/**
 * Wrap a fixed position as a static target.
 */
export function staticTarget(pos: OrbitalPosition): PlannerTarget {
  return {
    positionAt: () => pos,
    isMatch: (p) => samePosition(p, pos),
    period: 1,
    describe: () => `${pos.wellId} R${pos.ring} S${pos.sector}`,
  };
}

/**
 * Sector of a body that started at `start` and advances `sectorsPerRound`
 * once per round, at the bot's `turn`-th action.
 *
 * Round-end (and thus the advance) happens after every player has acted:
 *
 *   1. Bot's own action executes and resolves (docking, firing, scanning)
 *   2. Other players act
 *   3. Round ends: stations advance; opponents have each drifted once
 *
 * So at the bot's k-th action (k ≥ 1) the body has advanced k − 1 times.
 */
export function orbitSectorAt(
  start: OrbitalPosition,
  sectorsPerRound: number,
  turn: number
): number {
  return wrapSector(start.sector + sectorsPerRound * Math.max(0, turn - 1));
}

/**
 * A target orbiting at a constant sector velocity, advancing exactly once
 * per round. Stations are the canonical example.
 */
export function orbitingTarget(
  start: OrbitalPosition,
  sectorsPerRound: number,
  sectorsInRing: number = SECTORS_PER_RING
): PlannerTarget {
  const positionAt = (turn: number): OrbitalPosition => ({
    ...start,
    sector: wrapSector(start.sector + sectorsPerRound * Math.max(0, turn - 1)),
  });
  return {
    positionAt,
    isMatch: (pos, turn) => samePosition(pos, positionAt(turn)),
    period: driftPeriod(sectorsPerRound, sectorsInRing),
    describe: () => `orbit@${start.wellId}R${start.ring}S${start.sector}+${sectorsPerRound}/round`,
  };
}

/**
 * A drifting ship (assumed to coast on its ring) that the planner wants to
 * get near: same well, same ring, within `sectors` sectors. Used for scans
 * and for closing to weapon range.
 */
export function nearDriftingShip(start: OrbitalPosition, sectors: number): PlannerTarget {
  const velocity = ringVelocity(start.wellId, start.ring);
  const positionAt = (turn: number): OrbitalPosition => ({
    ...start,
    sector: orbitSectorAt(start, velocity, turn),
  });
  return {
    positionAt,
    isMatch: (pos, turn) => {
      const t = positionAt(turn);
      return (
        pos.wellId === t.wellId &&
        pos.ring === t.ring &&
        sectorDistance(pos.sector, t.sector) <= sectors
      );
    },
    period: driftPeriod(velocity),
    describe: () => `within ${sectors} of ${start.wellId} R${start.ring} S${start.sector}`,
  };
}

/**
 * Any sector of a given ring in a given well (e.g. black hole ring 1 for a
 * survey).
 */
export function anySectorOnRing(wellId: string, ring: number): PlannerTarget {
  return {
    positionAt: () => ({ wellId, ring, sector: 0 }),
    isMatch: (pos) => pos.wellId === wellId && pos.ring === ring,
    period: 1,
    describe: () => `${wellId} R${ring} (any sector)`,
  };
}
