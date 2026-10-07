/**
 * The bot plays every mission card. Each test puts a bot in front of one
 * card's next step and checks it takes it, and that the engine accepts the
 * turn. What the engine does with the step (data aboard, a crate loaded, a
 * sale) is the engine suite's.
 */
import { describe, it, expect } from "vitest";
import type { GameState, Position, Wreck } from "../../models/game.ts";
import { MAX_REACTION_MASS } from "../../models/game.ts";
import type { Cargo, Mission, SurveyMission } from "../../models/missions.ts";
import {
  LOAD_CRATES,
  SELL_FUEL,
  SURVEY_RING,
  TANKER_FUEL,
  dataAboard,
} from "../../models/missions.ts";
import {
  BLACK_HOLE_ID,
  BLACK_HOLE_OUTER_RING,
  STATION_RING,
  laneDepartureArc,
} from "../../models/gravityWells.ts";
import { executeTurn } from "../../game/turns.ts";
import { ringVelocity, wrapSector } from "../../game/geometry.ts";
import { viewFor } from "../../game/view.ts";
import { isMooredAt } from "../../game/stations.ts";
import { botDecideActions } from "../../ai/index.ts";
import { moveOverheats } from "../../ai/planner.ts";
import { planetLane } from "../../ai/behaviors/danger.ts";
import { PATROL_GOAL_ID, REPAIR_GOAL_ID as REPAIR_GOAL } from "../../ai/behaviors/missions.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import {
  LOADOUTS,
  ALPHA,
  BETA,
  BH,
  GAMMA,
  at,
  crateCargo,
  dataCargo,
  deliverMission,
  destroyMission,
  escortMission,
  getPlayer,
  getShip,
  interceptMission,
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
  withSub,
  berthOf,
  blackBoxOf,
  cratesAboard,
  lootOf,
  playUntil,
  shortOfStation,
  situationOf,
} from "../testUtils.ts";

/** The two-point card the seat cannot win without, open and done. */
const PRIMARY = deliverMission(GAMMA, BETA, "primary-p1");
const PRIMARY_DONE: Mission = { ...PRIMARY, isCompleted: true };

/**
 * p1 holds `missions`; p3 is nearer than p2, and p2 is the one carrying (a
 * crate aboard), at `carrier`.
 */
const carrierTable = (
  missions: Mission[],
  carrier: Position = { wellId: BH, ring: 3, sector: 8 }
): GameState => {
  let state = makeGameState([
    makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
    makePlayer("p2", carrier),
    makePlayer("p3", { wellId: BH, ring: 3, sector: 1 }),
  ]);
  state = withMissions(state, "p1", missions);
  state = withMissions(state, "p2", [deliverMission(ALPHA, BETA)]);
  return withPlayer(state, "p2", {
    cargo: cratesAboard(getPlayer(state, "p2").cargo),
  });
};

/** Where a crate seen in Alpha's well is bound: the next planet round the circuit. */
const ALPHA_CRATE_BOUND_FOR = GAMMA;

/** p1's goal for one of its cards, and the goal it is working on, as its bot reads the board. */
const goalFor = (state: GameState, missionId: string) =>
  situationOf(state).goals.find((g) => g.missionId === missionId);
const currentGoal = (state: GameState) => situationOf(state).currentGoal;

describe("bot missions", () => {
  // A sensor bow with an Intercept on p2: the scan is taken where it reaches,
  // after the move that brings it in range, and never across a well.
  it.each<[string, Position, string[]]>([
    ["on its ring and within range", { wellId: BH, ring: 3, sector: 2 }, ["p2"]],
    ["two rings out, after the burn", { wellId: BH, ring: 5, sector: 2 }, ["p2"]],
    ["in another gravity well: no scan", { wellId: ALPHA, ring: 3, sector: 0 }, []],
  ])("scans an Intercept target %s", (_label, target, scanned) => {
    const state = withMissions(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.sensorStarboardLaser },
        target
      ),
      "p1",
      [interceptMission("p2")]
    );
    const decision = botDecideActions(viewFor(state, "p1"));
    const scans = decision.actions.filter((a) => a.type === "scan");
    expect(scans.map((a) => a.data.targetPlayerId)).toEqual(scanned);
    const moves = decision.actions.filter(
      (a) => a.type === "burn" || a.type === "coast" || a.type === "well_transfer"
    );
    for (const scan of scans)
      for (const move of moves) expect(scan.sequence!).toBeGreaterThan(move.sequence!);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("dives to black hole ring 1 for a Survey", () => {
    const start = withMissions(
      makeGameState([
        makePlayer("p1", { wellId: BH, ring: 4, sector: 0 }, LOADOUTS.sensorPortLaser),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ]),
      "p1",
      [surveyMission()]
    );

    const acquired = (s: GameState) =>
      dataAboard(getPlayer(s, "p1"), getPlayer(s, "p1").missions[0] as SurveyMission);
    const state = playUntil(start, "p1", acquired, 60);

    expect(acquired(state)).toBe(true);
  });

  it("at its pickup loads the crate, keeping a Tanker's fuel, and turns for the delivery planet", () => {
    // A visit does one thing, and the pickup is the Deliver's: the fuel waits
    // for another station.
    const start = withShip(
      withMissions(
        shortOfStation(
          makeGameState([
            makePlayer("p1"),
            makePlayer("p2", { wellId: GAMMA, ring: 3, sector: 12 }),
          ]),
          "p1",
          ALPHA
        ),
        "p1",
        [deliverMission(ALPHA, BETA), tankerMission()]
      ),
      "p1",
      { reactionMass: MAX_REACTION_MASS }
    );

    const actions = botDecideActions(viewFor(start, "p1")).actions;
    expect(actions.find((a) => a.type === "dock_sale")?.data).toEqual({ sale: LOAD_CRATES });
    const docked = executeTurn(start, actions);
    expect(docked.errors).toBeUndefined();
    expect(currentGoal(docked.gameState)).toMatchObject({ planetId: BETA });
  });

  it("stops surveying once the data is aboard and files it at the station the circuit reaches first", () => {
    // Survey data is filed anywhere (the deck deals every survey card with
    // "any" for its station) so the bot takes the door it is
    // already standing under. From black hole ring 1 sector 0 that is Beta's
    // outbound lane at ring 5 sectors 0-3, not Alpha's at 16-19.
    const start = withMissions(
      makeGameState([
        makePlayer(
          "p1",
          { wellId: BLACK_HOLE_ID, ring: SURVEY_RING, sector: 0 },
          LOADOUTS.sensorPortLaser
        ),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ]),
      "p1",
      [surveyMission("survey-1")]
    );

    const completed = (s: GameState) => getPlayer(s, "p1").points > 0;
    const state = playUntil(start, "p1", completed, 120);
    expect(completed(state)).toBe(true);
    expect(getShip(state, "p1").wellId).toBe(BETA);
  });
});

