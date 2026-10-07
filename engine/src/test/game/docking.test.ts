import { describe, it, expect } from "vitest";
import { getStationForPlanet, isMooredAt, stationSectors } from "../../game/stations.ts";
import { salesOnArrival } from "../../game/docking.ts";
import { viewFor } from "../../game/view.ts";
import type { GameState, ShipLoadout } from "../../models/game.ts";
import type { Cargo, Mission } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { LOAD_CRATES, SELL_FUEL, SELL_NOTHING } from "../../models/missions.ts";
import {
  LOADOUTS,
  ALPHA,
  BH,
  BETA,
  GAMMA,
  approachSector,
  burn,
  coast,
  deliverMission,
  dockSale,
  eventsOf,
  eventTypes,
  crateCargo,
  dataCargo,
  takenData,
  dockingShip,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  getPlayer,
  getShip,
  getSub,
  interceptMission,
  makeGameState,
  makePlayer,
  mustExecute,
  piracyMission,
  surveyMission,
  tankerMission,
  withMissions,
  withPlayer,
  withPower,
  withShip,
  withSub,
  berthOf,
  crateOf,
  lootOf,
  makeTwoPlayerGame,
  shortOfStation,
} from "../testUtils.ts";

/** p2 far away on black hole ring 5, out of everything p1 does here. */
const FAR_OFF = { wellId: BH, ring: 5, sector: 12 };

/** p1 on the station's ring, one coast short of it; p2 far away. */
function approaching(planet: string, loadout?: ShipLoadout): GameState {
  return shortOfStation(makeTwoPlayerGame({ loadout }, FAR_OFF), "p1", planet);
}

describe("docking: stations", () => {
  it("stations advance at the end of each round, not each turn", () => {
    const state = makeGameState([makePlayer("p1"), makePlayer("p2")]);
    const afterP1 = executeTurnAs(state, coast(1));
    expect(afterP1.gameState.stations.map((s) => s.sector)).toEqual([0, 0, 0]);
    expect(eventTypes(afterP1.events)).not.toContain("stations_moved");
    const afterP2 = executeTurnAs(afterP1.gameState, coast(1));
    expect(afterP2.gameState.stations.map((s) => s.sector)).toEqual([4, 4, 4]);
    expect(eventTypes(afterP2.events)).toContain("stations_moved");
  });

  it("a station only ever stands on one of six sectors: the station clock", () => {
    expect(stationSectors()).toEqual([0, 4, 8, 12, 16, 20]);
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
        sold: null,
      })
    );
    expect(docked).not.toHaveProperty("privateTo");
  });

  it("does not dock one sector short or on the wrong ring", () => {
    const short = withShip(approaching(ALPHA), "p1", {
      sector: approachSector(approaching(ALPHA), ALPHA) - 1,
    });
    expect(eventTypes(executeTurnAs(short, coast(1)).events)).not.toContain("docked");
    const wrongRing = withShip(approaching(ALPHA), "p1", { ring: STATION_RING + 1, sector: 22 }); // that ring drifts 2 -> sector 0
    expect(eventTypes(executeTurnAs(wrongRing, coast(1)).events)).not.toContain("docked");
  });

  it("a burn that lands on the station docks too", () => {
    const state = withPower(
      withShip(approaching(ALPHA), "p1", {
        ring: STATION_RING + 1,
        sector: 22,
        facing: "retrograde",
      }),
      "p1",
      "engines",
      1
    );
    const result = executeTurnAs(state, burn(1, "soft"));
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: STATION_RING, sector: 0 });
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
    const result = executeTurnAs(approaching(ALPHA, LOADOUTS.twoShields), coast(1));
    expect(eventsOf(result.events, "docked")[0].missilesReloaded).toBe(false);
  });
});

