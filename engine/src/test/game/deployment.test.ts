import { describe, it, expect } from "vitest";
import {
  deployShip,
  legalDeploymentPositions,
  legalDeploymentsAgainst,
  transitionToActivePhase,
} from "../../game/deployment.ts";
import { createGame, submitLoadout } from "../../game/setup.ts";
import {
  calculateShipStatsFromLoadout,
  canInstallInSlot,
  createSubsystemsFromLoadout,
  missionRequirementStatus,
  missionsMissingRequirements,
} from "../../game/loadout.ts";
import type { SubsystemType } from "../../models/subsystems.ts";
import { WEAPON_SUBSYSTEM_TYPES } from "../../models/subsystems.ts";
import type { Mission, MissionRequirement } from "../../models/missions.ts";
import { MISSIONS_PER_PLAYER } from "../../models/missions.ts";
import {
  MISSION_OFFERS_PER_PLAYER,
  MISSION_REQUIREMENTS,
  PRIMARIES_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  isPrimaryType,
} from "../../models/missions.ts";
import { executeTurn } from "../../game/turns.ts";
import { DEFAULT_LOADOUT } from "../../models/game.ts";
import { HOME_RING } from "../../models/gravityWells.ts";
import type { GameState, ShipLoadout } from "../../models/game.ts";
import {
  BH,
  canonicalJson,
  coast,
  deliverMission,
  destroyMission,
  getPlayer,
  getShip,
  interceptMission,
  mustExecute,
  surveyMission,
  tankerMission,
  withPlayer,
} from "../testUtils.ts";

const SPECS = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bo" },
];

/** A legal hand: one primary, and any two secondaries. */
const pickHand = (state: GameState, playerId: string) => {
  const offers = getPlayer(state, playerId).missionOffers;
  const primary = offers.filter((m) => isPrimaryType(m.type)).slice(0, PRIMARIES_PER_PLAYER);
  const secondaries = offers
    .filter((m) => !isPrimaryType(m.type))
    .slice(0, SECONDARIES_PER_PLAYER);
  return [...primary, ...secondaries].map((m) => m.id);
};

/**
 * Filler that any loadout can fly, to pad a hand out to its full size. Secondaries,
 * because a hand is one primary and two of these (RULES §Missions): padding
 * with another Deliver would make the hand itself illegal.
 */
const padHand = (cards: Mission[]): Mission[] => {
  // Two kinds, because the pair a hand keeps must differ.
  const filler: Array<(id: string) => Mission> = [surveyMission, tankerMission];
  const padded = [...cards];
  for (let i = 0; padded.length < MISSIONS_PER_PLAYER; i++) {
    padded.push(filler[i % filler.length](`pad-${i}`));
  }
  return padded;
};

/**
 * A loadout that can fly any hand: the sensor array is what Intercept and Survey
 * need, and nothing else on a card asks for a particular tile.
 */
const ANY_HAND: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};

/** createGame + both loadouts submitted: the game sits in the deployment phase. */
function readyToDeploy(seed = 11): GameState {
  let state = createGame(SPECS, seed);
  state = submitLoadout(state, "p1", {
    loadout: ANY_HAND,
    missionIds: pickHand(state, "p1"),
  }).state;
  state = submitLoadout(state, "p2", {
    loadout: ANY_HAND,
    missionIds: pickHand(state, "p2"),
  }).state;
  return state;
}

