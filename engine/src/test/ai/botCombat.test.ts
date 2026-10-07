/**
 * What the bot shoots at, and with what. Every fire action it proposes must
 * pass the engine's own range check at the moment it executes, so these
 * tests assert both the shape of the decision and that `executeTurn`
 * accepts it.
 */
import { describe, it, expect } from "vitest";
import type { FireWeaponAction, GameState, ShipLoadout } from "../../models/game.ts";
import type { SubsystemId } from "../../models/subsystems.ts";
import { FIRST_TURN } from "../../models/game.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { botDecideActions } from "../../ai/index.ts";
import { generateCandidates } from "../../ai/planner.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import {
  LOADOUTS,
  ALPHA,
  BH,
  destroyMission,
  escortMission,
  getShip,
  makePlayer,
  makeTwoPlayerGame,
  withMissions,
  withPlayer,
  withPower,
  withShip,
  withSub,
  grounded,
  planAgainst,
  expectBotTurnAccepted,
  playUntil,
  shotsOf,
  situationOf,
} from "../testUtils.ts";

/** Two ships one ring apart: p1's port lasers bear outward on p2. */
const duel = (p1 = LOADOUTS.gunship, p2 = LOADOUTS.gunship): GameState =>
  makeTwoPlayerGame(
    { wellId: BH, ring: 3, sector: 0, loadout: p1 },
    { wellId: BH, ring: 4, sector: 0, loadout: p2 }
  );

/** `duel` with a third ship, p3, a sector along from p2 and in the same arc. */
const crowd = (state: GameState): GameState => ({
  ...state,
  players: [
    ...state.players,
    { ...state.players[1], id: "p3", name: "p3", ship: { ...getShip(state, "p2"), sector: 1 } },
  ],
});

