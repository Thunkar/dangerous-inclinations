import { describe, it, expect } from "vitest";
import type { GameState, ShipLoadout } from "../../models/game.ts";
import {
  GAMMA,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  getPlayer,
  getSub,
  interceptMission,
  makeTwoPlayerGame,
  mustExecute,
  scan,
  withPlayer,
  withShip,
} from "../testUtils.ts";

const SENSOR: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["laser", "laser", "shields", "missiles"],
};

/** p1 at R3 S0 with a sensor aboard; p2 on the same ring `sectors` ahead. The scan powers it. */
function scanner(sectors = 3, targetLoadout?: ShipLoadout): GameState {
  return makeTwoPlayerGame({ loadout: SENSOR }, { ring: 3, sector: sectors, loadout: targetLoadout });
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
    const result = executeTurnAs(scanner(), scan(1, "p2", "side-0"), scan(2, "p2", "side-1"));
    expect(result.errors?.[0]).toMatch(/unused this turn/i);
  });

  it("range is measured when the scan executes", () => {
    const state = scanner(6); // 6 sectors ahead: out of range now, 2 after drifting to S4
    expect(executeTurnAs(state, scan(1, "p2")).errors?.[0]).toMatch(/within 3 sectors/i);
    expect(executeTurnAs(state, coast(1), scan(2, "p2")).errors).toBeUndefined();
  });

  it("does not consume the dice", () => {
    const state = { ...scanner(), forcedRollValue: undefined };
    const result = executeTurnAs(state, scan(1, "p2"));
    expect(result.errors).toBeUndefined();
    expect(result.gameState.rngState).toBe(state.rngState);
  });
});

describe("scan: rejections", () => {
  it.each([
    [
      "no sensor array installed",
      (s: GameState) => withShip(s, "p1", makeTwoPlayerGame().players[0].ship),
      "p2",
      "side-0",
      /no sensor array/i,
    ],
    [
      "a fixed system as the peek slot",
      (s: GameState) => s,
      "p2",
      "engines",
      /not a loadout slot/i,
    ],
    ["an unknown peek slot", (s: GameState) => s, "p2", "side-9", /not a loadout slot/i],
  ])("rejects scanning with %s", (_label, setup, target, slot, message) => {
    const state = setup(scanner());
    const result = executeTurnAs(state, scan(1, target, slot));
    expect(result.errors?.[0]).toMatch(message);
    expect(result.gameState).toBe(state);
  });
});

describe("scan: intercept missions", () => {
  it("acquires the transmission for an intercept mission on the target", () => {
    const card = interceptMission("p2", "intercept-p2", GAMMA);
    const state = withPlayer(scanner(), "p1", { missions: [card] });
    const result = executeTurnAs(state, scan(1, "p2"));
    const mission = getPlayer(result.gameState, "p1").missions[0];
    expect(mission).toMatchObject({
      type: "intercept_transmission",
      scanAcquired: true,
      isCompleted: false,
    });
    expect(getPlayer(result.gameState, "p1").cargo).toEqual([
      {
        id: "data-intercept-p2",
        missionId: "intercept-p2",
        kind: "data",
        // The chit is filed where the card says, not at the nearest station.
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

  it("does not acquire for intercept missions on other players, nor twice", () => {
    const other = withPlayer(scanner(), "p1", { missions: [interceptMission("p3")] });
    const otherResult = executeTurnAs(other, scan(1, "p2"));
    expect(eventTypes(otherResult.events)).not.toContain("data_acquired");
    expect(getPlayer(otherResult.gameState, "p1").cargo).toEqual([]);

    const already = withPlayer(scanner(), "p1", {
      missions: [{ ...interceptMission("p2"), scanAcquired: true }],
      cargo: [
        {
          id: "data-intercept-p2",
          missionId: "intercept-p2",
          kind: "data",
          deliveryPlanetId: "any",
          isPickedUp: true,
        },
      ],
    });
    const againResult = executeTurnAs(already, scan(1, "p2"));
    expect(eventTypes(againResult.events)).not.toContain("data_acquired");
    expect(getPlayer(againResult.gameState, "p1").cargo).toHaveLength(1);
  });
});
