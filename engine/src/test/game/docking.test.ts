import { describe, it, expect } from "vitest";
import {
  createInitialStations,
  getStationAt,
  getStationForPlanet,
  isMooredAt,
  stationPosition,
  updateStationPositions,
} from "../../game/stations.ts";
import type { GameState, ShipLoadout } from "../../models/game.ts";
import type { Cargo } from "../../models/missions.ts";
import { CARGO_HOLD_CRATES } from "../../models/missions.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  approachSector,
  burn,
  coast,
  deliverMission,
  eventsOf,
  eventTypes,
  executeTurnAs,
  getPlayer,
  getShip,
  getSub,
  makeGameState,
  makePlayer,
  mustExecute,
  withMissions,
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
    [5, 10, 5],
    [9, 10, 1],
    [10, 10, 0],
  ])("restores the hull to full: %i -> %i", (before, after, restored) => {
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
    expect(getShip(result.gameState, "p1").hitPoints).toBe(7); // to full, then -3 heat
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

/** p1 sitting on `planet`'s station (moored); p2 far away on the black hole. */
function mooredAt(planet: string, loadout?: ShipLoadout): GameState {
  const stations = createInitialStations();
  const sector = getStationForPlanet(stations, planet)!.sector;
  return makeGameState([
    makePlayer("p1", { wellId: planet, ring: 1, sector }, loadout),
    makePlayer("p2", { wellId: "blackhole", ring: 5, sector: 12 }),
  ]);
}

/** Play every seat's turn once, so the round ends and the stations advance. */
function playRound(state: GameState): GameState {
  let next = state;
  for (let i = 0; i < state.players.length; i++) next = mustExecute(next, coast(1));
  return next;
}

describe("docking: moored ships ride their station", () => {
  it("a coast holds the berth instead of drifting, and docks nothing a second time", () => {
    const state = mooredAt(ALPHA);
    expect(isMooredAt(state.stations, getShip(state, "p1"))).toBe(true);
    const result = executeTurnAs(state, coast(1));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ wellId: ALPHA, ring: 1, sector: 0 });
    expect(eventsOf(result.events, "coasted")[0]).toMatchObject({
      moored: true,
      to: { sector: 0 },
    });
    // The berth was already held when the turn began: a dock is a visit, not a state.
    expect(eventTypes(result.events)).not.toContain("docked");
  });

  it("the station carries its moored ships when it advances at the end of the round", () => {
    const after = playRound(mooredAt(ALPHA));
    expect(getStationForPlanet(after.stations, ALPHA)!.sector).toBe(4);
    expect(getShip(after, "p1")).toMatchObject({ ring: 1, sector: 4 });
    expect(isMooredAt(after.stations, getShip(after, "p1"))).toBe(true);
  });

  it("names the ships that rode along", () => {
    const state = mooredAt(ALPHA);
    const first = executeTurnAs(state, coast(1));
    const second = executeTurnAs(first.gameState, coast(1));
    expect(eventsOf(second.events, "stations_moved")).toEqual([
      expect.objectContaining({ riders: ["p1"] }),
    ]);
    // Nobody is moored the round after p1 has cast off.
    const away = withShip(second.gameState, "p1", { ring: 2, sector: 9 });
    const third = executeTurnAs(away, coast(1));
    const fourth = executeTurnAs(third.gameState, coast(1));
    expect(eventsOf(fourth.events, "stations_moved")[0].riders).toEqual([]);
  });

  it("moves a moored ship 4 sectors a round, exactly as drifting on ring 1 does", () => {
    // p1 moored on the station, p2 free on the same ring: both advance 4.
    const state = makeGameState([
      makePlayer("p1", { wellId: ALPHA, ring: 1, sector: 0 }),
      makePlayer("p2", { wellId: ALPHA, ring: 1, sector: 2 }),
    ]);
    const after = playRound(state);
    expect(getShip(after, "p1").sector).toBe(4);
    expect(getShip(after, "p2").sector).toBe(6);
  });

  it("two ships on one station sector both ride it", () => {
    const state = makeGameState([
      makePlayer("p1", { wellId: ALPHA, ring: 1, sector: 0 }),
      makePlayer("p2", { wellId: ALPHA, ring: 1, sector: 0 }),
    ]);
    const after = playRound(state);
    expect(getShip(after, "p1").sector).toBe(4);
    expect(getShip(after, "p2").sector).toBe(4);
  });

  it("a burn casts off: the ship drifts with the station's orbit, then changes ring", () => {
    const state = withPower(mooredAt(ALPHA), "p1", "engines", 1);
    const result = executeTurnAs(state, burn(1, "soft"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: 2, sector: 4 });
    expect(eventTypes(result.events)).not.toContain("docked");
    // And it stays cast off: the station moves without it.
    const after = executeTurnAs(result.gameState, coast(1));
    expect(eventsOf(after.events, "stations_moved")[0].riders).toEqual([]);
  });

  it("runs the scoop in port: a berth is a place to skim from, not to be repaired in", () => {
    let state = withShip(mooredAt(ALPHA), "p1", { reactionMass: 0 });
    state = withPower(state, "p1", "scoop", 3);
    const result = executeTurnAs(state, coast(1, true));
    expect(result.errors).toBeUndefined();
    // Planet ring 1 drifts 4, so a dry ship is never moored for good.
    expect(getShip(result.gameState, "p1").reactionMass).toBe(4);
  });

  it("docks on arrival, and holding the berth afterwards docks nothing", () => {
    const damaged = withShip(approaching(ALPHA), "p1", { hitPoints: 4 });
    const arrival = executeTurnAs(damaged, coast(1));
    expect(eventsOf(arrival.events, "docked")[0].hullRestored).toBe(6);
    expect(getShip(arrival.gameState, "p1").hitPoints).toBe(10);

    // Hurt again while moored: the berth does not put it back together.
    const hurt = withShip(arrival.gameState, "p1", { hitPoints: 4 });
    const holding = executeTurnAs(mustExecute(hurt, coast(1)), coast(1));
    expect(eventTypes(holding.events)).not.toContain("docked");
    expect(getShip(holding.gameState, "p1").hitPoints).toBe(4);
  });

  it("loads one crate and leaves the second on the dock: the hold takes one", () => {
    const state = withMissions(approaching(ALPHA), "p1", [
      deliverMission(ALPHA, BETA),
      deliverMission(ALPHA, GAMMA),
    ]);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_picked_up")).toHaveLength(CARGO_HOLD_CRATES);
    const aboard = getPlayer(result.gameState, "p1").cargo.filter((c) => c.isPickedUp);
    expect(aboard).toHaveLength(CARGO_HOLD_CRATES);
    // The other crate is still waiting at its station, not lost.
    expect(getPlayer(result.gameState, "p1").cargo).toHaveLength(2);
  });

  it("delivers before it loads, so a chained route is still one visit", () => {
    // Arriving at BETA carrying BETA's crate and with BETA's next crate waiting:
    // the hold empties and fills in the same dock.
    const state = withMissions(approaching(BETA), "p1", [
      deliverMission(ALPHA, BETA),
      deliverMission(BETA, GAMMA),
    ]);
    const loaded = withPlayer(state, "p1", {
      cargo: state.players[0].cargo.map((c) =>
        c.pickupPlanetId === ALPHA ? { ...c, isPickedUp: true } : c
      ),
    });
    const result = executeTurnAs(loaded, coast(1));
    expect(eventTypes(result.events)).toContain("cargo_delivered");
    const [pickedUp] = eventsOf(result.events, "cargo_picked_up");
    const outbound = getPlayer(result.gameState, "p1").cargo.find((c) => c.id === pickedUp.cargoId);
    expect(outbound).toMatchObject({ pickupPlanetId: BETA, deliveryPlanetId: GAMMA });
    expect(eventsOf(result.events, "cargo_picked_up")).toHaveLength(1);
  });

  it("carries a data chit alongside a full hold: numbers are not freight", () => {
    const state = withMissions(approaching(ALPHA), "p1", [deliverMission(ALPHA, BETA)]);
    const withData = withPlayer(state, "p1", {
      cargo: [
        ...state.players[0].cargo,
        {
          id: "data-1",
          missionId: "survey-1",
          kind: "data",
          deliveryPlanetId: "any",
          isPickedUp: true,
        },
      ],
    });
    const result = executeTurnAs(withData, coast(1));
    // The chit is filed here and the crate still loads.
    expect(eventsOf(result.events, "cargo_delivered").map((e) => e.kind)).toEqual(["data"]);
    expect(eventsOf(result.events, "cargo_picked_up").map((e) => e.kind)).toEqual(["crate"]);
  });

  it("loads one crate and leaves the second on the dock", () => {
    // Two routes out of the same station: the hold takes one crate, so the
    // second is two trips away, not a second chit in the same hold.
    const state = withMissions(approaching(ALPHA), "p1", [
      deliverMission(ALPHA, BETA),
      deliverMission(ALPHA, GAMMA),
    ]);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_picked_up")).toHaveLength(1);
    const cargo = getPlayer(result.gameState, "p1").cargo;
    expect(cargo.filter((c) => c.isPickedUp)).toHaveLength(1);
    expect(cargo.filter((c) => !c.isPickedUp)).toHaveLength(1);
  });

  it("a chained route is one trip: the crate dropped here frees the hold for the next", () => {
    // Alpha→Beta with the crate aboard, arriving at Beta, where Beta→Gamma's
    // crate is waiting. Unload, then load.
    const outbound = deliverMission(ALPHA, BETA);
    const onward = deliverMission(BETA, GAMMA);
    let state = withMissions(approaching(BETA), "p1", [outbound, onward]);
    state = withPlayer(state, "p1", {
      cargo: getPlayer(state, "p1").cargo.map((c) =>
        c.missionId === outbound.id ? { ...c, isPickedUp: true } : c
      ),
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_delivered").map((e) => e.cargoId)).toEqual([
      outbound.cargoId,
    ]);
    expect(eventsOf(result.events, "cargo_picked_up").map((e) => e.cargoId)).toEqual([
      onward.cargoId,
    ]);
  });

  it("data rides free: a chit aboard never keeps a crate off the ship", () => {
    const mission = deliverMission(ALPHA, BETA);
    let state = withMissions(approaching(ALPHA), "p1", [mission]);
    state = withPlayer(state, "p1", {
      cargo: [
        ...getPlayer(state, "p1").cargo,
        {
          id: "data-1",
          missionId: "survey-1",
          kind: "data",
          deliveryPlanetId: "any",
          isPickedUp: true,
        },
      ],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_picked_up").map((e) => e.cargoId)).toEqual([
      mission.cargoId,
    ]);
  });

  it("a crate is loaded on arrival, not by sitting in the berth", () => {
    const state = withMissions(approaching(ALPHA), "p1", [deliverMission(ALPHA, BETA)]);
    const arrival = executeTurnAs(state, coast(1));
    expect(eventTypes(arrival.events)).toContain("cargo_picked_up");
    const holding = executeTurnAs(mustExecute(arrival.gameState, coast(1)), coast(1));
    expect(eventTypes(holding.events)).not.toContain("cargo_picked_up");
  });

  it("a destroyed ship on a station's sector is off the board and rides nothing", () => {
    const state = withShip(mooredAt(ALPHA), "p1", { hitPoints: 0 });
    // p2 acts last, so the round ends with p1 still wrecked on the station.
    const result = executeTurnAs({ ...state, activePlayerIndex: 1 }, coast(1));
    expect(eventsOf(result.events, "stations_moved")[0].riders).toEqual([]);
    expect(getShip(result.gameState, "p1").sector).toBe(0);
    expect(getStationForPlanet(result.gameState.stations, ALPHA)!.sector).toBe(4);
  });

  it("a ship destroyed at a station respawns at Home and drifts normally again", () => {
    const state = withShip(mooredAt(ALPHA), "p1", { hitPoints: 0 });
    const respawned = executeTurnAs(state, coast(1));
    expect(getShip(respawned.gameState, "p1")).toMatchObject({ wellId: "blackhole", ring: 4 });
    expect(isMooredAt(respawned.gameState.stations, getShip(respawned.gameState, "p1"))).toBe(
      false
    );
  });
});