describe("bot goals: piracy and tanker", () => {
  const table = carrierTable;

  it("counts data as loot: a ship carrying only data is prey", () => {
    const card = piracyMission();
    const state = table([card]);
    const dataOnly = withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, kind: "data" as const })),
    });
    expect(goalFor(dataOnly, card.id)).toMatchObject({ type: "pirate", targetPlayerId: "p2" });
  });

  it("has nobody to chase while every hold at the table is empty", () => {
    const card = piracyMission();
    const state = table([card]);
    const empty = withPlayer(state, "p2", {
      cargo: getPlayer(state, "p2").cargo.map((c) => ({ ...c, isPickedUp: false })),
    });
    expect(goalFor(empty, card.id)).toBeUndefined();
  });

  it.each([
    ["too little to arrive with the fuel", TANKER_FUEL - 1, "tanker"],
    ["enough to arrive with the fuel", MAX_REACTION_MASS, "dock"],
  ])("a tanker with %s heads for the %s", (_label, reactionMass, type) => {
    const card = tankerMission();
    const state = withShip(table([card]), "p1", { reactionMass });
    expect(goalFor(state, card.id)).toMatchObject({ type });
  });

  // While the two-point card somebody else set the seat is still open the
  // Tanker makes no trip of its own: it is the fuel held back on the trips the
  // seat is already making, and a station in the well the ship is already in.
  describe("the tanker waits for the primary", () => {
    it.each([
      ["a tank that could not pump", 3],
      ["the fuel and the approach aboard", MAX_REACTION_MASS],
    ])("makes no trip of its own with %s while the primary is open", (_label, reactionMass) => {
      const card = tankerMission();
      const state = withShip(table([card, PRIMARY]), "p1", { reactionMass });
      expect(goalFor(state, card.id)).toBeUndefined();
      expect(currentGoal(state)?.missionId).toBe(PRIMARY.id);
    });

    // ALPHA ring 1 is a berth away from its station: the fastest route burns
    // the tank down to one and pumps nothing, and one turn longer arrives with
    // seven. A station buys one item, so the reserve rides only on a trip whose
    // visit may sell the fuel: a repair stop or a pickup, where loading is no
    // sale.
    const berth = (missions: Mission[], broken: boolean): GameState => {
      const start = makeGameState([
        makePlayer("p1", { wellId: ALPHA, ring: 1, sector: 0 }),
        makePlayer("p2", { wellId: BH, ring: 3, sector: 12 }),
      ]);
      const state = withShip(withMissions(start, "p1", missions), "p1", {
        reactionMass: MAX_REACTION_MASS,
      });
      return broken ? withSub(state, "p1", "side-0", { isBroken: true }) : state;
    };
    const fetch = deliverMission(ALPHA, BETA, "fetch-p1");

    it("pumps in the well it is in, with the primary open, and repairs on the same visit", () => {
      const hunt = destroyMission("p2");
      const card = tankerMission();
      const tanking = currentGoal(berth([hunt, card], true));
      const plain = currentGoal(berth([hunt], true));
      expect(tanking).toMatchObject({ missionId: card.id, dockSale: SELL_FUEL, repairs: true });
      expect(plain?.missionId).toBe(REPAIR_GOAL);
      // The fuel still aboard when it makes port, which is what pumps.
      expect(MAX_REACTION_MASS - tanking!.plan!.totalMassCost).toBeGreaterThanOrEqual(TANKER_FUEL);
      expect(MAX_REACTION_MASS - plain!.plan!.totalMassCost).toBeLessThan(TANKER_FUEL);
      expect(tanking!.plan!.totalTurns).toBeGreaterThan(plain!.plan!.totalTurns);
    });

    it("repairs on the pickup trip when the pickup's station is the nearest", () => {
      expect(currentGoal(berth([fetch], true))).toMatchObject({
        missionId: fetch.id,
        repairs: true,
      });
    });

    it("takes the fast route to a pickup, whose visit loads and pumps nothing", () => {
      const tanking = currentGoal(berth([fetch, tankerMission()], false));
      const plain = currentGoal(berth([fetch], false));
      expect(tanking).toMatchObject({ missionId: fetch.id, dockSale: LOAD_CRATES });
      expect(tanking!.plan!.totalTurns).toBe(plain!.plan!.totalTurns);
      expect(tanking!.plan!.totalMassCost).toBe(plain!.plan!.totalMassCost);
    });

    it("takes the fast route to deliver, whose visit sells the crate", () => {
      const inHand = (missions: Mission[]) => {
        const state = berth(missions, false);
        return withPlayer(state, "p1", {
          cargo: cratesAboard(getPlayer(state, "p1").cargo),
        });
      };
      const bound = deliverMission(BETA, ALPHA, "bound-p1");
      const tanking = currentGoal(inHand([bound, tankerMission()]));
      const plain = currentGoal(inHand([bound]));
      expect(tanking).toMatchObject({ missionId: bound.id, dockSale: bound.cargoId });
      expect(tanking!.plan!.totalTurns).toBe(plain!.plan!.totalTurns);
      expect(tanking!.plan!.totalMassCost).toBe(plain!.plan!.totalMassCost);
    });

    it("fills at the nearest fast ring, not the event horizon, once the primary is in", () => {
      const card = tankerMission();
      const start = makeGameState([
        makePlayer("p1", { wellId: BH, ring: BLACK_HOLE_OUTER_RING, sector: 0 }),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ]);
      const state = withShip(withMissions(start, "p1", [card, PRIMARY_DONE]), "p1", {
        reactionMass: 3,
      });

      const goal = currentGoal(state);
      expect(goal?.missionId).toBe(card.id);
      const destination = goal?.plan?.destination;
      expect(destination?.wellId).toBe(BH);
      expect(destination?.ring).not.toBe(SURVEY_RING);
      expect(ringVelocity(BH, destination!.ring)).toBeGreaterThanOrEqual(4);
    });
  });
});

