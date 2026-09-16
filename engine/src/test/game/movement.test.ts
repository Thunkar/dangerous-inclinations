import { describe, it, expect } from "vitest";
import { burnDestinationRing, projectPosition } from "../../game/movement.ts";
import { executeTurn } from "../../game/turns.ts";
import { getAdjustmentRange, calculateBurnMassCost } from "../../models/rings.ts";
import type { ShipLoadout } from "../../models/game.ts";
import {
  ALPHA,
  BH,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  getShip,
  getSub,
  makePlayer,
  makeGameState,
  makeTwoPlayerGame,
  mustExecute,
  rotate,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const COMPRESSOR: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["fuel_compressor", "laser", "shields", "laser"],
};

function shipAt(
  wellId: string,
  ring: number,
  sector: number,
  facing: "prograde" | "retrograde" = "prograde"
) {
  return makeGameState([
    makePlayer("p1", { wellId, ring, sector, facing }),
    makePlayer("p2", { wellId: BH, ring: 5, sector: 12 }),
  ]);
}

describe("movement: drift", () => {
  it.each([
    [BH, 1, 0, 8],
    [BH, 2, 0, 6],
    [BH, 3, 0, 4],
    [BH, 4, 0, 2],
    [BH, 5, 0, 1],
    // Not sector 0: that is where the stations start, and a moored ship holds
    // its berth instead of drifting (see docking.test.ts).
    [ALPHA, 1, 2, 6],
    [ALPHA, 2, 22, 0],
    [ALPHA, 3, 23, 0],
  ])("coasting on %s ring %i from sector %i lands on %i", (wellId, ring, sector, expected) => {
    const state = mustExecute(shipAt(wellId, ring, sector), coast(1));
    expect(getShip(state, "p1")).toMatchObject({ wellId, ring, sector: expected });
  });

  it("a turn without a movement action coasts automatically", () => {
    const result = executeTurnAs(makeTwoPlayerGame());
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "coasted")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        to: { wellId: BH, ring: 3, sector: 4 },
        scooped: false,
      }),
    ]);
  });

  it("drift alone costs no mass and no heat", () => {
    const state = mustExecute(makeTwoPlayerGame(), coast(1));
    expect(getShip(state, "p1").reactionMass).toBe(10);
    expect(getShip(state, "p1").heat.currentHeat).toBe(0);
  });
});

describe("movement: action sequencing", () => {
  it.each([
    ["two movement actions", [coast(1), burn(2, "soft")]],
    ["duplicate sequence numbers", [rotate(1, "retrograde"), coast(1)]],
    ["a gap in the sequence", [rotate(1, "retrograde"), coast(3)]],
    ["a sequence not starting at 1", [coast(2)]],
    [
      "a tactical action without a sequence",
      [{ type: "coast", data: { activateScoop: false } } as never],
    ],
  ])("rejects %s", (_label, actions) => {
    let state = makeTwoPlayerGame();
    state = withPower(state, "p1", "engines", 3);
    state = withPower(state, "p1", "rotation", 1);
    const result = executeTurnAs(state, ...actions);
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.gameState).toBe(state);
  });

  it("rejects actions that belong to another player", () => {
    const state = makeTwoPlayerGame();
    const result = executeTurn(state, [{ ...coast(1), playerId: "p2" }]);
    expect(result.errors?.[0]).toMatch(/active player/i);
    expect(result.gameState).toBe(state);
  });
});