describe("docking: after the heat check", () => {
  it.each([
    // hull, heat: the check burns the hull first, the dock then refills it
    [5, 13],
    [2, 11],
    [10, 15],
  ])("a ship arriving with %i hull and %i heat docks at full hull", (hull, heat) => {
    const state = withShip(approaching(ALPHA), "p1", {
      hitPoints: hull,
      heat: { currentHeat: heat },
    });
    const result = executeTurnAs(state, coast(1));
    const types = eventTypes(result.events);
    expect(types.indexOf("heat_check")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("heat_check")).toBeLessThan(types.indexOf("docked"));
    const burned = heat - 10;
    expect(eventsOf(result.events, "heat_check")[0].damage).toBe(burned);
    // What the dock restores is what the arrival had left after the check.
    expect(eventsOf(result.events, "docked")[0].hullRestored).toBe(10 - (hull - burned));
    expect(getShip(result.gameState, "p1").hitPoints).toBe(10);
  });

  it.each<[string, number, boolean]>([
    ["2 hull, which the check destroys", 2, true],
    ["5 hull, which survives the check", 5, false],
  ])("a ship arriving at 14 heat with %s", (_label, hull, destroyed) => {
    const [deliver, crate] = deliverCard(BETA, ALPHA, true);
    const before = withShip(visit(ALPHA, [[deliver, crate]]), "p1", {
      hitPoints: hull,
      heat: { currentHeat: 14 },
    });
    const berth = berthOf(before, ALPHA);
    const result = arrive(before);
    const types = eventTypes(result.events);
    expect(types.includes("ship_destroyed")).toBe(destroyed);
    expect(types.includes("docked")).toBe(!destroyed);
    expect(eventsOf(result.events, "cargo_delivered")).toHaveLength(destroyed ? 0 : 1);
    expect(eventsOf(result.events, "wreck_left").map((e) => e.at)).toEqual(
      destroyed ? [berth] : []
    );
    expect(getPlayer(result.gameState, "p1").soldAt).toEqual(destroyed ? [] : [ALPHA]);
    expect(getPlayer(result.gameState, "p1").points).toBe(destroyed ? 0 : 2);
  });

  it.each([
    // fuel aboard, pumped: the Tanker reads the tank the check left alone
    [5, true],
    [4, false],
  ])("a hot Tanker arriving with %i fuel (pumped: %s)", (fuel, pumped) => {
    const state = withShip(visit(ALPHA, [TANKER], fuel), "p1", { heat: { currentHeat: 13 } });
    const result = arrive(state);
    expect(eventsOf(result.events, "heat_check")[0].damage).toBe(3);
    expect(eventsOf(result.events, "fuel_pumped")).toHaveLength(pumped ? 1 : 0);
    expect(getShip(result.gameState, "p1").reactionMass).toBe(pumped ? 0 : fuel);
    expect(getPlayer(result.gameState, "p1").points).toBe(pumped ? 1 : 0);
  });
});

