/**
 * Human-readable text for events (turn log, replay, sim diagnostics).
 */
import type { GameEvent } from "../models/events.ts";
import type { Mission } from "../models/missions.ts";
import type { Position } from "../models/game.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { getWellName } from "../models/gravityWells.ts";

export type NameResolver = (playerId: string) => string;

function pos(p: Position): string {
  return `${getWellName(p.wellId)} R${p.ring} S${p.sector}`;
}

function heat(h: number): string {
  return h > 0 ? ` (+${h} heat)` : "";
}

export function describeMission(m: Mission, name: NameResolver): string {
  switch (m.type) {
    case "destroy_ship":
      return `Destroy ${name(m.targetPlayerId)}`;
    case "deliver_cargo":
      return `Deliver ${getWellName(m.pickupPlanetId)} → ${getWellName(m.deliveryPlanetId)}`;
    case "intercept_transmission":
      return `Intercept ${name(m.targetPlayerId)}`;
    case "survey":
      return "Survey the Event Horizon";
  }
}

export function describeEvent(e: GameEvent, name: NameResolver): string {
  const sub = (t: Parameters<typeof getSubsystemConfig>[0]) => getSubsystemConfig(t).name;
  switch (e.type) {
    case "respawned":
      return `${name(e.playerId)} returns to port at ${pos(e.position)}`;
    case "energy_allocated":
      return `${name(e.playerId)} routes ${e.amount} energy to ${e.subsystemId}`;
    case "energy_deallocated":
      return `${name(e.playerId)} pulls ${e.amount} energy from ${e.subsystemId}`;
    case "rotated":
      return `${name(e.playerId)} rotates to ${e.facing}`;
    case "coasted":
      return `${name(e.playerId)} coasts to ${pos(e.to)}${e.scooped ? ", scoop running" : ""}${heat(e.heat)}`;
    case "fuel_scooped":
      return `${name(e.playerId)} scoops ${e.amount} fuel`;
    case "burned":
      return `${name(e.playerId)} makes a ${e.intensity} burn to ${pos(e.to)} (-${e.massSpent} fuel)${heat(e.heat)}`;
    case "jumped":
      return `${name(e.playerId)} jumps to ${pos(e.to)}${e.refunded ? " (compressor refunds the fuel)" : ""}${heat(e.heat)}`;
    case "weapon_fired":
      return `${name(e.attackerId)} fires ${sub(e.weaponType)} at ${name(e.targetId)}${heat(e.heat)}`;
    case "attack_resolved": {
      const who = `${name(e.attackerId)}'s ${sub(e.weaponType)}`;
      if (e.result === "miss") return `${who} misses ${name(e.targetId)} (rolled ${e.roll})`;
      const crit = e.result === "critical" ? " CRITICAL" : "";
      const shield = e.toHeat > 0 ? `, ${e.toHeat} absorbed by shields` : "";
      return `${who} hits${crit} ${name(e.targetId)} for ${e.damage} (rolled ${e.roll}${shield}), hull ${e.targetHullAfter}`;
    }
    case "recoil":
      return e.compensated
        ? `${name(e.playerId)} fires engines to absorb the recoil (-${e.massSpent} fuel)${heat(e.heat)}`
        : `Recoil pushes ${name(e.playerId)} to ${e.to ? pos(e.to) : "another ring"}`;
    case "missile_launched":
      return `${name(e.ownerId)} launches a missile at ${name(e.targetId)}`;
    case "missile_moved":
      return `${name(e.ownerId)}'s missile tracks to ${pos(e.to)} (${e.movesLeft} moves left)`;
    case "missile_intercepted":
      return e.destroyed
        ? `${name(e.targetId)}'s point defence destroys ${name(e.ownerId)}'s missile (rolled ${e.roll})${heat(e.heat)}`
        : `${name(e.targetId)}'s point defence misses the missile (rolled ${e.roll})${heat(e.heat)}`;
    case "missile_expired":
      return `${name(e.ownerId)}'s missile burns out at ${pos(e.at)}`;
    case "subsystem_broken":
      return `${name(e.playerId)}'s ${sub(e.subsystemType)} is broken${e.by ? ` by ${name(e.by)}` : ""}${e.energyLost > 0 ? ` (${e.energyLost} energy vents as heat)` : ""}`;
    case "subsystem_revealed":
      return `${name(e.playerId)} reveals ${sub(e.subsystemType)} in ${e.subsystemId}`;
    case "ship_destroyed":
      return e.killerId
        ? `${name(e.victimId)} is destroyed by ${name(e.killerId)}`
        : `${name(e.victimId)} is destroyed by heat`;
    case "heat_damage":
      return `${name(e.playerId)} takes ${e.damage} heat damage (${e.heat} heat vs ${e.dissipation} dissipation)`;
    case "scanned":
      return `${name(e.scannerId)} scans ${name(e.targetId)} (${e.peekedSlot})${heat(e.heat)}`;
    case "scan_result":
      return `Scan shows ${name(e.targetId)}'s ${e.slot} is ${sub(e.subsystemType)}`;
    case "docked": {
      const parts: string[] = [];
      if (e.hullRestored > 0) parts.push(`+${e.hullRestored} hull`);
      if (e.repaired.length > 0) parts.push(`repaired ${e.repaired.join(", ")}`);
      if (e.missilesReloaded) parts.push("missiles reloaded");
      return `${name(e.playerId)} docks at ${getWellName(e.planetId)}${parts.length ? ` (${parts.join(", ")})` : ""}`;
    }
    case "cargo_picked_up":
      return `${name(e.playerId)} loads a crate at ${getWellName(e.planetId)}`;
    case "cargo_delivered":
      return `${name(e.playerId)} delivers ${e.kind} at ${getWellName(e.planetId)}`;
    case "cargo_dropped": {
      const parts: string[] = [];
      if (e.crates) parts.push(`${e.crates} crate(s)`);
      if (e.data) parts.push(`${e.data} data`);
      return `${name(e.playerId)} loses ${parts.join(", ")}`;
    }
    case "data_acquired":
      return `${name(e.playerId)} acquires ${e.kind} data`;
    case "mission_completed":
      return `${name(e.playerId)} completes ${describeMission(e.mission, name)} (${e.completedCount} done)`;
    case "action_skipped":
      return `${name(e.playerId)}'s ${e.action === "scan" ? "scan" : "shot"} at ${name(e.targetId)} is not taken: the ship is already gone`;
    case "stations_moved":
      return "Stations advance in their orbits";
    case "deployed":
      return `${name(e.playerId)} deploys at ${pos(e.position)}`;
    case "game_ended":
      return `${name(e.winnerId)} wins`;
  }
}
