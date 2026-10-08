/**
 * Piracy (RULES §Missions): what a pirate may take, and the taking. "Seize is
 * an action in your sequence: while you share a sector with an undocked ship
 * carrying cargo, and you are not moored, you take one item of your choice
 * from it." The item is named with a `seize` action and taken at its place in
 * the turn (actionProcessors.ts); this is the one question the referee, the
 * bots, the seat CLI and the table's plan all ask, so the four agree. Nothing
 * is taken unless it is named.
 */
import type { GameState, Player, Position, Station } from "../models/game.ts";
import { isQuietTurn } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo, HoldItemKind, Mission, PiracyMission } from "../models/missions.ts";
import { aboard, holdItemKind, withItemAboard } from "../models/missions.ts";
import type { GameView } from "./view.ts";
import { positionOf, samePosition } from "./geometry.ts";
import { isMooredAt, isMooredMidTurn } from "./stations.ts";
import { isDestroyed, isOnBoard } from "./ship.ts";

/** One item a pirate could take, as a `seize` action names it. */
export interface SeizableItem {
  victimId: string;
  cargoId: string;
  kind: HoldItemKind;
}

/**
 * A seat as the question needs it: where it is (null off the board), whether
 * it is just back from Home, and what it carries.
 */
interface PiracySeat {
  id: string;
  position: Position | null;
  recovering: boolean;
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
 * seat after the pirate and then in the order each hold carries them. The
 * pirate must not be moored: during its own actions that is the berth it
 * began the turn on and has not left (`isMooredMidTurn`, as for firing). The
 * victim must be undocked (on no station's sector) and not just back from
 * Home: a ship nobody can touch is not seized from either.
 */
function candidates(
  seats: readonly PiracySeat[],
  stations: Station[],
  pirateId: string,
  start: Position,
  position: Position
): SeizableItem[] {
  if (isMooredMidTurn(stations, start, position)) return [];
  const self = seats.findIndex((s) => s.id === pirateId);
  const out: SeizableItem[] = [];
  for (let step = 1; step < seats.length; step++) {
    const seat = seats[(Math.max(self, 0) + step) % seats.length];
    if (seat.id === pirateId || !seat.position || seat.recovering) continue;
    if (!samePosition(seat.position, position) || isMooredAt(stations, seat.position)) continue;
    for (const item of seat.items)
      out.push({ victimId: seat.id, cargoId: item.cargoId, kind: item.kind });
  }
  return out;
}

/**
 * From a seat's own view: the items it could take with its ship at
 * `position`, having begun the turn at `start` (where it is now, when left
 * out). Empty with no free Piracy card, on a quiet turn (the opening round,
 * or the first turn back from Home), or for any seat but the viewer (only
 * the viewer knows its own hand).
 */
export function seizableItems(
  view: GameView,
  playerId: string,
  position: Position,
  start?: Position
): SeizableItem[] {
  const me = view.me;
  if (!me || me.id !== playerId) return [];
  // A quiet turn reaches nobody: no shot, no scan, no seizure.
  if (isQuietTurn(view.turn, me)) return [];
  if (freePiracyCards(me.missions, me.cargo).length === 0) return [];
  const seats: PiracySeat[] = view.players.map((p) => ({
    id: p.id,
    position: p.ship && !p.ship.isDestroyed ? positionOf(p.ship) : null,
    recovering: p.recovering,
    items: p.hold,
  }));
  return candidates(seats, view.stations, playerId, start ?? positionOf(me.ship), position);
}

/**
 * The referee's side, at a point in `pirateId`'s turn that began at `start`,
 * against the table as it stands then: every item the pirate's ship could
 * take where it is, whatever its hand (the caller counts the cards). A
 * destroyed pirate takes nothing, and nor does one on a quiet turn.
 */
export function seizableItemsNow(
  state: GameState,
  pirateId: string,
  start: Position
): SeizableItem[] {
  const pirate = state.players.find((p) => p.id === pirateId);
  if (!pirate || isDestroyed(pirate.ship)) return [];
  if (isQuietTurn(state.turn, pirate)) return [];
  const seats: PiracySeat[] = state.players.map((p) => ({
    id: p.id,
    position: isOnBoard(p) ? positionOf(p.ship) : null,
    recovering: p.recovering,
    items: aboard(p.cargo).map((c) => ({ cargoId: c.id, kind: holdItemKind(c) })),
  }));
  return candidates(seats, state.stations, pirateId, start, positionOf(pirate.ship));
}

/**
 * The seizure itself, validated: `cargoId` comes off the victim's hold and
 * the pirate's first free Piracy card's loot goes aboard. What the victim
 * loses goes back to undone: the item is off the hold, a Deliver holder
 * loads again at its pickup station, a Survey dives again, an Intercept
 * scans again, and a pirate who has been pirated has to seize again. The
 * card that took it has its loot aboard, so it is no longer free: the next
 * `seize` of the turn takes the next card.
 */
export function seizeItem(
  state: GameState,
  pirateId: string,
  victimId: string,
  cargoId: string
): { state: GameState; event: EventDraft } {
  const pirate = state.players.find((p) => p.id === pirateId)!;
  const taken = state.players
    .find((p) => p.id === victimId)!
    .cargo.find((c) => c.id === cargoId && c.isPickedUp)!;
  const mission = freePiracyCards(pirate.missions, pirate.cargo)[0];
  // The loot rides as the card's own item whatever was taken, loot to
  // everyone watching. Seized before and lost since, it is the same item
  // coming back aboard.
  const loot: Cargo = {
    id: mission.cargoId,
    missionId: mission.id,
    kind: "crate",
    deliveryPlanetId: "any",
    isPickedUp: true,
  };
  const players = state.players.map((p): Player => {
    if (p.id === pirateId) return { ...p, cargo: withItemAboard(p.cargo, loot) };
    if (p.id === victimId)
      return {
        ...p,
        // The card the item was doing goes back to undone with it: a Deliver
        // reloads its crate, a Survey or an Intercept has no data aboard.
        cargo: p.cargo.map((c) => (c.id === taken.id ? { ...c, isPickedUp: false } : c)),
      };
    return p;
  });
  return {
    state: { ...state, players },
    event: {
      type: "cargo_seized",
      pirateId,
      victimId,
      kind: taken.kind,
      cargoId: taken.id,
      at: positionOf(pirate.ship),
    },
  };
}
