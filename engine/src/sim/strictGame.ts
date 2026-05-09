/**
 * Single-game strict-mode runner. Pure-function entry: takes a seed +
 * config, returns an outcome describing whether the game completed or hit
 * an invalid turn. Used both by the sequential batch driver and by the
 * worker-thread parallel driver.
 *
 * Strict mode does NOT fall back to coast on validation failure; it stops
 * the game and captures the offending state + actions + errors so a bot
 * bug can be diagnosed instead of papered over.
 */

import type { GameState, PlayerAction } from "../models/game.ts";
import { executeTurn } from "../game/turns.ts";
import { botDecideActions } from "../ai/index.ts";
import { selectBotLoadout } from "../ai/behaviors/loadout.ts";
import {
  dealMissionOffers,
  selectMissionsFromOffers,
} from "../game/missions/missionDeck.ts";
import { createInitialShipState } from "../utils/subsystemHelpers.ts";
import {
  createSubsystemsFromLoadout,
  calculateShipStatsFromLoadout,
} from "../game/loadout.ts";
import { createInitialStations } from "../game/stations.ts";
import { GRAVITY_WELLS } from "../models/gravityWells.ts";
import {
  createDeterminismFields,
  Rng,
  pickIndex,
} from "../utils/rng.ts";
import {
  getAvailableDeploymentSectors,
  deployShip,
  transitionToActivePhase,
} from "../game/deployment.ts";

export interface StrictGameOutcome {
  seed: number;
  /** "completed" = ran to game end or maxTurns; "invalid" = bot produced an invalid turn. */
  status: "completed" | "invalid";
  turnsPlayed: number;
  winnerId?: string;
  /**
   * Total mission completions across all players at game end. Lets the
   * batch runner distinguish "bots played but no one won" from "bots made
   * zero progress".
   */
  totalMissionCompletions?: number;
  /** Max mission completions held by any single player. */
  maxPlayerCompletions?: number;
  /** Per-mission-type completion counts across all players. */
  completionsByType?: {
    destroy_ship: number;
    deliver_cargo: number;
    intercept_transmission: number;
  };
  /** Only set when status === "invalid". */
  failure?: StrictFailure;
}

export interface StrictFailure {
  turnNumber: number;
  playerId: string;
  actions: PlayerAction[];
  errors: string[];
  /** The state PASSED to executeTurn (i.e., before the failing actions). */
  stateBefore: GameState;
}

export interface StrictGameConfig {
  seed: number;
  botCount: number;
  maxTurns: number;
}

/**
 * Run one game in strict mode. Returns either "completed" or "invalid" with
 * a {@link StrictFailure} payload that pinpoints the bad turn.
 */
export function runStrictGame(config: StrictGameConfig): StrictGameOutcome {
  let state = setupGame(config.seed, config.botCount);

  for (let i = 0; i < config.maxTurns; i++) {
    if (state.phase === "ended") {
      return {
        seed: config.seed,
        status: "completed",
        turnsPlayed: i,
        winnerId: state.winnerId,
        ...summarizeMissions(state),
      };
    }

    const turnNumber = state.turn;
    const activePlayer = state.players[state.activePlayerIndex];

    // Dead bots coast (engine respawns them). Not a bot bug, just engine
    // bookkeeping, so it's allowed unconditionally.
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

    const stateBefore = state;
    const result = executeTurn(state, actions);

    if (result.errors && result.errors.length > 0) {
      return {
        seed: config.seed,
        status: "invalid",
        turnsPlayed: i,
        failure: {
          turnNumber,
          playerId: activePlayer.id,
          actions,
          errors: result.errors,
          stateBefore,
        },
      };
    }

    state = result.gameState;
  }

  return {
    seed: config.seed,
    status: "completed",
    turnsPlayed: config.maxTurns,
    winnerId: state.winnerId,
    ...summarizeMissions(state),
  };
}

function summarizeMissions(state: GameState): {
  totalMissionCompletions: number;
  maxPlayerCompletions: number;
  completionsByType: {
    destroy_ship: number;
    deliver_cargo: number;
    intercept_transmission: number;
  };
} {
  let total = 0;
  let max = 0;
  const byType = {
    destroy_ship: 0,
    deliver_cargo: 0,
    intercept_transmission: 0,
  };
  for (const p of state.players) {
    total += p.completedMissionCount;
    if (p.completedMissionCount > max) max = p.completedMissionCount;
    for (const m of p.missions) {
      if (m.isCompleted) byType[m.type] += 1;
    }
  }
  return {
    totalMissionCompletions: total,
    maxPlayerCompletions: max,
    completionsByType: byType,
  };
}