describe("setup: createGame", () => {
  it("starts in the loadout phase with the offers dealt to each player", () => {
    const state = createGame(SPECS, 99);
    expect(state).toMatchObject({
      phase: "loadout",
      turn: 0,
      activePlayerIndex: 0,
      rngSeed: 99,
      missiles: [],
      wrecks: [],
    });
    expect(state.stations).toHaveLength(3);
    for (const p of state.players) {
      expect(p.missionOffers).toHaveLength(MISSION_OFFERS_PER_PLAYER);
      expect(p).toMatchObject({
        missions: [],
        cargo: [],
        hasSubmittedLoadout: false,
        hasDeployed: false,
        home: null,
        intel: {},
      });
    }
    expect(state.players.map((p) => p.name)).toEqual(["Ada", "Bo"]);
  });

  it("is reproducible from its seed and differs between seeds", () => {
    expect(canonicalJson(createGame(SPECS, 5))).toBe(canonicalJson(createGame(SPECS, 5)));
    // Ids are opaque (m0, m1, ...) by design; the cards behind them differ between seeds.
    const offers = (seed: number) =>
      createGame(SPECS, seed).players.flatMap((p) =>
        p.missionOffers.map(({ id: _id, ...card }) => card)
      );
    expect(offers(5)).not.toEqual(offers(6));
  });

  it("captures a fresh seed when none is given", () => {
    const state = createGame(SPECS);
    expect(typeof state.rngSeed).toBe("number");
    expect(createGame(SPECS, state.rngSeed).players.map((p) => p.missionOffers)).toEqual(
      state.players.map((p) => p.missionOffers)
    );
  });
});

describe("setup: submitLoadout", () => {
  const custom: ShipLoadout = {
    forwardSlots: ["sensor_array"],
    sideSlots: ["radiator", "missiles", "shields", "ballistic_rack"],
  };

  it("records the loadout and mission picks, issuing crates for deliver missions", () => {
    const start = createGame(SPECS, 3);
    const ids = pickHand(start, "p1");
    const { state, error } = submitLoadout(start, "p1", { loadout: custom, missionIds: ids });
    expect(error).toBeUndefined();
    const p1 = getPlayer(state, "p1");
    expect(p1.hasSubmittedLoadout).toBe(true);
    expect(p1.missions.map((m) => m.id)).toEqual(ids);
    expect(p1.ship.subsystems.find((s) => s.id === "forward-0")?.type).toBe("sensor_array");
    expect(p1.ship.subsystems.find((s) => s.id === "side-3")?.type).toBe("ballistic_rack");
    // A crate per Deliver, and nothing else starts in a hold.
    expect(p1.cargo).toHaveLength(
      p1.missions.filter((m) => m.type === "deliver_cargo").length
    );
    expect(state.phase).toBe("loadout");
    expect(getPlayer(state, "p2").hasSubmittedLoadout).toBe(false);
  });

  it("moves to deployment once everyone has submitted, last seat placing first", () => {
    const state = readyToDeploy();
    expect(state.phase).toBe("deployment");
    expect(state.activePlayerIndex).toBe(1);
  });

  // Each row changes one thing in a submission the engine takes.
  type Submission = { state: GameState; playerId: string; loadout: ShipLoadout; missionIds: string[] };
  const legalSubmission = (): Submission => {
    const state = createGame(SPECS, 3);
    return { state, playerId: "p1", loadout: ANY_HAND, missionIds: pickHand(state, "p1") };
  };
  const submit = (s: Submission) =>
    submitLoadout(s.state, s.playerId, { loadout: s.loadout, missionIds: s.missionIds });

  it.each([
    ["the wrong phase", (s: Submission) => ({ ...s, state: { ...s.state, phase: "active" as const } })],
    ["an unknown player", (s: Submission) => ({ ...s, playerId: "p9" })],
    [
      "an invalid loadout",
      (s: Submission) => ({
        ...s,
        loadout: { forwardSlots: ["laser"], sideSlots: ["laser", "laser", "laser", "laser"] } as ShipLoadout,
      }),
    ],
    ["too few missions", (s: Submission) => ({ ...s, missionIds: s.missionIds.slice(1) })],
  ])("rejects %s and returns the state unchanged", (_label, change) => {
    const legal = legalSubmission();
    const bad = change(legal);
    const result = submit(bad);
    expect(result.error).toBeDefined();
    expect(result.state).toBe(bad.state);
    expect(submit(legal).error).toBeUndefined();
  });

  it("rejects missions that were not offered and a second submission", () => {
    const start = createGame(SPECS, 3);
    const foreign = submitLoadout(start, "p1", {
      loadout: ANY_HAND,
      missionIds: pickHand(start, "p2"),
    });
    expect(foreign.error).toBeDefined();
    expect(foreign.state).toBe(start);
    // The same submission with p1's own offers is taken, once.
    const first = submitLoadout(start, "p1", {
      loadout: ANY_HAND,
      missionIds: pickHand(start, "p1"),
    });
    expect(first.error).toBeUndefined();
    const twice = submitLoadout(first.state, "p1", {
      loadout: ANY_HAND,
      missionIds: pickHand(start, "p1"),
    });
    expect(twice.error).toBeDefined();
    expect(twice.state).toBe(first.state);
  });
});