// Piracy and Escort both want a carrier: the same chase, the same patience.
// A chase across the map never closes: the crate is already running for a
// station and the lanes are one-way.
describe("bot goals: chasing a carrier", () => {
  const CARDS = [
    { card: piracyMission(), type: "pirate" },
    { card: escortMission(), type: "escort" },
  ];

  // The primary is in, so no chase is a detour from it; p3 is nearer and empty.
  it.each(
    CARDS.flatMap(({ card, type }) => [
      { card, type, where: "two turns off", carrier: at(3, 6), turns: 3, urgency: 2 },
      { card, type, where: "six turns off", carrier: at(1, 12), turns: 7, urgency: 0 },
    ])
  )(
    "$type chases the carrier $where, not the nearer ship, at urgency $urgency",
    ({ card, type, carrier, turns, urgency }) => {
      expect(goalFor(carrierTable([card, PRIMARY_DONE], carrier), card.id)).toMatchObject({
        type,
        targetPlayerId: "p2",
        estimatedTurns: turns,
        urgency,
      });
    }
  );

  // A carrier in another well: left alone while the primary is open, waited
  // for where its crate must arrive once it is in.
  it.each(CARDS)(
    "$type waits at the carrier's next station only once the primary is in",
    ({ card, type }) => {
      const carrier = at(3, 0, ALPHA);
      expect(goalFor(carrierTable([card, PRIMARY], carrier), card.id)).toBeUndefined();
      const goal = goalFor(carrierTable([card, PRIMARY_DONE], carrier), card.id);
      expect(goal).toMatchObject({ type, planetId: ALPHA_CRATE_BOUND_FOR });
      expect(goal?.targetPlayerId).toBeUndefined();
    }
  );

  it.each<[string, Mission, Cargo]>([
    ["seized loot", piracyMission(), lootOf(piracyMission())],
    ["a wreck's black box", salvageMission(), blackBoxOf(salvageMission())],
  ])("turns for a station once %s is aboard", (_label, card, item) => {
    const state = withPlayer(carrierTable([card, PRIMARY]), "p1", { cargo: [item] });
    expect(goalFor(state, card.id)).toMatchObject({ type: "dock" });
  });
});

