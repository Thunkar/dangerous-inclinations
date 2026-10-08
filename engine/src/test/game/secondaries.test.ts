/**
 * The secondary cards (RULES §Missions): Survey's dive, Tanker's pump, two of
 * a kind as two jobs, Salvage (wrecks) and Escort (markers). Piracy has
 * piracy.test.ts, and a sale's choice at a station docking.test.ts.
 */
import { describe, it, expect } from "vitest";
import type { GameState, Player, ShipLoadout, Wreck } from "../../models/game.ts";
import { FIRST_TURN } from "../../models/game.ts";
import type { Mission, SurveyMission } from "../../models/missions.ts";
import { dataAboard } from "../../models/missions.ts";
import { STATION_RING } from "../../models/gravityWells.ts";
import { filterEventsFor } from "../../models/events.ts";
import { positionOf, ringVelocity, wrapSector } from "../../game/geometry.ts";
import {
  escortCandidates,
  escortCandidatesNow,
  unplacedEscorts,
} from "../../game/escort.ts";
import { viewFor } from "../../game/view.ts";
import {
  LOADOUTS,
  ALPHA,
  burn,
  salvage,
  scan,
  seize,
  survey,
  BETA,
  BH,
  GAMMA,
  coast,
  crateCargo,
  deliverMission,
  dockSale,
  escortMark,
  escortMission,
  eventsOf,
  eventTypes,
  dataCargo,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  fire,
  getPlayer,
  getShip,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  piracyMission,
  salvageMission,
  surveyMission,
  takenData,
  tankerMission,
  withMissions,
  withPlayer,
  withPower,
  withShip,
  LANDING,
  berthOf,
  blackBoxOf,
  cratesAboard,
  lootOf,
  shortOfStation,
} from "../testUtils.ts";

/** Ring 3 of the black hole drifts 4: a coast from S0 ends on S4. */

type At = { wellId: string; ring: number; sector: number };

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
  const next = withMissions(shortOfStation(state, playerId, planet), playerId, missions);
  return withPlayer(next, playerId, { cargo: cratesAboard(getPlayer(next, playerId).cargo) });
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
    const first = executeTurnAs(state, coast(1), survey(2));
    expect(eventsOf(first.events, "data_acquired").map((e) => e.missionId)).toEqual(["survey-a"]);
    const p1 = getPlayer(first.gameState, "p1");
    expect(p1.missions.map((m) => dataAboard(p1, m as SurveyMission))).toEqual([true, false]);

    const second = executeTurnAs({ ...first.gameState, activePlayerIndex: 0 }, coast(1), survey(2));
    expect(eventsOf(second.events, "data_acquired").map((e) => e.missionId)).toEqual(["survey-b"]);
    expect(getPlayer(second.gameState, "p1").cargo.filter((c) => c.kind === "data")).toHaveLength(
      2
    );
  });

  it("one fuel visit pays one Tanker, even with fuel for two", () => {
    const state = withShip(
      arriving(table(), "p1", ALPHA, [tankerMission("tanker-a"), tankerMission("tanker-b")]),
      "p1",
      { reactionMass: 10 }
    );
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "fuel_pumped")).toHaveLength(1);
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      "tanker-a",
    ]);
    const p1 = getPlayer(result.gameState, "p1");
    expect(p1.points).toBe(1);
    expect(p1.missions.map((m) => m.isCompleted)).toEqual([true, false]);
  });
});

/** p1 at `position` (black hole ring 1 by default) with its sensor array powered, holding a Survey. */
function surveying(position: At = { wellId: BH, ring: 1, sector: 0 }): GameState {
  const state = withMissions(
    makeTwoPlayerGame(
      { ...position, loadout: LOADOUTS.sensorPortLaser },
      { wellId: BH, ring: 4, sector: 12 }
    ),
    "p1",
    [surveyMission("survey-1")]
  );
  return withPower(state, "p1", "forward-0", 2);
}

/** A Survey's turn: p1 starts at `position` facing `facing`. */
function diving(position: At, facing: "prograde" | "retrograde" = "prograde"): GameState {
  return withShip(surveying(position), "p1", { facing });
}
const RING_1: At = { wellId: BH, ring: 1, sector: 0 };
const RING_2: At = { wellId: BH, ring: 2, sector: 0 };

