/**
 * Loadout phase. `botChooseLoadout` keeps exactly a hand of the offered cards
 * and returns a hull the engine will accept, deterministically.
 */
import { describe, it, expect } from "vitest";
import type { Mission } from "../../models/missions.ts";
import {
  MISSIONS_PER_PLAYER,
  PRIMARIES_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  isPrimaryType,
} from "../../models/missions.ts";
import { missionsMissingRequirements, validateLoadout } from "../../game/loadout.ts";
import { createGame, submitLoadout } from "../../game/setup.ts";
import { botChooseLoadout } from "../../ai/index.ts";
import type { ShipLoadout } from "../../models/game.ts";
import type { BotArchetype } from "../../ai/behaviors/loadout.ts";
import {
  BOT_LOADOUT_TEMPLATES,
  classifyArchetype,
  validHands,
} from "../../ai/behaviors/loadout.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  deliverMission,
  destroyMission,
  interceptMission,
  piracyMission,
  tankerMission,
  surveyMission,
} from "../testUtils.ts";

/**
 * A hand that should produce each loadout a bot can reach. A hunter always holds a
 * Destroy and a hauler never does, so `hunter-tanky` and `hauler-aggressive`
 * are human-only: the balance suite forces those.
 */
const HANDS: Partial<Record<BotArchetype, Mission[]>> = {
  // Only an Intercept asks for the eyes: the scan is the card's first step.
  "interceptor-tanky": [
    interceptMission("p2"),
    deliverMission(ALPHA, BETA),
    deliverMission(BETA, GAMMA),
  ],
  "interceptor-aggressive": [interceptMission("p2"), destroyMission("p3"), destroyMission("p4")],
  "hunter-aggressive": [destroyMission("p2"), destroyMission("p3"), deliverMission(ALPHA, BETA)],
  // Nothing to scan and nobody to kill: the forward slot goes to the legs.
  "hauler-tanky": [
    deliverMission(ALPHA, BETA),
    deliverMission(BETA, GAMMA),
    deliverMission(GAMMA, ALPHA),
  ],
};

