/**
 * The bots and Piracy: a pirate names the item that costs its victim most.
 */
import { describe, it, expect } from "vitest";
import type { GameState, PlayerAction } from "../../models/game.ts";
import { MOVE_ACTION_TYPES } from "../../models/game.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { viewFor } from "../../game/view.ts";
import { executeTurn } from "../../game/turns.ts";
import { botDecideActions } from "../../ai/index.ts";
import { seizeChoices } from "../../ai/behaviors/piracy.ts";
import {
  ALPHA,
  BETA,
  deliverMission,
  destroyMission,
  getPlayer,
  lootCargo,
  piracyMission,
  surveyMission,
  takenData,
  withPlayer,
  withShip,
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

  /** p1 the pirate already in p2's sector when its turn begins. */
  const together = (pirate: Mission[], hull = 10): GameState =>
    withShip(withShip(table(pirate, [CRATE_ABOARD], []), "p1", LANDING), "p2", { hitPoints: hull });
  const sequenceOf = (actions: PlayerAction[], match: (a: PlayerAction) => boolean) =>
    actions.filter(match).map((a) => a.sequence ?? 0);

  it.each<[string, Mission[], number, boolean]>([
    ["a carrier it already shares a sector with", [PIRACY], 10, false],
    [
      "its Destroy target on one hull point: seized, then shot",
      [PIRACY, destroyMission("p2")],
      1,
      true,
    ],
  ])("a bot seizes from %s before it moves or fires", (_label, pirate, hull, killed) => {
    const state = together(pirate, hull);
    const { actions } = botDecideActions(viewFor(state, "p1"));
    const [seized] = sequenceOf(actions, (a) => a.type === "seize");
    const later = sequenceOf(
      actions,
      (a) =>
        MOVE_ACTION_TYPES.has(a.type) ||
        (a.type === "fire_weapon" && a.data.targetPlayerId === "p2")
    );
    expect(seized).toBeDefined();
    expect(later.every((n) => n > seized)).toBe(true);
    const result = executeTurn(state, actions);
    expect(result.errors).toBeUndefined();
    expect(result.events.filter((e) => e.type === "cargo_seized")).toHaveLength(1);
    expect(result.events.some((e) => e.type === "ship_destroyed" && e.victimId === "p2")).toBe(
      killed
    );
  });
});
