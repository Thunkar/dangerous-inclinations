/**
 * What the bot shoots at, and with what. Every fire action it proposes must
 * pass the engine's own range check at the moment it executes, so these
 * tests assert both the shape of the decision and that `executeTurn`
 * accepts it.
 */
import { describe, it, expect } from "vitest";
import type { FireWeaponAction, GameState, PlayerAction, ShipLoadout } from "../../models/game.ts";
import { FIRST_TURN } from "../../models/game.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { generateCandidates } from "../../ai/planner.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import type { ActionPlan } from "../../ai/types.ts";
import { parseBotOverrides } from "../../sim/botOverrides.ts";
import {
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
  eventsOf,
} from "../testUtils.ts";

/** Railgun forward, two lasers on the port side, shields, missiles. */
const GUNSHIP: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};
/** Every gun aboard fires something shields can stop: rack and missiles. */
const SLUGGER: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "radiator", "shields", "missiles"],
};
/** Off its ring the only gun that bears is the rack, which shields can stop. */
const PLINKER: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["ballistic_rack", "radiator", "shields", "shields"],
};

function shotsOf(state: GameState, botId: string): FireWeaponAction[] {
  return botDecideActions(viewFor(state, botId)).actions.filter(
    (a): a is FireWeaponAction => a.type === "fire_weapon"
  );
}

/**
 * Engines broken: the bot can only coast, so every candidate shoots from the
 * position we placed it at and the test is about targeting, not routing.
 */
function grounded(state: GameState, id: string): GameState {
  return withSub(state, id, "engines", { isBroken: true });
}

