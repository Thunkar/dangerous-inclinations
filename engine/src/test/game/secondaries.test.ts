/**
 * The shuffled secondary pile's rules: two of a kind are two jobs, Salvage
 * (wrecks) and Escort (markers). RULES §Missions.
 */
import { describe, it, expect } from "vitest";
import type { GameState, Wreck } from "../../models/game.ts";
import type { Mission } from "../../models/missions.ts";
import { MISSION_POINTS, TANKER_FUEL } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { filterEventsFor } from "../../models/events.ts";
import { getStationForPlanet } from "../../game/stations.ts";
import { ringVelocity, wrapSector } from "../../game/geometry.ts";
import { viewFor } from "../../game/view.ts";
import {
  ALPHA,
  BETA,
  BH,
  GAMMA,
  approachSector,
  coast,
  deliverMission,
  dockJob,
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
    expect(
      getPlayer(first.gameState, "p1").missions.map((m) => "acquired" in m && m.acquired)
    ).toEqual([true, false]);

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
    expect(p1.completedMissionCount).toBe(MISSION_POINTS.tanker);
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
    ["the black hole's ring 3", { wellId: BH, ring: 3, sector: 22 }],
    ["the black hole's ring 1", { wellId: BH, ring: 1, sector: 23 }],
    ["a planet's ring 2", { wellId: ALPHA, ring: 2, sector: 5 }],
    ["a planet's ring 4", { wellId: GAMMA, ring: 4, sector: 10 }],
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

  it.each([ALPHA, BETA, GAMMA])("files a black box at %s, which is the whole card", (planet) => {
    const card = salvageMission();
    const state = withPlayer(arriving(table(), "p1", planet, [card]), "p1", {
      cargo: [dataCargo(card.cargoId, card.id)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([
      expect.objectContaining({ cargoId: card.cargoId, kind: "data" }),
    ]);
    expect(eventsOf(result.events, "docked")).toEqual([expect.objectContaining({ job: "data" })]);
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      card.id,
    ]);
    expect(getPlayer(result.gameState, "p1").completedMissionCount).toBe(MISSION_POINTS.salvage);
  });

  it.each([
    ["crates", false],
    ["data", true],
  ] as const)(
    "beside a crate bound for the same station, the %s job files the black box = %s",
    (job, filed) => {
      const card = salvageMission();
      const deliver = deliverMission(GAMMA, ALPHA);
      // `arriving` puts the Deliver's crate aboard; the black box rides beside it.
      const base = arriving(table(), "p1", ALPHA, [deliver, card]);
      const state = withPlayer(base, "p1", {
        cargo: [...getPlayer(base, "p1").cargo, dataCargo(card.cargoId, card.id)],
      });
      const result = executeTurnAs(state, coast(1), dockJob(job));
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

  it("a pirate can seize a black box as data, and the victim's Salvage stays undone", () => {
    const card = salvageMission("salvage-p2");
    let state = withMissions(table(LANDING), "p1", [piracyMission()]);
    state = withPlayer(state, "p2", {
      missions: [card],
      cargo: [dataCargo(card.cargoId, card.id)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_seized")).toEqual([
      expect.objectContaining({ victimId: "p2", cargoId: card.cargoId, kind: "data" }),
    ]);
    const victim = getPlayer(result.gameState, "p2");
    expect(victim.cargo).toEqual([
      expect.objectContaining({ id: card.cargoId, isPickedUp: false }),
    ]);
    expect(victim.missions[0].isCompleted).toBe(false);
  });

  it("a pirate beside a crate and a black box takes the crate", () => {
    const card = salvageMission("salvage-p2");
    const loot = piracyMission("piracy-p2");
    let state = withMissions(table(LANDING), "p1", [piracyMission()]);
    state = withPlayer(state, "p2", {
      missions: [card, loot],
      cargo: [dataCargo(card.cargoId, card.id), lootCargo(loot.cargoId, loot.id)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_seized")).toEqual([
      expect.objectContaining({ cargoId: loot.cargoId, kind: "crate" }),
    ]);
  });

  it("a ship destroyed with a black box aboard loses it, and the card stays undone", () => {
    const card = salvageMission("salvage-p2");
    let state = withPower(
      withShip(table({ wellId: BH, ring: 3, sector: 2 }), "p2", { hitPoints: 4 }),
      "p1",
      "forward-0",
      4
    );
    state = withPlayer(state, "p2", {
      missions: [card],
      cargo: [dataCargo(card.cargoId, card.id)],
    });
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    const victim = getPlayer(result.gameState, "p2");
    expect(victim.cargo).toEqual([]);
    expect(victim.missions[0].isCompleted).toBe(false);
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
    const data = { ...surveyMission("survey-p2"), acquired: true };
    let state = withMissions(table(LANDING), "p1", [escortMission()]);
    state = withPlayer(state, "p2", {
      missions: [data],
      cargo: [
        {
          id: data.dataCargoId,
          missionId: data.id,
          kind: "data",
          deliveryPlanetId: "any",
          isPickedUp: true,
        },
      ],
    });
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

  /** p2 (active) arrives at Beta carrying `cargo`; p1 holds an Escort marked on p2. */
  function carrierArrives(p2Missions: Mission[], p1Points = 0): GameState {
    let state = arriving(table(), "p2", BETA, p2Missions);
    state = withPlayer(state, "p1", {
      missions: [escortMission("escort-1", "p2")],
      completedMissionCount: p1Points,
    });
    return { ...state, activePlayerIndex: 1 };
  }

  it.each<[string, Mission[]]>([
    ["delivers a crate", [deliverMission(ALPHA, BETA)]],
    ["files data", [{ ...surveyMission("survey-p2"), acquired: true }]],
    ["sells loot", [piracyMission("piracy-p2")]],
  ])("completes on the carrier's own turn when it %s, and the points count", (_label, cards) => {
    let state = carrierArrives(cards);
    // The loot rides as the Piracy card's crate, not a crate made at the deal.
    if (cards[0].type === "piracy")
      state = withPlayer(state, "p2", { cargo: [lootCargo(cards[0].cargoId, cards[0].id)] });
    if (cards[0].type === "survey")
      state = withPlayer(state, "p2", {
        cargo: [
          {
            id: cards[0].dataCargoId,
            missionId: cards[0].id,
            kind: "data",
            deliveryPlanetId: "any",
            isPickedUp: true,
          },
        ],
      });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toContain("cargo_delivered");
    const escort = eventsOf(result.events, "mission_completed").filter((e) => e.playerId === "p1");
    expect(escort).toEqual([expect.objectContaining({ completedCount: MISSION_POINTS.escort })]);
    expect(escort[0].mission.type).toBe("escort");
    const p1 = getPlayer(result.gameState, "p1");
    expect(p1.completedMissionCount).toBe(MISSION_POINTS.escort);
    expect(p1.missions[0].isCompleted).toBe(true);
    // A finished Escort's marker is off the ship.
    expect(viewFor(result.gameState, null).players[1].escortedBy).toEqual([]);
  });

  it("one sale pays the carrier's Piracy card and two escorts' markers, and only those", () => {
    const sold = piracyMission("piracy-a");
    const empty = piracyMission("piracy-b");
    let state = arriving(table(undefined, { wellId: BH, ring: 5, sector: 12 }), "p2", BETA, [
      sold,
      empty,
    ]);
    state = withPlayer(state, "p2", { cargo: [lootCargo(sold.cargoId, sold.id)] });
    for (const id of ["p1", "p3"])
      state = withPlayer(state, id, { missions: [escortMission(`escort-${id}`, "p2")] });
    const result = executeTurnAs({ ...state, activePlayerIndex: 1 }, coast(1));
    const paid = eventsOf(result.events, "mission_completed").map((e) => [
      e.playerId,
      e.mission.id,
    ]);
    expect(paid.sort()).toEqual([
      ["p1", "escort-p1"],
      ["p2", "piracy-a"],
      ["p3", "escort-p3"],
    ]);
    for (const id of ["p1", "p2", "p3"])
      expect(getPlayer(result.gameState, id).completedMissionCount).toBe(1);
    const p2Cards = getPlayer(result.gameState, "p2").missions;
    expect(p2Cards.map((m) => m.isCompleted)).toEqual([true, false]);
  });

  it("completes when the carrier pumps a Tanker's fuel on its own turn", () => {
    const result = executeTurnAs(carrierArrives([tankerMission("tanker-p2")]), coast(1));
    expect(eventsOf(result.events, "fuel_pumped")).toHaveLength(1);
    expect(eventTypes(result.events)).not.toContain("cargo_delivered");
    const p1 = getPlayer(result.gameState, "p1");
    expect(p1.completedMissionCount).toBe(MISSION_POINTS.escort);
    expect(p1.missions[0].isCompleted).toBe(true);
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

  it.each([
    [
      "a weapon",
      () => {
        let state = withPower(
          withShip(table({ wellId: BH, ring: 3, sector: 2 }), "p2", { hitPoints: 4 }),
          "p1",
          "forward-0",
          4
        );
        state = withPlayer(state, "p1", { missions: [escortMission("escort-1", "p2")] });
        return { state, actions: [fire(1, "forward-0", "p2")] };
      },
    ],
    [
      "its own heat check",
      () => {
        let state = withShip({ ...table(), activePlayerIndex: 1 }, "p2", {
          hitPoints: 1,
          heat: { currentHeat: 30 },
        });
        state = withPlayer(state, "p1", { missions: [escortMission("escort-1", "p2")] });
        return { state, actions: [coast(1)] };
      },
    ],
  ])("the marker comes back when the marked ship is destroyed by %s", (_label, build) => {
    const { state, actions } = build();
    const result = executeTurnAs(state, ...actions);
    expect(eventsOf(result.events, "escort_released")).toEqual([
      expect.objectContaining({ escortId: "p1", carrierId: "p2", missionId: "escort-1" }),
    ]);
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({
      markedPlayerId: null,
      isCompleted: false,
    });
    expect(eventTypes(filterEventsFor(result.events, "p2"))).toContain("escort_released");
  });

  it("a carrier that delivers and then dies at its heat check delivered first: the Escort is done", () => {
    const state = withShip(carrierArrives([deliverMission(ALPHA, BETA)]), "p2", {
      heat: { currentHeat: 60 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["cargo_delivered", "ship_destroyed"])
    );
    expect(eventTypes(result.events)).not.toContain("escort_released");
    expect(getPlayer(result.gameState, "p1").missions[0].isCompleted).toBe(true);
  });

  it("a carrier that pumps fuel and then dies at its heat check pumped first: the Escort is done", () => {
    const state = withShip(carrierArrives([tankerMission("tanker-p2")]), "p2", {
      heat: { currentHeat: 60 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["fuel_pumped", "ship_destroyed"])
    );
    expect(eventTypes(result.events)).not.toContain("escort_released");
    expect(getPlayer(result.gameState, "p1").missions[0].isCompleted).toBe(true);
  });

  it("an escort's own destruction leaves its marker where it is", () => {
    let state = withShip(table(), "p1", { hitPoints: 1, heat: { currentHeat: 30 } });
    state = withPlayer(state, "p1", { missions: [escortMission("escort-1", "p2")] });
    const result = executeTurnAs(state, coast(1));
    expect(eventTypes(result.events)).toContain("ship_destroyed");
    expect(eventTypes(result.events)).not.toContain("escort_released");
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: "p2" });
  });
});
