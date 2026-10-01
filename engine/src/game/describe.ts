/**
 * Human-readable text for events (turn log, replay, sim diagnostics), and the
 * mission cards' title and rule, whose words live in `text/missionCards.ts`.
 */
import type { GameEvent } from "../models/events.ts";
import type { Mission, MissionRequirement, SaleKind } from "../models/missions.ts";
import { SCAN_SECTOR_RANGE, SURVEY_RING, TANKER_FUEL } from "../models/missions.ts";
import type { Position } from "../models/game.ts";
import { getSubsystemConfig } from "../models/subsystems.ts";
import { getWellName } from "../models/gravityWells.ts";
import { COMPRESSED_JUMP_MASS, WELL_TRANSFER_COSTS } from "../models/rings.ts";
import { MISSION_CARDS } from "../text/missionCards.ts";
import { fill } from "../utils/fill.ts";

type NameResolver = (playerId: string) => string;

/** What a station bought, as the log says it. */
const SOLD: Record<SaleKind, string> = { crate: "a crate", loot: "loot", data: "data", fuel: "fuel" };

function pos(p: Position): string {
  return `${getWellName(p.wellId)} R${p.ring} S${p.sector}`;
}

function heat(h: number): string {
  return h > 0 ? ` (+${h} heat)` : "";
}

export function describeMission(m: Mission, name: NameResolver): string {
  const card = MISSION_CARDS;
  switch (m.type) {
    case "destroy_ship":
      return fill(card.destroy_ship.title, { target: name(m.targetPlayerId) });
    case "deliver_cargo":
      return fill(card.deliver_cargo.title, {
        pickup: getWellName(m.pickupPlanetId),
        delivery: getWellName(m.deliveryPlanetId),
      });
    case "intercept_transmission":
      return fill(card.intercept_transmission.title, {
        target: name(m.targetPlayerId),
        filing: getWellName(m.deliveryPlanetId),
      });
    case "survey":
      return card.survey.title;
    case "piracy":
      return card.piracy.title;
    case "tanker":
      return fill(card.tanker.title, { fuel: TANKER_FUEL });
    case "escort":
      return m.markedPlayerId
        ? fill(card.escort.title, { carrier: name(m.markedPlayerId) })
        : card.escort.titleUnmarked;
    case "salvage":
      return card.salvage.title;
  }
}

/**
 * The whole mission in a sentence or two, as the card prints it under its
 * title: what to do, where, and what completes it (RULES §Missions). The
 * words are in `text/missionCards.ts`.
 */
export function describeMissionRule(m: Mission, name: NameResolver): string {
  const card = MISSION_CARDS;
  switch (m.type) {
    case "destroy_ship":
      return fill(card.destroy_ship.rule, { target: name(m.targetPlayerId) });
    case "deliver_cargo":
      return fill(card.deliver_cargo.rule, {
        pickup: getWellName(m.pickupPlanetId),
        delivery: getWellName(m.deliveryPlanetId),
      });
    case "intercept_transmission":
      return fill(card.intercept_transmission.rule, {
        target: name(m.targetPlayerId),
        scanRange: SCAN_SECTOR_RANGE,
        filing: getWellName(m.deliveryPlanetId),
      });
    case "survey":
      return fill(card.survey.rule, { ring: SURVEY_RING });
    case "piracy":
      return card.piracy.rule;
    case "tanker":
      return fill(card.tanker.rule, { fuel: TANKER_FUEL });
    case "escort":
      return card.escort.rule;
    case "salvage":
      return card.salvage.rule;
  }
}

/**
 * A requirement in a player's words: "a sensor array", or "a weapon (railgun,
 * broadside laser, missiles, ballistic rack or plasma cannon)" when several tiles count:
 * the label alone is what a player needs, the names say what satisfies it.
 */
export function describeMissionRequirement(requirement: MissionRequirement): string {
  const names = requirement.anyOf.map((t) => getSubsystemConfig(t).name);
  const options =
    names.length > 1 ? ` (${names.slice(0, -1).join(", ")} or ${names[names.length - 1]})` : "";
  return `a ${requirement.label}${options}`;
}

