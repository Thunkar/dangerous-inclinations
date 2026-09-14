/**
 * Loadout phase. `botChooseLoadout` keeps exactly three of the offered
 * cards and returns a hull the engine will accept, deterministically.
 */
import { describe, it, expect } from "vitest";
import type { Mission } from "../../models/missions.ts";
import { MISSIONS_PER_PLAYER } from "../../models/missions.ts";
import { validateLoadout } from "../../game/loadout.ts";
import { createGame, submitLoadout } from "../../game/setup.ts";
import { botChooseLoadout } from "../../ai/index.ts";
import type { BotArchetype } from "../../ai/behaviors/loadout.ts";
import {
  BOT_LOADOUT_TEMPLATES,
  classifyArchetype,
  scoreMissionCombo,
} from "../../ai/behaviors/loadout.ts";
import {
  ALPHA,
  BETA,
  GAMMA,
  deliverMission,
  destroyMission,
  interceptMission,
  surveyMission,
} from "../testUtils.ts";

/** A trio of cards that should produce each archetype. */
const TRIOS: Record<BotArchetype, Mission[]> = {
  hunter: [destroyMission("p2"), destroyMission("p3"), surveyMission()],
  raider: [destroyMission("p2"), deliverMission(ALPHA, BETA), surveyMission()],
  hauler: [interceptMission("p2"), deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA)],
  scout: [interceptMission("p2"), destroyMission("p3"), destroyMission("p4")],
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

  it("gives each archetype its own hull", () => {
    for (const [archetype, missions] of Object.entries(TRIOS) as Array<[BotArchetype, Mission[]]>) {
      expect(classifyArchetype(missions), archetype).toBe(archetype);
      const choice = botChooseLoadout(missions, { playerCount: 4 });
      expect(choice.missionIds).toHaveLength(MISSIONS_PER_PLAYER);
      expect(validateLoadout(choice.loadout).errors, archetype).toEqual([]);
      expect(choice.loadout).toEqual(BOT_LOADOUT_TEMPLATES[archetype]);
    }
  });

  it("keeps exactly three of five offers, and only offered ones", () => {
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

  it("chains cargo routes that share a planet when it can", () => {
    const chained = deliverMission(ALPHA, BETA);
    const onward = deliverMission(BETA, GAMMA);
    const offers: Mission[] = [
      chained,
      onward,
      destroyMission("p2"),
      destroyMission("p3"),
      surveyMission(),
    ];
    const choice = botChooseLoadout(offers, { playerCount: 2 });
    expect(choice.missionIds).toContain(chained.id);
    expect(choice.missionIds).toContain(onward.id);
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

  it("takes a gun rather than a sensor for a hand that never needs to scan", () => {
    // The sensor array earns the forward slot only when a card needs a scan.
    // A pure cargo hand never scans anything, so the slot goes to the gun it
    // will need when somebody else is one dock from winning.
    const { loadout } = botChooseLoadout(
      [deliverMission(ALPHA, BETA), deliverMission(BETA, GAMMA), surveyMission()],
      { playerCount: 3 }
    );
    expect(loadout.forwardSlots).toEqual(["railgun"]);
  });

  it("gives every combat hull the heat headroom its volley needs", () => {
    // A shield tile eats four damage a turn and is refilled for free, so a
    // volley has to beat four to reach a hull — and heat over the
    // dissipation is the bot's own hull. Every railgun hull carries a
    // radiator and a second gun that can bear on the railgun's own ring.
    for (const archetype of ["hunter", "raider"] as const) {
      const template = BOT_LOADOUT_TEMPLATES[archetype];
      expect(template.forwardSlots, archetype).toEqual(["railgun"]);
      expect(template.sideSlots, archetype).toContain("radiator");
      // Lasers cannot fire along the railgun's own ring; these can.
      expect(
        template.sideSlots.some((t) => t === "missiles" || t === "ballistic_rack"),
        archetype
      ).toBe(true);
    }
  });

  it("scores two cards on the same ship above two cards on different ships", () => {
    // Hunting p2 while scanning p2 is one approach, not two.
    const together = scoreMissionCombo(
      [destroyMission("p2"), interceptMission("p2"), surveyMission()],
      4
    );
    const apart = scoreMissionCombo(
      [destroyMission("p2"), interceptMission("p3"), surveyMission()],
      4
    );
    expect(together).toBeGreaterThan(apart);

    const oneHunt = scoreMissionCombo(
      [destroyMission("p2"), destroyMission("p2", "destroy-again"), surveyMission()],
      4
    );
    const twoHunts = scoreMissionCombo(
      [destroyMission("p2"), destroyMission("p3"), surveyMission()],
      4
    );
    expect(oneHunt).toBeGreaterThan(twoHunts);
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
});
