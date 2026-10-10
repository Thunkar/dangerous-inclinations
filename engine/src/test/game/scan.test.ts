import { describe, it, expect } from "vitest";
import type { Facing, GameState, ShipLoadout } from "../../models/game.ts";
import { wrapSector } from "../../game/geometry.ts";
import {
  LOADOUTS,
  GAMMA,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  expectRefused,
  expectRefusedUnless,
  getPlayer,
  getSub,
  interceptMission,
  takenData,
  makeTwoPlayerGame,
  mustExecute,
  rotate,
  scan,
  withPlayer,
  withShip,
} from "../testUtils.ts";

/** p1 at R3 S0 with a sensor aboard; p2 on the same ring `sectors` ahead. The scan powers it. */
function scanner(sectors = 3, targetLoadout?: ShipLoadout): GameState {
  return makeTwoPlayerGame(
    { loadout: LOADOUTS.sensor },
    { ring: 3, sector: sectors, loadout: targetLoadout }
  );
}

describe("scan: a successful scan", () => {
  it("uses and reveals the sensor and announces the scan publicly", () => {
    const result = executeTurnAs(scanner(), scan(1, "p2", "side-0"));
    expect(result.errors).toBeUndefined();
    const [scanned] = eventsOf(result.events, "scanned");
    expect(scanned).toMatchObject({
      scannerId: "p1",
      targetId: "p2",
      peekedSlot: "side-0",
      heat: 2,
    });
    expect(scanned).not.toHaveProperty("privateTo");
    expect(eventsOf(result.events, "subsystem_revealed")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        subsystemId: "forward-0",
        subsystemType: "sensor_array",
        reason: "scanned",
      }),
    ]);
    expect(getSub(result.gameState, "p1", "forward-0").isRevealed).toBe(true);
  });

  it("shows the peeked tile to the scanner only and records it as intel", () => {
    const result = executeTurnAs(scanner(), scan(1, "p2", "side-2"));
    expect(eventsOf(result.events, "scan_result")).toEqual([
      expect.objectContaining({
        scannerId: "p1",
        targetId: "p2",
        slot: "side-2",
        subsystemType: "shields",
        privateTo: ["p1"],
      }),
    ]);
    expect(getPlayer(result.gameState, "p1").intel).toEqual({ p2: ["side-2"] });
    expect(getSub(result.gameState, "p2", "side-2").isRevealed).toBe(false); // the table did not see it
  });

  it("intel accumulates across turns; naming a known slot peeks the next face-down one instead", () => {
    let state = mustExecute(scanner(), scan(1, "p2", "side-0"));
    state = mustExecute(state, coast(1));
    state = mustExecute(state, scan(1, "p2", "side-1"));
    state = mustExecute(state, coast(1));
    const result = executeTurnAs(state, scan(1, "p2", "side-1"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "scanned")[0]).toMatchObject({ peekedSlot: "forward-0" });
    expect(getPlayer(result.gameState, "p1").intel.p2).toEqual(["side-0", "side-1", "forward-0"]);
  });

  it("once every tile is known, the named slot is peeked again (Intercept still needs a scan)", () => {
    let state = scanner();
    for (const slot of ["forward-0", "side-0", "side-1", "side-2", "side-3"]) {
      state = mustExecute(state, scan(1, "p2", slot));
      state = mustExecute(state, coast(1));
    }
    const result = executeTurnAs(state, scan(1, "p2", "side-0"));
    expect(result.errors).toBeUndefined();
    expect(eventsOf(result.events, "scanned")[0]).toMatchObject({ peekedSlot: "side-0" });
    expect(getPlayer(result.gameState, "p1").intel.p2).toHaveLength(5);
  });

  it("the sensor scans once per turn", () => {
    expectRefusedUnless(
      executeTurnAs(scanner(), scan(1, "p2", "side-0"), scan(2, "p2", "side-1")),
      executeTurnAs(scanner(), scan(1, "p2", "side-0"))
    );
  });

  it("range is measured when the scan executes", () => {
    const state = scanner(6); // 6 sectors ahead: out of range now, 2 after drifting to S4
    expectRefusedUnless(
      executeTurnAs(state, scan(1, "p2")),
      executeTurnAs(state, coast(1), scan(2, "p2"))
    );
  });

  it("does not consume the dice", () => {
    const state = { ...scanner(), forcedRollValue: undefined };
    const result = executeTurnAs(state, scan(1, "p2"));
    expect(result.errors).toBeUndefined();
    expect(result.gameState.rngState).toBe(state.rngState);
  });
});

