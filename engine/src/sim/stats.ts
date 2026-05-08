/**
 * Per-game and aggregate stats extraction from sim recordings.
 *
 * Stats are computed by walking the turn log + final state. The per-game
 * shape is intentionally flat so it serializes cleanly to CSV/JSON for
 * downstream analysis.
 */

import type { GameRecording, RecordedTurn } from "../recording/types.ts";
import type { Player, TurnLogEntry } from "../models/game.ts";

export interface PerGameStats {
  recordingId: string;
  seed: number;
  turnCount: number;
  endReason: GameRecording["metadata"]["endReason"];
  winnerId?: string;
  playerCount: number;

  /** Per-player metrics keyed by playerId. */
  perPlayer: Record<string, PerPlayerStats>;

  /** Total damage dealt across all players. */
  totalDamageDealt: number;
  /** Number of times any ship was destroyed. */
  shipDestructions: number;
  /** Number of heat-overflow damage events (turn-start excess heat → hull). */
  heatOverflowEvents: number;
  /** Number of mission completions across all players. */
  missionCompletions: number;
}

export interface PerPlayerStats {
  playerId: string;
  playerName: string;
  completedMissions: number;
  finalHitPoints: number;
  /** Times this player was destroyed and respawned. */
  respawns: number;
  /** Damage dealt by this player. */
  damageDealt: number;
  /** Number of times this player fired each weapon type. */
  weaponShots: Record<string, number>;
  /** Critical hits landed by this player. */
  criticalHits: number;
  /** Misses by this player. */
  misses: number;
  /** Heat overflow damage taken. */
  heatDamageTaken: number;
}

/**
 * Compute per-game stats from a recording.
 */
export function computePerGameStats(recording: GameRecording): PerGameStats {
  const finalState = recording.finalState ?? recording.initialState;
  const perPlayer: Record<string, PerPlayerStats> = {};

  for (const p of finalState.players) {
    perPlayer[p.id] = initPerPlayer(p);
  }

  let totalDamageDealt = 0;
  let shipDestructions = 0;
  let heatOverflowEvents = 0;

  for (const turn of recording.turns) {
    creditActions(turn, perPlayer);
    const turnTotals = creditLogEntries(turn.logEntries, perPlayer);
    totalDamageDealt += turnTotals.damage;
    shipDestructions += turnTotals.destructions;
    heatOverflowEvents += turnTotals.heatOverflow;
  }

  const missionCompletions = finalState.players.reduce(
    (sum, p) => sum + p.completedMissionCount,
    0
  );

  return {
    recordingId: recording.recordingId,
    seed: recording.seed,
    turnCount: recording.turns.length,
    endReason: recording.metadata.endReason,
    winnerId: recording.metadata.winnerId,
    playerCount: finalState.players.length,
    perPlayer,
    totalDamageDealt,
    shipDestructions,
    heatOverflowEvents,
    missionCompletions,
  };
}

function initPerPlayer(p: Player): PerPlayerStats {
  return {
    playerId: p.id,
    playerName: p.name,
    completedMissions: p.completedMissionCount,
    finalHitPoints: p.ship.hitPoints,
    respawns: 0,
    damageDealt: 0,
    weaponShots: {},
    criticalHits: 0,
    misses: 0,
    heatDamageTaken: 0,
  };
}

/**
 * Credit weapon shots based on declared actions (not log entries — log entries
 * count hits, this counts attempts).
 */
function creditActions(
  turn: RecordedTurn,
  perPlayer: Record<string, PerPlayerStats>
): void {
  const stats = perPlayer[turn.playerId];
  if (!stats) return;

  for (const action of turn.actions) {
    if (action.type === "fire_weapon") {
      const w = action.data.weaponType;
      stats.weaponShots[w] = (stats.weaponShots[w] ?? 0) + 1;
    }
  }
}

/**
 * Walk a turn's log entries and credit damage / criticals / misses / events.
 * The log is parsed loosely from the action+result strings; the engine doesn't
 * (yet) emit structured combat events, so we extract what we can with regex.
 */
function creditLogEntries(
  logEntries: TurnLogEntry[],
  perPlayer: Record<string, PerPlayerStats>
): { damage: number; destructions: number; heatOverflow: number } {
  let damage = 0;
  let destructions = 0;
  let heatOverflow = 0;

  for (const entry of logEntries) {
    const stats = perPlayer[entry.playerId];

    if (entry.action === "Respawn" && stats) {
      stats.respawns += 1;
    }

    if (entry.action === "Heat Damage" && stats) {
      const m = /Took (\d+) hull damage/.exec(entry.result);
      if (m) stats.heatDamageTaken += Number(m[1]);
      heatOverflow += 1;
    }

    if (
      stats &&
      (entry.action.endsWith("Miss") || entry.action.includes("Missile Miss"))
    ) {
      stats.misses += 1;
    }

    if (stats && entry.action.includes("Critical")) {
      stats.criticalHits += 1;
    }

    // "dealt N damage" appears in fire-weapon and missile hit logs
    const dmgMatch = /dealt (\d+) damage/.exec(entry.result);
    if (dmgMatch && stats) {
      const dealt = Number(dmgMatch[1]);
      stats.damageDealt += dealt;
      damage += dealt;
    }

    // Track destroy mission completions as a proxy for destructions
    if (entry.action === "Mission Complete" && entry.result.includes("destroyed")) {
      destructions += 1;
    }
  }

  return { damage, destructions, heatOverflow };
}

/**
 * Aggregate stats across many games. Computes simple distributions to support
 * balance work (e.g., "median turns to win", "win rate per loadout").
 */
export interface AggregateStats {
  gameCount: number;
  endReasons: Record<GameRecording["metadata"]["endReason"], number>;
  /** Distribution of turn counts. */
  turnCount: Distribution;
  /** Distribution of total damage dealt. */
  totalDamageDealt: Distribution;
  /** Distribution of mission completions. */
  missionCompletions: Distribution;
  /** Win count per playerId. */
  winsByPlayer: Record<string, number>;
}

export interface Distribution {
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  count: number;
}

export function aggregateStats(games: PerGameStats[]): AggregateStats {
  const endReasons: Record<string, number> = {};
  const winsByPlayer: Record<string, number> = {};
  const turnCounts: number[] = [];
  const damages: number[] = [];
  const completions: number[] = [];

  for (const g of games) {
    endReasons[g.endReason] = (endReasons[g.endReason] ?? 0) + 1;
    if (g.winnerId) {
      winsByPlayer[g.winnerId] = (winsByPlayer[g.winnerId] ?? 0) + 1;
    }
    turnCounts.push(g.turnCount);
    damages.push(g.totalDamageDealt);
    completions.push(g.missionCompletions);
  }

  return {
    gameCount: games.length,
    endReasons: endReasons as AggregateStats["endReasons"],
    turnCount: distribution(turnCounts),
    totalDamageDealt: distribution(damages),
    missionCompletions: distribution(completions),
    winsByPlayer,
  };
}

function distribution(values: number[]): Distribution {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    count: sorted.length,
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}
