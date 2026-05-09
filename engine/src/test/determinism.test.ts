import { describe, it, expect } from "vitest";
import { executeTurn } from "../game/turns.ts";
import { botDecideActions } from "../ai/index.ts";
import { dealMissionOffers } from "../game/missions/missionDeck.ts";
import { selectMissionsFromOffers } from "../game/missions/missionDeck.ts";
import { createInitialShipState } from "../utils/subsystemHelpers.ts";
import { createInitialStations } from "../game/stations.ts";
import { GRAVITY_WELLS } from "../models/gravityWells.ts";
import { createDeterminismFields, Rng } from "../utils/rng.ts";
import type { GameState, Player, PlayerAction } from "../models/game.ts";

/**
 * Build a fresh bot-vs-bot game seeded with the given seed.
 * Mirrors what the server's createGame + loadout flow does, but inline so the
 * test depends only on engine internals.
 */
function buildSeededGame(seed: number): GameState {
  const planets = GRAVITY_WELLS.filter((w) => w.type === "planet");

  const players: Player[] = [
    {
      id: "bot-a",
      name: "Bot A",
      ship: createInitialShipState({
        wellId: "blackhole",
        ring: 4,
        sector: 0,
        facing: "prograde",
      }),
      missionOffers: [],
      missions: [],
      completedMissionCount: 0,
      cargo: [],
      hasDeployed: true,
      hasSubmittedLoadout: true,
    },
    {
      id: "bot-b",
      name: "Bot B",
      ship: createInitialShipState({
        wellId: "blackhole",
        ring: 4,
        sector: 12,
        facing: "prograde",
      }),
      missionOffers: [],
      missions: [],
      completedMissionCount: 0,
      cargo: [],
      hasDeployed: true,
      hasSubmittedLoadout: true,
    },
  ];

  const determinism = createDeterminismFields(seed);
  const rng = new Rng(determinism.rngState);

  const { playerOffers } = dealMissionOffers(players, planets, rng);

  // Auto-pick first 3 offers per player so missions/cargo are populated.
  const playersWithMissions = players.map((p) => {
    const offers = playerOffers.get(p.id) ?? [];
    const selected = selectMissionsFromOffers(
      offers,
      offers.slice(0, 3).map((m) => m.id)
    );
    return {
      ...p,
      missionOffers: offers,
      missions: selected.missions,
      cargo: selected.cargo,
    };
  });

  return {
    turn: 1,
    activePlayerIndex: 0,
    players: playersWithMissions,
    turnLog: [],
    missiles: [],
    phase: "active",
    stations: createInitialStations(GRAVITY_WELLS),
    rngSeed: determinism.rngSeed,
    rngState: rng.state,
    nextEntityId: determinism.nextEntityId,
  };
}

/**
 * Run N turns of bot-vs-bot, returning the final state and recorded actions.
 *
 * Strict: any invalid bot turn fails the test. We rely on the playtest sim
 * having flushed bot bugs, so a regression here is what we want to catch.
 */
function runBotGame(
  initialState: GameState,
  maxTurns: number
): { finalState: GameState; allActions: PlayerAction[][] } {
  let state = initialState;
  const allActions: PlayerAction[][] = [];

  for (let i = 0; i < maxTurns; i++) {
    if (state.phase === "ended") break;
    const activePlayer = state.players[state.activePlayerIndex];

    let actions: PlayerAction[];
    if (activePlayer.ship.hitPoints <= 0) {
      actions = [
        {
          type: "coast",
          playerId: activePlayer.id,
          sequence: 1,
          data: { activateScoop: false },
        },
      ];
    } else {
      const decision = botDecideActions(state, activePlayer.id);
      actions = decision.actions;
    }

    const result = executeTurn(state, actions);
    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Bot ${activePlayer.id} invalid turn at T${state.turn}: ${result.errors.join("; ")}\nActions: ${JSON.stringify(actions)}`
      );
    }
    allActions.push(actions);
    state = result.gameState;
  }

  return { finalState: state, allActions };
}

/**
 * Stable, structural fingerprint of GameState. Uses sorted-key JSON so object
 * key ordering can never make two equivalent states look different.
 */
function fingerprint(state: GameState): string {
  return JSON.stringify(state, Object.keys(state).sort());
}

describe("Determinism canary", () => {
  it("two runs with the same seed produce identical final state", () => {
    const seed = 0x1234abcd;

    const a = runBotGame(buildSeededGame(seed), 80);
    const b = runBotGame(buildSeededGame(seed), 80);

    expect(a.allActions).toEqual(b.allActions);
    expect(fingerprint(a.finalState)).toBe(fingerprint(b.finalState));
  });

  it("different seeds produce different runs", () => {
    // Sanity check: if seeds matter, two different seeds should diverge.
    const a = runBotGame(buildSeededGame(0x0001), 40);
    const b = runBotGame(buildSeededGame(0x0002), 40);

    // Either action sequences or final states must differ.
    const sameActions =
      JSON.stringify(a.allActions) === JSON.stringify(b.allActions);
    const sameState = fingerprint(a.finalState) === fingerprint(b.finalState);

    expect(sameActions && sameState).toBe(false);
  });

  it("RNG advances on d10 rolls; identical RNG state implies identical rolls", () => {
    const stateA = buildSeededGame(0xabcdef);
    const stateB = buildSeededGame(0xabcdef);

    expect(stateA.rngState).toBe(stateB.rngState);

    const a = runBotGame(stateA, 10);
    const b = runBotGame(stateB, 10);

    expect(a.finalState.rngState).toBe(b.finalState.rngState);
    expect(a.finalState.nextEntityId).toBe(b.finalState.nextEntityId);
  });
});
