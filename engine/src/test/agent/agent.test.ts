import { describe, it, expect } from "vitest";
import { PLANET_OUTER_RING, STATION_RING } from "../../models/gravityWells.ts";
import { executeTurn } from "../../game/turns.ts";
import { viewFor } from "../../game/view.ts";
import {
  buildTurn,
  describeViewForAgent,
  seatOptions,
  AGENT_INTENT_GUIDE,
} from "../../agent/index.ts";
import { botDecideActions } from "../../ai/index.ts";
import { ALPHA, BH, eventsOf, makeTwoPlayerGame, withPower, getShip } from "../testUtils.ts";

describe("agent seat tooling", () => {
  const start = () =>
    makeTwoPlayerGame({ wellId: BH, ring: 3, sector: 0 }, { wellId: BH, ring: 4, sector: 0 });

  it("lists the legal burns, the jump and the weapons in range from the view", () => {
    const o = seatOptions(viewFor(start(), "p1"));
    expect(o.velocity).toBe(4);
    expect(o.burns.map((b) => `${b.intensity}-${b.facing}`)).toEqual(
      expect.arrayContaining([
        "soft-prograde",
        "medium-prograde",
        "soft-retrograde",
        "medium-retrograde",
      ])
    );
    // From ring 3 a hard burn inward would leave the rings: not offered.
    expect(o.burns.some((b) => b.intensity === "hard" && b.facing === "retrograde")).toBe(false);
    expect(o.jump).toBeNull();
    const laser = o.weapons.find((w) => w.weapon === "side-0");
    expect(laser?.targetsNow).toEqual(["p2"]); // port laser fires outward: p2 is one ring out
    // Rounds left is the biggest salvo the launcher can fire; nothing else has ammo.
    expect(o.weapons.find((w) => w.weapon === "side-3")?.ammo).toBe(4);
    expect(laser?.ammo).toBeNull();
  });

  it("builds a salvo from a count and leaves the tile at its minimum cubes", () => {
    const state = start();
    const built = buildTurn(viewFor(state, "p1"), {
      fire: [{ weapon: "side-3", target: "p2", count: 3 }],
    });
    const shot = built.actions.find((a) => a.type === "fire_weapon");
    expect(shot).toMatchObject({ data: { subsystemId: "side-3", count: 3 } });
    // A salvo of any size is one use of the tile, and the launch powers it:
    // the builder has no cubes to place.
    expect(built.actions.some((a) => a.type === "power")).toBe(false);
    const result = executeTurn(state, built.actions);
    expect(result.errors).toBeUndefined();
    expect(result.gameState.missiles).toHaveLength(3);
    expect(eventsOf(result.events, "weapon_fired")[0].heat).toBe(2);
  });

  it.each([
    ["a coast", { move: { kind: "coast" as const } }],
    ["a scooping coast", { move: { kind: "coast" as const, scoop: true } }],
    [
      "a soft burn outward with the engines powered for it",
      { move: { kind: "burn" as const, intensity: "soft" as const } },
    ],
    [
      "a rotation and an inward medium burn",
      {
        move: {
          kind: "burn" as const,
          intensity: "medium" as const,
          facing: "retrograde" as const,
        },
      },
    ],
    [
      "a laser shot at the ship one ring out",
      { fire: [{ weapon: "side-0" as const, target: "p2" }] },
    ],
    [
      "a shot before a burn",
      {
        fire: [{ weapon: "side-0" as const, target: "p2", when: "before" as const }],
        move: { kind: "burn" as const, intensity: "soft" as const },
      },
    ],
  ])("builds a legal turn for %s", (_label, intent) => {
    const state = start();
    const built = buildTurn(viewFor(state, "p1"), intent);
    const result = executeTurn(state, built.actions);
    expect(result.errors).toBeUndefined();
  });

  it("places no cubes for a burn: the action powers the engines", () => {
    const built = buildTurn(viewFor(start(), "p1"), { move: { kind: "burn", intensity: "hard" } });
    expect(built.actions.some((a) => a.type === "power")).toBe(false);
  });

  it("tells an agent that asks to power a tile an action would power anyway", () => {
    const built = buildTurn(viewFor(start(), "p1"), { power: { engines: 3 } });
    expect(built.notes.some((n) => n.includes("powered by the action that uses it"))).toBe(true);
    expect(built.actions.some((a) => a.type === "power")).toBe(false);
  });

  it("powers only what the intent names: last turn's cubes come off at the start", () => {
    const state = withPower(start(), "p1", "side-2", 2);
    const coasting = buildTurn(viewFor(state, "p1"), { move: { kind: "coast" } });
    expect(coasting.actions.some((a) => a.type === "power")).toBe(false);
    const walled = buildTurn(viewFor(state, "p1"), {
      power: { "side-2": 4 },
      move: { kind: "burn", intensity: "soft" },
    });
    // Power runs first, then the move.
    expect(walled.actions[0]).toMatchObject({
      type: "power",
      sequence: 1,
      data: { subsystemId: "side-2", amount: 4 },
    });
    expect(walled.actions.find((a) => a.type === "burn")?.sequence).toBe(2);
    const result = executeTurn(state, walled.actions);
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "heat_check")[0].cubes).toBe(4 + 1);
  });

  it("the engine's bot also decides legally from the same view", () => {
    const state = start();
    const result = executeTurn(state, botDecideActions(viewFor(state, "p1")).actions);
    expect(result.errors).toBeUndefined();
  });

  it("the digest carries the seat's ship, cards, opponents and legal options", () => {
    const text = describeViewForAgent(viewFor(start(), "p1"), [], { includeRules: false });
    expect(text).toContain("YOUR SHIP: Black Hole R3 S0");
    expect(text).toContain("OPPONENTS:");
    expect(text).toContain("LEGAL THIS TURN:");
    expect(text).toContain("side-0 (laser");
    expect(text).not.toContain(getShip(start(), "p2").reactionMass.toString() + "/16"); // no opponent fuel leaks
    expect(AGENT_INTENT_GUIDE).toContain('"move"');
  });

  it("jump options appear only on a departure arc, with the phasing the arc allows", () => {
    const onLane = makeTwoPlayerGame(
      { wellId: BH, ring: 5, sector: 17 },
      { wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 0 }
    );
    const jump = seatOptions(viewFor(onLane, "p1")).jump;
    expect(jump?.destinationWellId).toBe(ALPHA);
    // Sector 17 is the second sector of the 16-19 arc: one back, two forward.
    expect(jump?.adjustment).toEqual({ min: -1, max: 2 });
  });

  it("builds a phased jump the engine accepts, and refuses to invent one out of the arc", () => {
    const onLane = makeTwoPlayerGame(
      { wellId: BH, ring: 5, sector: 17 },
      { wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 0 }
    );
    const built = buildTurn(viewFor(onLane, "p1"), {
      move: { kind: "jump", destinationWellId: ALPHA, adjustment: 2 },
    });
    const result = executeTurn(onLane, built.actions);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1")).toMatchObject({ wellId: ALPHA, ring: PLANET_OUTER_RING, sector: 7 });

    const tooFar = buildTurn(viewFor(onLane, "p1"), {
      move: { kind: "jump", destinationWellId: ALPHA, adjustment: 3 },
    });
    expect(executeTurn(onLane, tooFar.actions).errors?.[0]).toMatch(/arrival arc/i);
  });

  it("tells a moored seat that a coast holds the berth", () => {
    const docked = makeTwoPlayerGame(
      { wellId: ALPHA, ring: STATION_RING, sector: 0 }, // the station starts here
      { wellId: BH, ring: 4, sector: 0 }
    );
    expect(seatOptions(viewFor(docked, "p1")).moored).toBe(true);
    expect(describeViewForAgent(viewFor(docked, "p1"))).toContain("Moored at a station");
    const built = buildTurn(viewFor(docked, "p1"), { move: { kind: "coast" } });
    const result = executeTurn(docked, built.actions);
    expect(getShip(result.gameState, "p1")).toMatchObject({ ring: STATION_RING, sector: 0 });
  });
});
