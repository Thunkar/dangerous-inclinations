import { describe, it, expect } from "vitest";
import { REACTOR_CAPACITY } from "../../models/game.ts";
import {
  allocate,
  deallocate,
  coast,
  executeTurnAs,
  getShip,
  getSub,
  makeTwoPlayerGame,
  mustExecute,
  totalEnergy,
  withPower,
  withSub,
  eventsOf,
} from "../testUtils.ts";

describe("energy: allocation", () => {
  it("moves energy from the reactor to the subsystem and powers it", () => {
    const state = mustExecute(makeTwoPlayerGame(), allocate("engines", 2));
    const engines = getSub(state, "p1", "engines");
    expect(engines.allocatedEnergy).toBe(2);
    expect(engines.isPowered).toBe(true);
    expect(getShip(state, "p1").reactor.availableEnergy).toBe(REACTOR_CAPACITY - 2);
  });

  it("emits a public energy_allocated event: cubes sit on the tiles in the open", () => {
    const result = executeTurnAs(makeTwoPlayerGame(), allocate("engines", 2));
    const [event] = eventsOf(result.events, "energy_allocated");
    expect(event).toMatchObject({ playerId: "p1", subsystemId: "engines", amount: 2 });
    expect(event).not.toHaveProperty("privateTo");
  });

  it("powers slot tiles independently: two lasers can differ", () => {
    const state = mustExecute(makeTwoPlayerGame(), allocate("side-0", 2));
    expect(getSub(state, "p1", "side-0").isPowered).toBe(true);
    expect(getSub(state, "p1", "side-1").isPowered).toBe(false);
    expect(getSub(state, "p1", "side-1").allocatedEnergy).toBe(0);
  });

  it("stacks allocations across turns up to the maximum", () => {
    let state = withPower(makeTwoPlayerGame(), "p1", "side-2", 1);
    state = { ...state, activePlayerIndex: 0 };
    state = mustExecute(state, allocate("side-2", 1));
    expect(getSub(state, "p1", "side-2").allocatedEnergy).toBe(2);
  });

  it("deallocation returns energy and unpowers the tile at zero", () => {
    const result = executeTurnAs(
      withPower(makeTwoPlayerGame(), "p1", "engines", 3),
      deallocate("engines", 3)
    );
    const state = result.gameState;
    const engines = getSub(state, "p1", "engines");
    expect(engines.allocatedEnergy).toBe(0);
    expect(engines.isPowered).toBe(false);
    expect(getShip(state, "p1").reactor.availableEnergy).toBe(REACTOR_CAPACITY);
    expect(eventsOf(result.events, "energy_deallocated")).toEqual([
      expect.objectContaining({ playerId: "p1", subsystemId: "engines", amount: 3 }),
    ]);
    expect(eventsOf(result.events, "energy_deallocated")[0]).not.toHaveProperty("privateTo");
  });

  it("deallocations are processed before allocations, so energy can be moved in one turn", () => {
    let state = makeTwoPlayerGame();
    state = withPower(state, "p1", "forward-0", 4);
    state = withPower(state, "p1", "engines", 3);
    state = withPower(state, "p1", "scoop", 3);
    expect(getShip(state, "p1").reactor.availableEnergy).toBe(0);

    const next = mustExecute(state, allocate("side-0", 2), deallocate("scoop", 3));
    expect(getSub(next, "p1", "scoop").allocatedEnergy).toBe(0);
    expect(getSub(next, "p1", "side-0").allocatedEnergy).toBe(2);
    expect(getShip(next, "p1").reactor.availableEnergy).toBe(1);
  });

  it("allocated energy persists across turns and is conserved", () => {
    let state = mustExecute(makeTwoPlayerGame(), allocate("engines", 2), allocate("side-2", 2));
    state = mustExecute(state, coast(1)); // p2
    state = mustExecute(state, allocate("engines", 1)); // p1 again
    expect(getSub(state, "p1", "engines").allocatedEnergy).toBe(3);
    expect(getSub(state, "p1", "side-2").allocatedEnergy).toBe(2);
    expect(totalEnergy(getShip(state, "p1"))).toBe(REACTOR_CAPACITY);
  });

  it("a shield takes its cubes in pairs: 2 or 4, never 1 or 3", () => {
    // Two cubes buy one point (RULES §Energy and Heat), so an odd cube would
    // sit on a promise the rules do not keep.
    const state = makeTwoPlayerGame();
    expect(executeTurnAs(state, allocate("side-2", 1)).errors?.[0]).toMatch(/at least 2/i);
    expect(executeTurnAs(state, allocate("side-2", 3)).errors?.[0]).toMatch(/2 cubes at a time/i);
    expect(getSub(mustExecute(state, allocate("side-2", 2)), "p1", "side-2").allocatedEnergy).toBe(
      2
    );
    // Built directly: mustExecute would hand the turn to p2 and the next
    // allocation would be theirs.
    const two = withPower(makeTwoPlayerGame(), "p1", "side-2", 2);
    expect(executeTurnAs(two, allocate("side-2", 1)).errors?.[0]).toMatch(/2 cubes at a time/i);
    expect(getSub(mustExecute(two, allocate("side-2", 2)), "p1", "side-2").allocatedEnergy).toBe(4);
  });
});

