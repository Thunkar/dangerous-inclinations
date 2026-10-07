import { describe, it, expect } from "vitest";
import { opponentPositions, viewFor } from "../../game/view.ts";
import { canSeeEvent, filterEventsFor } from "../../models/events.ts";
import type { GameEvent } from "../../models/events.ts";
import { dealMissionOffers } from "../../game/missions/missionDeck.ts";
import { Rng } from "../../utils/rng.ts";
import { isPrimaryType, type Mission } from "../../models/missions.ts";
import {
  LOADOUTS,
  destroyMission,
  interceptMission,
  takenData,
  ALPHA,
  BETA,
  GAMMA,
  crateCargo,
  lootCargo,
  BH,
  makeTwoPlayerGame,
  surveyMission,
  withMissile,
  withPlayer,
  withPower,
  withShip,
  withSub,
} from "../testUtils.ts";

/**
 * p2 has fired its side-0 laser (face-up) and lost side-1 (broken, face-up);
 * p1 has scanned p2's side-2, and side-0 after it was already face-up.
 */
function knownGame() {
  let state = makeTwoPlayerGame();
  state = withSub(state, "p2", "side-0", { isRevealed: true });
  state = withSub(state, "p2", "side-1", { isBroken: true, isRevealed: true });
  state = withPlayer(state, "p1", { intel: { p2: ["side-2", "side-0"] } });
  return state;
}

const slot = (view: ReturnType<typeof viewFor>, playerIndex: number, id: string) =>
  view.players[playerIndex].slots.find((s) => s.id === id)!;