export function describeEvent(e: GameEvent, name: NameResolver): string {
  const sub = (t: Parameters<typeof getSubsystemConfig>[0]) => getSubsystemConfig(t).name;
  switch (e.type) {
    case "respawned":
      return `${name(e.playerId)} returns Home at ${pos(e.position)}`;
    case "subsystem_powered":
      return `${name(e.playerId)} powers ${e.subsystemType ? sub(e.subsystemType) : e.subsystemId} at ${e.amount}`;
    case "rotated":
      return `${name(e.playerId)} rotates to ${e.facing}`;
    case "coasted":
      if (e.recovering) return `${name(e.playerId)} drifts to ${pos(e.to)}, nobody at the helm`;
      return e.moored
        ? `${name(e.playerId)} holds its berth at ${pos(e.to)}${e.scooped ? ", scoop running" : ""}${heat(e.heat)}`
        : `${name(e.playerId)} coasts to ${pos(e.to)}${e.scooped ? ", scoop running" : ""}${heat(e.heat)}`;
    case "fuel_scooped":
      return `${name(e.playerId)} scoops ${e.amount} fuel`;
    case "burned":
      return `${name(e.playerId)} makes a ${e.intensity} burn to ${pos(e.to)} (-${e.massSpent} fuel)${heat(e.heat)}`;
    case "jumped": {
      const phased = e.sectorAdjustment
        ? `, phased ${e.sectorAdjustment > 0 ? "+" : ""}${e.sectorAdjustment} in the arc`
        : "";
      const fuel = e.compressed
        ? ` (-${e.massSpent} fuel; the compressor pays ${WELL_TRANSFER_COSTS.mass - COMPRESSED_JUMP_MASS} of the lane's ${WELL_TRANSFER_COSTS.mass})`
        : ` (-${e.massSpent} fuel)`;
      return `${name(e.playerId)} jumps to ${pos(e.to)}${phased}${fuel}${heat(e.heat)}`;
    }
    case "weapon_fired":
      return (e.count ?? 1) > 1
        ? `${name(e.attackerId)} launches ${e.count} missiles at ${name(e.targetId)}${heat(e.heat)}`
        : `${name(e.attackerId)} fires ${sub(e.weaponType)} at ${name(e.targetId)}${heat(e.heat)}`;
    case "attack_resolved": {
      const who = `${name(e.attackerId)}'s ${sub(e.weaponType)}`;
      if (e.result === "miss") return `${who} misses ${name(e.targetId)} (rolled ${e.roll})`;
      // A disruptor deals nothing: what it breaks is the subsystem_broken that follows.
      if (e.blocked) return `${who} is blocked by ${name(e.targetId)}'s shields (rolled ${e.roll})`;
      if (getSubsystemConfig(e.weaponType).weaponStats?.disrupts)
        return `${who} hits ${name(e.targetId)} (rolled ${e.roll}): the slot it named is disrupted`;
      const crit = e.result === "critical" ? " CRITICAL" : "";
      const shield = e.absorbed > 0 ? `, ${e.absorbed} absorbed by shields` : "";
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
        ? `${name(e.targetId)}'s point defence destroys ${name(e.ownerId)}'s missile (rolled ${e.roll})`
        : `${name(e.targetId)}'s point defence misses the missile (rolled ${e.roll})`;
    case "missile_expired":
      return `${name(e.ownerId)}'s missile burns out at ${pos(e.at)}`;
    case "subsystem_broken":
      return `${name(e.playerId)}'s ${sub(e.subsystemType)} is broken${e.by ? ` by ${name(e.by)}` : ""}${e.energyLost > 0 ? ` (${e.energyLost} energy vents as heat)` : ""}`;
    case "subsystem_repaired":
      return `${name(e.playerId)} runs cold and repairs ${sub(e.subsystemType)} (${e.subsystemId})`;
    case "subsystem_revealed":
      return `${name(e.playerId)} reveals ${sub(e.subsystemType)} in ${e.subsystemId}`;
    case "ship_destroyed":
      return e.killerId
        ? `${name(e.victimId)} is destroyed by ${name(e.killerId)}`
        : `${name(e.victimId)} is destroyed by heat`;
    case "heat_check":
      return e.damage > 0
        ? `${name(e.playerId)} redlines at ${e.heat} heat: ${e.damage} hull, dissipates ${e.dissipation}, carries ${e.carried}`
        : `${name(e.playerId)} runs ${e.heat} heat, dissipates ${e.dissipation}, carries ${e.carried}`;
    case "scanned":
      return `${name(e.scannerId)} scans ${name(e.targetId)} (${e.peekedSlot})${heat(e.heat)}`;
    case "scan_result":
      return `Scan shows ${name(e.targetId)}'s ${e.slot} is ${sub(e.subsystemType)}`;
    case "docked": {
      const parts: string[] = [];
      if (e.hullRestored > 0) parts.push(`+${e.hullRestored} hull`);
      if (e.repaired.length > 0) parts.push(`repaired ${e.repaired.join(", ")}`);
      if (e.missilesReloaded) parts.push("missiles reloaded");
      const sold = e.sold ? `, and sells ${SOLD[e.sold]}` : "";
      return `${name(e.playerId)} docks at ${getWellName(e.planetId)}${parts.length ? ` (${parts.join(", ")})` : ""}${sold}`;
    }
    case "cargo_picked_up":
      return `${name(e.playerId)} loads a crate at ${getWellName(e.planetId)}`;
    case "cargo_delivered":
      return `${name(e.playerId)} delivers ${e.kind} at ${getWellName(e.planetId)}`;
    case "cargo_seized":
      return `${name(e.pirateId)} seizes ${name(e.victimId)}'s ${e.kind} at ${pos(e.at)}`;
    case "wreck_left":
      return `${name(e.victimId)} leaves a wreck at ${pos(e.at)}`;
    case "wreck_salvaged":
      return `${name(e.playerId)} salvages a wreck's black box at ${pos(e.at)}`;
    case "escort_marked":
      return `${name(e.escortId)} puts an escort marker on ${name(e.carrierId)}`;
    case "escort_released":
      return `${name(e.escortId)}'s escort marker comes off ${name(e.carrierId)} and back to hand`;
    case "escort_spent":
      return `${name(e.carrierId)} is destroyed: ${name(e.escortId)}'s Escort is spent`;
    case "fuel_pumped":
      return `${name(e.playerId)} pumps ${e.amount} fuel into ${getWellName(e.planetId)}'s station`;
    case "cargo_dropped": {
      const parts: string[] = [];
      if (e.crates) parts.push(`${e.crates} crate(s)`);
      if (e.data) parts.push(`${e.data} data`);
      return `${name(e.playerId)} loses ${parts.join(", ")}`;
    }
    case "data_acquired":
      return `${name(e.playerId)} acquires ${e.kind} data`;
    case "mission_completed":
      return `${name(e.playerId)} completes ${describeMission(e.mission, name)} (${e.points} points)`;
    case "action_skipped":
      return `${name(e.playerId)}'s ${e.action === "scan" ? "scan" : "shot"} at ${name(e.targetId)} is not taken: the ship is already gone`;
    case "stations_moved": {
      const carrying = e.riders.length > 0 ? `, carrying ${e.riders.map(name).join(", ")}` : "";
      const wrecks = e.wrecks.length > 0 ? `; ${e.wrecks.length} wreck(s) drift` : "";
      return `Stations advance in their orbits${carrying}${wrecks}`;
    }
    case "deployed":
      return `${name(e.playerId)} deploys at ${pos(e.position)}`;
    case "final_round":
      return e.turnsLeft === 0
        ? `${name(e.playerId)} reaches ${e.points} points as the round ends`
        : `${name(e.playerId)} reaches ${e.points} points: the round is played out (${e.turnsLeft} more to act)`;
    case "game_ended":
      return e.decidedBy === "points"
        ? `${name(e.winnerId)} wins`
        : `${name(e.winnerId)} wins on ${e.decidedBy === "seat" ? "turn order" : e.decidedBy}`;
  }
}
