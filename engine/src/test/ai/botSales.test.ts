/**
 * The bots and one sale per station: the primary's station is reserved for
 * the primary's item, secondaries sell at stations not sold at and not
 * reserved, and a card with no station left is dropped and logged.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { SELL_NOTHING } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { REPAIR_GOAL_ID } from "../../ai/behaviors/missions.ts";
import { saleBlocked } from "../../ai/behaviors/sales.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  destroyMission,
  getPlayer,
  interceptMission,
  makeGameState,
  makePlayer,
  surveyMission,
  takenData,
  withPlayer,
  withShip,
  withSub,
} from "../testUtils.ts";

const SURVEY = surveyMission();
const SURVEY_DATA: Cargo = takenData(SURVEY);
/** An Intercept filed at Alpha, its target far away and not yet scanned. */
const INTERCEPT = interceptMission("p2", "intercept-p2", ALPHA);

/** p1 one coast short of Alpha's station with this hand and hold; p2 far off. */
function nearAlpha(missions: Mission[], cargo: Cargo[], soldAt: string[] = []): GameState {
  const base = makeGameState([
    makePlayer("p1"),
    makePlayer("p2", { wellId: BH, ring: 5, sector: 12 }),
  ]);
  const state = makeGameState([
    makePlayer("p1", { wellId: ALPHA, ring: STATION_RING, sector: approachSector(base, ALPHA) }),
    base.players[1],
  ]);
  return withPlayer(state, "p1", { missions, cargo, soldAt });
}

const goalOf = (state: GameState) =>
  analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).currentGoal;

describe("bots and one sale per station", () => {
  it.each<[string, Mission, string[], string | null]>([
    // primary, sold at, where the Survey data goes (null: no trip)
    ["no reservation: the nearest station", destroyMission("p2"), [], ALPHA],
    ["the nearest station sold at: another one", destroyMission("p2"), [ALPHA], "any-other"],
    ["the Intercept's station is kept for it", INTERCEPT, [], "any-other"],
    ["the only unsold station is the Intercept's: the card waits", INTERCEPT, [BETA, GAMMA], null],
  ])("Survey data aboard, %s", (_label, primary, soldAt, expected) => {
    const state = nearAlpha([primary, SURVEY], [SURVEY_DATA], soldAt);
    const goal = goalOf(state);
    const filing = goal?.missionId === SURVEY.id ? goal.planetId : null;
    if (expected === "any-other") {
      expect(filing).not.toBeNull();
      expect([ALPHA, ...soldAt]).not.toContain(filing);
    } else {
      expect(filing).toBe(expected);
    }
  });

  it.each<[string, Mission, string[], "dead" | "waiting" | null]>([
    ["a Survey with stations left is playable", SURVEY, [ALPHA], null],
    ["a Survey with every station sold at is dead", SURVEY, [ALPHA, BETA, GAMMA], "dead"],
    ["a Survey whose one station left is the Intercept's waits", SURVEY, [BETA, GAMMA], "waiting"],
    ["an Intercept whose station is sold at is dead", INTERCEPT, [ALPHA], "dead"],
    ["an Intercept with its station unsold is playable", INTERCEPT, [BETA, GAMMA], null],
  ])("%s", (_label, card, soldAt, expected) => {
    const me = { missions: [INTERCEPT, SURVEY], cargo: [SURVEY_DATA], soldAt };
    expect(saleBlocked(me, card)).toBe(expected);
  });

  it("drops a dead card and says so in the decision log", () => {
    const state = nearAlpha([destroyMission("p2"), SURVEY], [SURVEY_DATA], [ALPHA, BETA, GAMMA]);
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(goalOf(state)?.missionId).not.toBe(SURVEY.id);
    expect(decision.log.reasoning.some((r) => r.startsWith("Card dead: survey"))).toBe(true);
  });

  it.each<[string, Mission, boolean]>([
    // primary, whether the Survey data is filed on the repair stop
    ["files the Survey data on a repair stop with no reservation", destroyMission("p2"), true],
    ["sells nothing on a repair stop at the Intercept's station", INTERCEPT, false],
  ])("%s", (_label, primary, files) => {
    let state = nearAlpha([primary, SURVEY], [SURVEY_DATA]);
    state = withShip(state, "p1", { hitPoints: 3 });
    state = withSub(state, "p1", "engines", { isBroken: true });
    expect(goalOf(state)).toMatchObject({ missionId: REPAIR_GOAL_ID, planetId: ALPHA });

    const actions = botDecideActions(viewFor(state, "p1")).actions;
    const named = actions.find((a) => a.type === "dock_sale")?.data;
    expect(named).toEqual({ sale: files ? SURVEY_DATA.id : SELL_NOTHING });
    const result = executeTurn(state, actions);
    expect(result.errors).toBeUndefined();
    const p1 = getPlayer(result.gameState, "p1");
    expect(p1.cargo.some((c) => c.id === SURVEY_DATA.id)).toBe(!files);
    expect(p1.soldAt).toEqual(files ? [ALPHA] : []);
  });
});
