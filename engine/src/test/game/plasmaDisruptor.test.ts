import { describe, it, expect } from "vitest";
import { isInWeaponRange } from "../../game/targeting.ts";
import { resolveAttack } from "../../game/damage.ts";
import { missionsMissingRequirements, validateLoadout } from "../../game/loadout.ts";
import { MISSION_REQUIREMENTS } from "../../models/missions.ts";
import type { MissionRequirement } from "../../models/missions.ts";
import type { Facing, ShipLoadout } from "../../models/game.ts";
import type { SubsystemId } from "../../models/subsystems.ts";
import {
  DAMAGING_WEAPON_TYPES,
  SUBSYSTEM_CONFIGS,
  WEAPON_SUBSYSTEM_TYPES,
} from "../../models/subsystems.ts";
import {
  BH,
  cubesOnLoadout,
  destroyMission,
  eventsOf,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  makeTwoPlayerGame,
  withPower,
  withSub,
} from "../testUtils.ts";

/** Plasma on both sides: side-0 is port (outward prograde), side-2 starboard (inward). */
const PLASMA: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["plasma_cannon", "shields", "plasma_cannon", "radiator"],
};
const DISRUPTOR: ShipLoadout = {
  forwardSlots: ["disruptor"],
  sideSlots: ["shields", "shields", "radiator", "radiator"],
};
/** Two shields, at side-2 and side-3. */
const TWO_WALLS: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "laser", "shields", "shields"],
};
/** The default target: railgun forward, shields at side-2. */
const TARGET: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};

const attackerAt = (ring: number, sector: number, facing: Facing = "prograde") => ({
  wellId: BH,
  ring,
  sector,
  facing,
});
const at = (ring: number, sector: number) => ({ wellId: BH, ring, sector });

describe("plasma cannon: range", () => {
  const state = makeTwoPlayerGame({ loadout: PLASMA });
  it.each([
    ["one ring out, same sector, port", "side-0", 4, 0, true],
    ["one ring out, one sector ahead, port", "side-0", 4, 1, true],
    ["one ring out, one sector behind, port", "side-0", 4, 23, true],
    ["one ring out, two sectors ahead", "side-0", 4, 2, false],
    ["two rings out", "side-0", 5, 0, false],
    ["one ring in from the port side", "side-0", 2, 0, false],
    ["one ring in, starboard", "side-2", 2, 0, true],
    ["one ring out from the starboard side", "side-2", 4, 0, false],
    ["same ring, one sector ahead", "side-0", 3, 1, false],
    ["same ring, same sector (point blank)", "side-0", 3, 0, true],
  ])("%s: %s at R%i S%i in range is %s", (_label, slot, ring, sector, expected) => {
    expect(isInWeaponRange(getSub(state, "p1", slot), attackerAt(3, 0), at(ring, sector))).toBe(
      expected
    );
  });
});

describe("plasma cannon: a shield cube absorbs two points", () => {
  /** p1 at R3 S0 fires its port plasma at p2 one ring out. */
  const duel = (loadout: ShipLoadout, cubes: Array<[SubsystemId, number]>) =>
    cubes.reduce(
      (state, [slot, n]) => withPower(state, "p2", slot, n),
      makeTwoPlayerGame({ loadout: PLASMA }, { ring: 4, sector: 0, loadout })
    );

  it.each<[string, ShipLoadout, Array<[SubsystemId, number]>, number, number]>([
    ["no shield: all four land", TARGET, [], 4, 0],
    ["a half shield buys two points", TARGET, [["side-2", 1]], 2, 2],
    ["a full shield stops it whole", TARGET, [["side-2", 2]], 0, 4],
    ["two half shields stop it whole between them", TWO_WALLS, [["side-2", 1], ["side-3", 1]], 0, 4],
  ])("%s", (_label, loadout, cubes, toHull, absorbed) => {
    const result = executeTurnAs(duel(loadout, cubes), fire(1, "side-0", "p2"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      weaponType: "plasma_cannon",
      damage: 4,
      toHull,
      absorbed,
    });
    const target = getShip(result.gameState, "p2");
    expect(target.hitPoints).toBe(10 - toHull);
    // The cubes come off the shields and every point absorbed is heat on the track.
    expect(target.heat.currentHeat).toBe(absorbed);
    expect(cubesOnLoadout(target)).toBe(0);
    expect(
      eventsOf(result.events, "subsystem_revealed")
        .filter((e) => e.playerId === "p2")
        .map((e) => e.subsystemId)
    ).toEqual(cubes.map(([slot]) => slot));
  });
});

