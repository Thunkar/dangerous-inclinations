import { describe, it, expect } from "vitest";
import { resolveAttack, rollToResult } from "../../game/damage.ts";
import { lowestCriticalFace } from "../../game/ship.ts";
import type { ShipLoadout } from "../../models/game.ts";
import {
  LOADOUTS,
  eventsOf,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  makeTwoPlayerGame,
  cubesOnLoadout,
  power,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

/** p1 at R3 S0 with a powered port laser; p2 one ring out where the laser reaches. */
function laserDuel(targetLoadout?: ShipLoadout, attackerLoadout?: ShipLoadout) {
  const state = makeTwoPlayerGame(
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
    [1, 8, "miss"],
    [7, 8, "hit"],
    [8, 8, "critical"],
    [9, 8, "critical"],
    [10, 8, "critical"],
    // No face given: criticals on a 10 only.
    [9, undefined, "hit"],
    [10, undefined, "critical"],
  ] as const)("roll %i with criticals from %s is a %s", (roll, face, expected) => {
    expect(rollToResult(roll, face)).toBe(expected);
  });

  it.each([
    ["no sensor", undefined, false, false, 10],
    ["powered sensor", LOADOUTS.sensor, true, false, 8],
    ["unpowered sensor", LOADOUTS.sensor, false, false, 10],
    ["broken powered sensor", LOADOUTS.sensor, true, true, 10],
  ])("the lowest critical face with %s is %i", (_label, loadout, powered, broken, expected) => {
    let state = makeTwoPlayerGame({ loadout });
    if (powered) state = withPower(state, "p1", "forward-0", 2);
    if (broken) state = withSub(state, "p1", "forward-0", { isBroken: true });
    expect(lowestCriticalFace(getShip(state, "p1").subsystems)).toBe(expected);
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
      absorbed: 0,
    });
  });

  it("a hit without shields goes straight to the hull", () => {
    const outcome = resolveAttack(getShip(base, "p2"), "p2", 4, "engines", 5, attacker);
    expect(outcome.ship.hitPoints).toBe(6);
    expect(outcome.hitResult).toMatchObject({
      result: "hit",
      damage: 4,
      damageToHull: 4,
      absorbed: 0,
    });
    expect(outcome.ship.heat.currentHeat).toBe(0);
  });

  it("the hull never drops below zero", () => {
    const target = { ...getShip(base, "p2"), hitPoints: 2 };
    expect(resolveAttack(target, "p2", 4, "engines", 5, attacker).ship.hitPoints).toBe(0);
  });

  // A cube absorbs a point, the cubes that absorb come off the shield, and
  // every point absorbed goes onto the target's track.
  it.each([
    ["1 cube vs damage 4: one point absorbed, three land", 1, 4, 3, 1, 0],
    ["2 cubes vs damage 2: the whole shot absorbed, both cubes gone", 2, 2, 0, 2, 0],
    ["2 cubes vs damage 3: two absorbed, one lands", 2, 3, 1, 2, 0],
    ["2 cubes vs damage 4: a full shield stops half a railgun", 2, 4, 2, 2, 0],
    ["2 cubes vs damage 1: a point costs one cube, the other stays", 2, 1, 0, 1, 1],
  ])("%s", (_label, shieldEnergy, damage, toHull, absorbed, shieldLeft) => {
    const state = withPower(base, "p2", "side-2", shieldEnergy);
    const target = getShip(state, "p2");
    const outcome = resolveAttack(target, "p2", damage, "engines", 5, attacker);
    expect(outcome.hitResult.damageToHull).toBe(toHull);
    expect(outcome.hitResult.absorbed).toBe(absorbed);
    expect(outcome.ship.hitPoints).toBe(10 - toHull);
    // Every point absorbed is a point on the owner's track.
    expect(outcome.ship.heat.currentHeat).toBe(absorbed);
    const shield = outcome.ship.subsystems.find((s) => s.id === "side-2")!;
    expect(shield.allocatedEnergy).toBe(shieldLeft);
    // The cubes that absorbed come off the shield.
    expect(cubesOnLoadout(outcome.ship)).toBe(cubesOnLoadout(target) - (shieldEnergy - shieldLeft));
  });

  it("absorbed points go on top of the heat the target already carries", () => {
    const state = withShip(withPower(base, "p2", "side-2", 2), "p2", { heat: { currentHeat: 3 } });
    const outcome = resolveAttack(getShip(state, "p2"), "p2", 2, "engines", 5, attacker);
    expect(outcome.ship.heat.currentHeat).toBe(5);
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

  it.each([
    ["half shields stop half a railgun", 1, 2, 2],
    ["full shields stop a railgun whole", 2, 4, 0],
  ])("two shields absorb one after the other: %s", (_label, cubes, absorbed, toHull) => {
    let state = makeTwoPlayerGame({}, { loadout: LOADOUTS.twoShields });
    state = withPower(state, "p2", "side-2", cubes);
    state = withPower(state, "p2", "side-3", cubes);
    const outcome = resolveAttack(getShip(state, "p2"), "p2", 4, "engines", 5, attacker);
    expect(outcome.hitResult.absorbed).toBe(absorbed);
    expect(outcome.hitResult.damageToHull).toBe(toHull);
    expect(outcome.ship.heat.currentHeat).toBe(absorbed);
    expect(outcome.ship.subsystems.find((s) => s.id === "side-2")!.allocatedEnergy).toBe(0);
    expect(outcome.ship.subsystems.find((s) => s.id === "side-3")!.allocatedEnergy).toBe(0);
    expect(
      eventsOf(outcome.events as never, "subsystem_revealed").map((e) => e.subsystemId)
    ).toEqual(["side-2", "side-3"]);
  });

  it("the first shield in slot order absorbs first and the second is left alone", () => {
    let state = makeTwoPlayerGame({}, { loadout: LOADOUTS.twoShields });
    state = withPower(state, "p2", "side-2", 2);
    state = withPower(state, "p2", "side-3", 2);
    const outcome = resolveAttack(getShip(state, "p2"), "p2", 2, "engines", 5, attacker);
    expect(outcome.hitResult).toMatchObject({ absorbed: 2, damageToHull: 0 });
    expect(outcome.ship.heat.currentHeat).toBe(2);
    expect(outcome.ship.subsystems.find((s) => s.id === "side-2")!.allocatedEnergy).toBe(0);
    expect(outcome.ship.subsystems.find((s) => s.id === "side-3")!.allocatedEnergy).toBe(2);
    expect(
      eventsOf(outcome.events as never, "subsystem_revealed").map((e) => e.subsystemId)
    ).toEqual(["side-2"]);
  });

  it("broken shields absorb nothing", () => {
    // Unpowered ones are the plain hit above.
    const brokenState = withSub(withPower(base, "p2", "side-2", 2), "p2", "side-2", {
      isBroken: true,
    });
    const broken = resolveAttack(getShip(brokenState, "p2"), "p2", 4, "engines", 5, attacker);
    expect(broken.hitResult.damageToHull).toBe(4);
    expect(broken.ship.heat.currentHeat).toBe(0);
  });

  it("a critical that reaches the hull breaks the named slot and vents its energy as heat", () => {
    const state = withPower(base, "p2", "engines", 3);
    const target = getShip(state, "p2");
    const outcome = resolveAttack(target, "p2", 2, "engines", 10, attacker);
    expect(outcome.hitResult.result).toBe("critical");
    const engines = outcome.ship.subsystems.find((s) => s.id === "engines")!;
    expect(engines).toMatchObject({
      isBroken: true,
      allocatedEnergy: 0,
      isRevealed: true,
    });
    expect(outcome.ship.heat.currentHeat).toBe(3);
    // A broken tile's cubes are dumped as heat and are gone from the loadout.
    expect(cubesOnLoadout(outcome.ship)).toBe(cubesOnLoadout(target) - 3);
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

  it("a critical still breaks the named slot when the shields absorbed the whole shot", () => {
    // The wall holding is not a defence against being named: a fat, public slot
    // is a target whether or not the shot that names it reaches the hull.
    const state = withPower(base, "p2", "side-2", 2);
    const outcome = resolveAttack(getShip(state, "p2"), "p2", 2, "engines", 10, attacker);
    expect(outcome.hitResult.result).toBe("critical");
    expect(outcome.hitResult.damageToHull).toBe(0);
    expect(outcome.events.find((e) => e.type === "subsystem_broken")).toMatchObject({
      subsystemId: "engines",
    });
    expect(outcome.ship.subsystems.find((s) => s.id === "engines")!.isBroken).toBe(true);
  });

  it.each([
    // Both cubes went on the two points it absorbed and came off the shield,
    // so there is nothing left to dump: the heat is the two points absorbed.
    ["spent whole, dumps nothing", 2, 0, 2],
    // One point took one cube; the other is dumped on top of the point.
    ["with a cube left, dumps that cube on top of the point absorbed", 1, 1, 2],
  ])(
    "naming the shield that absorbed breaks it after it spent its cubes: %s",
    (_label, damage, energyLost, heat) => {
      const state = withPower(base, "p2", "side-2", 2);
      const outcome = resolveAttack(getShip(state, "p2"), "p2", damage, "side-2", 10, attacker);
      const shield = outcome.ship.subsystems.find((s) => s.id === "side-2")!;
      expect(shield).toMatchObject({ isBroken: true, allocatedEnergy: 0 });
      expect(outcome.hitResult.absorbed).toBe(damage);
      expect(outcome.events.find((e) => e.type === "subsystem_broken")).toMatchObject({
        subsystemId: "side-2",
        energyLost,
      });
      expect(outcome.ship.heat.currentHeat).toBe(heat);
    }
  );

  it("a critical on an already broken or unknown slot has no extra effect", () => {
    const state = withSub(base, "p2", "engines", { isBroken: true });
    const broken = resolveAttack(getShip(state, "p2"), "p2", 2, "engines", 10, attacker);
    expect(broken.events).toEqual([]);
    const unknown = resolveAttack(getShip(base, "p2"), "p2", 2, "side-7", 10, attacker);
    expect(unknown.events).toEqual([]);
    expect(unknown.ship.hitPoints).toBe(8);
  });

  // Nothing is critical-proof: the cold repair (RULES §Energy and Heat) fixes
  // one tile a turn wherever the ship is, so no break can strand it, and the
  // three tiles printed on every loadout are targets like any other.
  it.each(["engines", "rotation", "scoop", "forward-0", "side-0"])(
    "a critical breaks %s like any other slot",
    (named) => {
      const state = { ...laserDuel(), forcedRollValue: 10 };
      const result = executeTurnAs(state, fire(1, "side-0", "p2", named));
      expect(result.errors).toBeUndefined();
      expect(getSub(result.gameState, "p2", named).isBroken).toBe(true);
    }
  );
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
      absorbed: 0,
      targetHullAfter: 8,
    });
  });

  it("a sensor-assisted critical leaves the sensor face-down: only scanning turns it over", () => {
    // The cubes on the bow are public and say what the tile is to anyone
    // counting, but the tile itself is a secret until it does its own job
    // (RULES §Hidden Information).
    const state = laserDuel(undefined, LOADOUTS.sensor);
    const result = executeTurnAs(
      { ...state, forcedRollValue: 8 },
      power(1, "forward-0"),
      fire(2, "side-0", "p2", "engines")
    );
    expect(eventsOf(result.events, "attack_resolved")[0].result).toBe("critical");
    expect(
      eventsOf(result.events, "subsystem_revealed").some((e) => e.subsystemId === "forward-0")
    ).toBe(false);
    expect(getSub(result.gameState, "p1", "forward-0").isRevealed).toBe(false);
  });

  // A rack one ring below its target (side-0 of LOADOUTS.rackTwoShields), and
  // the railgun two sectors behind one on its own ring.
  const rackShot = () => laserDuel(undefined, LOADOUTS.rackTwoShields);
  const railgunShot = () => makeTwoPlayerGame({}, { ring: 3, sector: 2 });
  it.each([
    ["a half shield buys half a rack round", rackShot, "side-0", "ballistic_rack", 2, 1, 1, 1],
    ["a full shield stops a rack round whole", rackShot, "side-0", "ballistic_rack", 2, 2, 0, 2],
    [
      "a half shield buys a point of a railgun's four",
      railgunShot,
      "forward-0",
      "railgun",
      4,
      1,
      3,
      1,
    ],
    ["a full shield stops half a railgun", railgunShot, "forward-0", "railgun", 4, 2, 2, 2],
  ] as const)(
    "%s, spends its cubes and puts the points on the target's track",
    (_label, build, slot, weaponType, damage, cubes, toHull, absorbed) => {
      const state = withPower(build(), "p2", "side-2", cubes);
      const result = executeTurnAs(state, fire(1, slot, "p2"));
      expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
        weaponType,
        damage,
        toHull,
        absorbed,
      });
      const target = getShip(result.gameState, "p2");
      expect(target.hitPoints).toBe(10 - toHull);
      // Absorbing on someone else's turn puts the points on their track now.
      expect(target.heat.currentHeat).toBe(absorbed);
      // The shield spent every cube it had, so nothing is left lit.
      expect(cubesOnLoadout(target)).toBe(0);
    }
  );

  it("laser damage skips the shields: hull takes it all, the cubes stay, no heat", () => {
    const state = withPower(laserDuel(), "p2", "side-2", 2);
    const result = executeTurnAs(state, fire(1, "side-0", "p2"));
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      weaponType: "laser",
      damage: 2,
      toHull: 2,
      absorbed: 0,
      targetHullAfter: 8,
    });
    expect(getShip(result.gameState, "p2").hitPoints).toBe(8);
    expect(getShip(result.gameState, "p2").heat.currentHeat).toBe(0);
    expect(getSub(result.gameState, "p2", "side-2")).toMatchObject({
      allocatedEnergy: 2,
      isRevealed: false,
    });
  });
});
