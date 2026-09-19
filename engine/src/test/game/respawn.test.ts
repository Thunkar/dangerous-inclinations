import { viewFor } from "../../game/view.ts";
import { describe, it, expect } from "vitest";
import { PLANET_OUTER_RING } from "../../models/gravityWells.ts";
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
    home: { wellId: BETA, ring: PLANET_OUTER_RING, sector: 7 },
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
      missions: [intercept, { ...surveyMission(), acquired: true }],
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
        "scanAcquired" in m ? m.scanAcquired : "acquired" in m ? m.acquired : null
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
    expect(eventTypes(result.events)).toEqual(["respawned", "coasted", "stations_moved"]);
    // Home is Beta ring 4 sector 7 and that ring drifts 1: the ship is placed
    // and the orbit carries it before the turn ends.
    const back = { wellId: BETA, ring: PLANET_OUTER_RING, sector: 8 };
    expect(eventsOf(result.events, "respawned")[0]).toMatchObject({
      playerId: "p2",
      position: back,
    });

    const ship = getShip(result.gameState, "p2");
    expect(ship).toMatchObject({
      ...back,
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
    expect(result.gameState.turn).toBe(state.turn + 1);
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
      home: { wellId: BETA, ring: PLANET_OUTER_RING, sector: 7 },
    });
    expect(p2.missions).toHaveLength(1);
    expect(p2.cargo).toEqual([{ ...crate, isPickedUp: false }]);
  });

  it("a respawned ship refuels to a full tank", () => {
    let state = makeTwoPlayerGame({}, { loadout: COMPRESSOR }, { activePlayerIndex: 1 });
    state = withShip(state, "p2", { hitPoints: 0, reactionMass: 0 });
    expect(getShip(mustExecute(state), "p2").reactionMass).toBe(10);
  });

  /**
   * Re-baselined when the recovery turn went away: the respawn costs one turn,
   * not two, and what the second turn used to buy is bought instead by being
   * untouchable until it comes (RULES §Destruction and Respawn).
   */
  it("only the respawn turn is lost: the ship comes back untouchable and acts next turn", () => {
    let state = mustExecute(wreck()); // p2 back at Beta R4, drifted to S8; p1 to act
    expect(getPlayer(state, "p2")).toMatchObject({ recovering: true, skipTurns: 0 });
    expect(viewFor(state, "p1").players[1].recovering).toBe(true);

    state = mustExecute(state, coast(1));
    // Scooping is something only a crew at the helm can do: a lost turn drifts
    // and nothing else.
    const acting = executeTurnAs(state, allocate("scoop", 3), coast(1, true));
    expect(acting.errors).toBeUndefined();
    expect(eventTypes(acting.events)).toContain("fuel_scooped");
    expect(eventTypes(acting.events)).not.toContain("turn_skipped");
    expect(getPlayer(acting.gameState, "p2").recovering).toBe(false);
    expect(viewFor(acting.gameState, "p1").players[1].recovering).toBe(false);
  });

  it("no one can shoot a wreck while it waits to respawn", () => {
    const state = withShip(withPower(makeTwoPlayerGame(), "p1", "side-3", 2), "p2", {
      hitPoints: 0,
    });
    expect(executeTurnAs(state, fire(1, "side-3", "p2")).errors?.[0]).toMatch(/not on the board/i);
  });
});

/**
 * Coming back is not standing still (RULES §A Turn): the ship is placed at
 * Home and its ring carries it from there, which is what the board animates
 * and what a missile has to chase.
 */
