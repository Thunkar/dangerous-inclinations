import { describe, it, expect } from "vitest";
import { FIRST_TURN, MAX_HEAT } from "../../models/game.ts";
import { BURN_COSTS } from "../../models/rings.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";
import type { GameState } from "../../models/game.ts";
import {
  burn,
  coast,
  cubesOnLoadout,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  makeTwoPlayerGame,
  mustExecute,
  power,
  scan,
  withMissile,
  withPower,
  withShip,
  withSub,
  eventsOf,
} from "../testUtils.ts";

/** Four shield tiles: the hull for lighting more than a ship can cool. */
const fourShields = (p1: { ring?: number } = {}) =>
  makeTwoPlayerGame({
    ...p1,
    loadout: { forwardSlots: ["railgun"], sideSlots: ["shields", "shields", "shields", "shields"] },
  });

/**
 * A sensor bow, a rack on side-0 and a wall on side-2, with a rival one sector
 * along the same ring: in the rack's arc and inside scan range.
 */
const rackAndTarget = () =>
  makeTwoPlayerGame(
    {
      sector: 0,
      loadout: {
        forwardSlots: ["sensor_array"],
        sideSlots: ["ballistic_rack", "laser", "shields", "radiator"],
      },
    },
    { sector: 1 }
  );

/** A missile of p2's sitting on p1, so it attacks when p2's turn moves it. */
const p2MissileOnP1 = (state: GameState, criticalTarget = "engines") => {
  const { wellId, ring, sector } = getShip(state, "p1");
  return withMissile(state, {
    ownerId: "p2",
    targetId: "p1",
    wellId,
    ring,
    sector,
    criticalTarget,
    launchedAfterMove: true,
  });
};

/**
 * The whole energy rule: every cube on the loadout is a point of heat at its
 * owner's check, however it got onto the tile (RULES §Energy and Heat).
 */
describe("energy: every cube is heat at the check", () => {
  it.each([
    ["a soft burn", [burn(1, "soft")], BURN_COSTS.soft.energy],
    ["a medium burn", [burn(1, "medium")], BURN_COSTS.medium.energy],
    ["a scooping coast", [coast(1, true)], getSubsystemConfig("scoop").minEnergy],
    ["a full wall", [power(1, "side-2", 4), coast(2)], 4],
    ["a half wall", [power(1, "side-2", 2), coast(2)], 2],
  ] as const)("charges %s exactly its cubes", (_label, actions, expected) => {
    const result = executeTurnAs(makeTwoPlayerGame({ ring: 2 }), ...actions);
    expect(result.errors ?? []).toEqual([]);
    const [check] = eventsOf(result.events, "heat_check");
    expect(check.cubes).toBe(expected);
    expect(check.heat).toBe(expected);
  });

  it("adds the draws of a whole turn together", () => {
    // Point blank, so the laser bears: a shot, a scooping coast and nothing else.
    const result = executeTurnAs(
      makeTwoPlayerGame({ ring: 2, sector: 0 }, { ring: 2, sector: 0 }),
      fire(1, "side-0", "p2"),
      coast(2, true)
    );
    expect(result.errors ?? []).toEqual([]);
    const laser = getSubsystemConfig("laser").minEnergy;
    const scoop = getSubsystemConfig("scoop").minEnergy;
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(laser + scoop);
  });

  it("charges nothing for a tile that did nothing and was not powered", () => {
    const result = executeTurnAs(makeTwoPlayerGame(), coast(1));
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(0);
  });

  it("bills a powered shield once, and a shield not powered again is at 0 on the next turn", () => {
    const powered = executeTurnAs(makeTwoPlayerGame(), power(1, "side-2", 4), coast(2));
    expect(eventsOf(powered.events, "heat_check")[0].cubes).toBe(4);
    // It works through p2's turn and is still holding its cubes when p2 is done.
    const afterP2 = mustExecute(powered.gameState, coast(1));
    expect(getSub(afterP2, "p1", "side-2").allocatedEnergy).toBe(4);
    // p1's next turn clears it: not powered again, it is neither up nor billed.
    const next = executeTurnAs(afterP2, coast(1));
    expect(eventsOf(next.events, "heat_check")[0].cubes).toBe(0);
    expect(getSub(next.gameState, "p1", "side-2")).toMatchObject({
      allocatedEnergy: 0,
      isPowered: false,
    });
  });

  it("clears last turn's cubes before the actions, so the check bills only this turn's", () => {
    // Cubes left on p1's loadout from its last turn: a wall and a railgun.
    let state = withPower(makeTwoPlayerGame({ ring: 2 }), "p1", "side-2", 4);
    state = withPower(state, "p1", "forward-0", 4);
    const result = executeTurnAs(state, burn(1, "soft"));
    expect(result.errors ?? []).toEqual([]);
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(BURN_COSTS.soft.energy);
    expect(cubesOnLoadout(getShip(result.gameState, "p1"))).toBe(BURN_COSTS.soft.energy);
  });

  it("balances: what the actions report is what the check bills", () => {
    // The invariant the whole rule rests on. Each action reports the cubes it
    // put on a tile and the check adds up the loadout: the two have to agree
    // or somebody is being billed twice. Last turn's wall is not on the bill.
    const state = withPower(rackAndTarget(), "p1", "side-2", 2);
    const result = executeTurnAs(
      state,
      power(1, "forward-0"),
      fire(2, "side-0", "p2"),
      burn(3, "soft")
    );
    expect(result.errors ?? []).toEqual([]);
    const reported =
      eventsOf(result.events, "subsystem_powered").reduce((sum, e) => sum + e.amount, 0) +
      eventsOf(result.events, "weapon_fired").reduce((sum, e) => sum + e.heat, 0) +
      eventsOf(result.events, "burned").reduce((sum, e) => sum + e.heat, 0);
    expect(reported).toBeGreaterThan(0);
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(reported);
  });
});

