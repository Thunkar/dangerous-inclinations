import { describe, it, expect } from "vitest";
import { SHIELD_HEAT_PER_POINT } from "../../models/game.ts";
import { resolveAttack, rollToResult } from "../../game/damage.ts";
import { getEffectiveCriticalChance } from "../../game/ship.ts";
import { REACTOR_CAPACITY } from "../../models/game.ts";
import type { ShipLoadout } from "../../models/game.ts";
import {
  eventsOf,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  makeTwoPlayerGame,
  totalEnergy,
  withPower,
  withSub,
} from "../testUtils.ts";

const SENSOR_LOADOUT: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};
const TWO_SHIELDS: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "laser", "shields", "shields"],
};
const RACK_FIRST: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "shields", "shields"],
};

/** p1 at R3 S0 with a powered port laser; p2 one ring out where the laser reaches. */
function laserDuel(targetLoadout?: ShipLoadout, attackerLoadout?: ShipLoadout) {
  let state = makeTwoPlayerGame(
    { ring: 3, sector: 0, loadout: attackerLoadout },
    { ring: 4, sector: 0, loadout: targetLoadout }
  );
  return withPower(state, "p1", "side-0", 2);
}

describe("damage: the d10", () => {
  it.each([
    [1, 10, "miss"],
    [2, 10, "hit"],
    [9, 10, "hit"],
    [10, 10, "critical"],
    [1, 30, "miss"],
    [7, 30, "hit"],
    [8, 30, "critical"],
    [9, 30, "critical"],
    [10, 30, "critical"],
  ] as const)("roll %i at %i%% crit chance is a %s", (roll, chance, expected) => {
    expect(rollToResult(roll, chance)).toBe(expected);
  });

  it("defaults to the base 10% critical chance", () => {
    expect(rollToResult(9)).toBe("hit");
    expect(rollToResult(10)).toBe("critical");
  });

  it.each([
    ["no sensor", undefined, false, false, 10],
    ["powered sensor", SENSOR_LOADOUT, true, false, 30],
    ["unpowered sensor", SENSOR_LOADOUT, false, false, 10],
    ["broken powered sensor", SENSOR_LOADOUT, true, true, 10],
  ])("critical chance with %s is %i", (_label, loadout, powered, broken, expected) => {
    let state = makeTwoPlayerGame({ loadout });
    if (powered) state = withPower(state, "p1", "forward-0", 2);
    if (broken) state = withSub(state, "p1", "forward-0", { isBroken: true });
    expect(getEffectiveCriticalChance(getShip(state, "p1").subsystems)).toBe(expected);
  });
});

