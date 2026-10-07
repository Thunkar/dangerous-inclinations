/**
 * The bots' route planner, one question per block: where a move could have
 * started, the fastest route and its fuel, whether more fuel ever makes a
 * route slower, what the alternatives keep in the tank, where a moving
 * target will be, the alternatives to one, and how a jump is phased.
 */
import { describe, it, expect } from "vitest";
import { PLANET_OUTER_RING, STATION_RING } from "../../models/gravityWells.ts";
import {
  planMovement,
  planMovementAlternatives,
  planAlternativesToTarget,
  planMovementToTarget,
  planStationMeetUp,
  isReachable,
  getPredecessors,
  getReachablePositions,
  staticTarget,
  orbitingTarget,
  planFromShip,
} from "../../ai/movementPlanner/index.ts";
import type {
  MovementPlan,
  OrientedPosition,
  OrbitalPosition,
} from "../../ai/movementPlanner/types.ts";
import type { Facing } from "../../models/game.ts";
import type { PlannerTarget } from "../../ai/movementPlanner/index.ts";
import { createInitialStations } from "../../game/stations.ts";
import { wrapSector } from "../../game/geometry.ts";
import { ALPHA, BETA, BH, GAMMA, LOADOUTS, at, makePlayer } from "../testUtils.ts";

/** A ship's place and facing: prograde unless the row says otherwise. */
const facing = (position: OrbitalPosition, f: Facing = "prograde"): OrientedPosition => ({
  ...position,
  facing: f,
});

/** What a test reads off a plan. */
const summary = (plan: MovementPlan | null) =>
  plan && {
    turns: plan.totalTurns,
    mass: plan.totalMassCost,
    actions: plan.steps.map((s) => s.actionType),
    crossesWells: plan.crossesWells,
  };

/** Alpha's station as a planner target, on `sector` of its ring now and advancing 4 a round. */
const station = (sector: number) => orbitingTarget(at(STATION_RING, sector, ALPHA), 4);

describe("getPredecessors: where a move onto a sector could have started", () => {
  it.each([
    // Ring 3 drifts four a turn: a coast onto S2 started at S22, in either facing.
    {
      label: "a coast from four back, across sector 0, and no burn without fuel",
      target: at(3, 2),
      mass: 0,
      expected: { coast: ["3:22", "3:22"], prograde: [], retrograde: [] },
    },
    // A prograde burn raises the orbit, so it came from inside; a retrograde
    // one from outside.
    {
      label: "a burn outward from an inner ring, inward from an outer one",
      target: at(3, 10),
      mass: 10,
      expected: { coast: ["3:6", "3:6"], prograde: [1, 2], retrograde: [4, 5] },
    },
  ])("$label", ({ target, mass, expected }) => {
    const preds = getPredecessors(facing(target), mass, false);
    const rings = (type: string) =>
      [...new Set(preds.filter((p) => p.actionType === type).map((p) => p.position.ring))].sort();
    expect({
      coast: preds
        .filter((p) => p.actionType === "coast" && p.massCost === 0)
        .map((p) => `${p.position.ring}:${p.position.sector}`),
      prograde: rings("burn_prograde"),
      retrograde: rings("burn_retrograde"),
    }).toEqual(expected);
  });
});

describe("planMovement: the route it picks and what it costs", () => {
  const tank = { maxFuelCapacity: 10, hasFuelScoop: true };
  it.each<
    [string, OrientedPosition, OrbitalPosition, Parameters<typeof planMovement>[2], object | null]
  >([
    [
      "a coast along the ring",
      facing(at(3, 0)),
      at(3, 4),
      { availableMass: 10 },
      { turns: 1, mass: 0, actions: ["coast"] },
    ],
    [
      "a soft burn out a ring",
      facing(at(3, 0)),
      at(4, 4),
      { availableMass: 10 },
      { turns: 1, mass: 1, actions: ["burn_prograde"] },
    ],
    [
      "nothing down two rings with no fuel",
      facing(at(3, 0)),
      at(1, 0),
      { availableMass: 0, maxTurns: 5 },
      null,
    ],
    // Inner rings are faster: ten turns of coasting on ring 4 is the slow way round.
    [
      "a dive through the fast rings to a sector far ahead",
      facing(at(4, 3)),
      at(5, 2),
      { availableMass: 10, maxTurns: 20 },
      { turns: 4 },
    ],
    [
      "the jump from under Alpha's door",
      facing(at(5, 18)),
      at(PLANET_OUTER_RING, 6, ALPHA),
      { availableMass: 10, allowWellTransfers: true },
      { crossesWells: true, actions: ["well_transfer"] },
    ],
    [
      "two free coasts without a scoop",
      facing(at(3, 0)),
      at(3, 8),
      { mode: "economical", availableMass: 6 },
      { turns: 2, mass: 0 },
    ],
    // Four sectors a coast, capped at the four the tank has room for.
    [
      "two scooping coasts, economical",
      facing(at(3, 0)),
      at(3, 8),
      { mode: "economical", availableMass: 6, ...tank },
      { turns: 2, mass: -4 },
    ],
    [
      "two scooping coasts, fastest: equal turns, the cheapest",
      facing(at(3, 0)),
      at(3, 8),
      { availableMass: 6, ...tank },
      { turns: 2, mass: -4 },
    ],
  ])("%s", (_label, from, to, options, expected) => {
    const plan = summary(planMovement(from, to, { mode: "fastest", maxTurns: 10, ...options }));
    if (expected === null) expect(plan).toBeNull();
    else expect(plan).toMatchObject(expected);
  });
});