describe("energy: it stays on the tile until its owner's next turn", () => {
  it.each([
    [
      "a railgun that fired",
      "forward-0",
      4,
      { sector: 2 },
      [fire(1, "forward-0", "p2", "engines", true)],
    ],
    ["a laser that fired", "side-0", 2, { sector: 0 }, [fire(1, "side-0", "p2"), coast(2)]],
    ["a soft burn's engines", "engines", 1, { sector: 12 }, [burn(1, "soft")]],
    ["a powered wall", "side-2", 4, { sector: 12 }, [power(1, "side-2", 4), coast(2)]],
  ] as const)(
    "keeps %s loaded through the next player's turn",
    (_label, id, cubes, p2, actions) => {
      const start = makeTwoPlayerGame({ ring: 2, sector: 0 }, { ring: 2, ...p2 });
      const afterP1 = mustExecute(start, ...actions);
      expect(getSub(afterP1, "p1", id).allocatedEnergy).toBe(cubes);
      const afterP2 = mustExecute(afterP1, coast(1));
      expect(getSub(afterP2, "p1", id)).toMatchObject({ allocatedEnergy: cubes, isPowered: true });
      // Gone once p1's own next turn is processed.
      const next = mustExecute(afterP2, coast(1));
      expect(getSub(next, "p1", id)).toMatchObject({ allocatedEnergy: 0, isPowered: false });
    }
  );

  it.each([
    ["fired", [fire(1, "side-0", "p2"), coast(2)], 1],
    ["powered", [power(1, "side-0"), coast(2)], 1],
    ["left dark", [coast(1)], 0],
  ] as const)(
    "a rack that %s intercepts on the next player's turn accordingly",
    (_l, actions, n) => {
      const afterP1 = mustExecute(rackAndTarget(), ...actions);
      const onP2 = executeTurnAs(p2MissileOnP1(afterP1), coast(1));
      expect(onP2.errors ?? []).toEqual([]);
      expect(eventsOf(onP2.events, "missile_intercepted")).toHaveLength(n);
      // Intercepted on a 2+, or it lands on p1's hull.
      const hits = eventsOf(onP2.events, "attack_resolved").filter((e) => e.targetId === "p1");
      expect(hits).toHaveLength(1 - n);
    }
  );

  it.each([
    ["fired on p1's turn", [fire(1, "forward-0", "p2", "engines", true)], 4],
    ["left dark", [coast(1)], 0],
  ] as const)(
    "a critical on p2's turn on a railgun that %s dumps its cubes into p1's heat",
    (_label, actions, dumped) => {
      const afterP1 = mustExecute(makeTwoPlayerGame({ sector: 0 }, { sector: 2 }), ...actions);
      const heatBefore = getShip(afterP1, "p1").heat.currentHeat;
      const armed = { ...p2MissileOnP1(afterP1, "forward-0"), forcedRollValue: 10 };
      const onP2 = executeTurnAs(armed, coast(1));
      expect(onP2.errors ?? []).toEqual([]);
      const [broken] = eventsOf(onP2.events, "subsystem_broken");
      expect(broken).toMatchObject({
        playerId: "p1",
        subsystemId: "forward-0",
        energyLost: dumped,
      });
      expect(getShip(onP2.gameState, "p1").heat.currentHeat).toBe(heatBefore + dumped);
    }
  );
});

