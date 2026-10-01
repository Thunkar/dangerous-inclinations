/**
 * The shuffled secondary pile's rules: two of a kind are two jobs, Salvage
 * (wrecks) and Escort (markers). RULES §Missions.
 */
import { describe, it, expect } from "vitest";
import type { GameState, Wreck } from "../../models/game.ts";
import type { Mission, SurveyMission } from "../../models/missions.ts";
import { MISSION_POINTS, TANKER_FUEL, dataAboard } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { filterEventsFor } from "../../models/events.ts";
import { getStationForPlanet } from "../../game/stations.ts";
import { positionOf, ringVelocity, wrapSector } from "../../game/geometry.ts";
import { escortCandidates, unplacedEscorts } from "../../game/escort.ts";
import { viewFor } from "../../game/view.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  coast,
  deliverMission,
  dockSale,
  escortMark,
  escortMission,
  eventsOf,
  eventTypes,
  dataCargo,
  lootCargo,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  fire,
  getPlayer,
  makeGameState,
  makePlayer,
  piracyMission,
  salvageMission,
  surveyMission,
  takenData,
  tankerMission,
  withMissions,
  withPlayer,
  withPower,
  withShip,
} from "../testUtils.ts";

/** Ring 3 of the black hole drifts 4: a coast from S0 ends on S4. */
const LANDING = { wellId: BH, ring: 3, sector: 4 } as const;

const wreckAt = (id: string, at: { wellId: string; ring: number; sector: number }): Wreck => ({
  id,
  wellId: at.wellId,
  ring: at.ring,
  sector: at.sector,
});

/** p1 at BH R3 S0 (lands on S4 with a coast), p2 and p3 wherever asked. */
function table(
  p2At: { wellId: string; ring: number; sector: number } = { wellId: BH, ring: 3, sector: 12 },
  p3At?: { wellId: string; ring: number; sector: number }
): GameState {
  return makeGameState([
    makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
    makePlayer("p2", p2At),
    ...(p3At ? [makePlayer("p3", p3At)] : []),
  ]);
}

/** Put `playerId` one coast from `planet`'s station, holding `missions` (their crates aboard). */
function arriving(
  state: GameState,
  playerId: string,
  planet: string,
  missions: Mission[]
): GameState {
  let next = withShip(state, playerId, {
    wellId: planet,
    ring: STATION_RING,
    sector: approachSector(state, planet),
  });
  next = withMissions(next, playerId, missions);
  return withPlayer(next, playerId, {
    cargo: getPlayer(next, playerId).cargo.map((c) => ({ ...c, isPickedUp: true })),
  });
}

describe("two of a kind are two jobs", () => {
  it("one dive takes one Survey's data, and the next dive takes the other's", () => {
    const state = withMissions(
      makeGameState([
        makePlayer("p1", { wellId: BH, ring: 1, sector: 0 }),
        makePlayer("p2", { wellId: BH, ring: 3, sector: 12 }),
      ]),
      "p1",
      [surveyMission("survey-a"), surveyMission("survey-b")]
    );
    const first = executeTurnAs(state, coast(1));
    expect(eventsOf(first.events, "data_acquired").map((e) => e.missionId)).toEqual(["survey-a"]);
    const p1 = getPlayer(first.gameState, "p1");
    expect(p1.missions.map((m) => dataAboard(p1, m as SurveyMission))).toEqual([true, false]);

    const second = executeTurnAs({ ...first.gameState, activePlayerIndex: 0 }, coast(1));
    expect(eventsOf(second.events, "data_acquired").map((e) => e.missionId)).toEqual(["survey-b"]);
    expect(getPlayer(second.gameState, "p1").cargo.filter((c) => c.kind === "data")).toHaveLength(
      2
    );
  });

  it("one fuel visit pays one Tanker, even with fuel for two", () => {
    const state = withShip(
      arriving(table(), "p1", ALPHA, [tankerMission("tanker-a"), tankerMission("tanker-b")]),
      "p1",
      { reactionMass: 2 * TANKER_FUEL }
    );
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "fuel_pumped")).toHaveLength(1);
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      "tanker-a",
    ]);
    const p1 = getPlayer(result.gameState, "p1");
    expect(p1.points).toBe(MISSION_POINTS.tanker);
    expect(p1.missions.map((m) => m.isCompleted)).toEqual([true, false]);
  });
});