describe("bot targeting", () => {
  it("powers and fires two lasers of the same type independently", () => {
    // One round left in the launcher, which the bot keeps rather than spend on
    // a full-hull ship: the second laser is what is on trial.
    const state = withSub(grounded(duel(), "p1"), "p1", "side-3", { ammo: 1 });
    const decision = botDecideActions(viewFor(state, "p1"));
    const shots = decision.actions.filter((a): a is FireWeaponAction => a.type === "fire_weapon");

    const slots = shots.map((s) => s.data.subsystemId);
    expect(slots).toContain("side-0");
    expect(slots).toContain("side-1");
    expect(new Set(slots).size).toBe(slots.length);
    for (const shot of shots) expect(shot.data.targetPlayerId).toBe("p2");
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it.each<[string, (s: GameState) => GameState]>([
    // Outside the railgun's arc and every broadside, and too far for a missile.
    ["on the far side of the ring", (s) => withShip(s, "p2", { ring: 3, sector: 14 })],
    ["in another gravity well", (s) => withShip(s, "p2", { wellId: ALPHA, ring: 3, sector: 0 })],
    ["destroyed", (s) => withShip(s, "p2", { hitPoints: 0 })],
    ["back from Home and untouchable", (s) => withPlayer(s, "p2", { recovering: true })],
  ])("fires at and scans nobody when the only rival is %s", (_label, setup) => {
    const state = setup(grounded(duel(), "p1"));
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.filter((a) => a.type === "fire_weapon" || a.type === "scan")).toEqual(
      []
    );
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("launches at a target far outside every gun's arc, as long as the missile can close", () => {
    // Half an orbit away: no gun bears, but a missile is self-guided and its
    // three moves are enough to catch a coasting ship this far ahead.
    const state = withShip(grounded(duel(), "p1"), "p2", { ring: 3, sector: 11 });
    expect(shotsOf(state, "p1").map((a) => a.data.subsystemId)).toEqual(["side-3"]);
  });

  // Cubes are public and tiles face-down. Every shot of the volley names the
  // same slot on a critical.
  it.each<[string, ShipLoadout, (s: GameState) => GameState, SubsystemId]>([
    // Nothing is powered, so no tile can be told from another: the engines
    // are always there and always needed.
    ["the engines when there is not a cube anywhere", LOADOUTS.gunship, (s) => s, "engines"],
    // Four cubes on a face-down bow stand through the bot's turn, and breaking
    // the slot dumps them as heat.
    [
      "a loaded face-down slot over the engines",
      LOADOUTS.gunship,
      (s) => withSub(s, "p2", "forward-0", { allocatedEnergy: 4 }),
      "forward-0",
    ],
    // A face-up shield with cubes on it is soaking this volley, and the cubes
    // prove it is not broken already.
    [
      "a revealed tile that is powered over the engines",
      LOADOUTS.gunship,
      (s) => withPower(withSub(s, "p2", "side-2", { isRevealed: true }), "p2", "side-2", 2),
      "side-2",
    ],
    // Breaking a broken tile does nothing at all, and the break is public:
    // with the engines gone the thrusters are the tile every ship still has.
    [
      "the thrusters when the engines and the bow are seen broken",
      LOADOUTS.gunship,
      (s) =>
        withSub(
          withSub(s, "p2", "forward-0", { isRevealed: true, isBroken: true }),
          "p2",
          "engines",
          {
            isBroken: true,
          }
        ),
      "rotation",
    ],
    // Guns are dark between turns, so among the guns seen the choice is damage.
    [
      "the biggest gun it has seen, lit or not",
      LOADOUTS.starboardLaser,
      (s) =>
        withSub(withSub(s, "p2", "side-0", { isRevealed: true }), "p2", "forward-0", {
          isRevealed: true,
        }),
      "forward-0",
    ],
    [
      "a seen disruptor as a gun worth a laser, ahead of it in slot order",
      LOADOUTS.disruptorLaser,
      (s) =>
        withSub(withSub(s, "p2", "side-0", { isRevealed: true }), "p2", "forward-0", {
          isRevealed: true,
        }),
      "forward-0",
    ],
  ])("names %s on the critical", (_label, loadout, setup, slot) => {
    const state = setup(grounded(duel(LOADOUTS.gunship, loadout), "p1"));
    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.map((s) => s.data.criticalTarget)).toEqual(shots.map(() => slot));
    expectBotTurnAccepted(state, "p1");
  });

  it("closes on a Destroy target and grinds its hull down", () => {
    // The prey coasts and never shoots back; the hunter has to find it,
    // line up and keep firing across many turns.
    let state = withMissions(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.gunship },
        { wellId: BH, ring: 4, sector: 12 }
      ),
      "p1",
      [destroyMission("p2")]
    );
    let lowestHull = getShip(state, "p2").hitPoints;

    state = playUntil(state, "p1", () => false, 40, {
      after: (s) => {
        lowestHull = Math.min(lowestHull, getShip(s, "p2").hitPoints);
      },
    });

    expect(lowestHull).toBeLessThan(getShip(state, "p2").maxHitPoints);
  });

  it("hunts a Destroy target instead of a bystander when both are in range", () => {
    const state = withMissions(grounded(crowd(duel()), "p1"), "p1", [destroyMission("p3")]);
    const shots = shotsOf(state, "p1");
    // The whole magazine is one use of the tile, so the launcher empties into
    // the Destroy target and a laser covers the rest of its ten hull. Only the
    // gun that would otherwise be shooting a corpse goes to the bystander.
    expect(shots[0].data.targetPlayerId).toBe("p3");
    expect(shots.find((s) => s.data.subsystemId === "side-3")?.data).toMatchObject({
      targetPlayerId: "p3",
      count: 4,
    });
    expect(shots.filter((s) => s.data.targetPlayerId === "p2")).toHaveLength(1);
  });
});

describe("bot lethality estimates", () => {
  // The bot's own estimate of a volley at p2, as its planner prices it.
  it.each<[string, ShipLoadout, number, (s: GameState) => GameState, number, boolean]>([
    // Two port lasers, four damage, against three hull and no shield cubes.
    ["nothing between the volley and the hull", LOADOUTS.gunship, 3, (s) => s, 4, true],
    // One rack round against two hull: one face-up shield cube stops a point.
    [
      "a shield cube it can see",
      LOADOUTS.railgunRack,
      2,
      (s) => withPower(withSub(s, "p2", "side-2", { isRevealed: true }), "p2", "side-2", 1),
      1,
      false,
    ],
    // Shields do not stop a laser: a full face-up wall changes nothing.
    [
      "lasers into a full wall",
      LOADOUTS.gunship,
      3,
      (s) => withPower(withSub(s, "p2", "side-2", { isRevealed: true }), "p2", "side-2", 2),
      4,
      true,
    ],
    // The rack and one missile (four shielded damage) against two face-down
    // cubes, which may be a rack: half a wall, so three of the four land.
    [
      "two face-down side cubes, priced as half a wall",
      LOADOUTS.slugger,
      4,
      (s) => withSub(withPower(s, "p2", "side-2", 2), "p1", "side-3", { ammo: 1 }),
      3,
      false,
    ],
  ])("against %s", (_label, loadout, hull, setup, hullDamage, kills) => {
    const state = setup(
      withShip(grounded(duel(loadout, LOADOUTS.gunship), "p1"), "p2", { hitPoints: hull })
    );
    const plan = planAgainst(state, "p1", "p2");
    expect(plan.expectedHullDamage).toBe(hullDamage);
    expect(plan.killsTarget).toBe(kills);
  });
});

