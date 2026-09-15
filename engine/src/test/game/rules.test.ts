import { describe, it, expect } from "vitest";
import type { ShipLoadout } from "../../models/game.ts";
import { DEFAULT_RULES, parseRuleOverrides, resolveRules } from "../../models/rules.ts";
import { createGame } from "../../game/setup.ts";
import {
  BH,
  allocate,
  coast,
  executeTurnAs,
  fire,
  getPlayer,
  getShip,
  makeTwoPlayerGame,
  withPlayer,
  withPower,
  withShip,
  destroyMission,
} from "../testUtils.ts";

const SPECS = [
  { id: "p1", name: "A" },
  { id: "p2", name: "B" },
];

/** A rack at side-0: the one-damage round shields can still absorb (lasers cannot). */
const RACK_SHIP: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "shields", "shields"],
};

describe("rule knobs", () => {
  it("defaults are RULES.md and overrides merge", () => {
    expect(resolveRules()).toEqual(DEFAULT_RULES);
    expect(resolveRules({ shieldMaxEnergy: 3 }).shieldMaxEnergy).toBe(3);
    expect(parseRuleOverrides("shieldMaxEnergy=3,destroyPoints=1")).toEqual({
      shieldMaxEnergy: 3,
      destroyPoints: 1,
    });
    expect(() => parseRuleOverrides("bogus=1")).toThrow(/Unknown rule/);
    expect(() => parseRuleOverrides("destroyPoints=two")).toThrow(/number/);
  });

  it("a game carries its rules", () => {
    const state = createGame(SPECS, 7, { shieldMaxEnergy: 3 });
    expect(state.rules).toEqual({ shieldMaxEnergy: 3 });
  });

  it("shieldMaxEnergy caps allocation", () => {
    const state = makeTwoPlayerGame({}, {}, { rules: { shieldMaxEnergy: 1 } });
    expect(executeTurnAs(state, allocate("side-2", 2)).errors?.[0]).toMatch(/maximum/i);
    expect(executeTurnAs(state, allocate("side-2", 1)).errors).toBeUndefined();
  });

  it("shieldHeatPerPoint sets the heat a soaked point costs its owner", () => {
    // p1's rack (1 damage) at R3 S0, p2 one ring out with a shield cube.
    const heatAfterOneSoakedPoint = (shieldHeatPerPoint: number) => {
      let state = makeTwoPlayerGame(
        { ring: 3, sector: 0, loadout: RACK_SHIP },
        { ring: 4, sector: 0 },
        { rules: { shieldHeatPerPoint } }
      );
      state = withPower(state, "p1", "side-0", 2);
      state = withPower(state, "p2", "side-2", 1);
      const result = executeTurnAs(state, fire(1, "side-0", "p2"));
      expect(result.errors).toBeUndefined();
      return getShip(result.gameState, "p2").heat.currentHeat;
    };
    expect(heatAfterOneSoakedPoint(1)).toBe(1);
    expect(heatAfterOneSoakedPoint(3)).toBe(3);
  });

  it("destroyPoints sets what a kill is worth", () => {
    const worth = (destroyPoints: number) => {
      let state = makeTwoPlayerGame(
        { ring: 3, sector: 0 },
        { ring: 4, sector: 0 },
        { rules: { destroyPoints } }
      );
      state = withPower(state, "p1", "side-0", 2);
      state = withShip(state, "p2", { hitPoints: 2 });
      state = withPlayer(state, "p1", { missions: [destroyMission("p2")] });
      const result = executeTurnAs(state, fire(1, "side-0", "p2", "engines"), coast(2));
      return getPlayer(result.gameState, "p1").completedMissionCount;
    };
    expect(worth(1)).toBe(1);
    expect(worth(2)).toBe(2);
  });

  it("with default rules nothing is recorded: a two-player game on Black Hole Ring 4 plays", () => {
    const state = createGame(SPECS, 7);
    expect(state.rules).toBeUndefined();
    expect(getShip(state, "p1").wellId).toBe(BH);
  });
});
