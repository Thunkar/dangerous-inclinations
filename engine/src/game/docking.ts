/**
 * Docking. A ship that ends its turn on a station's sector is docked:
 * crates are picked up and delivered, broken systems are repaired, some hull
 * is restored and missiles are reloaded.
 */
import type { GameState } from "../models/game.ts";
import { DOCK_HULL_REPAIR } from "../models/game.ts";
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
  const hullRestored = Math.min(
    DOCK_HULL_REPAIR,
    reloaded.ship.maxHitPoints - reloaded.ship.hitPoints
  );
  const ship = { ...reloaded.ship, hitPoints: reloaded.ship.hitPoints + hullRestored };

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
