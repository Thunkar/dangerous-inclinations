/**
 * Game events: the structured record of what happened during a turn.
 *
 * Every rule effect emits an event. The turn log shown to players, the stats
 * gathered by the simulator and the animations in the UI are all derived from
 * events, never from diffing states or parsing strings.
 *
 * Visibility: most events are public (everyone at the table saw it), including
 * energy allocation (cubes sit on the tiles in the open). An event with
 * `privateTo` is only delivered to those players: e.g. what a scan revealed
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
  | "prevented_heat_damage"
  | "compressed_jump"
  | "broken";

export type GameEvent =
  | (Base & { type: "respawned"; playerId: string; position: Position })
  | (Base & {
      /**
       * A `power` action put energy on a shield, a rack or a sensor. Public, as
       * the cubes are. Powering reveals nothing, so `subsystemType` is only
       * present when the tile is already face-up: on a face-down tile it would
       * tell the table what the cubes only hint at.
       */
      type: "subsystem_powered";
      playerId: string;
      subsystemId: SubsystemId;
      subsystemType?: SubsystemType;
      /** Cubes the tile now holds. */
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
      /** Fuel spent, phasing included; a compressor cuts the lane's share. */
      massSpent: number;
      /** A working fuel compressor was aboard, so the lane cost less. */
      compressed: boolean;
      heat: number;
    })
  | (Base & {
      type: "weapon_fired";
      attackerId: string;
      targetId: string;
      subsystemId: SubsystemId;
      weaponType: WeaponType;
      /** The whole action's heat: for a salvo, the tile's cubes once, whatever its size. */
      heat: number;
      /** Missiles only: how many went up in this one action. */
      count?: number;
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
      /** A cold ship's crew got outside and fixed one thing (RULES §Heat check). */
      type: "subsystem_repaired";
      playerId: string;
      subsystemId: SubsystemId;
      subsystemType: SubsystemType;
    })
  | (Base & {
      type: "heat_check";
      playerId: string;
      /** Heat on the track when the check ran, the loadout's cubes included. */
      heat: number;
      /** The part of `heat` that is cubes sitting on the loadout. */
      cubes: number;
      dissipation: number;
      /** Hull taken for the part of `heat` above MAX_HEAT. */
      damage: number;
      /** Heat that rides into the next turn: min(heat, MAX_HEAT) - dissipation. */
      carried: number;
    })
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
      /** Piracy: a crate taken off a ship sharing the pirate's sector. */
      type: "cargo_seized";
      pirateId: string;
      victimId: string;
      /** What was taken: a crate goes first when the mark carries both. */
      kind: CargoKind;
      /** The victim's item, whose card goes back to undone. */
      cargoId: string;
      at: Position;
    })
  | (Base & {
      /** Tanker: fuel pumped into a station's drums on arrival. */
      type: "fuel_sold";
      playerId: string;
      amount: number;
      planetId: string;
    })
  | (Base & {
      type: "cargo_dropped";
      playerId: string;
      crates: number;
      data: number;
    })
  | (Base & {
      type: "data_acquired";
      playerId: string;
      /** Which card took data: a scan, or one of the secondary cards. */
      kind: "scan" | "survey" | "grand_tour";
      missionId: string;
    })
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
