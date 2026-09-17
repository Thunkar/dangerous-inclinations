/**
 * Docking. A ship that **arrives** on a station's sector is docked: crates are
 * picked up and delivered, broken systems are repaired, the hull is restored
 * and missiles are reloaded.
 *
 * The hold takes one crate (RULES §Missions), so a second route waits: a
 * crate whose station this is stays on the dock until the hold is free.
 *
 * Arriving, not sitting. A docked ship stays moored until it burns away, and
 * for a while the whole dock re-resolved every turn it held the berth — a free
 * repair shop for anyone content to park in one. A visit is an event now: the
 * berth afterwards is worth the ride the station gives you and the fuel your
 * scoop skims, and nothing else. Come back for more and it is a trip.
 */
import type { GameState } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo } from "../models/missions.ts";
import { CARGO_HOLD_CRATES } from "../models/missions.ts";
import { positionOf } from "./geometry.ts";
import { getStationAt } from "./stations.ts";
import { isDestroyed, reloadMissiles, repairAllSubsystems } from "./ship.ts";

export interface DockingResult {
  state: GameState;
  events: EventDraft[];
  /** Planet docked at, if any. */
  planetId?: string;
}

/**
 * @param arriving false when the ship was already moored when its turn began:
 *   it is holding a berth it already holds, which is not a visit.
 */
export function processDocking(
  state: GameState,
  playerIndex: number,
  arriving = true
): DockingResult {
  const player = state.players[playerIndex];
  if (isDestroyed(player.ship)) return { state, events: [] };
  if (!arriving) return { state, events: [] };
  const station = getStationAt(state.stations, positionOf(player.ship));
  if (!station) return { state, events: [] };

  const planetId = station.planetId;
  const events: EventDraft[] = [];

  // Cargo. Unload first, then load: a crate delivered here frees the hold for
  // one waiting at the same station, which is what makes a chained route one
  // trip instead of two.
  const cargo: Cargo[] = [];
  const waiting: Cargo[] = [];
  for (const item of player.cargo) {
    if (!item.isPickedUp) {
      waiting.push(item);
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

  // The hold takes one crate; data chits are numbers and ride free.
  let cratesAboard = cargo.filter((c) => c.kind === "crate").length;
  for (const item of waiting) {
    // A load of garbage is collected wherever you dock (RULES §Missions).
    const mine = item.pickupPlanetId === "any" || item.pickupPlanetId === planetId;
    const room = item.kind !== "crate" || cratesAboard < CARGO_HOLD_CRATES;
    if (!mine || !room) {
      cargo.push(item);
      continue;
    }
    if (item.kind === "crate") cratesAboard++;
    cargo.push({ ...item, isPickedUp: true });
    events.push({
      type: "cargo_picked_up",
      playerId: player.id,
      cargoId: item.id,
      kind: item.kind,
      planetId,
    });
  }

  // Repairs.
  const repaired = repairAllSubsystems(player.ship);
  const reloaded = reloadMissiles(repaired.ship);
  // A dock puts the ship back to full hull. Capping it at 2 was measured on
  // 17 Sept 2026: a quarter more kills, but the no-weapon hull it was aimed at
  // did not budge (+13 to +12), because that hull was never healing anyway.
  const hullRestored = reloaded.ship.maxHitPoints - reloaded.ship.hitPoints;
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
