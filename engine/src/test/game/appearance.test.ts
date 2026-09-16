import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHIP_APPEARANCE,
  ShipAppearanceSchema,
  resolveShipAppearance,
  type ShipAppearance,
} from "../../models/appearance.ts";
import { createGame, submitLoadout } from "../../game/setup.ts";
import { viewFor } from "../../game/view.ts";
import { respawnPlayer } from "../../game/respawn.ts";
import { botChooseLoadout } from "../../ai/index.ts";
import { reconstructStateAtTurn, replayRecording } from "../../recording/replay.ts";
import { RECORDING_SCHEMA_VERSION, type GameRecording } from "../../recording/types.ts";
import {
  playScripted,
  scriptedGameStart,
  makeTwoPlayerGame,
  withPlayer,
  withShip,
} from "../testUtils.ts";

const appearance: ShipAppearance = {
  ...DEFAULT_SHIP_APPEARANCE,
  paint: "#344149",
  secondaryPaint: "#b6a27b",
  spineHeight: 0.9,
};
const fresh = () =>
  createGame(
    [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" },
    ],
    123
  );
const choice = (state: ReturnType<typeof fresh>) =>
  botChooseLoadout(state.players[0].missionOffers, { playerCount: 2 });

describe("match appearance", () => {
  it("validates bounds and refuses identity colors, arbitrary assets and retired dials", () => {
    expect(ShipAppearanceSchema.safeParse(appearance).success).toBe(true);
    for (const bad of [
      { ...appearance, armorRelief: 3 },
      { ...appearance, spineHeight: NaN },
      { ...appearance, paint: "url(x)" },
      { ...appearance, accent: "#ffffff" },
      { ...appearance, asset: "https://example.test/ship.glb" },
      { ...appearance, livery: "bands", wear: 0.4 },
      { paint: appearance.paint },
    ])
      expect(ShipAppearanceSchema.safeParse(bad).success).toBe(false);
  });
  it("stores cosmetics atomically with a valid loadout, without changing gameplay state", () => {
    const state = fresh();
    const submission = choice(state);
    const plain = submitLoadout(state, "p1", submission);
    const painted = submitLoadout(state, "p1", { ...submission, appearance });
    expect(painted.error).toBeUndefined();
    expect(painted.state.players[0].appearance).toEqual(appearance);
    const withoutCosmetics = {
      ...painted.state,
      players: painted.state.players.map(({ appearance: _appearance, ...player }) => player),
    };
    expect(withoutCosmetics).toEqual(plain.state);
    expect(state.players[0].appearance).toBeUndefined();
  });
  it("rejects malformed appearance without committing missions or loadout", () => {
    const state = fresh();
    const result = submitLoadout(state, "p1", {
      ...choice(state),
      appearance: { ...appearance, armorRelief: -1 },
    });
    expect(result.error).toMatch(/appearance/i);
    expect(result.state).toBe(state);
  });
  it("makes submitted appearance public while preserving slot privacy", () => {
    const state = submitLoadout(fresh(), "p1", { ...choice(fresh()), appearance }).state;
    for (const viewer of ["p2", null]) {
      const player = viewFor(state, viewer).players[0];
      expect(player.appearance).toEqual(appearance);
      expect(player.slots.every((slot) => slot.type === null)).toBe(true);
    }
    const draft = withPlayer(state, "p1", { hasSubmittedLoadout: false });
    expect(viewFor(draft, "p2").players[0].appearance).toEqual(DEFAULT_SHIP_APPEARANCE);
  });
  it("preserves cosmetics through respawn and gives an unpainted player the reference ship", () => {
    let state = withPlayer(makeTwoPlayerGame(), "p2", {
      appearance,
      home: { wellId: "blackhole", ring: 4, sector: 4 },
    });
    state = withShip(state, "p2", { hitPoints: 0 });
    expect(respawnPlayer(state, 1).state.players[1].appearance).toEqual(appearance);
    const unpainted = fresh();
    expect(viewFor(unpainted, null).players[0].appearance).toEqual(DEFAULT_SHIP_APPEARANCE);
    expect(unpainted.players[0].appearance).toBeUndefined();
    expect(resolveShipAppearance(undefined)).toEqual(DEFAULT_SHIP_APPEARANCE);
  });
  it("retains the exact cosmetic snapshot in recorded and re-executed turns", () => {
    const initialState = withPlayer(scriptedGameStart(42), "p1", { appearance });
    const played = playScripted(initialState, 8);
    const record: GameRecording = {
      schemaVersion: RECORDING_SCHEMA_VERSION,
      recordingId: "appearance",
      createdAt: "",
      seed: 42,
      initialState,
      turns: played.map((t, i) => ({
        turnNumber: i,
        playerId: t.playerId,
        actions: t.actions,
        resultingStateSnapshot: t.state,
        events: t.events,
      })),
      metadata: {
        source: "sim",
        playerKinds: [],
        turnCount: played.length,
        endReason: "max_turns",
      },
    };
    const restored = JSON.parse(JSON.stringify(record)) as GameRecording;
    expect(reconstructStateAtTurn(restored, 4).players[0].appearance).toEqual(appearance);
    expect(replayRecording(restored)).toEqual(played.at(-1)!.state);
  });
});
