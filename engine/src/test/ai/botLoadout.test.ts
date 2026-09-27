/**
 * Loadout phase. `botChooseLoadout` keeps exactly a hand of the offered cards
 * and returns a hull the engine will accept, deterministically. That every
 * natural deal ends in a legal, flyable hand the engine accepts is the
 * bot-vs-bot games' check (`botGames.test.ts`); these are the choices.
 */
import { describe, it, expect } from "vitest";
import type { Mission } from "../../models/missions.ts";
import { MISSIONS_PER_PLAYER } from "../../models/missions.ts";
import { missionsMissingRequirements, validateLoadout } from "../../game/loadout.ts";
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
  salvageMission,
  escortMission,
} from "../testUtils.ts";

/**
 * A hand that should produce each loadout a bot can reach. A hunter always holds a
 * Destroy and a hauler never does, so `hunter-tanky` and `hauler-aggressive`
 * are human-only: the balance suite forces those.
 */
const HANDS: Array<[string, BotArchetype, Mission[]]> = [
  // Only an Intercept asks for the eyes: the scan is the card's first step.
  [
    "an Intercept with cargo",
    "interceptor-tanky",
    [interceptMission("p2"), deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA)],
  ],
  [
    "an Intercept with Destroys",
    "interceptor-aggressive",
    [interceptMission("p2"), destroyMission("p3"), destroyMission("p4")],
  ],
  // A Destroy card has to get through shields, which is the railgun's job.
  [
    "Destroys with cargo",
    "hunter-aggressive",
    [destroyMission("p2"), destroyMission("p3"), deliverMission(ALPHA, BETA)],
  ],
  // Nothing to scan and nobody to kill: the forward slot goes to the legs.
  [
    "cargo alone",
    "hauler-tanky",
    [deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA), deliverMission(GAMMA, ALPHA)],
  ],
  // A Survey is a dive any loadout can make, so it asks for nothing forward.
  [
    "cargo and a Survey",
    "hauler-tanky",
    [deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA), surveyMission()],
  ],
];

describe("botChooseLoadout", () => {
  it("every archetype template passes the engine's loadout validation", () => {
    for (const [name, template] of Object.entries(BOT_LOADOUT_TEMPLATES)) {
      const result = validateLoadout(template);
      expect(result.errors, name).toEqual([]);
      expect(template.forwardSlots).toHaveLength(1);
      expect(template.sideSlots).toHaveLength(4);
    }
  });

  it.each(HANDS)("flies %s on the %s hull", (_label, archetype, missions) => {
    expect(classifyArchetype(missions)).toBe(archetype);
    const choice = botChooseLoadout(missions);
    expect(choice.missionIds).toHaveLength(MISSIONS_PER_PLAYER);
    expect(choice.loadout).toEqual(BOT_LOADOUT_TEMPLATES[archetype]);
  });

  it("keeps any hand it can fly, and spreads across them", () => {
    // The bot does not score the primary: every hand the loadout could fly is
    // valid, and which one it takes is the seeded pick. Measuring which plan
    // wins is the benchmark's job, not the chooser's.
    // No Deliver here, so no hand is a hold clash and every one stays on the
    // table. The pairing rule is covered by its own tests below.
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
        botChooseLoadout(offers, { pick: (n) => i % n })
          .missionIds.slice()
          .sort()
          .join(",")
      )
    );
    expect(seen.size).toBe(hands.length);
  });

  it.each([
    // Two of a kind are two jobs (RULES §Missions): three of one kind is a hand.
    ["three Surveys", [surveyMission("a"), surveyMission("b"), surveyMission("c")]],
    // Piracy clashes only with a Deliver's crate, so with none every hand stays.
    ["Piracy and two Salvage", [piracyMission("a"), salvageMission("b"), salvageMission("c")]],
  ])("keeps any two of %s behind a primary that carries no crate", (_label, secondaries) => {
    const offers: Mission[] = [destroyMission("p2"), ...secondaries];
    const hands = validHands(offers);
    expect(hands).toHaveLength(3);
    const seen = new Set(
      hands.map((_, i) =>
        botChooseLoadout(offers, { pick: (n) => i % n })
          .missionIds.slice()
          .sort()
          .join(",")
      )
    );
    expect(seen.size).toBe(hands.length);
  });

  it("never keeps Piracy beside a Deliver while any other hand is offered", () => {
    // Both want the one crate the hold takes, so that pairing is two trips.
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      piracyMission("clash"),
      escortMission("escort-a"),
      tankerMission("tanker-a"),
    ];
    for (let i = 0; i < 3; i++) {
      const kept = botChooseLoadout(offers, { pick: (n) => i % n }).missionIds;
      expect(kept).not.toContain("clash");
    }
  });

  it("keeps Salvage beside a Deliver: the black box is data and rides free", () => {
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      salvageMission("salvage-a"),
      escortMission("escort-a"),
      tankerMission("tanker-a"),
    ];
    const kept = [0, 1, 2].map(
      (i) => botChooseLoadout(offers, { pick: (n) => i % n }).missionIds
    );
    // Three hands on offer, none refused: two of the three carry the Salvage.
    expect(kept.filter((ids) => ids.includes("salvage-a"))).toHaveLength(2);
  });

  it("takes the Piracy card anyway when the deal leaves nothing else", () => {
    // Only a clashing pair is on the table, and a hand of two is not a hand.
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      piracyMission("piracy-a"),
      piracyMission("piracy-b"),
    ];
    const kept = botChooseLoadout(offers).missionIds;
    expect(kept).toHaveLength(MISSIONS_PER_PLAYER);
    expect(kept).toContain("piracy-a");
  });

  it("is deterministic", () => {
    const offers: Mission[] = [
      destroyMission("p2"),
      destroyMission("p3"),
      deliverMission(ALPHA, GAMMA),
      surveyMission(),
      interceptMission("p3"),
    ];
    const a = botChooseLoadout(offers);
    const b = botChooseLoadout(offers);
    expect(b).toEqual(a);
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
      const choice = botChooseLoadout(offers, { hull: RAILGUN });
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
      const choice = botChooseLoadout(offers, { hull: RAILGUN });
      expect(choice.loadout).not.toEqual(RAILGUN);
      const kept = offers.filter((m) => choice.missionIds.includes(m.id));
      expect(missionsMissingRequirements(kept, choice.loadout)).toEqual([]);
    });
  });
});