describe("energy: no reactor, so heat is the only limit", () => {
  const fullWalls = [1, 2, 3, 4].map((seq, i) => power(seq, `side-${i}`, 4));

  it("lets a ship light more than it can cool, and charges it the hull", () => {
    // Four walls at four cubes is sixteen, and a hard burn is three more: a
    // reactor would have refused this and the heat track simply bills for it.
    const result = executeTurnAs(fourShields({ ring: 2 }), ...fullWalls, burn(5, "hard"));
    expect(result.errors ?? []).toEqual([]);
    const cubes = 16 + BURN_COSTS.hard.energy;
    const [check] = eventsOf(result.events, "heat_check");
    expect(check.cubes).toBe(cubes);
    expect(check.damage).toBe(cubes - MAX_HEAT);
    expect(getShip(result.gameState, "p1").hitPoints).toBe(10 - (cubes - MAX_HEAT));
  });

  it.each([
    ["a hard burn behind a full wall", [burn(5, "hard")]],
    ["a railgun shot behind a full wall", [fire(5, "forward-0", "p2"), coast(6)]],
  ] as const)("does not refuse %s for energy", (_label, actions) => {
    // The rival sits one ring out and two sectors ahead: inside the railgun's arc.
    const state = withShip(fourShields({ ring: 2 }), "p2", { ring: 2, sector: 2 });
    expect(executeTurnAs(state, ...fullWalls, ...actions).errors ?? []).toEqual([]);
  });
});