describe("setup: a kept card the loadout can never fly", () => {
  /** Guns and no sensors: fine for a Destroy, dead weight for an Intercept. */
  const GUNSHIP: ShipLoadout = {
    forwardSlots: ["railgun"],
    sideSlots: ["laser", "laser", "shields", "missiles"],
  };
  /** Sensors and nothing that shoots: the mirror image. */
  const UNARMED: ShipLoadout = {
    forwardSlots: ["sensor_array"],
    sideSlots: ["shields", "shields", "radiator", "radiator"],
  };

  const SENSOR_ARRAY = MISSION_REQUIREMENTS.intercept_transmission[0];
  const WEAPON = MISSION_REQUIREMENTS.destroy_ship[0];

  /** card, what GUNSHIP is missing for it, what UNARMED is missing for it. */
  const CARDS: Array<[string, Mission, MissionRequirement[], MissionRequirement[]]> = [
    ["a Destroy", destroyMission("p2"), [], [WEAPON]],
    ["a Deliver", deliverMission("planet-alpha", "planet-beta"), [], []],
    ["an Intercept", interceptMission("p2"), [SENSOR_ARRAY], []],
    // A Survey is a dive, not a reading taken with an instrument: no loadout lacks
    // anything for it.
    ["a Survey", surveyMission(), [], []],
  ];

  it.each(CARDS)(
    "%s knows what each loadout lacks for it",
    (_label, mission, onGunship, onUnarmed) => {
      const gaps = (missing: MissionRequirement[]) =>
        missing.length > 0 ? [{ mission, missing }] : [];
      expect(missionsMissingRequirements([mission], GUNSHIP)).toEqual(gaps(onGunship));
      expect(missionsMissingRequirements([mission], UNARMED)).toEqual(gaps(onUnarmed));
      // ANY_HAND carries both a gun and the array, so it can fly every card.
      expect(missionsMissingRequirements([mission], ANY_HAND)).toEqual([]);
    }
  );

  /** A loadout whose only weapon is `type`; everything else aboard is passive. */
  const armedWith = (type: SubsystemType): ShipLoadout =>
    canInstallInSlot(type, "forward")
      ? { forwardSlots: [type], sideSlots: ["shields", "shields", "radiator", "radiator"] }
      : {
          forwardSlots: ["sensor_array"],
          sideSlots: [type, "shields", "radiator", "radiator"],
        };

  it.each(WEAPON_SUBSYSTEM_TYPES)(
    "a Destroy card flies on a loadout whose only gun is %s",
    (type) => {
      expect(missionsMissingRequirements([destroyMission("p2")], armedWith(type))).toEqual([]);
    }
  );

  it("reports which of a requirement's tiles are aboard, for the loadout screen", () => {
    expect(missionRequirementStatus("destroy_ship", GUNSHIP)).toEqual([
      { requirement: WEAPON, fitted: ["railgun", "laser", "missiles"], met: true },
    ]);
    expect(missionRequirementStatus("destroy_ship", UNARMED)).toEqual([
      { requirement: WEAPON, fitted: [], met: false },
    ]);
    expect(missionRequirementStatus("deliver_cargo", UNARMED)).toEqual([]);
  });

  /** A hand of three, offered to p1, so the picks are exactly what we want to test. */
  const offered = (missions: Mission[]) =>
    withPlayer(createGame(SPECS, 5), "p1", { missionOffers: missions });

  /**
   * A hand holds one primary, and only a primary asks for anything aboard, so a
   * loadout has at most one requirement to satisfy: there is no hand that needs
   * the array and a gun at once.
   */
  it.each([
    ["an Intercept on a hull with no sensor array", interceptMission("p2"), GUNSHIP],
    ["a Destroy on a hull with no weapon", destroyMission("p2"), UNARMED],
  ] as Array<[string, Mission, ShipLoadout]>)(
    "refuses %s, and takes the same hand once what it asks for is aboard",
    (_label, card, loadout) => {
      const hand = padHand([card]);
      const state = offered(hand);
      const missionIds = hand.map((m) => m.id);
      const refused = submitLoadout(state, "p1", { loadout, missionIds });
      expect(refused.error).toBeDefined();
      expect(refused.state).toBe(state);
      const taken = submitLoadout(state, "p1", { loadout: ANY_HAND, missionIds });
      expect(taken.error).toBeUndefined();
      expect(getPlayer(taken.state, "p1").missions.map((m) => m.id)).toEqual(missionIds);
    }
  );

  it("lets an unflyable card be left in the offers: only kept cards are checked", () => {
    // A Deliver asks for nothing aboard, so an unarmed loadout can fly this hand.
    const keep = padHand([deliverMission("planet-alpha", "planet-beta")]);
    const state = offered([...keep, destroyMission("p2"), interceptMission("p2")]);
    const result = submitLoadout(state, "p1", {
      loadout: UNARMED,
      missionIds: keep.map((m) => m.id),
    });
    expect(result.error).toBeUndefined();
    expect(getPlayer(result.state, "p1").hasSubmittedLoadout).toBe(true);
  });
});