/**
 * A salvo is any number of the tile's rounds in one launch for one use of the
 * tile, so heat no longer prices its size: the only reason to hold rounds back
 * is the next target. The bot spends the fewest that finish the job, and the
 * whole magazine when none of them does.
 */
describe("bot salvos", () => {
  /** Nothing aboard but the launcher, so the salvo is the whole volley. */
  const launcherAgainst = (hull: number, heat = 0): GameState => {
    const base = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.missileBow },
        { wellId: BH, ring: 4, sector: 0 }
      ),
      "p1"
    );
    return withShip(withShip(base, "p2", { hitPoints: hull }), "p1", {
      heat: { currentHeat: heat },
    });
  };

  const salvoAt = (state: GameState): number => {
    const shots = shotsOf(state, "p1");
    expect(shots).toHaveLength(1);
    return shots[0].data.count ?? 1;
  };

  it.each([
    // Four hull, two damage a missile: two rounds, and the other two stay aboard.
    ["exactly the rounds that finish a ship", 4, 0, 2],
    // Ten hull against four rounds of two: nothing finishes it, so everything goes.
    ["the whole magazine at a ship it cannot finish", 10, 0, 4],
    // Six heat carried used to leave room for two missiles at two heat each. A
    // salvo of any size is the tile's two cubes once, so the budget buys all four.
    ["the whole magazine whatever the heat carried", 10, 6, 4],
  ])("spends %s (hull %i, heat %i)", (_label, hull, heat, rounds) => {
    const state = launcherAgainst(hull, heat);
    expect(salvoAt(state)).toBe(rounds);
    expectBotTurnAccepted(state, "p1");
  });
});

describe("bot does not shoot corpses", () => {
  it("routes the rest of the volley to a second target once the first is covered", () => {
    // p2 has one hull left: the first laser covers it, and p3 sits in the same arc.
    const state = withShip(grounded(crowd(duel()), "p1"), "p2", { hitPoints: 1 });
    const shots = shotsOf(state, "p1");
    expect(shots.filter((s) => s.data.targetPlayerId === "p2")).toHaveLength(1);
    expect(shots.filter((s) => s.data.targetPlayerId === "p3").length).toBeGreaterThan(0);
    expectBotTurnAccepted(state, "p1");
  });

  it("stops firing rather than overkill when there is no second target", () => {
    const state = withShip(grounded(duel(), "p1"), "p2", { hitPoints: 1 });
    expect(shotsOf(state, "p1")).toHaveLength(1);
  });

  it("shoots the other ship when one in the arc is back from Home", () => {
    const state = withPlayer(grounded(crowd(duel()), "p1"), "p2", { recovering: true });
    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((s) => s.data.targetPlayerId === "p3")).toBe(true);
    expectBotTurnAccepted(state, "p1");
  });
});

/**
 * Escort markers are public (`PlayerView.escortedBy`). A rival's marker on a
 * ship is a point that dies with it, so it counts like cargo aboard; the
 * bot's own marker is a point that pays when the ship delivers, so the bot
 * never fires on it.
 */