describe("more fuel never makes a route slower", () => {
  const scoop = { maxFuelCapacity: 10, hasFuelScoop: true, maxTurns: 20 };
  const fastest = (plan: MovementPlan | null | undefined) => plan?.totalTurns ?? Infinity;
  it.each<[string, (availableMass: number) => number]>([
    [
      "in one well",
      (availableMass) =>
        fastest(
          planMovement(facing(at(4, 4)), at(5, 2), { mode: "fastest", availableMass, ...scoop })
        ),
    ],
    [
      "across wells",
      (availableMass) =>
        fastest(
          planMovement(facing(at(4, 6)), at(PLANET_OUTER_RING, 1, BETA), {
            mode: "fastest",
            availableMass,
            allowWellTransfers: true,
            ...scoop,
          })
        ),
    ],
    // The way the UI asks: a reserve of 4 once found a slower route than 5.
    [
      "across wells, through the alternatives",
      (availableMass) =>
        fastest(
          planMovementAlternatives(facing(at(4, 6)), at(PLANET_OUTER_RING, 1, BETA), {
            availableMass,
            allowWellTransfers: true,
            ...scoop,
          })?.alternatives[0]
        ),
    ],
  ])("%s", (_label, turnsWith) => {
    const turns = [10, 9, 8, 7, 6, 5, 4, 3, 2].map(turnsWith);
    // Both sides of the old regression have a route, or the comparison is empty.
    expect(turns[4]).toBeLessThan(Infinity);
    expect(turns[5]).toBeLessThan(Infinity);
    for (let i = 1; i < turns.length; i++) expect(turns[i]).toBeGreaterThanOrEqual(turns[i - 1]);
  });
});

describe("planMovementAlternatives: what every alternative keeps in the tank", () => {
  // The reverse search cannot see the tank at each coast; the plan it returns
  // is replayed forwards, so a coast on a full tank is a plain coast and no
  // coast ever fills the tank past its capacity. A route to another well
  // jumps on every alternative.
  it.each([
    { from: at(3, 0), fuel: 10, to: at(STATION_RING, 12, ALPHA) },
    { from: at(3, 0), fuel: 10, to: at(1, 5) },
    { from: at(3, 0), fuel: 6, to: at(PLANET_OUTER_RING, 9, GAMMA) },
    // The fast rings, not ten turns of coasting to Beta's door.
    { from: at(4, 4), fuel: 10, to: at(PLANET_OUTER_RING, 1, BETA), fastest: 9 },
  ])("from $fuel fuel to $to.wellId R$to.ring S$to.sector", ({ from, fuel, to, fastest }) => {
    const result = planMovementAlternatives(facing(from), to, {
      availableMass: fuel,
      maxFuelCapacity: 10,
      hasFuelScoop: true,
      allowWellTransfers: true,
      maxTurns: 25,
    });
    expect(result).not.toBeNull();
    if (fastest !== undefined) expect(result!.alternatives[0].totalTurns).toBe(fastest);
    for (const plan of result!.alternatives) {
      let tank = fuel;
      for (const step of plan.steps) {
        if (step.actionType === "coast" && tank === 10) expect(step.massCost).toBe(0);
        tank -= step.massCost;
        expect(tank).toBeLessThanOrEqual(10);
        expect(tank).toBeGreaterThanOrEqual(0);
      }
      expect(plan.totalMassCost).toBe(fuel - tank);
      const jumps = plan.steps.some((s) => s.actionType === "well_transfer");
      expect([plan.crossesWells, jumps]).toEqual([to.wellId !== BH, to.wellId !== BH]);
    }
  });
});

