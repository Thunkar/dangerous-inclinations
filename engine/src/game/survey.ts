/**
 * Survey (RULES §Missions): "Survey: while on Black Hole Ring 1, take the
 * data." The dive is a `survey` action, taken at its place in the turn
 * (actionProcessors.ts); this is the one question the referee, the bots, the
 * seat CLI and the table's plan all ask, so the four agree. Nothing is taken
 * unless it is named.
 */
import type { GameState, Player, Position } from "../models/game.ts";
import type { EventDraft } from "../models/events.ts";
import type { Cargo, Mission, SurveyMission } from "../models/missions.ts";
import { SURVEY_RING, dataAboard, withItemAboard } from "../models/missions.ts";
import { BLACK_HOLE_ID } from "../models/gravityWells.ts";

/** The hand and hold the question needs: a seat's own (only it knows its cards). */
type Hand = { readonly missions: readonly Mission[]; readonly cargo: readonly Cargo[] };

/** Whether `position` is the dive: the black hole's innermost ring, any sector. */
export function onSurveyRing(position: Position): boolean {
  return position.wellId === BLACK_HOLE_ID && position.ring === SURVEY_RING;
}

/**
 * The card a dive takes data for: the first undone Survey in hand order with
 * no data aboard. Two of a kind are two jobs, so one dive takes one card's.
 */
export function surveyToTake(hand: Hand): SurveyMission | undefined {
  return hand.missions.find(
    (m): m is SurveyMission => m.type === "survey" && !m.isCompleted && !dataAboard(hand, m)
  );
}

/** Whether a `survey` with the ship at `position` takes data: a card wants it and the ship is on the ring. */
export function canSurvey(hand: Hand, position: Position): boolean {
  return onSurveyRing(position) && surveyToTake(hand) !== undefined;
}

/**
 * The dive itself, validated: the first card's data goes aboard. Data a
 * pirate took is still in the hold, un-picked: the dive that takes it again
 * puts the same data back aboard. Private: nobody can tell which card the
 * data is for, only that data came aboard.
 */
export function takeSurveyData(
  state: GameState,
  playerId: string
): { state: GameState; event: EventDraft } {
  const player = state.players.find((p) => p.id === playerId)!;
  const mission = surveyToTake(player)!;
  const data: Cargo = {
    id: mission.dataCargoId,
    missionId: mission.id,
    kind: "data",
    deliveryPlanetId: "any",
    isPickedUp: true,
  };
  const players = state.players.map(
    (p): Player => (p.id === playerId ? { ...p, cargo: withItemAboard(p.cargo, data) } : p)
  );
  return {
    state: { ...state, players },
    event: {
      type: "data_acquired",
      playerId,
      kind: "survey",
      missionId: mission.id,
      privateTo: [playerId],
    },
  };
}