describe("damage: resolveAttack", () => {
  const base = makeTwoPlayerGame();
  const attacker = getShip(base, "p1");

  it("a miss changes nothing and emits nothing", () => {
    const target = getShip(base, "p2");
    const outcome = resolveAttack(target, "p2", 4, "engines", 1, attacker);
    expect(outcome.ship).toBe(target);
    expect(outcome.events).toEqual([]);
    expect(outcome.hitResult).toMatchObject({
      result: "miss",
      damage: 0,
      damageToHull: 0,
      damageToHeat: 0,
    });
  });

  it("a hit without shields goes straight to the hull", () => {
    const outcome = resolveAttack(getShip(base, "p2"), "p2", 4, "engines", 5, attacker);
    expect(outcome.ship.hitPoints).toBe(6);
    expect(outcome.hitResult).toMatchObject({
      result: "hit",
      damage: 4,
      damageToHull: 4,
      damageToHeat: 0,
    });
    expect(outcome.ship.heat.currentHeat).toBe(0);
  });

  it("the hull never drops below zero", () => {
    const target = { ...getShip(base, "p2"), hitPoints: 2 };
    expect(resolveAttack(target, "p2", 4, "engines", 5, attacker).ship.hitPoints).toBe(0);
  });

  it.each([
    ["shield 2 vs damage 4: partial", 2, 4, 2, 2, 0],
    ["shield 4 vs damage 2: full", 4, 2, 0, 2, 2],
    ["shield 3 vs damage 3: exact", 3, 3, 0, 3, 0],
  ])("%s", (_label, shieldEnergy, damage, toHull, toHeat, shieldLeft) => {
    const state = withPower(base, "p2", "side-2", shieldEnergy);
    const target = getShip(state, "p2");
    const outcome = resolveAttack(target, "p2", damage, "engines", 5, attacker);
    expect(outcome.hitResult.damageToHull).toBe(toHull);
    expect(outcome.hitResult.damageToHeat).toBe(toHeat);
    expect(outcome.ship.hitPoints).toBe(10 - toHull);
    // Every absorbed point is shieldHeatPerPoint heat on the defender.
    expect(outcome.ship.heat.currentHeat).toBe(toHeat * SHIELD_HEAT_PER_POINT);
    const shield = outcome.ship.subsystems.find((s) => s.id === "side-2")!;
    expect(shield.allocatedEnergy).toBe(shieldLeft);
    expect(shield.isPowered).toBe(shieldLeft > 0);
    expect(outcome.ship.reactor.availableEnergy).toBe(target.reactor.availableEnergy + toHeat);
    expect(totalEnergy(outcome.ship)).toBe(REACTOR_CAPACITY);
  });

  it("absorbing reveals the shield tile", () => {
    const state = withPower(base, "p2", "side-2", 2);
    const outcome = resolveAttack(getShip(state, "p2"), "p2", 2, "engines", 5, attacker);
    expect(outcome.events).toEqual([
      {
        type: "subsystem_revealed",
        playerId: "p2",
        subsystemId: "side-2",
        subsystemType: "shields",
        reason: "absorbed",
      },
    ]);
    expect(outcome.ship.subsystems.find((s) => s.id === "side-2")!.isRevealed).toBe(true);
  });

  it("two shield tiles absorb one after the other", () => {
    let state = makeTwoPlayerGame({}, { loadout: TWO_SHIELDS });
    state = withPower(state, "p2", "side-2", 1);
    state = withPower(state, "p2", "side-3", 2);
    const outcome = resolveAttack(getShip(state, "p2"), "p2", 4, "engines", 5, attacker);
    expect(outcome.hitResult.damageToHeat).toBe(3);
    expect(outcome.hitResult.damageToHull).toBe(1);
    expect(outcome.ship.subsystems.find((s) => s.id === "side-2")!.allocatedEnergy).toBe(0);
    expect(outcome.ship.subsystems.find((s) => s.id === "side-3")!.allocatedEnergy).toBe(0);
    expect(
      eventsOf(outcome.events as never, "subsystem_revealed").map((e) => e.subsystemId)
    ).toEqual(["side-2", "side-3"]);
  });

  it("unpowered and broken shields absorb nothing", () => {
    const unpowered = resolveAttack(getShip(base, "p2"), "p2", 4, "engines", 5, attacker);
    expect(unpowered.hitResult.damageToHeat).toBe(0);
    const brokenState = withSub(withPower(base, "p2", "side-2", 4), "p2", "side-2", {
      isBroken: true,
    });
    const broken = resolveAttack(getShip(brokenState, "p2"), "p2", 4, "engines", 5, attacker);
    expect(broken.hitResult.damageToHull).toBe(4);
  });

  it("a critical that reaches the hull breaks the named slot and vents its energy as heat", () => {
    const state = withPower(base, "p2", "engines", 3);
    const target = getShip(state, "p2");
    const outcome = resolveAttack(target, "p2", 2, "engines", 10, attacker);
    expect(outcome.hitResult.result).toBe("critical");
    expect(outcome.hitResult.criticalEffect).toEqual({
      subsystemId: "engines",
      subsystemType: "engines",
      energyLost: 3,
    });
    const engines = outcome.ship.subsystems.find((s) => s.id === "engines")!;
    expect(engines).toMatchObject({
      isBroken: true,
      allocatedEnergy: 0,
      isPowered: false,
      isRevealed: true,
    });
    expect(outcome.ship.heat.currentHeat).toBe(3);
    expect(outcome.ship.reactor.availableEnergy).toBe(target.reactor.availableEnergy + 3);
    expect(totalEnergy(outcome.ship)).toBe(REACTOR_CAPACITY);
    expect(outcome.events).toEqual([
      {
        type: "subsystem_broken",
        playerId: "p2",
        subsystemId: "engines",
        subsystemType: "engines",
        energyLost: 3,
      },
    ]);
  });

  it("breaking a face-down slot reveals it", () => {
    const outcome = resolveAttack(getShip(base, "p2"), "p2", 2, "side-1", 10, attacker);
    expect(outcome.events.map((e) => e.type)).toEqual(["subsystem_revealed", "subsystem_broken"]);
    expect(outcome.events[0]).toMatchObject({
      subsystemId: "side-1",
      subsystemType: "laser",
      reason: "broken",
    });
  });

  it("a critical fully absorbed by shields breaks nothing", () => {
    const state = withPower(base, "p2", "side-2", 4);
    const outcome = resolveAttack(getShip(state, "p2"), "p2", 2, "engines", 10, attacker);
    expect(outcome.hitResult.result).toBe("critical");
    expect(outcome.hitResult.criticalEffect).toBeUndefined();
    expect(outcome.ship.subsystems.find((s) => s.id === "engines")!.isBroken).toBe(false);
  });

  it("a critical on an already broken or unknown slot has no extra effect", () => {
    const state = withSub(base, "p2", "engines", { isBroken: true });
    const broken = resolveAttack(getShip(state, "p2"), "p2", 2, "engines", 10, attacker);
    expect(broken.hitResult.criticalEffect).toBeUndefined();
    expect(broken.events).toEqual([]);
    const unknown = resolveAttack(getShip(base, "p2"), "p2", 2, "side-7", 10, attacker);
    expect(unknown.hitResult.criticalEffect).toBeUndefined();
    expect(unknown.ship.hitPoints).toBe(8);
  });

  it("flags sensor-assisted criticals (8 or 9 with a powered sensor) but not natural 10s", () => {
    const sensorState = withPower(
      makeTwoPlayerGame({ loadout: SENSOR_LOADOUT }),
      "p1",
      "forward-0",
      2
    );
    const sensors = getShip(sensorState, "p1");
    expect(
      resolveAttack(getShip(base, "p2"), "p2", 2, "engines", 8, sensors).hitResult
    ).toMatchObject({
      result: "critical",
      sensorAssistedCritical: true,
    });
    expect(
      resolveAttack(getShip(base, "p2"), "p2", 2, "engines", 10, sensors).hitResult
        .sensorAssistedCritical
    ).toBe(false);
    expect(
      resolveAttack(getShip(base, "p2"), "p2", 2, "engines", 8, attacker).hitResult.result
    ).toBe("hit");
  });
});

