/**
 * The simulator's experiment-only rule channel: `--rules=` reaches three of
 * the game's constants so a proposed change can be measured before it is
 * adopted. Every test here restores the rules it moved, because the constants
 * are process-wide.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  applyRuleOverrides,
  parseRuleOverrides,
  type RuleOverrides,
} from "../../sim/ruleOverrides.ts";
import {
  MISSIONS_PER_PLAYER,
  MISSIONS_TO_WIN,
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
  toWin: MISSIONS_TO_WIN,
  secondariesKept: SECONDARIES_PER_PLAYER,
  compressedJump: COMPRESSED_JUMP_MASS,
};

afterEach(() => {
  setMissionRules({
    toWin: RULES_AS_THEY_STAND.toWin,
    secondariesKept: RULES_AS_THEY_STAND.secondariesKept,
  });
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
  it("does not end a game at 3 points under the rules as they stand", () => {
    const state = withPlayer(makeTwoPlayerGame(), "p1", { completedMissionCount: 3 });
    expect(checkForWinner(state)).toBeUndefined();
  });

  it("triggers the final round at 3 points once the rule is overridden", () => {
    const state = withPlayer(makeTwoPlayerGame(), "p1", { completedMissionCount: 3 });
    applyRuleOverrides({ missionsToWin: 3 });
    expect(MISSIONS_TO_WIN).toBe(3);
    expect(checkForWinner(state)?.id).toBe("p1");
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
