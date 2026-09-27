/**
 * The simulator's rule channel: `--rules=` carries the table's points to win
 * into every game the batch creates, and sets the one-sale experiment's switch.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  applyRuleOverrides,
  describeRuleOverrides,
  parseRuleOverrides,
  type RuleOverrides,
} from "../../sim/ruleOverrides.ts";
import { DEFAULT_POINTS_TO_WIN, SALE_RULES } from "../../models/missions.ts";
import { checkForWinner } from "../../game/missions/missionChecks.ts";
import { createGame } from "../../game/setup.ts";
import { setupBotGame } from "../../sim/runGame.ts";
import { makeTwoPlayerGame, withPlayer } from "../testUtils.ts";

describe("parseRuleOverrides", () => {
  it("parses missionsToWin=4", () => {
    const expected: RuleOverrides = { missionsToWin: 4 };
    expect(parseRuleOverrides("missionsToWin=4")).toEqual(expected);
  });

  it.each([
    ["an unknown rule", "missionsToLose=3"],
    ["a rule that is no longer one", "compressorFuel=1"],
    ["a rule with no value", "missionsToWin"],
    ["a value that is not a number", "missionsToWin=lots"],
  ])("refuses %s", (_case, text) => {
    expect(() => parseRuleOverrides(text)).toThrow();
  });
});

describe("missionsToWin", () => {
  // Points to win is a table agreement now, not a constant: the key is dealt
  // into every game the batch creates instead of reassigning a binding.
  it.each([
    ["the default when the batch says nothing", undefined, DEFAULT_POINTS_TO_WIN],
    ["four when the batch asks for four", 4, 4],
  ])("creates the batch's games playing to %s", (_case, override, expected) => {
    expect(setupBotGame(11, 2, undefined, undefined, override).pointsToWin).toBe(expected);
  });

  it("changes nothing in the process, so a game made beside it still plays to three", () => {
    expect(parseRuleOverrides("missionsToWin=2")).toEqual({ missionsToWin: 2 });
    const state = withPlayer(makeTwoPlayerGame(), "p1", { points: 2 });
    expect(checkForWinner(state)).toBeUndefined();
    expect(
      createGame([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ]).pointsToWin
    ).toBe(DEFAULT_POINTS_TO_WIN);
  });
});

describe("oneSalePerStation", () => {
  afterEach(() => {
    SALE_RULES.oneSalePerStation = false;
  });

  it.each<[string, string, boolean]>([
    ["1 switches it on", "oneSalePerStation=1", true],
    ["0 leaves it off", "oneSalePerStation=0", false],
    ["another key leaves it alone", "missionsToWin=4", false],
  ])("%s", (_case, text, expected) => {
    applyRuleOverrides(parseRuleOverrides(text));
    expect(SALE_RULES.oneSalePerStation).toBe(expected);
  });

  it("is stamped on the pages", () => {
    expect(describeRuleOverrides(parseRuleOverrides("oneSalePerStation=1"))).toBe(
      "oneSalePerStation=1"
    );
  });
});
