import { describe, it, expect } from "vitest";
import { MAX_HEAT, SHIELD_HEAT_PER_POINT } from "../../models/game.ts";
import { DEFAULT_DISSIPATION_CAPACITY } from "../../models/game.ts";
import { calculateHeatDamage, resolveEndOfTurnHeat } from "../../game/heat.ts";
import { getDissipationCapacity } from "../../game/ship.ts";
import type { ShipLoadout } from "../../models/game.ts";
import {
  BH,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  fire,
  getShip,
  getSub,
  jump,
  makeTwoPlayerGame,
  mustExecute,
  repair,
  rotate,
  scan,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const SENSOR_LOADOUT: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};
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

describe("heat: a tile's cubes are its heat, and an action puts them there", () => {
  it.each([
    ["engines (burn)", "engines", 1, burn(1, "soft"), "burned"],
    ["scoop (coast)", "scoop", 3, coast(1, true), "coasted"],
    ["laser (fire)", "side-0", 2, fire(1, "side-0", "p2"), "weapon_fired"],
    ["railgun (fire)", "forward-0", 4, fire(1, "forward-0", "p2"), "weapon_fired"],
  ] as const)(
    "%s costs exactly the cubes the action puts on it",
    (_label, subsystemId, energy, action, eventType) => {
      // p2 sits one sector ahead of p1 (R3 S0): the railgun needs it on the same ring, the port laser one ring out.
      const targetRing = subsystemId === "forward-0" ? 3 : 4;
      let state = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: targetRing, sector: 1 });
      const result = executeTurnAs(state, action);
      expect(result.errors).toBeUndefined();
      const [event] = eventsOf(result.events, eventType);
      expect(event).toBeDefined();
      expect((event as { heat: number }).heat).toBe(energy);
    }
  );

  it("scanning heats the sensor array", () => {
    let state = makeTwoPlayerGame({ loadout: SENSOR_LOADOUT }, { ring: 3, sector: 2 });
    const result = executeTurnAs(state, scan(1, "p2", "side-0"));
    expect(eventsOf(result.events, "scanned")[0].heat).toBe(2);
  });

  it("jumping heats the engines", () => {
    // BH R5 S17 is on Alpha's outbound lane.
    let state = makeTwoPlayerGame({ ring: 5, sector: 17 });
    const result = executeTurnAs(state, jump(1, "planet-alpha"));
    expect(eventsOf(result.events, "jumped")[0].heat).toBe(3);
  });

  it("a tile nobody lit generates no heat", () => {
    let state = makeTwoPlayerGame();
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "coasted")[0].heat).toBe(0);
    expect(eventsOf(result.events, "heat_damage")).toEqual([]);
    expect(getShip(result.gameState, "p1").hitPoints).toBe(10);
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
    expect(eventsOf(result.events, "heat_damage")).toEqual([]);
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
    [9, 10, 4, false],
    [10, 10, 5, false],
    [12, 8, 5, true],
  ])(
    "heat %i at the check leaves the hull at %i and carries %i",
    (heat, hull, carried, damaged) => {
      const state = withShip(makeTwoPlayerGame(), "p1", { heat: { currentHeat: heat } });
      const result = executeTurnAs(state, coast(1));
      expect(getShip(result.gameState, "p1").hitPoints).toBe(hull);
      expect(getShip(result.gameState, "p1").heat.currentHeat).toBe(carried);
      expect(eventsOf(result.events, "heat_damage").length > 0).toBe(damaged);
    }
  );

  it("only the active player's heat is resolved; a target keeps shield heat until its own turn ends", () => {
    let state = makeTwoPlayerGame(
      { ring: 3, sector: 0, loadout: RACK_SHIP },
      { ring: 4, sector: 0 }
    );
    state = withPower(state, "p1", "side-0", 2);
    state = withPower(state, "p2", "side-2", 2);
    const afterP1 = mustExecute(state, fire(1, "side-0", "p2"));
    // Two cubes buy one point of the rack's two damage, at two heat.
    expect(getShip(afterP1, "p2").heat.currentHeat).toBe(SHIELD_HEAT_PER_POINT);
    const afterP2 = mustExecute(afterP1, coast(1));
    // Two heat from the absorption, and the tile spent its cubes absorbing so
    // it adds no standing heat: two against a dissipation of 5 carries nothing.
    // The hull is 9 because a 2-damage round through a 1-point wall still lands
    // a point; the heat check took none of it.
    expect(getShip(afterP2, "p2").heat.currentHeat).toBe(0);
    expect(getShip(afterP2, "p2").hitPoints).toBe(9);
  });

  it("heat death destroys the ship with cause heat and no killer, dropping cargo", () => {
    let state = withShip(makeTwoPlayerGame(), "p1", { heat: { currentHeat: 12 }, hitPoints: 2 });
    state = withPlayer(state, "p1", {
      cargo: [
        {
          id: "c",
          missionId: "m",
          kind: "crate",
          pickupPlanetId: "planet-alpha",
          deliveryPlanetId: "planet-beta",
          isPickedUp: true,
        },
      ],
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

  it("does nothing while a shield is powered, because a raised screen is heat", () => {
    const state = withPower(stranded(), "p1", "side-2", 2);
    const result = executeTurnAs(state, coast(1), repair("engines"));
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(2);
    expect(eventsOf(result.events, "subsystem_repaired")).toEqual([]);
  });

  it("does nothing while heat is carried in from an earlier turn", () => {
    const state = withShip(stranded(), "p1", { heat: { currentHeat: 2 } });
    const result = executeTurnAs(state, coast(1), repair("engines"));
    expect(result.errors).toBeDefined();
  });

  it("refuses a tile that is not broken, and more than one repair a turn", () => {
    expect(executeTurnAs(stranded(), coast(1), repair("scoop")).errors).toBeDefined();
    expect(
      executeTurnAs(
        withSub(stranded(), "p1", "side-0", { isBroken: true }),
        coast(1),
        repair("engines"),
        repair("side-0")
      ).errors
    ).toBeDefined();
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
    expect(calculateHeatDamage({ ...getShip(state, "p1"), heat: { currentHeat: 12 } })).toBe(2);
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
        reason: "prevented_heat_damage",
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

  it("resolveEndOfTurnHeat pays for the overflow, caps the track and sheds the rest", () => {
    const ship = { ...getShip(makeTwoPlayerGame(), "p1"), heat: { currentHeat: 13 } };
    const result = resolveEndOfTurnHeat(ship, "p1");
    expect(result.damage).toBe(13 - MAX_HEAT);
    expect(result.ship.hitPoints).toBe(7);
    // Capped at the top of the track, then the dissipation comes off it.
    expect(result.ship.heat.currentHeat).toBe(MAX_HEAT - 5);
    expect(result.events).toEqual([
      {
        type: "heat_check",
        playerId: "p1",
        heat: 13,
        cubes: 0,
        dissipation: 5,
        damage: 3,
        carried: 5,
      },
      { type: "heat_damage", playerId: "p1", heat: 13, dissipation: 5, damage: 3 },
    ]);
  });

  it("wells do not matter: a ship on a planet ring dissipates the same", () => {
    const state = withShip(makeTwoPlayerGame({ wellId: "planet-beta", ring: 2, sector: 0 }), "p1", {
      heat: { currentHeat: 11 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(getShip(result.gameState, "p1").hitPoints).toBe(9);
    expect(getShip(result.gameState, "p1").heat.currentHeat).toBe(MAX_HEAT - 5);
    expect(getShip(result.gameState, "p1").wellId).not.toBe(BH);
  });
});