describe("botChooseLoadout", () => {
  it("every archetype template passes the engine's loadout validation", () => {
    for (const [name, template] of Object.entries(BOT_LOADOUT_TEMPLATES)) {
      const result = validateLoadout(template);
      expect(result.errors, name).toEqual([]);
      expect(template.forwardSlots).toHaveLength(1);
      expect(template.sideSlots).toHaveLength(4);
    }
  });

  // Every card has a tile it cannot start without: the sensor hulls carry the
  // array for Intercept and Survey, and all four carry a gun, which is what a
  // kept Destroy card needs (RULES §Missions).
  it.each(Object.keys(BOT_LOADOUT_TEMPLATES) as BotArchetype[])(
    "the %s template can fly a Destroy card",
    (archetype) => {
      expect(
        missionsMissingRequirements([destroyMission("p2")], BOT_LOADOUT_TEMPLATES[archetype])
      ).toEqual([]);
    }
  );

  it("gives each archetype its own hull", () => {
    for (const [archetype, missions] of Object.entries(HANDS) as Array<[BotArchetype, Mission[]]>) {
      expect(classifyArchetype(missions), archetype).toBe(archetype);
      const choice = botChooseLoadout(missions, { playerCount: 4 });
      expect(choice.missionIds).toHaveLength(MISSIONS_PER_PLAYER);
      expect(validateLoadout(choice.loadout).errors, archetype).toEqual([]);
      expect(choice.loadout).toEqual(BOT_LOADOUT_TEMPLATES[archetype]);
    }
  });

  it("keeps exactly a hand of the offers, and only offered ones", () => {
    const offers: Mission[] = [
      destroyMission("p2"),
      interceptMission("p3"),
      deliverMission(ALPHA, BETA),
      surveyMission(),
      deliverMission(BETA, GAMMA),
    ];
    const choice = botChooseLoadout(offers, { playerCount: 3 });
    expect(choice.missionIds).toHaveLength(MISSIONS_PER_PLAYER);
    expect(new Set(choice.missionIds).size).toBe(MISSIONS_PER_PLAYER);
    for (const id of choice.missionIds) expect(offers.some((m) => m.id === id)).toBe(true);
  });

  it("keeps any hand it can fly, and spreads across them", () => {
    // The bot does not score the primary: every hand the loadout could fly is
    // valid, and which one it takes is the seeded pick. Measuring which plan
    // wins is the benchmark's job, not the chooser's.
    // No Deliver here, so no hand is a hold clash and every one stays on the
    // table — the pairing rule is covered by its own test above.
    const offers: Mission[] = [
      destroyMission("p2"),
      interceptMission("p3"),
      interceptMission("p4", "intercept-p4"),
      surveyMission("survey-a"),
      piracyMission("piracy-a"),
      tankerMission("tanker-a"),
    ];
    const hands = validHands(offers);
    // Three primaries, and three ways to take two of three distinct secondaries.
    expect(hands).toHaveLength(9);

    const seen = new Set(
      hands.map((_, i) =>
        botChooseLoadout(offers, { playerCount: 3, pick: (n) => i % n })
          .missionIds.slice()
          .sort()
          .join(",")
      )
    );
    expect(seen.size).toBe(hands.length);
  });

  it("keeps two different secondaries out of the four the pile deals", () => {
    // Four cards off a pile of three kinds always repeat one, so the pairs on
    // offer are five of the six, and every one of them is two things to do.
    const offers: Mission[] = [
      destroyMission("p2"),
      interceptMission("p3"),
      destroyMission("p4", "destroy-p4"),
      surveyMission("survey-a"),
      surveyMission("survey-b"),
      piracyMission("piracy-a"),
      tankerMission("tanker-a"),
    ];
    const hands = validHands(offers);
    expect(hands).toHaveLength(15);
    for (let i = 0; i < hands.length; i++) {
      const kept = botChooseLoadout(offers, { playerCount: 3, pick: (n) => i % n }).missionIds;
      const kinds = kept
        .map((id) => offers.find((m) => m.id === id)!)
        .filter((m) => !isPrimaryType(m.type))
        .map((m) => m.type);
      expect(kinds).toHaveLength(SECONDARIES_PER_PLAYER);
      expect(new Set(kinds).size).toBe(SECONDARIES_PER_PLAYER);
    }
  });

  it("never pairs a secondary with another of its own kind", () => {
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      surveyMission("survey-a"),
      surveyMission("survey-b"),
      piracyMission("piracy-a"),
    ];
    const hands = validHands(offers);
    expect(hands.length).toBeGreaterThan(0);
    for (const hand of hands) {
      const kinds = hand.filter((m) => !isPrimaryType(m.type)).map((m) => m.type);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it("every hand it keeps is one primary and two secondaries", () => {
    const offers: Mission[] = [
      destroyMission("p2"),
      interceptMission("p3"),
      deliverMission(ALPHA, BETA),
      surveyMission("survey-a"),
      piracyMission("piracy-a"),
      tankerMission("tanker-a"),
    ];
    for (const hand of validHands(offers)) {
      expect(hand.filter((m) => isPrimaryType(m.type))).toHaveLength(PRIMARIES_PER_PLAYER);
      expect(hand.filter((m) => !isPrimaryType(m.type))).toHaveLength(SECONDARIES_PER_PLAYER);
    }
  });

  it("does not take a Piracy card into the hold a delivery crate needs", () => {
    // Both want the one crate the hold takes, so that pairing is two trips.
    // Every other pairing is on the table, so the bot takes one of those.
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      surveyMission("survey-a"),
      piracyMission("piracy-a"),
      tankerMission("tanker-a"),
    ];
    for (let i = 0; i < 3; i++) {
      const kept = botChooseLoadout(offers, { playerCount: 3, pick: (n) => i % n }).missionIds;
      expect(kept).not.toContain("piracy-a");
    }
  });

  it("takes the Piracy card anyway when the deal leaves nothing else", () => {
    // Only a clashing pair is on the table, and a hand of two is not a hand.
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      piracyMission("piracy-a"),
      piracyMission("piracy-b"),
    ];
    const kept = botChooseLoadout(offers, { playerCount: 3 }).missionIds;
    expect(kept).toHaveLength(MISSIONS_PER_PLAYER);
    expect(kept).toContain("piracy-a");
  });

  it("never offers a hand the forced loadout cannot fly", () => {
    const railgun: ShipLoadout = {
      forwardSlots: ["railgun"],
      sideSlots: ["missiles", "radiator", "shields", "shields"],
    };
    const offers: Mission[] = [
      interceptMission("p2"),
      interceptMission("p3", "intercept-p3"),
      deliverMission(ALPHA, BETA),
      surveyMission("survey-a"),
      piracyMission("piracy-a"),
      tankerMission("tanker-a"),
    ];
    const hands = validHands(offers, railgun);
    expect(hands.length).toBeGreaterThan(0);
    for (const hand of hands) {
      expect(missionsMissingRequirements(hand, railgun)).toEqual([]);
    }
  });

  it("is deterministic", () => {
    const offers: Mission[] = [
      destroyMission("p2"),
      destroyMission("p3"),
      deliverMission(ALPHA, GAMMA),
      surveyMission(),
      interceptMission("p3"),
    ];
    const a = botChooseLoadout(offers, { playerCount: 4 });
    const b = botChooseLoadout(offers, { playerCount: 4 });
    expect(b).toEqual(a);
  });

  it("takes the sensor array forward whenever it holds an Intercept", () => {
    // The forward slot holds the railgun or the sensor array, never both,
    // and an Intercept cannot even begin without a scan.
    for (const missions of [
      [interceptMission("p2"), destroyMission("p3"), destroyMission("p4")],
      [interceptMission("p2"), deliverMission(ALPHA, BETA), surveyMission()],
    ]) {
      const { loadout } = botChooseLoadout(missions, { playerCount: 4 });
      expect(loadout.forwardSlots, JSON.stringify(missions.map((m) => m.type))).toEqual([
        "sensor_array",
      ]);
      expect(loadout.sideSlots).not.toContain("railgun");
    }
  });

  it("keeps the railgun for a hand of Destroy cards", () => {
    const { loadout } = botChooseLoadout(
      [destroyMission("p2"), destroyMission("p3"), destroyMission("p4")],
      { playerCount: 4 }
    );
    expect(loadout.forwardSlots).toEqual(["railgun"]);
  });

  it("spends the forward slot on legs, a gun or eyes according to the hand", () => {
    // The sensor array earns the forward slot only when a card needs a scan.
    // A pure cargo hand never scans anything and has nobody it must kill, so
    // the slot goes to the legs that make the route cheap.
    const { loadout } = botChooseLoadout(
      [deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA), deliverMission(GAMMA, ALPHA)],
      { playerCount: 3 }
    );
    expect(loadout.forwardSlots).toEqual(["fuel_compressor"]);
    // A Destroy card has to get through shields, which is the railgun's job.
    const kill = botChooseLoadout(
      [destroyMission("p2"), deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA)],
      { playerCount: 3 }
    );
    expect(kill.loadout.forwardSlots).toEqual(["railgun"]);
    // A Survey is a dive any loadout can make, so it asks for nothing forward: a
    // cargo hand carrying one still spends the slot on the legs.
    const survey = botChooseLoadout(
      [deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA), surveyMission()],
      { playerCount: 3 }
    );
    expect(survey.loadout.forwardSlots).toEqual(["fuel_compressor"]);
  });

  it("gives every combat hull the heat headroom its volley needs", () => {
    // A shield tile eats two damage a turn and is refilled for free, so a
    // volley has to beat the cubes to reach a hull — and heat over the
    // dissipation is the bot's own hull. Every hull that shoots carries a
    // radiator, and the railgun loadouts carry a second gun to pair with the bow.
    for (const [name, template] of Object.entries(BOT_LOADOUT_TEMPLATES)) {
      expect(template.sideSlots, name).toContain("radiator");
    }
    // The hunter's partner gun is a broadside that lands its damage: a rack on
    // the railgun's own ring, a laser a ring further out. Never missiles — a
    // powered rack rolls at every one of them (see loadout.ts).
    for (const name of ["hunter-tanky", "hunter-aggressive"] as const) {
      const hunter = BOT_LOADOUT_TEMPLATES[name];
      expect(hunter.forwardSlots, name).toEqual(["railgun"]);
      expect(hunter.sideSlots, name).not.toContain("missiles");
      expect(
        hunter.sideSlots.some((t) => t === "laser" || t === "ballistic_rack"),
        name
      ).toBe(true);
    }
  });


  it("produces submissions the engine accepts for a real deal", () => {
    let state = createGame(
      [1, 2, 3, 4].map((i) => ({ id: `bot-${i}`, name: `Bot ${i}` })),
      99
    );
    for (const player of state.players) {
      const choice = botChooseLoadout(player.missionOffers, { playerCount: 4 });
      const result = submitLoadout(state, player.id, {
        loadout: choice.loadout,
        missionIds: choice.missionIds,
      });
      expect(result.error).toBeUndefined();
      state = result.state;
    }
    expect(state.phase).toBe("deployment");
    for (const player of state.players) expect(player.missions).toHaveLength(MISSIONS_PER_PLAYER);
  });

  // The simulator forces a hull on a seat to measure it. The bot then picks
  // cards that hull can fly; a deal with no flyable hand leaves it its own loadout.
  describe("a hull imposed on the seat", () => {
    const RAILGUN: ShipLoadout = {
      forwardSlots: ["railgun"],
      sideSlots: ["missiles", "radiator", "shields", "shields"],
    };

    it("keeps the hull and drops the cards it cannot fly when a flyable hand exists", () => {
      // The railgun loadout has no sensor array: Intercept and Survey are dead
      // weight on it, and the four that are left are exactly a hand.
      const offers = [
        interceptMission("p2"),
        deliverMission(ALPHA, BETA),
        destroyMission("p2"),
        surveyMission("survey-a"),
        piracyMission("piracy-a"),
        tankerMission("tanker-a"),
      ];
      const choice = botChooseLoadout(offers, { playerCount: 3, hull: RAILGUN });
      expect(choice.loadout).toEqual(RAILGUN);
      const kept = offers.filter((m) => choice.missionIds.includes(m.id));
      expect(missionsMissingRequirements(kept, choice.loadout)).toEqual([]);
    });

    it("gives the hull up when too few offers suit the hull to make a hand", () => {
      // The railgun loadout has no sensor array, so three of these five are dead
      // weight on it and no full hand is flyable. (A Survey would be: it asks
      // for nothing, which is the point of it.)
      const offers = [
        interceptMission("p2"),
        interceptMission("p3", "intercept-p3"),
        interceptMission("p4", "intercept-p4"),
        surveyMission("survey-a"),
        piracyMission("piracy-a"),
        tankerMission("tanker-a"),
      ];
      const choice = botChooseLoadout(offers, { playerCount: 3, hull: RAILGUN });
      expect(choice.loadout).not.toEqual(RAILGUN);
      const kept = offers.filter((m) => choice.missionIds.includes(m.id));
      expect(missionsMissingRequirements(kept, choice.loadout)).toEqual([]);
    });
  });

  // A bot picks its cards first and then a hull that fits them, so it should
  // never hand the referee a hand its loadout cannot fly — at any table size.
  it.each([2, 3, 4])("never keeps a card its hull cannot complete (%i players)", (playerCount) => {
    for (let seed = 0; seed < 40; seed++) {
      const state = createGame(
        Array.from({ length: playerCount }, (_, i) => ({ id: `bot-${i}`, name: `Bot ${i}` })),
        seed
      );
      for (const player of state.players) {
        const choice = botChooseLoadout(player.missionOffers, { playerCount });
        const kept = player.missionOffers.filter((m) => choice.missionIds.includes(m.id));
        expect(missionsMissingRequirements(kept, choice.loadout), `seed ${seed}`).toEqual([]);
      }
    }
  });
});