describe("bot goals: salvage and escort", () => {
  /** A ring out and six sectors ahead of p1: a few turns off. */
  const NEAR_WRECK: Wreck = { id: "wreck-1", wellId: BH, ring: 4, sector: 6 };
  /** Across the hole on the fastest ring: more than a turn off, and it drifts eight a round. */
  const FAST_WRECK: Wreck = { id: "wreck-fast", wellId: BH, ring: 1, sector: 12 };

  const salvageTable = (missions: Mission[], wrecks: Wreck[] = [NEAR_WRECK]): GameState => {
    const state = makeGameState(
      [
        makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
        makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
      ],
      { wrecks }
    );
    return withMissions(state, "p1", missions);
  };

  describe("salvage", () => {
    it("plans for where the wreck will have drifted to, not where it lies", () => {
      const card = salvageMission();
      const goal = currentGoal(salvageTable([card, PRIMARY_DONE], [FAST_WRECK]));
      expect(goal).toMatchObject({ type: "salvage", missionId: card.id, wreckId: FAST_WRECK.id });
      // Three turns, the wreck advancing eight a round after the first: S12 to S28, which is S4.
      expect(goal!.plan).toMatchObject({
        totalTurns: 3,
        destination: { wellId: BH, ring: 1, sector: 4 },
      });
    });

    it("takes the wreck's black box and files it at a station", () => {
      const card = salvageMission();
      const start = withShip(salvageTable([card, PRIMARY_DONE]), "p1", {
        reactionMass: MAX_REACTION_MASS,
      });
      const filed = (s: GameState) =>
        getPlayer(s, "p1").missions.some((m) => m.id === card.id && m.isCompleted);
      expect(filed(playUntil(start, "p1", filed, 120))).toBe(true);
    });

    it("files a black box taken at a berth at another station: docking is arrival only", () => {
      const card = salvageMission();
      const base = salvageTable([card, PRIMARY], []);
      const state = withPlayer(withShip(base, "p1", berthOf(base, ALPHA)), "p1", {
        cargo: [blackBoxOf(card)],
      });
      const goal = goalFor(state, card.id);
      expect(goal).toMatchObject({ type: "dock" });
      expect(goal?.planetId).not.toBe(ALPHA);
    });

    it.each([
      ["a delivery crate", crateCargo(ALPHA, BETA)],
      ["another Salvage card's black box", dataCargo("salvage-other", "salvage-other")],
    ])("goes for a wreck while the hold carries %s: the box rides free", (_label, cargo) => {
      const card = salvageMission();
      const state = withPlayer(salvageTable([card, PRIMARY_DONE]), "p1", { cargo: [cargo] });
      expect(goalFor(state, card.id)).toMatchObject({ type: "salvage", wreckId: NEAR_WRECK.id });
    });

    // Before the primary is in, a wreck is worth the pirate's half a well and
    // no more; after it, anywhere on the board.
    it.each([
      { where: "near", wreck: NEAR_WRECK, primary: PRIMARY, goal: true },
      {
        where: "in another well",
        wreck: { id: "wreck-far", wellId: ALPHA, ring: 3, sector: 12 },
        primary: PRIMARY,
        goal: false,
      },
      {
        where: "in another well",
        wreck: { id: "wreck-far", wellId: ALPHA, ring: 3, sector: 12 },
        primary: PRIMARY_DONE,
        goal: true,
      },
    ])(
      "a wreck $where with the primary done: $primary.isCompleted, goal: $goal",
      ({ wreck, primary, goal }) => {
        const card = salvageMission();
        const found = goalFor(salvageTable([card, primary], [wreck]), card.id);
        if (goal) expect(found).toMatchObject({ type: "salvage", wreckId: wreck.id });
        else expect(found).toBeUndefined();
      }
    );

    it("goes for a wreck under a station: a moored ship salvages", () => {
      const card = salvageMission();
      const base = salvageTable([card, PRIMARY_DONE], []);
      const state = { ...base, wrecks: [{ id: "wreck-berth", ...berthOf(base, ALPHA) }] };
      expect(goalFor(state, card.id)).toMatchObject({ type: "salvage", wreckId: "wreck-berth" });
    });

    it("is no pirate's prey: a wreck is not a carrier", () => {
      const card = piracyMission();
      expect(goalFor(salvageTable([card, PRIMARY_DONE]), card.id)).toBeUndefined();
    });
  });

  describe("escort", () => {
    const table = carrierTable;

    it.each([
      ["its marker is already out", [escortMission("escort-1", "p3")], "escort-1"],
      [
        "its other Escort already marks the only carrier",
        [escortMission("escort-1", "p2"), escortMission("escort-2")],
        "escort-2",
      ],
      [
        "the only carrier is its Destroy target",
        [escortMission(), destroyMission("p2")],
        "escort-1",
      ],
    ])("has nobody to escort when %s", (_label, missions, missionId) => {
      expect(goalFor(table(missions), missionId)).toBeUndefined();
    });

    describe("rides along once its marker is out", () => {
      /** p1's marker on p2, who has a crate aboard; both where the row puts them. */
      const riding = (me: Position, carrier: Position, primary: Mission = PRIMARY_DONE) => {
        let state = makeGameState([makePlayer("p1", me), makePlayer("p2", carrier)]);
        state = withMissions(state, "p1", [escortMission("escort-1", "p2"), primary]);
        state = withMissions(state, "p2", [deliverMission(ALPHA, BETA)]);
        state = withPlayer(state, "p2", {
          cargo: cratesAboard(getPlayer(state, "p2").cargo),
        });
        return withShip(state, "p1", { reactionMass: MAX_REACTION_MASS });
      };
      const wellOf = (state: GameState) => getShip(state, "p1").wellId;

      it("heads into the well of a carrier in a planet well", () => {
        const start = riding(
          { wellId: BH, ring: 3, sector: 0 },
          { wellId: ALPHA, ring: 3, sector: 0 }
        );
        const goal = currentGoal(start);
        expect(goal).toMatchObject({ type: "escort", missionId: "escort-1", targetPlayerId: "p2" });
        expect(goal?.plan?.destination.wellId).toBe(ALPHA);
        const arrived = playUntil(start, "p1", (s) => wellOf(s) === ALPHA, 30);
        expect(wellOf(arrived)).toBe(ALPHA);
      });

      it("stays in the carrier's well once there, coasting", () => {
        const start = riding(
          { wellId: ALPHA, ring: 3, sector: 0 },
          { wellId: ALPHA, ring: 4, sector: 12 }
        );
        const moves = botDecideActions(viewFor(start, "p1")).actions.filter(
          (a) => a.type === "coast" || a.type === "burn" || a.type === "well_transfer"
        );
        expect(moves.map((a) => a.type)).toEqual(["coast"]);
        const later = playUntil(start, "p1", (s) => wellOf(s) !== ALPHA, 12);
        expect(wellOf(later)).toBe(ALPHA);
      });

      // A ride is a side goal: it may delay the primary's next step by a turn
      // at most. A trip to Alpha delays a pickup at Gamma by more, and so does
      // waiting in Alpha for a carrier whose crate is a long run from its
      // station: a ride costs the wait, not just the trip.
      it.each([
        {
          from: "the black hole",
          me: { wellId: BH, ring: 3, sector: 0 },
          primary: PRIMARY,
          goal: false,
        },
        {
          from: "the black hole",
          me: { wellId: BH, ring: 3, sector: 0 },
          primary: PRIMARY_DONE,
          goal: true,
        },
        {
          from: "its well",
          me: { wellId: ALPHA, ring: 3, sector: 0 },
          primary: PRIMARY,
          goal: false,
        },
        {
          from: "its well",
          me: { wellId: ALPHA, ring: 3, sector: 0 },
          primary: PRIMARY_DONE,
          goal: true,
        },
      ])(
        "from $from with the primary done: $primary.isCompleted, rides: $goal",
        ({ me, primary, goal }) => {
          const state = riding(me as Position, { wellId: ALPHA, ring: 3, sector: 12 }, primary);
          const found = goalFor(state, "escort-1");
          if (goal) expect(found).toMatchObject({ type: "escort", targetPlayerId: "p2" });
          else expect(found).toBeUndefined();
        }
      );
    });

    it("puts its marker on a carrier drifting in the same well", () => {
      const card = escortMission();
      const start = withShip(table([card]), "p1", { reactionMass: MAX_REACTION_MASS });
      const markedBy = (state: GameState) =>
        viewFor(state, "p3").players.find((p) => p.id === "p2")?.escortedBy ?? [];
      const marked = playUntil(start, "p1", (state) => markedBy(state).length > 0, 30);
      expect(markedBy(marked)).toEqual(["p1"]);
    });

    /**
     * p1 can only coast (engines broken): BH ring 3 drifts it from S0 to S4,
     * where every ship in `carriers` sits with a crate aboard.
     */
    const besideCarriers = (missions: Mission[], carriers: string[]): GameState => {
      let state = makeGameState([
        makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
        makePlayer("p2", { wellId: BH, ring: 3, sector: 4 }),
        makePlayer("p3", { wellId: BH, ring: 3, sector: 4 }),
      ]);
      state = withMissions(state, "p1", missions);
      state = withSub(state, "p1", "engines", { isBroken: true });
      for (const id of carriers) {
        state = withMissions(state, id, [deliverMission(ALPHA, BETA, `deliver-${id}`)]);
        state = withPlayer(state, id, {
          cargo: cratesAboard(getPlayer(state, id).cargo),
        });
      }
      return state;
    };

    it.each<[string, Mission[], string[], string[]]>([
      ["a carrier it ends its turn beside", [escortMission()], ["p2"], ["p2"]],
      [
        "nobody when that carrier is its Destroy target",
        [escortMission(), destroyMission("p2")],
        ["p2"],
        [],
      ],
      [
        "the other carrier beside its Destroy target",
        [escortMission(), destroyMission("p2")],
        ["p2", "p3"],
        ["p3"],
      ],
      [
        "one carrier per marker in hand",
        [escortMission("escort-a"), escortMission("escort-b")],
        ["p2", "p3"],
        ["p2", "p3"],
      ],
      ["nobody with its marker already out", [escortMission("escort-1", "p3")], ["p2"], []],
    ])("declares an Escort marker for %s", (_label, missions, carriers, marked) => {
      const state = besideCarriers(missions, carriers);
      const actions = botDecideActions(viewFor(state, "p1")).actions;
      expect(actions.flatMap((a) => (a.type === "escort_mark" ? [a.data.carrierId] : []))).toEqual(
        marked
      );
      const result = executeTurn(state, actions);
      expect(result.errors).toBeUndefined();
    });
  });
});