describe("survey: an action in the sequence", () => {
  it("takes the data where it comes, privately", () => {
    const result = executeTurnAs(surveying(), coast(1), survey(2));
    expect(eventsOf(result.events, "data_acquired")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        kind: "survey",
        missionId: "survey-1",
        privateTo: ["p1"],
      }),
    ]);
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([
      expect.objectContaining({ missionId: "survey-1", kind: "data", deliveryPlanetId: "any" }),
    ]);
    expect(eventTypes(filterEventsFor(result.events, "p2"))).not.toContain("data_acquired");
  });

  it('takes nothing unless named: it is an action, not the end of a turn on the ring', () => {
    const result = executeTurnAs(surveying(), coast(1));
    expect(eventTypes(result.events)).not.toContain("data_acquired");
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([]);
  });

  // Ring 1 is the dive wherever the turn ends: a ship that surveys before a
  // burn outward keeps the data, and one that burns inward surveys after it.
  it.each<[string, () => GameState, ReturnType<typeof survey | typeof burn | typeof coast>[], number]>([
    ["before a burn that leaves ring 1", () => diving(RING_1), [survey(1), burn(2, "soft")], 2],
    ["after a coast that stays on ring 1", () => diving(RING_1), [coast(1), survey(2)], 1],
    ["after a burn inward onto ring 1", () => diving(RING_2, "retrograde"), [burn(1, "soft"), survey(2)], 1],
  ])("takes the data %s, and keeps it wherever the turn ends", (_label, build, actions, endRing) => {
    const result = executeTurnAs(build(), ...actions);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").ring).toBe(endRing);
    expect(eventsOf(result.events, "data_acquired")).toHaveLength(1);
    const p1 = getPlayer(result.gameState, "p1");
    expect(dataAboard(p1, p1.missions[0] as SurveyMission)).toBe(true);
  });

  it.each<[string, () => GameState, ReturnType<typeof survey | typeof burn | typeof coast>[]]>([
    ["after a burn that leaves ring 1", () => diving(RING_1), [burn(1, "soft"), survey(2)]],
    ["before a burn inward onto ring 1", () => diving(RING_2, "retrograde"), [survey(1), burn(2, "soft")]],
    ["on ring 2 of the black hole", () => diving(RING_2), [coast(1), survey(2)]],
    ["on the innermost ring of a planet", () => diving({ wellId: ALPHA, ring: 1, sector: 5 }), [coast(1), survey(2)]],
    ["holding no Survey card", () => withMissions(diving(RING_1), "p1", [piracyMission()]), [coast(1), survey(2)]],
    [
      "with the card's data already aboard",
      () => withPlayer(diving(RING_1), "p1", { cargo: [takenData(surveyMission("survey-1"))] }),
      [coast(1), survey(2)],
    ],
    [
      "twice in one turn, with two Survey cards",
      () => withMissions(diving(RING_1), "p1", [surveyMission("survey-a"), surveyMission("survey-b")]),
      [survey(1), coast(2), survey(3)],
    ],
  ])("is refused %s", (_label, build, actions) => {
    const state = build();
    const result = executeTurnAs(state, ...actions);
    expectRefused(result, state);
  });

  it.each<[string, (s: GameState) => GameState]>([
    ["the opening round", (s) => ({ ...s, turn: FIRST_TURN })],
    ["the ship's first turn back from Home", (s) => withPlayer(s, "p1", { recovering: true })],
  ])("a quiet turn allows the dive: it touches nobody (%s)", (_label, quiet) => {
    const result = executeTurnAs(quiet(surveying()), coast(1), survey(2));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "data_acquired")).toHaveLength(1);
  });

  it("a ship that dives and then burns up at its check loses the data", () => {
    const state = withShip(surveying(), "p1", { hitPoints: 1, heat: { currentHeat: 20 } });
    const result = executeTurnAs(state, coast(1), survey(2));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["data_acquired", "ship_destroyed"])
    );
    expect(getPlayer(result.gameState, "p1").cargo.some((c) => c.isPickedUp)).toBe(false);
  });
});

