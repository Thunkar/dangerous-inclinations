/**
 * The bots and Piracy: a pirate names the item that costs its victim most.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { viewFor } from "../../game/view.ts";
import { executeTurn } from "../../game/turns.ts";
import { botDecideActions } from "../../ai/index.ts";
import { seizeChoices } from "../../ai/behaviors/piracy.ts";
import {
  ALPHA,
  BETA,
  deliverMission,
  getPlayer,
  lootCargo,
  piracyMission,
  surveyMission,
  takenData,
  withPlayer,
  LANDING,
  alongside,
  crateOf,
} from "../testUtils.ts";

const PIRACY = piracyMission();
const CRATE = deliverMission(ALPHA, BETA, "deliver-p2");
const CRATE_ABOARD = crateOf(CRATE);
const SURVEY = surveyMission("survey-p3");
const LOOT = lootCargo("loot-p3", "piracy-p3");

/**
 * p1 the pirate one coast short of `LANDING`; p2 and p3 sitting there with the
 * holds given.
 */
function table(pirate: Mission[], p2: Cargo[], p3: Cargo[]): GameState {
  const state = alongside(pirate, [CRATE], LANDING, [SURVEY, piracyMission("piracy-p3")]);
  return withPlayer(withPlayer(state, "p2", { cargo: p2 }), "p3", { cargo: p3 });
}

describe("bots and Piracy", () => {
  it.each<[string, Mission[], Cargo[], Cargo[], string[]]>([
    [
      "a Deliver crate over loot and data",
      [PIRACY],
      [CRATE_ABOARD],
      [takenData(SURVEY), LOOT],
      [CRATE.cargoId],
    ],
    ["loot over data", [PIRACY], [], [takenData(SURVEY), LOOT], [LOOT.id]],
    ["data when that is all there is", [PIRACY], [], [takenData(SURVEY)], [SURVEY.dataCargoId]],
    [
      "two cards, the two best items",
      [PIRACY, piracyMission("piracy-2")],
      [CRATE_ABOARD],
      [takenData(SURVEY), LOOT],
      [CRATE.cargoId, LOOT.id],
    ],
    [
      "equal kinds in seat order from the pirate's left",
      [PIRACY],
      [lootCargo("loot-p2", "piracy-p2")],
      [LOOT],
      ["loot-p2"],
    ],
  ])("names %s", (_label, pirate, p2, p3, expected) => {
    const state = table(pirate, p2, p3);
    const choices = seizeChoices(viewFor(state, "p1"), getPlayer(state, "p1"), LANDING);
    expect(choices.map((c) => c.cargoId)).toEqual(expected);
  });

  it.each<[string, Mission[], string[]]>([
    ["with a free Piracy card seizes the crate", [PIRACY], [CRATE.cargoId]],
    ["with no Piracy card seizes nothing", [], []],
  ])("a bot coasting onto a carrier %s", (_label, pirate, expected) => {
    const state = table(pirate, [CRATE_ABOARD], [takenData(SURVEY)]);
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.flatMap((a) => (a.type === "seize" ? [a.data.cargoId] : []))).toEqual(
      expected
    );
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });
});