describe("salvage: wrecks", () => {
  it.each([
    [
      "a weapon",
      () =>
        withPower(
          withShip(table({ wellId: BH, ring: 3, sector: 2 }), "p2", { hitPoints: 4 }),
          "p1",
          "forward-0",
          4
        ),
      () => [fire(1, "forward-0", "p2")],
      "p2",
      { wellId: BH, ring: 3, sector: 2 },
    ],
    [
      "the heat check",
      () => withShip(table(), "p1", { hitPoints: 1, heat: { currentHeat: 30 } }),
      () => [coast(1)],
      "p1",
      LANDING,
    ],
  ])(
    "a ship destroyed by %s leaves a wreck where it died, in the open",
    (_label, build, actions, victim, at) => {
      const result = executeTurnAs(build(), ...actions());
      expect(eventsOf(result.events, "ship_destroyed")).toHaveLength(1);
      expect(result.gameState.wrecks).toEqual([expect.objectContaining(at)]);
      const left = eventsOf(result.events, "wreck_left");
      expect(left).toEqual([
        expect.objectContaining({ victimId: victim, wreckId: result.gameState.wrecks[0].id, at }),
      ]);
      // Public: the whole table sees it, spectators included.
      for (const viewer of ["p1", "p2", null]) {
        expect(eventTypes(filterEventsFor(result.events, viewer))).toContain("wreck_left");
        expect(viewFor(result.gameState, viewer).wrecks).toEqual(result.gameState.wrecks);
      }
    }
  );

  it.each([
    ["the black hole's ring 1", { wellId: BH, ring: 1, sector: 23 }],
    ["a planet's ring 2", { wellId: ALPHA, ring: 2, sector: 5 }],
  ])("a wreck on %s drifts by its ring's speed once a round, with the stations", (_label, at) => {
    const state = { ...table(), wrecks: [wreckAt("w", at)] };
    // p1's turn is not the end of the round: nothing drifts.
    const midRound = executeTurnAs(state, coast(1));
    expect(midRound.gameState.wrecks).toEqual([wreckAt("w", at)]);

    const roundEnd = executeTurnAs(midRound.gameState, coast(1));
    const drifted = wreckAt("w", {
      ...at,
      sector: wrapSector(at.sector + ringVelocity(at.wellId, at.ring)),
    });
    expect(roundEnd.gameState.wrecks).toEqual([drifted]);
    expect(eventsOf(roundEnd.events, "stations_moved")).toEqual([
      expect.objectContaining({ wrecks: [drifted] }),
    ]);
  });

  it("a wreck on a berth rides with its station: still on the berth when the round ends", () => {
    const base = table();
    const station = getStationForPlanet(base.stations, ALPHA)!;
    const berth = { wellId: ALPHA, ring: station.ring, sector: station.sector };
    const state = { ...base, wrecks: [wreckAt("w", berth)] };
    const roundEnd = executeTurnAs(executeTurnAs(state, coast(1)).gameState, coast(1));
    const moved = getStationForPlanet(roundEnd.gameState.stations, ALPHA)!;
    expect(moved.sector).not.toBe(station.sector);
    expect(roundEnd.gameState.wrecks).toEqual([
      wreckAt("w", { wellId: ALPHA, ring: moved.ring, sector: moved.sector }),
    ]);
  });

  it("takes a wreck's black box aboard as the card's data on a turn ended on its sector", () => {
    const card = salvageMission();
    const state = withMissions({ ...table(), wrecks: [wreckAt("w", LANDING)] }, "p1", [card]);
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "wreck_salvaged")).toEqual([
      expect.objectContaining({ playerId: "p1", wreckId: "w", cargoId: card.cargoId }),
    ]);
    expect(result.gameState.wrecks).toEqual([]);
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([dataCargo(card.cargoId, card.id)]);
    // Data on the table: everyone sees a piece of data aboard, and no crate.
    expect(viewFor(result.gameState, "p2").players[0].cargoAboard).toEqual({ crates: 0, data: 1 });
    expect(eventTypes(filterEventsFor(result.events, "p2"))).toContain("wreck_salvaged");
  });

  it("files a black box at any station, which is the whole card", () => {
    const card = salvageMission();
    const state = withPlayer(arriving(table(), "p1", BETA, [card]), "p1", {
      cargo: [dataCargo(card.cargoId, card.id)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([
      expect.objectContaining({ cargoId: card.cargoId, kind: "data" }),
    ]);
    expect(eventsOf(result.events, "docked")).toEqual([expect.objectContaining({ sold: "data" })]);
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      card.id,
    ]);
    expect(getPlayer(result.gameState, "p1").points).toBe(MISSION_POINTS.salvage);
  });

  it.each([
    ["the crate", false],
    ["the black box", true],
  ] as const)(
    "beside a crate bound for the same station, selling %s files the black box = %s",
    (_label, filed) => {
      const card = salvageMission();
      const deliver = deliverMission(GAMMA, ALPHA);
      // `arriving` puts the Deliver's crate aboard; the black box rides beside it.
      const base = arriving(table(), "p1", ALPHA, [deliver, card]);
      const state = withPlayer(base, "p1", {
        cargo: [...getPlayer(base, "p1").cargo, dataCargo(card.cargoId, card.id)],
      });
      const result = executeTurnAs(
        state,
        coast(1),
        dockSale(filed ? card.cargoId : deliver.cargoId)
      );
      const completed = eventsOf(result.events, "mission_completed").map((e) => e.mission.id);
      expect(completed.includes(card.id)).toBe(filed);
      expect(completed.includes(deliver.id)).toBe(!filed);
      expect(
        getPlayer(result.gameState, "p1").cargo.some((c) => c.id === card.cargoId && c.isPickedUp)
      ).toBe(!filed);
    }
  );

  it("the killer may salvage its own kill on the same turn", () => {
    // Point blank: p1 coasts into p2's sector, then its laser finishes p2.
    let state = withShip(table(LANDING), "p2", { hitPoints: 1 });
    state = withMissions(state, "p1", [salvageMission()]);
    const result = executeTurnAs(state, coast(1), fire(2, "side-0", "p2"));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["ship_destroyed", "wreck_left", "wreck_salvaged"])
    );
    expect(result.gameState.wrecks).toEqual([]);
    expect(getPlayer(result.gameState, "p1").cargo).toHaveLength(1);
  });

  it.each([
    [
      "arriving at a station",
      () => {
        const base = arriving(table(), "p1", ALPHA, [salvageMission()]);
        const station = getStationForPlanet(base.stations, ALPHA)!;
        return {
          ...base,
          wrecks: [wreckAt("w", { wellId: ALPHA, ring: station.ring, sector: station.sector })],
        };
      },
    ],
    [
      "already moored at a station",
      () => {
        const base = withMissions(table(), "p1", [salvageMission()]);
        const station = getStationForPlanet(base.stations, ALPHA)!;
        const berth = { wellId: ALPHA, ring: station.ring, sector: station.sector };
        return { ...withShip(base, "p1", berth), wrecks: [wreckAt("w", berth)] };
      },
    ],
    [
      "with a crate already in the hold",
      () => {
        const state = withMissions({ ...table(), wrecks: [wreckAt("w", LANDING)] }, "p1", [
          salvageMission(),
          deliverMission(ALPHA, GAMMA),
        ]);
        return withPlayer(state, "p1", {
          cargo: getPlayer(state, "p1").cargo.map((c) => ({ ...c, isPickedUp: true })),
        });
      },
    ],
  ])("takes the black box %s", (_label, build) => {
    const result = executeTurnAs(build(), coast(1));
    expect(eventsOf(result.events, "wreck_salvaged")).toHaveLength(1);
    expect(result.gameState.wrecks).toEqual([]);
    expect(
      getPlayer(result.gameState, "p1").cargo.filter((c) => c.kind === "data" && c.isPickedUp)
    ).toHaveLength(1);
  });

  it.each([
    [
      "a sector short of the wreck",
      () =>
        withMissions({ ...table(), wrecks: [wreckAt("w", { ...LANDING, sector: 5 })] }, "p1", [
          salvageMission(),
        ]),
    ],
    [
      "holding no Salvage card",
      () => withMissions({ ...table(), wrecks: [wreckAt("w", LANDING)] }, "p1", [piracyMission()]),
    ],
    [
      "with the card's black box already aboard",
      () => {
        const card = salvageMission();
        const state = withMissions({ ...table(), wrecks: [wreckAt("w", LANDING)] }, "p1", [card]);
        return withPlayer(state, "p1", { cargo: [dataCargo(card.cargoId, card.id)] });
      },
    ],
  ])("takes nothing %s", (_label, build) => {
    const state = build();
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).not.toContain("wreck_salvaged");
    expect(result.gameState.wrecks).toHaveLength(1);
  });

  it("a moored ship that dies of its own heat leaves a wreck on the berth, salvaged by the next arrival", () => {
    const base = withMissions(table(), "p2", [salvageMission()]);
    const station = getStationForPlanet(base.stations, ALPHA)!;
    const berth = { wellId: ALPHA, ring: station.ring, sector: station.sector };
    let state = withShip(base, "p1", { ...berth, hitPoints: 1, heat: { currentHeat: 30 } });
    state = withShip(state, "p2", { ...berth, sector: approachSector(state, ALPHA) });

    const death = executeTurnAs(state, coast(1));
    expect(eventsOf(death.events, "wreck_left")).toEqual([
      expect.objectContaining({ victimId: "p1", at: berth }),
    ]);

    const arrival = executeTurnAs(death.gameState, coast(1));
    expect(eventsOf(arrival.events, "docked")).toHaveLength(1);
    expect(eventsOf(arrival.events, "wreck_salvaged")).toEqual([
      expect.objectContaining({ playerId: "p2", at: berth }),
    ]);
    expect(arrival.gameState.wrecks).toEqual([]);
  });

  it("one wreck a turn: two Salvage cards on a sector of two wrecks take one", () => {
    const state = withMissions(
      { ...table(), wrecks: [wreckAt("w1", LANDING), wreckAt("w2", LANDING)] },
      "p1",
      [salvageMission("salvage-a"), salvageMission("salvage-b")]
    );
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "wreck_salvaged")).toEqual([
      expect.objectContaining({ wreckId: "w1", cargoId: salvageMission("salvage-a").cargoId }),
    ]);
    expect(result.gameState.wrecks.map((w) => w.id)).toEqual(["w2"]);
  });
});

