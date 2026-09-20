/**
 * The simulator's rule channel: `--rules=` carries the table's points to win
 * into every game the batch creates, and nothing else.
 */
import { describe, it, expect } from "vitest";
import { parseRuleOverrides, type RuleOverrides } from "../../sim/ruleOverrides.ts";
import { DEFAULT_POINTS_TO_WIN } from "../../models/missions.ts";
import { checkForWinner } from "../../game/missions/missionChecks.ts";
import { createGame } from "../../game/setup.ts";
import { setupBotGame } from "../../sim/runGame.ts";
import { makeTwoPlayerGame, withPlayer } from "../testUtils.ts";

describe("parseRuleOverrides", () => {
  it.each([
    ["missionsToWin=3", { missionsToWin: 3 }],
    ["missionsToWin=4", { missionsToWin: 4 }],
  ])("parses %s", (text, expected: RuleOverrides) => {
    expect(parseRuleOverrides(text)).toEqual(expected);
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
    const state = withPlayer(makeTwoPlayerGame(), "p1", { completedMissionCount: 2 });
    expect(checkForWinner(state)).toBeUndefined();
    expect(
      createGame([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ]).pointsToWin
    ).toBe(DEFAULT_POINTS_TO_WIN);
  });
});
