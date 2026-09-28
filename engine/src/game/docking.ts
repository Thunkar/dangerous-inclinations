/**
 * Docking. A ship that **arrives** on a station's sector is docked: broken
 * systems are repaired, the hull is restored and missiles are reloaded, every
 * crate waiting there for it loads, and the station buys one item (RULES
 * §Stations).
 *
 * Each station buys one item from each player, once per game. A sale is one
 * item handed in (a Deliver crate at its destination, a piece of data filed,
 * loot sold) or a Tanker's fuel pumped, and after it that station buys
 * nothing more from that player. If more than one sale is on offer the player
 * chooses, or sells nothing. A player who names no sale (or one this visit
 * cannot make) gets the one that scores most on the visit, ties to crates
 * (loot is a crate), then data, then fuel, each in the order carried.
 *
 * Loading a crate is not a sale and the hold has no limit, so every crate
 * waiting at the station loads on every visit, sold or not.
 *
 * Arriving, not sitting. A docked ship stays moored until it burns away, and
 * for a while the whole dock re-resolved every turn it held the berth: a free
 * repair shop for anyone content to park in one. A visit is an event now: the
 * berth afterwards is worth the ride the station gives you and the fuel your
 * scoop skims, and nothing else. Come back for more and it is a trip.
 */
import type { GameState } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo, Mission, SaleKind } from "../models/missions.ts";
import {
  SELL_FUEL,
  SELL_NOTHING,
  TANKER_FUEL,
  aboard,
  holdItemKind,
  missionPoints,
} from "../models/missions.ts";
import { positionOf } from "./geometry.ts";
import { getStationAt } from "./stations.ts";
import { isDestroyed, reloadMissiles, repairAllSubsystems } from "./ship.ts";

/** What a visit reads off the ship: the hold, the hand, the tank and where it has sold. */
export interface DockingShip {
  cargo: readonly Cargo[];
  missions: readonly Mission[];
  reactionMass: number;
  /** Planets whose station this player has sold at. */
  soldAt: readonly string[];
}

/** One sale a visit could make. */
export interface SaleOption {
  /** What a `dock_sale` action names for it: the item's cargo id, or {@link SELL_FUEL}. */
  sale: string;
  kind: SaleKind;
  /** The card it pays: the item's card, or the first undone Tanker for fuel. */
  missionId?: string;
  /** Mission points it completes on this visit. */
  points: number;
}

export interface SaleOffer {
  /** The sales this visit can make, crates first, then data, then fuel. */
  options: SaleOption[];
  /** The sale made when the player names none: the most points, the first of equals. */
  default: SaleOption | null;
  /** This player has sold at this station, so it buys nothing more from them. */
  soldHere: boolean;
  /** Crates that load on the visit whatever is sold. */
  loads: number;
}

const deliversHere = (item: Cargo, planetId: string) =>
  item.deliveryPlanetId === "any" || item.deliveryPlanetId === planetId;

/** Points for handing an item in: its card's, if the card is in hand and undone. */
function pointsFor(item: Cargo, missions: readonly Mission[]): number {
  const mission = missions.find((m) => m.id === item.missionId && !m.isCompleted);
  return mission ? missionPoints(mission.type) : 0;
}

/** The option scoring most, the first of equals. */
export function bestSale(options: readonly SaleOption[]): SaleOption | null {
  let best: SaleOption | null = null;
  for (const option of options) if (!best || option.points > best.points) best = option;
  return best;
}

/** Crates waiting at `planetId`'s station for this ship: all of them load. */
function waitingCrates(cargo: readonly Cargo[], planetId: string): Cargo[] {
  return cargo.filter((c) => !c.isPickedUp && c.kind === "crate" && c.pickupPlanetId === planetId);
}

/**
 * The sales a visit to `planetId`'s station would offer a ship arriving with
 * this hold, hand and tank, what each scores and the one made by default.
 * None at a station the player has sold at. Pure: the referee docks by it,
 * and the bots, the seat CLI and the table's plan preview the choice with it.
 */