describe("goal order: the primary before the secondary", () => {
  /**
   * Three points win and the hand is one two-point primary plus two one-point
   * secondaries, so the primary is the only card the bot cannot do without.
   * Its first step (the Intercept's scan, the Deliver's pickup) is what used
   * to rank last: it finishes nothing by itself, while a survey dive is short
   * and a whole point. Ranking is cheapest-first after urgency, so at equal
   * distance the primary's opening step now goes first, and only a genuinely
   * longer trip (more than the urgency's three turns) sends the bot to the
   * secondary.
   *
   * Every fixture lists the survey card first, so a sort that ignored urgency
   * would leave the survey at the head of the list.
   */
  const goalsFor = (state: GameState) => situationOf(state).goals;

  const goalOf = (state: GameState, missionId: string) => {
    const goal = goalsFor(state).find((g) => g.missionId === missionId);
    if (!goal) throw new Error(`no goal for ${missionId}`);
    return goal;
  };

  describe("Intercept's scan against a survey dive", () => {
    const SURVEY = surveyMission();
    const INTERCEPT = interceptMission("p2");

    /** p1 three rings above the survey ring, with the scan target where the row says. */
    const shadowing = (target: Position): GameState =>
      withMissions(
        makeGameState([
          makePlayer("p1", { wellId: BH, ring: 4, sector: 0 }, LOADOUTS.sensorPortLaser),
          makePlayer("p2", target),
        ]),
        "p1",
        [SURVEY, INTERCEPT]
      );

    it.each([
      {
        where: "as near as the dive",
        target: { wellId: BH, ring: 2, sector: 0 } as Position,
        gap: 0,
        first: "the scan",
        firstId: INTERCEPT.id,
      },
      {
        where: "five turns past it",
        target: { wellId: BH, ring: 1, sector: 12 } as Position,
        gap: 5,
        first: "the dive",
        firstId: SURVEY.id,
      },
    ])("with the target $where, pursues $first first", ({ target, gap, firstId }) => {
      const state = shadowing(target);
      const shadow = goalOf(state, INTERCEPT.id);
      const dive = goalOf(state, SURVEY.id);
      expect(shadow.type).toBe("shadow");
      expect(shadow.estimatedTurns - dive.estimatedTurns).toBe(gap);
      expect(goalsFor(state)[0].missionId).toBe(firstId);
    });
  });

  describe("Deliver's pickup against a survey dive", () => {
    const SURVEY = surveyMission();

    /** p1 on black hole ring 5, four turns from the dive and from Alpha's berth. */
    const fetching = (pickupPlanetId: string, deliveryPlanetId: string): GameState =>
      withMissions(
        makeGameState([
          makePlayer("p1", { wellId: BH, ring: 5, sector: 13 }, LOADOUTS.sensorPortLaser),
          makePlayer("p2", { wellId: ALPHA, ring: 3, sector: 12 }),
        ]),
        "p1",
        [SURVEY, deliverMission(pickupPlanetId, deliveryPlanetId)]
      );

    it.each([
      {
        where: "as near as the dive",
        pickup: ALPHA,
        delivery: BETA,
        gap: 0,
        first: "the pickup",
        pickupFirst: true,
      },
      {
        where: "six turns past it",
        pickup: GAMMA,
        delivery: ALPHA,
        gap: 6,
        first: "the dive",
        pickupFirst: false,
      },
    ])("with the pickup $where, pursues $first first", ({ pickup, delivery, gap, pickupFirst }) => {
      const state = fetching(pickup, delivery);
      const deliver = deliverMission(pickup, delivery);
      const fetch = goalOf(state, deliver.id);
      const dive = goalOf(state, SURVEY.id);
      expect(fetch.type).toBe("dock");
      expect(fetch.estimatedTurns - dive.estimatedTurns).toBe(gap);
      expect(goalsFor(state)[0].missionId).toBe(pickupFirst ? deliver.id : SURVEY.id);
    });
  });
});

