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
  REACTOR_CAPACITY,
  STARTING_HIT_POINTS,
} from "../models/game.ts";
import type { Subsystem, SubsystemId, SubsystemType } from "../models/subsystems.ts";
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
    reactor: { totalCapacity: REACTOR_CAPACITY, availableEnergy: REACTOR_CAPACITY },
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

export function getSubsystemsOfType(ship: ShipState, type: SubsystemType): Subsystem[] {
  return ship.subsystems.filter((s) => s.type === type);
}

export function hasSubsystemType(ship: ShipState, type: SubsystemType): boolean {
  return ship.subsystems.some((s) => s.type === type);
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

/** Heat the ship can shed each turn: base plus working radiators. */
export function getDissipationCapacity(
  subsystems: ReadonlyArray<Pick<Subsystem, "type" | "isBroken">>
): number {
  const bonus = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0;
  const count = subsystems.filter((s) => s.type === "radiator" && !s.isBroken).length;
  return DEFAULT_DISSIPATION_CAPACITY + count * bonus;
}

/** Critical chance in percentage points: base plus each powered, working sensor array. */
export function getEffectiveCriticalChance(subsystems: ReadonlyArray<Subsystem>): number {
  const bonus = SUBSYSTEM_CONFIGS.sensor_array.passiveEffect?.criticalChanceBonus ?? 0;
  const count = subsystems.filter(
    (s) => s.type === "sensor_array" && s.isPowered && !s.isBroken
  ).length;
  return BASE_CRITICAL_CHANCE + count * bonus;
}

/** True if a working passive system discounts jump fuel (fuel compressor). */
export function hasWorkingCompressor(ship: ShipState): boolean {
  return ship.subsystems.some(
    (s) => !s.isBroken && getSubsystemConfig(s.type).passiveEffect?.refuelOnWellTransfer === true
  );
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
 * Use a subsystem: mark it used this turn, add heat equal to its allocated
 * energy (if it generates heat on use) and reveal it. Returns the heat added.
 */
export function useSubsystem(
  ship: ShipState,
  playerId: string,
  id: SubsystemId,
  reason: RevealReason = "fired"
): ShipChange & { heat: number } {
  const sub = findSubsystem(ship, id);
  if (!sub) return { ship, events: [], heat: 0 };
  const config = getSubsystemConfig(sub.type);
  const heat = config.generatesHeatOnUse ? sub.allocatedEnergy : 0;
  let next = updateSubsystem(ship, id, { usedThisTurn: true });
  next = addHeat(next, heat);
  const revealed = revealSubsystem(next, playerId, id, reason);
  return { ship: revealed.ship, events: revealed.events, heat };
}

/**
 * Break a subsystem (critical hit). Its energy returns to the reactor and
 * becomes heat; the tile is revealed. No-op if already broken or missing.
 */
export function breakSubsystem(
  ship: ShipState,
  playerId: string,
  id: SubsystemId
): ShipChange & { energyLost: number } {
  const sub = findSubsystem(ship, id);
  if (!sub || sub.isBroken) return { ship, events: [], energyLost: 0 };
  const energyLost = sub.allocatedEnergy;
  let next: ShipState = {
    ...ship,
    reactor: {
      ...ship.reactor,
      availableEnergy: Math.min(
        ship.reactor.totalCapacity,
        ship.reactor.availableEnergy + energyLost
      ),
    },
  };
  next = updateSubsystem(next, id, {
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
    subsystems: ship.subsystems.map((s) => (s.usedThisTurn ? { ...s, usedThisTurn: false } : s)),
  };
}

/** Set of tile ids that are face-up on this ship. */
export function revealedSubsystemIds(ship: ShipState): SubsystemId[] {
  return ship.subsystems.filter((s) => s.isRevealed).map((s) => s.id);
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
