/**
 * How the bots fly the plasma cannon and the disruptor: shields price each
 * shot at its own rate (a shield cube stops two points of plasma), and the disruptor, which takes
 * no hull, fires only at a ship whose shields look down by the time it shoots.
 */
import { describe, it, expect } from "vitest";
import type { GameState } from "../../models/game.ts";
import type { SubsystemId } from "../../models/subsystems.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { botDecideActions } from "../../ai/index.ts";
import type { Opponent } from "../../ai/types.ts";
import { chooseDisruptTarget, disruptBlockChance, hullThrough } from "../../ai/behaviors/combat.ts";
import {
  LOADOUTS,
  BH,
  dataCargo,
  withPlayer,
  withPower,
  withSub,
  makeTwoPlayerGame,
  grounded,
  expectBotTurnAccepted,
  shotsOf,
  situationOf,
} from "../testUtils.ts";

describe("hullThrough: each shot spends the shield pool at its own rate", () => {
  const rail = { damage: 4, shieldPerCube: 1 };
  const rack = { damage: 2, shieldPerCube: 1 };
  const laser = { damage: 2, shieldPerCube: null };
  const plasma = { damage: 4, shieldPerCube: 2 };

  // What a wall stops of each weapon is the engine's (damage.test); these are
  // the bot's half-weight guesses and the order a volley spends the pool in.
  it.each<[string, Array<{ damage: number; shieldPerCube: number | null }>, number, number]>([
    ["a rack and a laser against a half-weight guess", [rack, laser], 0.5, 3.5],
    ["plasma against a half-weight guess", [plasma], 0.5, 3],
    // The railgun spends both cubes on two points; the plasma finds none.
    ["a railgun then plasma against a full wall", [rail, plasma], 2, 6],
    // Plasma first spends both cubes on all four points; the railgun lands whole.
    ["plasma then a railgun against a full wall", [plasma, rail], 2, 4],
    // Plasma takes two of three cubes, and the third stops a point of railgun.
    ["plasma then a railgun against three cubes", [plasma, rail], 3, 3],
  ])("%s", (_label, shots, absorption, hull) => {
    expect(hullThrough(shots, absorption)).toBe(hull);
  });
});

describe("the disruptor fires only at a ship whose shields look down", () => {
  /** p1's disruptor a sector behind p2 on the same ring. */
  const duel = () =>
    grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.disruptor },
        { wellId: BH, ring: 3, sector: 1, loadout: LOADOUTS.gunship }
      ),
      "p1"
    );
  const revealed = (state: GameState, slot: SubsystemId) =>
    withSub(state, "p2", slot, { isRevealed: true });

  it.each<[string, (s: GameState) => GameState, boolean]>([
    ["no cubes anywhere", (s) => s, true],
    [
      "a face-up shield holding one cube",
      (s) => withPower(revealed(s, "side-2"), "p2", "side-2", 1),
      false,
    ],
    ["a face-up shield with no cubes", (s) => revealed(s, "side-2"), true],
    [
      "one cube on a face-down side slot (only a shield holds one)",
      (s) => withPower(s, "p2", "side-2", 1),
      false,
    ],
    [
      "two cubes on a face-down side slot (a wall or a rack)",
      (s) => withPower(s, "p2", "side-2", 2),
      true,
    ],
    [
      "two cubes on each of two face-down side slots",
      (s) => withPower(withPower(s, "p2", "side-2", 2), "p2", "side-3", 2),
      false,
    ],
    [
      "one cube on a face-down bow (only a shield holds one)",
      (s) => withPower(s, "p2", "forward-0", 1),
      false,
    ],
    [
      "two cubes on a face-down bow (a sensor or a full wall)",
      (s) => withPower(s, "p2", "forward-0", 2),
      true,
    ],
  ])("with %s", (_label, setup, fires) => {
    const state = setup(duel());
    expectBotTurnAccepted(state, "p1");
    const shots = shotsOf(state, "p1");
    expect(shots.some((s) => s.data.subsystemId === "forward-0")).toBe(fires);
  });

  it.each<[string, number, number]>([
    ["a sector behind", 3, 23],
    ["a ring out and a sector ahead", 4, 1],
  ])("fires at a ship %s without turning", (_label, ring, sector) => {
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.disruptor },
        { wellId: BH, ring, sector, loadout: LOADOUTS.gunship }
      ),
      "p1"
    );
    const actions = botDecideActions(viewFor(state, "p1")).actions;
    expect(actions.some((a) => a.type === "rotate")).toBe(false);
    expect(
      actions.some((a) => a.type === "fire_weapon" && a.data.subsystemId === "forward-0")
    ).toBe(true);
    expect(executeTurn(state, actions).errors).toBeUndefined();
  });
});

