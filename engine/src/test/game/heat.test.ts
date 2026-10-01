import { describe, it, expect } from "vitest";
import { DEFAULT_DISSIPATION_CAPACITY } from "../../models/game.ts";
import { resolveEndOfTurnHeat } from "../../game/heat.ts";
import { getDissipationCapacity } from "../../game/ship.ts";
import { ringVelocity } from "../../game/geometry.ts";
import type { ShipLoadout } from "../../models/game.ts";
import {
  ALPHA,
  BETA,
  crateCargo,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  expectRefusedUnless,
  fire,
  getShip,
  getSub,
  makeTwoPlayerGame,
  mustExecute,
  repair,
  rotate,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const RADIATOR_LOADOUT: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["radiator", "laser", "shields", "laser"],
};
const TWO_RADIATORS: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["radiator", "radiator", "shields", "laser"],
};

/** A rack at side-0: a round shields can absorb, unlike a laser. */
const RACK_SHIP: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "shields", "shields"],
};

describe("heat: what the turn lit is what the check sees", () => {
  it("a tile nobody lit generates no heat", () => {
    const state = makeTwoPlayerGame();
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "coasted")[0].heat).toBe(0);
    expect(eventsOf(result.events, "heat_check")[0].damage).toBe(0);
    expect(getShip(result.gameState, "p1")).toMatchObject({ hitPoints: 10, reactionMass: 10 });
  });

  it("heat from several actions accumulates, is shed down to the dissipation and carries the rest", () => {
    // laser 2 + rotation 1 + a hard burn's engines 3 = 6 heat against a
    // dissipation of 5: one point rides into the next turn, and nothing is
    // damage until the track tops out. The port laser fires outward while the
    // ship is still prograde, then it turns and dives three rings.
    const state = makeTwoPlayerGame({ ring: 4, sector: 0 }, { ring: 5, sector: 0 });
    const result = executeTurnAs(
      state,
      fire(1, "side-0", "p2"),
      rotate(2, "retrograde"),
      burn(3, "hard")
    );
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "heat_check")).toEqual([
      expect.objectContaining({ playerId: "p1", heat: 6, dissipation: 5, damage: 0, carried: 1 }),
    ]);
    expect(getShip(result.gameState, "p1").hitPoints).toBe(10);
    expect(getShip(result.gameState, "p1").heat.currentHeat).toBe(1);
  });
});

