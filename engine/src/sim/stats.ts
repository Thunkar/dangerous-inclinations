/**
 * Stats from game events. Nothing here parses text: every number comes from
 * a typed event or from the final state.
 */
import type { GameEvent } from "../models/events.ts";
import type { MissionType } from "../models/missions.ts";
import type { GameRunResult } from "./runGame.ts";

export interface PerPlayerStats {
  playerId: string;
  completedMissions: number;
  completedByType: Partial<Record<MissionType, number>>;
  finalHull: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  deaths: number;
  heatDamageTaken: number;
  shotsFired: Record<string, number>;
  hits: number;
  misses: number;
  criticals: number;
  missilesLaunched: number;
  missilesIntercepted: number;
  scans: number;
  docks: number;
  jumps: number;
  burns: number;
  firstDockTurn: number | null;
  firstJumpTurn: number | null;
  /** Loadout tiles still face-down when the game ended. */
  hiddenTilesAtEnd: number;
  loadout: string;
}

export interface PerGameStats {
  seed: number;
  playerCount: number;
  playerTurns: number;
  rounds: number;
  endReason: GameRunResult["endReason"];
  winnerId?: string;
  winnerMissionTypes: MissionType[];
  totalDamage: number;
  destructions: number;
  missionCompletions: number;
  completionsByType: Partial<Record<MissionType, number>>;
  perPlayer: Record<string, PerPlayerStats>;
}

export function computePerGameStats(run: GameRunResult): PerGameStats {
  const final = run.finalState;
  const perPlayer: Record<string, PerPlayerStats> = {};
  for (const p of final.players) {
    perPlayer[p.id] = {
      playerId: p.id,
      completedMissions: p.completedMissionCount,
      completedByType: {},
      finalHull: p.ship.hitPoints,
      damageDealt: 0,
      damageTaken: 0,
      kills: 0,
      deaths: 0,
      heatDamageTaken: 0,
      shotsFired: {},
      hits: 0,
      misses: 0,
      criticals: 0,
      missilesLaunched: 0,
      missilesIntercepted: 0,
      scans: 0,
      docks: 0,
      jumps: 0,
      burns: 0,
      firstDockTurn: null,
      firstJumpTurn: null,
      hiddenTilesAtEnd: p.ship.subsystems.filter((s) => s.slotGroup !== undefined && !s.isRevealed)
        .length,
      loadout: [...p.ship.loadout.forwardSlots, ...p.ship.loadout.sideSlots].join(","),
    };
    for (const m of p.missions) {
      if (m.isCompleted)
        perPlayer[p.id].completedByType[m.type] =
          (perPlayer[p.id].completedByType[m.type] ?? 0) + 1;
    }
  }

  let totalDamage = 0;
  let destructions = 0;
  const completionsByType: Partial<Record<MissionType, number>> = {};

  for (const turn of run.turns) {
    for (const e of turn.events)
      creditEvent(
        e,
        perPlayer,
        (d) => (totalDamage += d),
        () => destructions++,
        completionsByType
      );
  }

  const winner = run.finalState.winnerId
    ? final.players.find((p) => p.id === run.finalState.winnerId)
    : undefined;

  return {
    seed: run.seed,
    playerCount: final.players.length,
    playerTurns: run.turnsPlayed,
    rounds: Math.ceil(run.turnsPlayed / final.players.length),
    endReason: run.endReason,
    winnerId: run.finalState.winnerId,
    winnerMissionTypes: winner
      ? winner.missions.filter((m) => m.isCompleted).map((m) => m.type)
      : [],
    totalDamage,
    destructions,
    missionCompletions: final.players.reduce((s, p) => s + p.completedMissionCount, 0),
    completionsByType,
    perPlayer,
  };
}