describe("plasma strips a wall and the disruptor follows it in", () => {
  /** Point blank on ring 3: the port plasma and the disruptor both bear. */
  const pointBlank = (walls: Array<[SubsystemId, number]>) =>
    walls.reduce(
      (state, [slot, cubes]) =>
        withPower(withSub(state, "p2", slot, { isRevealed: true }), "p2", slot, cubes),
      grounded(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.disruptorPlasma },
          // Two walls, so a second one can still be standing after the plasma.
          { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.twoShields }
        ),
        "p1"
      )
    );

  it.each([
    [
      "a half wall: the plasma takes its cube, then the disruptor fires",
      [["side-2", 1]],
      ["side-0", "forward-0"],
    ],
    [
      "a full wall: the plasma takes both cubes, then the disruptor fires",
      [["side-2", 2]],
      ["side-0", "forward-0"],
    ],
    [
      "a second wall still standing after the plasma: the disruptor holds",
      [
        ["side-2", 2],
        ["side-3", 1],
      ],
      ["side-0"],
    ],
  ] as Array<[string, Array<[SubsystemId, number]>, SubsystemId[]]>)(
    "%s",
    (_label, walls, fired) => {
      const state = pointBlank(walls);
      expectBotTurnAccepted(state, "p1");
      const shots = shotsOf(state, "p1");
      expect(shots.map((s) => s.data.subsystemId)).toEqual(fired);
      for (let i = 1; i < shots.length; i++)
        expect(shots[i - 1].sequence).toBeLessThan(shots[i].sequence!);
    }
  );
});

describe("a salvo that lands on its launch flight strips a wall for the disruptor", () => {
  /**
   * p1 grounded on ring 3, four sectors astern of p2: its coast (ring 3
   * drifts four) puts it on p2's sector, where its launcher and its
   * disruptor both bear after the move. p2's face-up wall holds one cube.
   */
  const pointBlank = (rackUp: boolean) => {
    let state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.sensorMissilesDisruptor },
        { wellId: BH, ring: 3, sector: 4, loadout: LOADOUTS.rack }
      ),
      "p1"
    );
    state = withPower(withSub(state, "p2", "side-2", { isRevealed: true }), "p2", "side-2", 1);
    if (rackUp)
      state = withPower(withSub(state, "p2", "side-0", { isRevealed: true }), "p2", "side-0", 2);
    return state;
  };

  it.each<[string, boolean, SubsystemId[]]>([
    ["no rack to answer it: the salvo, then the disruptor", false, ["side-0", "side-1"]],
    ["a rack up to shoot it down: the disruptor holds", true, ["side-0"]],
  ])("%s", (_label, rackUp, fired) => {
    const state = pointBlank(rackUp);
    expectBotTurnAccepted(state, "p1");
    const shots = shotsOf(state, "p1");
    expect(shots.map((s) => s.data.subsystemId)).toEqual(fired);
  });
});

/** The opponent p1 sees, after `setup` on a plain duel. */
function opponent(setup: (s: GameState) => GameState): Opponent {
  const state = setup(
    makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.disruptor },
      { wellId: BH, ring: 3, sector: 3, loadout: LOADOUTS.gunship }
    )
  );
  return situationOf(state, "p1").opponents[0];
}