describe("scan: the railgun's box at range 3", () => {
  // p1 at R3 S0 with a sensor aboard, facing as named; p2 `offset` sectors
  // along `ring` (negative is astern of prograde). Ahead is the way p1 faces.
  it.each<[string, Facing, number, number, boolean]>([
    ["1 ahead, facing prograde", "prograde", 3, 1, true],
    ["2 ahead, facing prograde", "prograde", 3, 2, true],
    ["3 ahead, facing prograde", "prograde", 3, 3, true],
    ["4 ahead, facing prograde", "prograde", 3, 4, false],
    ["1 behind, facing prograde", "prograde", 3, -1, false],
    ["3 behind, facing prograde", "prograde", 3, -3, false],
    ["1 behind prograde, facing retrograde", "retrograde", 3, -1, true],
    ["3 behind prograde, facing retrograde", "retrograde", 3, -3, true],
    ["4 behind prograde, facing retrograde", "retrograde", 3, -4, false],
    ["1 ahead of prograde, facing retrograde", "retrograde", 3, 1, false],
    ["the same sector, facing prograde", "prograde", 3, 0, true],
    ["the same sector, facing retrograde", "retrograde", 3, 0, true],
    ["one ring out, the same sector", "prograde", 4, 0, false],
    ["one ring out, 1 ahead", "prograde", 4, 1, false],
    ["one ring in, 2 ahead", "prograde", 2, 2, false],
  ])("a target %s: in range %s", (_label, facing, ring, offset, legal) => {
    const state = makeTwoPlayerGame(
      { loadout: LOADOUTS.sensor, facing },
      { ring, sector: wrapSector(offset) }
    );
    const result = executeTurnAs(state, scan(1, "p2", "side-0"));
    if (legal) expect(result.errors).toBeUndefined();
    else expectRefused(result, state);
  });

  it("a rotation first turns the box onto a ship astern", () => {
    const state = makeTwoPlayerGame({ loadout: LOADOUTS.sensor }, { ring: 3, sector: 22 });
    expectRefusedUnless(
      executeTurnAs(state, scan(1, "p2", "side-0"), rotate(2, "retrograde")),
      executeTurnAs(state, rotate(1, "retrograde"), scan(2, "p2", "side-0"))
    );
  });
});

describe("scan: rejections", () => {
  // Each is taken with a sensor array aboard and side-0 as the peek slot.
  it.each([
    [
      "no sensor array installed",
      (s: GameState) => withShip(s, "p1", makeTwoPlayerGame().players[0].ship),
      "side-0",
    ],
    ["a fixed system as the peek slot", (s: GameState) => s, "engines"],
    ["an unknown peek slot", (s: GameState) => s, "side-9"],
  ])("rejects scanning with %s", (_label, setup, slot) => {
    const state = setup(scanner());
    const result = executeTurnAs(state, scan(1, "p2", slot));
    expectRefused(result, state);
    expectRefusedUnless(result, executeTurnAs(scanner(), scan(1, "p2", "side-0")));
  });
});

describe("scan: intercept missions", () => {
  it("acquires the transmission for an intercept mission on the target", () => {
    const card = interceptMission("p2", "intercept-p2", GAMMA);
    const state = withPlayer(scanner(), "p1", { missions: [card] });
    const result = executeTurnAs(state, scan(1, "p2"));
    const mission = getPlayer(result.gameState, "p1").missions[0];
    expect(mission).toMatchObject({ type: "intercept_transmission", isCompleted: false });
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([
      {
        id: "data-intercept-p2",
        missionId: "intercept-p2",
        kind: "data",
        // The data is filed where the card says, not at the nearest station.
        deliveryPlanetId: GAMMA,
        isPickedUp: true,
      },
    ]);
    expect(eventsOf(result.events, "data_acquired")).toEqual([
      expect.objectContaining({
        playerId: "p1",
        kind: "scan",
        missionId: "intercept-p2",
        privateTo: ["p1"],
      }),
    ]);
  });

  it("a scan after a pirate took the data puts the same data back aboard, not a second copy", () => {
    const card = interceptMission("p2", "intercept-p2", GAMMA);
    // Seized: the data is still in the hold, un-picked, as a pirate leaves it.
    const state = withPlayer(scanner(), "p1", {
      missions: [card],
      cargo: [{ ...takenData(card), isPickedUp: false }],
    });
    const result = executeTurnAs(state, scan(1, "p2"));
    expect(eventTypes(result.events)).toContain("data_acquired");
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([takenData(card)]);
  });

  it("does not acquire for intercept missions on other players, nor twice", () => {
    const other = withPlayer(scanner(), "p1", { missions: [interceptMission("p3")] });
    const otherResult = executeTurnAs(other, scan(1, "p2"));
    expect(eventTypes(otherResult.events)).not.toContain("data_acquired");
    expect(getPlayer(otherResult.gameState, "p1").cargo).toEqual([]);

    const already = withPlayer(scanner(), "p1", {
      missions: [interceptMission("p2")],
      cargo: [takenData(interceptMission("p2"))],
    });
    const againResult = executeTurnAs(already, scan(1, "p2"));
    expect(eventTypes(againResult.events)).not.toContain("data_acquired");
    expect(getPlayer(againResult.gameState, "p1").cargo).toHaveLength(1);
  });
});
