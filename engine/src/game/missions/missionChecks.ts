/**
 * Mission progress and completion, driven by the events of the turn.
 *
 * Called once at the end of the active player's turn with everything that
 * happened. Completed missions are flipped face-up (public event).
 */
import type { GameState, Player } from "../../models/game.ts";
import type { EventDraft } from "../../models/events.ts";
import type { SecondaryMission, Mission } from "../../models/missions.ts";
import { MISSIONS_TO_WIN, SURVEY_RING, missionPoints } from "../../models/missions.ts";
import { BLACK_HOLE_ID } from "../../models/gravityWells.ts";
import { isDestroyed } from "../ship.ts";

/**
 * Whether a secondary card's thing has been done, read off the board at the end
 * of the turn — and, for the grand tour, the wells ticked off so far.
 *
 * A wreck does nothing: a destroyed ship is off the board until it is
 * rebuilt at Home.
 */
function secondaryDone(mission: SecondaryMission, player: Player, state: GameState): boolean {
  const ship = player.ship;
  if (isDestroyed(ship)) return false;
  switch (mission.type) {
    case "survey":
      // The dive: the innermost ring of the black hole, held to the end of a turn.
      return ship.wellId === BLACK_HOLE_ID && ship.ring === SURVEY_RING;
    case "board": {
      // Matched orbits with somebody: the same well, ring and sector.
      return state.players.some(
        (p) =>
          p.id !== player.id &&
          p.hasDeployed &&
          !isDestroyed(p.ship) &&
          p.ship.wellId === ship.wellId &&
          p.ship.ring === ship.ring &&
          p.ship.sector === ship.sector
      );
    }
  }
}

export interface MissionCheckResult {
  state: GameState;
  events: EventDraft[];
}

/**
 * Apply the turn's events to the active player's missions.
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

  for (const e of turnEvents) {
    if (e.type === "ship_destroyed" && e.killerId === playerId) kills.add(e.victimId);
    if (e.type === "cargo_delivered" && e.playerId === playerId) {
      deliveredCargoIds.add(e.cargoId);
    }
  }

  let cargo = player.cargo;
  let completed = 0;

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
        if (mission.scanAcquired && deliveredCargoIds.has(mission.dataCargoId))
          next = { ...mission, isCompleted: true };
        break;
      case "garbage_disposal": {
        // The load goes over the side on the innermost ring: no chit, no
        // filing, the card is done the moment the hold is empty again.
        const load = cargo.find((c) => c.id === mission.cargoId);
        const overTheSide =
          load?.isPickedUp === true &&
          !isDestroyed(player.ship) &&
          player.ship.wellId === BLACK_HOLE_ID &&
          player.ship.ring === SURVEY_RING;
        if (overTheSide) {
          cargo = cargo.filter((c) => c.id !== mission.cargoId);
          next = { ...mission, isCompleted: true };
          events.push({
            type: "cargo_dumped",
            playerId,
            cargoId: mission.cargoId,
            at: { wellId: player.ship.wellId, ring: player.ship.ring, sector: player.ship.sector },
          });
        }
        break;
      }
      case "survey":
      case "board": {
        let m = mission;
        if (!m.acquired) {
          if (secondaryDone(m, player, state)) {
            m = { ...m, acquired: true };
            cargo = [
              ...cargo,
              {
                id: m.dataCargoId,
                missionId: m.id,
                kind: "data",
                deliveryPlanetId: m.deliveryPlanetId,
                isPickedUp: true,
              },
            ];
            events.push({
              type: "data_acquired",
              playerId,
              kind: m.type,
              missionId: m.id,
              privateTo: [playerId],
            });
          }
        }
        if (m.acquired && deliveredCargoIds.has(m.dataCargoId)) m = { ...m, isCompleted: true };
        next = m;
        break;
      }
    }

    if (next.isCompleted) completed += missionPoints(next.type);
    return next;
  });

  if (
    completed === 0 &&
    cargo === player.cargo &&
    missions.every((m, i) => m === player.missions[i])
  ) {
    return { state, events };
  }

  const completedMissionCount = player.completedMissionCount + completed;
  for (const m of missions) {
    const before = player.missions.find((pm) => pm.id === m.id);
    if (m.isCompleted && before && !before.isCompleted) {
      events.push({
        type: "mission_completed",
        playerId,
        mission: m,
        completedCount: completedMissionCount,
      });
    }
  }

  const players = [...state.players];
  players[index] = { ...player, missions, cargo, completedMissionCount };
  return { state: { ...state, players }, events };
}

/** The first seat, in turn order, that has reached the points needed to trigger the final round. */
export function checkForWinner(state: GameState): Player | undefined {
  return state.players.find((p) => p.completedMissionCount >= MISSIONS_TO_WIN);
}

export type Decider = "points" | "hull" | "fuel" | "seat";

/**
 * Standings: most points, then most hull, then most fuel, then the earlier
 * seat. Used when the final round has been played out and at the simulator's
 * turn cap. Also says what separated first from second.
 */
export function rankPlayers(state: GameState): { ranked: Player[]; decidedBy: Decider } {
  const ranked = [...state.players].sort(
    (a, b) =>
      b.completedMissionCount - a.completedMissionCount ||
      b.ship.hitPoints - a.ship.hitPoints ||
      b.ship.reactionMass - a.ship.reactionMass ||
      state.players.indexOf(a) - state.players.indexOf(b)
  );
  const [first, second] = ranked;
  const decidedBy: Decider = !second
    ? "points"
    : first.completedMissionCount !== second.completedMissionCount
      ? "points"
      : first.ship.hitPoints !== second.ship.hitPoints
        ? "hull"
        : first.ship.reactionMass !== second.ship.reactionMass
          ? "fuel"
          : "seat";
  return { ranked, decidedBy };
}

/** Face-up cards: the missions a player has completed. Public information. */
export function completedMissions(player: Player): Mission[] {
  return player.missions.filter((m) => m.isCompleted);
}
