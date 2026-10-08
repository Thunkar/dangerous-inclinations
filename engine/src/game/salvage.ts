/**
 * Salvage (RULES §Missions): "Salvage: while on a wreck's sector, take its
 * black box." The taking is a `salvage` action, naming the wreck or the first
 * one there, at its place in the turn (actionProcessors.ts); this is the one question the referee,
 * the bots, the seat CLI and the table's plan all ask, so the four agree.
 * Moored or not; the black box is data, filed at any station.
 */
import type { GameState, Player, Position, Wreck } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo, Mission, SalvageMission } from "../models/missions.ts";
import { withItemAboard } from "../models/missions.ts";
import { positionOf, samePosition } from "./geometry.ts";

/** The hand and hold the question needs: a seat's own (only it knows its cards). */
type Hand = { readonly missions: readonly Mission[]; readonly cargo: readonly Cargo[] };

/**
 * The card a wreck's black box goes to: the first undone Salvage in hand
 * order with no black box aboard. Two of a kind are two jobs, one wreck each.
 */
export function salvageToTake(hand: Hand): SalvageMission | undefined {
  return hand.missions.find(
    (m): m is SalvageMission =>
      m.type === "salvage" &&
      !m.isCompleted &&
      !hand.cargo.some((c) => c.id === m.cargoId && c.isPickedUp)
  );
}

/**
 * The wrecks a `salvage` could name with the ship at `position`: every wreck
 * on that sector, when a card wants a black box. Moored or not.
 */
export function salvageableWrecks(
  hand: Hand,
  wrecks: readonly Wreck[],
  position: Position
): Wreck[] {
  if (!salvageToTake(hand)) return [];
  return wrecks.filter((w) => samePosition(w, position));
}

/**
 * The wreck a `salvage` takes with the ship where it stands: the one it names,
 * or with no name the first wreck on the ship's sector in the order they were
 * left (a kill earlier in the turn leaves one there). Undefined when there is
 * none: a salvage that names no wreck and finds none is not taken.
 */
export function wreckToSalvage(
  state: GameState,
  playerId: string,
  wreckId: string | undefined
): Wreck | undefined {
  if (wreckId !== undefined) return state.wrecks.find((w) => w.id === wreckId);
  const player = state.players.find((p) => p.id === playerId)!;
  return state.wrecks.find((w) => samePosition(w, positionOf(player.ship)));
}

/**
 * The salvage itself, validated: the wreck comes off the board and the first
 * card's black box goes aboard. The same black box id as last time if a
 * pirate took it or it went down with the ship: one card, one cargo id.
 */
export function salvageWreck(
  state: GameState,
  playerId: string,
  wreckId: string
): { state: GameState; event: EventDraft } {
  const player = state.players.find((p) => p.id === playerId)!;
  const mission = salvageToTake(player)!;
  const blackBox: Cargo = {
    id: mission.cargoId,
    missionId: mission.id,
    kind: "data",
    deliveryPlanetId: "any",
    isPickedUp: true,
  };
  const players = state.players.map(
    (p): Player => (p.id === playerId ? { ...p, cargo: withItemAboard(p.cargo, blackBox) } : p)
  );
  return {
    state: { ...state, players, wrecks: state.wrecks.filter((w) => w.id !== wreckId) },
    event: {
      type: "wreck_salvaged",
      playerId,
      wreckId,
      cargoId: blackBox.id,
      at: positionOf(player.ship),
    },
  };
}
