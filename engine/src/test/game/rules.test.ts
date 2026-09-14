import { describe, it, expect } from "vitest";
import { DEFAULT_RULES, parseRuleOverrides, resolveRules } from "../../models/rules.ts";
import { createGame, submitLoadout } from "../../game/setup.ts";
import { deployShip, transitionToActivePhase } from "../../game/deployment.ts";
import { dealMissionOffers } from "../../game/missions/missionDeck.ts";
import { Rng } from "../../utils/rng.ts";
import {
  BH,
  allocate,
  coast,
  eventsOf,
  executeTurnAs,
  fire,
  getPlayer,
  getShip,
  getSub,
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

describe("rule knobs", () => {
  it("defaults are RULES.md and overrides merge", () => {
    expect(resolveRules()).toEqual(DEFAULT_RULES);
    expect(resolveRules({ dockHullRepair: 1 }).dockHullRepair).toBe(1);
    expect(
      parseRuleOverrides("shieldRefill=on_dock,dockHullRepair=1,criticalThroughShields=true")
    ).toEqual({
      shieldRefill: "on_dock",
      dockHullRepair: 1,
      criticalThroughShields: true,
    });
    expect(() => parseRuleOverrides("bogus=1")).toThrow(/Unknown rule/);
  });

  it("a game carries its rules and they reach ships: startingHull", () => {
    let state = createGame(SPECS, 3, { startingHull: 8 });
    expect(state.rules).toEqual({ startingHull: 8 });
    const ids = (id: string) =>
      getPlayer(state, id)
        .missionOffers.slice(0, 3)
        .map((m) => m.id);
    state = submitLoadout(state, "p1", {
      loadout: getShip(state, "p1").loadout,
      missionIds: ids("p1"),
    }).state;
    state = submitLoadout(state, "p2", {
      loadout: getShip(state, "p2").loadout,
      missionIds: ids("p2"),
    }).state;
    state = deployShip(state, "p1", 0).state;
    state = transitionToActivePhase(deployShip(state, "p2", 12).state);
    expect(getShip(state, "p1")).toMatchObject({ hitPoints: 8, maxHitPoints: 8 });
  });

  it("shieldRefill on_dock keeps absorbed cubes out of the reactor until docking", () => {
    // p1 (port laser fires outward) at R3 S0, p2 one ring out with 2 shield cubes.
    let state = makeTwoPlayerGame(
      { ring: 3, sector: 0 },
      { ring: 4, sector: 0 },
      { rules: { shieldRefill: "on_dock" } }
    );
    state = withPower(state, "p1", "side-0", 2);
    state = withPower(state, "p2", "side-2", 2);
    const result = executeTurnAs(state, fire(1, "side-0", "p2", "engines"), coast(2));
    expect(result.errors).toBeUndefined();
    const p2 = getShip(result.gameState, "p2");
    expect(getSub(result.gameState, "p2", "side-2").allocatedEnergy).toBe(0);
    expect(p2.spentEnergy).toBe(2);
    expect(p2.reactor.availableEnergy).toBe(8); // not refunded
    // Default rules refund immediately.
    let base = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: 0 });
    base = withPower(withPower(base, "p1", "side-0", 2), "p2", "side-2", 2);
    const baseline = executeTurnAs(base, fire(1, "side-0", "p2", "engines"), coast(2));
    expect(getShip(baseline.gameState, "p2").reactor.availableEnergy).toBe(10);
    expect(getShip(baseline.gameState, "p2").spentEnergy).toBe(0);
  });

  it("shieldMaxEnergy caps allocation", () => {
    const state = makeTwoPlayerGame({}, {}, { rules: { shieldMaxEnergy: 2 } });
    expect(executeTurnAs(state, allocate("side-2", 3)).errors?.[0]).toMatch(/maximum/i);
    expect(executeTurnAs(state, allocate("side-2", 2)).errors).toBeUndefined();
  });

  it("criticalThroughShields breaks the named tile even when shields soak the shot", () => {
    let state = makeTwoPlayerGame(
      { ring: 3, sector: 0 },
      { ring: 4, sector: 0 },
      { forcedRollValue: 10, rules: { criticalThroughShields: true } }
    );
    state = withPower(withPower(state, "p1", "side-0", 2), "p2", "side-2", 4);
    const result = executeTurnAs(state, fire(1, "side-0", "p2", "side-1"), coast(2));
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      result: "critical",
      toHull: 0,
    });
    expect(getSub(result.gameState, "p2", "side-1").isBroken).toBe(true);
  });

  it("dockHullRepair sets the hull a dock restores", () => {
    const approach = (rules: object) => {
      let state = makeTwoPlayerGame({ wellId: "planet-alpha", ring: 1, sector: 20 }, {}, { rules });
      state = withShip(state, "p1", { hitPoints: 4 });
      return executeTurnAs(state, coast(1)); // drifts 4 → sector 0 = station
    };
    expect(getShip(approach({ dockHullRepair: 1 }).gameState, "p1").hitPoints).toBe(5);
    expect(getShip(approach({}).gameState, "p1").hitPoints).toBe(7);
  });

  it("destroyPoints makes a kill worth more than one card", () => {
    let state = makeTwoPlayerGame(
      { ring: 3, sector: 0 },
      { ring: 4, sector: 0 },
      { rules: { destroyPoints: 2 } }
    );
    state = withPower(state, "p1", "side-0", 2);
    state = withShip(state, "p2", { hitPoints: 2 });
    state = withPlayer(state, "p1", { missions: [destroyMission("p2")] });
    const result = executeTurnAs(state, fire(1, "side-0", "p2", "engines"), coast(2));
    expect(getPlayer(result.gameState, "p1").completedMissionCount).toBe(2);
  });

  it("deliverRoutesDealt shrinks the deck", () => {
    const players = [{ id: "a" }, { id: "b" }];
    const full = dealMissionOffers(players, new Rng(1), undefined, resolveRules({}));
    const thin = dealMissionOffers(
      players,
      new Rng(1),
      undefined,
      resolveRules({ deliverRoutesDealt: 3 })
    );
    // Offers are 5 cards from the deck; count routes across many seeds instead.
    let fullRoutes = 0;
    let thinRoutes = 0;
    for (let seed = 1; seed <= 30; seed++) {
      fullRoutes += [...dealMissionOffers(players, new Rng(seed)).values()]
        .flat()
        .filter((m) => m.type === "deliver_cargo").length;
      thinRoutes += [
        ...dealMissionOffers(
          players,
          new Rng(seed),
          undefined,
          resolveRules({ deliverRoutesDealt: 3 })
        ).values(),
      ]
        .flat()
        .filter((m) => m.type === "deliver_cargo").length;
    }
    expect(thinRoutes).toBeLessThan(fullRoutes);
    expect(full.get("a")).toHaveLength(5);
    expect(thin.get("a")).toHaveLength(5);
  });

  it("with default rules nothing changes: a two-player game on Black Hole Ring 4 plays", () => {
    const state = createGame(SPECS, 7);
    expect(state.rules).toBeUndefined();
    expect(getShip(state, "p1").wellId).toBe(BH);
  });
});