describe("bot fuel in port", () => {
  /** p1 moored at ALPHA's station with `fuel` aboard, a delivery due at BETA. */
  const inPort = (fuel: number): GameState => {
    const state = makeGameState([
      makePlayer("p1", berthOf(makeTwoPlayerGame(), ALPHA)),
      makePlayer("p2", { wellId: BH, ring: 5, sector: 12 }),
    ]);
    return withShip(withMissions(state, "p1", [deliverMission(GAMMA, BETA)]), "p1", {
      reactionMass: fuel,
    });
  };

  it("fills the tank in port rather than leave on an empty one", () => {
    // A berth is as good a place to skim from as any, and a dry ship that cast
    // off would only have to come back (RULES §Stations).
    const state = withPower(inPort(0), "p1", "scoop", 3);
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.some((a) => a.type === "coast" && a.data.activateScoop)).toBe(true);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("does not hold a berth it has already docked at once the tank is full", () => {
    // Docking resolved on arrival, so the berth has nothing left to give: with
    // fuel aboard and a mission elsewhere, the bot leaves.
    const state = inPort(10);
    const result = executeTurn(state, botDecideActions(viewFor(state, "p1")).actions);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").ring).not.toBe(STATION_RING);
  });
});

describe("bot heat on a station approach", () => {
  // The heat check comes before the dock (RULES §A Turn): an arrival pays its
  // heat from the hull it has and the dock refills it, so only a check that
  // would destroy the ship rules the move out. Off a station the bot keeps three.
  it.each<[string, number, number, number, boolean, boolean]>([
    // label, hull, heat, engine cubes, arrives, too hot
    ["an arrival left with 2 hull", 5, 12, 1, true, false],
    ["the same burn going nowhere", 5, 12, 1, false, true],
    ["an arrival left with 1 hull", 4, 12, 1, true, false],
    ["an arrival the check destroys", 3, 12, 1, true, true],
    ["a cool burn", 2, 5, 3, false, false],
  ])("%s", (_label, hull, heat, engine, arrives, tooHot) => {
    expect(moveOverheats(hull, heat, engine, arrives)).toBe(tooHot);
  });

  /**
   * p1 on Alpha ring 3, facing retrograde, two sectors short of the station:
   * a soft burn inward (one cube) lands on it. Its pickup is there.
   */
  const hotApproach = (hull: number, sectorsShort = 2): GameState => {
    let state = makeGameState([
      makePlayer("p1"),
      makePlayer("p2", { wellId: GAMMA, ring: 3, sector: 12 }),
    ]);
    const berth = berthOf(state, ALPHA);
    state = withShip(state, "p1", {
      wellId: ALPHA,
      ring: 3,
      sector: wrapSector(berth.sector - sectorsShort),
      facing: "retrograde",
      hitPoints: hull,
      heat: { currentHeat: 12 },
    });
    return withMissions(state, "p1", [deliverMission(ALPHA, BETA)]);
  };

  it.each<[string, number, number, boolean]>([
    // label, hull, sectors short, docks
    ["burns onto the station with 5 hull: the check leaves 2 and the dock refills it", 5, 2, true],
    ["coasts with 3 hull rather than burn onto the station and die at the check", 3, 2, false],
    ["coasts with 5 hull when the burn arrives nowhere", 5, 8, false],
  ])("%s", (_label, hull, short, docks) => {
    const state = hotApproach(hull, short);
    const actions = botDecideActions(viewFor(state, "p1")).actions;
    expect(actions.some((a) => a.type === "burn")).toBe(docks);
    const result = executeTurn(state, actions);
    expect(result.errors).toBeUndefined();
    const types = result.events.map((e) => e.type);
    expect(types).not.toContain("ship_destroyed");
    expect(types.includes("docked")).toBe(docks);
    if (docks) expect(getShip(result.gameState, "p1").hitPoints).toBe(10);
  });
});

describe("bot turn handling", () => {
  it("returns no actions for a spectator view", () => {
    const state = makeTwoPlayerGame();
    expect(botDecideActions(viewFor(state, null)).actions).toEqual([]);
  });

  it("returns no actions while destroyed, which the engine takes as the respawn", () => {
    const state = withShip(
      makeGameState([
        makePlayer("p1", { wellId: BH, ring: 3, sector: 0 }),
        makePlayer("p2", { wellId: BH, ring: 3, sector: 12 }),
      ]),
      "p1",
      { hitPoints: 0 }
    );

    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions).toEqual([]);
    expect(decision.log.candidates).toEqual([]);

    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });
});

