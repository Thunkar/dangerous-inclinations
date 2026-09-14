/**
 * Docking. A ship that ends its turn on a station's sector is docked:
 * crates are picked up and delivered, broken systems are repaired, some hull
 * is restored and missiles are reloaded.
 */
import type { GameState } from "../models/game.ts";
import { rulesOf } from "./setup.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo } from "../models/missions.ts";
import { positionOf } from "./geometry.ts";
import { getStationAt } from "./stations.ts";
import { isDestroyed, reloadMissiles, repairAllSubsystems } from "./ship.ts";

export interface DockingResult {
  state: GameState;
  events: EventDraft[];
  /** Planet docked at, if any. */
  planetId?: string;
}

export function processDocking(state: GameState, playerIndex: number): DockingResult {
  const player = state.players[playerIndex];
  if (isDestroyed(player.ship)) return { state, events: [] };
  const station = getStationAt(state.stations, positionOf(player.ship));
  if (!station) return { state, events: [] };

  const planetId = station.planetId;
  const events: EventDraft[] = [];

  // Cargo.
  const cargo: Cargo[] = [];
  for (const item of player.cargo) {
    if (!item.isPickedUp) {
      if (item.pickupPlanetId === planetId) {
        cargo.push({ ...item, isPickedUp: true });
        events.push({
          type: "cargo_picked_up",
          playerId: player.id,
          cargoId: item.id,
          kind: item.kind,
          planetId,
        });
      } else {
        cargo.push(item);
      }
      continue;
    }
    if (item.deliveryPlanetId === "any" || item.deliveryPlanetId === planetId) {
      events.push({
        type: "cargo_delivered",
        playerId: player.id,
        cargoId: item.id,
        kind: item.kind,
        planetId,
      });
    } else {
      cargo.push(item);
    }
  }

  // Repairs.
  const repaired = repairAllSubsystems(player.ship);
  const reloaded = reloadMissiles(repaired.ship);
  const rules = rulesOf(state);
  const hullRestored = Math.min(
    rules.dockHullRepair,
    reloaded.ship.maxHitPoints - reloaded.ship.hitPoints
  );
  // Spent shield cubes (rule knob) come back to the reactor at the dock.
  const ship = {
    ...reloaded.ship,
    hitPoints: reloaded.ship.hitPoints + hullRestored,
    spentEnergy: 0,
    reactor: {
      ...reloaded.ship.reactor,
      availableEnergy: Math.min(
        reloaded.ship.reactor.totalCapacity,
        reloaded.ship.reactor.availableEnergy + reloaded.ship.spentEnergy
      ),
    },
  };

  events.push({
    type: "docked",
    playerId: player.id,
    planetId,
    hullRestored,
    repaired: repaired.repaired,
    missilesReloaded: reloaded.reloaded,
  });

  const players = [...state.players];
  players[playerIndex] = { ...player, ship, cargo };
  return { state: { ...state, players }, events, planetId };
}