describe("bot targeting", () => {
  it("powers and fires two lasers of the same type independently", () => {
    // Port lasers bear outward while prograde: the target is one ring out.
    const base = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 4, sector: 0 }
    );
    // One round left in the launcher, which the bot keeps rather than spend on
    // a full-hull ship: a salvo in the plan would crowd the second laser out of
    // the heat budget, and the second laser is what is on trial.
    const state = withSub(grounded(base, "p1"), "p1", "side-3", { ammo: 1 });
    const decision = botDecideActions(viewFor(state, "p1"));
    const shots = decision.actions.filter((a): a is FireWeaponAction => a.type === "fire_weapon");

    const slots = shots.map((s) => s.data.subsystemId);
    expect(slots).toContain("side-0");
    expect(slots).toContain("side-1");
    expect(new Set(slots).size).toBe(slots.length);
    for (const shot of shots) expect(shot.data.targetPlayerId).toBe("p2");

    // Two tiles of the same type each pay their own cubes in heat, addressed
    // by slot id: one shot's worth apiece, with nothing allocated by hand.
    const result = executeTurn(state, decision.actions);
    const lasers = eventsOf(result.events, "weapon_fired").filter(
      (e) => e.attackerId === "p1" && (e.subsystemId === "side-0" || e.subsystemId === "side-1")
    );
    expect(lasers.map((e) => e.heat)).toEqual([2, 2]);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p2").hitPoints).toBeLessThan(10);
  });

  it("does not fire at a target nothing can reach", () => {
    // The far side of the ring: outside the railgun's arc and every broadside,
    // and far enough that a missile expires before it closes.
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 3, sector: 14 }
      ),
      "p1"
    );
    expect(shotsOf(state, "p1")).toHaveLength(0);
  });

  it("launches at a target far outside every gun's arc, as long as the missile can close", () => {
    // Half an orbit away: no gun bears, but a missile is self-guided and its
    // three moves are enough to catch a coasting ship this far ahead.
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 3, sector: 11 }
      ),
      "p1"
    );
    const shots = shotsOf(state, "p1");
    expect(shots.map((a) => a.data.subsystemId)).toEqual(["side-3"]);
  });

  it("never fires across gravity wells, however close the sector numbers look", () => {
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: ALPHA, ring: 3, sector: 0 }
      ),
      "p1"
    );
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.filter((a) => a.type === "fire_weapon")).toHaveLength(0);
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("does not fire at a destroyed ship even when it is in range", () => {
    const base = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 4, sector: 0 }
    );
    const state = withShip(grounded(base, "p1"), "p2", { hitPoints: 0 });
    expect(shotsOf(state, "p1")).toHaveLength(0);
  });

  it("names a loaded face-down slot over the engines on the critical", () => {
    // Energy allocation is public. Four cubes on a face-down bow are a sensor
    // or a wall, standing through the bot's turn, and breaking the slot dumps
    // the cubes as heat, so that is the slot the bot names on a critical.
    const base = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 4, sector: 0, loadout: GUNSHIP }
    );
    let state = grounded(base, "p1");
    state = withSub(state, "p2", "forward-0", { allocatedEnergy: 4 });
    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.data.criticalTarget).toBe("forward-0");
  });

  it("names the engines when there is not a cube anywhere on the target", () => {
    // Nothing is powered, so no tile can be told from another and none is
    // provably intact: the engines are always there and always needed.
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 4, sector: 0, loadout: GUNSHIP }
      ),
      "p1"
    );
    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.data.criticalTarget).toBe("engines");
  });

  it("names a revealed tile that is powered over the engines", () => {
    // A face-up shield with cubes on it is soaking this very volley, and the
    // cubes prove it is not broken already.
    let state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 4, sector: 0, loadout: GUNSHIP }
      ),
      "p1"
    );
    state = withSub(state, "p2", "side-2", { isRevealed: true });
    state = withPower(state, "p2", "side-2", 2);

    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) expect(shot.data.criticalTarget).toBe("side-2");
  });

  it("never names a tile it can already see is broken", () => {
    // Breaking a broken tile does nothing at all, and the break is public.
    let state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 4, sector: 0, loadout: GUNSHIP }
      ),
      "p1"
    );
    state = withSub(state, "p2", "forward-0", { isRevealed: true, isBroken: true });
    state = withSub(state, "p2", "engines", { isBroken: true });

    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(shot.data.criticalTarget).not.toBe("forward-0");
      expect(shot.data.criticalTarget).not.toBe("engines");
    }
    expect(
      executeTurn(state, botDecideActions(viewFor(state, "p1")).actions).errors
    ).toBeUndefined();
  });

  it("closes on a Destroy target and grinds its hull down", () => {
    // The prey coasts and never shoots back; the hunter has to find it,
    // line up and keep firing across many turns.
    let state = withMissions(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 4, sector: 12 }
      ),
      "p1",
      [destroyMission("p2")]
    );
    let lowestHull = getShip(state, "p2").hitPoints;

    for (let i = 0; i < 40 && state.phase === "active"; i++) {
      const active = state.players[state.activePlayerIndex];
      const actions =
        active.id === "p1"
          ? botDecideActions(viewFor(state, "p1")).actions
          : ([
              { type: "coast", playerId: "p2", sequence: 1, data: { activateScoop: false } },
            ] as PlayerAction[]);
      const result = executeTurn(state, actions);
      expect(result.errors, `turn ${i} by ${active.id}`).toBeUndefined();
      state = result.gameState;
      lowestHull = Math.min(lowestHull, getShip(state, "p2").hitPoints);
    }

    expect(lowestHull).toBeLessThan(getShip(state, "p2").maxHitPoints);
  });

  it("hunts a Destroy target instead of a bystander when both are in range", () => {
    let state = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 4, sector: 0 }
    );
    state = {
      ...state,
      players: [
        ...state.players,
        { ...state.players[1], id: "p3", name: "p3", ship: { ...getShip(state, "p2"), sector: 1 } },
      ],
    };
    state = withMissions(grounded(state, "p1"), "p1", [destroyMission("p3")]);
    const shots = shotsOf(state, "p1");
    // Re-baselined for the flat salvo: the whole magazine is one use of the
    // tile now, so the launcher empties into the Destroy target and a laser
    // covers the rest of its ten hull. Only the gun that would otherwise be
    // shooting a corpse goes to the bystander.
    expect(shots[0].data.targetPlayerId).toBe("p3");
    expect(shots.find((s) => s.data.subsystemId === "side-3")?.data).toMatchObject({
      targetPlayerId: "p3",
      count: 4,
    });
    expect(shots.filter((s) => s.data.targetPlayerId === "p2")).toHaveLength(1);
  });
});

/** The plan that shoots at `targetId`, as the bot's planner builds it. */
function planAgainst(state: GameState, botId: string, targetId: string): ActionPlan {
  const situation = analyzeSituation(viewFor(state, botId), DEFAULT_BOT_PARAMETERS);
  const plan = generateCandidates(situation, DEFAULT_BOT_PARAMETERS).find(
    (c) => c.targetId === targetId
  );
  if (!plan) throw new Error(`no candidate shooting at ${targetId}`);
  return plan;
}

