import { describe, it, expect } from "vitest";
import {
  createInitialStations,
  getStationAt,
  getStationForPlanet,
  stationPosition,
  updateStationPositions,
} from "../../game/stations.ts";
import type { GameState, ShipLoadout } from "../../models/game.ts";
import type { Cargo } from "../../models/missions.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  approachSector,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  getPlayer,
  getShip,
  getSub,
  makeGameState,
  makePlayer,
  mustExecute,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const NO_MISSILES: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "laser", "shields", "shields"],
};

/** p1 on `planet` ring 1, one coast short of the station; p2 far away. */
function approaching(planet: string, loadout?: ShipLoadout): GameState {
  const base = makeGameState([
    makePlayer("p1"),
    makePlayer("p2", { wellId: "blackhole", ring: 5, sector: 12 }),
  ]);
  const sector = approachSector(base, planet);
  return makeGameState([
    makePlayer("p1", { wellId: planet, ring: 1, sector }, loadout),
    base.players[1],
  ]);
}

const crate = (pickup: string, delivery: string, isPickedUp: boolean): Cargo => ({
  id: `crate-${pickup}-${delivery}`,
  missionId: `deliver-${pickup}-${delivery}`,
  kind: "crate",
  pickupPlanetId: pickup,
  deliveryPlanetId: delivery,
  isPickedUp,
});

describe("docking: stations", () => {
  it("every planet has a station on ring 1 at sector 0 to start", () => {
    const stations = createInitialStations();
    expect(stations.map((s) => s.planetId)).toEqual([ALPHA, BETA, GAMMA]);
    expect(stations.every((s) => s.ring === 1 && s.sector === 0)).toBe(true);
  });

  it("stations drift with ring 1 (4 sectors) when they move", () => {
    const moved = updateStationPositions(createInitialStations());
    expect(moved.map((s) => s.sector)).toEqual([4, 4, 4]);
    expect(updateStationPositions(moved)[0].sector).toBe(8);
  });

  it("getStationAt matches only the exact well, ring and sector", () => {
    const stations = createInitialStations();
    expect(getStationAt(stations, { wellId: BETA, ring: 1, sector: 0 })?.planetId).toBe(BETA);
    expect(getStationAt(stations, { wellId: BETA, ring: 2, sector: 0 })).toBeUndefined();
    expect(getStationAt(stations, { wellId: BETA, ring: 1, sector: 1 })).toBeUndefined();
    expect(stationPosition(getStationForPlanet(stations, GAMMA)!)).toEqual({
      wellId: GAMMA,
      ring: 1,
      sector: 0,
    });
  });

  it("stations advance at the end of each round, not each turn", () => {
    const state = makeGameState([makePlayer("p1"), makePlayer("p2")]);
    const afterP1 = executeTurnAs(state, coast(1));
    expect(afterP1.gameState.stations.map((s) => s.sector)).toEqual([0, 0, 0]);
    expect(eventTypes(afterP1.events)).not.toContain("stations_moved");
    const afterP2 = executeTurnAs(afterP1.gameState, coast(1));
    expect(afterP2.gameState.stations.map((s) => s.sector)).toEqual([4, 4, 4]);
    expect(eventTypes(afterP2.events)).toContain("stations_moved");
  });
});