describe("loadout: validation and instantiation", () => {
  // RULES §Setup: forward is railgun, sensor array, fuel compressor, shields or
  // missiles; side is laser, radiator, shields, ballistic rack or missiles. The
  // guns that care where they point stay put, the rack stays off the bow (a
  // cheap bow gun has no predator), and shields and missiles go either way so a
  // loaded bow is never a certain sensor array.
  it.each<[SubsystemType, boolean, boolean]>([
    ["railgun", true, false],
    ["sensor_array", true, false],
    ["fuel_compressor", true, false],
    ["shields", true, true],
    ["missiles", true, true],
    ["laser", false, true],
    ["radiator", false, true],
    ["ballistic_rack", false, true],
    ["engines", false, false],
  ])("%s fits the bow: %s, a side: %s", (type, forward, side) => {
    expect(canInstallInSlot(type, "forward")).toBe(forward);
    expect(canInstallInSlot(type, "side")).toBe(side);
  });

  it("creates fixed systems face-up and slot tiles face-down with stable ids", () => {
    const subsystems = createSubsystemsFromLoadout(DEFAULT_LOADOUT);
    expect(subsystems.map((s) => s.id)).toEqual([
      "engines",
      "rotation",
      "scoop",
      "forward-0",
      "side-0",
      "side-1",
      "side-2",
      "side-3",
    ]);
    expect(subsystems.map((s) => s.type)).toEqual([
      "engines",
      "rotation",
      "scoop",
      "railgun",
      "laser",
      "laser",
      "shields",
      "missiles",
    ]);
    expect(subsystems.slice(0, 3).every((s) => s.isRevealed && s.slotGroup === undefined)).toBe(
      true
    );
    expect(subsystems.slice(3).every((s) => !s.isRevealed)).toBe(true);
    expect(subsystems.find((s) => s.id === "side-2")).toMatchObject({
      slotGroup: "side",
      slotIndex: 2,
      allocatedEnergy: 0,
      isBroken: false,
    });
    expect(subsystems.find((s) => s.id === "side-3")?.ammo).toBe(4);
    expect(subsystems.find((s) => s.id === "side-0")).not.toHaveProperty("ammo");
  });

  it("passive tiles change starting stats", () => {
    expect(calculateShipStatsFromLoadout(DEFAULT_LOADOUT)).toEqual({
      dissipationCapacity: 5,
      reactionMass: 10,
    });
    const passive: ShipLoadout = {
      forwardSlots: ["railgun"],
      sideSlots: ["radiator", "radiator", "shields", "laser"],
    };
    // Radiators are the only passive a loadout can stack: the tank is 10 on every ship.
    expect(calculateShipStatsFromLoadout(passive)).toEqual({
      dissipationCapacity: 9,
      reactionMass: 10,
    });
  });
});