describe("shields against an ordinary weapon: a point a cube", () => {
  it.each([
    ["a half shield: one absorbed, three to the hull", 1, 1, 3],
    ["a full shield: two absorbed, two to the hull", 2, 2, 2],
  ])("a railgun against %s, and the points on the track", (_label, cubes, absorbed, toHull) => {
    const state = withPower(
      makeTwoPlayerGame({}, { ring: 3, sector: 2, loadout: TARGET }),
      "p2",
      "side-2",
      cubes
    );
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      weaponType: "railgun",
      damage: 4,
      toHull,
      absorbed,
    });
    const target = getShip(result.gameState, "p2");
    expect(target.hitPoints).toBe(10 - toHull);
    expect(target.heat.currentHeat).toBe(absorbed);
    expect(getSub(result.gameState, "p2", "side-2").allocatedEnergy).toBe(0);
  });
});

describe("disruptor: range", () => {
  /** A disruptor in the bow and one on a side slot: the box is the same from either. */
  const state = makeTwoPlayerGame({
    loadout: { forwardSlots: ["disruptor"], sideSlots: ["disruptor", "shields", "radiator", "radiator"] },
  });
  const cases = [
    ["one ring out, same sector", 4, 0, true],
    ["one ring out, one sector ahead", 4, 1, true],
    ["one ring out, one sector behind", 4, 23, true],
    ["one ring in, same sector", 2, 0, true],
    ["one ring in, one sector ahead", 2, 1, true],
    ["one ring in, one sector behind", 2, 23, true],
    ["same ring, one sector ahead", 3, 1, true],
    ["same ring, one sector behind", 3, 23, true],
    ["point blank", 3, 0, true],
    ["same ring, two sectors ahead", 3, 2, false],
    ["one ring out, two sectors behind", 4, 22, false],
    ["two rings out", 5, 0, false],
    ["two rings in", 1, 0, false],
  ] as const;
  it.each(
    (["forward-0", "side-0"] as const).flatMap((slot) =>
      (["prograde", "retrograde"] as const).flatMap((facing) =>
        cases.map(([label, ring, sector, expected]) => [label, slot, facing, ring, sector, expected] as const)
      )
    )
  )("%s from %s facing %s (R%i S%i): in range is %s", (_label, slot, facing, ring, sector, expected) => {
    expect(
      isInWeaponRange(getSub(state, "p1", slot), attackerAt(3, 0, facing), at(ring, sector))
    ).toBe(expected);
  });

  it("fits either slot", () => {
    expect(
      validateLoadout({
        forwardSlots: ["sensor_array"],
        sideSlots: ["disruptor", "disruptor", "shields", "radiator"],
      })
    ).toEqual({ valid: true, errors: [] });
  });
});

describe("disruptor: a hit breaks the named slot", () => {
  /** p1 a sector behind p2 on ring 3; p2's railgun holds the four cubes it fired with. */
  const duel = (roll: number) => {
    const state = makeTwoPlayerGame(
      { loadout: DISRUPTOR },
      { ring: 3, sector: 1, loadout: TARGET },
      { forcedRollValue: roll }
    );
    return withPower(state, "p2", "forward-0", 4);
  };

  it.each([
    ["a plain hit", 5],
    ["a 10, which is only a hit", 10],
    ["a 2", 2],
  ])("%s breaks the slot and dumps its cubes as heat", (_label, roll) => {
    const result = executeTurnAs(duel(roll), fire(1, "forward-0", "p2", "forward-0"));
    expect(result.errors).toBeUndefined();
    const attack = eventsOf(result.events, "attack_resolved")[0];
    expect(attack).toMatchObject({
      weaponType: "disruptor",
      result: "hit",
      damage: 0,
      toHull: 0,
      absorbed: 0,
      targetHullAfter: 10,
    });
    expect(attack.blocked).toBeUndefined();
    expect(eventsOf(result.events, "subsystem_broken")).toEqual([
      expect.objectContaining({ playerId: "p2", subsystemId: "forward-0", energyLost: 4, by: "p1" }),
    ]);
    const target = getShip(result.gameState, "p2");
    expect(target.hitPoints).toBe(10);
    expect(target.heat.currentHeat).toBe(4);
    expect(getSub(result.gameState, "p2", "forward-0")).toMatchObject({
      isBroken: true,
      allocatedEnergy: 0,
    });
  });

  it("a 1 misses and breaks nothing", () => {
    const before = duel(1);
    const result = executeTurnAs(before, fire(1, "forward-0", "p2", "forward-0"));
    expect(eventsOf(result.events, "attack_resolved")[0].result).toBe("miss");
    expect(eventsOf(result.events, "subsystem_broken")).toEqual([]);
    expect(getShip(result.gameState, "p2")).toEqual(getShip(before, "p2"));
  });

  it("a powered sensor on the attacker makes no critical of it", () => {
    let sensorShip = makeTwoPlayerGame({ loadout: PLASMA });
    sensorShip = withPower(sensorShip, "p1", "forward-0", 2);
    const target = getShip(duel(5), "p2");
    const outcome = resolveAttack(target, "p2", 0, "forward-0", 8, getShip(sensorShip, "p1"), "p1", {
      disrupts: true,
    });
    expect(outcome.hitResult.result).toBe("hit");
    // The same roll from the same ship is a critical for any other weapon.
    expect(
      resolveAttack(target, "p2", 2, "forward-0", 8, getShip(sensorShip, "p1"), "p1").hitResult
        .result
    ).toBe("critical");
  });

  it("firing reveals the disruptor", () => {
    const result = executeTurnAs(duel(5), fire(1, "forward-0", "p2", "forward-0"));
    expect(
      eventsOf(result.events, "subsystem_revealed").some(
        (e) => e.playerId === "p1" && e.subsystemId === "forward-0" && e.subsystemType === "disruptor"
      )
    ).toBe(true);
    expect(getSub(result.gameState, "p1", "forward-0").isRevealed).toBe(true);
  });
});