describe("energy: rejected allocations", () => {
  it.each([
    ["zero amount", allocate("engines", 0)],
    ["negative amount", allocate("engines", -1)],
    ["fractional amount", allocate("engines", 1.5)],
    ["above the subsystem maximum", allocate("engines", 4)],
    ["below the minimum from zero", allocate("forward-0", 3)],
    ["scoop below its minimum of 3", allocate("scoop", 2)],
    ["unknown subsystem", allocate("side-9", 1)],
  ])("rejects %s and leaves the state untouched", (_label, action) => {
    const state = makeTwoPlayerGame();
    const result = executeTurnAs(state, action);
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.gameState).toBe(state);
  });

  it("rejects allocating more than the reactor has left", () => {
    const state = withPower(makeTwoPlayerGame(), "p1", "forward-0", 4); // 6 left
    const result = executeTurnAs(
      state,
      allocate("engines", 3),
      allocate("scoop", 3),
      allocate("side-0", 2)
    );
    expect(result.errors?.[0]).toMatch(/not enough energy/i);
  });

  it("rejects energy for a broken subsystem", () => {
    const state = withSub(makeTwoPlayerGame(), "p1", "engines", { isBroken: true });
    const result = executeTurnAs(state, allocate("engines", 1));
    expect(result.errors?.[0]).toMatch(/broken/i);
  });

  it("rejects energy for passive tiles (radiator)", () => {
    const state = makeTwoPlayerGame({
      loadout: { forwardSlots: ["railgun"], sideSlots: ["radiator", "laser", "shields", "laser"] },
    });
    const result = executeTurnAs(state, allocate("side-0", 1));
    expect(result.errors?.[0]).toMatch(/passive/i);
  });

  it("a rejected allocation aborts the whole turn, including valid actions", () => {
    const state = makeTwoPlayerGame();
    const result = executeTurnAs(state, allocate("engines", 1), allocate("engines", 9));
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(getSub(result.gameState, "p1", "engines").allocatedEnergy).toBe(0);
    expect(result.gameState.activePlayerIndex).toBe(0);
  });
});

describe("energy: rejected deallocations", () => {
  it.each([
    ["nothing allocated", 0, 1],
    ["more than allocated", 2, 3],
    ["zero", 2, 0],
    ["negative", 2, -1],
  ])("rejects deallocating %s", (_label, allocated, amount) => {
    const state =
      allocated > 0
        ? withPower(makeTwoPlayerGame(), "p1", "engines", allocated)
        : makeTwoPlayerGame();
    const result = executeTurnAs(state, deallocate("engines", amount));
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(getSub(result.gameState, "p1", "engines").allocatedEnergy).toBe(allocated);
  });

  it("allows partial deallocation while the remainder still meets the minimum", () => {
    // The engines take 1-3, so they are the tile with room to come down a cube.
    const state = mustExecute(
      withPower(makeTwoPlayerGame(), "p1", "engines", 3),
      deallocate("engines", 1)
    );
    expect(getSub(state, "p1", "engines").allocatedEnergy).toBe(2);
    expect(getSub(state, "p1", "engines").isPowered).toBe(true);
  });

  it("refuses to leave a shield on an odd cube, coming down as well as going up", () => {
    const two = withPower(makeTwoPlayerGame(), "p1", "side-2", 2);
    expect(executeTurnAs(two, deallocate("side-2", 1)).errors?.[0]).toMatch(/partially powered/i);
    expect(executeTurnAs(two, deallocate("side-2", 2)).errors).toBeUndefined();

    const four = withPower(makeTwoPlayerGame(), "p1", "side-2", 4);
    expect(executeTurnAs(four, deallocate("side-2", 1)).errors?.[0]).toMatch(/2 cubes at a time/i);
    expect(getSub(mustExecute(four, deallocate("side-2", 2)), "p1", "side-2").allocatedEnergy).toBe(
      2
    );
  });
});
