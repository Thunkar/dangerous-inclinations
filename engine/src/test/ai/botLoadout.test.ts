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
import type { BotPresetId } from "../../ai/behaviors/loadout.ts";
import {
  BOT_PRESET_LOADOUTS,
  BOT_ROLES,
  PRESETS_BY_ROLE,
  classifyPreset,
  presetRole,
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

const done = <M extends Mission>(m: M): M => ({ ...m, isCompleted: true });
const DESTROY = destroyMission("p2");
const INTERCEPT = interceptMission("p2");
const DELIVER = deliverMission(ALPHA, GAMMA);

/**
 * A hand of one primary and two secondaries, and the preset it flies. The
 * primary picks the role; a secondary asks for a preset of the role's; between two that ask for
 * different kits, Piracy > Salvage > Escort > Survey > Tanker.
 */
const HANDS: Array<[string, BotPresetId, Mission[]]> = [
  ["Destroy, Survey, Tanker", "gunship", [DESTROY, surveyMission("a"), tankerMission("b")]],
  ["Destroy, Piracy, Survey", "corsair", [DESTROY, piracyMission("a"), surveyMission("b")]],
  ["Destroy, Salvage, Tanker", "striker", [DESTROY, salvageMission("a"), tankerMission("b")]],
  ["Destroy, Salvage, Salvage", "striker", [DESTROY, salvageMission("a"), salvageMission("b")]],
  ["Destroy, Escort, Survey", "warden", [DESTROY, escortMission("a"), surveyMission("b")]],
  ["Intercept, Survey, Tanker", "raider", [INTERCEPT, surveyMission("a"), tankerMission("b")]],
  ["Intercept, Piracy, Survey", "jammer", [INTERCEPT, piracyMission("a"), surveyMission("b")]],
  ["Intercept, Salvage, Survey", "picket", [INTERCEPT, salvageMission("a"), surveyMission("b")]],
  ["Intercept, Escort, Tanker", "sentry", [INTERCEPT, escortMission("a"), tankerMission("b")]],
  ["Deliver, Survey, Escort", "freighter", [DELIVER, surveyMission("a"), escortMission("b")]],
  ["Deliver, Piracy, Survey", "privateer", [DELIVER, piracyMission("a"), surveyMission("b")]],
  ["Deliver, Salvage, Survey", "smuggler", [DELIVER, salvageMission("a"), surveyMission("b")]],
  ["Deliver, Tanker, Survey", "ghost", [DELIVER, tankerMission("a"), surveyMission("b")]],
  // Two secondaries asking for different kits: the higher card decides.
  ["Destroy, Salvage, Piracy", "corsair", [DESTROY, salvageMission("a"), piracyMission("b")]],
  ["Destroy, Escort, Piracy", "corsair", [DESTROY, escortMission("a"), piracyMission("b")]],
  ["Destroy, Escort, Salvage", "striker", [DESTROY, escortMission("a"), salvageMission("b")]],
  ["Intercept, Escort, Piracy", "jammer", [INTERCEPT, escortMission("a"), piracyMission("b")]],
  ["Intercept, Escort, Salvage", "picket", [INTERCEPT, escortMission("a"), salvageMission("b")]],
  ["Deliver, Tanker, Piracy", "privateer", [DELIVER, tankerMission("a"), piracyMission("b")]],
  ["Deliver, Tanker, Salvage", "smuggler", [DELIVER, tankerMission("a"), salvageMission("b")]],
  // A card that asks for nothing in the role leaves the choice to the other.
  ["Deliver, Escort, Tanker", "ghost", [DELIVER, escortMission("a"), tankerMission("b")]],
  // A completed card asks for nothing.
  [
    "Destroy, a done Piracy, Survey",
    "gunship",
    [DESTROY, done(piracyMission("a")), surveyMission("b")],
  ],
  [
    "Deliver, a done Piracy, Tanker",
    "ghost",
    [DELIVER, done(piracyMission("a")), tankerMission("b")],
  ],
];

describe("botChooseLoadout", () => {
  it.each(Object.entries(BOT_PRESET_LOADOUTS))(
    "the %s preset passes the engine's loadout validation",
    (_id, loadout) => {
      expect(validateLoadout(loadout).errors).toEqual([]);
      expect(loadout.forwardSlots).toHaveLength(1);
      expect(loadout.sideSlots).toHaveLength(4);
    }
  );

  it("every preset is in exactly one role's list, and that list is its role", () => {
    const listed = BOT_ROLES.flatMap((role) => PRESETS_BY_ROLE[role]);
    expect([...listed].sort()).toEqual(Object.keys(BOT_PRESET_LOADOUTS).sort());
    for (const role of BOT_ROLES)
      for (const id of PRESETS_BY_ROLE[role]) expect(presetRole(id)).toBe(role);
  });

  it.each([
    ["hunter", DESTROY],
    ["interceptor", INTERCEPT],
  ] as const)("every %s preset can fly the role's primary", (role, primary) => {
    for (const id of PRESETS_BY_ROLE[role])
      expect(missionsMissingRequirements([primary], BOT_PRESET_LOADOUTS[id])).toEqual([]);
  });

  it("every preset is flown by some hand", () => {
    const flown = new Set(HANDS.map(([, preset]) => preset));
    expect([...flown].sort()).toEqual(Object.keys(BOT_PRESET_LOADOUTS).sort());
  });

  it.each(HANDS)("flies %s on the %s", (_label, preset, missions) => {
    expect(classifyPreset(missions)).toBe(preset);
    const choice = botChooseLoadout(missions);
    expect(choice.missionIds).toHaveLength(MISSIONS_PER_PLAYER);
    expect(choice.loadout).toEqual(BOT_PRESET_LOADOUTS[preset]);
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

  it("keeps Salvage beside a Deliver: the hold has no limit", () => {
    const offers: Mission[] = [
      deliverMission(ALPHA, BETA),
      salvageMission("salvage-a"),
      escortMission("escort-a"),
      tankerMission("tanker-a"),
    ];
    const kept = [0, 1, 2].map((i) => botChooseLoadout(offers, { pick: (n) => i % n }).missionIds);
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