describe("damage: through executeTurn", () => {
  it("a forced roll of 1 misses: hull intact, attack_resolved with zero damage", () => {
    const result = executeTurnAs({ ...laserDuel(), forcedRollValue: 1 }, fire(1, "side-0", "p2"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      roll: 1,
      result: "miss",
      damage: 0,
      targetHullAfter: 10,
    });
    expect(getShip(result.gameState, "p2").hitPoints).toBe(10);
  });

  it("a hit records weapon, roll and remaining hull", () => {
    const result = executeTurnAs(laserDuel(), fire(1, "side-0", "p2"));
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      attackerId: "p1",
      targetId: "p2",
      weaponType: "laser",
      roll: 5,
      result: "hit",
      damage: 2,
      toHull: 2,
      toHeat: 0,
      targetHullAfter: 8,
    });
  });

  it("a forced 10 breaks the attacker-named slot on the target", () => {
    const state = withPower(laserDuel(), "p2", "side-0", 2);
    const result = executeTurnAs(
      { ...state, forcedRollValue: 10 },
      fire(1, "side-0", "p2", "side-0")
    );
    expect(getSub(result.gameState, "p2", "side-0")).toMatchObject({
      isBroken: true,
      isRevealed: true,
      allocatedEnergy: 0,
    });
    expect(eventsOf(result.events, "subsystem_broken")).toEqual([
      expect.objectContaining({ playerId: "p2", subsystemId: "side-0", energyLost: 2 }),
    ]);
    expect(getShip(result.gameState, "p2").heat.currentHeat).toBe(2);
  });

  it("a sensor-assisted critical reveals the attacker's sensor array", () => {
    let state = laserDuel(undefined, SENSOR_LOADOUT);
    state = withPower(state, "p1", "forward-0", 2);
    const result = executeTurnAs(
      { ...state, forcedRollValue: 8 },
      fire(1, "side-0", "p2", "engines")
    );
    expect(eventsOf(result.events, "attack_resolved")[0].result).toBe("critical");
    expect(eventsOf(result.events, "subsystem_revealed")).toContainEqual(
      expect.objectContaining({
        playerId: "p1",
        subsystemId: "forward-0",
        subsystemType: "sensor_array",
        reason: "critical_bonus",
      })
    );
    expect(getSub(result.gameState, "p1", "forward-0").isRevealed).toBe(true);
  });

  it("a natural 10 without sensors keeps the sensor slot face-down", () => {
    let state = laserDuel(undefined, SENSOR_LOADOUT);
    state = withPower(state, "p1", "forward-0", 2);
    const result = executeTurnAs(
      { ...state, forcedRollValue: 10 },
      fire(1, "side-0", "p2", "engines")
    );
    expect(getSub(result.gameState, "p1", "forward-0").isRevealed).toBe(false);
  });

  it("shields absorb a rack round and keep total energy constant", () => {
    // The rack sits at side-0 of RACK_FIRST, one ring below its target.
    const state = withPower(laserDuel(undefined, RACK_FIRST), "p2", "side-2", 2);
    const result = executeTurnAs(state, fire(1, "side-0", "p2"));
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      weaponType: "ballistic_rack",
      damage: 2,
      toHull: 0,
      toHeat: 2,
    });
    expect(getShip(result.gameState, "p2").hitPoints).toBe(10);
    expect(getShip(result.gameState, "p2").heat.currentHeat).toBe(
      2 * SHIELD_HEAT_PER_POINT
    );
    expect(totalEnergy(getShip(result.gameState, "p2"))).toBe(REACTOR_CAPACITY);
    expect(getShip(result.gameState, "p2").reactor.availableEnergy).toBe(REACTOR_CAPACITY);
  });

  it("laser damage skips the shields: hull takes it all, the cubes stay, no heat", () => {
    const state = withPower(laserDuel(), "p2", "side-2", 4);
    const result = executeTurnAs(state, fire(1, "side-0", "p2"));
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      weaponType: "laser",
      damage: 2,
      toHull: 2,
      toHeat: 0,
      targetHullAfter: 8,
    });
    expect(getShip(result.gameState, "p2").hitPoints).toBe(8);
    expect(getShip(result.gameState, "p2").heat.currentHeat).toBe(0);
    expect(getSub(result.gameState, "p2", "side-2")).toMatchObject({
      allocatedEnergy: 4,
      isRevealed: false,
    });
  });

  it("a laser critical breaks the named tile through full shields", () => {
    const state = withPower(laserDuel(), "p2", "side-2", 4);
    const result = executeTurnAs(
      { ...state, forcedRollValue: 10 },
      fire(1, "side-0", "p2", "engines")
    );
    expect(getSub(result.gameState, "p2", "engines").isBroken).toBe(true);
    expect(getShip(result.gameState, "p2").hitPoints).toBe(8);
  });
});
