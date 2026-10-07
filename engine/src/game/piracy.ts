/**
 * Piracy (RULES §Missions): what a pirate may take. "End a turn, not moored,
 * on an undocked ship carrying cargo: you may take one item of your choice
 * from it." The choice is declared with the turn as a `seize` action and
 * settled at the end of it (missions/missionChecks.ts); this is the one
 * question the referee, the bots, the seat CLI and the table's plan all ask,
 * so the four agree. Nothing is taken unless it is named.
 */
import type { Player, Position, Station } from "../models/game.ts";
import type { Cargo, HoldItemKind, Mission, PiracyMission } from "../models/missions.ts";
import { aboard, holdItemKind } from "../models/missions.ts";
import type { GameView } from "./view.ts";
import { positionOf, samePosition } from "./geometry.ts";
import { isMooredAt } from "./stations.ts";
import { isDestroyed, isOnBoard } from "./ship.ts";

/** One item a pirate could take, as a `seize` action names it. */
export interface SeizableItem {
  victimId: string;
  cargoId: string;
  kind: HoldItemKind;
}

/** A seat as the question needs it: where it is (null off the board) and what it carries. */
interface PiracySeat {
  id: string;
  position: Position | null;
  items: readonly { cargoId: string; kind: HoldItemKind }[];
}

/**
 * Undone Piracy cards with no loot of their own aboard, in hand order: each
 * may take one item. A card whose loot is aboard has taken its item and sells
 * it before it takes another.
 */
export function freePiracyCards(
  missions: readonly Mission[],
  cargo: readonly Cargo[]
): PiracyMission[] {
  return missions.filter(
    (m): m is PiracyMission =>
      m.type === "piracy" &&
      !m.isCompleted &&
      !cargo.some((c) => c.id === m.cargoId && c.isPickedUp)
  );
}

/**
 * Every item on a rival in `position`'s sector, in seat order from the next
 * seat after the pirate and then in the order each hold carries them. Neither
 * ship may be moored: a berth is not a place cargo changes hands.
 */
function candidates(
  seats: readonly PiracySeat[],
  stations: Station[],
  pirateId: string,
  position: Position
): SeizableItem[] {
  if (isMooredAt(stations, position)) return [];
  const self = seats.findIndex((s) => s.id === pirateId);
  const out: SeizableItem[] = [];
  for (let step = 1; step < seats.length; step++) {
    const seat = seats[(Math.max(self, 0) + step) % seats.length];
    if (seat.id === pirateId || !seat.position) continue;
    if (!samePosition(seat.position, position)) continue;
    for (const item of seat.items)
      out.push({ victimId: seat.id, cargoId: item.cargoId, kind: item.kind });
  }
  return out;
}

/**
 * From a seat's own view: the items it could take if its turn ends at
 * `position`. Empty with no free Piracy card, or for any seat but the viewer
 * (only the viewer knows its own hand).
 */
export function seizableItems(
  view: GameView,
  playerId: string,
  position: Position
): SeizableItem[] {
  const me = view.me;
  if (!me || me.id !== playerId) return [];
  if (freePiracyCards(me.missions, me.cargo).length === 0) return [];
  const seats: PiracySeat[] = view.players.map((p) => ({
    id: p.id,
    position: p.ship && !p.ship.isDestroyed ? positionOf(p.ship) : null,
    items: p.hold,
  }));
  return candidates(seats, view.stations, playerId, position);
}

/**
 * The referee's side, at the end of `pirateId`'s turn, against the table as
 * it stands then: every item the pirate's ship could take, whatever its hand
 * (the caller counts the cards). A destroyed pirate takes nothing.
 */
export function seizableItemsAtEndOfTurn(
  players: readonly Player[],
  stations: Station[],
  pirateId: string
): SeizableItem[] {
  const pirate = players.find((p) => p.id === pirateId);
  if (!pirate || isDestroyed(pirate.ship)) return [];
  const seats: PiracySeat[] = players.map((p) => ({
    id: p.id,
    position: isOnBoard(p) ? positionOf(p.ship) : null,
    items: aboard(p.cargo).map((c) => ({ cargoId: c.id, kind: holdItemKind(c) })),
  }));
  return candidates(seats, stations, pirateId, positionOf(pirate.ship));
}