describe("what a ship can reach", () => {
  it.each<[string, OrbitalPosition, number, number, boolean]>([
    ["a coast away in five turns", at(3, 4), 5, 10, true],
    ["Alpha's station in two turns with no fuel", at(STATION_RING, 0, ALPHA), 2, 0, false],
  ])("isReachable: %s", (_label, to, turns, mass, reachable) => {
    expect(isReachable(facing(at(3, 0)), to, turns, mass, true)).toBe(reachable);
  });

  it("getReachablePositions counts the turns to each position and finds the burns", () => {
    const reachable = getReachablePositions(facing(at(3, 0)), 2, 10, false);
    expect(
      ["blackhole:3:0", "blackhole:3:4", "blackhole:3:8"].map((k) => reachable.get(k)?.turns)
    ).toEqual([0, 1, 2]);
    expect([...reachable.values()].some((p) => p.position.ring === 4 && p.turns === 1)).toBe(true);
  });
});

describe("planner targets: where a target is on each turn, and what meets it", () => {
  it.each<[string, PlannerTarget, number, number]>([
    // The first action's match check fires before the round ends, so the
    // station has not moved yet at turn 1.
    ["an orbit at turn 1: the round ends after it", station(4), 1, 4],
    ["an orbit after one advance", station(0), 2, 4],
    ["an orbit after two advances", station(0), 3, 8],
    ["an orbit across the ring boundary", station(20), 2, 0],
    ["a static target five turns on", staticTarget(at(3, 5)), 5, 5],
  ])("%s", (_label, target, turn, sector) => {
    const where = target.positionAt(turn);
    expect(where.sector).toBe(sector);
    expect(target.isMatch!(where, turn)).toBe(true);
    expect(target.isMatch!({ ...where, sector: wrapSector(sector + 1) }, turn)).toBe(false);
  });
});

describe("planMovementToTarget: the forward search", () => {
  const ALPHA_STATION = createInitialStations().find((s) => s.planetId === ALPHA)!;
  const alphaStation = orbitingTarget(at(ALPHA_STATION.ring, ALPHA_STATION.sector, ALPHA), 4);
  const tank = { availableMass: 10, maxFuelCapacity: 10, hasFuelScoop: true, maxTurns: 20 };

  it("reaches a static target in as many turns as the reverse search", () => {
    const from = facing(at(STATION_RING, 8, ALPHA));
    const to = at(STATION_RING, 12, ALPHA);
    // Alpha's ring 2 drifts four a turn: one coast.
    expect(planMovementToTarget(from, staticTarget(to), { availableMass: 16 })?.totalTurns).toBe(1);
    expect(planMovement(from, to, { availableMass: 16 })?.totalTurns).toBe(1);
  });

  // From the black hole to Alpha's station: the jump alone costs more than
  // two fuel, so only a route that dips and scoops back up arrives with eight.
  it("crosses to another well's station and arrives with the fuel asked for", () => {
    const plan = planMovementToTarget(facing(at(3, 0)), alphaStation, { ...tank, arrivalMass: 8 });
    expect(plan?.crossesWells).toBe(true);
    expect(10 - plan!.totalMassCost).toBeGreaterThanOrEqual(8);
  });

  it("meets an orbit on a turn after the first, never at the origin", () => {
    // The ship starts on the station's sector but has not acted yet.
    const plan = planMovementToTarget(facing(at(STATION_RING, 4, ALPHA)), station(4), {
      availableMass: 16,
    });
    expect(plan?.totalTurns).toBe(2);
  });

  it.each<[string, () => unknown]>([
    // Arrival fuel is not a floor: eight the route may never dip under is not
    // there at all in a tank of two.
    [
      "a tank too small to arrive with the fuel",
      () =>
        planMovementToTarget(facing(at(3, 0)), alphaStation, {
          ...tank,
          availableMass: 2,
          maxFuelCapacity: 2,
        }),
    ],
    [
      "more arrival fuel than the tank holds",
      () => planMovementToTarget(facing(at(3, 0)), alphaStation, { ...tank, arrivalMass: 11 }),
    ],
    [
      "a trailing station in one turn",
      () =>
        planMovementToTarget(facing(at(STATION_RING, 8, ALPHA), "retrograde"), station(16), {
          availableMass: 16,
          maxTurns: 1,
        }),
    ],
    // A climb to the lane ring, a jump, a crossing of ring 5 and a descent.
    [
      "another planet's station in three turns",
      () =>
        planStationMeetUp(
          makePlayer("p1", facing(at(STATION_RING, 0, ALPHA)), LOADOUTS.sensorStarboardLaser).ship,
          { planetId: BETA, ring: STATION_RING, sector: 0 },
          3
        ),
    ],
  ])("finds nothing for %s", (_label, plan) => {
    expect(plan()).toBeNull();
  });

  // On the station's own ring the ship drifts as fast as the station, so a
  // coast trails it for ever: the meet needs a detour through another ring.
  it("planStationMeetUp catches a station trailed by eight sectors", () => {
    const ship = makePlayer(
      "p1",
      facing(at(STATION_RING, 8, ALPHA), "retrograde"),
      LOADOUTS.sensorStarboardLaser
    ).ship;
    const meet = planStationMeetUp(ship, { planetId: ALPHA, ring: STATION_RING, sector: 16 });
    // Two turns: the station has advanced once, S16 to S20, when the ship arrives.
    expect(meet?.totalTurns).toBe(2);
    expect(meet?.meetPosition).toEqual(at(STATION_RING, 20, ALPHA));
    expect(meet?.plan.steps.at(-1)?.to).toMatchObject(at(STATION_RING, 20, ALPHA));
  });
});