describe("docking: cargo", () => {
  it("picks up crates whose origin is this station", () => {
    const state = withPlayer(approaching(ALPHA), "p1", {
      cargo: [crateCargo(ALPHA, BETA, false), crateCargo(GAMMA, BETA, false)],
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
      cargo: [crateCargo(ALPHA, BETA, true), crateCargo(ALPHA, GAMMA, true)],
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
    const state = withPlayer(approaching(BETA), "p1", { cargo: [crateCargo(ALPHA, BETA, false)] });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).not.toContain("cargo_delivered");
    expect(getPlayer(result.gameState, "p1").cargo[0].isPickedUp).toBe(false);
  });

  it("data is delivered at any station", () => {
    const data = dataCargo("data-1", "m");
    const result = executeTurnAs(withPlayer(approaching(GAMMA), "p1", { cargo: [data] }), coast(1));
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([
      expect.objectContaining({ cargoId: "data-1", planetId: GAMMA }),
    ]);
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([]);
  });

  it("nothing happens to cargo when the ship does not dock", () => {
    const state = withPlayer(makeGameState([makePlayer("p1"), makePlayer("p2")]), "p1", {
      cargo: [crateCargo(ALPHA, BETA, true)],
    });
    const next = mustExecute(state, coast(1));
    expect(getPlayer(next, "p1").cargo).toEqual(state.players[0].cargo);
  });
});

/** p1 sitting on `planet`'s station (moored); p2 far away on the black hole. */
function mooredAt(planet: string, loadout?: ShipLoadout): GameState {
  const state = makeTwoPlayerGame({ loadout }, FAR_OFF);
  return withShip(state, "p1", berthOf(state, planet));
}

describe("docking: moored ships ride their station", () => {
  it("a coast holds the berth instead of drifting, and docks nothing a second time", () => {
    // Hurt while moored: the berth does not put it back together.
    const state = withShip(mooredAt(ALPHA), "p1", { hitPoints: 4 });
    expect(isMooredAt(state.stations, getShip(state, "p1"))).toBe(true);
    const result = executeTurnAs(state, coast(1));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({
      wellId: ALPHA,
      ring: STATION_RING,
      sector: 0,
    });
    expect(eventsOf(result.events, "coasted")[0]).toMatchObject({
      moored: true,
      to: { sector: 0 },
    });
    // The berth was already held when the turn began: a dock is a visit, not a state.
    expect(eventTypes(result.events)).not.toContain("docked");
    expect(getShip(result.gameState, "p1").hitPoints).toBe(4);
  });

  it("the station carries every ship moored on it when it advances, and names them", () => {
    const state = makeGameState([
      makePlayer("p1", { wellId: ALPHA, ring: STATION_RING, sector: 0 }),
      makePlayer("p2", { wellId: ALPHA, ring: STATION_RING, sector: 0 }),
    ]);
    const first = executeTurnAs(state, coast(1));
    const second = executeTurnAs(first.gameState, coast(1));
    expect(getStationForPlanet(second.gameState.stations, ALPHA)!.sector).toBe(4);
    expect(eventsOf(second.events, "stations_moved")).toEqual([
      expect.objectContaining({ riders: ["p1", "p2"] }),
    ]);
    for (const id of ["p1", "p2"]) {
      expect(getShip(second.gameState, id)).toMatchObject({ ring: STATION_RING, sector: 4 });
      expect(isMooredAt(second.gameState.stations, getShip(second.gameState, id))).toBe(true);
    }
  });

  it("a burn casts off: the ship drifts with the station's orbit, then changes ring", () => {
    const state = withPower(mooredAt(ALPHA), "p1", "engines", 1);
    const result = executeTurnAs(state, burn(1, "soft"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: STATION_RING + 1, sector: 4 });
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

  it("loads every crate waiting here: the hold has no limit", () => {
    const state = withMissions(approaching(ALPHA), "p1", [
      deliverMission(ALPHA, BETA),
      deliverMission(ALPHA, GAMMA),
    ]);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_picked_up")).toHaveLength(2);
    expect(getPlayer(result.gameState, "p1").cargo.every((c) => c.isPickedUp)).toBe(true);
  });

  it("crates, loot and data ride together, and loading is not a sale", () => {
    const [piracy, loot] = piracyCard();
    const [survey, surveyItem] = surveyCard();
    const deliver = deliverMission(ALPHA, BETA);
    let state = withMissions(approaching(ALPHA), "p1", [deliver, piracy, survey]);
    state = withPlayer(state, "p1", {
      cargo: [...getPlayer(state, "p1").cargo, loot, surveyItem],
      soldAt: [ALPHA],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_picked_up").map((e) => e.kind)).toEqual(["crate"]);
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([]);
    const cargo = getPlayer(result.gameState, "p1").cargo;
    expect(cargo.filter((c) => c.isPickedUp)).toHaveLength(3);
  });

  it("a destroyed ship on a station's sector is off the board and rides nothing", () => {
    const state = withShip(mooredAt(ALPHA), "p1", { hitPoints: 0 });
    // p2 acts last, so the round ends with p1 still wrecked on the station.
    const result = executeTurnAs({ ...state, activePlayerIndex: 1 }, coast(1));
    expect(eventsOf(result.events, "stations_moved")[0].riders).toEqual([]);
    expect(getShip(result.gameState, "p1").sector).toBe(0);
    expect(getStationForPlanet(result.gameState.stations, ALPHA)!.sector).toBe(4);
  });
});

// --- One sale per station ---------------------------------------------------

/** A Deliver card from `pickup` to `delivery`, its crate aboard or waiting. */
function deliverCard(pickup: string, delivery: string, aboard: boolean): [Mission, Cargo] {
  const mission = deliverMission(pickup, delivery);
  return [mission, crateOf(mission, aboard)];
}

/** A Survey dived, its data aboard for any station. */
function surveyCard(): [Mission, Cargo] {
  const mission = surveyMission();
  return [mission, takenData(mission)];
}

/** An Intercept scanned, its data aboard for `station`. */
function interceptCard(station: string): [Mission, Cargo] {
  const mission = interceptMission("p2", "intercept-p2", station);
  return [mission, takenData(mission)];
}

/** A Piracy card with its loot aboard, which sells anywhere. */
function piracyCard(): [Mission, Cargo] {
  const mission = piracyMission();
  return [mission, lootOf(mission)];
}

const TANKER: [Mission, null] = [tankerMission(), null];

/** p1 one coast short of `planet`'s station with these cards, their items and `fuel` aboard. */
function visit(planet: string, cards: Array<[Mission, Cargo | null]>, fuel = 10): GameState {
  const state = withPlayer(approaching(planet), "p1", {
    missions: cards.map(([m]) => m),
    cargo: cards.flatMap(([, c]) => (c ? [c] : [])),
  });
  return withShip(state, "p1", { reactionMass: fuel });
}

/** Arrive with a coast, naming `sale` for the visit if given. */
function arrive(state: GameState, sale?: string) {
  return executeTurnAs(state, coast(1), ...(sale ? [dockSale(sale)] : []));
}

/** p1 one coast short of `planet`'s station with the hand, hold, tank and sales `from` left it. */
function revisit(planet: string, from: GameState): GameState {
  const p1 = getPlayer(from, "p1");
  const state = withPlayer(approaching(planet), "p1", {
    missions: p1.missions,
    cargo: p1.cargo,
    soldAt: p1.soldAt,
    points: p1.points,
  });
  return withShip(state, "p1", { reactionMass: p1.ship.reactionMass });
}

const aboard = (state: GameState, id: string) =>
  getPlayer(state, "p1").cargo.find((c) => c.id === id)?.isPickedUp ?? null;

describe("docking: one sale per station", () => {
  // At Alpha with a Deliver crate bound here (2), Survey data (1) and a
  // Tanker's load in the tank (1): three sales on offer.
  const [deliver, deliverCrate] = deliverCard(BETA, ALPHA, true);
  const [survey, surveyItem] = surveyCard();
  const everything = () => visit(ALPHA, [[deliver, deliverCrate], [survey, surveyItem], TANKER]);

  it.each<[string, string, string[], number, boolean, boolean]>([
    // named, sold kind, handed in, points, crate still aboard, data still aboard
    ["the crate", "crate", [deliverCrate.id], 2, false, true],
    ["the data", "data", [surveyItem.id], 1, true, false],
    ["the fuel", "fuel", [], 1, true, true],
  ])(
    "named %s, the station buys that and nothing else",
    (_label, kind, handedIn, points, crateAboard, dataAboard) => {
      const sale = kind === "crate" ? deliverCrate.id : kind === "data" ? surveyItem.id : SELL_FUEL;
      const result = arrive(everything(), sale);
      expect(result.errors).toBeUndefined();
      expect(eventsOf(result.events, "docked")[0].sold).toBe(kind);
      expect(eventsOf(result.events, "cargo_delivered").map((e) => e.cargoId)).toEqual(handedIn);
      expect(eventsOf(result.events, "fuel_pumped")).toHaveLength(kind === "fuel" ? 1 : 0);
      expect(getShip(result.gameState, "p1").reactionMass).toBe(kind === "fuel" ? 5 : 10);
      expect(aboard(result.gameState, deliverCrate.id)).toBe(crateAboard ? true : null);
      expect(aboard(result.gameState, surveyItem.id)).toBe(dataAboard ? true : null);
      expect(getPlayer(result.gameState, "p1").points).toBe(points);
      expect(getPlayer(result.gameState, "p1").soldAt).toEqual([ALPHA]);
    }
  );

  it("the station sold at is public", () => {
    const result = arrive(everything());
    expect(viewFor(result.gameState, "p2").players.find((p) => p.id === "p1")!.soldAt).toEqual([
      ALPHA,
    ]);
  });

  it.each([[deliverCrate.id], [SELL_FUEL], [SELL_NOTHING]])(
    "naming %s, the visit still repairs, restores the hull and reloads",
    (sale) => {
      let state = withShip(everything(), "p1", { hitPoints: 4 });
      state = withSub(state, "p1", "engines", { isBroken: true });
      state = withSub(state, "p1", "side-3", { ammo: 1 });
      const result = arrive(state, sale);
      expect(eventsOf(result.events, "docked")[0]).toMatchObject({
        hullRestored: 6,
        repaired: ["engines"],
        missilesReloaded: true,
      });
    }
  );

  it("sold at once, a station buys nothing more from that player on the next visit", () => {
    const first = arrive(visit(ALPHA, [[deliver, deliverCrate], TANKER]), SELL_FUEL);
    expect(eventsOf(first.events, "fuel_pumped")).toHaveLength(1);
    const again = arrive(revisit(ALPHA, first.gameState), deliverCrate.id);
    expect(again.errors).toBeUndefined();
    expect(eventsOf(again.events, "cargo_delivered")).toEqual([]);
    expect(eventsOf(again.events, "docked")[0].sold).toBeNull();
    expect(aboard(again.gameState, deliverCrate.id)).toBe(true);
    expect(getPlayer(again.gameState, "p1").points).toBe(1);
  });

  it.each<[string, Array<[Mission, Cargo | null]>]>([
    ["a crate", [[deliver, deliverCrate]]],
    ["data", [[survey, surveyItem]]],
    ["fuel", [TANKER]],
  ])("a station sold at buys no %s", (_label, cards) => {
    const state = withPlayer(visit(ALPHA, cards), "p1", { soldAt: [ALPHA] });
    const offer = salesOnArrival(dockingShip(state, "p1"), ALPHA);
    expect(offer).toMatchObject({ options: [], default: null, soldHere: true });
    const result = arrive(state);
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([]);
    expect(eventsOf(result.events, "fuel_pumped")).toEqual([]);
    expect(getPlayer(result.gameState, "p1").points).toBe(0);
    expect(getPlayer(result.gameState, "p1").soldAt).toEqual([ALPHA]);
  });

  it("another station still buys", () => {
    const state = withPlayer(visit(BETA, [[survey, surveyItem]]), "p1", { soldAt: [ALPHA] });
    const result = arrive(state);
    expect(eventsOf(result.events, "cargo_delivered").map((e) => e.cargoId)).toEqual([
      surveyItem.id,
    ]);
    expect(getPlayer(result.gameState, "p1").soldAt).toEqual([ALPHA, BETA]);
  });

  it.each<[string, string | undefined, string]>([
    ["the one scoring most by default", undefined, "intercept"],
    ["the one named", surveyItem.id, "survey"],
  ])("two data aboard, one is filed and its card completes: %s", (_label, named, filed) => {
    // The Intercept's card names this station.
    const [intercept, interceptItem] = interceptCard(ALPHA);
    const state = visit(ALPHA, [
      [survey, surveyItem],
      [intercept, interceptItem],
    ]);
    const result = arrive(state, named);
    const [sold, kept, card] =
      filed === "survey"
        ? [surveyItem, interceptItem, survey]
        : [interceptItem, surveyItem, intercept];
    expect(eventsOf(result.events, "cargo_delivered").map((e) => e.cargoId)).toEqual([sold.id]);
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      card.id,
    ]);
    expect(aboard(result.gameState, kept.id)).toBe(true);
  });

  it("files only data that can be filed here: an Intercept for another station is not on offer", () => {
    const [intercept, interceptItem] = interceptCard(GAMMA);
    const state = visit(ALPHA, [
      [survey, surveyItem],
      [intercept, interceptItem],
    ]);
    expect(salesOnArrival(dockingShip(state, "p1"), ALPHA).options.map((o) => o.sale)).toEqual([
      surveyItem.id,
    ]);
    const result = arrive(state, interceptItem.id);
    expect(eventsOf(result.events, "cargo_delivered").map((e) => e.cargoId)).toEqual([
      surveyItem.id,
    ]);
    expect(aboard(result.gameState, interceptItem.id)).toBe(true);
  });

  it.each<[string, string | undefined, string[], boolean]>([
    // named, sold, the next crate loaded
    ["sells the crate bound here by default and loads nothing", undefined, ["inbound"], false],
    ["sells the data, named, and loads nothing", "survey", ["survey"], false],
    ["loads the next crate, named, and sells nothing", LOAD_CRATES, [], true],
    ["does nothing, named", SELL_NOTHING, [], false],
  ])("a chain %s: a visit does one thing", (_label, named, sold, loadsNext) => {
    const [inbound, inboundCrate] = deliverCard(ALPHA, BETA, true);
    const [onward, onwardCrate] = deliverCard(BETA, GAMMA, false);
    const ids: Record<string, string> = { inbound: inboundCrate.id, survey: surveyItem.id };
    const state = visit(BETA, [
      [inbound, inboundCrate],
      [onward, onwardCrate],
      [survey, surveyItem],
    ]);
    const result = arrive(state, named && named in ids ? ids[named] : named);
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "cargo_delivered").map((e) => e.cargoId)).toEqual(
      sold.map((k) => ids[k])
    );
    expect(eventsOf(result.events, "cargo_picked_up").map((e) => e.cargoId)).toEqual(
      loadsNext ? [onwardCrate.id] : []
    );
    expect(aboard(result.gameState, onwardCrate.id)).toBe(loadsNext);
    expect(getPlayer(result.gameState, "p1").soldAt).toEqual(sold.length > 0 ? [BETA] : []);
  });

  it("a visit with nothing to sell loads by default and marks nothing", () => {
    const [onward, onwardCrate] = deliverCard(ALPHA, GAMMA, false);
    const result = arrive(visit(ALPHA, [[onward, onwardCrate]]));
    expect(eventsOf(result.events, "docked")[0].sold).toBeNull();
    expect(aboard(result.gameState, onwardCrate.id)).toBe(true);
    expect(getPlayer(result.gameState, "p1").soldAt).toEqual([]);
  });

  it.each<[string, () => GameState, string, string]>([
    [
      "data with none aboard",
      () => visit(ALPHA, [[deliver, deliverCrate], TANKER]),
      "item-none",
      "crate",
    ],
    [
      "fuel one short of the load",
      () => visit(ALPHA, [[deliver, deliverCrate], TANKER], 4),
      SELL_FUEL,
      "crate",
    ],
    [
      "a crate bound elsewhere",
      () => visit(ALPHA, [[survey, surveyItem], [...deliverCard(ALPHA, GAMMA, true)]]),
      deliverCard(ALPHA, GAMMA, true)[1].id,
      "data",
    ],
  ])("naming %s falls back to the default", (_label, build, named, sold) => {
    const result = arrive(build(), named);
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "docked")[0].sold).toBe(sold);
  });

  it("a berth held since last turn sells nothing, named or not", () => {
    let state = withPlayer(mooredAt(ALPHA), "p1", {
      missions: [deliver, tankerMission()],
      cargo: [deliverCrate],
    });
    state = withShip(state, "p1", { reactionMass: 10 });
    const result = arrive(state, deliverCrate.id);
    expect(eventTypes(result.events)).not.toContain("docked");
    expect(eventTypes(result.events)).not.toContain("cargo_delivered");
    expect(aboard(result.gameState, deliverCrate.id)).toBe(true);
  });

  it.each<[string, Array<ReturnType<typeof dockSale>>]>([
    ["an empty sale", [dockSale("")]],
    ["two sales named", [dockSale(deliverCrate.id), dockSale(SELL_FUEL)]],
  ])("refuses %s", (_label, named) => {
    const state = everything();
    const result = executeTurnAs(state, coast(1), ...named);
    expectRefused(result, state);
    expectRefusedUnless(result, executeTurnAs(state, coast(1), dockSale(deliverCrate.id)));
  });
});

