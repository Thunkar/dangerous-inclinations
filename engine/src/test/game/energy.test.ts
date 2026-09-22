import { describe, it, expect } from "vitest";
import { MAX_HEAT } from "../../models/game.ts";
import { BURN_COSTS } from "../../models/rings.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";
import {
  standing,
  burn,
  coast,
  cubesOnLoadout,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  makeTwoPlayerGame,
  mustExecute,
  scan,
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

/** A rack on side-0 with a rival one sector along the same ring, in its arc. */
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

/**
 * The whole energy rule: a tile's cubes are heat at its owner's check, however
 * they got onto the tile (RULES §Energy and Heat).
 */
describe("energy: every cube is heat at the check", () => {
  it.each([
    ["a soft burn", [burn(1, "soft")], BURN_COSTS.soft.energy],
    ["a medium burn", [burn(1, "medium")], BURN_COSTS.medium.energy],
    ["a scooping coast", [coast(1, true)], getSubsystemConfig("scoop").minEnergy],
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

  it("charges a standing tile at every check, doing nothing at all", () => {
    let state = mustExecute(rackAndTarget(), standing("side-0", 2), coast(1));
    expect(eventsOf(executeTurnAs(state, coast(1)).events, "heat_check")).toBeDefined();
    state = mustExecute(state, coast(1)); // p2
    const again = executeTurnAs(state, coast(1));
    expect(eventsOf(again.events, "heat_check")[0].cubes).toBe(2);
  });

  it("charges a standing tile once when it also acts: no double bill", () => {
    // The rack is up at two cubes and fires as a gun. Its cubes are two, so
    // the check is two, not two for standing and two more for the shot.
    const state = withPower(rackAndTarget(), "p1", "side-0", 2);
    const result = executeTurnAs(state, fire(1, "side-0", "p2"), coast(2));
    expect(result.errors ?? []).toEqual([]);
    // The shot adds nothing: the two cubes were already on the bill.
    expect(eventsOf(result.events, "weapon_fired")[0].heat).toBe(0);
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(2);
  });

  it("charges a sensor already up nothing extra for scanning", () => {
    const state = withPower(rackAndTarget(), "p1", "forward-0", 2);
    const result = executeTurnAs(state, scan(1, "p2", "side-0"), coast(2));
    expect(result.errors ?? []).toEqual([]);
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(2);
  });

  it("charges nothing for a tile that did nothing and is not up", () => {
    const result = executeTurnAs(makeTwoPlayerGame(), coast(1));
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(0);
  });

  it("takes a standing tile's cubes off again when an action lit it, not a switch", () => {
    // Firing a dark rack is one use of a gun, not a decision to hold point
    // defence up: it costs its two this turn and goes dark with everything
    // else, so nobody is billed at every check for a rack they fired once.
    const state = mustExecute(rackAndTarget(), fire(1, "side-0", "p2"), coast(2));
    expect(getSub(state, "p1", "side-0")).toMatchObject({
      allocatedEnergy: 0,
      isPowered: false,
      isStanding: false,
    });
  });

  it("leaves a switched-on tile up, and keeps billing for it", () => {
    let state = mustExecute(rackAndTarget(), standing("side-0", 2), fire(1, "side-0", "p2"), coast(2));
    expect(getSub(state, "p1", "side-0")).toMatchObject({ allocatedEnergy: 2, isStanding: true });
    state = mustExecute(state, coast(1)); // p2
    // A quiet turn later it is still up and still costs its two.
    expect(eventsOf(executeTurnAs(state, coast(1)).events, "heat_check")[0].cubes).toBe(2);
  });

  it("takes a scanning sensor's cubes off too: a scan is not a firing solution", () => {
    const state = mustExecute(rackAndTarget(), scan(1, "p2", "side-0"), coast(2));
    expect(getSub(state, "p1", "forward-0")).toMatchObject({
      allocatedEnergy: 0,
      isStanding: false,
    });
  });

  it("gives an action's cubes back at the end of the turn, so only what is up is read", () => {
    const state = mustExecute(makeTwoPlayerGame({ ring: 2 }), standing("side-2", 2), burn(1, "soft"));
    expect(getSub(state, "p1", "engines").allocatedEnergy).toBe(0);
    expect(getSub(state, "p1", "side-2").allocatedEnergy).toBe(2);
    expect(cubesOnLoadout(getShip(state, "p1"))).toBe(2);
  });
});

  it("balances: what the actions report plus what stands is what the check bills", () => {
    // The invariant the whole rule rests on. Each action reports the cubes it
    // put on a tile, a switched-on tile carries its own, and the check adds up
    // the loadout: the two have to agree or somebody is being billed twice.
    const state = withPower(rackAndTarget(), "p1", "side-2", 2);
    const result = executeTurnAs(
      state,
      standing("forward-0", 2),
      fire(1, "side-0", "p2"),
      burn(2, "soft")
    );
    expect(result.errors ?? []).toEqual([]);
    const reported =
      eventsOf(result.events, "weapon_fired").reduce((sum, e) => sum + e.heat, 0) +
      eventsOf(result.events, "burned").reduce((sum, e) => sum + e.heat, 0);
    const switchedOn = 2 + 2; // the wall it already held and the sensor it just raised
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(reported + switchedOn);
  });

describe("energy: no reactor, so heat is the only limit", () => {
  it("lets a ship light more than it can cool, and charges it the hull", () => {
    // Four walls at four cubes is sixteen, and a hard burn is three more: a
    // reactor would have refused this and the heat track simply bills for it.
    let state = fourShields({ ring: 2 });
    for (const id of ["side-0", "side-1", "side-2", "side-3"])
      state = withPower(state, "p1", id, 4);
    const result = executeTurnAs(state, burn(1, "hard"));
    expect(result.errors ?? []).toEqual([]);
    const cubes = 16 + BURN_COSTS.hard.energy;
    const [check] = eventsOf(result.events, "heat_check");
    expect(check.cubes).toBe(cubes);
    expect(check.damage).toBe(cubes - MAX_HEAT);
    expect(getShip(result.gameState, "p1").hitPoints).toBe(10 - (cubes - MAX_HEAT));
  });

  it.each([
    ["a hard burn behind a full wall", [burn(1, "hard")]],
    ["a railgun shot behind a full wall", [fire(1, "forward-0", "p2"), coast(2)]],
  ] as const)("no longer refuses %s for energy", (_label, actions) => {
    let state = fourShields({ ring: 2 });
    for (const id of ["side-0", "side-1", "side-2", "side-3"])
      state = withPower(state, "p1", id, 4);
    // The rival sits one ring out and two sectors ahead: inside the railgun's arc.
    state = withShip(state, "p2", { ring: 2, sector: 2 });
    expect(executeTurnAs(state, ...actions).errors ?? []).toEqual([]);
  });
});

describe("energy: standing tiles are the only setting", () => {
  it.each([
    ["shields at two", "side-2", 2],
    ["shields at four", "side-2", 4],
    ["shields off", "side-2", 0],
  ])("switches %s", (_label, id, amount) => {
    const start = withPower(makeTwoPlayerGame(), "p1", id, amount === 0 ? 4 : 0);
    const state = mustExecute(start, standing(id, amount));
    expect(getSub(state, "p1", id).allocatedEnergy).toBe(amount);
    expect(getSub(state, "p1", id).isPowered).toBe(amount > 0);
  });

  it("stays up across turns, which is what makes it readable", () => {
    let state = mustExecute(makeTwoPlayerGame(), standing("side-2", 4), coast(1));
    state = mustExecute(state, coast(1)); // p2
    expect(getSub(state, "p1", "side-2").allocatedEnergy).toBe(4);
  });

  it("announces the switch to the whole table, with what it held before", () => {
    const result = executeTurnAs(
      withPower(makeTwoPlayerGame(), "p1", "side-2", 4),
      standing("side-2", 2)
    );
    const [event] = eventsOf(result.events, "standing_power_set");
    expect(event).toMatchObject({ playerId: "p1", subsystemId: "side-2", amount: 2, previous: 4 });
    expect(event).not.toHaveProperty("privateTo");
  });

  it("says nothing when the tile already holds what was asked for", () => {
    const result = executeTurnAs(
      withPower(makeTwoPlayerGame(), "p1", "side-2", 2),
      standing("side-2", 2)
    );
    expect(eventsOf(result.events, "standing_power_set")).toHaveLength(0);
  });

  it.each([
    ["the engines", "engines", 2],
    ["a railgun", "forward-0", 4],
    ["a laser", "side-0", 2],
  ])("refuses to switch on %s: an action powers it", (_label, id, amount) => {
    const state = makeTwoPlayerGame();
    const result = executeTurnAs(state, standing(id, amount));
    expect(result.errors?.[0]).toMatch(/powered by the action that uses it/i);
    expect(result.gameState).toBe(state);
  });

  it.each([
    ["one cube on a shield", "side-2", 1, /at least 2/i],
    ["three cubes on a shield", "side-2", 3, /2 cubes at a time/i],
    ["more than the tile holds", "side-2", 6, /at most 4/i],
    ["a negative setting", "side-2", -1, /whole number/i],
  ])("rejects %s", (_label, id, amount, message) => {
    const state = makeTwoPlayerGame();
    const result = executeTurnAs(state, standing(id, amount));
    expect(result.errors?.[0]).toMatch(message);
    expect(result.gameState).toBe(state);
  });

  it("rejects a broken tile", () => {
    const state = withSub(makeTwoPlayerGame(), "p1", "side-2", { isBroken: true });
    expect(executeTurnAs(state, standing("side-2", 2)).errors?.[0]).toMatch(/broken/i);
  });
});