describe("planAlternativesToTarget: fastest, balanced and economical to a moving target", () => {
  // From black hole ring 3, sector 0, on a full tank of ten with a scoop.
  const from = facing(at(3, 0));
  const tank = {
    availableMass: 10,
    maxFuelCapacity: 10,
    hasFuelScoop: true,
    allowWellTransfers: true,
    maxTurns: 20,
  };
  const stationOf = (wellId: string, sector: number) =>
    orbitingTarget(at(STATION_RING, sector, wellId), 4);
  /** [turns, fuel] of each alternative, in the order offered. */
  const offered = (target: PlannerTarget, arrivalMass = 0) =>
    planAlternativesToTarget(from, target, { ...tank, arrivalMass })?.alternatives.map((p) => [
      p.totalTurns,
      p.totalMassCost,
    ]);

  // The economical search runs every layer and keeps the cheapest arrival: it
  // is never dearer than the fastest and never quicker.
  it.each([
    {
      to: "Alpha's station on S0",
      target: stationOf(ALPHA, 0),
      keep: 0,
      fastest: [7, 8],
      economical: [9, 1],
    },
    {
      to: "Beta's station on S16",
      target: stationOf(BETA, 16),
      keep: 0,
      fastest: [5, 10],
      economical: [9, 1],
    },
    {
      to: "black hole R4 S10 with 3 aboard",
      target: staticTarget(at(4, 10)),
      keep: 3,
      fastest: [2, 7],
      economical: [3, 0],
    },
  ])("economical against fastest: $to", ({ target, keep, fastest, economical }) => {
    const plan = (mode: "fastest" | "economical") =>
      planMovementToTarget(from, target, { ...tank, arrivalMass: keep, mode });
    const quick = plan("fastest")!;
    const cheap = plan("economical")!;
    expect([quick.totalTurns, quick.totalMassCost]).toEqual(fastest);
    expect([cheap.totalTurns, cheap.totalMassCost]).toEqual(economical);
    expect(cheap.totalMassCost).toBeLessThanOrEqual(quick.totalMassCost);
    expect(cheap.totalTurns).toBeGreaterThanOrEqual(quick.totalTurns);
  });

  it.each([
    // Burn in, coast and burn: the balanced route waits one turn more and
    // spends a quarter of the fuel.
    {
      to: "Alpha's station on S0",
      target: stationOf(ALPHA, 0),
      routes: [
        [7, 8],
        [8, 2],
        [9, 1],
      ],
    },
    {
      to: "Gamma's station on S0",
      target: stationOf(GAMMA, 0),
      routes: [
        [6, 8],
        [7, 1],
      ],
    },
    {
      to: "Beta's station on S0",
      target: stationOf(BETA, 0),
      routes: [
        [3, 10],
        [3, 8],
        [8, 1],
      ],
    },
  ])("the routes offered to $to", ({ target, routes }) => {
    expect(offered(target)).toEqual(routes);
  });

  // Every alternative arrives with the fuel asked for, and the tank never
  // runs dry or overflows on the way.
  it.each([
    {
      to: "Alpha's station on S8",
      target: stationOf(ALPHA, 8),
      keep: 3,
      routes: [
        [7, 7],
        [8, 4],
        [10, 1],
      ],
    },
    {
      to: "Beta's station on S16",
      target: stationOf(BETA, 16),
      keep: 5,
      routes: [
        [6, 4],
        [7, 2],
        [9, 1],
      ],
    },
    {
      to: "Alpha's station on S0",
      target: stationOf(ALPHA, 0),
      keep: 5,
      routes: [
        [8, 4],
        [9, 1],
      ],
    },
  ])("arriving at $to with $keep aboard", ({ target, keep, routes }) => {
    const result = planAlternativesToTarget(from, target, { ...tank, arrivalMass: keep })!;
    expect(result.alternatives.map((p) => [p.totalTurns, p.totalMassCost])).toEqual(routes);
    for (const plan of result.alternatives) {
      let fuel = tank.availableMass;
      for (const step of plan.steps) {
        fuel -= step.massCost;
        expect(fuel).toBeGreaterThanOrEqual(0);
        expect(fuel).toBeLessThanOrEqual(tank.maxFuelCapacity);
      }
      expect(fuel).toBeGreaterThanOrEqual(keep);
    }
  });

  it("offers one route when the fastest is also the cheapest", () => {
    // No fuel and no scoop: one coast is all there is.
    const result = planAlternativesToTarget(from, staticTarget(at(3, 4)), {
      availableMass: 0,
      hasFuelScoop: false,
    });
    expect(result?.alternatives.map((p) => [p.totalTurns, p.totalMassCost])).toEqual([[1, 0]]);
  });
});

