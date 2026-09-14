/**
 * Determinism: the same seed and the same actions always produce the same
 * game. Fingerprints use canonicalJson (keys sorted at every depth); the old
 * `JSON.stringify(state, Object.keys(state).sort())` dropped every nested key.
 */
import { describe, it, expect } from "vitest";
import { executeTurn } from "../game/turns.ts";
import { createGame } from "../game/setup.ts";
import type { GameState } from "../models/game.ts";
import {
  canonicalJson,
  coast,
  eventsOf,
  executeTurnAs,
  fire,
  getShip,
  makeTwoPlayerGame,
  playScripted,
  scriptedGameStart,
  withPower,
} from "./testUtils.ts";

const TURNS = 30;

describe("determinism: scripted games", () => {
  it("the same seed replays to identical states and events at every turn", () => {
    const a = playScripted(scriptedGameStart(0x1234abcd), TURNS);
    const b = playScripted(scriptedGameStart(0x1234abcd), TURNS);
    expect(a).toHaveLength(TURNS);
    for (let i = 0; i < TURNS; i++) {
      expect(canonicalJson(a[i].state)).toBe(canonicalJson(b[i].state));
      expect(a[i].events).toEqual(b[i].events);
      expect(a[i].actions).toEqual(b[i].actions);
    }
  });

  it("the dice are actually rolled: a scripted game sees several different d10 results", () => {
    const turns = playScripted(scriptedGameStart(0x1234abcd), TURNS);
    const rolls = turns.flatMap((t) => eventsOf(t.events, "attack_resolved").map((e) => e.roll));
    expect(rolls.length).toBeGreaterThanOrEqual(4);
    expect(new Set(rolls).size).toBeGreaterThan(1);
    expect(rolls.every((r) => r >= 1 && r <= 10)).toBe(true);
  });

  it("different seeds roll different dice", () => {
    const rolls = (seed: number) =>
      playScripted(scriptedGameStart(seed), TURNS).flatMap((t) =>
        eventsOf(t.events, "attack_resolved").map((e) => e.roll)
      );
    expect(rolls(0x0001)).not.toEqual(rolls(0x0002));
  });

  it("someone dies and respawns along the way, and the rest still replays", () => {
    const turns = playScripted(scriptedGameStart(0x1234abcd), TURNS);
    const types = turns.flatMap((t) => t.events.map((e) => e.type));
    expect(types).toContain("ship_destroyed");
    expect(types).toContain("respawned");
  });
});

describe("determinism: the RNG on the state", () => {
  const duel = withPower(
    makeTwoPlayerGame(
      { ring: 3, sector: 0 },
      { ring: 4, sector: 0 },
      { forcedRollValue: undefined }
    ),
    "p1",
    "side-0",
    2
  );

  it("a shot advances rngState; a coast does not", () => {
    const shot = executeTurnAs(duel, fire(1, "side-0", "p2"));
    expect(shot.errors).toBeUndefined();
    expect(shot.gameState.rngState).not.toBe(duel.rngState);
    const drift = executeTurnAs(duel, coast(1));
    expect(drift.gameState.rngState).toBe(duel.rngState);
  });

  it("identical rng state implies identical rolls", () => {
    const a = executeTurnAs(duel, fire(1, "side-0", "p2"));
    const b = executeTurnAs(duel, fire(1, "side-0", "p2"));
    expect(eventsOf(a.events, "attack_resolved")[0].roll).toBe(
      eventsOf(b.events, "attack_resolved")[0].roll
    );
    expect(a.gameState.rngState).toBe(b.gameState.rngState);
  });

  it("forcedRollValue pins the die without touching the RNG", () => {
    const pinned = { ...duel, forcedRollValue: 7 };
    const result = executeTurnAs(pinned, fire(1, "side-0", "p2"));
    expect(eventsOf(result.events, "attack_resolved")[0].roll).toBe(7);
    expect(result.gameState.rngState).toBe(pinned.rngState);
  });

  it("createGame with the same seed deals the same cards and leaves the same rng state", () => {
    const specs = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ];
    expect(canonicalJson(createGame(specs, 77))).toBe(canonicalJson(createGame(specs, 77)));
    expect(createGame(specs, 77).rngState).not.toBe(createGame(specs, 78).rngState);
  });
});

describe("determinism: executeTurn is pure", () => {
  it("does not mutate its input on success", () => {
    const state = scriptedGameStart(1);
    const before = canonicalJson(state);
    const result = executeTurnAs(state, fire(1, "forward-0", "p2", "side-2", true));
    expect(result.errors).toBeUndefined();
    expect(canonicalJson(state)).toBe(before);
    expect(getShip(state, "p2").hitPoints).toBe(10);
    expect(getShip(result.gameState, "p2").hitPoints).toBeLessThan(10);
  });

  it("returns the very same object, rng included, when the turn is rejected", () => {
    const state = scriptedGameStart(1);
    const rngBefore = state.rngState;
    const result = executeTurnAs(
      state,
      fire(1, "forward-0", "p2", "side-2", true),
      fire(2, "forward-0", "p2")
    );
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.gameState).toBe(state);
    expect(result.events).toEqual([]);
    // The first shot rolled a die before the second was rejected; the roll must not stick.
    expect(state.rngState).toBe(rngBefore);
    expect(getShip(state, "p2").hitPoints).toBe(10);
  });

  it("refuses to run outside the active phase", () => {
    const state: GameState = { ...makeTwoPlayerGame(), phase: "ended" };
    const result = executeTurn(state, [{ ...coast(1), playerId: "p1" }]);
    expect(result.gameState).toBe(state);
    expect(result.errors?.[0]).toMatch(/phase/i);
  });
});

describe("determinism: canonicalJson", () => {
  it("ignores key order at every depth", () => {
    expect(canonicalJson({ b: { y: 1, x: [{ q: 1, p: 2 }] }, a: 1 })).toBe(
      canonicalJson({ a: 1, b: { x: [{ p: 2, q: 1 }], y: 1 } })
    );
  });

  it("notices a change buried deep in the state", () => {
    const state = makeTwoPlayerGame();
    const changed = {
      ...state,
      players: [
        { ...state.players[0], ship: { ...state.players[0].ship, hitPoints: 9 } },
        state.players[1],
      ],
    };
    expect(canonicalJson(changed)).not.toBe(canonicalJson(state));
    // The old fingerprint could not tell them apart.
    expect(JSON.stringify(changed, Object.keys(changed).sort())).toBe(
      JSON.stringify(state, Object.keys(state).sort())
    );
  });
});