describe("tanker: the pump", () => {
  // Arrive with the card's five fuel or more and hand that much in; one short
  // is also docking.test.ts's sale that falls back to the default.
  it.each([
    [5, true],
    [4, false],
  ])("arriving with %i fuel pumps the load: %s", (fuel, pumped) => {
    const state = withShip(arriving(table(), "p1", ALPHA, [tankerMission()]), "p1", {
      reactionMass: fuel,
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "fuel_pumped")).toEqual(
      pumped ? [expect.objectContaining({ playerId: "p1", amount: 5, planetId: ALPHA })] : []
    );
    expect(getShip(result.gameState, "p1").reactionMass).toBe(pumped ? 0 : fuel);
    expect(getPlayer(result.gameState, "p1").points).toBe(pumped ? 1 : 0);
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
    ["the black hole's ring 1", { wellId: BH, ring: 1, sector: 23 }, 7],
    ["a planet's ring 2", { wellId: ALPHA, ring: 2, sector: 5 }, 9],
  ])(
    "a wreck on %s drifts by its ring's speed once a round, with the stations, to sector %i",
    (_label, at, sector) => {
      const state = { ...table(), wrecks: [wreckAt("w", at)] };
      // p1's turn is not the end of the round: nothing drifts.
      const midRound = executeTurnAs(state, coast(1));
      expect(midRound.gameState.wrecks).toEqual([wreckAt("w", at)]);

      const roundEnd = executeTurnAs(midRound.gameState, coast(1));
      const drifted = wreckAt("w", { ...at, sector });
      expect(roundEnd.gameState.wrecks).toEqual([drifted]);
      expect(eventsOf(roundEnd.events, "stations_moved")).toEqual([
        expect.objectContaining({ wrecks: [drifted] }),
      ]);
    }
  );

  it("a wreck on a berth rides with its station: still on the berth when the round ends", () => {
    const base = table();
    const berth = berthOf(base, ALPHA);
    const state = { ...base, wrecks: [wreckAt("w", berth)] };
    const roundEnd = executeTurnAs(executeTurnAs(state, coast(1)).gameState, coast(1));
    const moved = berthOf(roundEnd.gameState, ALPHA);
    expect(moved.sector).not.toBe(berth.sector);
    expect(roundEnd.gameState.wrecks).toEqual([wreckAt("w", moved)]);
  });

  it("takes a wreck's black box aboard as the card's data, an action in the sequence", () => {
    const card = salvageMission();
    const state = withMissions({ ...table(), wrecks: [wreckAt("w", LANDING)] }, "p1", [card]);
    const result = executeTurnAs(state, coast(1), salvage(2, "w"));
    expect(eventsOf(result.events, "wreck_salvaged")).toEqual([
      expect.objectContaining({ playerId: "p1", wreckId: "w", cargoId: card.cargoId }),
    ]);
    expect(result.gameState.wrecks).toEqual([]);
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([blackBoxOf(card)]);
    // Data on the table: everyone sees a piece of data aboard, and no crate.
    expect(viewFor(result.gameState, "p2").players[0].cargoAboard).toEqual({ crates: 0, data: 1 });
    expect(eventTypes(filterEventsFor(result.events, "p2"))).toContain("wreck_salvaged");
  });

  it("files a black box at any station, which is the whole card", () => {
    const card = salvageMission();
    const state = withPlayer(arriving(table(), "p1", BETA, [card]), "p1", {
      cargo: [blackBoxOf(card)],
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "cargo_delivered")).toEqual([
      expect.objectContaining({ cargoId: card.cargoId, kind: "data" }),
    ]);
    expect(eventsOf(result.events, "docked")).toEqual([expect.objectContaining({ sold: "data" })]);
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      card.id,
    ]);
    expect(getPlayer(result.gameState, "p1").points).toBe(1);
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
        cargo: [...getPlayer(base, "p1").cargo, blackBoxOf(card)],
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

  it("a kill's wreck is on the board at once: named after the kill it is taken that turn, or on a later one", () => {
    // Point blank: p1 coasts into p2's sector, then its laser finishes p2.
    let state = withShip(table(LANDING), "p2", { hitPoints: 1 });
    state = withMissions(state, "p1", [salvageMission()]);
    const kill = executeTurnAs(state, coast(1), fire(2, "side-0", "p2"));
    expect(eventTypes(kill.events)).toEqual(
      expect.arrayContaining(["ship_destroyed", "wreck_left"])
    );
    const wreckId = kill.gameState.wrecks[0].id;
    // Named in the same turn, after the kill, the fresh wreck is there to take.
    const sameTurn = executeTurnAs(state, coast(1), fire(2, "side-0", "p2"), salvage(3, wreckId));
    expect(eventsOf(sameTurn.events, "wreck_salvaged")).toEqual([
      expect.objectContaining({ wreckId }),
    ]);
    // The killer's next turn, still on the wreck's sector, takes it before it moves on.
    const later = withShip(
      { ...kill.gameState, activePlayerIndex: 0 },
      "p1",
      positionOf(kill.gameState.wrecks[0])
    );
    const result = executeTurnAs(later, salvage(1, wreckId), burn(2, "soft"));
    expect(eventsOf(result.events, "wreck_salvaged")).toHaveLength(1);
    expect(result.gameState.wrecks).toEqual([]);
  });

  // Where the ship meets the wreck decides where the salvage goes: before the
  // move on the wreck where it starts, after the move on the one it lands on.
  it.each<[string, At, "before" | "after", boolean]>([
    ["before a coast, on the wreck it starts on", { wellId: BH, ring: 3, sector: 0 }, "before", true],
    ["after a coast, on the wreck it lands on", LANDING, "after", true],
    ["after a coast, on the wreck it started on", { wellId: BH, ring: 3, sector: 0 }, "after", false],
    ["before a coast, on the wreck it lands on", LANDING, "before", false],
  ])("salvages %s: %s", (_label, wreck, when, allowed) => {
    const state = withMissions({ ...table(), wrecks: [wreckAt("w", wreck)] }, "p1", [
      salvageMission(),
    ]);
    const result =
      when === "before"
        ? executeTurnAs(state, salvage(1, "w"), coast(2))
        : executeTurnAs(state, coast(1), salvage(2, "w"));
    if (allowed) {
      expect(eventsOf(result.events, "wreck_salvaged")).toHaveLength(1);
      // Moved away from the wreck, the black box stays aboard.
      expect(getPlayer(result.gameState, "p1").cargo.filter((c) => c.isPickedUp)).toHaveLength(1);
    } else expectRefusedUnless(result, executeTurnAs(state, coast(1)));
  });

  it.each([
    [
      "arriving at a station (and selling nothing)",
      () => {
        const base = arriving(table(), "p1", ALPHA, [salvageMission()]);
        return { ...base, wrecks: [wreckAt("w", berthOf(base, ALPHA))] };
      },
      () => [coast(1), salvage(2, "w"), dockSale("none")],
    ],
    [
      "already moored at a station",
      () => {
        const base = withMissions(table(), "p1", [salvageMission()]);
        const berth = berthOf(base, ALPHA);
        return { ...withShip(base, "p1", berth), wrecks: [wreckAt("w", berth)] };
      },
      () => [salvage(1, "w"), coast(2)],
    ],
    [
      "with a crate already in the hold",
      () => {
        const state = withMissions({ ...table(), wrecks: [wreckAt("w", LANDING)] }, "p1", [
          salvageMission(),
          deliverMission(ALPHA, GAMMA),
        ]);
        return withPlayer(state, "p1", {
          cargo: cratesAboard(getPlayer(state, "p1").cargo),
        });
      },
      () => [coast(1), salvage(2, "w")],
    ],
    [
      "on a quiet turn (the opening round): a wreck is nobody",
      () => ({
        ...withMissions({ ...table(), wrecks: [wreckAt("w", LANDING)] }, "p1", [salvageMission()]),
        turn: FIRST_TURN,
      }),
      () => [coast(1), salvage(2, "w")],
    ],
  ])("takes the black box %s", (_label, build, actions) => {
    const result = executeTurnAs(build(), ...actions());
    expect(eventsOf(result.events, "wreck_salvaged")).toHaveLength(1);
    expect(result.gameState.wrecks).toEqual([]);
    expect(
      getPlayer(result.gameState, "p1").cargo.filter((c) => c.kind === "data" && c.isPickedUp)
    ).toHaveLength(1);
  });

  it("arriving at a station on a wreck, the visit files the black box it has just taken", () => {
    const card = salvageMission();
    const base = arriving(table(), "p1", ALPHA, [card]);
    const state = { ...base, wrecks: [wreckAt("w", berthOf(base, ALPHA))] };
    const result = executeTurnAs(state, coast(1), salvage(2, "w"));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["wreck_salvaged", "cargo_delivered"])
    );
    expect(eventsOf(result.events, "mission_completed").map((e) => e.mission.id)).toEqual([
      card.id,
    ]);
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
        return withPlayer(state, "p1", { cargo: [blackBoxOf(card)] });
      },
    ],
    [
      "naming a wreck that is not on the board",
      () =>
        withMissions({ ...table(), wrecks: [wreckAt("v", LANDING)] }, "p1", [salvageMission()]),
    ],
  ])("is refused %s", (_label, build) => {
    const state = build();
    expectRefused(executeTurnAs(state, coast(1), salvage(2, "w")), state);
  });

  it("a moored ship that dies of its own heat leaves a wreck on the berth, salvaged by the next arrival", () => {
    const base = withMissions(table(), "p2", [salvageMission()]);
    const berth = berthOf(base, ALPHA);
    let state = withShip(base, "p1", { ...berth, hitPoints: 1, heat: { currentHeat: 30 } });
    state = shortOfStation(state, "p2", ALPHA);

    const death = executeTurnAs(state, coast(1));
    expect(eventsOf(death.events, "wreck_left")).toEqual([
      expect.objectContaining({ victimId: "p1", at: berth }),
    ]);

    const arrival = executeTurnAs(
      death.gameState,
      coast(1),
      salvage(2, death.gameState.wrecks[0].id)
    );
    expect(eventsOf(arrival.events, "docked")).toHaveLength(1);
    expect(eventsOf(arrival.events, "wreck_salvaged")).toEqual([
      expect.objectContaining({ playerId: "p2", at: berth }),
    ]);
    expect(arrival.gameState.wrecks).toEqual([]);
  });

  it.each<[string, string[], string[] | null]>([
    ["the first", ["w1"], ["w2"]],
    ["the second", ["w2"], ["w1"]],
    ["both", ["w1", "w2"], null],
  ])(
    "one wreck a turn: two Salvage cards on a sector of two wrecks, naming %s",
    (_label, named, left) => {
      const state = withMissions(
        { ...table(), wrecks: [wreckAt("w1", LANDING), wreckAt("w2", LANDING)] },
        "p1",
        [salvageMission("salvage-a"), salvageMission("salvage-b")]
      );
      const result = executeTurnAs(state, coast(1), ...named.map((w, i) => salvage(i + 2, w)));
      if (left === null) {
        expectRefused(result, state);
        return;
      }
      expect(eventsOf(result.events, "wreck_salvaged")).toEqual([
        expect.objectContaining({ wreckId: named[0], cargoId: salvageMission("salvage-a").cargoId }),
      ]);
      expect(result.gameState.wrecks.map((w) => w.id)).toEqual(left);
    }
  );
});

