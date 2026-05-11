#!/usr/bin/env node
/**
 * Inspect a directory of `GameRecording` JSON files and surface bot
 * behavior issues:
 *
 *   - **Endless coasting**: bot coasts ≥ N consecutive turns with no
 *     mission progress (no cargo pickup/delivery, no scan acquired,
 *     no enemy HP reduced).
 *   - **Wasted allocations**: a subsystem is `allocatedEnergy > 0` for ≥ N
 *     consecutive turns of that bot's actions but is never `usedThisTurn`
 *     during that window (powered-but-idle).
 *   - **Avoidable heat damage**: bot's `currentHeat > heatCapacity` at the
 *     start of its turn — meaning incoming hull damage from heat overflow
 *     was always going to happen this turn — and the bot didn't deallocate
 *     anything before the overflow tick.
 *   - **Energy thrashing**: bot allocates AND deallocates the same
 *     subsystem within 3 turns repeatedly.
 *
 * Aggregates per game and across the batch. Outputs the worst seeds for
 * each issue so they can be inspected with diagOneGame.
 *
 * Usage:
 *   node --experimental-transform-types --no-warnings src/sim/analyzeRecordings.ts \
 *     --in=/tmp/sim-recs
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GameRecording, RecordedTurn } from "../recording/types.ts";
import type { GameState, Player } from "../models/game.ts";

interface Args {
  in: string;
  coastWindow: number;
  idleWindow: number;
  thrashWindow: number;
  topN: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    in: "/tmp/sim-recs",
    coastWindow: 6,
    idleWindow: 8,
    thrashWindow: 3,
    topN: 5,
  };
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [k, v] = arg.slice(2).split("=");
    if (k === "in") out.in = v;
    else if (k === "coastWindow") out.coastWindow = Number(v);
    else if (k === "idleWindow") out.idleWindow = Number(v);
    else if (k === "thrashWindow") out.thrashWindow = Number(v);
    else if (k === "topN") out.topN = Number(v);
  }
  return out;
}

interface Issue {
  seed: number;
  turn: number;
  playerId: string;
  detail: string;
}

interface SeedReport {
  seed: number;
  turns: number;
  winner: string | undefined;
  endlessCoasting: Issue[];
  wastedAllocations: Issue[];
  heatDamage: Issue[];
  energyThrashing: Issue[];
}

function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function missionProgressKey(player: Player): string {
  // A short fingerprint that changes whenever the player makes a mission
  // step: cargo pickup/delivery, scan acquired, or any mission completes.
  const cargo = player.cargo
    .map((c) => `${c.id}:${c.isPickedUp ? 1 : 0}`)
    .join("|");
  const missions = player.missions
    .map((m) => {
      const completed = m.isCompleted ? "✓" : "·";
      const scan =
        m.type === "intercept_transmission" && m.scanAcquired ? "S" : "";
      return `${m.id}:${completed}${scan}`;
    })
    .join("|");
  return `${cargo}#${missions}`;
}

function detectEndlessCoasting(
  turns: RecordedTurn[],
  seed: number,
  coastWindow: number,
): Issue[] {
  // Group turns by player so "consecutive bot-1 turns" is a clean stream.
  const byPlayer = new Map<string, RecordedTurn[]>();
  for (const t of turns) {
    if (!byPlayer.has(t.playerId)) byPlayer.set(t.playerId, []);
    byPlayer.get(t.playerId)!.push(t);
  }

  const issues: Issue[] = [];
  for (const [playerId, playerTurns] of byPlayer) {
    let coastStreak = 0;
    let streakStartTurn = 0;
    let lastProgressKey: string | undefined;

    for (const t of playerTurns) {
      const player = findPlayer(t.resultingStateSnapshot, playerId);
      if (!player) continue;

      const progressKey = missionProgressKey(player);
      const isCoast = t.actions.some((a) => a.type === "coast");
      const isOnlyCoast =
        isCoast && t.actions.every((a) => a.type !== "burn" && a.type !== "well_transfer");

      const progressMade =
        lastProgressKey !== undefined && progressKey !== lastProgressKey;

      if (isOnlyCoast && !progressMade) {
        if (coastStreak === 0) streakStartTurn = t.turnNumber;
        coastStreak++;
      } else {
        if (coastStreak >= coastWindow) {
          issues.push({
            seed,
            turn: streakStartTurn,
            playerId,
            detail: `${coastStreak} consecutive coast-only turns with no mission progress (turns ${streakStartTurn}–${streakStartTurn + coastStreak - 1})`,
          });
        }
        coastStreak = 0;
      }
      lastProgressKey = progressKey;
    }
    if (coastStreak >= coastWindow) {
      issues.push({
        seed,
        turn: streakStartTurn,
        playerId,
        detail: `${coastStreak} consecutive coast-only turns trailing the game`,
      });
    }
  }

  return issues;
}

function detectWastedAllocations(
  turns: RecordedTurn[],
  seed: number,
  idleWindow: number,
): Issue[] {
  const issues: Issue[] = [];
  // For each player + subsystem, track consecutive turns the subsystem was
  // allocated but not used during the player's own action.
  const byPlayer = new Map<string, RecordedTurn[]>();
  for (const t of turns) {
    if (!byPlayer.has(t.playerId)) byPlayer.set(t.playerId, []);
    byPlayer.get(t.playerId)!.push(t);
  }

  for (const [playerId, playerTurns] of byPlayer) {
    const idleStreaks = new Map<
      string,
      { count: number; startTurn: number; subType: string; peakEnergy: number }
    >();

    for (const t of playerTurns) {
      const player = findPlayer(t.resultingStateSnapshot, playerId);
      if (!player) continue;

      for (const sub of player.ship.subsystems) {
        // Skip fixed/passive systems and movement systems (engines/rotation
        // are alloc-on-use-only by design, so any thrashing or idle period
        // there reflects movement cadence, not waste).
        if (
          sub.type === "engines" ||
          sub.type === "rotation" ||
          sub.type === "scoop" ||
          sub.type === "radiator" ||
          sub.type === "fuel_compressor"
        ) {
          continue;
        }

        const key = `${sub.type}@${sub.slotType}/${sub.slotIndex}`;
        const allocated = sub.allocatedEnergy > 0;
        const used = sub.usedThisTurn;

        if (allocated && !used) {
          const existing = idleStreaks.get(key);
          if (!existing) {
            idleStreaks.set(key, {
              count: 1,
              startTurn: t.turnNumber,
              subType: sub.type,
              peakEnergy: sub.allocatedEnergy,
            });
          } else {
            existing.count++;
            if (sub.allocatedEnergy > existing.peakEnergy) {
              existing.peakEnergy = sub.allocatedEnergy;
            }
          }
        } else {
          const existing = idleStreaks.get(key);
          if (existing && existing.count >= idleWindow) {
            issues.push({
              seed,
              turn: existing.startTurn,
              playerId,
              detail: `${existing.subType} held at ${existing.peakEnergy}E unused for ${existing.count} bot-turns (turns ${existing.startTurn}–${t.turnNumber - 1})`,
            });
          }
          idleStreaks.delete(key);
        }
      }
    }

    for (const [, streak] of idleStreaks) {
      if (streak.count >= idleWindow) {
        issues.push({
          seed,
          turn: streak.startTurn,
          playerId,
          detail: `${streak.subType} held at ${streak.peakEnergy}E unused for ${streak.count} bot-turns through end of game`,
        });
      }
    }
  }

  return issues;
}

function detectHeatDamage(turns: RecordedTurn[], seed: number): Issue[] {
  const issues: Issue[] = [];
  // Heat damage: if a turn's log entries mention overflow dealing damage.
  // Or: heat at start of turn already over capacity AND bot didn't deallocate
  // before the overflow tick.
  for (const t of turns) {
    for (const log of t.logEntries) {
      if (log.playerId !== t.playerId) continue;
      const action = (log.action ?? "").toLowerCase();
      const result = (log.result ?? "").toLowerCase();
      if (
        action.includes("heat") &&
        (result.includes("damage") || result.includes("overflow"))
      ) {
        const deallocated = t.actions.some(
          (a) => a.type === "deallocate_energy",
        );
        // If bot didn't deallocate to vent, that's avoidable damage.
        if (!deallocated) {
          issues.push({
            seed,
            turn: t.turnNumber,
            playerId: t.playerId,
            detail: `${log.action}: ${log.result} (no deallocations issued this turn)`,
          });
        }
      }
    }
  }
  return issues;
}

function detectEnergyThrashing(
  turns: RecordedTurn[],
  seed: number,
  thrashWindow: number,
): Issue[] {
  const issues: Issue[] = [];
  const byPlayer = new Map<string, RecordedTurn[]>();
  for (const t of turns) {
    if (!byPlayer.has(t.playerId)) byPlayer.set(t.playerId, []);
    byPlayer.get(t.playerId)!.push(t);
  }

  for (const [playerId, playerTurns] of byPlayer) {
    // Track recent allocations and deallocations per subsystem type.
    const recent = new Map<string, Array<{ turn: number; kind: "alloc" | "dealloc" }>>();

    for (const t of playerTurns) {
      for (const action of t.actions) {
        if (action.type !== "allocate_energy" && action.type !== "deallocate_energy") {
          continue;
        }
        const subType = action.data.subsystemType;
        // Skip engines/rotation/scoop: alloc-on-use is by-design.
        // Engines come on for burn turns, off when coasting. Scoop is the
        // mirror image: on when coasting at low fuel, off when bursting.
        // Both alternate naturally with movement cadence — counting them
        // as "thrashing" buries real waste under expected noise.
        if (subType === "engines" || subType === "rotation" || subType === "scoop") continue;
        const kind = action.type === "allocate_energy" ? "alloc" : "dealloc";
        const list = recent.get(subType) ?? [];
        list.push({ turn: t.turnNumber, kind });
        // Drop entries outside the window.
        const cutoff = t.turnNumber - thrashWindow * 4; // 4 player turns ≈ 1 round; window is in bot-turns
        while (list.length > 0 && list[0].turn < cutoff) list.shift();
        recent.set(subType, list);

        // Detect alloc-then-dealloc of same sub within the window.
        if (
          list.length >= 2 &&
          list[list.length - 1].kind !== list[list.length - 2].kind
        ) {
          // Only flag if this happens repeatedly (≥ 3 flips in window).
          let flips = 0;
          for (let i = 1; i < list.length; i++) {
            if (list[i].kind !== list[i - 1].kind) flips++;
          }
          if (flips >= 3) {
            issues.push({
              seed,
              turn: t.turnNumber,
              playerId,
              detail: `${subType} thrashed ${flips}× alloc/dealloc within ~${thrashWindow} bot-turns`,
            });
            // Reset to avoid duplicate reports for the same flapping window.
            recent.set(subType, []);
          }
        }
      }
    }
  }

  return issues;
}

function analyzeRecording(
  recording: GameRecording,
  args: Args,
): SeedReport {
  return {
    seed: recording.seed,
    turns: recording.turns.length,
    winner: recording.metadata.winnerId,
    endlessCoasting: detectEndlessCoasting(
      recording.turns,
      recording.seed,
      args.coastWindow,
    ),
    wastedAllocations: detectWastedAllocations(
      recording.turns,
      recording.seed,
      args.idleWindow,
    ),
    heatDamage: detectHeatDamage(recording.turns, recording.seed),
    energyThrashing: detectEnergyThrashing(
      recording.turns,
      recording.seed,
      args.thrashWindow,
    ),
  };
}

function formatTopIssues(label: string, all: Issue[], topN: number): string {
  if (all.length === 0) return `\n## ${label}\n  (none)\n`;
  const grouped = new Map<number, Issue[]>();
  for (const issue of all) {
    if (!grouped.has(issue.seed)) grouped.set(issue.seed, []);
    grouped.get(issue.seed)!.push(issue);
  }
  const sorted = Array.from(grouped.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );
  let out = `\n## ${label}\n  total: ${all.length} issues across ${grouped.size} games\n`;
  out += `  worst seeds (top ${Math.min(topN, sorted.length)}):\n`;
  for (const [seed, issues] of sorted.slice(0, topN)) {
    out += `    seed=${seed}: ${issues.length}× — sample: ${issues[0].detail}\n`;
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const files = readdirSync(args.in)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(args.in, f));

  process.stdout.write(`Analyzing ${files.length} recordings from ${args.in}\n`);

  const reports: SeedReport[] = [];
  for (const file of files) {
    const recording: GameRecording = JSON.parse(readFileSync(file, "utf-8"));
    reports.push(analyzeRecording(recording, args));
  }

  const totals = {
    games: reports.length,
    wins: reports.filter((r) => r.winner).length,
    avgTurns: Math.round(
      reports.reduce((s, r) => s + r.turns, 0) / reports.length,
    ),
    endlessCoasting: reports.flatMap((r) => r.endlessCoasting),
    wastedAllocations: reports.flatMap((r) => r.wastedAllocations),
    heatDamage: reports.flatMap((r) => r.heatDamage),
    energyThrashing: reports.flatMap((r) => r.energyThrashing),
  };

  process.stdout.write(
    `\nGames: ${totals.games} (${totals.wins} ended in victory)\n` +
      `Avg turns: ${totals.avgTurns}\n`,
  );

  process.stdout.write(formatTopIssues("Endless coasting", totals.endlessCoasting, args.topN));
  process.stdout.write(formatTopIssues("Wasted allocations (powered, never used)", totals.wastedAllocations, args.topN));
  process.stdout.write(formatTopIssues("Avoidable heat damage", totals.heatDamage, args.topN));
  process.stdout.write(formatTopIssues("Energy thrashing", totals.energyThrashing, args.topN));
}

main();