describe("heat: end-of-turn resolution", () => {
  // Heat is a track: only the part above MAX_HEAT is hull, and whatever is left
  // after shedding the dissipation (5 here) rides into the next turn.
  it.each([
    [0, 10, 0, false],
    [5, 10, 0, false],
    [6, 10, 1, false],
    [10, 10, 5, false],
    [12, 8, 5, true],
  ])(
    "heat %i at the check leaves the hull at %i and carries %i",
    (heat, hull, carried, damaged) => {
      const state = withShip(makeTwoPlayerGame(), "p1", { heat: { currentHeat: heat } });
      const result = executeTurnAs(state, coast(1));
      expect(getShip(result.gameState, "p1").hitPoints).toBe(hull);
      expect(getShip(result.gameState, "p1").heat.currentHeat).toBe(carried);
      expect(eventsOf(result.events, "heat_check")[0].damage > 0).toBe(damaged);
    }
  );

  it.each([
    ["an empty track", 0],
    ["a carried track", 3],
  ])(
    "absorbing on another player's turn makes no heat, and only the active player's check runs (%s)",
    (_label, carried) => {
      let state = makeTwoPlayerGame(
        { ring: 3, sector: 0, loadout: RACK_SHIP },
        { ring: 4, sector: 0 }
      );
      state = withShip(state, "p2", { heat: { currentHeat: carried } });
      state = withPower(state, "p1", "side-0", 2);
      state = withPower(state, "p2", "side-2", 2);
      const afterP1 = mustExecute(state, fire(1, "side-0", "p2"));
      // Two cubes buy one point of the rack's two damage and come off the tile;
      // nothing goes on p2's track, and p2's carried heat waits for its check.
      expect(getShip(afterP1, "p2").heat.currentHeat).toBe(carried);
      expect(getSub(afterP1, "p2", "side-2").allocatedEnergy).toBe(0);
      expect(getShip(afterP1, "p2").hitPoints).toBe(9);
      const afterP2 = mustExecute(afterP1, coast(1));
      // A coast with nothing powered: the carried heat dissipates and the hull
      // keeps the one point the round put through the wall.
      expect(getShip(afterP2, "p2").heat.currentHeat).toBe(
        Math.max(0, carried - DEFAULT_DISSIPATION_CAPACITY)
      );
      expect(getShip(afterP2, "p2").hitPoints).toBe(9);
    }
  );

  it("heat death destroys the ship with cause heat and no killer, dropping cargo", () => {
    let state = withShip(makeTwoPlayerGame(), "p1", { heat: { currentHeat: 12 }, hitPoints: 2 });
    state = withPlayer(state, "p1", {
      cargo: [crateCargo(ALPHA, BETA)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(getShip(result.gameState, "p1").hitPoints).toBe(0);
    expect(eventsOf(result.events, "ship_destroyed")).toEqual([
      expect.objectContaining({ victimId: "p1", cause: "heat" }),
    ]);
    expect(eventsOf(result.events, "ship_destroyed")[0]).not.toHaveProperty("killerId");
    expect(eventsOf(result.events, "cargo_dropped")).toHaveLength(1);
    expect(result.gameState.players[0].cargo[0].isPickedUp).toBe(false);
  });

  it("heat damage never takes the hull below zero", () => {
    const state = withShip(makeTwoPlayerGame(), "p1", { heat: { currentHeat: 30 }, hitPoints: 3 });
    const result = executeTurnAs(state, coast(1));
    expect(getShip(result.gameState, "p1").hitPoints).toBe(0);
  });
});

describe("heat: a cold ship repairs one tile", () => {
  /** Engines broken in the black hole: no burn, no jump, and every station is in a planet well. */
  const stranded = () => withSub(makeTwoPlayerGame(), "p1", "engines", { isBroken: true });

  it("repairs the named tile when nothing made heat, and only that tile", () => {
    const state = withSub(stranded(), "p1", "side-0", { isBroken: true });
    const result = executeTurnAs(state, coast(1), repair("engines"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "subsystem_repaired")).toEqual([
      expect.objectContaining({ playerId: "p1", subsystemId: "engines", subsystemType: "engines" }),
    ]);
    expect(getSub(result.gameState, "p1", "engines").isBroken).toBe(false);
    expect(getSub(result.gameState, "p1", "side-0").isBroken).toBe(true);
  });

  it("does nothing if the turn made any heat at all", () => {
    const state = withPower(stranded(), "p1", "scoop", 3);
    const result = executeTurnAs(state, coast(1, true), repair("engines"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "subsystem_repaired")).toEqual([]);
    expect(getSub(result.gameState, "p1", "engines").isBroken).toBe(true);
  });

  it("does nothing while heat is carried in from an earlier turn", () => {
    const state = withShip(stranded(), "p1", { heat: { currentHeat: 2 } });
    expectRefusedUnless(
      executeTurnAs(state, coast(1), repair("engines")),
      executeTurnAs(stranded(), coast(1), repair("engines"))
    );
  });

  it("refuses a tile that is not broken, and more than one repair a turn", () => {
    expectRefusedUnless(
      executeTurnAs(stranded(), coast(1), repair("scoop")),
      executeTurnAs(stranded(), coast(1), repair("engines"))
    );
    const twoBroken = withSub(stranded(), "p1", "side-0", { isBroken: true });
    expectRefusedUnless(
      executeTurnAs(twoBroken, coast(1), repair("engines"), repair("side-0")),
      executeTurnAs(twoBroken, coast(1), repair("engines"))
    );
  });

  it("gets a stranded ship moving again: broken engines, one cold turn, then a burn", () => {
    // p1 runs cold, p2 takes its turn, and p1 can burn again.
    const cold = mustExecute(stranded(), coast(1), repair("engines"));
    expect(getSub(cold, "p1", "engines").isBroken).toBe(false);
    const backToP1 = withPower(mustExecute(cold, coast(1)), "p1", "engines", 1);
    const after = executeTurnAs(backToP1, burn(1, "soft"));
    expect(after.errors).toBeUndefined();
    expect(eventsOf(after.events, "burned")).toHaveLength(1);
  });

  it("refuels a dry ship whose scoop was shot out: one cold turn, then a coast that scoops", () => {
    const dryWithScoop = withShip(makeTwoPlayerGame(), "p1", { reactionMass: 0 });
    const dry = withSub(dryWithScoop, "p1", "scoop", { isBroken: true });
    expectRefusedUnless(
      executeTurnAs(dry, coast(1, true)),
      executeTurnAs(dryWithScoop, coast(1, true))
    );

    // p1 lights nothing, reaches 0 at the check and names the scoop.
    const cold = executeTurnAs(dry, coast(1), repair("scoop"));
    expect(cold.errors).toBeUndefined();
    expect(eventsOf(cold.events, "heat_check")[0].heat).toBe(0);
    expect(getSub(cold.gameState, "p1", "scoop").isBroken).toBe(false);

    // p2 takes its turn, and p1's next coast skims its ring's velocity in fuel.
    const backToP1 = mustExecute(cold.gameState, coast(1));
    const { wellId, ring } = getShip(backToP1, "p1");
    const after = executeTurnAs(backToP1, coast(1, true));
    expect(after.errors).toBeUndefined();
    expect(getShip(after.gameState, "p1").reactionMass).toBe(ringVelocity(wellId, ring));
  });
});

describe("heat: radiators", () => {
  it.each([
    [
      "no radiator",
      {
        forwardSlots: ["railgun"],
        sideSlots: ["laser", "laser", "shields", "missiles"],
      } as ShipLoadout,
      5,
    ],
    ["one radiator", RADIATOR_LOADOUT, 7],
    ["two radiators", TWO_RADIATORS, 9],
  ])("%s gives dissipation %i", (_label, loadout, expected) => {
    const state = makeTwoPlayerGame({ loadout });
    expect(getDissipationCapacity(getShip(state, "p1").subsystems)).toBe(expected);
  });

  it("a broken radiator does not dissipate", () => {
    const state = withSub(makeTwoPlayerGame({ loadout: RADIATOR_LOADOUT }), "p1", "side-0", {
      isBroken: true,
    });
    expect(getDissipationCapacity(getShip(state, "p1").subsystems)).toBe(
      DEFAULT_DISSIPATION_CAPACITY
    );
    const hot = { ...getShip(state, "p1"), heat: { currentHeat: 12 } };
    expect(resolveEndOfTurnHeat(hot, "p1").damage).toBe(2);
  });

  it("a radiator that prevents heat damage is revealed", () => {
    const state = withShip(makeTwoPlayerGame({ loadout: RADIATOR_LOADOUT }), "p1", {
      heat: { currentHeat: 7 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(getShip(result.gameState, "p1").hitPoints).toBe(10);
    expect(eventsOf(result.events, "subsystem_revealed")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        subsystemId: "side-0",
        subsystemType: "radiator",
        reason: "shed_heat",
      }),
    ]);
    expect(getSub(result.gameState, "p1", "side-0").isRevealed).toBe(true);
  });

  it("a radiator stays face-down while heat is within the base 5", () => {
    const state = withShip(makeTwoPlayerGame({ loadout: RADIATOR_LOADOUT }), "p1", {
      heat: { currentHeat: 5 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).not.toContain("subsystem_revealed");
    expect(getSub(result.gameState, "p1", "side-0").isRevealed).toBe(false);
  });
});
