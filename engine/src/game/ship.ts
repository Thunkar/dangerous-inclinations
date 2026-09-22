/**
 * Ship construction and subsystem helpers.
 *
 * All functions are pure: they return a new ShipState and, where something
 * visible happened, the event drafts describing it.
 */
import type { Facing, Position, ShipLoadout, ShipState } from "../models/game.ts";
import {
  BASE_CRITICAL_CHANCE,
  DEFAULT_DISSIPATION_CAPACITY,
  DEFAULT_LOADOUT,
  STARTING_HIT_POINTS,
} from "../models/game.ts";
import type { Subsystem, SubsystemId } from "../models/subsystems.ts";
import { SUBSYSTEM_CONFIGS, getSubsystemConfig, getMissileStats } from "../models/subsystems.ts";
import type { EventDraft, RevealReason } from "../models/events.ts";
import { createSubsystemsFromLoadout, calculateShipStatsFromLoadout } from "./loadout.ts";

export function createInitialShipState(
  position: Position & { facing: Facing },
  loadout: ShipLoadout = DEFAULT_LOADOUT,
  overrides: Partial<ShipState> = {}
): ShipState {
  const stats = calculateShipStatsFromLoadout(loadout);
  return {
    wellId: position.wellId,
    ring: position.ring,
    sector: position.sector,
    facing: position.facing,
    reactionMass: stats.reactionMass,
    hitPoints: STARTING_HIT_POINTS,
    maxHitPoints: STARTING_HIT_POINTS,
    subsystems: createSubsystemsFromLoadout(loadout),
    heat: { currentHeat: 0 },
    loadout,
    ...overrides,
  };
}

export function isDestroyed(ship: ShipState): boolean {
  return ship.hitPoints <= 0;
}

export function findSubsystem(ship: ShipState, id: SubsystemId): Subsystem | undefined {
  return ship.subsystems.find((s) => s.id === id);
}

export function updateSubsystem(
  ship: ShipState,
  id: SubsystemId,
  patch: Partial<Subsystem> | ((s: Subsystem) => Partial<Subsystem>)
): ShipState {
  return {
    ...ship,
    subsystems: ship.subsystems.map((s) =>
      s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s
    ),
  };
}

/** Heat the ship dissipates at every check: base plus working radiators. */
export function getDissipationCapacity(
  subsystems: ReadonlyArray<Pick<Subsystem, "type" | "isBroken">>
): number {
  const bonus = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0;
  const count = subsystems.filter((s) => s.type === "radiator" && !s.isBroken).length;
  return DEFAULT_DISSIPATION_CAPACITY + count * bonus;
}

/**
 * **The whole energy rule: every cube on the loadout is a point of heat at its
 * owner's check.**
 *
 * It does not matter how the cubes got there. An action puts them on the tile
 * it uses, and a `power` action puts them on a shield, a rack or a sensor; both
 * are still there when the check runs, so firing a railgun costs its four and
 * holding a wall up costs the wall. They stay on until the owner's next turn
 * clears the loadout (`clearLoadout`), so each turn's energy is billed at
 * exactly one check. There is nothing else to know and nothing a tile can do
 * that is free.
 *
 * A shield that absorbs spends its cubes, so a wall hit on somebody else's turn
 * has less on it when a critical finds it, and the heat of what it absorbed
 * lands on the track directly (`damage.ts`).
 */
export function heatFromCubes(subsystems: ReadonlyArray<Subsystem>): number {
  // The cubes themselves, not `isPowered`: a tile is hot because it is carrying
  // them, and a broken one dumped its as heat when it broke.
  return subsystems
    .filter((s) => !s.isBroken)
    .reduce((sum, s) => sum + s.allocatedEnergy, 0);
}

/** Critical chance in percentage points: base plus each powered, working sensor array. */
export function getEffectiveCriticalChance(subsystems: ReadonlyArray<Subsystem>): number {
  const bonus = SUBSYSTEM_CONFIGS.sensor_array.passiveEffect?.criticalChanceBonus ?? 0;
  const count = subsystems.filter(
    (s) => s.type === "sensor_array" && s.isPowered && !s.isBroken
  ).length;
  return BASE_CRITICAL_CHANCE + count * bonus;
}

