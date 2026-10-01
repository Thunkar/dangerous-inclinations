/**
 * How the bots fly the plasma cannon and the disruptor: shields price each
 * shot at its own rate (plasma a cube a point), and the disruptor, which takes
 * no hull, fires only at a ship whose shields look down by the time it shoots.
 */
import { describe, it, expect } from "vitest";
import type { FireWeaponAction, GameState, ShipLoadout } from "../../models/game.ts";
import type { SubsystemId } from "../../models/subsystems.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { missionsMissingRequirements } from "../../game/loadout.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import type { Opponent } from "../../ai/types.ts";
import {
  chooseCriticalTarget,
  chooseDisruptTarget,
  hullThrough,
} from "../../ai/behaviors/combat.ts";
import { selectBotMissions } from "../../ai/behaviors/loadout.ts";
import {
  BH,
  dataCargo,
  deliverMission,
  destroyMission,
  escortMission,
  interceptMission,
  piracyMission,
  surveyMission,
  tankerMission,
  withPlayer,
  withPower,
  withShip,
  withSub,
  makeTwoPlayerGame,
  ALPHA,
  BETA,
} from "../testUtils.ts";

describe("hullThrough: each shot spends the shield pool at its own rate", () => {
  const rail = { damage: 4, shieldRate: 2 };
  const rack = { damage: 2, shieldRate: 2 };
  const laser = { damage: 2, shieldRate: null };
  const plasma = { damage: 3, shieldRate: 1 };

  it.each<[string, Array<{ damage: number; shieldRate: number | null }>, number, number]>([
    // At the default rate only: direct + max(0, shielded - absorption).
    ["a railgun against a full wall", [rail], 2, 2],
    ["a railgun and a rack against a full wall", [rail, rack], 2, 4],
    ["a laser past a full wall", [laser], 2, 2],
    ["a rack and a laser against a half point", [rack, laser], 0.5, 3.5],
    ["a rack into more wall than it has damage", [rack], 3, 0],
    // Plasma: a cube a point.
    ["plasma against four cubes", [plasma], 2, 0],
    ["plasma against two cubes", [plasma], 1, 1],
    // The railgun spends the four cubes on two points; the plasma finds none.
    ["a railgun then plasma against four cubes", [rail, plasma], 2, 5],
    // Plasma first leaves one cube, half a point of railgun.
    ["plasma then a railgun against four cubes", [plasma, rail], 2, 3.5],
  ])("%s", (_label, shots, absorption, hull) => {
    expect(hullThrough(shots, absorption)).toBe(hull);
  });
});

/** Disruptor bow, port plasma, a wall and radiators. */
const DISRUPTOR_PLASMA: ShipLoadout = {
  forwardSlots: ["disruptor"],
  sideSlots: ["plasma_cannon", "shields", "radiator", "radiator"],
};
/** Disruptor bow and nothing else that shoots. */
const DISRUPTOR_ONLY: ShipLoadout = {
  forwardSlots: ["disruptor"],
  sideSlots: ["shields", "shields", "radiator", "radiator"],
};
/** The target: railgun bow, lasers, shields at side-2, missiles. */
const TARGET: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};

/**
 * Engines broken so every candidate coasts from where the bot was put, and a
 * cube of heat so running cold to repair them is not on offer.
 */
function grounded(state: GameState, id: string): GameState {
  return withShip(withSub(state, id, "engines", { isBroken: true }), id, {
    heat: { currentHeat: 1 },
  });
}

function shotsOf(state: GameState, botId: string): FireWeaponAction[] {
  const actions = botDecideActions(viewFor(state, botId)).actions;
  expect(executeTurn(state, actions).errors).toBeUndefined();
  return actions.filter((a): a is FireWeaponAction => a.type === "fire_weapon");
}