describe("view: what an opponent's loadout shows", () => {
  // What a rival or a spectator reads off p2's slots.
  it.each<[string, string | null, string, object]>([
    [
      "a face-down tile is unknown: no type, no condition",
      "p1",
      "forward-0",
      { type: null, isBroken: null, knownVia: null, allocatedEnergy: 0, ammo: null },
    ],
    [
      "a face-up tile shows its type and condition, and counts as revealed though also scanned",
      "p1",
      "side-0",
      { type: "laser", isBroken: false, knownVia: "revealed" },
    ],
    [
      "a broken face-up tile shows it is broken",
      "p1",
      "side-1",
      { type: "laser", isBroken: true, knownVia: "revealed" },
    ],
    [
      "a scanned tile is known to its scanner",
      "p1",
      "side-2",
      { type: "shields", knownVia: "scanned" },
    ],
    ["a scanned tile is not known to anyone else", null, "side-2", { type: null, knownVia: null }],
  ])("%s (viewer %s, %s)", (_label, viewer, id, expected) => {
    expect(slot(viewFor(knownGame(), viewer), 1, id)).toMatchObject(expected);
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

  it("exposes position, facing, hull, heat and fuel, but not cards or intel", () => {
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
      fuel: 10,
      isDestroyed: false,
    });
    for (const secret of ["missions", "missionOffers", "cargo", "intel", "subsystems"]) {
      expect(opponent).not.toHaveProperty(secret);
    }
    // Ammo is readable on a face-up rack and on nothing else, so a slot the
    // viewer cannot identify must not carry a number either.
    for (const s of opponent.slots) {
      if (s.type === null) expect(s.ammo).toBeNull();
    }
  });

  it.each([
    ["a face-down tile, which it hints at without naming", "forward-0", 4, null],
    ["a face-up tile", "side-0", 2, "laser"],
  ])("energy on %s is public, to a rival and a spectator", (_label, subsystemId, energy, type) => {
    const state = withPower(knownGame(), "p2", subsystemId, energy);
    for (const viewer of ["p1", null]) {
      expect(slot(viewFor(state, viewer), 1, subsystemId)).toMatchObject({
        type,
        allocatedEnergy: energy,
      });
    }
  });

  it("counts only cargo actually aboard and shows completed missions face-up", () => {
    const state = withPlayer(knownGame(), "p2", {
      cargo: [crateCargo(ALPHA, BETA), crateCargo(BETA, GAMMA, false)],
      missions: [{ ...destroyMission("p1", "t"), isCompleted: true }, surveyMission("s")],
      points: 1,
    });
    const opponent = viewFor(state, "p1").players[1];
    expect(opponent.cargoCount).toBe(1);
    expect(opponent.points).toBe(1);
    expect(opponent.completedMissions.map((m) => m.id)).toEqual(["t"]);
  });

  it("a missile rack shows what is left in it only once it is face-up", () => {
    // side-3 is the missiles tile on LOADOUTS.sensorRadiator; side-2 is one p1 has scanned.
    let state = makeTwoPlayerGame({}, { loadout: LOADOUTS.sensorRadiator });
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

  it("myStats reflect my loadout and the sensor I have up", () => {
    let state = makeTwoPlayerGame(
      { loadout: LOADOUTS.sensorRadiator },
      { loadout: LOADOUTS.compressor }
    );
    state = withPower(state, "p1", "forward-0", 2);
    // A sensor with energy on it widens every critical while it holds it.
    // Nothing on the loadout is billed at my next check, which is why there is
    // no heat figure here: it is cleared when my turn starts.
    expect(viewFor(state, "p1").myStats).toEqual({
      dissipationCapacity: 7,
      maxHeat: 10,
      maxReactionMass: 10,
      lowestCriticalFace: 8,
    });
    expect(viewFor(state, "p2").myStats).toEqual({
      dissipationCapacity: 5,
      maxHeat: 10,
      maxReactionMass: 10,
      lowestCriticalFace: 10,
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
      turn: state.turn,
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
  const publicEvent: GameEvent = { type: "stations_moved", turn: 1, riders: [], wrecks: [] };
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
});

describe("view: a rival's hold", () => {
  /** Every item token dealt to an Intercept or a Survey, over many deals. */
  function dataTokens(seeds: number) {
    const tokens: Array<{ type: string; missionId: string; token: string }> = [];
    for (let seed = 1; seed <= seeds; seed++) {
      for (const hand of dealMissionOffers(ids(3), new Rng(seed)).values())
        for (const m of hand)
          if (m.type === "intercept_transmission" || m.type === "survey")
            tokens.push({ type: m.type, missionId: m.id, token: m.dataCargoId });
    }
    return tokens;
  }
  const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
  const number = (token: string) => Number(token.slice("item-".length));

  it("item tokens are opaque: a number, never the card's id or kind", () => {
    const tokens = dataTokens(20);
    expect(tokens.length).toBeGreaterThan(0);
    for (const { missionId, token } of tokens) {
      expect(token).toMatch(/^item-\d+$/);
      expect(token).not.toContain(missionId);
    }
  });

  it("item tokens do not follow the deal: a primary does not always hold the lower number", () => {
    // Each hand is dealt its primaries first, so tokens handed out in deal
    // order would put every Intercept's below every Survey's in the same hand.
    const token = (m: Mission) =>
      "dataCargoId" in m ? m.dataCargoId : "cargoId" in m ? m.cargoId : null;
    let secondaryBelowPrimary = 0;
    for (let seed = 1; seed <= 20; seed++)
      for (const hand of dealMissionOffers(ids(3), new Rng(seed)).values())
        for (const p of hand.filter((m) => isPrimaryType(m.type) && token(m)))
          for (const s of hand.filter((m) => !isPrimaryType(m.type) && token(m)))
            if (number(token(s)!) < number(token(p)!)) secondaryBelowPrimary++;
    expect(secondaryBelowPrimary).toBeGreaterThan(0);
  });

  it("shows each item aboard by kind and token, and never the card behind it", () => {
    const survey = surveyMission("survey-secret");
    const intercept = interceptMission("p1", "intercept-secret", BETA);
    let state = makeTwoPlayerGame();
    state = withPlayer(state, "p2", {
      missions: [survey, intercept],
      cargo: [
        { ...takenData(survey), id: "item-7" },
        { ...takenData(intercept), id: "item-3" },
        { ...crateCargo(ALPHA, BETA), id: "item-5" },
        // Waiting at its dock: not aboard.
        { ...crateCargo(BETA, GAMMA, false), id: "item-6" },
        lootCargo("item-9", "piracy-secret"),
      ],
    });
    const rival = viewFor(state, "p1").players.find((p) => p.id === "p2")!;
    expect(rival.hold).toEqual([
      { cargoId: "item-7", kind: "data" },
      { cargoId: "item-3", kind: "data" },
      { cargoId: "item-5", kind: "crate" },
      { cargoId: "item-9", kind: "loot" },
    ]);
    const text = JSON.stringify(rival);
    expect(text).not.toContain("survey-secret");
    expect(text).not.toContain("intercept-secret");
    expect(text).not.toContain("piracy-secret");
  });
});