describe("bot goals: patrol", () => {
  const DONE: Mission = { ...deliverMission(GAMMA, BETA, "primary-p1"), isCompleted: true };

  /** p1 at `from` with nothing to do; the rivals at `rivals`, holds empty. */
  const idle = (from: Position, rivals: Position[]): GameState =>
    makeGameState([
      makePlayer("p1", from),
      ...rivals.map((pos, i) => makePlayer(`p${i + 2}`, pos)),
    ]);

  it.each([
    { label: "two on ring 3, one on 4", rivals: [at(3, 8), at(3, 10), at(4, 16)], ring: 3 },
    { label: "two on ring 4, one on 3", rivals: [at(4, 8), at(4, 10), at(3, 16)], ring: 4 },
    { label: "one on ring 3, one on 4", rivals: [at(3, 8), at(4, 16)], ring: 3 },
    { label: "one on ring 2, one on 4", rivals: [at(2, 8), at(4, 16)], ring: 2 },
  ])("heads for the ring the rivals are on: $label", ({ rivals, ring }) => {
    const { currentGoal } = situationOf(idle(at(5, 0), rivals));
    expect(currentGoal).toMatchObject({ type: "patrol", missionId: PATROL_GOAL_ID });
    expect(currentGoal?.plan?.destination).toMatchObject({ wellId: BH, ring });
  });

  it("heads for black hole ring 3 from a planet well and never docks on the way", () => {
    const end = playUntil(
      idle({ wellId: ALPHA, ring: 3, sector: 0 }, [at(3, 8), at(3, 16)]),
      "p1",
      () => false,
      45,
      {
        after: (s, i) => expect(isMooredAt(s.stations, getShip(s, "p1")), `turn ${i}`).toBe(false),
      }
    );
    expect(getShip(end, "p1")).toMatchObject({ wellId: BH, ring: 3 });
  });

  it.each([9, 12, 18])(
    "coasts on the patrol ring with the rivals %i sectors off, turn after turn",
    (sector) => {
      playUntil(idle(at(3, 0), [at(3, sector), at(3, sector + 1)]), "p1", () => false, 9, {
        after: (s) => expect(getShip(s, "p1")).toMatchObject({ wellId: BH, ring: 3 }),
        before: (s, actions) => {
          expect(situationOf(s).currentGoal?.missionId).toBe(PATROL_GOAL_ID);
          expect(actions.some((a) => a.type === "burn" || a.type === "well_transfer")).toBe(false);
        },
      });
    }
  );

  it.each([
    { label: "from ring 5 with every rival at a planet", from: at(5, 0), destroyed: false },
    {
      label: "from a planet well with every rival at a planet",
      from: { wellId: BETA, ring: 3, sector: 0 },
      destroyed: false,
    },
    { label: "from ring 5 with every rival destroyed", from: at(5, 0), destroyed: true },
  ])("heads into the black hole $label", ({ from, destroyed }) => {
    let state = idle(from, [
      { wellId: ALPHA, ring: 3, sector: 0 },
      { wellId: GAMMA, ring: 4, sector: 6 },
    ]);
    if (destroyed) {
      state = withShip(withShip(state, "p2", { hitPoints: 0 }), "p3", { hitPoints: 0 });
    }
    const { currentGoal } = situationOf(state);
    expect(currentGoal).toMatchObject({ type: "patrol", missionId: PATROL_GOAL_ID });
    expect(currentGoal?.plan?.destination).toMatchObject({ wellId: BH, ring: 3 });
  });

  it.each([
    {
      label: "a broken subsystem",
      broken: (s: GameState) => withSub(s, "p1", "side-0", { isBroken: true }),
    },
    {
      label: "a hull at the repair threshold",
      broken: (s: GameState) =>
        withShip(s, "p1", { hitPoints: DEFAULT_BOT_PARAMETERS.repairHullThreshold }),
    },
  ])("repairs rather than patrol with $label", ({ broken }) => {
    const { currentGoal, goals } = situationOf(broken(idle(at(3, 0), [at(3, 8), at(3, 16)])));
    expect(currentGoal?.missionId).toBe(REPAIR_GOAL);
    expect(goals.some((g) => g.missionId === PATROL_GOAL_ID)).toBe(false);
  });

  // The primary is in and a secondary chases carriers: a carrier in another
  // well is waited for where it must arrive, and only an empty table leaves
  // the bot nothing to do but patrol.
  it.each([
    { card: piracyMission(), type: "pirate" },
    { card: escortMission(), type: "escort" },
  ])("patrols with a $type card only while nobody carries", ({ card, type }) => {
    const table = (carrying: boolean): GameState => {
      const state = withMissions(idle(at(3, 0), [{ wellId: ALPHA, ring: 3, sector: 0 }]), "p1", [
        card,
        DONE,
      ]);
      return carrying
        ? withPlayer(state, "p2", { cargo: [dataCargo("data-p2", "survey-p2")] })
        : state;
    };
    expect(situationOf(table(true)).currentGoal).toMatchObject({ type, missionId: card.id });
    expect(situationOf(table(false)).currentGoal).toMatchObject({
      type: "patrol",
      missionId: PATROL_GOAL_ID,
    });
  });
});

