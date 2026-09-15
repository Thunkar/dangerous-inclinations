/**
 * Mission progress and completion, driven by the events of the turn.
 *
 * Called once at the end of the active player's turn with everything that
 * happened. Completed missions are flipped face-up (public event).
 */
import type { GameState, Player } from "../../models/game.ts";
import type { EventDraft } from "../../models/events.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { MISSIONS_TO_WIN, SURVEY_HOLD_TURNS, SURVEY_RING } from "../../models/missions.ts";
import { BLACK_HOLE_ID } from "../../models/gravityWells.ts";
import { isDestroyed } from "../ship.ts";
import { rulesOf } from "../setup.ts";

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
  const rules = rulesOf(state);
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
        // The data is taken by ending SURVEY_HOLD_TURNS consecutive turns on the
        // innermost black hole ring with the sensor array powered; a turn ended
        // anywhere else, or dark, starts the count again.
        if (!m.surveyAcquired) {
          const onRing =
            !isDestroyed(player.ship) &&
            player.ship.wellId === BLACK_HOLE_ID &&
            player.ship.ring === SURVEY_RING;
          const sensing = player.ship.subsystems.some(
            (s) => s.type === "sensor_array" && s.isPowered && !s.isBroken
          );
          if (onRing && sensing) {
            const turns = m.surveyTurns + 1;
            m = { ...m, surveyTurns: turns };
            if (turns >= SURVEY_HOLD_TURNS) {
              m = { ...m, surveyAcquired: true };
              const data: Cargo = {
                id: m.dataCargoId,
                missionId: m.id,
                kind: "data",
                deliveryPlanetId: m.deliveryPlanetId,
                isPickedUp: true,
              };
              cargo = [...cargo, data];
              events.push({
                type: "data_acquired",
                playerId,
                kind: "survey",
                missionId: m.id,
                privateTo: [playerId],
              });
            } else {
              events.push({
                type: "survey_hold",
                playerId,
                missionId: m.id,
                turns,
                needed: SURVEY_HOLD_TURNS,
                privateTo: [playerId],
              });
            }
          } else if (m.surveyTurns > 0) {
            m = { ...m, surveyTurns: 0 };
          }
        }
        if (m.surveyAcquired && deliveredCargoIds.has(m.dataCargoId))
          m = { ...m, isCompleted: true };
        next = m;
        break;
      }
    }

    if (next.isCompleted) completed += next.type === "destroy_ship" ? rules.destroyPoints : 1;
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

export function checkForWinner(state: GameState): Player | undefined {
  return state.players.find((p) => p.completedMissionCount >= MISSIONS_TO_WIN);
}

/** Face-up cards: the missions a player has completed. Public information. */
export function completedMissions(player: Player): Mission[] {
  return player.missions.filter((m) => m.isCompleted);
}