/**
 * The compressors paying for a lane: the tile is passive, so it does its job
 * while it is aboard and unbroken.
 */
export function workingCompressors(ship: ShipState): Subsystem[] {
  return ship.subsystems.filter(
    (s) => !s.isBroken && getSubsystemConfig(s.type).passiveEffect?.refuelOnWellTransfer === true
  );
}

/** True if a working system cheapens jump fuel (fuel compressor). */
export function hasWorkingCompressor(ship: ShipState): boolean {
  return workingCompressors(ship).length > 0;
}

export function addHeat(ship: ShipState, amount: number): ShipState {
  if (amount <= 0) return ship;
  return { ...ship, heat: { currentHeat: ship.heat.currentHeat + amount } };
}

export interface ShipChange {
  ship: ShipState;
  events: EventDraft[];
}

/** Flip a tile face-up if it isn't already. */
export function revealSubsystem(
  ship: ShipState,
  playerId: string,
  id: SubsystemId,
  reason: RevealReason
): ShipChange {
  const sub = findSubsystem(ship, id);
  if (!sub || sub.isRevealed) return { ship, events: [] };
  return {
    ship: updateSubsystem(ship, id, { isRevealed: true }),
    events: [
      { type: "subsystem_revealed", playerId, subsystemId: id, subsystemType: sub.type, reason },
    ],
  };
}

/**
 * The cubes an action puts on the tile it uses. Every tile but the engines has
 * one legal figure, which is why nobody places cubes: the engines take the
 * burn's, and the caller passes it.
 */
export function drawFor(type: Subsystem["type"], requested?: number): number {
  const config = getSubsystemConfig(type);
  if (config.maxEnergy === 0) return 0;
  return Math.min(config.maxEnergy, Math.max(config.minEnergy, requested ?? config.minEnergy));
}

/**
 * Power a tile for the action about to use it. Nothing can refuse it: there is
 * no reactor to run dry, only the heat the cubes will cost at the check, so a
 * ship may light everything it owns and pay in hull for it.
 *
 * The loadout is clear when its owner's turn starts, so on that turn this
 * always adds the draw. A rack intercepting on somebody else's turn is already
 * holding its cubes (it was powered, or it fired), and it adds nothing.
 */
export function powerForUse(ship: ShipState, id: SubsystemId, draw: number): ShipState {
  const sub = findSubsystem(ship, id);
  if (!sub || sub.allocatedEnergy >= draw) return ship;
  return updateSubsystem(ship, id, { allocatedEnergy: draw, isPowered: true });
}

/**
 * Use a subsystem: power it for the action, mark it used this turn and reveal
 * it. The cubes stay on the tile until its owner's next turn, so a rack that
 * fired is up and a sensor that scanned widens the range of every shot after.
 *
 * Returns the cubes this use **added**, which is what it costs its owner and
 * what the event reports. Heat is not charged here: a tile's cubes are its
 * heat at the check wherever they came from (see `heat.ts`).
 *
 * `draw` is for the engines, whose cubes are the burn's. Everything else has
 * one legal figure and takes it from its tile.
 */
export function useSubsystem(
  ship: ShipState,
  playerId: string,
  id: SubsystemId,
  reason: RevealReason = "fired",
  draw?: number
): ShipChange & { heat: number } {
  const sub = findSubsystem(ship, id);
  if (!sub) return { ship, events: [], heat: 0 };
  let next = powerForUse(ship, id, drawFor(sub.type, draw));
  const heat = findSubsystem(next, id)!.allocatedEnergy - sub.allocatedEnergy;
  next = updateSubsystem(next, id, { usedThisTurn: true });
  const revealed = revealSubsystem(next, playerId, id, reason);
  return { ship: revealed.ship, events: revealed.events, heat };
}

/**
 * The start of a player's own turn: every tile on their loadout goes back to
 * no energy. What they used or powered last turn has been working on everyone
 * else's turns since, and was billed at their last check; this turn's energy
 * is whatever this turn's actions put on (RULES §Energy and Heat).
 */