export function salesOnArrival(ship: DockingShip, planetId: string): SaleOffer {
  const loads = waitingCrates(ship.cargo, planetId).length;
  const soldHere = ship.soldAt.includes(planetId);
  if (soldHere) return { options: [], default: null, soldHere, loads };
  const held = aboard(ship.cargo).filter((c) => deliversHere(c, planetId));
  const item = (c: Cargo): SaleOption => ({
    sale: c.id,
    kind: holdItemKind(c),
    missionId: c.missionId,
    points: pointsFor(c, ship.missions),
  });
  const tanker = ship.missions.find((m) => m.type === "tanker" && !m.isCompleted);
  const options: SaleOption[] = [
    ...held.filter((c) => c.kind === "crate").map(item),
    ...held.filter((c) => c.kind === "data").map(item),
    ...(tanker && ship.reactionMass >= TANKER_FUEL
      ? [
          {
            sale: SELL_FUEL,
            kind: "fuel" as const,
            missionId: tanker.id,
            points: missionPoints("tanker"),
          },
        ]
      : []),
  ];
  return { options, default: bestSale(options), soldHere, loads };
}

/**
 * The sale the visit makes: none for {@link SELL_NOTHING}, the one named if
 * it is on offer, or the default.
 */
export function chosenSale(offer: SaleOffer, named?: string): SaleOption | null {
  if (named === SELL_NOTHING) return null;
  return offer.options.find((o) => o.sale === named) ?? offer.default;
}

interface DockingResult {
  state: GameState;
  events: EventDraft[];
  /** Planet docked at, if any. */
  planetId?: string;
}

/**
 * @param arriving false when the ship was already moored when its turn began:
 *   it is holding a berth it already holds, which is not a visit.
 * @param named the sale the player named for the visit, if any (a
 *   `dock_sale` action).
 */
export function processDocking(
  state: GameState,
  playerIndex: number,
  arriving = true,
  named?: string
): DockingResult {
  const player = state.players[playerIndex];
  if (isDestroyed(player.ship)) return { state, events: [] };
  if (!arriving) return { state, events: [] };
  const station = getStationAt(state.stations, positionOf(player.ship));
  if (!station) return { state, events: [] };

  const planetId = station.planetId;
  const offer = salesOnArrival(
    {
      cargo: player.cargo,
      missions: player.missions,
      reactionMass: player.ship.reactionMass,
      soldAt: player.soldAt,
    },
    planetId
  );
  const sale = chosenSale(offer, named);
  const sold = sale && sale.kind !== "fuel" ? player.cargo.find((c) => c.id === sale.sale)! : null;
  const loaded = waitingCrates(player.cargo, planetId);
  const events: EventDraft[] = [];

  if (sold) {
    events.push({
      type: "cargo_delivered",
      playerId: player.id,
      cargoId: sold.id,
      kind: sold.kind,
      planetId,
    });
  }
  for (const item of loaded) {
    events.push({
      type: "cargo_picked_up",
      playerId: player.id,
      cargoId: item.id,
      kind: item.kind,
      planetId,
    });
  }
  const cargo = player.cargo
    .filter((c) => c !== sold)
    .map((c) => (loaded.includes(c) ? { ...c, isPickedUp: true } : c));

  // Repairs, a reload and full hull, whatever is sold.
  const repaired = repairAllSubsystems(player.ship);
  const reloaded = reloadMissiles(repaired.ship);
  // A dock puts the ship back to full hull. Capping it at 2 was measured on
  // 17 Sept 2026: a quarter more kills, but the no-weapon hull it was aimed at
  // did not budge (+13 to +12), because that hull was never healing anyway.
  const hullRestored = reloaded.ship.maxHitPoints - reloaded.ship.hitPoints;
  let ship = { ...reloaded.ship, hitPoints: reloaded.ship.hitPoints + hullRestored };

  events.push({
    type: "docked",
    playerId: player.id,
    planetId,
    hullRestored,
    repaired: repaired.repaired,
    missilesReloaded: reloaded.reloaded,
    sold: sale?.kind ?? null,
  });

  // Tanker: the card's fuel goes into the drums and the card is done.
  if (sale?.kind === "fuel") {
    ship = { ...ship, reactionMass: ship.reactionMass - TANKER_FUEL };
    events.push({ type: "fuel_pumped", playerId: player.id, amount: TANKER_FUEL, planetId });
  }

  const soldAt = sale ? [...player.soldAt, planetId] : player.soldAt;
  const players = [...state.players];
  players[playerIndex] = { ...player, ship, cargo, soldAt };
  return { state: { ...state, players }, events, planetId };
}