describe("disruptor: any powered shield blocks it", () => {
  const duel = (shieldCubes: number, broken = false) => {
    let state = makeTwoPlayerGame({ loadout: DISRUPTOR }, { ring: 3, sector: 1, loadout: TARGET });
    state = withPower(state, "p2", "forward-0", 4);
    state = withPower(state, "p2", "side-2", shieldCubes);
    if (broken) state = withSub(state, "p2", "side-2", { isBroken: true });
    return state;
  };

  it.each([
    ["one cube", 1],
    ["two cubes", 2],
  ])("%s on a shield: nothing happens but the shield turns face-up", (_label, cubes) => {
    const before = duel(cubes);
    const result = executeTurnAs(before, fire(1, "forward-0", "p2", "forward-0"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "attack_resolved")[0]).toMatchObject({
      weaponType: "disruptor",
      result: "hit",
      blocked: true,
      damage: 0,
      toHull: 0,
      absorbed: 0,
    });
    expect(eventsOf(result.events, "subsystem_broken")).toEqual([]);
    expect(eventsOf(result.events, "subsystem_revealed")).toContainEqual(
      expect.objectContaining({ playerId: "p2", subsystemId: "side-2", reason: "absorbed" })
    );
    // No cubes spent, no heat, nothing broken: the target is as it was, its shield face-up.
    const expected = getShip(withSub(before, "p2", "side-2", { isRevealed: true }), "p2");
    expect(getShip(result.gameState, "p2")).toEqual(expected);
    expect(getShip(result.gameState, "p2").heat.currentHeat).toBe(0);
    expect(cubesOnLoadout(getShip(result.gameState, "p2"))).toBe(4 + cubes);
  });

  it.each([
    ["an unpowered shield", 0, false],
    ["a broken shield", 2, true],
  ])("%s does not block", (_label, cubes, broken) => {
    const result = executeTurnAs(duel(cubes, broken), fire(1, "forward-0", "p2", "forward-0"));
    expect(eventsOf(result.events, "attack_resolved")[0].blocked).toBeUndefined();
    expect(getSub(result.gameState, "p2", "forward-0").isBroken).toBe(true);
  });
});

describe("a Destroy needs a weapon that deals damage", () => {
  const WEAPON: MissionRequirement = MISSION_REQUIREMENTS.destroy_ship[0];
  const mission = destroyMission("p2");

  it.each([
    [
      "a disruptor alone",
      { forwardSlots: ["disruptor"], sideSlots: ["shields", "shields", "radiator", "radiator"] },
      [WEAPON],
    ],
    [
      "a plasma cannon alone",
      {
        forwardSlots: ["fuel_compressor"],
        sideSlots: ["plasma_cannon", "shields", "radiator", "radiator"],
      },
      [],
    ],
    [
      "a disruptor beside a plasma cannon",
      { forwardSlots: ["disruptor"], sideSlots: ["plasma_cannon", "shields", "radiator", "radiator"] },
      [],
    ],
  ] as Array<[string, ShipLoadout, MissionRequirement[]]>)(
    "%s",
    (_label, loadout, missing) => {
      expect(missionsMissingRequirements([mission], loadout)).toEqual(
        missing.length > 0 ? [{ mission, missing }] : []
      );
    }
  );

  it("every weapon but the disruptor deals damage", () => {
    expect(WEAPON_SUBSYSTEM_TYPES).toContain("disruptor");
    expect(DAMAGING_WEAPON_TYPES).toEqual(
      WEAPON_SUBSYSTEM_TYPES.filter((t) => t !== "disruptor")
    );
    expect(SUBSYSTEM_CONFIGS.disruptor.weaponStats?.damage).toBe(0);
  });
});