describe("movement: burns", () => {
  it.each([
    ["soft", "prograde", 4, 1],
    ["medium", "prograde", 5, 2],
    ["soft", "retrograde", 2, 1],
    ["medium", "retrograde", 1, 2],
  ] as const)(
    "a %s burn facing %s from BH ring 3 ends on ring %i for %i mass",
    (intensity, facing, ring, mass) => {
      const state = withPower(shipAt(BH, 3, 0, facing), "p1", "engines", 3);
      const result = executeTurnAs(state, burn(1, intensity));
      expect(result.errors).toBeUndefined();
      const ship = getShip(result.gameState, "p1");
      expect(ship.ring).toBe(ring);
      expect(ship.sector).toBe(4); // drift on ring 3 happens before the burn
      expect(ship.reactionMass).toBe(10 - mass);
      expect(eventsOf(result.events, "burned")[0]).toMatchObject({
        intensity,
        from: { wellId: BH, ring: 3, sector: 0 },
        to: { wellId: BH, ring, sector: 4 },
        massSpent: mass,
        heat: 3,
      });
    }
  );

  it.each([
    ["prograde", 2, 5],
    ["retrograde", 4, 1],
  ] as const)("a hard burn facing %s from BH ring %i ends on ring %i", (facing, from, to) => {
    const state = withPower(shipAt(BH, from, 0, facing), "p1", "engines", 3);
    const result = executeTurnAs(state, burn(1, "hard"));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").ring).toBe(to);
  });

  it.each([
    [BH, 5, "prograde", "soft"],
    [BH, 3, "prograde", "hard"],
    [BH, 1, "retrograde", "soft"],
    [BH, 2, "retrograde", "medium"],
    [ALPHA, 2, "prograde", "hard"],
    [ALPHA, 2, "retrograde", "medium"],
  ] as const)(
    "a burn that would leave the rings is rejected: %s ring %i %s %s",
    (wellId, ring, facing, intensity) => {
      const state = withPower(shipAt(wellId, ring, 0, facing), "p1", "engines", 3);
      const result = executeTurnAs(state, burn(1, intensity));
      expect(result.errors?.[0]).toMatch(/leave the rings/i);
      expect(result.gameState).toBe(state);
    }
  );

  it("burnDestinationRing still clamps as a safety net", () => {
    expect(burnDestinationRing({ wellId: BH, ring: 5, facing: "prograde" }, "soft")).toBe(5);
    expect(burnDestinationRing({ wellId: ALPHA, ring: 2, facing: "prograde" }, "hard")).toBe(3);
  });

  it("burn heat equals the engines' allocated energy, not the burn cost", () => {
    const state = withPower(makeTwoPlayerGame(), "p1", "engines", 3);
    const result = executeTurnAs(state, burn(1, "soft"));
    expect(eventsOf(result.events, "burned")[0].heat).toBe(3);
  });

  it.each([
    ["engines unpowered", 0, "soft", 10],
    ["engines below the burn's energy", 1, "medium", 10],
    ["not enough mass", 3, "hard", 2],
  ])("rejects a burn with %s", (_label, energy, intensity, mass) => {
    let state = makeTwoPlayerGame();
    if (energy > 0) state = withPower(state, "p1", "engines", energy);
    state = withShip(state, "p1", { reactionMass: mass });
    const result = executeTurnAs(state, burn(1, intensity as never));
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(getShip(result.gameState, "p1").ring).toBe(3);
  });

  it("rejects a burn when the engines are broken", () => {
    const state = withSub(withPower(makeTwoPlayerGame(), "p1", "engines", 3), "p1", "engines", {
      isBroken: true,
    });
    expect(executeTurnAs(state, burn(1, "soft")).errors?.[0]).toMatch(/broken/i);
  });
});