// A side goal is taken only when it delays the primary's next step by a turn
// at most: on the way is fine, across the well is not.
describe("bot goals: the primary first", () => {
  const FILE = interceptMission("p3", "intercept-p1", ALPHA);
  const ESCORT = escortMission();
  // Four turns of drift short of Alpha's door on black hole ring 5.
  const lane = laneDepartureArc(planetLane(ALPHA, "outbound")!);
  const sector = (lane.startSector + 24 - 12) % 24;

  const table = (carrier: Position, scanned = true): GameState => {
    let state = makeGameState([
      // A sensor bow: the Intercept's scan is a step it can take.
      makePlayer(
        "p1",
        { wellId: BH, ring: BLACK_HOLE_OUTER_RING, sector },
        LOADOUTS.sensorStarboardLaser
      ),
      makePlayer("p2", carrier),
      makePlayer("p3", { wellId: GAMMA, ring: 3, sector: 0 }),
    ]);
    state = withMissions(state, "p1", [FILE, ESCORT]);
    state = withPlayer(state, "p1", { cargo: scanned ? [takenData(FILE)] : [] });
    state = withMissions(state, "p2", [deliverMission(ALPHA, BETA)]);
    return withPlayer(state, "p2", {
      cargo: cratesAboard(getPlayer(state, "p2").cargo),
    });
  };

  it.each([
    ["files first past a carrier across the well", { wellId: BH, ring: 1, sector }, true, FILE.id],
    [
      "marks a carrier in its own sector on the way",
      { wellId: BH, ring: 5, sector },
      true,
      ESCORT.id,
    ],
    [
      "goes for the scan first past a carrier across the well",
      { wellId: BH, ring: 1, sector },
      false,
      FILE.id,
    ],
  ])("%s", (_label, carrier, scanned, missionId) => {
    expect(currentGoal(table(carrier as Position, scanned))?.missionId).toBe(missionId);
  });
});