describe("the disruptor fires only at a ship whose shields look down", () => {
  /** p1's disruptor three sectors behind p2 on the same ring. */
  const duel = () =>
    grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: DISRUPTOR_ONLY },
        { wellId: BH, ring: 3, sector: 3, loadout: TARGET }
      ),
      "p1"
    );
  const revealed = (state: GameState, slot: SubsystemId) =>
    withSub(state, "p2", slot, { isRevealed: true });

  it.each<[string, (s: GameState) => GameState, boolean]>([
    ["no cubes anywhere", (s) => s, true],
    ["a face-up shield holding two cubes", (s) => withPower(revealed(s, "side-2"), "p2", "side-2", 2), false],
    ["a face-up shield with no cubes", (s) => revealed(s, "side-2"), true],
    ["four cubes on a face-down side slot", (s) => withPower(s, "p2", "side-2", 4), false],
    ["two cubes on a face-down side slot (a wall or a rack)", (s) => withPower(s, "p2", "side-2", 2), true],
    [
      "two cubes on each of two face-down side slots",
      (s) => withPower(withPower(s, "p2", "side-2", 2), "p2", "side-3", 2),
      false,
    ],
    ["four cubes on a face-down bow", (s) => withPower(s, "p2", "forward-0", 4), false],
    ["two cubes on a face-down bow (a sensor or a half wall)", (s) => withPower(s, "p2", "forward-0", 2), true],
  ])("with %s", (_label, setup, fires) => {
    const shots = shotsOf(setup(duel()), "p1");
    expect(shots.some((s) => s.data.subsystemId === "forward-0")).toBe(fires);
  });

  it("turns to bring it to bear on a ship behind", () => {
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 3, loadout: DISRUPTOR_ONLY },
        { wellId: BH, ring: 3, sector: 0, loadout: TARGET }
      ),
      "p1"
    );
    const actions = botDecideActions(viewFor(state, "p1")).actions;
    expect(actions.some((a) => a.type === "rotate")).toBe(true);
    expect(
      actions.some((a) => a.type === "fire_weapon" && a.data.subsystemId === "forward-0")
    ).toBe(true);
    expect(executeTurn(state, actions).errors).toBeUndefined();
  });
});

describe("plasma strips a wall and the disruptor follows it in", () => {
  /** Two walls, so a second one can still be standing after the plasma. */
  const WALLS: ShipLoadout = {
    forwardSlots: ["railgun"],
    sideSlots: ["laser", "laser", "shields", "shields"],
  };
  /** Point blank on ring 3: the port plasma and the disruptor both bear. */
  const pointBlank = (walls: Array<[SubsystemId, number]>) =>
    walls.reduce(
      (state, [slot, cubes]) =>
        withPower(withSub(state, "p2", slot, { isRevealed: true }), "p2", slot, cubes),
      grounded(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: DISRUPTOR_PLASMA },
          { wellId: BH, ring: 3, sector: 0, loadout: WALLS }
        ),
        "p1"
      )
    );

  it.each([
    ["a half wall: the plasma takes both cubes, then the disruptor fires", [["side-2", 2]], ["side-0", "forward-0"]],
    ["a full wall: the plasma takes all four, then the disruptor fires", [["side-2", 4]], ["side-0", "forward-0"]],
    [
      "a second wall still standing after the plasma: the disruptor holds",
      [["side-2", 4], ["side-3", 2]],
      ["side-0"],
    ],
  ] as Array<[string, Array<[SubsystemId, number]>, SubsystemId[]]>)("%s", (_label, walls, fired) => {
    const shots = shotsOf(pointBlank(walls), "p1");
    expect(shots.map((s) => s.data.subsystemId)).toEqual(fired);
    for (let i = 1; i < shots.length; i++)
      expect(shots[i - 1].sequence).toBeLessThan(shots[i].sequence!);
  });
});

/** The opponent p1 sees, after `setup` on a plain duel. */
function opponent(setup: (s: GameState) => GameState, loadout: ShipLoadout = TARGET): Opponent {
  const state = setup(
    makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: DISRUPTOR_ONLY },
      { wellId: BH, ring: 3, sector: 3, loadout }
    )
  );
  return analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS).opponents[0];
}