describe("deployment", () => {
  it("offers every sector of Black Hole Rings 2, 3 and 4", () => {
    const positions = legalDeploymentPositions(readyToDeploy());
    expect(positions).toHaveLength(72);
    expect(positions.every((p) => p.wellId === BH)).toBe(true);
    expect(new Set(positions.map((p) => p.ring))).toEqual(new Set([2, 3, 4]));
    expect(new Set(positions.filter((p) => p.ring === 2).map((p) => p.sector)).size).toBe(24);
  });

  it("keeps a placement three sectors clear of every placed ship, on every ring", () => {
    const placed = [{ wellId: BH, ring: HOME_RING, sector: 0 }];
    const legal = legalDeploymentsAgainst(placed);
    // Every ring stays open, but not near the ship: ring 3 sector 0 is its neighbour.
    for (const ring of [2, 3, 4]) {
      for (const sector of [0, 1, 2, 22, 23]) {
        expect(legal).not.toContainEqual({ wellId: BH, ring, sector });
      }
      expect(legal).toContainEqual({ wellId: BH, ring, sector: 3 });
      expect(legal).toContainEqual({ wellId: BH, ring, sector: 21 });
    }
    expect(legal).toHaveLength(3 * (24 - 5));
  });

  it("falls back to the clearest sectors when six ships leave none three clear", () => {
    // Ships every four sectors: every free sector is within two of one of them.
    const placed = [0, 4, 8, 12, 16, 20].map((sector) => ({ wellId: BH, ring: HOME_RING, sector }));
    const legal = legalDeploymentsAgainst(placed);
    expect(legal.length).toBeGreaterThan(0);
    const clearance = (sector: number) =>
      Math.min(
        ...placed.map((p) => Math.min((sector - p.sector + 24) % 24, (p.sector - sector + 24) % 24))
      );
    expect(legal.every((p) => clearance(p.sector) === 2)).toBe(true);
    expect(legalDeploymentsAgainst([]).length).toBe(72);
  });

  it("refuses a ring that is not a deployment ring, and a sector too close to a placed ship", () => {
    const state = deployShip(readyToDeploy(), "p2", 5, HOME_RING).state; // p1 places next
    expect(deployShip(state, "p1", 5, 5).success).toBe(false); // black hole ring 5
    expect(deployShip(state, "p1", 9, 1).success).toBe(false); // black hole ring 1
    expect(deployShip(state, "p1", 7, HOME_RING).success).toBe(false); // two sectors away
    expect(deployShip(state, "p1", 5, 3).success).toBe(false); // the other ring, same sector
    const ok = deployShip(state, "p1", 8, 3); // three away, on the inner ring
    expect(ok.success).toBe(true);
    expect(getPlayer(ok.state, "p1").home).toEqual({ wellId: BH, ring: 3, sector: 8 });
  });

  it("places the ship facing prograde and plants the Home marker there", () => {
    const result = deployShip(readyToDeploy(), "p2", 9, HOME_RING);
    expect(result.success).toBe(true);
    const p1 = getPlayer(result.state, "p2");
    expect(p1.hasDeployed).toBe(true);
    expect(p1.home).toEqual({ wellId: BH, ring: HOME_RING, sector: 9 });
    expect(p1.ship).toMatchObject({
      wellId: BH,
      ring: HOME_RING,
      sector: 9,
      facing: "prograde",
      hitPoints: 10,
    });
    expect(result.events).toEqual([
      { type: "deployed", playerId: "p2", position: { wellId: BH, ring: HOME_RING, sector: 9 } },
    ]);
    expect(result.state.activePlayerIndex).toBe(0);
    expect(legalDeploymentPositions(result.state)).not.toContainEqual({
      wellId: BH,
      ring: HOME_RING,
      sector: 9,
    });
  });

  it("deploys in reverse turn order: the last seat first, the first seat last", () => {
    const state = readyToDeploy();
    expect(deployShip(state, "p1", 9, HOME_RING)).toMatchObject({ success: false, state });
    const p2First = deployShip(state, "p2", 0, HOME_RING);
    expect(p2First.success).toBe(true);
    const afterP2 = p2First.state;
    expect(deployShip(afterP2, "p2", 12, HOME_RING)).toMatchObject({ success: false, state: afterP2 });
    expect(deployShip(afterP2, "p1", 12, HOME_RING).success).toBe(true);
  });

  it.each([
    ["sector 24", 24],
    ["sector -1", -1],
    ["a fractional sector", 1.5],
    ["an occupied sector", 5],
  ])("rejects deploying on %s", (_label, sector) => {
    let state = readyToDeploy();
    state = deployShip(state, "p2", 5, HOME_RING).state; // p1 places next
    const result = deployShip(state, "p1", sector, HOME_RING);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.state).toBe(state);
    // Across the ring from p2 the same placement is taken.
    expect(deployShip(state, "p1", 17, HOME_RING).success).toBe(true);
  });

  it("rejects deploying outside the deployment phase or for unknown players", () => {
    // The last seat places first, so p2 is the one the deployment phase waits on.
    const ready = readyToDeploy();
    expect(deployShip(ready, "p2", 0, HOME_RING).success).toBe(true);
    expect(deployShip(createGame(SPECS, 1), "p2", 0, HOME_RING).success).toBe(false);
    expect(deployShip(ready, "p9", 0, HOME_RING).success).toBe(false);
  });

  it("becomes active once everyone has deployed, starting with the first player", () => {
    let state = readyToDeploy();
    expect(transitionToActivePhase(state)).toBe(state);
    state = deployShip(state, "p2", 0, HOME_RING).state;
    expect(transitionToActivePhase(state)).toBe(state);
    state = deployShip(state, "p1", 12, HOME_RING).state;
    const active = transitionToActivePhase(state);
    expect(active).toMatchObject({ phase: "active", activePlayerIndex: 0, turn: 1 });
  });

  it("no turns can be taken before the game is active", () => {
    const state = readyToDeploy();
    const result = executeTurn(state, [{ ...coast(1), playerId: "p1" }]);
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.gameState).toBe(state);
    // Once both ships are placed the same turn is taken.
    let active = deployShip(state, "p2", 12, HOME_RING).state;
    active = transitionToActivePhase(deployShip(active, "p1", 0, HOME_RING).state);
    expect(executeTurn(active, [{ ...coast(1), playerId: "p1" }]).errors).toBeUndefined();
  });

  it("a freshly started game plays: the first turn drifts the first ship two sectors", () => {
    let state = readyToDeploy();
    state = deployShip(state, "p2", 12, HOME_RING).state; // last seat places first
    state = deployShip(state, "p1", 0, HOME_RING).state;
    state = transitionToActivePhase(state);
    const next = mustExecute(state, coast(1));
    expect(getShip(next, "p1")).toMatchObject({ wellId: BH, ring: HOME_RING, sector: 2 });
    expect(next.activePlayerIndex).toBe(1);
  });
});