function creditEvent(
  e: GameEvent,
  per: Record<string, PerPlayerStats>,
  addDamage: (d: number) => void,
  addDestruction: () => void,
  completionsByType: Partial<Record<MissionType, number>>
): void {
  const first = (s: PerPlayerStats, key: "firstDockTurn" | "firstJumpTurn") => {
    if (s[key] === null) s[key] = e.turn;
  };
  switch (e.type) {
    case "weapon_fired": {
      const s = per[e.attackerId];
      if (!s) break;
      s.shotsFired[e.weaponType] = (s.shotsFired[e.weaponType] ?? 0) + 1;
      break;
    }
    case "missile_launched":
      if (per[e.ownerId]) per[e.ownerId].missilesLaunched++;
      break;
    case "missile_intercepted":
      if (e.destroyed && per[e.targetId]) per[e.targetId].missilesIntercepted++;
      break;
    case "attack_resolved": {
      const a = per[e.attackerId];
      const t = per[e.targetId];
      if (a) {
        if (e.result === "miss") a.misses++;
        else a.hits++;
        if (e.result === "critical") a.criticals++;
        a.damageDealt += e.toHull;
      }
      if (t) t.damageTaken += e.toHull;
      addDamage(e.toHull);
      break;
    }
    case "ship_destroyed":
      addDestruction();
      if (per[e.victimId]) per[e.victimId].deaths++;
      if (e.killerId && per[e.killerId]) per[e.killerId].kills++;
      break;
    case "heat_damage":
      if (per[e.playerId]) per[e.playerId].heatDamageTaken += e.damage;
      break;
    case "scanned":
      if (per[e.scannerId]) per[e.scannerId].scans++;
      break;
    case "docked":
      if (per[e.playerId]) {
        per[e.playerId].docks++;
        first(per[e.playerId], "firstDockTurn");
      }
      break;
    case "jumped":
      if (per[e.playerId]) {
        per[e.playerId].jumps++;
        first(per[e.playerId], "firstJumpTurn");
      }
      break;
    case "burned":
      if (per[e.playerId]) per[e.playerId].burns++;
      break;
    case "mission_completed":
      completionsByType[e.mission.type] = (completionsByType[e.mission.type] ?? 0) + 1;
      break;
    default:
      break;
  }
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

export interface AggregateStats {
  gameCount: number;
  endReasons: Record<string, number>;
  rounds: Distribution;
  playerTurns: Distribution;
  totalDamage: Distribution;
  destructions: Distribution;
  missionCompletions: Distribution;
  completionsByType: Partial<Record<MissionType, number>>;
  winnerMissionTypes: Partial<Record<MissionType, number>>;
  winsByPlayer: Record<string, number>;
  /** Per player id across games. */
  firstDockRound: Distribution;
  firstJumpRound: Distribution;
  hiddenTilesAtEnd: Distribution;
  scansPerGame: Distribution;
  loadoutWins: Record<string, { games: number; wins: number }>;
}

export function aggregateStats(games: PerGameStats[]): AggregateStats {
  const endReasons: Record<string, number> = {};
  const winsByPlayer: Record<string, number> = {};
  const completionsByType: Partial<Record<MissionType, number>> = {};
  const winnerMissionTypes: Partial<Record<MissionType, number>> = {};
  const loadoutWins: Record<string, { games: number; wins: number }> = {};
  const firstDock: number[] = [];
  const firstJump: number[] = [];
  const hidden: number[] = [];
  const scans: number[] = [];

  for (const g of games) {
    endReasons[g.endReason] = (endReasons[g.endReason] ?? 0) + 1;
    if (g.winnerId) winsByPlayer[g.winnerId] = (winsByPlayer[g.winnerId] ?? 0) + 1;
    for (const [type, n] of Object.entries(g.completionsByType)) {
      completionsByType[type as MissionType] =
        (completionsByType[type as MissionType] ?? 0) + (n ?? 0);
    }
    for (const type of g.winnerMissionTypes)
      winnerMissionTypes[type] = (winnerMissionTypes[type] ?? 0) + 1;
    let gameScans = 0;
    for (const p of Object.values(g.perPlayer)) {
      if (p.firstDockTurn !== null) firstDock.push(p.firstDockTurn);
      if (p.firstJumpTurn !== null) firstJump.push(p.firstJumpTurn);
      hidden.push(p.hiddenTilesAtEnd);
      gameScans += p.scans;
      const lw = (loadoutWins[p.loadout] ??= { games: 0, wins: 0 });
      lw.games++;
      if (g.winnerId === p.playerId) lw.wins++;
    }
    scans.push(gameScans);
  }

  return {
    gameCount: games.length,
    endReasons,
    rounds: distribution(games.map((g) => g.rounds)),
    playerTurns: distribution(games.map((g) => g.playerTurns)),
    totalDamage: distribution(games.map((g) => g.totalDamage)),
    destructions: distribution(games.map((g) => g.destructions)),
    missionCompletions: distribution(games.map((g) => g.missionCompletions)),
    completionsByType,
    winnerMissionTypes,
    winsByPlayer,
    firstDockRound: distribution(firstDock),
    firstJumpRound: distribution(firstJump),
    hiddenTilesAtEnd: distribution(hidden),
    scansPerGame: distribution(scans),
    loadoutWins,
  };
}

export function distribution(values: number[]): Distribution {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, median: 0, p25: 0, p75: 0, count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round((sorted.reduce((s, v) => s + v, 0) / sorted.length) * 10) / 10,
    median: at(0.5),
    p25: at(0.25),
    p75: at(0.75),
    count: sorted.length,
  };
}