describe("movement: phasing", () => {
  it.each([
    [8, -7, 3],
    [4, -3, 3],
    [1, 0, 3],
  ])("velocity %i allows adjustments from %i to %i", (velocity, min, max) => {
    const range = getAdjustmentRange(velocity);
    expect(range.min + 0).toBe(min); // + 0 folds -0 into 0
    expect(range.max).toBe(max);
  });

  it("each sector of adjustment costs one extra mass", () => {
    expect(calculateBurnMassCost(1, 3)).toBe(4);
    expect(calculateBurnMassCost(2, -2)).toBe(4);
    expect(calculateBurnMassCost(3, 0)).toBe(3);
  });

  it.each([
    [3, 7, 5],
    [-3, 1, 5],
    [-1, 3, 3],
  ])(
    "adjustment %i from BH ring 3 lands on sector %i costing %i mass in total (medium burn)",
    (adjustment, sector, mass) => {
      const state = withPower(makeTwoPlayerGame(), "p1", "engines", 3);
      const result = executeTurnAs(state, burn(1, "medium", adjustment));
      expect(result.errors).toBeUndefined();
      expect(getShip(result.gameState, "p1").sector).toBe(sector);
      expect(getShip(result.gameState, "p1").reactionMass).toBe(10 - mass);
    }
  );

  it("braking is limited by the ring's velocity", () => {
    const slow = withPower(shipAt(BH, 5, 0), "p1", "engines", 3);
    expect(executeTurnAs(slow, burn(1, "soft", -1)).errors?.[0]).toMatch(/out of range/i);
    const fast = withPower(shipAt(BH, 1, 0), "p1", "engines", 3);
    expect(executeTurnAs(fast, burn(1, "soft", -8)).errors?.[0]).toMatch(/out of range/i);
    expect(executeTurnAs(fast, burn(1, "soft", -7)).errors).toBeUndefined();
    expect(getShip(executeTurnAs(fast, burn(1, "soft", -7)).gameState, "p1").sector).toBe(1);
  });

  it("acceleration is capped at +3", () => {
    const state = withPower(makeTwoPlayerGame(), "p1", "engines", 3);
    expect(executeTurnAs(state, burn(1, "soft", 4)).errors?.[0]).toMatch(/out of range/i);
  });

  it("rejects phasing the ship cannot pay for", () => {
    const state = withShip(withPower(makeTwoPlayerGame(), "p1", "engines", 3), "p1", {
      reactionMass: 3,
    });
    expect(executeTurnAs(state, burn(1, "soft", 3)).errors?.[0]).toMatch(/reaction mass/i);
  });
});

