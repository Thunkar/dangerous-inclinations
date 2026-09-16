/**
 * Mission progress and completion, driven by the events of the turn.
 *
 * Called once at the end of the active player's turn with everything that
 * happened. Completed missions are flipped face-up (public event).
 */
import type { GameState, Player } from "../../models/game.ts";
import type { EventDraft } from "../../models/events.ts";
import type { Mission } from "../../models/missions.ts";
import { DESTROY_POINTS, MISSIONS_TO_WIN, SURVEY_RING } from "../../models/missions.ts";
import { BLACK_HOLE_ID } from "../../models/gravityWells.ts";
import { isDestroyed } from "../ship.ts";

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
      case "survey": {
        let m = mission;
        // The data is taken by ending a turn on the innermost black hole ring
        // with the sensor array powered. The dive is the mission.
        if (!m.surveyAcquired) {
          const onRing =
            !isDestroyed(player.ship) &&
            player.ship.wellId === BLACK_HOLE_ID &&
            player.ship.ring === SURVEY_RING;
          const sensing = player.ship.subsystems.some(
            (s) => s.type === "sensor_array" && s.isPowered && !s.isBroken
          );
          if (onRing && sensing) {
            m = { ...m, surveyAcquired: true };
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
              kind: "survey",
              missionId: m.id,
              privateTo: [playerId],
            });
          }
        }
        if (m.surveyAcquired && deliveredCargoIds.has(m.dataCargoId))
          m = { ...m, isCompleted: true };
        next = m;
        break;
      }
    }

    if (next.isCompleted) completed += next.type === "destroy_ship" ? DESTROY_POINTS : 1;
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
