import { describe, it, expect } from "vitest";
import {
  checkAllDeployed,
  deployShip,
  deploymentPositions,
  getAvailableDeploymentSectors,
  transitionToActivePhase,
} from "../../game/deployment.ts";
import { createGame, createPlayer, submitLoadout } from "../../game/setup.ts";
import {
  calculateShipStatsFromLoadout,
  canInstallInSlot,
  FORWARD_SLOT_SUBSYSTEMS,
  createSubsystemsFromLoadout,
  missionRequirementStatus,
  missionsMissingRequirements,
} from "../../game/loadout.ts";
import { describeMission, describeMissionRequirement } from "../../game/describe.ts";
import type { SubsystemType } from "../../models/subsystems.ts";
import { WEAPON_SUBSYSTEM_TYPES } from "../../models/subsystems.ts";
import type { Mission, MissionRequirement } from "../../models/missions.ts";
import { MISSION_OFFERS_PER_PLAYER, MISSION_REQUIREMENTS } from "../../models/missions.ts";
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
  withPlayer,
} from "../testUtils.ts";

const SPECS = [
  { id: "p1", name: "Ada" },
  { id: "p2", name: "Bo" },
];

const pickFirst3 = (state: GameState, playerId: string) =>
  getPlayer(state, playerId)
    .missionOffers.slice(0, 3)
    .map((m) => m.id);