describe("bot reads the Escort markers", () => {
  /** p2 and p3 identical and in the same arc; p4, far away, may hold an Escort. */
  const pair = (): GameState => {
    const state = crowd(grounded(duel(), "p1"));
    return {
      ...state,
      players: [...state.players, makePlayer("p4", { wellId: ALPHA, ring: 3, sector: 0 })],
    };
  };

  /** The ship every candidate that fires at anyone fires at first. */
  const chosenTargets = (state: GameState) => {
    const situation = situationOf(state, "p1");
    return new Set(
      generateCandidates(situation, DEFAULT_BOT_PARAMETERS)
        .map((c) => c.targetId)
        .filter((id): id is string => id !== undefined)
    );
  };

  it.each(["p2", "p3"])("a hunter picks the carrier a rival escorts, %s", (escorted) => {
    const state = withMissions(pair(), "p4", [escortMission("escort-p4", escorted)]);
    expect(chosenTargets(state)).toEqual(new Set([escorted]));
    const shots = shotsOf(state, "p1");
    expect(shots[0]?.data.targetPlayerId).toBe(escorted);
    expectBotTurnAccepted(state, "p1");
  });

  // A dead escort's marker comes off its carrier: the carrier sheds it by
  // shooting the escort down.
  it.each(["p2", "p3"])("a carrier picks the rival whose marker is on it, %s", (escort) => {
    const state = withMissions(pair(), escort, [escortMission(`escort-${escort}`, "p1")]);
    expect(chosenTargets(state)).toEqual(new Set([escort]));
    expect(shotsOf(state, "p1")[0]?.data.targetPlayerId).toBe(escort);
  });

  it("weighs a rival's marker as denial, like a token aboard", () => {
    // The same volley at the same ship, with and without the marker on it.
    const alone = (state: GameState) => ({
      ...state,
      players: state.players.filter((p) => p.id !== "p3"),
    });
    const plain = planAgainst(
      alone(withMissions(pair(), "p4", [escortMission("escort-p4", null)])),
      "p1",
      "p2"
    );
    const marked = planAgainst(
      alone(withMissions(pair(), "p4", [escortMission("escort-p4", "p2")])),
      "p1",
      "p2"
    );
    expect(marked.expectedHullDamage).toBe(plain.expectedHullDamage);
    expect(marked.denialValue).toBeGreaterThan(plain.denialValue);
  });

  it.each([
    ["the only ship in range", ["p3"]],
    ["one of two in range", []],
  ])("never fires on a ship it escorts itself, %s", (_label, removed) => {
    const base = withMissions(pair(), "p1", [escortMission("escort-p1", "p2")]);
    const state = { ...base, players: base.players.filter((p) => !removed.includes(p.id)) };
    const shots = shotsOf(state, "p1");
    expect(shots.some((s) => s.data.targetPlayerId === "p2")).toBe(false);
    if (removed.length === 0) expect(shots.length).toBeGreaterThan(0);
  });
});

/**
 * Its own turn back from Home is a first round of its own (RULES §Destruction
 * and Respawn): the bot may fly it, but it fires at nobody and scans nobody.
 */
describe("bot flies its own turn back from Home quietly", () => {
  it.each<[string, ShipLoadout, boolean, boolean]>([
    ["a gunship back from Home neither shoots nor scans", LOADOUTS.gunship, true, false],
    // A sensor bow over two lasers: the bot has both a shot and a scan to want.
    ["a sensor bow back from Home neither shoots nor scans", LOADOUTS.sensor, true, false],
    ["the same gunship shoots the turn after", LOADOUTS.gunship, false, true],
  ])("%s", (_what, loadout, recovering, acts) => {
    const base = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout },
        { wellId: BH, ring: 3, sector: 0 }
      ),
      "p1"
    );
    const state = withPlayer(base, "p1", { recovering });
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.some((a) => a.type === "fire_weapon" || a.type === "scan")).toBe(acts);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });
});

describe("bot turns the railgun only for a shot it may take", () => {
  /**
   * Railgun alone, facing prograde; after a coast on ring 3 the target sits
   * three sectors behind, so only a flip to retrograde gives it a shot.
   */
  const behind = (): GameState =>
    grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LOADOUTS.railgunOnly },
        { wellId: BH, ring: 3, sector: 1 }
      ),
      "p1"
    );
  const holdRotates = (state: GameState): boolean => {
    const situation = situationOf(state, "p1");
    const hold = generateCandidates(situation, DEFAULT_BOT_PARAMETERS).find((c) =>
      c.actions.some((a) => a.type === "coast" && !a.data.activateScoop)
    );
    return hold?.actions.some((a) => a.type === "rotate") ?? false;
  };

  it.each<[string, (s: GameState) => GameState, boolean]>([
    ["a shot it may take", (s) => s, true],
    ["the opening round", (s) => ({ ...s, turn: FIRST_TURN }), false],
    ["a target back from Home", (s) => withPlayer(s, "p2", { recovering: true }), false],
    [
      "a ship its own Escort marker sits on",
      (s) => withMissions(s, "p1", [escortMission("e", "p2")]),
      false,
    ],
  ])("with %s", (_label, setup, rotates) => {
    expect(getShip(behind(), "p1").facing).toBe("prograde");
    expect(holdRotates(setup(behind()))).toBe(rotates);
  });
});
