import { describe, it, expect } from "vitest";
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

/** A rack at side-0: the one-damage round shields can still absorb (lasers cannot). */
const RACK_SHIP: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "shields", "shields"],
};

describe("heat: subsystems heat up by their allocated energy when used", () => {
  it.each([
    ["engines (burn)", "engines", 3, burn(1, "soft"), "burned"],
    ["scoop (coast)", "scoop", 3, coast(1, true), "coasted"],
    ["laser (fire)", "side-0", 2, fire(1, "side-0", "p2"), "weapon_fired"],
    ["railgun (fire)", "forward-0", 4, fire(1, "forward-0", "p2"), "weapon_fired"],
  ] as const)(
    "%s adds heat equal to its energy",
    (_label, subsystemId, energy, action, eventType) => {
      // p2 sits one sector ahead of p1 (R3 S0): the railgun needs it on the same ring, the port laser one ring out.
      const targetRing = subsystemId === "forward-0" ? 3 : 4;
      let state = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: targetRing, sector: 1 });
      state = withPower(state, "p1", subsystemId, energy);
      const result = executeTurnAs(state, action);
      expect(result.errors).toBeUndefined();
      const [event] = eventsOf(result.events, eventType);
      expect(event).toBeDefined();
      expect((event as { heat: number }).heat).toBe(energy);
    }
  );

  it("scanning heats the sensor array", () => {
    let state = makeTwoPlayerGame({ loadout: SENSOR_LOADOUT }, { ring: 3, sector: 2 });
    state = withPower(state, "p1", "forward-0", 2);
    const result = executeTurnAs(state, scan(1, "p2", "side-0"));
    expect(eventsOf(result.events, "scanned")[0].heat).toBe(2);
  });

  it("jumping heats the engines", () => {
    // BH R5 S17 is on Alpha's outbound lane.
    let state = makeTwoPlayerGame({ ring: 5, sector: 17 });
    state = withPower(state, "p1", "engines", 3);
    const result = executeTurnAs(state, jump(1, "planet-alpha"));
    expect(eventsOf(result.events, "jumped")[0].heat).toBe(3);
  });

  it("powered but unused subsystems generate no heat", () => {
    let state = makeTwoPlayerGame();
    state = withPower(state, "p1", "forward-0", 4);
    state = withPower(state, "p1", "engines", 3);
    state = withPower(state, "p1", "scoop", 3);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "coasted")[0].heat).toBe(0);
    expect(eventsOf(result.events, "heat_damage")).toEqual([]);
    expect(getShip(result.gameState, "p1").hitPoints).toBe(10);
  });

  it("heat from several actions accumulates and excess over dissipation damages the hull", () => {
    // laser 2 + rotation 1 + engines 3 = 6 heat against dissipation 5.
    let state = makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 4, sector: 0 });
    state = withPower(state, "p1", "side-0", 2);
    state = withPower(state, "p1", "rotation", 1);
    state = withPower(state, "p1", "engines", 3);
    const result = executeTurnAs(
      state,
      fire(1, "side-0", "p2"),
      rotate(2, "retrograde"),
      burn(3, "soft")
    );
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "heat_damage")).toEqual([
      expect.objectContaining({ playerId: "p1", heat: 6, dissipation: 5, damage: 1 }),
    ]);
    expect(getShip(result.gameState, "p1").hitPoints).toBe(9);
    expect(getShip(result.gameState, "p1").heat.currentHeat).toBe(0);
  });
});

describe("heat: end-of-turn resolution", () => {
  it.each([
    [0, 10, false],
    [5, 10, false],
    [6, 9, true],
    [9, 6, true],
  ])("heat %i at end of turn leaves the hull at %i", (heat, hull, damaged) => {
    const state = withShip(makeTwoPlayerGame(), "p1", { heat: { currentHeat: heat } });
    const result = executeTurnAs(state, coast(1));
    expect(getShip(result.gameState, "p1").hitPoints).toBe(hull);
    expect(getShip(result.gameState, "p1").heat.currentHeat).toBe(0);
    expect(eventsOf(result.events, "heat_damage").length > 0).toBe(damaged);
  });

  it("only the active player's heat is resolved; a target keeps shield heat until its own turn ends", () => {
    let state = makeTwoPlayerGame({ ring: 3, sector: 0, loadout: RACK_SHIP }, { ring: 4, sector: 0 });
    state = withPower(state, "p1", "side-0", 2);
    state = withPower(state, "p2", "side-2", 2);
    const afterP1 = mustExecute(state, fire(1, "side-0", "p2"));
    expect(getShip(afterP1, "p2").heat.currentHeat).toBe(1);
    const afterP2 = mustExecute(afterP1, coast(1));
    expect(getShip(afterP2, "p2").heat.currentHeat).toBe(0);
    expect(getShip(afterP2, "p2").hitPoints).toBe(10);
  });

  it("heat death destroys the ship with cause heat and no killer, dropping cargo", () => {
    let state = withShip(makeTwoPlayerGame(), "p1", { heat: { currentHeat: 8 }, hitPoints: 2 });
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
    expect(calculateHeatDamage({ ...getShip(state, "p1"), heat: { currentHeat: 7 } })).toBe(2);
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

  it("resolveEndOfTurnHeat reports damage and resets heat", () => {
    const ship = { ...getShip(makeTwoPlayerGame(), "p1"), heat: { currentHeat: 8 } };
    const result = resolveEndOfTurnHeat(ship, "p1");
    expect(result.damage).toBe(3);
    expect(result.ship.hitPoints).toBe(7);
    expect(result.ship.heat.currentHeat).toBe(0);
    expect(result.events).toEqual([
      { type: "heat_check", playerId: "p1", heat: 8, dissipation: 5, damage: 3 },
      { type: "heat_damage", playerId: "p1", heat: 8, dissipation: 5, damage: 3 },
    ]);
  });

  it("wells do not matter: a ship on a planet ring dissipates the same", () => {
    const state = withShip(makeTwoPlayerGame({ wellId: "planet-beta", ring: 2, sector: 0 }), "p1", {
      heat: { currentHeat: 6 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(getShip(result.gameState, "p1").hitPoints).toBe(9);
    expect(getShip(result.gameState, "p1").wellId).not.toBe(BH);
  });
});
