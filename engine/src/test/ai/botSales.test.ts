/**
 * The bots and one sale per station: the primary's station is reserved for
 * the primary's item, secondaries sell at stations not sold at and not
 * reserved, and a card with no station left is dropped.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { SELL_NOTHING } from "../../models/missions.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { botDecideActions } from "../../ai/index.ts";
import { REPAIR_GOAL_ID } from "../../ai/behaviors/missions.ts";
import { saleBlocked } from "../../ai/behaviors/sales.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  destroyMission,
  interceptMission,
  surveyMission,
  takenData,
  withPlayer,
  withShip,
  withSub,
  makeTwoPlayerGame,
  shortOfStation,
  situationOf,
} from "../testUtils.ts";

const SURVEY = surveyMission();
const SURVEY_DATA: Cargo = takenData(SURVEY);
/** An Intercept filed at Alpha, its target far away and not yet scanned. */
const INTERCEPT = interceptMission("p2", "intercept-p2", ALPHA);

/** p1 one coast short of Alpha's station with this hand and hold; p2 far off. */
function nearAlpha(missions: Mission[], cargo: Cargo[], soldAt: string[] = []): GameState {
  const far = { wellId: BH, ring: 5, sector: 12 };
  const state = shortOfStation(makeTwoPlayerGame({}, far), "p1", ALPHA);
  return withPlayer(state, "p1", { missions, cargo, soldAt });
}

describe("bots and one sale per station", () => {
  it.each<[string, Mission, string[], string | null]>([
    // primary, sold at, where the Survey data goes (null: no trip)
    ["no reservation: the nearest station", destroyMission("p2"), [], ALPHA],
    // The Destroy is in, so the trip to another station is no detour from it.
    [
      "the nearest station sold at: another one",
      { ...destroyMission("p2"), isCompleted: true },
      [ALPHA],
      "any-other",
    ],
    ["the Intercept's station is kept for it", INTERCEPT, [], "any-other"],
    ["the only unsold station is the Intercept's: the card waits", INTERCEPT, [BETA, GAMMA], null],
  ])("Survey data aboard, %s", (_label, primary, soldAt, expected) => {
    const state = nearAlpha([primary, SURVEY], [SURVEY_DATA], soldAt);
    const goal = situationOf(state, "p1").currentGoal;
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

  it("makes no trip for a dead card", () => {
    const state = nearAlpha([destroyMission("p2"), SURVEY], [SURVEY_DATA], [ALPHA, BETA, GAMMA]);
    expect(situationOf(state, "p1").currentGoal?.missionId).not.toBe(SURVEY.id);
  });

  it.each<[string, Mission, boolean]>([
    // primary, whether the Survey data is filed on the repair stop
    ["repairs where the Survey data is filed with no reservation", destroyMission("p2"), true],
    ["sells nothing on a repair stop at the Intercept's station", INTERCEPT, false],
  ])("%s", (_label, primary, files) => {
    let state = nearAlpha([primary, SURVEY], [SURVEY_DATA]);
    state = withShip(state, "p1", { hitPoints: 3 });
    state = withSub(state, "p1", "engines", { isBroken: true });
    // Every dock repairs, so a job's station near enough is the repair stop.
    expect(situationOf(state, "p1").currentGoal).toMatchObject(
      files
        ? { missionId: SURVEY.id, repairs: true, planetId: ALPHA }
        : { missionId: REPAIR_GOAL_ID, planetId: ALPHA }
    );

    const actions = botDecideActions(viewFor(state, "p1")).actions;
    const named = actions.find((a) => a.type === "dock_sale")?.data;
    expect(named).toEqual({ sale: files ? SURVEY_DATA.id : SELL_NOTHING });
    expect(executeTurn(state, actions).errors).toBeUndefined();
  });
});