describe("energy: power", () => {
  it.each([
    ["shields at two", "side-2", 2, 2],
    ["shields at four", "side-2", 4, 4],
    ["shields at their minimum", "side-2", undefined, 2],
    ["a rack", "side-0", undefined, 2],
    ["a sensor array", "forward-0", 2, 2],
  ] as const)("powers %s", (_label, id, amount, expected) => {
    const result = executeTurnAs(rackAndTarget(), power(1, id, amount), coast(2));
    expect(result.errors ?? []).toEqual([]);
    expect(getSub(result.gameState, "p1", id)).toMatchObject({
      allocatedEnergy: expected,
      isPowered: true,
      // Powering is not using: the tile stays face-down.
      isRevealed: false,
    });
    expect(eventsOf(result.events, "subsystem_revealed")).toHaveLength(0);
    const [event] = eventsOf(result.events, "subsystem_powered");
    expect(event).toMatchObject({ playerId: "p1", subsystemId: id, amount: expected });
    // Public, as the cubes are, and it does not name a face-down tile's type.
    expect(event).not.toHaveProperty("privateTo");
    expect(event).not.toHaveProperty("subsystemType");
  });

  it("names the tile's type once it is already face-up", () => {
    const state = withSub(rackAndTarget(), "p1", "side-2", { isRevealed: true });
    const [event] = eventsOf(
      executeTurnAs(state, power(1, "side-2", 4)).events,
      "subsystem_powered"
    );
    expect(event).toMatchObject({ subsystemId: "side-2", subsystemType: "shields" });
  });

  it("is allowed on a quiet turn: a wall reaches nobody", () => {
    const state = { ...rackAndTarget(), turn: FIRST_TURN };
    expect(executeTurnAs(state, power(1, "side-2", 4), coast(2)).errors).toBeUndefined();
  });

  it.each([
    ["the engines", "engines"],
    ["the scoop", "scoop"],
    ["a laser", "side-1"],
    ["a radiator", "side-3"],
  ])("refuses to power %s: only shields, racks and sensors take it", (_label, id) => {
    const state = rackAndTarget();
    const result = executeTurnAs(state, power(1, id, 2));
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.gameState).toBe(state);
  });

  it.each([
    ["one cube on a shield", "side-2", 1],
    ["three cubes on a shield", "side-2", 3],
    ["more than a shield holds", "side-2", 6],
    ["a negative amount", "side-2", -2],
    ["a fractional amount", "side-2", 2.5],
    ["four on a rack", "side-0", 4],
    ["four on a sensor", "forward-0", 4],
  ])("rejects %s", (_label, id, amount) => {
    const state = rackAndTarget();
    const result = executeTurnAs(state, power(1, id, amount));
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.gameState).toBe(state);
  });

  it("rejects a broken tile", () => {
    const state = withSub(rackAndTarget(), "p1", "side-2", { isBroken: true });
    expect(executeTurnAs(state, power(1, "side-2", 2)).errors?.length).toBeGreaterThan(0);
    expect(executeTurnAs(rackAndTarget(), power(1, "side-2", 2)).errors).toBeUndefined();
  });

  it.each([
    ["powering a wall twice", [power(1, "side-2", 2), power(2, "side-2", 4)]],
    ["firing a rack powered this turn", [power(1, "side-0"), fire(2, "side-0", "p2")]],
    ["powering a rack that fired this turn", [fire(1, "side-0", "p2"), power(2, "side-0")]],
    ["scanning with a sensor powered this turn", [power(1, "forward-0"), scan(2, "p2", "side-0")]],
    ["powering a sensor that scanned this turn", [scan(1, "p2", "side-0"), power(2, "forward-0")]],
  ] as const)("refuses %s: a tile does one thing a turn", (_label, actions) => {
    const state = rackAndTarget();
    expect(executeTurnAs(state, ...actions).errors?.length).toBeGreaterThan(0);
    // Each half on its own is legal.
    for (const a of actions) {
      expect(executeTurnAs(state, { ...a, sequence: 1 }).errors).toBeUndefined();
    }
  });
});

describe("energy: a sensor widens the shots after it", () => {
  it.each([
    [
      "powered before the shot",
      "critical",
      [power(1, "forward-0"), fire(2, "side-0", "p2"), coast(3)],
    ],
    [
      "scanned with before the shot",
      "critical",
      [scan(1, "p2", "side-1"), fire(2, "side-0", "p2"), coast(3)],
    ],
    ["powered after the shot", "hit", [fire(1, "side-0", "p2"), power(2, "forward-0"), coast(3)]],
    [
      "scanned with after the shot",
      "hit",
      [fire(1, "side-0", "p2"), scan(2, "p2", "side-1"), coast(3)],
    ],
    ["not powered this turn", "hit", [fire(1, "side-0", "p2"), coast(2)]],
  ] as const)("an 8 on a shot with the sensor %s is a %s", (_label, expected, actions) => {
    // Last turn's sensor is cleared when the turn starts: it does not count.
    const state = { ...withPower(rackAndTarget(), "p1", "forward-0", 2), forcedRollValue: 8 };
    const result = executeTurnAs(state, ...actions);
    expect(result.errors ?? []).toEqual([]);
    const [attack] = eventsOf(result.events, "attack_resolved");
    expect(attack.result).toBe(expected);
  });
});
