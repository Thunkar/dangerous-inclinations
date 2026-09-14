import { viewFor } from "../../game/view.ts";
import { describe, it, expect } from "vitest";
import { dropCargo, findRespawnPosition, needsRespawn, respawnPlayer } from "../../game/respawn.ts";
import { REACTOR_CAPACITY } from "../../models/game.ts";
import type { GameState, Player, ShipLoadout } from "../../models/game.ts";
import type { Cargo } from "../../models/missions.ts";
import {
  allocate,
  BETA,
  BH,
  burn,
  coast,
  eventsOf,
  eventTypes,
  executeTurnAs,
  fire,
  getPlayer,
  getShip,
  getSub,
  interceptMission,
  makeGameState,
  makePlayer,
  makeTwoPlayerGame,
  mustExecute,
  surveyMission,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const COMPRESSOR: ShipLoadout = {
  forwardSlots: ["railgun"],
  sideSlots: ["fuel_compressor", "laser", "shields", "laser"],
};

const crate: Cargo = {
  id: "crate-1",
  missionId: "d",
  kind: "crate",
  pickupPlanetId: BETA,
  deliveryPlanetId: "planet-gamma",
  isPickedUp: true,
};
const data: Cargo = {
  id: "data-intercept-p1",
  missionId: "intercept-p1",
  kind: "data",
  deliveryPlanetId: "any",
  isPickedUp: true,
};

/** p2 destroyed and next to act, carrying scars from its previous life. */
function wreck(): GameState {
  let state = makeTwoPlayerGame(
    {},
    { ring: 2, sector: 5, facing: "retrograde" },
    { activePlayerIndex: 1 }
  );
  state = withShip(state, "p2", { hitPoints: 0, reactionMass: 2, heat: { currentHeat: 7 } });
  state = withPower(state, "p2", "side-2", 3);
  state = withSub(state, "p2", "side-0", { isRevealed: true });
  state = withSub(state, "p2", "engines", { isBroken: true });
  state = withPlayer(state, "p2", {
    home: { wellId: BETA, ring: 3, sector: 7 },
    completedMissionCount: 1,
    intel: { p1: ["side-1"] },
  });
  return state;
}

describe("respawn: destruction drops cargo", () => {
  it("a kill drops picked-up crates and destroys data; acquired flags reset", () => {
    let state = withPower(
      makeTwoPlayerGame({ ring: 3, sector: 0 }, { ring: 3, sector: 2 }),
      "p1",
      "forward-0",
      4
    );
    state = withShip(state, "p2", { hitPoints: 4 });
    // The intercept's data is aboard and is lost; the survey's data was already delivered
    // (not aboard), so that mission keeps its acquired flag.
    const intercept = { ...interceptMission("p1"), scanAcquired: true };
    state = withPlayer(state, "p2", {
      cargo: [
        crate,
        { ...data, missionId: intercept.id },
        { ...crate, id: "crate-2", isPickedUp: false },
      ],
      missions: [intercept, { ...surveyMission(), surveyAcquired: true }],
    });
    const result = executeTurnAs(state, fire(1, "forward-0", "p2"));
    expect(eventsOf(result.events, "cargo_dropped")).toEqual([
      expect.objectContaining({ playerId: "p2", crates: 1, data: 1 }),
    ]);
    const p2 = getPlayer(result.gameState, "p2");
    expect(p2.cargo.map((c) => [c.id, c.isPickedUp])).toEqual([
      ["crate-1", false],
      ["crate-2", false],
    ]);
    expect(
      p2.missions.map((m) =>
        "scanAcquired" in m ? m.scanAcquired : "surveyAcquired" in m ? m.surveyAcquired : null
      )
    ).toEqual([false, true]);
  });

  it("completed missions keep their acquired data flags", () => {
    const player: Player = {
      ...makePlayer("p2"),
      cargo: [data],
      missions: [{ ...interceptMission("p1"), scanAcquired: true, isCompleted: true }],
    };
    expect(dropCargo(player).player.missions[0]).toMatchObject({
      scanAcquired: true,
      isCompleted: true,
    });
  });

  it("dropping nothing emits nothing", () => {
    const player = makePlayer("p2");
    expect(dropCargo(player)).toEqual({ player, events: [] });
  });
});

describe("respawn: who needs it", () => {
  it.each([
    ["deployed and destroyed", true, 0, true],
    ["deployed and alive", true, 3, false],
    ["destroyed but never deployed", false, 0, false],
  ])("%s -> %s", (_label, hasDeployed, hitPoints, expected) => {
    const player = makePlayer("p2", undefined, undefined, {
      hasDeployed,
      ship: { hitPoints } as never,
    });
    expect(needsRespawn(player)).toBe(expected);
  });
});

describe("respawn: the turn after dying", () => {
  it("the ship reappears at Home, fresh, and the turn ends without executing any action", () => {
    const state = wreck();
    const result = executeTurnAs(state, burn(1, "soft"), fire(2, "forward-0", "nobody"));
    expect(result.errors).toBeUndefined();
    expect(eventTypes(result.events)).toEqual(["respawned", "stations_moved"]);
    expect(eventsOf(result.events, "respawned")[0]).toMatchObject({
      playerId: "p2",
      position: { wellId: BETA, ring: 3, sector: 7 },
    });

    const ship = getShip(result.gameState, "p2");
    expect(ship).toMatchObject({
      wellId: BETA,
      ring: 3,
      sector: 7,
      facing: "prograde",
      hitPoints: 10,
      reactionMass: 10,
      heat: { currentHeat: 0 },
    });
    expect(ship.reactor.availableEnergy).toBe(REACTOR_CAPACITY);
    expect(
      ship.subsystems.every((s) => s.allocatedEnergy === 0 && !s.isPowered && !s.isBroken)
    ).toBe(true);
    expect(result.gameState.activePlayerIndex).toBe(0);
    expect(result.gameState.turn).toBe(2);
  });

  it("face-up tiles stay face-up; the rest stay face-down", () => {
    const state = mustExecute(wreck());
    expect(getSub(state, "p2", "side-0").isRevealed).toBe(true);
    expect(getSub(state, "p2", "side-1").isRevealed).toBe(false);
    expect(getSub(state, "p2", "engines").isRevealed).toBe(true);
  });

  it("missions, score, intel and unpicked crates survive death", () => {
    let state = withPlayer(wreck(), "p2", {
      cargo: [{ ...crate, isPickedUp: false }],
      missions: [surveyMission()],
    });
    state = mustExecute(state);
    const p2 = getPlayer(state, "p2");
    expect(p2).toMatchObject({
      completedMissionCount: 1,
      intel: { p1: ["side-1"] },
      home: { wellId: BETA, ring: 3, sector: 7 },
    });
    expect(p2.missions).toHaveLength(1);
    expect(p2.cargo).toEqual([{ ...crate, isPickedUp: false }]);
  });

  it("a respawned ship refuels to its loadout's capacity", () => {
    let state = makeTwoPlayerGame({}, { loadout: COMPRESSOR }, { activePlayerIndex: 1 });
    state = withShip(state, "p2", { hitPoints: 0, reactionMass: 0 });
    expect(getShip(mustExecute(state), "p2").reactionMass).toBe(16);
  });

  it("the turn after respawning is lost: actions are ignored and the ship only drifts", () => {
    let state = mustExecute(wreck()); // p2 respawned at Beta R3 S7 with skipTurns 1; p1 to act
    expect(getPlayer(state, "p2").skipTurns).toBe(1);
    expect(viewFor(state, "p1").players[1].skipTurns).toBe(1);
    state = mustExecute(state, coast(1));
    const skipped = executeTurnAs(state, allocate("engines", 3), burn(1, "soft"));
    expect(skipped.errors).toBeUndefined();
    expect(eventTypes(skipped.events)).toContain("turn_skipped");
    expect(eventTypes(skipped.events)).not.toContain("burned");
    expect(getShip(skipped.gameState, "p2")).toMatchObject({ wellId: BETA, ring: 3, sector: 7 });
    expect(getPlayer(skipped.gameState, "p2").skipTurns).toBe(0);
    // Two turns later the player acts normally again.
    state = mustExecute(skipped.gameState, coast(1));
    const acting = executeTurnAs(state, coast(1));
    expect(acting.errors).toBeUndefined();
    expect(eventTypes(acting.events)).toContain("coasted");
    expect(getShip(acting.gameState, "p2")).toMatchObject({ wellId: BETA, ring: 3, sector: 8 });
  });

  it("no one can shoot a wreck while it waits to respawn", () => {
    const state = withShip(withPower(makeTwoPlayerGame(), "p1", "side-3", 2), "p2", {
      hitPoints: 0,
    });
    expect(executeTurnAs(state, fire(1, "side-3", "p2")).errors?.[0]).toMatch(/not on the board/i);
  });
});

describe("respawn: choosing the sector", () => {
  const home = { wellId: BETA, ring: 3, sector: 7 };

  it("uses Home when it is free", () => {
    expect(findRespawnPosition(makeTwoPlayerGame(), home, "p2")).toEqual(home);
  });

  it("takes the nearest free sector, trying +1 before -1", () => {
    const blockers = (sectors: number[]) =>
      makeGameState([
        makePlayer("p2"),
        ...sectors.map((sector, i) => makePlayer(`b${i}`, { wellId: BETA, ring: 3, sector })),
      ]);
    expect(findRespawnPosition(blockers([7]), home, "p2")).toEqual({ ...home, sector: 8 });
    expect(findRespawnPosition(blockers([7, 8]), home, "p2")).toEqual({ ...home, sector: 6 });
    expect(findRespawnPosition(blockers([7, 8, 6]), home, "p2")).toEqual({ ...home, sector: 9 });
  });

  it("ignores wrecks, undeployed ships and itself", () => {
    let state = makeGameState([
      makePlayer("p2", { wellId: BETA, ring: 3, sector: 7 }),
      makePlayer("wreck", { wellId: BETA, ring: 3, sector: 7 }),
      makePlayer("ghost", { wellId: BETA, ring: 3, sector: 7 }),
    ]);
    state = withShip(state, "wreck", { hitPoints: 0 });
    state = withPlayer(state, "ghost", { hasDeployed: false });
    expect(findRespawnPosition(state, home, "p2")).toEqual(home);
  });

  it("through executeTurn: a wreck whose Home is occupied comes back next door", () => {
    let state = wreck();
    state = withShip(state, "p1", { wellId: BETA, ring: 3, sector: 7 });
    const result = executeTurnAs(state);
    expect(getShip(result.gameState, "p2")).toMatchObject({ wellId: BETA, ring: 3, sector: 8 });
    expect(getShip(result.gameState, "p1").sector).toBe(7);
  });

  it("a player without a Home cannot respawn", () => {
    const state = withPlayer(wreck(), "p2", { home: null });
    const direct = respawnPlayer(state, 1);
    expect(direct.state).toBe(state);
    expect(direct.events).toEqual([]);
    const result = executeTurnAs(state);
    expect(getShip(result.gameState, "p2").hitPoints).toBe(0);
    expect(getShip(result.gameState, "p2").wellId).toBe(BH);
  });
});
