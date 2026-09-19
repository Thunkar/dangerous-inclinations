/**
 * What the bot shoots at, and with what. Every fire action it proposes must
 * pass the engine's own range check at the moment it executes, so these
 * tests assert both the shape of the decision and that `executeTurn`
 * accepts it.
 */
import { describe, it, expect } from "vitest";
import type { FireWeaponAction, GameState, PlayerAction, ShipLoadout } from "../../models/game.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import { analyzeSituation, botDecideActions } from "../../ai/index.ts";
import { generateCandidates } from "../../ai/planner.ts";
import { DEFAULT_BOT_PARAMETERS } from "../../ai/types.ts";
import type { ActionPlan, Opponent } from "../../ai/types.ts";
import { chooseCriticalTarget } from "../../ai/behaviors/combat.ts";
import { parseBotOverrides } from "../../sim/botOverrides.ts";
import {
  ALPHA,
  BH,
  destroyMission,
  getShip,
  makeTwoPlayerGame,
  withMissions,
  withPlayer,
  withPower,
  withShip,
  withSub,
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

    // Two tiles of the same type get their own energy, addressed by slot id.
    const powered = decision.actions.filter(
      (a) =>
        a.type === "allocate_energy" &&
        (a.data.subsystemId === "side-0" || a.data.subsystemId === "side-1")
    );
    expect(powered).toHaveLength(2);

    const result = executeTurn(state, decision.actions);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p2").hitPoints).toBeLessThan(10);
  });

  it("does not fire at a target nothing can reach", () => {
    // The far side of the ring: outside the railgun's arc and every broadside,
    // and far enough that a missile expires before it closes.
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 3, sector: 16 }
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

  it("names a slot on the target for the critical hit", () => {
    const state = grounded(
      makeTwoPlayerGame(
        { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
        { wellId: BH, ring: 4, sector: 0 }
      ),
      "p1"
    );
    const shots = shotsOf(state, "p1");
    expect(shots.length).toBeGreaterThan(0);
    const slotIds = new Set(getShip(state, "p2").subsystems.map((s) => s.id));
    for (const shot of shots) expect(slotIds.has(shot.data.criticalTarget)).toBe(true);
  });

  it("reads the cubes on a face-down forward slot as a railgun and breaks it first", () => {
    // Energy allocation is public; four cubes on a forward tile can only be
    // a railgun, so that is the slot the bot names on a critical.
    const base = makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 4, sector: 0, loadout: GUNSHIP }
    );
    let state = grounded(base, "p1");
    state = withSub(state, "p2", "forward-0", { allocatedEnergy: 4, isPowered: true });
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
    state = withPower(state, "p2", "side-2", 4);

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
    // One rack round, two damage, against two hull: lethal in the open. Two
    // face-up shield cubes buy one point of it, so one lands and p2 lives.
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
    state = withPower(state, "p2", "side-2", 2);

    const plan = planAgainst(state, "p1", "p2");
    expect(plan.expectedDamage).toBe(2);
    expect(plan.expectedHullDamage).toBe(1);
    expect(plan.killsTarget).toBe(false);
  });

  it("counts laser damage against the hull whatever the shields hold", () => {
    // Two port lasers, four damage, three hull, four face-up shield cubes:
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
    state = withPower(state, "p2", "side-2", 4);

    const plan = planAgainst(state, "p1", "p2");
    expect(plan.expectedHullDamage).toBeGreaterThanOrEqual(3);
    expect(plan.killsTarget).toBe(true);
  });

  it("treats face-down side cubes as half a shield, not as nothing", () => {
    // Rack and missile (four shielded damage) against two face-down cubes.
    // Two cubes stop one point, and a slot that only might be a shield is
    // priced at half that: 3.5 of the four reach a hull of four, so no kill.
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
    expect(plan.expectedHullDamage).toBe(3.5);
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

  it("spends exactly the rounds it takes to finish a ship", () => {
    // Four hull, two damage a missile: two rounds, and the other two stay aboard.
    const state = launcherAgainst(4);
    expect(salvoAt(state)).toBe(2);
    expect(
      executeTurn(state, botDecideActions(viewFor(state, "p1")).actions).errors
    ).toBeUndefined();
  });

  it("empties the whole magazine into a ship it cannot finish this turn", () => {
    // Ten hull against four rounds of two: nothing finishes it, so everything goes.
    expect(salvoAt(launcherAgainst(10))).toBe(4);
  });

  it("heat does not trim the salvo, because the launch is one use of the tile", () => {
    // Re-baselined for the flat rule: six heat carried used to leave room for
    // two missiles at two heat each. A salvo of any size is now the tile's two
    // cubes once, so the same budget buys the whole magazine.
    expect(salvoAt(launcherAgainst(10, 6))).toBe(4);
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
 * A ship just back from a respawn cannot be touched until it acts (RULES
 * §Destruction and Respawn), so the bot must not propose a shot or a scan at
 * it: the engine would refuse the turn, and the sim would count it invalid.
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

/** The opponent as the bot's analyzer reads it: two players, so the only one. */
function opponentOf(state: GameState, viewerId: string): Opponent {
  return analyzeSituation(viewFor(state, viewerId), DEFAULT_BOT_PARAMETERS).opponents[0];
}

/**
 * `criticalOrder`: the standing policy for which tile a critical names.
 *
 * "suppress" reads the cubes and breaks whatever is shooting back — the tests
 * above and in botThreat are its specification. "forward" goes for the bow
 * instead, on the reasoning that the forward tile is the ship's role, and only
 * falls back to the cubes once the bow is public and already broken.
 */
describe("critical order", () => {
  const gunships = () =>
    makeTwoPlayerGame(
      { wellId: BH, ring: 3, sector: 0, loadout: GUNSHIP },
      { wellId: BH, ring: 4, sector: 0, loadout: GUNSHIP }
    );
  /** A break is public, so this is the one thing that talks the bow out of it. */
  const brokenBow = (state: GameState) =>
    withSub(state, "p2", "forward-0", { isRevealed: true, isBroken: true });

  it.each([
    ["a face-down bow, which reads as intact until a break says otherwise", gunships, "forward-0"],
    [
      "the bow even with four cubes glowing on a side slot",
      () => withPower(gunships(), "p2", "side-2", 4),
      "forward-0",
    ],
    [
      "the fattest powered side slot once the bow is public and broken",
      () => withPower(withPower(brokenBow(gunships()), "p2", "side-0", 2), "p2", "side-2", 4),
      "side-2",
    ],
    [
      "the engines with the bow broken and not a cube on the sides",
      () => brokenBow(gunships()),
      "engines",
    ],
    [
      "the thrusters when the engines are gone too",
      () => withSub(brokenBow(gunships()), "p2", "engines", { isBroken: true }),
      "rotation",
    ],
  ])("under forward, names %s", (_case, build, expected) => {
    expect(chooseCriticalTarget(opponentOf(build(), "p1"), "suppress", "forward")).toBe(expected);
  });

  it.each([
    ["suppress", "side-2"],
    ["forward", "forward-0"],
  ])("with a kill in hand, the %s order names %s", (order, expected) => {
    // A face-up shield tile at four cubes is the single thing between the
    // volley and the hull, which is exactly what "kill" is for — and what the
    // forward order overrules.
    let state = withSub(gunships(), "p2", "side-2", { isRevealed: true });
    state = withPower(state, "p2", "side-2", 4);
    expect(
      chooseCriticalTarget(opponentOf(state, "p1"), "kill", order as "suppress" | "forward")
    ).toBe(expected);
  });
});

describe("parseBotOverrides", () => {
  it.each([
    ["criticalOrder=forward", { criticalOrder: "forward" }],
    [
      "criticalOrder=suppress,aggressiveness=0.8",
      { criticalOrder: "suppress", aggressiveness: 0.8 },
    ],
    ["conserveAmmo=true", { conserveAmmo: true }],
  ])("reads %s", (text, expected) => {
    expect(parseBotOverrides(text)).toEqual(expected);
  });

  it.each([
    ["criticalOrdr=forward"], // an unknown parameter
    ["criticalOrder=bow"], // not one of the policy's words
    ["aggressiveness=lots"], // not a number
    ["conserveAmmo=yes"], // not a boolean
    ["criticalOrder"], // no value at all
  ])("refuses %s", (text) => {
    expect(() => parseBotOverrides(text)).toThrow();
  });
});