describe("docking: ending the turn on a station", () => {
  it("docks when the ship's final position is the station's sector", () => {
    const result = executeTurnAs(approaching(ALPHA), coast(1));
    expect(result.errors).toBeUndefined();
    const [docked] = eventsOf(result.events, "docked");
    expect(docked).toEqual(
      expect.objectContaining({
        playerId: "p1",
        planetId: ALPHA,
        hullRestored: 0,
        repaired: [],
        missilesReloaded: false,
      })
    );
    expect(docked).not.toHaveProperty("privateTo");
  });

  it("does not dock one sector short or on the wrong ring", () => {
    const short = withShip(approaching(ALPHA), "p1", {
      sector: approachSector(approaching(ALPHA), ALPHA) - 1,
    });
    expect(eventTypes(executeTurnAs(short, coast(1)).events)).not.toContain("docked");
    const wrongRing = withShip(approaching(ALPHA), "p1", { ring: 2, sector: 22 }); // ring 2 drifts 2 -> sector 0
    expect(eventTypes(executeTurnAs(wrongRing, coast(1)).events)).not.toContain("docked");
  });

  it("a burn that lands on the station docks too", () => {
    const state = withPower(
      withShip(approaching(ALPHA), "p1", { ring: 2, sector: 22, facing: "retrograde" }),
      "p1",
      "engines",
      1
    );
    const result = executeTurnAs(state, burn(1, "soft"));
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: 1, sector: 0 });
    expect(eventTypes(result.events)).toContain("docked");
  });

  it.each([
    [5, 8, 3],
    [9, 10, 1],
    [10, 10, 0],
  ])("restores up to 3 hull: %i -> %i", (before, after, restored) => {
    const result = executeTurnAs(
      withShip(approaching(ALPHA), "p1", { hitPoints: before }),
      coast(1)
    );
    expect(getShip(result.gameState, "p1").hitPoints).toBe(after);
    expect(eventsOf(result.events, "docked")[0].hullRestored).toBe(restored);
  });

  it("repairs every broken subsystem (energy has to be reallocated)", () => {
    let state = withSub(approaching(ALPHA), "p1", "engines", { isBroken: true });
    state = withSub(state, "p1", "side-0", { isBroken: true });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "docked")[0].repaired).toEqual(["engines", "side-0"]);
    expect(getSub(result.gameState, "p1", "engines").isBroken).toBe(false);
    expect(getSub(result.gameState, "p1", "side-0")).toMatchObject({
      isBroken: false,
      allocatedEnergy: 0,
      isPowered: false,
    });
  });

  it.each([
    ["partly spent", 1, true, 4],
    ["full", 4, false, 4],
  ])("reloads missiles that are %s", (_label, ammo, reloaded, after) => {
    const result = executeTurnAs(withSub(approaching(ALPHA), "p1", "side-3", { ammo }), coast(1));
    expect(eventsOf(result.events, "docked")[0].missilesReloaded).toBe(reloaded);
    expect(getSub(result.gameState, "p1", "side-3").ammo).toBe(after);
  });

  it("reports no reload when the ship carries no missiles", () => {
    const result = executeTurnAs(approaching(ALPHA, NO_MISSILES), coast(1));
    expect(eventsOf(result.events, "docked")[0].missilesReloaded).toBe(false);
  });

  it("docking happens before the heat check", () => {
    const state = withShip(approaching(ALPHA), "p1", { hitPoints: 5, heat: { currentHeat: 8 } });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events).indexOf("docked")).toBeLessThan(
      eventTypes(result.events).indexOf("heat_damage")
    );
    expect(getShip(result.gameState, "p1").hitPoints).toBe(5); // +3 then -3
  });
});

describe("docking: cargo", () => {
  it("picks up crates whose origin is this station", () => {
    const state = withPlayer(approaching(ALPHA), "p1", {
      cargo: [crate(ALPHA, BETA, false), crate(GAMMA, BETA, false)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_picked_up")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        cargoId: "crate-planet-alpha-planet-beta",
        planetId: ALPHA,
      }),
    ]);
    expect(getPlayer(result.gameState, "p1").cargo.map((c) => c.isPickedUp)).toEqual([true, false]);
  });

  it("delivers picked-up crates whose destination is this station and keeps the rest", () => {
    const state = withPlayer(approaching(BETA), "p1", {
      cargo: [crate(ALPHA, BETA, true), crate(ALPHA, GAMMA, true)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([
      expect.objectContaining({ cargoId: "crate-planet-alpha-planet-beta", planetId: BETA }),
    ]);
    expect(getPlayer(result.gameState, "p1").cargo.map((c) => c.id)).toEqual([
      "crate-planet-alpha-planet-gamma",
    ]);
  });

  it("a crate that was never picked up is not delivered at its destination", () => {
    const state = withPlayer(approaching(BETA), "p1", { cargo: [crate(ALPHA, BETA, false)] });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).not.toContain("cargo_delivered");
    expect(getPlayer(result.gameState, "p1").cargo[0].isPickedUp).toBe(false);
  });

  it("data is delivered at any station", () => {
    const data: Cargo = {
      id: "data-1",
      missionId: "m",
      kind: "data",
      deliveryPlanetId: "any",
      isPickedUp: true,
    };
    const result = executeTurnAs(withPlayer(approaching(GAMMA), "p1", { cargo: [data] }), coast(1));
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([
      expect.objectContaining({ cargoId: "data-1", planetId: GAMMA }),
    ]);
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([]);
  });

  it("nothing happens to cargo when the ship does not dock", () => {
    const state = withPlayer(makeGameState([makePlayer("p1"), makePlayer("p2")]), "p1", {
      cargo: [crate(ALPHA, BETA, true)],
    });
    const next = mustExecute(state, coast(1));
    expect(getPlayer(next, "p1").cargo).toEqual(state.players[0].cargo);
  });
});
