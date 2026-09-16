/**
 * Game events: the structured record of what happened during a turn.
 *
 * Every rule effect emits an event. The turn log shown to players, the stats
 * gathered by the simulator and the animations in the UI are all derived from
 * events, never from diffing states or parsing strings.
 *
 * Visibility: most events are public (everyone at the table saw it), including
 * energy allocation (cubes sit on the tiles in the open). An event with
 * `privateTo` is only delivered to those players — e.g. what a scan revealed
 * is yours alone.
 */

import type { Position, Facing, BurnIntensity } from "./game.ts";
import type { SubsystemId, SubsystemType, WeaponType } from "./subsystems.ts";
import type { CargoKind, Mission } from "./missions.ts";
import type { HitRollResult } from "./weapons.ts";

interface Base {
  turn: number;
  /** Player ids allowed to see this event. Omitted = public. */
  privateTo?: string[];
}

export type RevealReason =
  | "fired"
  | "intercepted"
  | "absorbed"
  | "scanned"
  | "critical_bonus"
  | "prevented_heat_damage"
  | "refunded_jump"
  | "broken";

export type GameEvent =
  | (Base & { type: "respawned"; playerId: string; position: Position })
  | (Base & {
      type: "energy_allocated";
      playerId: string;
      subsystemId: SubsystemId;
      amount: number;
    })
  | (Base & {
      type: "energy_deallocated";
      playerId: string;
      subsystemId: SubsystemId;
      amount: number;
    })
  | (Base & { type: "rotated"; playerId: string; facing: Facing })
  | (Base & {
      type: "coasted";
      playerId: string;
      to: Position;
      scooped: boolean;
      heat: number;
      /** Docked at a station: the ship holds its berth instead of drifting. */
      moored?: boolean;
      /**
       * Nobody was flying: a recovering ship carried along by its orbit on a
       * turn it could not act in (RULES §A Turn). It never scoops or heats.
       */
      recovering?: boolean;
    })
  | (Base & { type: "fuel_scooped"; playerId: string; amount: number })
  | (Base & {
      type: "burned";
      playerId: string;
      intensity: BurnIntensity;
      from: Position;
      to: Position;
      massSpent: number;
      heat: number;
    })
  | (Base & {
      type: "jumped";
      playerId: string;
      from: Position;
      to: Position;
      /** Sectors the arrival was phased by inside the arrival arc (1 fuel each). */
      sectorAdjustment: number;
      /** Fuel spent, phasing included; 0 when a compressor refunded the jump. */
      massSpent: number;
      refunded: boolean;
      heat: number;
    })
  | (Base & {
      type: "weapon_fired";
      attackerId: string;
      targetId: string;
      subsystemId: SubsystemId;
      weaponType: WeaponType;
      heat: number;
    })
  | (Base & {
      type: "attack_resolved";
      attackerId: string;
      targetId: string;
      weaponType: WeaponType;
      roll: number;
      result: HitRollResult;
      damage: number;
      toHull: number;
      toHeat: number;
      targetHullAfter: number;
    })
  | (Base & {
      type: "recoil";
      playerId: string;
      compensated: boolean;
      to?: Position;
      massSpent: number;
      heat: number;
    })
  | (Base & {
      type: "missile_launched";
      ownerId: string;
      missileId: string;
      targetId: string;
      at: Position;
      criticalTarget: SubsystemId;
    })
  | (Base & {
      type: "missile_moved";
      missileId: string;
      ownerId: string;
      to: Position;
      movesLeft: number;
    })
  | (Base & {
      type: "missile_intercepted";
      missileId: string;
      ownerId: string;
      targetId: string;
      roll: number;
      /** 2+ destroys the missile; on a 1 the rack fired and missed. */
      destroyed: boolean;
      heat: number;
    })
  | (Base & { type: "missile_expired"; missileId: string; ownerId: string; at: Position })
  | (Base & {
      type: "subsystem_broken";
      playerId: string;
      subsystemId: SubsystemId;
      subsystemType: SubsystemType;
      energyLost: number;
      /** Attacker whose critical hit broke it (absent for other causes). */
      by?: string;
    })
  | (Base & {
      type: "subsystem_revealed";
      playerId: string;
      subsystemId: SubsystemId;
      subsystemType: SubsystemType;
      reason: RevealReason;
    })
  | (Base & {
      type: "ship_destroyed";
      victimId: string;
      killerId?: string;
      cause: "weapon" | "missile" | "heat";
    })
  | (Base & {
      type: "heat_damage";
      playerId: string;
      heat: number;
      dissipation: number;
      damage: number;
    })
  | (Base & {
      type: "heat_check";
      playerId: string;
      heat: number;
      dissipation: number;
      damage: number;
    })
  | (Base & { type: "turn_skipped"; playerId: string; remaining: number })
  | (Base & {
      type: "scanned";
      scannerId: string;
      targetId: string;
      peekedSlot: SubsystemId;
      heat: number;
    })
  | (Base & {
      type: "scan_result";
      scannerId: string;
      targetId: string;
      slot: SubsystemId;
      subsystemType: SubsystemType;
    })
  | (Base & {
      type: "docked";
      playerId: string;
      planetId: string;
      hullRestored: number;
      repaired: SubsystemId[];
      missilesReloaded: boolean;
    })
  | (Base & {
      type: "cargo_picked_up";
      playerId: string;
      cargoId: string;
      kind: CargoKind;
      planetId: string;
    })
  | (Base & {
      type: "cargo_delivered";
      playerId: string;
      cargoId: string;
      kind: CargoKind;
      planetId: string;
    })
  | (Base & {
      type: "cargo_dropped";
      playerId: string;
      crates: number;
      data: number;
    })
  | (Base & { type: "data_acquired"; playerId: string; kind: "scan" | "survey"; missionId: string })
  | (Base & {
      type: "mission_completed";
      playerId: string;
      mission: Mission;
      completedCount: number;
    })
  | (Base & {
      type: "stations_moved";
      /** Docked ships that rode their station round with it. */
      riders: string[];
    })
  | (Base & {
      type: "action_skipped";
      playerId: string;
      action: "fire_weapon" | "scan";
      targetId: string;
      reason: "target_destroyed";
    })
  | (Base & { type: "deployed"; playerId: string; position: Position })
  /** Someone reached the points needed; the round is played out (turnsLeft more seats act). */
  | (Base & { type: "final_round"; playerId: string; points: number; turnsLeft: number })
  | (Base & {
      type: "game_ended";
      winnerId: string;
      /** What separated first from second in the standings. */
      decidedBy: "points" | "hull" | "fuel" | "seat";
    });

export type GameEventType = GameEvent["type"];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before the turn number is stamped on it. */
export type EventDraft = DistributiveOmit<GameEvent, "turn">;

export function stampEvents(drafts: EventDraft[], turn: number): GameEvent[] {
  return drafts.map((d) => ({ ...d, turn }) as GameEvent);
}

/** True if `viewerId` may see the event. */
export function canSeeEvent(event: GameEvent, viewerId: string | null): boolean {
  if (!event.privateTo) return true;
  return viewerId !== null && event.privateTo.includes(viewerId);
}

export function filterEventsFor(events: GameEvent[], viewerId: string | null): GameEvent[] {
  return events.filter((e) => canSeeEvent(e, viewerId));
}