describe("bot lethality estimates", () => {
  it("calls a volley lethal when nothing stands between it and the hull", () => {
    // Two port lasers, four damage, against three hull and no shield cubes.
    const state = withShip(
      grounded(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
          { wellId: BH, ring: 4, sector: 0 }
        ),
        "p1"
      ),
      "p2",
      { hitPoints: 3 }
    );

    const plan = planAgainst(state, "p1", "p2");
    expect(plan.expectedDamage).toBe(4);
    expect(plan.expectedHullDamage).toBe(4);
    expect(plan.killsTarget).toBe(true);
  });

  it("subtracts the shield cubes it can see before calling anything a kill", () => {
    // One rack round, two damage, against two hull: lethal in the open. One
    // face-up shield cube buys one point of it, so one lands and p2 lives.
    let state = withShip(
      grounded(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: PLINKER },
          { wellId: BH, ring: 4, sector: 0 }
        ),
        "p1"
      ),
      "p2",
      { hitPoints: 2 }
    );
    state = withSub(state, "p2", "side-2", { isRevealed: true });
    state = withPower(state, "p2", "side-2", 1);

    const plan = planAgainst(state, "p1", "p2");
    expect(plan.expectedDamage).toBe(2);
    expect(plan.expectedHullDamage).toBe(1);
    expect(plan.killsTarget).toBe(false);
  });

  it("counts laser damage against the hull whatever the shields hold", () => {
    // Two port lasers, four damage, three hull, a full face-up shield:
    // shields are electromagnetic and do not stop a laser, so this is a kill.
    let state = withShip(
      grounded(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
          { wellId: BH, ring: 4, sector: 0 }
        ),
        "p1"
      ),
      "p2",
      { hitPoints: 3 }
    );
    state = withSub(state, "p2", "side-2", { isRevealed: true });
    state = withPower(state, "p2", "side-2", 2);

    const plan = planAgainst(state, "p1", "p2");
    expect(plan.expectedHullDamage).toBeGreaterThanOrEqual(3);
    expect(plan.killsTarget).toBe(true);
  });

  it("treats two face-down side cubes as half a shield, not as nothing", () => {
    // Rack and missile (four shielded damage) against two face-down cubes.
    // Two cubes stop two points, and a slot that only might be a shield is
    // priced at half that: 3 of the four reach a hull of four, so no kill.
    // Read as nothing it would be four and a kill.
    let state = withShip(
      grounded(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: SLUGGER },
          { wellId: BH, ring: 4, sector: 0 }
        ),
        "p1"
      ),
      "p2",
      { hitPoints: 4 }
    );
    state = withPower(state, "p2", "side-2", 2);
    // One round in the launcher, so the volley is the rack and one missile.
    state = withSub(state, "p1", "side-3", { ammo: 1 });

    const plan = planAgainst(state, "p1", "p2");
    expect(plan.expectedHullDamage).toBe(3);
    expect(plan.killsTarget).toBe(false);
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
  const LAUNCHER: ShipLoadout = {
    forwardSlots: ["missiles"],
    sideSlots: [null, null, null, null],
  };

  const launcherAgainst = (hull: number, heat = 0): GameState => {
    const base = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: LAUNCHER },
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
    expect(
      executeTurn(state, botDecideActions(viewFor(state, "p1")).actions).errors
    ).toBeUndefined();
  });
});

describe("bot does not shoot corpses", () => {
  it("routes the rest of the volley to a second target once the first is covered", () => {
    // p2 has one hull left: the first laser covers it. The second laser has
    // no business adding to that when p3 is sitting in the same arc.
    const base = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 4, sector: 0 }
    );
    let state: GameState = {
      ...base,
      players: [
        ...base.players,
        { ...base.players[1], id: "p3", name: "p3", ship: { ...getShip(base, "p2"), sector: 1 } },
      ],
    };
    state = withShip(grounded(state, "p1"), "p2", { hitPoints: 1 });

    const shots = shotsOf(state, "p1");
    const atP2 = shots.filter((s) => s.data.targetPlayerId === "p2");
    const atP3 = shots.filter((s) => s.data.targetPlayerId === "p3");

    expect(atP2).toHaveLength(1);
    expect(atP3.length).toBeGreaterThan(0);
    expect(
      executeTurn(state, botDecideActions(viewFor(state, "p1")).actions).errors
    ).toBeUndefined();
  });

  it("stops firing rather than overkill when there is no second target", () => {
    const state = withShip(
      grounded(
        makeTwoPlayerGame(
          { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
          { wellId: BH, ring: 4, sector: 0 }
        ),
        "p1"
      ),
      "p2",
      { hitPoints: 1 }
    );

    expect(shotsOf(state, "p1")).toHaveLength(1);
  });
});

/**
 * A ship just back from a respawn cannot be touched until the turn it plays
 * next is over (RULES §Destruction and Respawn), so the bot must not propose a
 * shot or a scan at it: the engine would refuse the turn, and the sim would
 * count it invalid.
 */
