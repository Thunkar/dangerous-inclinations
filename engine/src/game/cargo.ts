/**
 * Cargo System for Dangerous Inclinations
 *
 * Handles cargo pickup and delivery at planetary stations. Cargo is
 * automatically picked up/delivered when a ship is at a station.
 *
 * Public API:
 * - {@link processCargoAtStation} runs once per turn for the active player
 *   and applies any auto-pickup / auto-delivery for their current position.
 *
 * Helpers below are kept module-private intentionally. Don't export them
 * unless a real caller appears.
 */

import type { Player, Station } from "../models/game.ts";
import type { Cargo } from "../models/missions.ts";

/**
 * Result of processing cargo at a station
 */
export interface CargoProcessResult {
  player: Player;
  pickedUpCargo: Cargo[];
  deliveredCargo: Cargo[];
  logMessages: string[];
}

/**
 * Cargo a player can pick up at their current position — not yet picked up,
 * standing at the pickup station for the cargo's mission.
 */
function getPickupableCargo(player: Player, stations: Station[]): Cargo[] {
  return player.cargo.filter((cargo) => {
    if (cargo.isPickedUp) return false;

    const pickupStation = stations.find(
      (s) => s.planetId === cargo.pickupPlanetId
    );
    if (!pickupStation) return false;

    return (
      player.ship.wellId === cargo.pickupPlanetId &&
      player.ship.ring === pickupStation.ring &&
      player.ship.sector === pickupStation.sector
    );
  });
}

/**
 * Cargo a player can deliver at their current position. Scan-data cargo
 * (deliveryPlanetId === "any") delivers at any station the player is on;
 * normal cargo requires the specific delivery station.
 */
function getDeliverableCargo(player: Player, stations: Station[]): Cargo[] {
  return player.cargo.filter((cargo) => {
    if (!cargo.isPickedUp) return false;

    if (cargo.deliveryPlanetId === "any") {
      return stations.some(
        (s) =>
          player.ship.wellId === s.planetId &&
          player.ship.ring === s.ring &&
          player.ship.sector === s.sector
      );
    }

    const deliveryStation = stations.find(
      (s) => s.planetId === cargo.deliveryPlanetId
    );
    if (!deliveryStation) return false;

    return (
      player.ship.wellId === cargo.deliveryPlanetId &&
      player.ship.ring === deliveryStation.ring &&
      player.ship.sector === deliveryStation.sector
    );
  });
}

/**
 * Process all cargo operations for a player at their current position.
 * Auto-picks up and delivers cargo as appropriate. Returns the updated
 * player plus the cargo events that occurred (for logging and mission
 * completion follow-up).
 */
export function processCargoAtStation(
  player: Player,
  stations: Station[]
): CargoProcessResult {
  const pickedUpCargo: Cargo[] = [];
  const deliveredCargo: Cargo[] = [];
  const logMessages: string[] = [];

  const pickupable = getPickupableCargo(player, stations);
  const deliverable = getDeliverableCargo(player, stations);

  // Mark pickups
  let updatedCargo = player.cargo.map((cargo) => {
    if (pickupable.includes(cargo)) {
      pickedUpCargo.push(cargo);
      logMessages.push(
        `Picked up cargo for delivery to ${cargo.deliveryPlanetId}`
      );
      return { ...cargo, isPickedUp: true };
    }
    return cargo;
  });

  // Drop deliveries from inventory
  updatedCargo = updatedCargo.filter((cargo) => {
    if (deliverable.some((d) => d.id === cargo.id)) {
      deliveredCargo.push(cargo);
      logMessages.push(`Delivered cargo to ${cargo.deliveryPlanetId}`);
      return false;
    }
    return true;
  });

  return {
    player: { ...player, cargo: updatedCargo },
    pickedUpCargo,
    deliveredCargo,
    logMessages,
  };
}
