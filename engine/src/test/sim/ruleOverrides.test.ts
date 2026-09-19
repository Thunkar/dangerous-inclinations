/**
 * The simulator's experiment-only rule channel: `--rules=` reaches the hand
 * shape and the jump cost, which are constants, and the points to win, which
 * is dealt into each game. Every test here restores the constants it moved,
 * because those are process-wide.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  applyRuleOverrides,
  parseRuleOverrides,
  type RuleOverrides,
} from "../../sim/ruleOverrides.ts";
import {
  DEFAULT_POINTS_TO_WIN,
  MISSIONS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  setMissionRules,
} from "../../models/missions.ts";
import {
  COMPRESSED_JUMP_MASS,
  WELL_TRANSFER_COSTS,
  calculateJumpMassCost,
  setCompressedJumpMass,
} from "../../models/rings.ts";
import { selectMissionsFromOffers } from "../../game/missions/missionDeck.ts";
import { checkForWinner } from "../../game/missions/missionChecks.ts";
import { createGame } from "../../game/setup.ts";
import { setupBotGame } from "../../sim/runGame.ts";
import { validHands } from "../../ai/behaviors/loadout.ts";
import {
  ALPHA,
  BETA,
  deliverMission,
  destroyMission,
  garbageMission,
  interceptMission,
  makeTwoPlayerGame,
  secondaryMission,
  surveyMission,
  withPlayer,
} from "../testUtils.ts";

/** The rules as they stand, read before anything moves them. */
const RULES_AS_THEY_STAND = {
  secondariesKept: SECONDARIES_PER_PLAYER,
  compressedJump: COMPRESSED_JUMP_MASS,
};

afterEach(() => {
  setMissionRules({ secondariesKept: RULES_AS_THEY_STAND.secondariesKept });
  setCompressedJumpMass(RULES_AS_THEY_STAND.compressedJump);
});

/** One primary of each kind and one secondary of each kind: the printed deal. */
const offers = () => [
  destroyMission("p2"),
  deliverMission(ALPHA, BETA),
  interceptMission("p2"),
  surveyMission(),
  secondaryMission("board"),
  garbageMission(),
];

describe("parseRuleOverrides", () => {
  it.each([
    ["missionsToWin=3", { missionsToWin: 3 }],
    ["secondariesKept=3", { secondariesKept: 3 }],
    ["compressedJumpFuel=1", { compressedJumpFuel: 1 }],
    [
      "missionsToWin=3,secondariesKept=3,compressedJumpFuel=1",
      { missionsToWin: 3, secondariesKept: 3, compressedJumpFuel: 1 },
    ],
  ])("parses %s", (text, expected: RuleOverrides) => {
    expect(parseRuleOverrides(text)).toEqual(expected);
  });

  it.each([
    ["an unknown rule", "missionsToLose=3"],
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
    applyRuleOverrides({ missionsToWin: 2 });
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

describe("secondariesKept", () => {
  it("keeps the hand at one primary and two secondaries as the rules stand", () => {
    expect(MISSIONS_PER_PLAYER).toBe(3);
    const hand = [offers()[0], offers()[3], offers()[4]].map((m) => m.id);
    expect(selectMissionsFromOffers(offers(), hand).error).toBeUndefined();
    expect(selectMissionsFromOffers(offers(), [...hand, offers()[5].id]).error).toBeDefined();
  });

  it("accepts one primary and three distinct secondaries when overridden", () => {
    applyRuleOverrides({ secondariesKept: 3 });
    expect(MISSIONS_PER_PLAYER).toBe(4);
    const all = offers();
    const hand = [all[0], all[3], all[4], all[5]];
    const result = selectMissionsFromOffers(
      all,
      hand.map((m) => m.id)
    );
    expect(result.error).toBeUndefined();
    expect(result.missions.map((m) => m.id)).toEqual(hand.map((m) => m.id));
  });

  it("leaves the bots exactly the hand that takes all three secondaries", () => {
    const all = offers();
    expect(validHands(all, undefined, "destroy_ship")).toHaveLength(3);
    applyRuleOverrides({ secondariesKept: 3 });
    expect(validHands(all, undefined, "destroy_ship")).toEqual([[all[0], all[3], all[4], all[5]]]);
  });
});

describe("compressedJumpFuel", () => {
  it("is free with a compressor as the rules stand", () => {
    expect(calculateJumpMassCost(0, true)).toBe(0);
  });

  it.each([
    ["with a compressor", true, 1],
    ["without one", false, WELL_TRANSFER_COSTS.mass],
  ])("costs the lane %s once overridden", (_case, hasCompressor, expected) => {
    applyRuleOverrides({ compressedJumpFuel: 1 });
    expect(calculateJumpMassCost(0, hasCompressor)).toBe(expected);
  });

  it("still never pays for the phasing", () => {
    applyRuleOverrides({ compressedJumpFuel: 1 });
    expect(calculateJumpMassCost(2, true)).toBe(3);
  });
});