/**
 * Same setup as the regular sim: deal missions, auto-pick, apply loadouts,
 * deploy bots to BH Ring 4, transition to active.
 */
function setupGame(seed: number, botCount: number): GameState {
  if (botCount < 2 || botCount > 6) {
    throw new Error(`botCount must be 2..6 (got ${botCount})`);
  }

  const planets = GRAVITY_WELLS.filter((w) => w.type === "planet");
  const players = Array.from({ length: botCount }, (_, i) => ({
    id: `bot-${i + 1}`,
    name: `Bot ${i + 1}`,
    ship: createInitialShipState({
      wellId: "blackhole",
      ring: 4,
      sector: 0,
      facing: "prograde" as const,
    }),
    missionOffers: [],
    missions: [],
    completedMissionCount: 0,
    cargo: [],
    hasDeployed: false,
    hasSubmittedLoadout: false,
  }));

  const determinism = createDeterminismFields(seed);
  const rng = new Rng(determinism.rngState);
  const { playerOffers } = dealMissionOffers(players, planets, rng);

  const playersAfterLoadout = players.map((p) => {
    const offers = playerOffers.get(p.id) ?? [];
    const selection = selectMissionsFromOffers(
      offers,
      offers.slice(0, 3).map((m) => m.id)
    );
    const loadout = selectBotLoadout(selection.missions);
    const stats = calculateShipStatsFromLoadout(loadout);
    return {
      ...p,
      missionOffers: offers,
      missions: selection.missions,
      cargo: selection.cargo,
      hasSubmittedLoadout: true,
      ship: {
        ...p.ship,
        loadout,
        subsystems: createSubsystemsFromLoadout(loadout),
        dissipationCapacity: stats.dissipationCapacity,
        reactionMass: stats.reactionMass,
        criticalChance: stats.criticalChance,
      },
    };
  });

  let state: GameState = {
    turn: 0,
    activePlayerIndex: 0,
    players: playersAfterLoadout,
    turnLog: [],
    missiles: [],
    phase: "deployment",
    stations: createInitialStations(GRAVITY_WELLS),
    rngSeed: determinism.rngSeed,
    rngState: rng.state,
    nextEntityId: determinism.nextEntityId,
  };

  for (const bot of state.players) {
    const available = getAvailableDeploymentSectors(state);
    if (available.length === 0) break;
    const sector = available[pickIndex(state, available)];
    const result = deployShip(state, bot.id, sector);
    if (!result.success) {
      throw new Error(`Bot ${bot.id} deployment failed: ${result.error}`);
    }
    state = result.gameState;
  }

  return transitionToActivePhase(state);
}

/**
 * Format a StrictFailure as a multi-line diagnostic string suitable for
 * stdout / log output.
 */
export function formatFailure(outcome: StrictGameOutcome): string {
  if (outcome.status !== "invalid" || !outcome.failure) {
    return `Game seed=${outcome.seed.toString(16)} completed cleanly`;
  }
  const f = outcome.failure;
  const player = f.stateBefore.players.find((p) => p.id === f.playerId);
  const ship = player?.ship;
  const lines: string[] = [];
  lines.push(`=== INVALID TURN ===`);
  lines.push(`Seed: 0x${outcome.seed.toString(16)}`);
  lines.push(`Turn: ${f.turnNumber}  Player: ${f.playerId} (${player?.name ?? "?"})`);
  lines.push(`Phase: ${f.stateBefore.phase}`);
  if (ship) {
    lines.push(
      `Ship: well=${ship.wellId} R${ship.ring}S${ship.sector} facing=${ship.facing} hp=${ship.hitPoints}/${ship.maxHitPoints} mass=${ship.reactionMass} reactor=${ship.reactor.availableEnergy}/${ship.reactor.totalCapacity} heat=${ship.heat.currentHeat}`
    );
    const subs = ship.subsystems
      .map(
        (s, i) =>
          `[${i}] ${s.type} e=${s.allocatedEnergy} pwd=${s.isPowered} brk=${s.isBroken ?? false} used=${s.usedThisTurn ?? false}${s.ammo !== undefined ? ` ammo=${s.ammo}` : ""}`
      )
      .join("\n  ");
    lines.push(`Subsystems:\n  ${subs}`);
  }
  lines.push(`Errors:`);
  for (const e of f.errors) lines.push(`  - ${e}`);
  lines.push(`Actions submitted (${f.actions.length}):`);
  for (const a of f.actions) {
    lines.push(`  ${JSON.stringify(a)}`);
  }
  return lines.join("\n");
}