/**
 * A mat that can fly any hand: the sensor array is what Intercept and Survey
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
    missionIds: pickFirst3(state, "p1"),
  }).state;
  state = submitLoadout(state, "p2", {
    loadout: ANY_HAND,
    missionIds: pickFirst3(state, "p2"),
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

  it("createPlayer builds an undeployed placeholder", () => {
    const player = createPlayer({ id: "x", name: "X" });
    expect(player).toMatchObject({
      id: "x",
      name: "X",
      hasDeployed: false,
      hasSubmittedLoadout: false,
      home: null,
    });
    expect(player.ship.loadout).toEqual(DEFAULT_LOADOUT);
  });
});

describe("setup: submitLoadout", () => {
  const custom: ShipLoadout = {
    forwardSlots: ["sensor_array"],
    sideSlots: ["radiator", "missiles", "shields", "ballistic_rack"],
  };

  it("records the loadout and mission picks, issuing crates for deliver missions", () => {
    const start = createGame(SPECS, 3);
    const ids = pickFirst3(start, "p1");
    const { state, error } = submitLoadout(start, "p1", { loadout: custom, missionIds: ids });
    expect(error).toBeUndefined();
    const p1 = getPlayer(state, "p1");
    expect(p1.hasSubmittedLoadout).toBe(true);
    expect(p1.missions.map((m) => m.id)).toEqual(ids);
    expect(p1.ship.subsystems.find((s) => s.id === "forward-0")?.type).toBe("sensor_array");
    expect(p1.ship.subsystems.find((s) => s.id === "side-3")?.type).toBe("ballistic_rack");
    expect(p1.cargo).toHaveLength(p1.missions.filter((m) => m.type === "deliver_cargo").length);
    expect(state.phase).toBe("loadout");
    expect(getPlayer(state, "p2").hasSubmittedLoadout).toBe(false);
  });

  it("moves to deployment once everyone has submitted, last seat placing first", () => {
    const state = readyToDeploy();
    expect(state.phase).toBe("deployment");
    expect(state.activePlayerIndex).toBe(1);
  });

  it.each([
    [
      "the wrong phase",
      (s: GameState) => ({ ...s, phase: "active" as const }),
      "p1",
      DEFAULT_LOADOUT,
      3,
      /phase/i,
    ],
    ["an unknown player", (s: GameState) => s, "p9", DEFAULT_LOADOUT, 3, /not found/i],
    [
      "an invalid loadout",
      (s: GameState) => s,
      "p1",
      { forwardSlots: ["laser"], sideSlots: ["laser", "laser", "laser", "laser"] } as ShipLoadout,
      3,
      /forward slot/i,
    ],
    ["too few missions", (s: GameState) => s, "p1", DEFAULT_LOADOUT, 2, /exactly 3/i],
  ])(
    "rejects %s and returns the state unchanged",
    (_label, prep, playerId, loadout, picks, message) => {
      const state = prep(createGame(SPECS, 3));
      const offers = state.players[0].missionOffers.slice(0, picks).map((m) => m.id);
      const result = submitLoadout(state, playerId, { loadout, missionIds: offers });
      expect(result.error).toMatch(message);
      expect(result.state).toBe(state);
    }
  );

  it("rejects missions that were not offered and a second submission", () => {
    const start = createGame(SPECS, 3);
    const foreign = submitLoadout(start, "p1", {
      loadout: DEFAULT_LOADOUT,
      missionIds: pickFirst3(start, "p2"),
    });
    expect(foreign.error).toMatch(/not found in your offers/i);
    const once = submitLoadout(start, "p1", {
      loadout: ANY_HAND,
      missionIds: pickFirst3(start, "p1"),
    }).state;
    const twice = submitLoadout(once, "p1", {
      loadout: ANY_HAND,
      missionIds: pickFirst3(start, "p1"),
    });
    expect(twice.error).toMatch(/already submitted/i);
  });
});

describe("setup: a kept card the mat can never fly", () => {
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
    ["a Survey", surveyMission(), [SENSOR_ARRAY], []],
  ];

  it.each(CARDS)("%s knows what each mat lacks for it", (_label, mission, onGunship, onUnarmed) => {
    const gaps = (missing: MissionRequirement[]) =>
      missing.length > 0 ? [{ mission, missing }] : [];
    expect(missionsMissingRequirements([mission], GUNSHIP)).toEqual(gaps(onGunship));
    expect(missionsMissingRequirements([mission], UNARMED)).toEqual(gaps(onUnarmed));
    // ANY_HAND carries both a gun and the array, so it can fly every card.
    expect(missionsMissingRequirements([mission], ANY_HAND)).toEqual([]);
  });

  /** A mat whose only weapon is `type`; everything else aboard is passive. */
  const armedWith = (type: SubsystemType): ShipLoadout =>
    canInstallInSlot(type, "forward")
      ? { forwardSlots: [type], sideSlots: ["shields", "shields", "radiator", "radiator"] }
      : {
          forwardSlots: ["sensor_array"],
          sideSlots: [type, "shields", "radiator", "radiator"],
        };

  it.each(WEAPON_SUBSYSTEM_TYPES)("a Destroy card flies on a mat whose only gun is %s", (type) => {
    expect(missionsMissingRequirements([destroyMission("p2")], armedWith(type))).toEqual([]);
  });

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

  it.each([
    ["an Intercept on a hull with no sensor array", interceptMission("p2"), GUNSHIP, SENSOR_ARRAY],
    ["a Survey on a hull with no sensor array", surveyMission(), GUNSHIP, SENSOR_ARRAY],
    ["a Destroy on a hull with no weapon", destroyMission("p2"), UNARMED, WEAPON],
  ] as Array<[string, Mission, ShipLoadout, MissionRequirement]>)(
    "refuses %s, naming the card and what it needs",
    (_label, card, loadout, requirement) => {
      const hand = [
        card,
        deliverMission("planet-alpha", "planet-beta"),
        deliverMission("planet-beta", "planet-gamma"),
      ];
      const state = offered(hand);
      const result = submitLoadout(state, "p1", {
        loadout,
        missionIds: hand.map((m) => m.id),
      });
      expect(result.state).toBe(state);
      expect(result.error).toContain(describeMission(card, () => "Bo"));
      expect(result.error).toContain(describeMissionRequirement(requirement));
    }
  );

  it("accepts a hand needing both once the array and a gun are aboard", () => {
    const hand = [interceptMission("p2"), surveyMission(), destroyMission("p2")];
    const state = offered(hand);
    const result = submitLoadout(state, "p1", {
      loadout: ANY_HAND,
      missionIds: hand.map((m) => m.id),
    });
    expect(result.error).toBeUndefined();
    expect(getPlayer(result.state, "p1").missions.map((m) => m.id)).toEqual(hand.map((m) => m.id));
  });

  it("lets an unflyable card be left in the offers: only kept cards are checked", () => {
    const keep = [
      deliverMission("planet-alpha", "planet-beta"),
      deliverMission("planet-beta", "planet-gamma"),
      surveyMission("survey-keep"),
    ];
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
  it("canInstallInSlot follows the slot types", () => {
    expect(canInstallInSlot("railgun", "forward")).toBe(true);
    expect(canInstallInSlot("railgun", "side")).toBe(false);
    expect(canInstallInSlot("shields", "forward")).toBe(false);
    expect(canInstallInSlot("missiles", "forward")).toBe(true);
    expect(canInstallInSlot("missiles", "side")).toBe(true);
    expect(canInstallInSlot("engines", "side")).toBe(false);
    // The forward slot is the ship's identity: a gun, eyes, or legs.
    expect(canInstallInSlot("fuel_compressor", "forward")).toBe(true);
    expect(canInstallInSlot("fuel_compressor", "side")).toBe(false);
  });

  it("offers exactly three tiles for the forward slot: a gun, eyes, and legs", () => {
    expect(new Set(FORWARD_SLOT_SUBSYSTEMS)).toEqual(
      new Set(["railgun", "sensor_array", "fuel_compressor"])
    );
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
      isPowered: false,
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
    // Radiators are the only passive a mat can stack: the tank is 10 on every ship.
    expect(calculateShipStatsFromLoadout(passive)).toEqual({
      dissipationCapacity: 9,
      reactionMass: 10,
    });
  });
});