describe("escort: markers", () => {
  /** p1 holds `escorts` and lands on BH R3 S4; p2 sits at `p2At` carrying what `p2Missions` imply. */
  function meeting(escorts: Mission[], p2Missions: Mission[], p2At: At = LANDING): GameState {
    let state = withMissions(table(p2At), "p1", escorts);
    state = withMissions(state, "p2", p2Missions);
    return withPlayer(state, "p2", {
      cargo: cratesAboard(getPlayer(state, "p2").cargo),
    });
  }

  /** p2 and p3 both carry crates, p2 in p1's landing sector and p3 at `p3At`; p1 holds `escorts`. */
  function twoCarriers(escorts: Mission[], p3At: At = LANDING): GameState {
    let state = withMissions(table(LANDING, p3At), "p1", escorts);
    for (const id of ["p2", "p3"]) {
      state = withMissions(state, id, [deliverMission(ALPHA, GAMMA, `deliver-${id}`)]);
      state = withPlayer(state, id, {
        cargo: cratesAboard(getPlayer(state, id).cargo),
      });
    }
    return state;
  }

  const marksOf = (state: GameState) =>
    getPlayer(state, "p1").missions.map((m) => (m.type === "escort" ? m.markedPlayerId : null));

  /** A sector of Alpha's station ring that is not the berth. */
  const offBerth = (state: GameState) => wrapSector(berthOf(state, ALPHA).sector + 8);

  /**
   * Who an Escort marker may go on is asked from two sides: a seat's own view
   * (the bots, the seat CLI and the table's plan) and the referee's state at
   * the end of the turn. The two must give the same answer, or a seat is
   * offered a marker the referee refuses.
   */
  it("the seat's view and the referee agree on the candidates, on 300 random tables", () => {
    // A few squares, one of them Alpha's berth at the start, so ships share rings often.
    const squares: At[] = [
      { wellId: BH, ring: 3, sector: 4 },
      { wellId: BH, ring: 3, sector: 5 },
      { wellId: ALPHA, ring: 2, sector: 0 },
      { wellId: ALPHA, ring: 2, sector: 6 },
      { wellId: ALPHA, ring: 1, sector: 0 },
    ];
    const ids = ["p1", "p2", "p3", "p4"];
    /** A small seeded generator: the same tables every run. */
    const lcg = (seed: number) => {
      let s = seed >>> 0;
      return (n: number) => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return (s >>> 16) % n;
      };
    };
    const randomTable = (seed: number) => {
      const pick = lcg(seed);
      const players: Player[] = ids.map((id) => {
        const cargo = [
          [],
          [crateCargo(ALPHA, BH)],
          [dataCargo(`data-${id}`, `survey-${id}`)],
          [crateCargo(ALPHA, BH, false)],
        ][pick(4)];
        const rivals = ids.filter((other) => other !== id);
        const missions: Mission[] = [
          [],
          [escortMission(`escort-${id}`)],
          [escortMission(`escort-${id}-a`), escortMission(`escort-${id}-b`)],
          [escortMission(`escort-${id}-a`, rivals[pick(3)]), escortMission(`escort-${id}-b`)],
          [{ ...escortMission(`escort-${id}`), isCompleted: true }],
        ][pick(5)];
        return makePlayer(id, squares[pick(squares.length)], undefined, {
          cargo,
          missions,
          ...(pick(6) === 0 ? { ship: { hitPoints: 0 } } : {}),
        } as Partial<Player>);
      });
      return makeGameState(players);
    };

    let offered = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const state = randomTable(seed);
      for (const player of state.players) {
        if (player.ship.hitPoints <= 0) continue;
        const fromView = escortCandidates(
          viewFor(state, player.id),
          player.id,
          positionOf(player.ship)
        );
        const fromState = escortCandidatesNow(state, player.id, positionOf(player.ship));
        expect(fromView, `seed ${seed}, ${player.id}`).toEqual(fromState);
        offered += fromState.length;
      }
    }
    // Enough tables offer a marker for the agreement to mean something.
    expect(offered).toBeGreaterThan(20);
  });

  it("marks an undocked rival carrying a crate when the player names it, face-up for the table", () => {
    const result = executeTurnAs(
      meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]),
      coast(1),
      escortMark(2, "p2")
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
    const result = executeTurnAs(state, coast(1), escortMark(2, "p2"));
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: "p2" });
  });

  // p1 ends its turn on BH R3 S4.
  it.each<[string, At]>([
    ["in its sector", LANDING],
    ["a sector along its ring", { wellId: BH, ring: 3, sector: 5 }],
    ["across its ring", { wellId: BH, ring: 3, sector: 16 }],
  ])("marks a carrier on the same ring, %s", (_label, p2At) => {
    const state = meeting([escortMission()], [deliverMission(ALPHA, GAMMA)], p2At);
    expect(escortCandidates(viewFor(state, "p1"), "p1", LANDING)).toEqual(["p2"]);
    const result = executeTurnAs(state, coast(1), escortMark(2, "p2"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "escort_marked")).toEqual([
      expect.objectContaining({ escortId: "p1", carrierId: "p2" }),
    ]);
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: "p2" });
  });

  it.each<[string, () => GameState]>([
    ["an empty hold", () => meeting([escortMission()], [])],
    [
      "a crate still waiting on its dock",
      () =>
        withMissions(withMissions(table(LANDING), "p1", [escortMission()]), "p2", [
          deliverMission(ALPHA, GAMMA),
        ]),
    ],
    [
      "a carrier on another ring of the same well",
      () =>
        meeting([escortMission()], [deliverMission(ALPHA, GAMMA)], {
          wellId: BH,
          ring: 4,
          sector: 4,
        }),
    ],
    [
      "a carrier on the same ring number of another well",
      () =>
        meeting([escortMission()], [deliverMission(ALPHA, GAMMA)], {
          wellId: ALPHA,
          ring: 3,
          sector: 4,
        }),
    ],
    [
      "an escort moored at a berth, coasting with it",
      () => {
        // p1 holds Alpha's berth; p2 drifts on the same ring, off it.
        let state = withMissions(table(), "p1", [escortMission()]);
        state = withShip(state, "p1", berthOf(state, ALPHA));
        state = withShip(state, "p2", {
          wellId: ALPHA,
          ring: STATION_RING,
          sector: offBerth(state),
        });
        state = withMissions(state, "p2", [deliverMission(ALPHA, GAMMA)]);
        return withPlayer(state, "p2", {
          cargo: cratesAboard(getPlayer(state, "p2").cargo),
        });
      },
    ],
    [
      "a carrier at a berth",
      () => {
        // p1 coasts along Alpha's station ring and ends off the berth, where p2 is moored.
        let state = withMissions(table(), "p1", [escortMission()]);
        const from = wrapSector(offBerth(state) - ringVelocity(ALPHA, STATION_RING));
        state = withShip(state, "p1", { wellId: ALPHA, ring: STATION_RING, sector: from });
        state = withShip(state, "p2", {
          wellId: ALPHA,
          ring: STATION_RING,
          sector: berthOf(state, ALPHA).sector,
        });
        state = withMissions(state, "p2", [deliverMission(ALPHA, GAMMA)]);
        return withPlayer(state, "p2", {
          cargo: cratesAboard(getPlayer(state, "p2").cargo),
        });
      },
    ],
    [
      "a carrier just back from Home: nobody can touch it",
      () =>
        withPlayer(meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]), "p2", {
          recovering: true,
        }),
    ],
  ])("refuses a marker named for %s", (_label, build) => {
    const state = build();
    const result = executeTurnAs(state, coast(1), escortMark(2, "p2"));
    expectRefused(result, state);
  });

  // Where the escort meets the carrier's ring decides where the mark goes.
  it.each<[string, At, "before" | "after", boolean]>([
    ["before a burn, on the ring it starts on", { wellId: BH, ring: 3, sector: 12 }, "before", true],
    ["after a burn, on the ring it lands on", { wellId: BH, ring: 4, sector: 12 }, "after", true],
    ["after a burn, on the ring it left", { wellId: BH, ring: 3, sector: 12 }, "after", false],
    ["before a burn, on the ring it lands on", { wellId: BH, ring: 4, sector: 12 }, "before", false],
  ])("marks %s: %s", (_label, p2At, when, allowed) => {
    const state = meeting([escortMission()], [deliverMission(ALPHA, GAMMA)], p2At);
    const result =
      when === "before"
        ? executeTurnAs(state, escortMark(1, "p2"), burn(2, "soft"))
        : executeTurnAs(state, burn(1, "soft"), escortMark(2, "p2"));
    if (allowed) {
      expect(eventsOf(result.events, "escort_marked")).toHaveLength(1);
      // Moved off the carrier's ring, the marker stays on it.
      expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: "p2" });
    } else expectRefusedUnless(result, executeTurnAs(state, burn(1, "soft")));
  });

  it("an escort arriving at a berth marks after its move: it is moored only once it docks", () => {
    let state = arriving(table(), "p1", ALPHA, [escortMission()]);
    state = withShip(state, "p2", { wellId: ALPHA, ring: STATION_RING, sector: offBerth(state) });
    state = withMissions(state, "p2", [deliverMission(ALPHA, GAMMA)]);
    state = withPlayer(state, "p2", { cargo: cratesAboard(getPlayer(state, "p2").cargo) });
    const result = executeTurnAs(state, coast(1), escortMark(2, "p2"));
    expect(eventTypes(result.events)).toEqual(expect.arrayContaining(["escort_marked", "docked"]));
  });

  it.each<[string, (s: GameState) => GameState]>([
    ["the opening round", (s) => ({ ...s, turn: FIRST_TURN })],
    ["the escort's first turn back from Home", (s) => withPlayer(s, "p1", { recovering: true })],
  ])("a quiet turn allows a marker: it is no shot, scan or seizure (%s)", (_label, quiet) => {
    const state = quiet(meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]));
    const result = executeTurnAs(state, coast(1), escortMark(2, "p2"));
    expect(eventsOf(result.events, "escort_marked")).toHaveLength(1);
  });

  it("a carrier destroyed earlier in the turn is skipped, like a shot at it", () => {
    let state = withShip(meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]), "p2", {
      hitPoints: 1,
    });
    const result = executeTurnAs(state, coast(1), fire(2, "side-0", "p2"), escortMark(3, "p2"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "action_skipped")).toEqual([
      expect.objectContaining({ action: "escort_mark", targetId: "p2", reason: "target_destroyed" }),
    ]);
    expect(eventTypes(result.events)).not.toContain("escort_marked");
    state = result.gameState;
    expect(getPlayer(state, "p1").missions[0]).toMatchObject({ markedPlayerId: null });
  });

  it("an escort that marks and then burns up at its own check takes its marker back", () => {
    const state = withShip(meeting([escortMission()], [deliverMission(ALPHA, GAMMA)]), "p1", {
      hitPoints: 1,
      heat: { currentHeat: 30 },
    });
    const result = executeTurnAs(state, coast(1), escortMark(2, "p2"));
    expect(eventTypes(result.events)).toEqual(
      expect.arrayContaining(["escort_marked", "ship_destroyed", "escort_released"])
    );
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: null });
  });

  it("a second Escort marks a different ship", () => {
    const state = twoCarriers([escortMission("escort-a", "p2"), escortMission("escort-b")]);
    const result = executeTurnAs(state, coast(1), escortMark(2, "p3"));
    expect(eventsOf(result.events, "escort_marked")).toEqual([
      expect.objectContaining({ missionId: "escort-b", carrierId: "p3" }),
    ]);
  });

  it("a ship already carrying a rival's Escort marker takes no second one", () => {
    let state = withMissions(table(LANDING, { wellId: BH, ring: 4, sector: 20 }), "p1", [
      escortMission(),
    ]);
    state = withMissions(state, "p2", [deliverMission(ALPHA, GAMMA)]);
    state = withPlayer(state, "p2", {
      cargo: cratesAboard(getPlayer(state, "p2").cargo),
    });
    state = withPlayer(state, "p3", { missions: [escortMission("escort-p3", "p2")] });
    const p2At = positionOf(getPlayer(state, "p2").ship);
    expect(escortCandidates(viewFor(state, "p1"), "p1", p2At)).toEqual([]);
    expectRefused(executeTurnAs(state, coast(1), escortMark(2, "p2")), state);
    // The control: with nobody's marker on it, the same ship takes p1's.
    const free = withPlayer(state, "p3", { missions: [] });
    expect(escortCandidates(viewFor(free, "p1"), "p1", p2At)).toEqual(["p2"]);
    expect(
      getPlayer(executeTurnAs(free, coast(1), escortMark(2, "p2")).gameState, "p1").missions[0]
    ).toMatchObject({ markedPlayerId: "p2" });
  });

  it("a second Escort named on the ship the first one marks places nothing", () => {
    const state = meeting(
      [escortMission("escort-a", "p2"), escortMission("escort-b")],
      [deliverMission(ALPHA, GAMMA)]
    );
    expectRefused(executeTurnAs(state, coast(1), escortMark(2, "p2")), state);
  });

  it.each<[string, string[], Array<string | null>]>([
    ["in seat order", ["p2", "p3"], ["p2", "p3"]],
    ["in the order named", ["p3", "p2"], ["p3", "p2"]],
    ["one of two", ["p3"], ["p3", null]],
  ])("two Escorts on a ring with two carriers, named %s", (_label, named, marks) => {
    const state = twoCarriers([escortMission("escort-a"), escortMission("escort-b")]);
    const result = executeTurnAs(state, coast(1), ...named.map((id, i) => escortMark(i + 2, id)));
    expect(result.errors).toBeUndefined();
    expect(marksOf(result.gameState)).toEqual(marks);
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
    const result = executeTurnAs(state, coast(1), ...named.map((id, i) => escortMark(i + 2, id)));
    expectRefused(result, state);
    expect(result.events).toEqual([]);
    // One Escort in hand marking one rival carrier is taken.
    expectRefusedUnless(
      result,
      executeTurnAs(twoCarriers([escortMission()]), coast(1), escortMark(2, "p2"))
    );
  });

  /** Where p1, the escort, waits while p2 sells at Beta. */
  type Where = (state: GameState) => At;
  const IN_BETA_WELL: Where = () => ({ wellId: BETA, ring: 4, sector: 0 });
  const MOORED_AT_BETA: Where = (state) => berthOf(state, BETA);
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
    if (card.type === "piracy") state = withPlayer(state, "p2", { cargo: [lootOf(card)] });
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
      expect(escort).toEqual([expect.objectContaining({ points: 1 })]);
      expect(escort[0].mission.type).toBe("escort");
      const p1 = getPlayer(result.gameState, "p1");
      expect(p1.points).toBe(1);
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
    state = withPlayer(state, "p2", { cargo: [lootOf(sold)] });
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
    state = withMissions(state, "p1", [
      deliverMission(ALPHA, GAMMA, "deliver-p1"),
      escortMission("escort-1", "p2"),
    ]);
    if (shooter === null) return { state, actions: [] };
    state = withPower(state, shooter, "forward-0", 4);
    return {
      state: { ...state, activePlayerIndex: shooter === "p1" ? 0 : 2 },
      actions: [fire(1, "forward-0", "p2")],
    };
  }
  const p1Card = (state: GameState, id: string) =>
    getPlayer(state, "p1").missions.find((m) => m.id === id)!;

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
  ])("the marker comes back when the marked ship is destroyed by %s", (_label, build) => {
    const { state, actions } = build();
    const result = executeTurnAs(state, ...(actions.length ? actions : [coast(1)]));
    expect(eventsOf(result.events, "ship_destroyed").map((e) => e.victimId)).toEqual(["p2"]);
    expect(eventsOf(result.events, "escort_released")).toEqual([
      expect.objectContaining({
        escortId: "p1",
        carrierId: "p2",
        missionId: "escort-1",
        cause: "carrier_destroyed",
      }),
    ]);
    const card = p1Card(result.gameState, "escort-1");
    expect(card).toMatchObject({ markedPlayerId: null, isCompleted: false });
    expect(unplacedEscorts(getPlayer(result.gameState, "p1").missions)).toEqual([card]);
    for (const viewer of ["p1", "p2", "p3", null]) {
      expect(eventTypes(filterEventsFor(result.events, viewer))).toContain("escort_released");
      expect(viewFor(result.gameState, viewer).players[1].escortedBy).toEqual([]);
    }
    expect(getPlayer(result.gameState, "p1").points).toBe(0);

    // Back in hand, the marker can go on a carrier again.
    const again = executeTurnAs(
      meeting([card], [deliverMission(ALPHA, GAMMA)]),
      coast(1),
      escortMark(2, "p2")
    );
    expect(p1Escort(again.gameState)).toMatchObject({ markedPlayerId: "p2" });
  });

  it("a carrier's death shows the table no card of the escort's", () => {
    const { state, actions } = markedCarrier("p3");
    const result = executeTurnAs(state, ...actions);
    expect(eventTypes(result.events)).toContain("escort_released");
    for (const viewer of ["p2", "p3", null]) {
      const view = viewFor(result.gameState, viewer);
      expect(view.players[0].completedMissions).toEqual([]);
      expect(view.players[0]).not.toHaveProperty("spentMissions");
      const text = JSON.stringify(view);
      expect(text).not.toContain("escort-1");
      expect(text).not.toContain("deliver-p1");
    }
    // The control: the holder sees its own cards.
    expect(JSON.stringify(viewFor(result.gameState, "p1"))).toContain("escort-1");
  });

  it.each<[string, Mission, string, Where]>([
    [
      "a crate to deliver, with the escort in its well",
      deliverMission(ALPHA, BETA),
      "cargo_delivered",
      IN_BETA_WELL,
    ],
    [
      "a Tanker's fuel, with the escort in its well",
      tankerMission("tanker-p2"),
      "fuel_pumped",
      IN_BETA_WELL,
    ],
    [
      "a crate to deliver, with the escort elsewhere",
      deliverMission(ALPHA, BETA),
      "cargo_delivered",
      IN_ALPHA_WELL,
    ],
  ])(
    "a carrier its heat check destroys on arrival with %s sells nothing, and the marker comes back",
    (_label, card, sale, escortAt) => {
      const state = withShip(carrierArrives([card], 0, escortAt), "p2", {
        heat: { currentHeat: 60 },
      });
      const result = executeTurnAs(state, coast(1));
      const types = eventTypes(result.events);
      expect(types).toContain("ship_destroyed");
      expect(types).not.toContain(sale);
      expect(types).not.toContain("docked");
      expect(p1Escort(result.gameState)).toMatchObject({
        isCompleted: false,
        markedPlayerId: null,
      });
      expect(eventsOf(result.events, "escort_released")).toEqual([
        expect.objectContaining({ cause: "carrier_destroyed" }),
      ]);
      expect(getPlayer(result.gameState, "p1").points).toBe(0);
    }
  );

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
      cargo: cratesAboard(getPlayer(state, "p2").cargo),
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
      expect.objectContaining({
        escortId: "p1",
        carrierId: "p2",
        missionId: "escort-1",
        cause: "escort_destroyed",
      }),
    ]);
    const card = p1Escort(result.gameState);
    expect(card).toMatchObject({ markedPlayerId: null, isCompleted: false });
    expect(viewFor(result.gameState, null).players[1].escortedBy).toEqual([]);
    expect(eventTypes(filterEventsFor(result.events, "p3"))).toContain("escort_released");

    // Back in hand, the marker can go on the same ship again.
    const again = executeTurnAs(
      meeting([card], [deliverMission(ALPHA, GAMMA)]),
      coast(1),
      escortMark(2, "p2")
    );
    expect(p1Escort(again.gameState)).toMatchObject({ markedPlayerId: "p2" });
  });

  it("an escort destroyed with two markers out takes both back", () => {
    let state = markedEscort();
    state = withPlayer(state, "p1", {
      missions: [escortMission("escort-a", "p2"), escortMission("escort-b", "p3")],
    });
    const result = executeTurnAs(withShip(state, "p1", { heat: { currentHeat: 30 } }), coast(1));
    expect(eventsOf(result.events, "escort_released").map((e) => [e.missionId, e.cause])).toEqual([
      ["escort-a", "escort_destroyed"],
      ["escort-b", "escort_destroyed"],
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
      cargo: cratesAboard(getPlayer(state, "p3").cargo),
    });
    state = withPlayer(state, "p1", {
      missions: [escortMission("escort-a", "p2"), escortMission("escort-b", "p3")],
    });
    state = withShip({ ...state, activePlayerIndex: 1 }, "p2", {
      hitPoints: 1,
      heat: { currentHeat: 30 },
    });
    const result = executeTurnAs(state, coast(1));
    expect(eventsOf(result.events, "escort_released").map((e) => [e.missionId, e.cause])).toEqual([
      ["escort-a", "carrier_destroyed"],
    ]);
    expect(marksOf(result.gameState)).toEqual([null, "p3"]);
  });
});