describe("a phased jump", () => {
  // BH R5 S16-19 is Alpha's departure arc and Alpha R4 S4-7 its arrival arc:
  // a jump lands on the matching sector, phased a sector at a fuel apiece.
  it.each<[string, number, number, number, { sectorAdjustment: number; massCost: number } | null]>([
    ["from S17 one back to S4", 17, 4, 10, { sectorAdjustment: -1, massCost: 4 }],
    ["from S17 straight to S5", 17, 5, 10, { sectorAdjustment: 0, massCost: 3 }],
    ["from S17 two on to S7", 17, 7, 10, { sectorAdjustment: 2, massCost: 5 }],
    [
      "from S16 three on to S7 with the fuel for it",
      16,
      7,
      6,
      { sectorAdjustment: 3, massCost: 6 },
    ],
    ["from S16 to S7 a fuel short", 16, 7, 5, null],
    ["off the arrival arc", 16, 8, 10, null],
  ])("%s", (_label, from, to, availableMass, step) => {
    const plan = planMovement(facing(at(5, from)), at(PLANET_OUTER_RING, to, ALPHA), {
      availableMass,
      maxTurns: 1,
    });
    if (step === null) expect(plan).toBeNull();
    else
      expect(plan?.steps).toEqual([
        expect.objectContaining({ actionType: "well_transfer", ...step }),
      ]);
  });
});

describe("planFromShip: the forward search behind the reverse one", () => {
  it("plans a route that scoops first, where the reverse search sees only a dry tank", () => {
    const ship = { ...makePlayer("p1", facing(at(3, 0))).ship, reactionMass: 0 };
    // Coast (scooping four fuel), then a soft burn out lands on ring 4, S8.
    const destination = at(4, 8);
    // The reverse search caps every burn by the fuel aboard now, so it cannot
    // see the refuelling coast at all.
    expect(
      planMovement(facing(at(3, 0)), destination, {
        mode: "fastest",
        maxTurns: 20,
        availableMass: 0,
        hasFuelScoop: true,
        maxFuelCapacity: 10,
      })
    ).toBeNull();
    expect(summary(planFromShip(ship, destination, "fastest", 20))).toMatchObject({
      actions: ["coast", "burn_prograde"],
    });
  });

  it.each([
    ["with the fuel, the reverse plan", 10, at(4, 4), ["burn_prograde"]],
    ["to nowhere, nothing rather than a loop", 0, at(1, 0, "no-such-well"), null],
  ] as const)("returns %s", (_label, reactionMass, destination, actions) => {
    const ship = { ...makePlayer("p1", facing(at(3, 0))).ship, reactionMass };
    const plan = planFromShip(ship, destination, "fastest", 20);
    expect(plan && plan.steps.map((s) => s.actionType)).toEqual(actions);
  });
});