describe("docking: the default sale", () => {
  const [deliverIn, crateIn] = deliverCard(BETA, ALPHA, true);
  const [deliverOut, crateOut] = deliverCard(ALPHA, BETA, false);
  const [survey, surveyItem] = surveyCard();
  const [intercept, interceptItem] = interceptCard(ALPHA);
  const [piracy, loot] = piracyCard();

  it.each<[string, Array<[Mission, Cargo | null]>, number, string | null, Array<[string, number]>]>(
    [
      [
        "a Deliver crate outranks the Tanker's fuel",
        [[deliverIn, crateIn], TANKER],
        10,
        "crate",
        [
          [crateIn.id, 2],
          [SELL_FUEL, 1],
        ],
      ],
      [
        "Survey data ties the fuel and goes first",
        [[survey, surveyItem], TANKER],
        10,
        "data",
        [
          [surveyItem.id, 1],
          [SELL_FUEL, 1],
        ],
      ],
      [
        "Piracy loot ties Survey data and goes first",
        [
          [piracy, loot],
          [survey, surveyItem],
        ],
        10,
        "loot",
        [
          [loot.id, 1],
          [surveyItem.id, 1],
        ],
      ],
      [
        "the fuel outranks loading a crate, which scores nothing",
        [[deliverOut, crateOut], TANKER],
        10,
        "fuel",
        [
          [LOAD_CRATES, 0],
          [SELL_FUEL, 1],
        ],
      ],
      [
        "Intercept data outranks Piracy loot",
        [
          [piracy, loot],
          [intercept, interceptItem],
        ],
        10,
        "data",
        [
          [loot.id, 1],
          [interceptItem.id, 2],
        ],
      ],
      [
        "a tank short of the load offers no fuel",
        [[survey, surveyItem], TANKER],
        4,
        "data",
        [[surveyItem.id, 1]],
      ],
      [
        "a done Tanker offers no fuel",
        [
          [survey, surveyItem],
          [{ ...tankerMission(), isCompleted: true }, null],
        ],
        10,
        "data",
        [[surveyItem.id, 1]],
      ],
      ["nothing to sell is no sale", [], 10, null, []],
    ]
  )("%s", (_label, cards, fuel, expected, options) => {
    const state = visit(ALPHA, cards, fuel);
    const offer = salesOnArrival(dockingShip(state, "p1"), ALPHA);
    expect(offer.options.map((o) => [o.sale, o.points])).toEqual(options);
    expect(offer.default?.kind ?? null).toBe(expected);
    // And the referee docks by the same answer.
    expect(eventsOf(arrive(state).events, "docked")[0].sold).toBe(expected);
  });

  it("names the card each sale pays, so the table can say what it is", () => {
    const state = visit(ALPHA, [[deliverIn, crateIn], [survey, surveyItem], TANKER]);
    expect(salesOnArrival(dockingShip(state, "p1"), ALPHA).options.map((o) => o.missionId)).toEqual(
      [deliverIn.id, survey.id, TANKER[0].id]
    );
  });

  it("still loads at a station sold at, which buys nothing more", () => {
    const state = visit(ALPHA, [
      [deliverOut, crateOut],
      [survey, surveyItem],
    ]);
    const offer = salesOnArrival({ ...dockingShip(state, "p1"), soldAt: [ALPHA] }, ALPHA);
    expect(offer.options.map((o) => o.sale)).toEqual([LOAD_CRATES]);
    expect(offer.default?.sale).toBe(LOAD_CRATES);
  });
});
