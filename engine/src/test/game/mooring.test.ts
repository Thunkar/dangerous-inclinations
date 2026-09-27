/**
 * A moored ship can neither fire nor be fired at, missiles included (RULES
 * §Stations).
 */
import { describe, it, expect } from "vitest";
import type { GameState, Position, ShipLoadout } from "../../models/game.ts";
import { getMissileStats } from "../../models/subsystems.ts";
import { processOwnerMissiles } from "../../game/missiles.ts";
import { getStationForPlanet, isSafeAtBerth } from "../../game/stations.ts";
import { viewFor } from "../../game/view.ts";
import { executeTurn } from "../../game/turns.ts";
import { botDecideActions } from "../../ai/index.ts";
import { seatOptions } from "../../agent/options.ts";
import {
  ALPHA,
  burn,
  eventsOf,
  eventTypes,
  executeTurnAs,
  fire,
  getShip,
  makeMissile,
  makeTwoPlayerGame,
  scan,
  withPower,
  withSub,
} from "../testUtils.ts";

/** A rack to show point defence never rolls at a missile that does not attack. */
const RACK: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "laser", "shields", "laser"],
};

/** A sensor in the bow, to scan with. */
const SENSOR_BOW: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};

/** Alpha's station at the start of a game: ring 2, sector 0. */
function berthOf(state: GameState): Position {
  const station = getStationForPlanet(state.stations, ALPHA)!;
  return { wellId: ALPHA, ring: station.ring, sector: station.sector };
}

/** p1 two sectors behind p2 on Alpha's station ring, railgun powered: p2 dead ahead. */
function railgunLine(p1Sector: number, p2Sector: number): GameState {
  return withPower(
    makeTwoPlayerGame(
      { wellId: ALPHA, ring: 2, sector: p1Sector, facing: "prograde" },
      { wellId: ALPHA, ring: 2, sector: p2Sector }
    ),
    "p1",
    "forward-0",
    4
  );
}

// Clear of the berth at S0, the target moored on it, and the shooter moored on it.
const CLEAR = [6, 8] as const;
const AT_TARGET = [22, 0] as const;
const FROM_BERTH = [0, 2] as const;
type Line = readonly [number, number];

describe("moored ships are safe", () => {
  it("the fixtures put the berth where the tests say", () => {
    const state = railgunLine(...CLEAR);
    expect(berthOf(state)).toEqual({ wellId: ALPHA, ring: 2, sector: 0 });
    expect(isSafeAtBerth(state.stations, berthOf(state))).toBe(true);
    expect(isSafeAtBerth(state.stations, { ...berthOf(state), sector: 6 })).toBe(false);
  });

  it.each<[string, boolean, Line]>([
    ["clear of any station", true, CLEAR],
    ["at a moored target", false, AT_TARGET],
    ["from a mooring", false, FROM_BERTH],
  ])("a railgun shot %s: accepted = %s", (_label, accepted, [p1, p2]) => {
    const state = railgunLine(p1, p2);
    const shot = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(shot.errors === undefined).toBe(accepted);
    expect(getShip(shot.gameState, "p2").hitPoints < 10).toBe(accepted);
  });

  it.each<[string, boolean, Line]>([
    ["clear of any station", true, CLEAR],
    ["at a moored target", false, AT_TARGET],
    ["from a mooring", false, FROM_BERTH],
  ])("a missile launch %s: accepted = %s", (_l, accepted, [a, b]) => {
    const state = railgunLine(a, b);
    const launch = fire(1, "side-3", "p2", "engines", undefined, 1);
    expect(executeTurnAs(state, launch).errors === undefined).toBe(accepted);
  });

  it("a ship that burns off its berth fires after the move", () => {
    // Moored at S0; a soft burn takes it out to ring 3, off the berth.
    const state = railgunLine(...FROM_BERTH);
    const result = executeTurnAs(
      state,
      burn(1, "soft"),
      fire(2, "side-3", "p2", "engines", undefined, 1)
    );
    expect(result.errors).toBeUndefined();
    expect(state.missiles).toEqual([]);
    expect(eventTypes(result.events)).toContain("missile_launched");
  });

  it("a scan still reaches a moored ship: the rule is about weapons", () => {
    const state = makeTwoPlayerGame(
      { wellId: ALPHA, ring: 2, sector: 22, loadout: SENSOR_BOW },
      { wellId: ALPHA, ring: 2, sector: 0 }
    );
    const result = executeTurnAs(state, scan(1, "p2"));
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events)).toContain("scanned");
  });
});

describe("a missile that reaches a moored ship", () => {
  /** p2 moored at Alpha's berth with its rack powered, a missile already on its sector. */
  function missileOnBerth(movesMade = 0): GameState {
    const base = makeTwoPlayerGame(
      { wellId: ALPHA, ring: 3, sector: 12 },
      { wellId: ALPHA, ring: 2, sector: 0, loadout: RACK }
    );
    const state = withPower(base, "p2", "side-0", 2);
    return {
      ...state,
      missiles: [makeMissile({ wellId: ALPHA, ring: 2, sector: 0, movesMade })],
    };
  }

  it("does not attack and is not shot down: it stays in flight with a move behind it", () => {
    const result = processOwnerMissiles(missileOnBerth(), "p1");
    const types = eventTypes(result.events as never);
    expect(types).not.toContain("attack_resolved");
    expect(types).not.toContain("missile_intercepted");
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
    expect(result.state.missiles).toEqual([expect.objectContaining({ id: "m-1", movesMade: 1 })]);
    expect(eventsOf(result.events as never, "missile_moved")).toHaveLength(1);
  });

  it("still burns out on schedule", () => {
    const result = processOwnerMissiles(missileOnBerth(getMissileStats().maxMoves - 1), "p1");
    expect(eventTypes(result.events as never)).toContain("missile_expired");
    expect(result.state.missiles).toEqual([]);
    expect(getShip(result.state, "p2").hitPoints).toBe(10);
  });
});

describe("bots and seats never offer a shot at or from a berth", () => {
  /** Engines broken: the bot can only coast, so it shoots from where it sits. */
  const grounded = (state: GameState) => withSub(state, "p1", "engines", { isBroken: true });

  it.each<[string, Line]>([
    ["at a moored target", AT_TARGET],
    ["from a mooring", FROM_BERTH],
  ])("the bot fires nothing %s, and its turn is legal", (_label, [a, b]) => {
    const state = grounded(railgunLine(a, b));
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.filter((x) => x.type === "fire_weapon")).toEqual([]);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("the bot takes the same shot once nobody is at a berth", () => {
    const state = grounded(railgunLine(...CLEAR));
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.some((x) => x.type === "fire_weapon")).toBe(true);
  });

  it.each<[string, boolean, Line]>([
    ["at a moored target", false, AT_TARGET],
    ["from a mooring", false, FROM_BERTH],
    ["clear of any station", true, CLEAR],
  ])("the seat lists p2 as a railgun target %s: %s", (_label, listed, [a, b]) => {
    const options = seatOptions(viewFor(railgunLine(a, b), "p1"));
    const railgun = options.weapons.find((w) => w.weapon === "forward-0")!;
    expect(railgun.targetsNow.includes("p2")).toBe(listed);
  });
});