describe("respawn: the returning ship drifts", () => {
  /** p2 destroyed with Home at `home` and next to act; p1 parked out of the way. */
  function returning(home: { wellId: string; ring: number; sector: number }): GameState {
    const state = makeGameState(
      [makePlayer("p1", { wellId: BH, ring: 5, sector: 0 }), makePlayer("p2")],
      { activePlayerIndex: 1 }
    );
    return withPlayer(withShip(state, "p2", { hitPoints: 0 }), "p2", { home });
  }

  it.each([
    [BH, 4],
    [BH, 1],
    [BH, 5],
    [BETA, 3],
  ])("carries the ship its ring's velocity on %s ring %i", (wellId, ring) => {
    const start = 5;
    const result = executeTurnAs(returning({ wellId, ring, sector: start }));
    expect(result.errors).toBeUndefined();
    const to = { wellId, ring, sector: wrapSector(start + ringVelocity(wellId, ring)) };
    expect(getShip(result.gameState, "p2")).toMatchObject(to);
    expect(eventsOf(result.events, "respawned")).toEqual([
      expect.objectContaining({ playerId: "p2", position: to }),
    ]);
    expect(eventsOf(result.events, "coasted")).toEqual([
      expect.objectContaining({ playerId: "p2", to, recovering: true, scooped: false, heat: 0 }),
    ]);
  });

  it("drifts into an occupied sector: ships may share one, only placement avoids it", () => {
    const velocity = ringVelocity(BH, 4);
    let state = returning({ wellId: BH, ring: 4, sector: 5 });
    state = withShip(state, "p1", { wellId: BH, ring: 4, sector: wrapSector(5 + velocity) });
    const result = executeTurnAs(state);
    expect(result.errors).toBeUndefined();
    expect(getShip(result.gameState, "p2").sector).toBe(wrapSector(5 + velocity));
    expect(getShip(result.gameState, "p1").sector).toBe(wrapSector(5 + velocity));
  });

  it("rides no station: Home is on the black hole, so the stations leave without it", () => {
    const state = returning({ wellId: BH, ring: 4, sector: 5 });
    const result = executeTurnAs(state); // p2 is last in order: the round ends here
    expect(eventsOf(result.events, "stations_moved")).toEqual([
      expect.objectContaining({ riders: [] }),
    ]);
    expect(getShip(result.gameState, "p2").sector).toBe(wrapSector(5 + ringVelocity(BH, 4)));
  });
});

/**
 * Nothing sets `skipTurns` any more, but recordings made when the turn after
 * the respawn was lost as well still replay: that turn drifts and counts down
 * like it always did.
 */
describe("respawn: an old recording's lost turn", () => {
  it("drifts, ignores the actions submitted with it, and clears", () => {
    const state = withPlayer(
      makeGameState([makePlayer("p1", { wellId: BH, ring: 5, sector: 0 }), makePlayer("p2")], {
        activePlayerIndex: 1,
      }),
      "p2",
      { skipTurns: 1 }
    );
    const skipped = executeTurnAs(state, allocate("engines", 3), burn(1, "soft"));
    expect(skipped.errors).toBeUndefined();
    expect(eventTypes(skipped.events)).toContain("turn_skipped");
    expect(eventTypes(skipped.events)).not.toContain("burned");
    expect(getShip(skipped.gameState, "p2").sector).toBe(ringVelocity(BH, 3));
    expect(getPlayer(skipped.gameState, "p2").skipTurns).toBe(0);
  });
});

describe("respawn: choosing the sector", () => {
  const home = { wellId: BETA, ring: PLANET_OUTER_RING, sector: 7 };

  it("uses Home when it is free", () => {
    expect(findRespawnPosition(makeTwoPlayerGame(), home, "p2")).toEqual(home);
  });

  it("takes the nearest free sector, trying +1 before -1", () => {
    const blockers = (sectors: number[]) =>
      makeGameState([
        makePlayer("p2"),
        ...sectors.map((sector, i) => makePlayer(`b${i}`, { wellId: BETA, ring: PLANET_OUTER_RING, sector })),
      ]);
    expect(findRespawnPosition(blockers([7]), home, "p2")).toEqual({ ...home, sector: 8 });
    expect(findRespawnPosition(blockers([7, 8]), home, "p2")).toEqual({ ...home, sector: 6 });
    expect(findRespawnPosition(blockers([7, 8, 6]), home, "p2")).toEqual({ ...home, sector: 9 });
  });

  it("ignores wrecks, undeployed ships and itself", () => {
    let state = makeGameState([
      makePlayer("p2", { wellId: BETA, ring: PLANET_OUTER_RING, sector: 7 }),
      makePlayer("wreck", { wellId: BETA, ring: PLANET_OUTER_RING, sector: 7 }),
      makePlayer("ghost", { wellId: BETA, ring: PLANET_OUTER_RING, sector: 7 }),
    ]);
    state = withShip(state, "wreck", { hitPoints: 0 });
    state = withPlayer(state, "ghost", { hasDeployed: false });
    expect(findRespawnPosition(state, home, "p2")).toEqual(home);
  });

  it("through executeTurn: a wreck whose Home is occupied comes back next door", () => {
    let state = wreck();
    state = withShip(state, "p1", { wellId: BETA, ring: PLANET_OUTER_RING, sector: 7 });
    const result = executeTurnAs(state);
    // Placed on sector 8 because Home is taken, then carried one more by the ring.
    expect(getShip(result.gameState, "p2")).toMatchObject({ wellId: BETA, ring: PLANET_OUTER_RING, sector: 9 });
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
