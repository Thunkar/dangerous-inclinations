/**
 * Mission progress and completion, driven by the events of the turn.
 *
 * Called once at the end of the active player's turn with everything that
 * happened. Completed missions are flipped face-up (public event).
 */
import type { GameState, Player } from "../../models/game.ts";
import type { EventDraft } from "../../models/events.ts";
import type { PlayerView } from "../view.ts";
import type { EscortMission, Mission } from "../../models/missions.ts";
import { missionPoints } from "../../models/missions.ts";
import { escortPresent } from "../escort.ts";

/**
 * Escort completion: every other player's undone Escort marking a ship that
 * delivered, sold or filed anything, or pumped a Tanker's fuel, this turn is
 * done, if the escort's ship is in the well of the planet it sold at
 * (`escortPresent`). Those happen on the carrier's own turn, so this pays
 * players who are not the active one. `players` is written in place; the
 * events come back. `soldAt` maps each ship that sold to the planet it sold at.
 */
function payEscorts(players: Player[], soldAt: ReadonlyMap<string, string>): EventDraft[] {
  const events: EventDraft[] = [];
  if (soldAt.size === 0) return events;
  players.forEach((player, index) => {
    let earned = 0;
    const done: Mission[] = [];
    const missions = player.missions.map((m) => {
      if (m.type !== "escort" || m.isCompleted || m.markedPlayerId === null) return m;
      const planetId = soldAt.get(m.markedPlayerId);
      if (planetId === undefined || !escortPresent(player, planetId)) return m;
      const completed: EscortMission = { ...m, isCompleted: true };
      earned += missionPoints(completed.type);
      done.push(completed);
      return completed;
    });
    if (done.length === 0) return;
    const points = player.points + earned;
    players[index] = { ...player, missions, points };
    for (const mission of done) {
      events.push({
        type: "mission_completed",
        playerId: player.id,
        mission,
        points,
      });
    }
  });
  return events;
}

interface MissionCheckResult {
  state: GameState;
  events: EventDraft[];
}

/**
 * Apply the turn's events to the active player's missions: what the turn
 * completed (a kill, a sale, a Tanker's pump) and the Escorts the active
 * player's sales paid. Taking a survey's data, a black box or an Escort
 * marker is an action of the turn, not a check at its end (actionProcessors.ts).
 * @param turnEvents everything emitted so far this turn (actions, missiles, docking)
 */
export function processMissionEvents(
  state: GameState,
  playerId: string,
  turnEvents: EventDraft[]
): MissionCheckResult {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) return { state, events: [] };
  const player = state.players[index];
  const events: EventDraft[] = [];

  const kills = new Set<string>();
  const deliveredCargoIds = new Set<string>();
  /** Every ship that delivered, sold or filed anything, or pumped fuel, this turn, and where (Escort). */
  const deliveredBy = new Map<string, string>();
  let pumpedFuel = false;

  for (const e of turnEvents) {
    if (e.type === "ship_destroyed" && e.killerId === playerId) kills.add(e.victimId);
    if (e.type === "cargo_delivered") {
      deliveredBy.set(e.playerId, e.planetId);
      if (e.playerId === playerId) deliveredCargoIds.add(e.cargoId);
    }
    if (e.type === "fuel_pumped") {
      deliveredBy.set(e.playerId, e.planetId);
      if (e.playerId === playerId) pumpedFuel = true;
    }
  }

  const players = [...state.players];
  let completed = 0;

  // Two of a kind are two jobs: one fuel sale pays one Tanker, the first
  // undone card of the kind in hand order.
  let pumped = false;

  const missions: Mission[] = player.missions.map((mission) => {
    if (mission.isCompleted) return mission;
    let next: Mission = mission;

    switch (mission.type) {
      case "destroy_ship":
        if (kills.has(mission.targetPlayerId)) next = { ...mission, isCompleted: true };
        break;
      case "deliver_cargo":
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "intercept_transmission":
        // Only data aboard is filed, so filing it is the whole check.
        if (deliveredCargoIds.has(mission.dataCargoId)) next = { ...mission, isCompleted: true };
        break;
      case "piracy":
        // The loot is sold like any other item, at any station (game/docking.ts).
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "salvage":
        // The black box is data for "any" station.
        if (deliveredCargoIds.has(mission.cargoId)) next = { ...mission, isCompleted: true };
        break;
      case "tanker":
        // Paid by a visit that sells the fuel: the pumping is the card.
        if (pumpedFuel && !pumped) {
          pumped = true;
          next = { ...mission, isCompleted: true };
        }
        break;
      case "survey":
        // Only data aboard is filed, so filing it is the whole check.
        if (deliveredCargoIds.has(mission.dataCargoId)) next = { ...mission, isCompleted: true };
        break;
      case "escort":
        // Paid on the carrier's turn (`payEscorts`), not on the escort's.
        break;
    }

    if (next.isCompleted) completed += missionPoints(next.type);
    return next;
  });

  const points = player.points + completed;
  for (const m of missions) {
    const before = player.missions.find((pm) => pm.id === m.id);
    if (m.isCompleted && before && !before.isCompleted) {
      events.push({
        type: "mission_completed",
        playerId,
        mission: m,
        points,
      });
    }
  }

  const changed = completed > 0 || missions.some((m, i) => m !== player.missions[i]);
  if (changed) players[index] = { ...player, missions, points };
  // Everyone else's Escorts on a ship that delivered or pumped fuel this turn,
  // with the escort in that well: the carrier is the active player, so this
  // pays a card held at another seat.
  const escortEvents = payEscorts(players, deliveredBy);
  events.push(...escortEvents);

  if (!changed && escortEvents.length === 0) return { state, events };
  return { state: { ...state, players }, events };
}

/** The first seat, in turn order, that has reached the points needed to trigger the final round. */
export function checkForWinner(state: GameState): Player | undefined {
  return state.players.find((p) => p.points >= state.pointsToWin);
}

export type Decider = "points" | "hull" | "fuel" | "seat";

/** What the standings read off a seat: its points, its hull and its fuel. */
function standing(p: Player | PlayerView): { points: number; hull: number; fuel: number } {
  if ("isMe" in p)
    return { points: p.points, hull: p.ship?.hitPoints ?? 0, fuel: p.ship?.fuel ?? 0 };
  return { points: p.points, hull: p.ship.hitPoints, fuel: p.ship.reactionMass };
}

/**
 * Standings: most points, then most hull, then most fuel, then the earlier
 * seat. Used when the final round has been played out and at the simulator's
 * turn cap, and by anything that ranks the table from a view (all three are
 * public). Also says what separated first from second.
 */
export function rankPlayers<T extends Player | PlayerView>(table: {
  players: readonly T[];
}): { ranked: T[]; decidedBy: Decider } {
  const seat = (p: T) => table.players.indexOf(p);
  const ranked = [...table.players].sort((a, b) => {
    const x = standing(a);
    const y = standing(b);
    return y.points - x.points || y.hull - x.hull || y.fuel - x.fuel || seat(a) - seat(b);
  });
  const [first, second] = ranked.map(standing);
  const decidedBy: Decider = !second
    ? "points"
    : first.points !== second.points
      ? "points"
      : first.hull !== second.hull
        ? "hull"
        : first.fuel !== second.fuel
          ? "fuel"
          : "seat";
  return { ranked, decidedBy };
}

/** Face-up cards: the missions a player has completed. Public information. */
export function completedMissions(player: Player): Mission[] {
  return player.missions.filter((m) => m.isCompleted);
}
