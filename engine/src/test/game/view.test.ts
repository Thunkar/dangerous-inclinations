import { describe, it, expect } from "vitest";
import { CEASEFIRE_ROUNDS, FIRST_TURN } from "../../models/game.ts";
import { MAX_HEAT } from "../../models/game.ts";
import { opponentPositions, viewFor } from "../../game/view.ts";
import { canSeeEvent, filterEventsFor } from "../../models/events.ts";
import type { GameEvent } from "../../models/events.ts";
import type { ShipLoadout } from "../../models/game.ts";
import { STARTING_REACTION_MASS } from "../../models/game.ts";
import {
  destroyMission,
  ALPHA,
  BH,
  allocate,
  burn,
  coast,
  deallocate,
  mustExecute,
  eventTypes,
  executeTurnAs,
  makeTwoPlayerGame,
  scan,
  surveyMission,
  withMissile,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

const SENSOR: ShipLoadout = {
  forwardSlots: ["sensor_array"],
  sideSlots: ["radiator", "laser", "shields", "missiles"],
};
const COMPRESSOR: ShipLoadout = {
  forwardSlots: ["fuel_compressor"],
  sideSlots: ["missiles", "laser", "shields", "laser"],
};

/** p2 has fired its side-0 laser (face-up); p1 has scanned p2's side-2. */
function knownGame() {
  let state = makeTwoPlayerGame();
  state = withSub(state, "p2", "side-0", { isRevealed: true });
  state = withSub(state, "p2", "side-1", { isBroken: true, isRevealed: true });
  state = withPlayer(state, "p1", { intel: { p2: ["side-2"] } });
  return state;
}

const slot = (view: ReturnType<typeof viewFor>, playerIndex: number, id: string) =>
  view.players[playerIndex].slots.find((s) => s.id === id)!;

describe("view: what an opponent's mat shows", () => {
  const view = viewFor(knownGame(), "p1");

  it("face-down tiles are unknown: no type, no condition", () => {
    expect(slot(view, 1, "forward-0")).toEqual({
      id: "forward-0",
      group: "forward",
      index: 0,
      type: null,
      isBroken: null,
      knownVia: null,
      allocatedEnergy: 0,
      ammo: null,
    });
    expect(slot(view, 1, "side-3").type).toBeNull();
  });

  it("face-up tiles show their type and condition", () => {
    expect(slot(view, 1, "side-0")).toMatchObject({
      type: "laser",
      isBroken: false,
      knownVia: "revealed",
    });
    expect(slot(view, 1, "side-1")).toMatchObject({
      type: "laser",
      isBroken: true,
      knownVia: "revealed",
    });
  });

  it("scanned tiles are known only to the scanner", () => {
    expect(slot(view, 1, "side-2")).toMatchObject({ type: "shields", knownVia: "scanned" });
    expect(slot(viewFor(knownGame(), "p2"), 0, "side-2").type).toBeNull();
    expect(slot(viewFor(knownGame(), null), 1, "side-2").type).toBeNull();
  });

  it("a tile that is both face-up and scanned counts as revealed", () => {
    const state = withPlayer(knownGame(), "p1", { intel: { p2: ["side-0"] } });
    expect(slot(viewFor(state, "p1"), 1, "side-0").knownVia).toBe("revealed");
  });

  it("fixed systems are always visible, including whether they are broken", () => {
    const state = withPower(
      withSub(knownGame(), "p2", "engines", { isBroken: true }),
      "p2",
      "scoop",
      3
    );
    expect(viewFor(state, "p1").players[1].fixed).toEqual([
      { id: "engines", type: "engines", isBroken: true, allocatedEnergy: 0 },
      { id: "rotation", type: "rotation", isBroken: false, allocatedEnergy: 0 },
      { id: "scoop", type: "scoop", isBroken: false, allocatedEnergy: 3 },
    ]);
  });

  it("nothing about the loadout shows before it is submitted", () => {
    const state = withPlayer(knownGame(), "p2", { hasSubmittedLoadout: false });
    expect(
      viewFor(state, "p1").players[1].slots.every((s) => s.type === null && s.knownVia === null)
    ).toBe(true);
  });

  it("exposes position, facing, hull, heat, fuel and the free reactor pool, but not cards or intel", () => {
    const state = withPower(
      withShip(knownGame(), "p2", { heat: { currentHeat: 3 }, hitPoints: 7 }),
      "p2",
      "side-2",
      4
    );
    const opponent = viewFor(state, "p1").players[1];
    expect(opponent.ship).toEqual({
      wellId: BH,
      ring: 3,
      sector: 12,
      facing: "prograde",
      hitPoints: 7,
      maxHitPoints: 10,
      heat: 3,
      reactorAvailable: 6,
      fuel: STARTING_REACTION_MASS,
      isDestroyed: false,
    });
    for (const secret of ["missions", "missionOffers", "cargo", "intel", "reactor", "subsystems"]) {
      expect(opponent).not.toHaveProperty(secret);
    }
    // Ammo is readable on a face-up rack and on nothing else, so a slot the
    // viewer cannot identify must not carry a number either.
    for (const s of opponent.slots) {
      if (s.type === null) expect(s.ammo).toBeNull();
    }
  });

  it("fuel is public: a rival's tank is on the table like their hull", () => {
    const state = withPower(makeTwoPlayerGame(), "p1", "engines", 3);
    const after = mustExecute(state, burn(1, "medium", 2));
    // A medium burn is 2 fuel, phased 2 sectors for 2 more.
    expect(viewFor(after, "p2").players[0].ship!.fuel).toBe(STARTING_REACTION_MASS - 4);
    expect(viewFor(after, "p1").players[0].ship!.fuel).toBe(STARTING_REACTION_MASS - 4);
  });

  it("a rebuilt ship shows a full tank again", () => {
    let state = withPower(makeTwoPlayerGame(), "p1", "engines", 3);
    state = mustExecute(state, burn(1, "soft"));
    expect(viewFor(state, "p2").players[0].ship!.fuel).toBe(STARTING_REACTION_MASS - 1);
    state = withShip(state, "p1", { hitPoints: 0 });
    // p2 acts, then p1's turn begins with the respawn.
    state = mustExecute(state, coast(1));
    state = mustExecute(state, coast(1));
    expect(viewFor(state, "p2").players[0].ship!.fuel).toBe(STARTING_REACTION_MASS);
  });

  it.each([
    ["a face-down tile", "side-3", 2],
    ["a face-up tile", "side-0", 2],
  ])("energy on %s is public even when the tile is not", (_label, subsystemId, energy) => {
    const state = withPower(knownGame(), "p2", subsystemId, energy);
    const view = viewFor(state, "p1");
    expect(slot(view, 1, subsystemId).allocatedEnergy).toBe(energy);
    expect(view.players[1].ship!.reactorAvailable).toBe(10 - energy);
    expect(slot(viewFor(state, null), 1, subsystemId).allocatedEnergy).toBe(energy);
  });

  it("the energy on a face-down tile hints at it without naming it", () => {
    const state = withPower(knownGame(), "p2", "forward-0", 4);
    expect(slot(viewFor(state, "p1"), 1, "forward-0")).toMatchObject({
      type: null,
      knownVia: null,
      allocatedEnergy: 4,
    });
  });

  it("counts only cargo actually aboard and shows completed missions face-up", () => {
    const state = withPlayer(knownGame(), "p2", {
      cargo: [
        {
          id: "a",
          missionId: "m",
          kind: "crate",
          pickupPlanetId: ALPHA,
          deliveryPlanetId: "planet-beta",
          isPickedUp: true,
        },
        {
          id: "b",
          missionId: "n",
          kind: "crate",
          pickupPlanetId: ALPHA,
          deliveryPlanetId: "planet-beta",
          isPickedUp: false,
        },
      ],
      missions: [{ ...destroyMission("p1", "t"), isCompleted: true }, surveyMission("s")],
      completedMissionCount: 1,
    });
    const opponent = viewFor(state, "p1").players[1];
    expect(opponent.cargoCount).toBe(1);
    expect(opponent.completedMissionCount).toBe(1);
    expect(opponent.completedMissions.map((m) => m.id)).toEqual(["t"]);
  });

  it("a missile rack shows what is left in it only once it is face-up", () => {
    // side-3 is the missiles tile on SENSOR; side-2 is one p1 has scanned.
    let state = makeTwoPlayerGame({}, { loadout: SENSOR });
    state = withPlayer(state, "p1", { intel: { p2: ["side-2"] } });
    const slot = (id: string) => viewFor(state, "p1").players[1].slots.find((x) => x.id === id)!;

    expect(slot("side-3").type).toBeNull();
    expect(slot("side-3").ammo).toBeNull();

    state = withSub(state, "p2", "side-3", { isRevealed: true, ammo: 2 });
    expect(slot("side-3").type).toBe("missiles");
    expect(slot("side-3").ammo).toBe(2);

    // Only a rack has ammo to show; a face-up laser reports none.
    state = withSub(state, "p2", "side-1", { isRevealed: true });
    expect(slot("side-1").type).toBe("laser");
    expect(slot("side-1").ammo).toBeNull();
  });

  it("shows no ship for an undeployed player and flags destroyed ships", () => {
    const undeployed = withPlayer(knownGame(), "p2", { hasDeployed: false });
    expect(viewFor(undeployed, "p1").players[1].ship).toBeNull();
    const wreck = withShip(knownGame(), "p2", { hitPoints: 0 });
    expect(viewFor(wreck, "p1").players[1].ship?.isDestroyed).toBe(true);
  });
});

describe("view: the viewer's own side", () => {
  it("me is the full player record and my slots are all known", () => {
    const state = knownGame();
    const view = viewFor(state, "p1");
    expect(view.me).toBe(state.players[0]);
    expect(view.players[0].isMe).toBe(true);
    expect(view.players[0].slots.every((s) => s.type !== null && s.knownVia === "own")).toBe(true);
    expect(view.players[1].isMe).toBe(false);
  });

  it("myStats reflect my loadout and power", () => {
    let state = makeTwoPlayerGame({ loadout: SENSOR }, { loadout: COMPRESSOR });
    state = withPower(state, "p1", "forward-0", 2);
    expect(viewFor(state, "p1").myStats).toEqual({
      dissipationCapacity: 7,
      maxHeat: MAX_HEAT,
      standingHeat: 0,
      maxReactionMass: 10,
      criticalChance: 30,
    });
    expect(viewFor(state, "p2").myStats).toEqual({
      dissipationCapacity: 5,
      maxHeat: MAX_HEAT,
      standingHeat: 0,
      maxReactionMass: 10,
      criticalChance: 10,
    });
  });

  it("a spectator has no me and no stats", () => {
    const view = viewFor(knownGame(), null);
    expect(view.me).toBeNull();
    expect(view.myStats).toBeNull();
    expect(view.players.every((p) => !p.isMe)).toBe(true);
  });

  it("carries the public table state through: missiles, stations and homes", () => {
    const state = withMissile(knownGame(), { ring: 3, sector: 5 });
    const view = viewFor(state, "p2");
    expect(view).toMatchObject({
      turn: FIRST_TURN + CEASEFIRE_ROUNDS,
      phase: "active",
      activePlayerIndex: 0,
      activePlayerId: "p1",
    });
    expect(view.players[0].isActive).toBe(true);
    expect(view.players[1].isActive).toBe(false);
    expect(view.missiles).toBe(state.missiles);
    expect(view.stations).toBe(state.stations);
    expect(view.players[0].home).toEqual(state.players[0].home);
  });

  it("opponentPositions lists living, deployed opponents only", () => {
    let state = makeTwoPlayerGame();
    expect(opponentPositions(viewFor(state, "p1"))).toEqual([
      { id: "p2", position: { wellId: BH, ring: 3, sector: 12 } },
    ]);
    state = withShip(state, "p2", { hitPoints: 0 });
    expect(opponentPositions(viewFor(state, "p1"))).toEqual([]);
    expect(opponentPositions(viewFor(makeTwoPlayerGame(), null))).toHaveLength(2);
  });
});

describe("view: event visibility", () => {
  const publicEvent: GameEvent = { type: "stations_moved", turn: 1, riders: [] };
  const privateEvent: GameEvent = {
    type: "data_acquired",
    turn: 1,
    playerId: "p1",
    kind: "survey",
    missionId: "m",
    privateTo: ["p1"],
  };

  it("canSeeEvent lets everyone see public events and only the named players see private ones", () => {
    expect(canSeeEvent(publicEvent, null)).toBe(true);
    expect(canSeeEvent(publicEvent, "p2")).toBe(true);
    expect(canSeeEvent(privateEvent, "p1")).toBe(true);
    expect(canSeeEvent(privateEvent, "p2")).toBe(false);
    expect(canSeeEvent(privateEvent, null)).toBe(false);
  });

  it("filterEventsFor keeps order and drops what the viewer may not see", () => {
    expect(filterEventsFor([privateEvent, publicEvent], "p2")).toEqual([publicEvent]);
    expect(filterEventsFor([privateEvent, publicEvent], "p1")).toEqual([privateEvent, publicEvent]);
  });

  it("a scan is seen by all, its result only by the scanner", () => {
    const state = withPower(
      makeTwoPlayerGame({ loadout: SENSOR }, { ring: 3, sector: 2 }),
      "p1",
      "forward-0",
      2
    );
    const result = executeTurnAs(state, scan(1, "p2", "side-0"));
    expect(eventTypes(filterEventsFor(result.events, "p1"))).toContain("scan_result");
    const forTarget = eventTypes(filterEventsFor(result.events, "p2"));
    expect(forTarget).toContain("scanned");
    expect(forTarget).not.toContain("scan_result");
    expect(eventTypes(filterEventsFor(result.events, null))).not.toContain("scan_result");
  });

  it("energy changes are announced to the whole table", () => {
    const result = executeTurnAs(
      withPower(makeTwoPlayerGame(), "p1", "scoop", 3),
      allocate("engines", 2),
      deallocate("scoop", 3)
    );
    for (const viewer of ["p1", "p2", null]) {
      expect(eventTypes(filterEventsFor(result.events, viewer))).toEqual(
        expect.arrayContaining(["energy_allocated", "energy_deallocated", "coasted"])
      );
    }
  });
});