export function clearLoadout(ship: ShipState): ShipState {
  if (!ship.subsystems.some((s) => s.allocatedEnergy !== 0 || s.isPowered)) return ship;
  return {
    ...ship,
    subsystems: ship.subsystems.map((s) =>
      s.allocatedEnergy !== 0 || s.isPowered ? { ...s, allocatedEnergy: 0, isPowered: false } : s
    ),
  };
}

/**
 * Break a subsystem (critical hit). Its cubes are dumped into its owner's heat
 * and the tile goes dark and face-up. No-op if already broken or missing.
 */
export function breakSubsystem(
  ship: ShipState,
  playerId: string,
  id: SubsystemId
): ShipChange & { energyLost: number } {
  const sub = findSubsystem(ship, id);
  if (!sub || sub.isBroken) return { ship, events: [], energyLost: 0 };
  const energyLost = sub.allocatedEnergy;
  let next: ShipState = updateSubsystem(ship, id, {
    allocatedEnergy: 0,
    isPowered: false,
    isBroken: true,
    isRevealed: true,
  });
  next = addHeat(next, energyLost);
  const events: EventDraft[] = [];
  if (!sub.isRevealed) {
    events.push({
      type: "subsystem_revealed",
      playerId,
      subsystemId: id,
      subsystemType: sub.type,
      reason: "broken",
    });
  }
  events.push({
    type: "subsystem_broken",
    playerId,
    subsystemId: id,
    subsystemType: sub.type,
    energyLost,
  });
  return { ship: next, events, energyLost };
}

/** Repair every broken subsystem (docking). Returns the ids repaired. */
export function repairAllSubsystems(ship: ShipState): { ship: ShipState; repaired: SubsystemId[] } {
  const repaired = ship.subsystems.filter((s) => s.isBroken).map((s) => s.id);
  if (repaired.length === 0) return { ship, repaired };
  return {
    ship: {
      ...ship,
      subsystems: ship.subsystems.map((s) => (s.isBroken ? { ...s, isBroken: false } : s)),
    },
    repaired,
  };
}

/** Refill missile ammunition (docking). */
export function reloadMissiles(ship: ShipState): { ship: ShipState; reloaded: boolean } {
  const max = getMissileStats().maxAmmo;
  const needs = ship.subsystems.some((s) => s.type === "missiles" && (s.ammo ?? 0) < max);
  if (!needs) return { ship, reloaded: false };
  return {
    ship: {
      ...ship,
      subsystems: ship.subsystems.map((s) => (s.type === "missiles" ? { ...s, ammo: max } : s)),
    },
    reloaded: true,
  };
}

export function resetSubsystemUsage(ship: ShipState): ShipState {
  return {
    ...ship,
    subsystems: ship.subsystems.map((s) =>
      s.usedThisTurn || s.rollsThisTurn > 0 ? { ...s, usedThisTurn: false, rollsThisTurn: 0 } : s
    ),
  };
}

// ---------------------------------------------------------------------------
// Port/starboard
// ---------------------------------------------------------------------------

export type ShipSide = "port" | "starboard";
export type RingDirection = "outward" | "inward";

/** Side slots 0-1 are port, 2-3 starboard. Null for fixed and forward systems. */
export function getSubsystemSide(subsystem: Subsystem): ShipSide | null {
  if (subsystem.slotGroup !== "side" || subsystem.slotIndex === undefined) return null;
  return subsystem.slotIndex <= 1 ? "port" : "starboard";
}

/** Prograde: port fires outward, starboard inward. Retrograde flips them. */
export function getSideFiringDirection(side: ShipSide, facing: Facing): RingDirection {
  if (facing === "prograde") return side === "port" ? "outward" : "inward";
  return side === "port" ? "inward" : "outward";
}

export function isRingDirectionValid(
  attackerRing: number,
  targetRing: number,
  direction: RingDirection
): boolean {
  return direction === "outward" ? targetRing > attackerRing : targetRing < attackerRing;
}