describe("chooseDisruptTarget", () => {
  const up = (slot: SubsystemId, cubes = 0) => (s: GameState) =>
    withPower(withSub(s, "p2", slot, { isRevealed: true }), "p2", slot, cubes);
  const all =
    (...steps: Array<(s: GameState) => GameState>) =>
    (s: GameState) =>
      steps.reduce((acc, step) => step(acc), s);
  const carrying = (s: GameState) => withPlayer(s, "p2", { cargo: [dataCargo()] });

  it.each<[string, (s: GameState) => GameState, "kill" | "suppress", SubsystemId]>([
    ["kill: a face-up shield before a loaded gun", all(up("side-2"), up("forward-0", 4)), "kill", "side-2"],
    ["suppress: a loaded gun before a face-up shield", all(up("side-2"), up("forward-0", 4)), "suppress", "forward-0"],
    ["the gun holding the most cubes", all(up("forward-0", 0), up("side-0", 2)), "suppress", "side-0"],
    ["the biggest known gun when none holds cubes", all(up("side-0"), up("forward-0")), "suppress", "forward-0"],
    ["the engines of a carrier with no gun known", all(carrying, (s) => withPower(s, "p2", "side-3", 2)), "suppress", "engines"],
    ["what a critical would name, without cargo", (s) => withPower(s, "p2", "side-3", 2), "suppress", "side-3"],
    [
      "never a broken shield",
      all(up("side-2"), (s) => withSub(s, "p2", "side-2", { isBroken: true }), up("side-0")),
      "kill",
      "side-0",
    ],
    [
      "never broken engines",
      all(carrying, (s) => withSub(s, "p2", "engines", { isBroken: true }), (s) => withPower(s, "p2", "side-3", 2)),
      "suppress",
      "side-3",
    ],
  ])("%s", (_label, setup, intent, slot) => {
    expect(chooseDisruptTarget(opponent(setup), intent)).toBe(slot);
  });
});

describe("a known disruptor is a gun to the bots", () => {
  /** A disruptor bow beside a laser, both face-up and dark. */
  const RIVAL: ShipLoadout = {
    forwardSlots: ["disruptor"],
    sideSlots: ["laser", "shields", "radiator", "radiator"],
  };
  const known = (s: GameState) =>
    withSub(withSub(s, "p2", "forward-0", { isRevealed: true }), "p2", "side-0", {
      isRevealed: true,
    });

  it("a critical names it as a gun worth a laser, ahead of it in slot order", () => {
    expect(chooseCriticalTarget(opponent(known, RIVAL))).toBe("forward-0");
  });

  it("is a threat in range, and the bot puts a wall up against it", () => {
    // p2's disruptor, the only gun aboard, three sectors behind p1 and facing
    // prograde: it bears on p1. p1 has nothing to shoot with, so the wall is
    // what its heat buys.
    const WALLS: ShipLoadout = {
      forwardSlots: ["sensor_array"],
      sideSlots: ["shields", "shields", "radiator", "radiator"],
    };
    const state = withSub(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 3, loadout: WALLS },
        { wellId: BH, ring: 3, sector: 0, loadout: DISRUPTOR_ONLY }
      ),
      "p2",
      "forward-0",
      { isRevealed: true }
    );
    const situation = analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS);
    expect(situation.opponents[0].knownWeapons.map((w) => [w.type, w.inRange])).toEqual([
      ["disruptor", true],
    ]);
    expect(situation.opponents[0].threat).toBeGreaterThan(0);
    const wall = botDecideActions(viewFor(state, "p1")).actions.find(
      (a) => a.type === "power" && a.data.subsystemId === "side-0"
    );
    expect(wall?.type === "power" ? wall.data.amount : 0).toBeGreaterThanOrEqual(2);
  });
});

describe("a hull whose only gun is a disruptor", () => {
  it("keeps a hand it can fly, never a Destroy", () => {
    const offers = [
      destroyMission("p2"),
      interceptMission("p2"),
      deliverMission(ALPHA, BETA),
      surveyMission(),
      piracyMission(),
      tankerMission(),
      escortMission(),
    ];
    const hand = selectBotMissions(offers, DISRUPTOR_ONLY);
    expect(hand.map((m) => m.type)).not.toContain("destroy_ship");
    expect(missionsMissingRequirements(hand, DISRUPTOR_ONLY)).toEqual([]);
    expect(hand.map((m) => m.type)).toContain("deliver_cargo");
  });
});
