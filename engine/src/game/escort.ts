/**
 * Escort: who a marker may go on (RULES §Missions). "End a turn, not moored,
 * in the same sector as an undocked rival carrying cargo while holding an
 * undone Escort whose marker is in hand, and you may put your marker on that
 * ship." A ship carries one Escort marker, so a ship already marked by anyone
 * takes no second one. The marker is a choice, declared with the turn as an `escort_mark`
 * action and settled at the end of it; this is the one question the referee,
 * the bots, the seat CLI and the table's plan all ask, so the four agree.
 */
import type { Player, Position, Station } from "../models/game.ts";
import type { EscortMission, Mission } from "../models/missions.ts";
import { aboard } from "../models/missions.ts";
import type { GameView } from "./view.ts";
import { positionOf, samePosition } from "./geometry.ts";
import { isMooredAt } from "./stations.ts";
import { isDestroyed } from "./ship.ts";

/**
 * A seat as the question needs it: where it is (null off the board), whether
 * it carries anything, and whether someone's Escort marker is already on it.
 */
interface EscortSeat {
  id: string;
  position: Position | null;
  carrying: boolean;
  escorted: boolean;
}

/** Undone Escorts whose marker is still in hand, in hand order. */
export function unplacedEscorts(missions: readonly Mission[]): EscortMission[] {
  return missions.filter(
    (m): m is EscortMission => m.type === "escort" && !m.isCompleted && m.markedPlayerId === null
  );
}

/** The ships this player's undone Escort markers sit on. */
export function markedBy(player: { missions: readonly Mission[] }): Set<string> {
  return new Set(
    player.missions.flatMap((m) =>
      m.type === "escort" && !m.isCompleted && m.markedPlayerId !== null ? [m.markedPlayerId] : []
    )
  );
}

/**
 * The carriers a marker could go on from `position`, in seat order from the
 * next seat after the escort: rivals on the board in that sector, with a
 * crate or data aboard, neither ship moored, and no ship that already carries
 * an Escort marker (anyone's: a ship takes one). Empty when the hand holds no marker to place.
 */
function candidates(
  seats: readonly EscortSeat[],
  stations: Station[],
  escortId: string,
  missions: readonly Mission[],
  position: Position
): string[] {
  if (unplacedEscorts(missions).length === 0) return [];
  // Same sector means same berth: a carrier moored there is the escort moored there.
  if (isMooredAt(stations, position)) return [];
  const taken = markedBy({ missions });
  const self = seats.findIndex((s) => s.id === escortId);
  const out: string[] = [];
  for (let step = 1; step < seats.length; step++) {
    const seat = seats[(Math.max(self, 0) + step) % seats.length];
    if (seat.id === escortId || taken.has(seat.id) || seat.escorted) continue;
    if (!seat.position || !seat.carrying) continue;
    if (!samePosition(seat.position, position)) continue;
    out.push(seat.id);
  }
  return out;
}

/**
 * From a seat's own view: the carriers its marker could go on if its turn
 * ends at `position`. Only the viewer knows its own hand, so any other seat
 * gets an empty list.
 */
export function escortCandidates(view: GameView, playerId: string, position: Position): string[] {
  const me = view.me;
  if (!me || me.id !== playerId) return [];
  const seats: EscortSeat[] = view.players.map((p) => ({
    id: p.id,
    position:
      p.ship && !p.ship.isDestroyed
        ? { wellId: p.ship.wellId, ring: p.ship.ring, sector: p.ship.sector }
        : null,
    carrying: p.cargoCount > 0,
    escorted: p.escortedBy.length > 0,
  }));
  return candidates(seats, view.stations, playerId, me.missions, position);
}

/**
 * The referee's side, at the end of `escortId`'s turn, against the table as
 * it stands then (a carrier a pirate has just emptied is no longer one). A
 * destroyed escort places nothing.
 */
export function escortCandidatesAtEndOfTurn(
  players: readonly Player[],
  stations: Station[],
  escortId: string
): string[] {
  const escort = players.find((p) => p.id === escortId);
  if (!escort || isDestroyed(escort.ship)) return [];
  const seats: EscortSeat[] = players.map((p) => ({
    id: p.id,
    position: p.hasDeployed && !isDestroyed(p.ship) ? positionOf(p.ship) : null,
    carrying: aboard(p.cargo).length > 0,
    escorted: players.some((other) => markedBy(other).has(p.id)),
  }));
  return candidates(seats, stations, escortId, escort.missions, positionOf(escort.ship));
}