describe("deployment", () => {
  it("offers every sector of Black Hole Ring 4", () => {
    const positions = deploymentPositions();
    expect(positions).toHaveLength(24);
    expect(positions.every((p) => p.ring === HOME_RING && p.wellId === BH)).toBe(true);
    expect(getAvailableDeploymentSectors(readyToDeploy())).toHaveLength(24);
  });

  it("places the ship facing prograde and plants the Home marker there", () => {
    const result = deployShip(readyToDeploy(), "p2", 9);
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
    expect(getAvailableDeploymentSectors(result.state)).not.toContain(9);
  });

  it("deploys in reverse turn order: the last seat first, the first seat last", () => {
    const state = readyToDeploy();
    expect(deployShip(state, "p1", 9)).toMatchObject({
      success: false,
      error: /turn/i,
      state,
    });
    const afterP2 = deployShip(state, "p2", 0).state;
    expect(deployShip(afterP2, "p2", 1).error).toMatch(/already deployed/i);
    expect(deployShip(afterP2, "p1", 23).success).toBe(true);
  });

  it.each([
    ["sector 24", 24, /out of range/i],
    ["sector -1", -1, /out of range/i],
    ["a fractional sector", 1.5, /out of range/i],
    ["an occupied sector", 5, /occupied/i],
  ])("rejects deploying on %s", (_label, sector, message) => {
    let state = readyToDeploy();
    state = deployShip(state, "p2", 5).state; // p1 places next
    const result = deployShip(state, "p1", sector);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(message);
    expect(result.state).toBe(state);
  });

  it("rejects deploying outside the deployment phase or for unknown players", () => {
    expect(deployShip(createGame(SPECS, 1), "p1", 0).error).toMatch(/deployment phase/i);
    expect(deployShip(readyToDeploy(), "p9", 0).error).toMatch(/not found/i);
  });

  it("becomes active once everyone has deployed, starting with the first player", () => {
    let state = readyToDeploy();
    expect(transitionToActivePhase(state)).toBe(state);
    state = deployShip(state, "p2", 0).state;
    expect(checkAllDeployed(state)).toBe(false);
    state = deployShip(state, "p1", 12).state;
    expect(checkAllDeployed(state)).toBe(true);
    const active = transitionToActivePhase(state);
    expect(active).toMatchObject({ phase: "active", activePlayerIndex: 0, turn: 1 });
  });

  it("no turns can be taken before the game is active", () => {
    const state = readyToDeploy();
    const result = executeTurn(state, [{ ...coast(1), playerId: "p1" }]);
    expect(result.errors?.[0]).toMatch(/phase/i);
    expect(result.gameState).toBe(state);
  });

  it("a freshly started game plays: the first turn drifts the first ship two sectors", () => {
    let state = readyToDeploy();
    state = deployShip(state, "p2", 12).state; // last seat places first
    state = deployShip(state, "p1", 0).state;
    state = transitionToActivePhase(state);
    const next = mustExecute(state, coast(1));
    expect(getShip(next, "p1")).toMatchObject({ wellId: BH, ring: HOME_RING, sector: 2 });
    expect(next.activePlayerIndex).toBe(1);
  });
});
