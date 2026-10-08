/**
 * Escort: who a marker may go on, the marking, and whether the escort rides
 * along at a sale (RULES §Missions). "Mark: while on the same ring as an
 * undocked rival carrying cargo, and not moored, put your marker on it." A
 * ship carries one Escort marker, so a ship already marked by anyone takes no
 * second one, and a ship just back from Home takes none (nobody can touch
 * it). The marker is a choice, an `escort_mark` action in the sequence taken
 * at its place in the turn (actionProcessors.ts); this is the one question the
 * referee, the bots, the seat CLI and the table's plan all ask, so the four
 * agree.
 */
import type { GameState, Player, Position, Station } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { EscortMission, Mission } from "../models/missions.ts";
import { aboard } from "../models/missions.ts";
import type { GameView } from "./view.ts";
import { positionOf } from "./geometry.ts";
import { isMooredAt, isMooredMidTurn } from "./stations.ts";
import { isDestroyed, isOnBoard } from "./ship.ts";

/**
 * A seat as the question needs it: where it is (null off the board), whether
 * it is just back from Home, whether it carries anything, and whether
 * someone's Escort marker is already on it.
 */
interface EscortSeat {
  id: string;
  position: Position | null;
  recovering: boolean;
  carrying: boolean;
  escorted: boolean;
}

/** Undone Escorts whose marker is still in hand, in hand order. */
export function unplacedEscorts(missions: readonly Mission[]): EscortMission[] {
  return missions.filter(
    (m): m is EscortMission => m.type === "escort" && !m.isCompleted && m.markedPlayerId === null
  );
}

/**
 * Whether an escort rides with its carrier at a sale at `planetId`'s station:
 * its ship is on the board and in that planet's well, on any ring, moored or
 * not. Asked at the moment of the sale, by the payment and by a carrier that
 * dies later the same turn, so the two cannot disagree.
 */
export function escortPresent(escort: Pick<Player, "ship">, planetId: string): boolean {
  return !isDestroyed(escort.ship) && escort.ship.wellId === planetId;
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
 * next seat after the escort: rivals on the board on that well's ring, in any
 * sector, with a crate or data aboard, not just back from Home, neither ship
 * moored, and no ship that already carries an Escort marker (anyone's: a ship
 * takes one). The escort must not be moored: during its own actions that is
 * the berth it began the turn on and has not left (`isMooredMidTurn`, as for
 * firing). Empty when the hand holds no marker to place.
 */
function candidates(
  seats: readonly EscortSeat[],
  stations: Station[],
  escortId: string,
  missions: readonly Mission[],
  start: Position,
  position: Position
): string[] {
  if (unplacedEscorts(missions).length === 0) return [];
  // A berth marks nobody.
  if (isMooredMidTurn(stations, start, position)) return [];
  const taken = markedBy({ missions });
  const self = seats.findIndex((s) => s.id === escortId);
  const out: string[] = [];
  for (let step = 1; step < seats.length; step++) {
    const seat = seats[(Math.max(self, 0) + step) % seats.length];
    if (seat.id === escortId || taken.has(seat.id) || seat.escorted) continue;
    if (!seat.position || !seat.carrying || seat.recovering) continue;
    if (seat.position.wellId !== position.wellId || seat.position.ring !== position.ring) continue;
    if (isMooredAt(stations, seat.position)) continue;
    out.push(seat.id);
  }
  return out;
}

/**
 * From a seat's own view: the carriers its marker could go on with its ship
 * at `position`, having begun the turn at `start` (where it is now, when
 * left out). Only the viewer knows its own hand, so any other seat gets an
 * empty list.
 */
export function escortCandidates(
  view: GameView,
  playerId: string,
  position: Position,
  start?: Position
): string[] {
  const me = view.me;
  if (!me || me.id !== playerId) return [];
  const seats: EscortSeat[] = view.players.map((p) => ({
    id: p.id,
    position: p.ship && !p.ship.isDestroyed ? positionOf(p.ship) : null,
    recovering: p.recovering,
    carrying: p.cargoCount > 0,
    escorted: p.escortedBy.length > 0,
  }));
  return candidates(
    seats,
    view.stations,
    playerId,
    me.missions,
    start ?? positionOf(me.ship),
    position
  );
}

/**
 * The referee's side, at a point in `escortId`'s turn that began at `start`,
 * against the table as it stands then (a carrier a pirate has just emptied is
 * no longer one). A destroyed escort places nothing.
 */
export function escortCandidatesNow(state: GameState, escortId: string, start: Position): string[] {
  const escort = state.players.find((p) => p.id === escortId);
  if (!escort || isDestroyed(escort.ship)) return [];
  const seats: EscortSeat[] = state.players.map((p) => ({
    id: p.id,
    position: isOnBoard(p) ? positionOf(p.ship) : null,
    recovering: p.recovering,
    carrying: aboard(p.cargo).length > 0,
    escorted: state.players.some((other) => markedBy(other).has(p.id)),
  }));
  return candidates(
    seats,
    state.stations,
    escortId,
    escort.missions,
    start,
    positionOf(escort.ship)
  );
}

/**
 * The marking itself, validated: the first undone Escort whose marker is in
 * hand goes on `carrierId`. Public: the marker is face-up.
 */
export function markCarrier(
  state: GameState,
  escortId: string,
  carrierId: string
): { state: GameState; event: EventDraft } {
  const escort = state.players.find((p) => p.id === escortId)!;
  const mission = unplacedEscorts(escort.missions)[0];
  const players = state.players.map(
    (p): Player =>
      p.id === escortId
        ? {
            ...p,
            missions: p.missions.map((m) =>
              m.id === mission.id ? { ...mission, markedPlayerId: carrierId } : m
            ),
          }
        : p
  );
  return {
    state: { ...state, players },
    event: { type: "escort_marked", escortId, carrierId, missionId: mission.id },
  };
}