describe("movement: rotation", () => {
  it("rotating flips the facing, uses the thrusters and heats them", () => {
    const state = withPower(makeTwoPlayerGame(), "p1", "rotation", 1);
    const result = executeTurnAs(state, rotate(1, "retrograde"));
    expect(getShip(result.gameState, "p1").facing).toBe("retrograde");
    expect(eventsOf(result.events, "rotated")).toEqual([
      expect.objectContaining({ playerId: "p1", facing: "retrograde" }),
    ]);
    // heat 1 is under dissipation, so check it through a second heat source: preset heat 5 + 1 = 6 -> 1 damage
    const hot = withShip(state, "p1", { heat: { currentHeat: 5 } });
    expect(getShip(executeTurnAs(hot, rotate(1, "retrograde")).gameState, "p1").hitPoints).toBe(9);
  });

  it.each([
    [
      "already facing that way",
      (s: ReturnType<typeof makeTwoPlayerGame>) => withPower(s, "p1", "rotation", 1),
      "prograde",
    ],
    ["thrusters unpowered", (s: ReturnType<typeof makeTwoPlayerGame>) => s, "retrograde"],
    [
      "thrusters broken",
      (s: ReturnType<typeof makeTwoPlayerGame>) =>
        withSub(withPower(s, "p1", "rotation", 1), "p1", "rotation", { isBroken: true }),
      "retrograde",
    ],
  ] as const)("rejects rotating when %s", (_label, setup, facing) => {
    const result = executeTurnAs(setup(makeTwoPlayerGame()), rotate(1, facing));
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("the thrusters work once per turn", () => {
    const state = withPower(makeTwoPlayerGame(), "p1", "rotation", 1);
    const result = executeTurnAs(state, rotate(1, "retrograde"), rotate(2, "prograde"));
    expect(result.errors?.[0]).toMatch(/already used/i);
  });

  it("rotating before a burn changes its direction; rotating after does not", () => {
    let state = withPower(makeTwoPlayerGame(), "p1", "rotation", 1);
    state = withPower(state, "p1", "engines", 3);
    const before = mustExecute(state, rotate(1, "retrograde"), burn(2, "soft"));
    expect(getShip(before, "p1")).toMatchObject({ ring: 2, facing: "retrograde" });
    const after = mustExecute(state, burn(1, "soft"), rotate(2, "retrograde"));
    expect(getShip(after, "p1")).toMatchObject({ ring: 4, facing: "retrograde" });
  });
});

describe("movement: fuel scoop", () => {
  it.each([
    [BH, 1, 2, 10],
    [BH, 3, 5, 9],
    [BH, 5, 5, 6],
    [ALPHA, 1, 0, 4],
  ])("scooping on %s ring %i from %i mass gives %i", (wellId, ring, mass, expected) => {
    let state = withPower(shipAt(wellId, ring, 0), "p1", "scoop", 3);
    state = withShip(state, "p1", { reactionMass: mass });
    const result = executeTurnAs(state, coast(1, true));
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p1").reactionMass).toBe(expected);
    expect(eventsOf(result.events, "coasted")[0]).toMatchObject({ scooped: true, heat: 3 });
    // The exact gain is fuel information: private to the owner.
    expect(eventsOf(result.events, "fuel_scooped")[0]).toMatchObject({
      amount: expected - mass,
      privateTo: ["p1"],
    });
  });

  it("a fuel compressor raises the cap to 16", () => {
    let state = withPower(makeTwoPlayerGame({ ring: 1, loadout: COMPRESSOR }), "p1", "scoop", 3);
    expect(getShip(state, "p1").reactionMass).toBe(16);
    state = withShip(state, "p1", { reactionMass: 12 });
    expect(getShip(mustExecute(state, coast(1, true)), "p1").reactionMass).toBe(16);
  });

  it.each([
    ["unpowered", (s: ReturnType<typeof makeTwoPlayerGame>) => s],
    [
      "broken",
      (s: ReturnType<typeof makeTwoPlayerGame>) =>
        withSub(withPower(s, "p1", "scoop", 3), "p1", "scoop", { isBroken: true }),
    ],
  ])("rejects scooping with the scoop %s", (_label, setup) => {
    const result = executeTurnAs(setup(makeTwoPlayerGame()), coast(1, true));
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("the scoop only runs while coasting, never during a burn", () => {
    let state = withPower(makeTwoPlayerGame(), "p1", "scoop", 3);
    state = withPower(state, "p1", "engines", 1);
    state = withShip(state, "p1", { reactionMass: 5 });
    const result = executeTurnAs(state, burn(1, "soft"));
    expect(getShip(result.gameState, "p1").reactionMass).toBe(4);
    expect(eventTypes(result.events)).not.toContain("coasted");
    expect(getSub(result.gameState, "p1", "scoop").usedThisTurn).toBe(false);
  });
});

describe("movement: projectPosition", () => {
  const ship = getShip(makeTwoPlayerGame(), "p1"); // BH R3 S0 prograde

  it("projects a coast as pure drift", () => {
    expect(projectPosition(ship)).toEqual({ wellId: BH, ring: 3, sector: 4, facing: "prograde" });
  });

  it("projects a burn after drift, honouring a planned rotation", () => {
    expect(
      projectPosition(ship, "retrograde", {
        kind: "burn",
        burnIntensity: "medium",
        sectorAdjustment: 1,
      })
    ).toEqual({
      wellId: BH,
      ring: 1,
      sector: 5,
      facing: "retrograde",
    });
  });

  it("projects a jump straight to the lane's destination without drift", () => {
    const destination = { wellId: ALPHA, ring: 3, sector: 17 };
    expect(
      projectPosition(ship, "prograde", { kind: "jump", jumpDestination: destination })
    ).toEqual({ ...destination, facing: "prograde" });
  });
});