describe("escort: markers", () => {
  /** p1 holds `escorts` and lands in p2's sector; p2 carries what `p2Missions` imply. */
  function meeting(escorts: Mission[], p2Missions: Mission[]): GameState {
    let state = withMissions(table(LANDING), "p1", escorts);
    state = withMissions(state, "p2", p2Missions);
    return withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: true })),
    });
  }

  /** p2 and p3 both carry crates in p1's landing sector; p1 holds `escorts`. */
  function twoCarriers(
    escorts: Mission[],
    p3At: { wellId: string; ring: number; sector: number } = LANDING
  ): GameState {
    let state = withMissions(table(LANDING, p3At), "p1", escorts);
    for (const id of ["p2", "p3"]) {
      state = withMissions(state, id, [deliverMission(ALPHA, GAMMA, `deliver-${id}`)]);
      state = withPlayer(state, id, {
        cargo: getPlayer(state, id).cargo.map((c) => ({ ...c, isPickedUp: true })),
      });
    }
    return state;
  }

  const marksOf = (state: GameState) =>
    getPlayer(state, "p1").missions.map((m) => (m.type === "escort" ? m.markedPlayerId : null));

  it("marks an undocked rival carrying a crate when the player names it, face-up for the table", () => {
    const result = executeTurnAs(
      meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]),
      coast(1),
      escortMark("p2")
    );
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "escort_marked")).toEqual([
      expect.objectContaining({ escortId: "p1", carrierId: "p2", missionId: "escort-1" }),
    ]);
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: "p2" });
    for (const viewer of ["p1", "p2", null]) {
      expect(eventTypes(filterEventsFor(result.events, viewer))).toContain("escort_marked");
      const view = viewFor(result.gameState, viewer);
      expect(view.players.find((p) => p.id === "p2")!.escortedBy).toEqual(["p1"]);
      expect(view.players.find((p) => p.id === "p1")!.escortedBy).toEqual([]);
    }
    // The card itself stays in p1's hand: p2 sees the marker, not the hand.
    expect(viewFor(result.gameState, "p2").me!.missions.some((m) => m.type === "escort")).toBe(
      false
    );
    expect(viewFor(result.gameState, "p2").players[0].completedMissions).toEqual([]);
  });

  it('places no marker when the player names nobody: it is a "you may"', () => {
    const result = executeTurnAs(
      meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]),
      coast(1)
    );
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events)).not.toContain("escort_marked");
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: null });
  });

  it("marks a ship carrying data", () => {
    const data = surveyMission("survey-p2");
    let state = withMissions(table(LANDING), "p1", [escortMission()]);
    state = withPlayer(state, "p2", { missions: [data], cargo: [takenData(data)] });
    const result = executeTurnAs(state, coast(1), escortMark("p2"));
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: "p2" });
  });

  it.each([
    ["an empty hold", () => meeting([escortMission()], [])],
    [
      "a crate still waiting on its dock",
      () =>
        withMissions(withMissions(table(LANDING), "p1", [escortMission()]), "p2", [
          deliverMission(ALPHA, GAMMA),
        ]),
    ],
    [
      "a ship a sector away",
      () =>
        withShip(meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]), "p2", { sector: 5 }),
    ],
    [
      "a carrier at a berth",
      () => {
        let state = arriving(table(), "p1", ALPHA, [escortMission()]);
        const station = getStationForPlanet(state.stations, ALPHA)!;
        state = withShip(state, "p2", {
          wellId: ALPHA,
          ring: station.ring,
          sector: station.sector,
        });
        state = withMissions(state, "p2", [deliverMission(ALPHA, GAMMA)]);
        return withPlayer(state, "p2", {
          cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: true })),
        });
      },
    ],
    [
      "an escort destroyed at its own heat check",
      () =>
        withShip(meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]), "p1", {
          hitPoints: 1,
          heat: { currentHeat: 30 },
        }),
    ],
  ])("a marker named for %s places nothing, and the turn stands", (_label, build) => {
    const result = executeTurnAs(build(), coast(1), escortMark("p2"));
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events)).not.toContain("escort_marked");
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: null });
  });

  it("a second Escort marks a different ship", () => {
    const state = twoCarriers([escortMission("escort-a", "p2"), escortMission("escort-b")]);
    const result = executeTurnAs(state, coast(1), escortMark("p3"));
    expect(eventsOf(result.events, "escort_marked")).toEqual([
      expect.objectContaining({ missionId: "escort-b", carrierId: "p3" }),
    ]);
  });

  it("a ship already carrying a rival's Escort marker takes no second one", () => {
    let state = withMissions(table(LANDING, { wellId: BH, ring: 3, sector: 20 }), "p1", [
      escortMission(),
    ]);
    state = withMissions(state, "p2", [deliverMission(ALPHA, GAMMA)]);
    state = withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: true })),
    });
    state = withPlayer(state, "p3", { missions: [escortMission("escort-p3", "p2")] });
    const p2At = positionOf(getPlayer(state, "p2").ship);
    expect(escortCandidates(viewFor(state, "p1"), "p1", p2At)).toEqual([]);
    const result = executeTurnAs(state, coast(1), escortMark("p2"));
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events)).not.toContain("escort_marked");
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: null });
    // The control: with nobody's marker on it, the same ship takes p1's.
    const free = withPlayer(state, "p3", { missions: [] });
    expect(escortCandidates(viewFor(free, "p1"), "p1", p2At)).toEqual(["p2"]);
    expect(
      getPlayer(executeTurnAs(free, coast(1), escortMark("p2")).gameState, "p1").missions[0]
    ).toMatchObject({ markedPlayerId: "p2" });
  });

  it("a second Escort named on the ship the first one marks places nothing", () => {
    const state = meeting(
      [escortMission("escort-a", "p2"), escortMission("escort-b")],
      [deliverMission(ALPHA, GAMMA)]
    );
    const result = executeTurnAs(state, coast(1), escortMark("p2"));
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events)).not.toContain("escort_marked");
  });

  it.each<[string, string[], Array<string | null>]>([
    ["in seat order", ["p2", "p3"], ["p2", "p3"]],
    ["in the order named", ["p3", "p2"], ["p3", "p2"]],
    ["one of two", ["p3"], ["p3", null]],
  ])("two Escorts in a sector of two carriers, named %s", (_label, named, marks) => {
    const state = twoCarriers([escortMission("escort-a"), escortMission("escort-b")]);
    const result = executeTurnAs(state, coast(1), ...named.map((id) => escortMark(id)));
    expect(result.errors).toBeUndefined();
    expect(marksOf(result.gameState)).toEqual(marks);
  });

  it("a name that does not qualify leaves its marker for the next name", () => {
    // p3 carries a crate but is far away; p2 is in the sector.
    const state = twoCarriers([escortMission("escort-a"), escortMission("escort-b")], {
      wellId: BH,
      ring: 3,
      sector: 12,
    });
    const result = executeTurnAs(state, coast(1), escortMark("p3"), escortMark("p2"));
    expect(result.errors).toBeUndefined();
    expect(marksOf(result.gameState)).toEqual(["p2", null]);
  });

  it.each<[string, Mission[], string[]]>([
    ["a player not at the table", [escortMission()], ["p9"]],
    ["the escort's own ship", [escortMission()], ["p1"]],
    ["more ships than markers in hand", [escortMission()], ["p2", "p3"]],
    ["the same ship twice", [escortMission("escort-a"), escortMission("escort-b")], ["p2", "p2"]],
    ["a marker with no Escort in hand", [], ["p2"]],
    [
      "a marker with the only Escort's marker already out",
      [escortMission("escort-1", "p3")],
      ["p2"],
    ],
    ["a marker with the only Escort done", [{ ...escortMission(), isCompleted: true }], ["p2"]],
    ["a marker with the only Escort spent", [escortMission("escort-1", null, true)], ["p2"]],
  ])("refuses a turn that names %s", (_label, escorts, named) => {
    const state = twoCarriers(escorts);
    const result = executeTurnAs(state, coast(1), ...named.map((id) => escortMark(id)));
    expectRefused(result, state);
    expect(result.events).toEqual([]);
    // One Escort in hand marking one rival carrier is taken.
    expectRefusedUnless(
      result,
      executeTurnAs(twoCarriers([escortMission()]), coast(1), escortMark("p2"))
    );
  });

  /** Where p1, the escort, waits while p2 sells at Beta. */
  type Where = (state: GameState) => { wellId: string; ring: number; sector: number };
  const IN_BETA_WELL: Where = () => ({ wellId: BETA, ring: 4, sector: 0 });
  const MOORED_AT_BETA: Where = (state) => {
    const station = getStationForPlanet(state.stations, BETA)!;
    return { wellId: BETA, ring: station.ring, sector: station.sector };
  };
  const IN_ALPHA_WELL: Where = () => ({ wellId: ALPHA, ring: 3, sector: 0 });
  const IN_BLACK_HOLE: Where = () => ({ wellId: BH, ring: 3, sector: 0 });

  /**
   * p2 (active) arrives at Beta carrying what `p2Missions` imply; p1 holds an
   * Escort marked on p2 and waits `escortAt`.
   */
  function carrierArrives(p2Missions: Mission[], p1Points = 0, escortAt = IN_BETA_WELL): GameState {
    let state = arriving(table(), "p2", BETA, p2Missions);
    state = withPlayer(state, "p1", {
      missions: [escortMission("escort-1", "p2")],
      points: p1Points,
    });
    state = withShip(state, "p1", escortAt(state));
    return { ...state, activePlayerIndex: 1 };
  }

  /** p2 arrives at Beta and sells what `card` asks for; the item rides as the card's own. */
  function carrierSells(card: Mission, escortAt: Where): GameState {
    let state = carrierArrives([card], 0, escortAt);
    // The loot rides as the Piracy card's crate, not a crate made at the deal.
    if (card.type === "piracy")
      state = withPlayer(state, "p2", { cargo: [lootCargo(card.cargoId, card.id)] });
    if (card.type === "survey") state = withPlayer(state, "p2", { cargo: [takenData(card)] });
    return state;
  }

  const p1Escort = (state: GameState) => getPlayer(state, "p1").missions[0];
  const escortPaid = (events: { type: string }[]) =>
    eventsOf(events as never, "mission_completed").filter((e) => e.playerId === "p1");

  it.each<[string, Mission, string, Where]>([
    ["delivers a crate", deliverMission(ALPHA, BETA), "cargo_delivered", IN_BETA_WELL],
    ["files data", surveyMission("survey-p2"), "cargo_delivered", IN_BETA_WELL],
    ["sells loot", piracyMission("piracy-p2"), "cargo_delivered", IN_BETA_WELL],
    ["pumps a Tanker's fuel", tankerMission("tanker-p2"), "fuel_pumped", IN_BETA_WELL],
    ["delivers a crate", deliverMission(ALPHA, BETA), "cargo_delivered", MOORED_AT_BETA],
  ])(
    "completes on the carrier's own turn when it %s with the escort in its well (%#)",
    (_label, card, sale, escortAt) => {
      const result = executeTurnAs(carrierSells(card, escortAt), coast(1));
      expect(eventTypes(result.events)).toContain(sale);
      const escort = escortPaid(result.events);
      expect(escort).toEqual([expect.objectContaining({ points: MISSION_POINTS.escort })]);
      expect(escort[0].mission.type).toBe("escort");
      const p1 = getPlayer(result.gameState, "p1");
      expect(p1.points).toBe(MISSION_POINTS.escort);
      expect(p1.missions[0].isCompleted).toBe(true);
      // A finished Escort's marker is off the ship.
      expect(viewFor(result.gameState, null).players[1].escortedBy).toEqual([]);
    }
  );

  it.each<[string, Mission, Where]>([
    ["delivers in another planet's well", deliverMission(ALPHA, BETA), IN_ALPHA_WELL],
    ["delivers in the black hole", deliverMission(ALPHA, BETA), IN_BLACK_HOLE],
    ["pumps fuel in another planet's well", tankerMission("tanker-p2"), IN_ALPHA_WELL],
  ])(
    "pays nothing when the carrier sells with the escort out of its well: it %s",
    (_label, card, escortAt) => {
      const result = executeTurnAs(carrierSells(card, escortAt), coast(1));
      expect(eventTypes(result.events)).toEqual(
        expect.arrayContaining([card.type === "tanker" ? "fuel_pumped" : "cargo_delivered"])
      );
      expect(escortPaid(result.events)).toEqual([]);
      expect(getPlayer(result.gameState, "p1").points).toBe(0);
      // The marker stays on the carrier for its next sale.
      expect(p1Escort(result.gameState)).toMatchObject({
        markedPlayerId: "p2",
        isCompleted: false,
        isSpent: false,
      });
      expect(viewFor(result.gameState, null).players[1].escortedBy).toEqual(["p1"]);
    }
  );

  it("one sale pays the carrier's Piracy card and its escort's marker, and only those", () => {
    const sold = piracyMission("piracy-a");
    const empty = piracyMission("piracy-b");
    let state = arriving(table(undefined, { wellId: BH, ring: 5, sector: 12 }), "p2", BETA, [
      sold,
      empty,
    ]);
    state = withPlayer(state, "p2", { cargo: [lootCargo(sold.cargoId, sold.id)] });
    state = withPlayer(state, "p1", { missions: [escortMission("escort-p1", "p2")] });
    state = withShip(state, "p1", IN_BETA_WELL(state));
    const result = executeTurnAs({ ...state, activePlayerIndex: 1 }, coast(1));
    const paid = eventsOf(result.events, "mission_completed").map((e) => [
      e.playerId,
      e.mission.id,
    ]);
    expect(paid.sort()).toEqual([
      ["p1", "escort-p1"],
      ["p2", "piracy-a"],
    ]);
    for (const id of ["p1", "p2"]) expect(getPlayer(result.gameState, id).points).toBe(1);
    expect(getPlayer(result.gameState, "p3").points).toBe(0);
    const p2Cards = getPlayer(result.gameState, "p2").missions;
    expect(p2Cards.map((m) => m.isCompleted)).toEqual([true, false]);
  });

  it("an Escort that reaches the points on the carrier's turn starts the final round", () => {
    const result = executeTurnAs(carrierArrives([deliverMission(ALPHA, BETA)], 2), coast(1));
    expect(eventsOf(result.events, "final_round")).toEqual([
      expect.objectContaining({ playerId: "p1", points: 3 }),
    ]);
    expect(result.gameState.finalRound).toBe(true);
  });

  it("a carrier that docks and delivers nothing completes nothing", () => {
    // Its crate is bound for Gamma, not Beta.
    const result = executeTurnAs(carrierArrives([deliverMission(ALPHA, GAMMA)]), coast(1));
    expect(eventTypes(result.events)).not.toContain("cargo_delivered");
    expect(getPlayer(result.gameState, "p1").missions[0].isCompleted).toBe(false);
  });

  /**
   * p1 holds an Escort on p2, which carries a crate at BH R3 S2 with 4 hull;
   * p3 sits at BH R3 S0 with its railgun up. `shooter` fires, or nobody does.
   */
  function markedCarrier(shooter: "p1" | "p3" | null): {
    state: GameState;
    actions: ReturnType<typeof fire>[];
  } {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: shooter === "p1" ? 0 : 10 }),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 2 }),
      makePlayer("p3", { wellId: BH, ring: 3, sector: shooter === "p1" ? 16 : 0 }),
    ]);
    state = withShip(state, "p2", { hitPoints: 4 });
    state = withPlayer(state, "p1", { missions: [escortMission("escort-1", "p2")] });
    if (shooter === null) return { state, actions: [] };
    state = withPower(state, shooter, "forward-0", 4);
    return {
      state: { ...state, activePlayerIndex: shooter === "p1" ? 0 : 2 },
      actions: [fire(1, "forward-0", "p2")],
    };
  }

  it.each<[string, () => { state: GameState; actions: ReturnType<typeof fire>[] }]>([
    ["the escort's own weapon", () => markedCarrier("p1")],
    ["a third player's weapon", () => markedCarrier("p3")],
    [
      "its own heat check",
      () => {
        const { state } = markedCarrier(null);
        return {
          state: withShip({ ...state, activePlayerIndex: 1 }, "p2", {
            hitPoints: 1,
            heat: { currentHeat: 30 },
          }),
          actions: [],
        };
      },
    ],
  ])("the Escort is spent when the marked ship is destroyed by %s", (_label, build) => {
    const { state, actions } = build();
    const result = executeTurnAs(state, ...(actions.length ? actions : [coast(1)]));
    expect(eventsOf(result.events, "ship_destroyed").map((e) => e.victimId)).toEqual(["p2"]);
    expect(eventsOf(result.events, "escort_spent")).toEqual([
      expect.objectContaining({ escortId: "p1", carrierId: "p2", missionId: "escort-1" }),
    ]);
    expect(eventTypes(result.events)).not.toContain("escort_released");
    const card = p1Escort(result.gameState);
    expect(card).toMatchObject({ markedPlayerId: null, isCompleted: false, isSpent: true });
    expect(unplacedEscorts(getPlayer(result.gameState, "p1").missions)).toEqual([]);
    for (const viewer of ["p1", "p2", "p3", null]) {
      expect(eventTypes(filterEventsFor(result.events, viewer))).toContain("escort_spent");
      expect(viewFor(result.gameState, viewer).players[1].escortedBy).toEqual([]);
    }
    expect(getPlayer(result.gameState, "p1").points).toBe(0);
  });

  it("a spent card is face-up for the table, and the rest of the hand stays hidden", () => {
    const deliver = deliverMission(ALPHA, GAMMA, "deliver-p1");
    let state = markedCarrier(null).state;
    state = withPlayer(state, "p1", {
      missions: [deliver, escortMission("escort-1", null, true)],
    });
    for (const viewer of ["p2", "p3", null]) {
      const view = viewFor(state, viewer);
      expect(view.players[0].spentMissions).toEqual([
        expect.objectContaining({ id: "escort-1", isSpent: true }),
      ]);
      expect(view.players[0].completedMissions).toEqual([]);
      expect(JSON.stringify(view)).not.toContain(deliver.id);
    }
    expect(viewFor(state, "p1").me!.missions).toEqual([
      deliver,
      expect.objectContaining({ id: "escort-1", isSpent: true }),
    ]);
    // The control: an unspent Escort in hand is not on the table.
    const held = withPlayer(state, "p1", { missions: [deliver, escortMission("escort-1")] });
    expect(viewFor(held, "p2").players[0].spentMissions).toEqual([]);
  });

  it.each<[string, Where, { isCompleted: boolean; isSpent: boolean }]>([
    [
      "with the escort in its well, the sale came first: done",
      IN_BETA_WELL,
      { isCompleted: true, isSpent: false },
    ],
    [
      "with the escort elsewhere, nothing was paid: spent",
      IN_ALPHA_WELL,
      { isCompleted: false, isSpent: true },
    ],
  ])("a carrier that sells and then dies at its heat check, %s", (_label, escortAt, expected) => {
    const state = withShip(carrierArrives([deliverMission(ALPHA, BETA)], 0, escortAt), "p2", {
      heat: { currentHeat: 60 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["cargo_delivered", "ship_destroyed"])
    );
    expect(p1Escort(result.gameState)).toMatchObject({
      ...expected,
      markedPlayerId: expected.isSpent ? null : "p2",
    });
    expect(eventTypes(result.events).includes("escort_spent")).toBe(expected.isSpent);
    expect(getPlayer(result.gameState, "p1").points).toBe(expected.isCompleted ? 1 : 0);
  });

  it("a carrier that pumps fuel and then dies at its heat check did it first: the Escort is done", () => {
    const state = withShip(carrierArrives([tankerMission("tanker-p2")]), "p2", {
      heat: { currentHeat: 60 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["fuel_pumped", "ship_destroyed"])
    );
    expect(eventTypes(result.events)).not.toContain("escort_spent");
    expect(p1Escort(result.gameState).isCompleted).toBe(true);
  });

  /**
   * p1, the escort, has 1 hull at BH R3 S2 with its marker on p2, which
   * carries a crate at BH R3 S0 with its railgun up; p3 sits further round.
   */
  function markedEscort(): GameState {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 2 }),
      makePlayer("p2", { wellId: BH, ring: 3, sector: 0 }),
      makePlayer("p3", { wellId: BH, ring: 3, sector: 16 }),
    ]);
    state = withMissions(state, "p2", [deliverMission(ALPHA, GAMMA)]);
    state = withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: true })),
    });
    state = withShip(state, "p1", { hitPoints: 1 });
    state = withPower(state, "p2", "forward-0", 4);
    return withPlayer(state, "p1", { missions: [escortMission("escort-1", "p2")] });
  }

  it.each<[string, () => { state: GameState; actions: ReturnType<typeof fire | typeof coast>[] }]>([
    [
      "the carrier's weapon",
      () => ({
        state: { ...markedEscort(), activePlayerIndex: 1 },
        actions: [fire(1, "forward-0", "p1")],
      }),
    ],
    [
      "its own heat check",
      () => ({
        state: withShip(markedEscort(), "p1", { heat: { currentHeat: 30 } }),
        actions: [coast(1)],
      }),
    ],
    [
      "the carrier's weapon, and the carrier then dies at its own heat check",
      () => ({
        state: withShip({ ...markedEscort(), activePlayerIndex: 1 }, "p2", {
          heat: { currentHeat: 60 },
        }),
        actions: [fire(1, "forward-0", "p1")],
      }),
    ],
  ])("the marker comes back when the escort is destroyed by %s", (_label, build) => {
    const { state, actions } = build();
    const result = executeTurnAs(state, ...actions);
    expect(eventsOf(result.events, "ship_destroyed")[0]).toMatchObject({ victimId: "p1" });
    expect(eventsOf(result.events, "escort_released")).toEqual([
      expect.objectContaining({ escortId: "p1", carrierId: "p2", missionId: "escort-1" }),
    ]);
    expect(eventTypes(result.events)).not.toContain("escort_spent");
    const card = p1Escort(result.gameState);
    expect(card).toMatchObject({ markedPlayerId: null, isCompleted: false, isSpent: false });
    expect(viewFor(result.gameState, null).players[1].escortedBy).toEqual([]);
    expect(eventTypes(filterEventsFor(result.events, "p3"))).toContain("escort_released");

    // Back in hand, the marker can go on the same ship again.
    const again = executeTurnAs(
      meeting([card], [deliverMission(ALPHA, GAMMA)]),
      coast(1),
      escortMark("p2")
    );
    expect(p1Escort(again.gameState)).toMatchObject({ markedPlayerId: "p2" });
  });

  it("an escort destroyed with two markers out takes both back", () => {
    let state = markedEscort();
    state = withPlayer(state, "p1", {
      missions: [escortMission("escort-a", "p2"), escortMission("escort-b", "p3")],
    });
    const result = executeTurnAs(withShip(state, "p1", { heat: { currentHeat: 30 } }), coast(1));
    expect(eventsOf(result.events, "escort_released").map((e) => e.missionId)).toEqual([
      "escort-a",
      "escort-b",
    ]);
    expect(marksOf(result.gameState)).toEqual([null, null]);
  });

  it("a carrier that shoots its escort down and then sells pays it nothing", () => {
    let state = carrierArrives([deliverMission(ALPHA, BETA)]);
    const p2At = positionOf(getPlayer(state, "p2").ship);
    state = withShip(state, "p1", { ...p2At, hitPoints: 1 });
    state = withPower(state, "p2", "forward-0", 4);
    const result = executeTurnAs(state, fire(1, "forward-0", "p1", "engines", true), coast(2));
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["ship_destroyed", "escort_released", "cargo_delivered"])
    );
    expect(escortPaid(result.events)).toEqual([]);
    expect(p1Escort(result.gameState)).toMatchObject({ markedPlayerId: null, isCompleted: false });
    // The control: the same sale with the escort alive pays.
    const spared = executeTurnAs(withShip(state, "p1", { hitPoints: 10 }), coast(1));
    expect(escortPaid(spared.events)).toHaveLength(1);
  });

  it("two Escorts on two ships: one carrier dies, the other marker stays placed", () => {
    let state = markedCarrier(null).state;
    state = withMissions(state, "p3", [deliverMission(ALPHA, GAMMA)]);
    state = withPlayer(state, "p3", {
      cargo: getPlayer(state, "p3").cargo.map((c) => ({ ...c, isPickedUp: true })),
    });
    state = withPlayer(state, "p1", {
      missions: [escortMission("escort-a", "p2"), escortMission("escort-b", "p3")],
    });
    state = withShip({ ...state, activePlayerIndex: 1 }, "p2", {
      hitPoints: 1,
      heat: { currentHeat: 30 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "escort_spent").map((e) => e.missionId)).toEqual(["escort-a"]);
    expect(getPlayer(result.gameState, "p1").missions).toEqual([
      expect.objectContaining({ id: "escort-a", isSpent: true, markedPlayerId: null }),
      expect.objectContaining({ id: "escort-b", isSpent: false, markedPlayerId: "p3" }),
    ]);
  });
});
