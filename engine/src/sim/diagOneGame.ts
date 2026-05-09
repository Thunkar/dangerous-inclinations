#!/usr/bin/env node
/**
 * One-game diagnostic. Dumps per-turn ship state, goal, cargo state.
 *
 * Usage:
 *   node --experimental-strip-types --no-warnings src/sim/diagOneGame.ts --seed=1 --bots=4 --maxTurns=80 --player=bot-1
 */

import type { GameState, Player, PlayerAction } from "../models/game.ts";
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
import { createDeterminismFields, Rng, pickIndex } from "../utils/rng.ts";
import {
  getAvailableDeploymentSectors,
  deployShip,
  transitionToActivePhase,
} from "../game/deployment.ts";
import { computeMissionGoals, selectCurrentGoal } from "../ai/behaviors/missions.ts";
import type { BotGoal } from "../ai/types.ts";

interface Args {
  seed: number;
  bots: number;
  maxTurns: number;
  player: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { seed: 1, bots: 4, maxTurns: 80, player: "bot-1" };
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [k, v] = arg.slice(2).split("=");
    if (k === "seed") out.seed = Number(v);
    else if (k === "bots") out.bots = Number(v);
    else if (k === "maxTurns") out.maxTurns = Number(v);
    else if (k === "player") out.player = v;
  }
  return out;
}

function setupGame(seed: number, botCount: number): GameState {
  const planets = GRAVITY_WELLS.filter((w) => w.type === "planet");
  const players: Player[] = Array.from({ length: botCount }, (_, i) => ({
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
    if (!result.success) throw new Error(`Bot ${bot.id} deploy failed`);
    state = result.gameState;
  }

  return transitionToActivePhase(state);
}

function summarizeMissions(p: Player): string {
  return p.missions
    .map((m) => {
      let summary = "?";
      if (m.type === "destroy_ship") summary = `destroy[${m.targetPlayerId}]`;
      else if (m.type === "deliver_cargo") {
        const cargo = p.cargo.find((c) => c.missionId === m.id);
        const pu = cargo?.isPickedUp ? "PU" : "--";
        summary = `cargo[${m.pickupPlanetId}→${m.deliveryPlanetId} ${pu}]`;
      } else if (m.type === "intercept_transmission") {
        const scan = m.scanAcquired ? "SCAN" : "----";
        summary = `intercept[${m.targetPlayerId} ${scan}]`;
      }
      return m.isCompleted ? `✓${summary}` : summary;
    })
    .join(" ");
}

function summarizeStations(state: GameState): string {
  return state.stations
    .map((s) => `${s.planetId.replace("planet-", "")}@R${s.ring}S${s.sector}`)
    .join(" ");
}

function summarizeShip(p: Player): string {
  const s = p.ship;
  return `${s.wellId.replace("planet-", "P-").replace("blackhole", "BH")} R${s.ring}S${s.sector} ${s.facing.slice(0, 3)} hp=${s.hitPoints} m=${s.reactionMass} e=${s.reactor.availableEnergy}`;
}

function describeGoal(g: BotGoal | null | undefined): string {
  if (!g) return "(no goal)";
  const tw =
    g.targetWellId
      ? `${g.targetWellId.replace("planet-", "P-").replace("blackhole", "BH")}R${g.targetRing}S${g.targetSector}`
      : g.targetPlayerId
        ? `→${g.targetPlayerId}`
        : "?";
  return `${g.type}@${tw} ETA${g.estimatedTurns}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  let state = setupGame(args.seed, args.bots);

  process.stdout.write(`=== Diagnostic: seed=${args.seed} bots=${args.bots} player=${args.player} ===\n`);
  for (const p of state.players) {
    process.stdout.write(`${p.id} loadout=${p.ship.loadout.forwardSlots.join(",")}|${p.ship.loadout.sideSlots.join(",")} missions=${summarizeMissions(p)}\n`);
  }
  process.stdout.write(`Stations: ${summarizeStations(state)}\n\n`);

  for (let i = 0; i < args.maxTurns; i++) {
    if (state.phase === "ended") break;
    const active = state.players[state.activePlayerIndex];
    const isFocus = active.id === args.player;

    let actions: PlayerAction[];
    if (active.ship.hitPoints <= 0) {
      actions = [
        {
          type: "coast",
          playerId: active.id,
          sequence: 1,
          data: { activateScoop: false },
        },
      ];
    } else {
      actions = botDecideActions(state, active.id).actions;
    }

    if (isFocus) {
      const goals = computeMissionGoals(active, state);
      const goal = selectCurrentGoal(goals, "auto");
      process.stdout.write(
        `T${state.turn} ${active.id}: ${summarizeShip(active)} | ${summarizeMissions(active)} | goal=${describeGoal(goal)} | actions=${actions.map((a) => a.type).join(",")}\n`
      );
    }

    const result = executeTurn(state, actions);
    if (result.errors && result.errors.length) {
      process.stdout.write(`*** INVALID TURN: ${result.errors.join(", ")}\n`);
      break;
    }
    state = result.gameState;
  }

  process.stdout.write(`\n=== End state ===\n`);
  for (const p of state.players) {
    process.stdout.write(`${p.id} done=${p.completedMissionCount} ${summarizeMissions(p)} ${summarizeShip(p)}\n`);
  }
  process.stdout.write(`Stations: ${summarizeStations(state)}\n`);
}

main();