describe("bot leaves a recovering ship alone", () => {
  const duel = () =>
    grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 4, sector: 0 }
      ),
      "p1"
    );

  it("fires at nobody while the only target is recovering", () => {
    const state = withPlayer(duel(), "p2", { recovering: true });
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.filter((a) => a.type === "fire_weapon" || a.type === "scan")).toEqual(
      []
    );
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("shoots the other one instead", () => {
    const base = duel();
    // p3 sits in the same arc as p2, whole and touchable.
    let state: GameState = {
      ...base,
      players: [
        ...base.players,
        { ...base.players[1], id: "p3", name: "p3", ship: { ...getShip(base, "p2"), sector: 1 } },
      ],
    };
    state = withPlayer(state, "p2", { recovering: true });
    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((s) => s.data.targetPlayerId === "p3")).toBe(true);
    expect(
      executeTurn(state, botDecideActions(viewFor(state, "p1")).actions).errors
    ).toBeUndefined();
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
    const base = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 4, sector: 0 }
      ),
      "p1"
    );
    return {
      ...base,
      players: [
        ...base.players,
        { ...base.players[1], id: "p3", name: "p3", ship: { ...getShip(base, "p2"), sector: 1 } },
        makePlayer("p4", { wellId: ALPHA, ring: 3, sector: 0 }),
      ],
    };
  };

  /** The ship every candidate that fires at anyone fires at first. */
  const chosenTargets = (state: GameState) => {
    const situation = analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS);
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
    expect(
      executeTurn(state, botDecideActions(viewFor(state, "p1")).actions).errors
    ).toBeUndefined();
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
 * and Respawn): the bot may fly it, but it fires at nobody and scans nobody,
 * and a plan that did either would be refused.
 */
describe("bot flies its own turn back from Home quietly", () => {
  /** A sensor bow over two lasers: the bot has both a shot and a scan to want. */
  const SCOUT: ShipLoadout = {
    forwardSlots: ["sensor_array"],
    sideSlots: ["laser", "laser", "shields", "missiles"],
  };

  it.each([
    ["with a gunship", GUNSHIP],
    ["with a sensor bow", SCOUT],
  ])("submits no shot and no scan %s", (_what, loadout) => {
    const base = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout },
      { wellId: BH, ring: 3, sector: 0 }
    );
    const state = withPlayer(base, "p1", { recovering: true });
    const decision = botDecideActions(viewFor(state, "p1"));
    expect(decision.actions.filter((a) => a.type === "fire_weapon" || a.type === "scan")).toEqual(
      []
    );
    expect(executeTurn(state, decision.actions).errors).toBeUndefined();
  });

  it("takes the same shot the turn after, when the flag is gone", () => {
    const base = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 3, sector: 0 }
    );
    expect(shotsOf(grounded(base, "p1"), "p1").length).toBeGreaterThan(0);
  });
});

describe("bot turns the railgun only for a shot it may take", () => {
  /**
   * Railgun alone, facing prograde; after a coast on ring 3 the target sits
   * three sectors behind, so only a flip to retrograde gives it a shot.
   */
  const RAIL_ONLY: ShipLoadout = {
    forwardSlots: ["railgun"],
    sideSlots: ["radiator", "radiator", "shields", "shields"],
  };
  const behind = (): GameState =>
    grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: RAIL_ONLY },
        { wellId: BH, ring: 3, sector: 1 }
      ),
      "p1"
    );
  const holdRotates = (state: GameState): boolean => {
    const situation = analyzeSituation(viewFor(state, "p1"), DEFAULT_BOT_PARAMETERS);
    const hold = generateCandidates(situation, DEFAULT_BOT_PARAMETERS).find((c) =>
      c.actions.some((a) => a.type === "coast" && !a.data.activateScoop)
    );
    return hold?.actions.some((a) => a.type === "rotate") ?? false;
  };

  it.each<[string, (s: GameState) => GameState, boolean]>([
    ["a shot it may take", (s) => s, true],
    ["the opening round", (s) => ({ ...s, turn: FIRST_TURN }), false],
    ["a target back from Home", (s) => withPlayer(s, "p2", { recovering: true }), false],
    ["a ship its own Escort marker sits on", (s) => withMissions(s, "p1", [escortMission("e", "p2")]), false],
  ])("with %s", (_label, setup, rotates) => {
    expect(getShip(behind(), "p1").facing).toBe("prograde");
    expect(holdRotates(setup(behind()))).toBe(rotates);
  });
});

describe("parseBotOverrides", () => {
  it.each([
    ["targetPreference=weakest", { targetPreference: "weakest" }],
    [
      "targetPreference=closest,aggressiveness=0.8",
      { targetPreference: "closest", aggressiveness: 0.8 },
    ],
    ["conserveAmmo=true", { conserveAmmo: true }],
  ])("reads %s", (text, expected) => {
    expect(parseBotOverrides(text)).toEqual(expected);
  });

  it.each([
    ["targetPreferenc=weakest"], // an unknown parameter
    ["targetPreference=bravest"], // not one of the parameter's words
    ["aggressiveness=lots"], // not a number
    ["conserveAmmo=yes"], // not a boolean
    ["targetPreference"], // no value at all
  ])("refuses %s", (text) => {
    expect(() => parseBotOverrides(text)).toThrow();
  });
});