describe("a destruction is settled at once, at its place in the sequence", () => {
  /**
   * p1 (`loadout`) at BH R3 S0 coasts onto LANDING, where p2 sits with 1 hull
   * carrying its own Deliver crate; p3 sits there too carrying one when asked.
   */
  function killZone(
    p1Missions: Mission[],
    options: { loadout?: ShipLoadout; p3?: boolean; wrecks?: Wreck[]; p2Hull?: number } = {}
  ): GameState {
    let state = makeGameState([
      makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }, options.loadout ?? LOADOUTS.gunship),
      makePlayer("p2", LANDING),
      ...(options.p3 ? [makePlayer("p3", LANDING)] : []),
    ]);
    state = withMissions(state, "p1", p1Missions);
    for (const id of options.p3 ? ["p2", "p3"] : ["p2"]) {
      state = withMissions(state, id, [deliverMission(ALPHA, GAMMA, `deliver-${id}`)]);
      state = withPlayer(state, id, { cargo: cratesAboard(getPlayer(state, id).cargo) });
    }
    state = withShip(state, "p2", { hitPoints: options.p2Hull ?? 1 });
    return { ...state, wrecks: options.wrecks ?? [] };
  }
  const indexOf = (events: { type: string }[], type: string) =>
    events.findIndex((e) => e.type === type);

  it.each([
    ["a laser shot", [coast(1), fire(2, "side-0", "p2"), salvage(3)]],
    ["a salvo's launch flight", [coast(1), fire(2, "side-3", "p2"), salvage(3)]],
  ])(
    "%s that kills, then a salvage, takes the kill's black box the same turn",
    (_label, actions) => {
      const card = salvageMission();
      const result = executeTurnAs(killZone([card]), ...actions);
      expect(result.errors).toBeUndefined();
      const [left] = eventsOf(result.events, "wreck_left");
      expect(left).toMatchObject({ victimId: "p2", at: LANDING });
      expect(eventsOf(result.events, "wreck_salvaged")).toEqual([
        expect.objectContaining({ playerId: "p1", wreckId: left.wreckId, cargoId: card.cargoId }),
      ]);
      expect(indexOf(result.events, "wreck_left")).toBeLessThan(
        indexOf(result.events, "wreck_salvaged")
      );
      expect(result.gameState.wrecks).toEqual([]);
      expect(getPlayer(result.gameState, "p1").cargo).toEqual([blackBoxOf(card)]);
    }
  );

  it.each<[string, number, ReturnType<typeof coast | typeof fire | typeof salvage>[], number]>([
    ["sequenced before the kill", 1, [coast(1), salvage(2), fire(3, "side-0", "p2")], 1],
    ["after a shot the ship survives", 10, [coast(1), fire(2, "side-0", "p2"), salvage(3)], 0],
    ["with nothing fired and no wreck about", 10, [coast(1), salvage(2)], 0],
  ])(
    "a salvage naming no wreck %s finds none: skipped, not refused",
    (_label, p2Hull, actions, wrecksLeft) => {
      const card = salvageMission();
      const result = executeTurnAs(killZone([card], { p2Hull }), ...actions);
      expect(result.errors).toBeUndefined();
      expect(eventsOf(result.events, "action_skipped")).toEqual([
        expect.objectContaining({ playerId: "p1", action: "salvage", reason: "no_wreck" }),
      ]);
      expect(eventTypes(result.events)).not.toContain("wreck_salvaged");
      expect(result.gameState.wrecks).toHaveLength(wrecksLeft);
      expect(getPlayer(result.gameState, "p1").cargo).toEqual([]);
    }
  );

  it.each<[string, Mission[], ReturnType<typeof coast | typeof fire | typeof salvage>[]]>([
    ["naming none", [salvageMission()], [coast(1), fire(2, "side-0", "p2"), salvage(3)]],
    ["naming it", [salvageMission()], [coast(1), fire(2, "side-0", "p2"), salvage(3, "w")]],
    [
      "twice, with two cards",
      [salvageMission("salvage-a"), salvageMission("salvage-b")],
      [coast(1), fire(2, "side-0", "p2"), salvage(3, "w"), salvage(4)],
    ],
  ])(
    "one wreck a turn: beside a fresh wreck, a salvage %s takes the one that was there first",
    (label, cards, actions) => {
      const state = killZone(cards, { wrecks: [wreckAt("w", LANDING)] });
      const result = executeTurnAs(state, ...actions);
      if (label.startsWith("twice")) {
        expectRefused(result, state);
        return;
      }
      const [left] = eventsOf(result.events, "wreck_left");
      expect(eventsOf(result.events, "wreck_salvaged")).toEqual([
        expect.objectContaining({ wreckId: "w" }),
      ]);
      expect(result.gameState.wrecks.map((w) => w.id)).toEqual([left.wreckId]);
    }
  );

  it.each<[string, ReturnType<typeof fire | typeof scan>, "fire_weapon" | "scan"]>([
    ["a second shot", fire(3, "side-1", "p2"), "fire_weapon"],
    ["a scan", scan(3, "p2"), "scan"],
  ])("%s at the dead ship later in the turn is skipped", (_label, later, action) => {
    const state = killZone([], { loadout: LOADOUTS.sensor });
    const result = executeTurnAs(state, coast(1), fire(2, "side-0", "p2"), later);
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "action_skipped")).toEqual([
      expect.objectContaining({ action, targetId: "p2", reason: "target_destroyed" }),
    ]);
  });

  it("an Escort marker on the dead ship is back in hand for a later Mark the same turn", () => {
    const state = killZone([escortMission("escort-1", "p2")], { p3: true });
    const result = executeTurnAs(state, coast(1), fire(2, "side-0", "p2"), escortMark(3, "p3"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "escort_marked")).toEqual([
      expect.objectContaining({ escortId: "p1", carrierId: "p3", missionId: "escort-1" }),
    ]);
    expect(indexOf(result.events, "escort_released")).toBeLessThan(
      indexOf(result.events, "escort_marked")
    );
    expect(getPlayer(result.gameState, "p1").missions[0]).toMatchObject({ markedPlayerId: "p3" });
  });

  it("the dead ship's crate is back at its pickup before a later Seize: nothing to seize", () => {
    const state = killZone([piracyMission()]);
    const crate = getPlayer(state, "p2").cargo[0];
    const result = executeTurnAs(
      state,
      coast(1),
      fire(2, "side-0", "p2"),
      seize(3, "p2", crate.id)
    );
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "action_skipped")).toEqual([
      expect.objectContaining({ action: "seize", targetId: "p2", reason: "target_destroyed" }),
    ]);
    expect(indexOf(result.events, "cargo_dropped")).toBeLessThan(
      indexOf(result.events, "action_skipped")
    );
    expect(eventTypes(result.events)).not.toContain("cargo_seized");
    expect(getPlayer(result.gameState, "p2").cargo).toEqual([{ ...crate, isPickedUp: false }]);
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([]);
  });
});
