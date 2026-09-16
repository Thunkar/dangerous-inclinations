import { viewFor } from "../../game/view.ts";
import { describe, it, expect } from "vitest";
import { dropCargo, findRespawnPosition, needsRespawn, respawnPlayer } from "../../game/respawn.ts";
import { REACTOR_CAPACITY } from "../../models/game.ts";
import type { GameState, Player, ShipLoadout } from "../../models/game.ts";
import type { Cargo } from "../../models/missions.ts";
import { ringVelocity, wrapSector } from "../../game/geometry.ts";
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
  withMissile,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const COMPRESSOR: ShipLoadout = {
  forwardSlots: ["fuel_compressor"],
  sideSlots: ["missiles", "laser", "shields", "laser"],
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

  it("a respawned ship refuels to a full tank", () => {
    let state = makeTwoPlayerGame({}, { loadout: COMPRESSOR }, { activePlayerIndex: 1 });
    state = withShip(state, "p2", { hitPoints: 0, reactionMass: 0 });
    expect(getShip(mustExecute(state), "p2").reactionMass).toBe(10);
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
    // Beta ring 3 drifts 1 a turn: the helm is empty, the orbit is not.
    expect(getShip(skipped.gameState, "p2")).toMatchObject({ wellId: BETA, ring: 3, sector: 8 });
    expect(getShip(skipped.gameState, "p2").reactionMass).toBe(10);
    expect(getPlayer(skipped.gameState, "p2").skipTurns).toBe(0);
    // Two turns later the player acts normally again.
    state = mustExecute(skipped.gameState, coast(1));
    const acting = executeTurnAs(state, coast(1));
    expect(acting.errors).toBeUndefined();
    expect(eventTypes(acting.events)).toContain("coasted");
    expect(getShip(acting.gameState, "p2")).toMatchObject({ wellId: BETA, ring: 3, sector: 9 });
  });

  it("no one can shoot a wreck while it waits to respawn", () => {
    const state = withShip(withPower(makeTwoPlayerGame(), "p1", "side-3", 2), "p2", {
      hitPoints: 0,
    });
    expect(executeTurnAs(state, fire(1, "side-3", "p2")).errors?.[0]).toMatch(/not on the board/i);
  });
});

/**
 * Losing your turns means you cannot act, not that physics stops for you
 * (RULES §A Turn). A recovering ship rides its orbit like everything else on
 * its ring, which is what the board animates and what a missile has to chase.
 */
describe("respawn: a recovering ship drifts", () => {
  /** p2 recovering at `position`, p2 to act; p1 parked out of the way. */
  function recovering(position: { wellId: string; ring: number; sector: number }): GameState {
    const state = makeGameState(
      [makePlayer("p1", { wellId: BH, ring: 5, sector: 0 }), makePlayer("p2", position)],
      { activePlayerIndex: 1 }
    );
    return withPlayer(state, "p2", { skipTurns: 1 });
  }

  it.each([
    [BH, 4],
    [BH, 1],
    [BH, 5],
    [BETA, 3],
  ])("carries the ship its ring's velocity on %s ring %i", (wellId, ring) => {
    const start = 5;
    const state = recovering({ wellId, ring, sector: start });
    const result = executeTurnAs(state, allocate("engines", 3), burn(1, "soft"));
    expect(result.errors).toBeUndefined();
    const to = { wellId, ring, sector: wrapSector(start + ringVelocity(wellId, ring)) };
    expect(getShip(result.gameState, "p2")).toMatchObject(to);
    expect(eventsOf(result.events, "coasted")).toEqual([
      expect.objectContaining({ playerId: "p2", to, recovering: true, scooped: false, heat: 0 }),
    ]);
  });

  it("still spends the lost turn, and stops drifting on its own once it is over", () => {
    const state = recovering({ wellId: BH, ring: 4, sector: 5 });
    const skipped = executeTurnAs(state);
    expect(eventsOf(skipped.events, "turn_skipped")).toEqual([
      expect.objectContaining({ playerId: "p2", remaining: 0 }),
    ]);
    expect(getPlayer(skipped.gameState, "p2").skipTurns).toBe(0);
    // Back in command: the ship holds still only if its pilot says so — a burn
    // is executed now, where the recovering turn ignored one.
    const back = mustExecute(skipped.gameState, coast(1));
    const acting = executeTurnAs(back, allocate("engines", 1), burn(1, "soft"));
    expect(eventTypes(acting.events)).toContain("burned");
  });

  it("two lost turns drift twice", () => {
    let state = withPlayer(recovering({ wellId: BH, ring: 4, sector: 0 }), "p2", { skipTurns: 2 });
    state = mustExecute(state); // p2 recovering
    state = mustExecute(state, coast(1)); // p1
    state = mustExecute(state); // p2 recovering again
    expect(getShip(state, "p2").sector).toBe(2 * ringVelocity(BH, 4));
    expect(getPlayer(state, "p2").skipTurns).toBe(0);
  });

  it("drifts into an occupied sector: ships may share one, only placement avoids it", () => {
    const velocity = ringVelocity(BH, 4);
    let state = recovering({ wellId: BH, ring: 4, sector: 5 });
    state = withShip(state, "p1", { wellId: BH, ring: 4, sector: wrapSector(5 + velocity) });
    const result = executeTurnAs(state);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p2").sector).toBe(wrapSector(5 + velocity));
    expect(getShip(result.gameState, "p1").sector).toBe(wrapSector(5 + velocity));
  });

  it("rides no station: it is on the black hole, so the stations leave without it", () => {
    const state = recovering({ wellId: BH, ring: 4, sector: 5 });
    const result = executeTurnAs(state); // p2 is last in order: the round ends here
    expect(eventsOf(result.events, "stations_moved")).toEqual([
      expect.objectContaining({ riders: [] }),
    ]);
    expect(getShip(result.gameState, "p2").sector).toBe(wrapSector(5 + ringVelocity(BH, 4)));
  });

  it("a missile in flight chases where the drift takes it", () => {
    // Ring 4 drifts 2 and ring 5 drifts 1: the missile has to spend its steps
    // on where the wreck is going, not on where it was left.
    let state = recovering({ wellId: BH, ring: 4, sector: 10 });
    state = withMissile(state, { ownerId: "p1", targetId: "p2", ring: 5, sector: 12 });
    const drifted = mustExecute(state); // p2 recovering: 10 -> 12
    expect(getShip(drifted, "p2").sector).toBe(12);
    const hunt = executeTurnAs(drifted, coast(1)); // p1's turn: the missile flies
    expect(eventsOf(hunt.events, "attack_resolved")).toEqual([
      expect.objectContaining({ attackerId: "p1", targetId: "p2", weaponType: "missiles" }),
    ]);
    expect(getShip(hunt.gameState, "p2").hitPoints).toBeLessThan(getShip(drifted, "p2").hitPoints);
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