// The plain readings (no cubes, one cube face-up or face-down) are the firing
// table's above; these are the guess and what earlier shots strip.
describe("disruptBlockChance: two cubes are a guess, and a shot first strips them", () => {
  const rail = { damage: 4, shieldPerCube: 1 };
  const plasma = { damage: 4, shieldPerCube: 2 };
  const laser = { damage: 2, shieldPerCube: null };
  const faceUp = (slot: SubsystemId, cubes: number) => (s: GameState) =>
    withPower(withSub(s, "p2", slot, { isRevealed: true }), "p2", slot, cubes);
  const faceDown = (slot: SubsystemId, cubes: number) => (s: GameState) =>
    withPower(s, "p2", slot, cubes);
  const all =
    (...steps: Array<(s: GameState) => GameState>) =>
    (s: GameState) =>
      steps.reduce((acc, step) => step(acc), s);

  it.each<
    [
      string,
      (s: GameState) => GameState,
      Array<{ damage: number; shieldPerCube: number | null }>,
      number,
    ]
  >([
    [
      "a broken face-up shield",
      all(faceUp("side-2", 2), (s) => withSub(s, "p2", "side-2", { isBroken: true })),
      [],
      0,
    ],
    ["two cubes on a face-down side slot: a shield or a rack", faceDown("side-2", 2), [], 0.5],
    ["a railgun first strips two face-down cubes", faceDown("side-2", 2), [rail], 0],
    ["a laser first strips nothing", faceDown("side-2", 1), [laser], 1],
    [
      "plasma first leaves a second shield standing",
      all(faceUp("side-2", 2), faceDown("side-3", 1)),
      [plasma],
      1,
    ],
  ])("%s", (_label, setup, before, chance) => {
    expect(disruptBlockChance(opponent(setup), before)).toBe(chance);
  });
});

describe("chooseDisruptTarget", () => {
  const up =
    (slot: SubsystemId, cubes = 0) =>
    (s: GameState) =>
      withPower(withSub(s, "p2", slot, { isRevealed: true }), "p2", slot, cubes);
  const all =
    (...steps: Array<(s: GameState) => GameState>) =>
    (s: GameState) =>
      steps.reduce((acc, step) => step(acc), s);
  const carrying = (s: GameState) => withPlayer(s, "p2", { cargo: [dataCargo()] });

  it.each<[string, (s: GameState) => GameState, "kill" | "suppress", SubsystemId]>([
    [
      "kill: a face-up shield before a loaded gun",
      all(up("side-2"), up("forward-0", 4)),
      "kill",
      "side-2",
    ],
    [
      "suppress: a loaded gun before a face-up shield",
      all(up("side-2"), up("forward-0", 4)),
      "suppress",
      "forward-0",
    ],
    [
      "the gun holding the most cubes",
      all(up("forward-0", 0), up("side-0", 2)),
      "suppress",
      "side-0",
    ],
    [
      "the biggest known gun when none holds cubes",
      all(up("side-0"), up("forward-0")),
      "suppress",
      "forward-0",
    ],
    [
      "the engines of a carrier with no gun known",
      all(carrying, (s) => withPower(s, "p2", "side-3", 2)),
      "suppress",
      "engines",
    ],
    [
      "what a critical would name, without cargo",
      (s) => withPower(s, "p2", "side-3", 2),
      "suppress",
      "side-3",
    ],
    [
      "never a broken shield",
      all(up("side-2"), (s) => withSub(s, "p2", "side-2", { isBroken: true }), up("side-0")),
      "kill",
      "side-0",
    ],
    [
      "never broken engines",
      all(
        carrying,
        (s) => withSub(s, "p2", "engines", { isBroken: true }),
        (s) => withPower(s, "p2", "side-3", 2)
      ),
      "suppress",
      "side-3",
    ],
  ])("%s", (_label, setup, intent, slot) => {
    expect(chooseDisruptTarget(opponent(setup), intent)).toBe(slot);
  });
});

describe("a known disruptor is a gun to the bots", () => {
  it("is a threat in range, and the bot puts a wall up against it", () => {
    // p2's disruptor, the only gun aboard, a sector behind p1: it bears on
    // p1. p1 has nothing to shoot with, so the wall is
    // what its heat buys.
    const state = withSub(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 1, loadout: LOADOUTS.unarmed },
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.disruptor }
      ),
      "p2",
      "forward-0",
      { isRevealed: true }
    );
    const situation = situationOf(state, "p1");
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
