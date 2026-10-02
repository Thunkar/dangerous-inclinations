/**
 * Stats from game events. Nothing here parses text: every number comes from
 * a typed event or from the final state.
 */
import type { GameEvent } from "../models/events.ts";
import type { CargoKind, MissionType } from "../models/missions.ts";
import { MISSION_FAMILY } from "../models/missions.ts";
import { SUBSYSTEM_CONFIGS, WEAPON_SUBSYSTEM_TYPES } from "../models/subsystems.ts";
import type { GameRunResult } from "./runGame.ts";
import { cardTracksOf, type CardTrack } from "./cardFunnel.ts";

export interface PerPlayerStats {
  playerId: string;
  /** Points scored (a primary is worth 2, a secondary 1), not cards. */
  points: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  deaths: number;
  shotsFired: Record<string, number>;
  hitsByWeapon: Record<string, number>;
  /** Hits that shields stopped whole (a disruptor against any powered wall). */
  blockedByWeapon: Record<string, number>;
  hullDamageByWeapon: Record<string, number>;
  missilesLaunched: number;
  /** Missiles aimed at this ship that its racks shot down. */
  missilesIntercepted: number;
  scans: number;
  firstDockRound: number | null;
  firstJumpRound: number | null;
  /** Loadout tiles still face-down when the game ended. */
  hiddenTilesAtEnd: number;
  loadout: string;
  /**
   * The primary this seat kept, and the secondaries beside it: "Destroy +
   * Survey/Tanker". The shape of a hand is a rule now (one primary, two
   * secondaries), so the plan is which cards rather than how many of each, and
   * this is what says whether a rule change moved the plans or only the
   * numbers.
   */
  handShape: string;
}

export interface TurnBehaviour {
  /** Share of acting turns (not the respawn turn) that were a plain coast. */
  coastShare: number;
  /** Share of acting turns that coasted without scooping or firing: nothing was done. */
  idleShare: number;
  burnShare: number;
  jumpShare: number;
  scoopShare: number;
  /** Share of acting turns with at least one shot fired. */
  firingShare: number;
  meanShieldCubes: number;
  /** Share of acting turns ending with a shield tile's maximum or more on shields. */
  shieldsFullShare: number;
  /** Mean cubes on shields, racks and sensors at the end of an acting turn: what stays up. */
  meanUpEnergy: number;
  shieldsPoweredShare: number;
  meanHeatAtCheck: number;
  /** Share of acting turns whose heat check dealt damage. */
  heatDamageShare: number;
  /** Share of weapon damage soaked by shields (absorbed / (absorbed + toHull)). */
  absorbedShare: number;
  /** Share of all player-turns spent respawning: one per destruction. */
  lostTurnShare: number;
  /** Share of acting turns ending in a planet's well. */
  planetWellShare: number;
  /** Share of acting turns ending in the black hole's well. */
  blackHoleShare: number;
  /** Share of acting turns ending moored at a station. */
  mooredShare: number;
}

/** How one game unfolded, read off its events in order. */
export interface GameUnfolding {
  /**
   * Times the sole leader changed. The leader is the one player with the most
   * points; a tie leaves nobody leading, and the first player to lead is not a
   * change.
   */
  leadChanges: number;
  /** The sole leader at the end of round 10, or null (a tie, or nobody scored). */
  leaderAtRound10: string | null;
  /** The round of the first card completed in the game, or null. */
  firstScoreRound: number | null;
  escortMarks: number;
  /** Escorts completed. */
  escortsPaid: number;
  /** Escort markers back in hand because the marked ship died before it paid. */
  escortsCarrierDied: number;
  /** Escort markers back in hand because the escort died. */
  escortsEscortDied: number;
  /** Sales or fuel pumps by a marked ship that paid its escort nothing: the escort was out of the well. */
  escortMissedSales: number;
  /** For every Escort paid: rounds from the marker going on to the card completing. */
  markToCompletionRounds: number[];
  wrecksLeft: number;
  wrecksSalvaged: number;
  /** Piracy seizures, by what was taken. */
  seizuresByKind: Record<CargoKind, number>;
  /** Dock visits that made a sale. */
  dockSales: number;
  /** Of those, the visits where the player named the sale instead of leaving the default. */
  dockSalesNamed: number;
  /** Tanker fuel pumped into a station. */
  fuelPumps: number;
}

export interface PerGameStats {
  seed: number;
  behaviour: TurnBehaviour;
  unfolding: GameUnfolding;
  playerCount: number;
  playerTurns: number;
  rounds: number;
  endReason: GameRunResult["endReason"];
  winnerId?: string;
  winnerMissionTypes: MissionType[];
  totalDamage: number;
  destructions: number;
  /** Cards completed at the table. */
  cards: number;
  /** Points scored at the table: a primary counts 2, a secondary 1. */
  points: number;
  completionsByType: Partial<Record<MissionType, number>>;
  /** Cards dealt as offers, by type: the denominator of a pick rate. */
  offeredByType: Partial<Record<MissionType, number>>;
  /** Cards kept out of those offers, by type. */
  keptByType: Partial<Record<MissionType, number>>;
  perPlayer: Record<string, PerPlayerStats>;
  /** Every kept card followed from its first step (sim/cardFunnel.ts). */
  cardTracks: CardTrack[];
}

/** The printed name of every card, as every page of the simulator writes it. */
export const CARD_LABEL: Record<MissionType, string> = {
  destroy_ship: "Destroy",
  deliver_cargo: "Deliver",
  intercept_transmission: "Intercept",
  survey: "Survey",
  piracy: "Piracy",
  tanker: "Tanker",
  escort: "Escort",
  salvage: "Salvage",
};

/** The round the comeback question is asked at. */
export const LEAD_CHECK_ROUND = 10;

/** "Destroy + Piracy/Survey": the primary a seat took, and what it took beside it. */
export function handShapeOf(missions: ReadonlyArray<{ type: MissionType }>): string {
  const label = (m: { type: MissionType }) => CARD_LABEL[m.type];
  const primaries = missions.filter((m) => MISSION_FAMILY[m.type] !== "secondary").map(label);
  const secondaries = missions.filter((m) => MISSION_FAMILY[m.type] === "secondary").map(label);
  return `${primaries.sort().join("+") || "none"} + ${secondaries.sort().join("/") || "none"}`;
}

export function computePerGameStats(run: GameRunResult): PerGameStats {
  const final = run.finalState;
  const perPlayer: Record<string, PerPlayerStats> = {};
  for (const p of final.players) {
    perPlayer[p.id] = {
      playerId: p.id,
      points: p.points,
      damageDealt: 0,
      damageTaken: 0,
      kills: 0,
      deaths: 0,
      shotsFired: {},
      hitsByWeapon: {},
      blockedByWeapon: {},
      hullDamageByWeapon: {},
      missilesLaunched: 0,
      missilesIntercepted: 0,
      scans: 0,
      firstDockRound: null,
      firstJumpRound: null,
      hiddenTilesAtEnd: p.ship.subsystems.filter((s) => s.slotGroup !== undefined && !s.isRevealed)
        .length,
      loadout: [...p.ship.loadout.forwardSlots, ...p.ship.loadout.sideSlots].join(","),
      handShape: handShapeOf(p.missions),
    };
  }

  // What the deal put in front of every seat, and what they kept of it. Both
  // read off the final state: a player keeps their offers all game.
  const offeredByType: Partial<Record<MissionType, number>> = {};
  const keptByType: Partial<Record<MissionType, number>> = {};
  for (const p of final.players) {
    for (const m of p.missionOffers) offeredByType[m.type] = (offeredByType[m.type] ?? 0) + 1;
    for (const m of p.missions) keptByType[m.type] = (keptByType[m.type] ?? 0) + 1;
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

  let absorbed = 0;
  let hull = 0;
  for (const turn of run.turns) {
    for (const e of turn.events) {
      if (e.type === "attack_resolved") {
        absorbed += e.absorbed;
        hull += e.toHull;
      }
    }
  }
  // Read at call time: a `--tiles=shields.maxEnergy=` override applies in the
  // worker that plays the game, which is where this runs.
  const shieldMax = SUBSYSTEM_CONFIGS.shields.maxEnergy;
  const acting = run.turnStats.filter((t) => !t.lost);
  const share = (pred: (t: (typeof acting)[number]) => boolean) =>
    acting.length === 0 ? 0 : acting.filter(pred).length / acting.length;
  const mean = (f: (t: (typeof acting)[number]) => number) =>
    acting.length === 0 ? 0 : acting.reduce((s, t) => s + f(t), 0) / acting.length;
  const behaviour: TurnBehaviour = {
    coastShare: share((t) => t.coasted && !t.burned && !t.jumped),
    idleShare: share(
      (t) => t.coasted && !t.burned && !t.jumped && !t.scooped && t.shotsFired === 0
    ),
    burnShare: share((t) => t.burned),
    jumpShare: share((t) => t.jumped),
    scoopShare: share((t) => t.scooped),
    firingShare: share((t) => t.shotsFired > 0),
    meanShieldCubes: mean((t) => t.shieldCubes),
    shieldsFullShare: share((t) => t.shieldCubes >= shieldMax),
    meanUpEnergy: mean((t) => t.upEnergy),
    shieldsPoweredShare: share((t) => t.shieldCubes > 0),
    meanHeatAtCheck: mean((t) => t.heatAtCheck),
    heatDamageShare: share((t) => t.heatDamage > 0),
    absorbedShare: absorbed + hull === 0 ? 0 : absorbed / (absorbed + hull),
    lostTurnShare:
      run.turnStats.length === 0
        ? 0
        : run.turnStats.filter((t) => t.lost).length / run.turnStats.length,
    planetWellShare: share((t) => t.endedAtPlanet),
    blackHoleShare: share((t) => !t.endedAtPlanet),
    mooredShare: share((t) => t.endedMoored),
  };

  return {
    seed: run.seed,
    behaviour,
    unfolding: unfoldingOf(run),
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
    cards: Object.values(completionsByType).reduce((s, n) => s + (n ?? 0), 0),
    points: final.players.reduce((s, p) => s + p.points, 0),
    completionsByType,
    offeredByType,
    keptByType,
    perPlayer,
    cardTracks: cardTracksOf(run),
  };
}

/** The one player with the most points, or null on a tie or before anyone scores. */
function soleLeader(scores: Map<string, number>): string | null {
  let leader: string | null = null;
  let best = 0;
  let tied = false;
  for (const [id, points] of scores) {
    if (points > best) {
      best = points;
      leader = id;
      tied = false;
    } else if (points === best && points > 0) {
      tied = true;
    }
  }
  return tied ? null : leader;
}

function unfoldingOf(run: GameRunResult): GameUnfolding {
  const scores = new Map<string, number>();
  let leader: string | null = null;
  let leadChanges = 0;
  let leaderAtRound10: string | null = null;
  let firstScoreRound: number | null = null;
  let escortMarks = 0;
  let escortsPaid = 0;
  let escortsCarrierDied = 0;
  let escortsEscortDied = 0;
  let escortMissedSales = 0;
  const markedAt = new Map<string, number>();
  /** Marker (mission id) to the ship it is on, while it is out. */
  const markedOn = new Map<string, string>();
  const markToCompletionRounds: number[] = [];
  let wrecksLeft = 0;
  let wrecksSalvaged = 0;
  const seizuresByKind: Record<CargoKind, number> = { crate: 0, data: 0 };
  let dockSales = 0;
  let dockSalesNamed = 0;
  let fuelPumps = 0;

  for (const turn of run.turns) {
    const named = turn.actions.some((a) => a.type === "dock_sale" && a.playerId === turn.playerId);
    // Escorts that score this turn: a sale on it by their carrier was not missed.
    const paidNow = new Set(
      turn.events.flatMap((e) =>
        e.type === "mission_completed" && e.mission.type === "escort" ? [e.mission.id] : []
      )
    );
    for (const e of turn.events) {
      if (e.type === "cargo_delivered" || e.type === "fuel_pumped") {
        for (const [missionId, carrierId] of markedOn)
          if (carrierId === e.playerId && !paidNow.has(missionId)) escortMissedSales++;
      }
      switch (e.type) {
        case "mission_completed": {
          firstScoreRound ??= e.turn;
          // `points` is the player's running points after the card.
          scores.set(e.playerId, e.points);
          const now = soleLeader(scores);
          if (now !== null && leader !== null && now !== leader) leadChanges++;
          if (now !== null) leader = now;
          const marked = markedAt.get(e.mission.id);
          if (e.mission.type === "escort") {
            escortsPaid++;
            markedOn.delete(e.mission.id);
          }
          if (e.mission.type === "escort" && marked !== undefined) {
            markToCompletionRounds.push(e.turn - marked);
            markedAt.delete(e.mission.id);
          }
          break;
        }
        case "escort_marked":
          escortMarks++;
          markedAt.set(e.missionId, e.turn);
          markedOn.set(e.missionId, e.carrierId);
          break;
        case "escort_released":
          if (e.cause === "carrier_destroyed") escortsCarrierDied++;
          else escortsEscortDied++;
          markedAt.delete(e.missionId);
          markedOn.delete(e.missionId);
          break;
        case "wreck_left":
          wrecksLeft++;
          break;
        case "wreck_salvaged":
          wrecksSalvaged++;
          break;
        case "cargo_seized":
          seizuresByKind[e.kind]++;
          break;
        case "fuel_pumped":
          fuelPumps++;
          break;
        case "docked":
          if (e.sold !== null) {
            dockSales++;
            if (named && e.playerId === turn.playerId) dockSalesNamed++;
          }
          break;
        default:
          break;
      }
      // The standings at the end of round 10 are the ones the last event of
      // rounds up to 10 left behind.
      if (e.turn <= LEAD_CHECK_ROUND) leaderAtRound10 = soleLeader(scores);
    }
  }

  return {
    leadChanges,
    leaderAtRound10,
    firstScoreRound,
    escortMarks,
    escortsPaid,
    escortsCarrierDied,
    escortsEscortDied,
    escortMissedSales,
    markToCompletionRounds,
    wrecksLeft,
    wrecksSalvaged,
    seizuresByKind,
    dockSales,
    dockSalesNamed,
    fuelPumps,
  };
}

function creditEvent(
  e: GameEvent,
  per: Record<string, PerPlayerStats>,
  addDamage: (d: number) => void,
  addDestruction: () => void,
  completionsByType: Partial<Record<MissionType, number>>
): void {
  const first = (s: PerPlayerStats, key: "firstDockRound" | "firstJumpRound") => {
    // An event's `turn` is the round it happened in.
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
        if (e.result !== "miss")
          a.hitsByWeapon[e.weaponType] = (a.hitsByWeapon[e.weaponType] ?? 0) + 1;
        if (e.blocked)
          a.blockedByWeapon[e.weaponType] = (a.blockedByWeapon[e.weaponType] ?? 0) + 1;
        a.damageDealt += e.toHull;
        a.hullDamageByWeapon[e.weaponType] = (a.hullDamageByWeapon[e.weaponType] ?? 0) + e.toHull;
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
    case "scanned":
      if (per[e.scannerId]) per[e.scannerId].scans++;
      break;
    case "docked":
      if (per[e.playerId]) first(per[e.playerId], "firstDockRound");
      break;
    case "jumped":
      if (per[e.playerId]) first(per[e.playerId], "firstJumpRound");
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

/** {@link GameUnfolding} over a batch, per game unless the name says otherwise. */
export interface UnfoldingAggregate {
  leadChangesPerGame: number;
  /** Games still being played after round 10 that someone won. */
  gamesPastRound10: number;
  /** Of those, the share won by a seat that was not the sole leader at round 10. */
  wonFromBehindShare: number;
  firstScoreRound: Distribution;
  escortMarksPerGame: number;
  escortsPaidPerGame: number;
  /** Markers back in hand, for either ship's death. */
  escortsReleasedPerGame: number;
  escortsCarrierDiedPerGame: number;
  escortsEscortDiedPerGame: number;
  escortMissedSalesPerGame: number;
  markToCompletionRounds: Distribution;
  wrecksPerGame: number;
  /** Wrecks salvaged over wrecks left. */
  salvagedShare: number;
  seizuresPerGame: Record<CargoKind, number>;
  dockSalesPerGame: number;
  /** Sales the player named, over all sales. */
  dockSalesNamedShare: number;
  fuelPumpsPerGame: number;
}

export interface AggregateStats {
  gameCount: number;
  endReasons: Record<string, number>;
  rounds: Distribution;
  playerTurns: Distribution;
  totalDamage: Distribution;
  destructions: Distribution;
  cards: Distribution;
  points: Distribution;
  completionsByType: Partial<Record<MissionType, number>>;
  offeredByType: Partial<Record<MissionType, number>>;
  keptByType: Partial<Record<MissionType, number>>;
  winnerMissionTypes: Partial<Record<MissionType, number>>;
  winsByPlayer: Record<string, number>;
  /** Per player id across games. */
  firstDockRound: Distribution;
  firstJumpRound: Distribution;
  hiddenTilesAtEnd: Distribution;
  scansPerGame: Distribution;
  missilesLaunchedPerGame: Distribution;
  missilesInterceptedPerGame: Distribution;
  loadoutWins: Record<string, { games: number; wins: number }>;
  /** Mean of each behaviour share over the games. */
  behaviour: TurnBehaviour;
  unfolding: UnfoldingAggregate;
  /** Per weapon type: seats that carried it, and shots/hits/hull damage per game (all seats). */
  weapons: Record<string, WeaponAggregate>;
}

export interface WeaponAggregate {
  seatShare: number;
  shotsPerGame: number;
  hitsPerGame: number;
  blockedPerGame: number;
  hullDamagePerGame: number;
}

export function aggregateStats(games: PerGameStats[]): AggregateStats {
  const endReasons: Record<string, number> = {};
  const winsByPlayer: Record<string, number> = {};
  const completionsByType: Partial<Record<MissionType, number>> = {};
  const offeredByType: Partial<Record<MissionType, number>> = {};
  const keptByType: Partial<Record<MissionType, number>> = {};
  const winnerMissionTypes: Partial<Record<MissionType, number>> = {};
  const loadoutWins: Record<string, { games: number; wins: number }> = {};
  const firstDock: number[] = [];
  const firstJump: number[] = [];
  const hidden: number[] = [];
  const scans: number[] = [];
  const launched: number[] = [];
  const intercepted: number[] = [];
  const weaponTotals: Record<
    string,
    { seats: number; shots: number; hits: number; blocked: number; hull: number }
  > =
    {};
  let seats = 0;

  for (const g of games) {
    endReasons[g.endReason] = (endReasons[g.endReason] ?? 0) + 1;
    if (g.winnerId) winsByPlayer[g.winnerId] = (winsByPlayer[g.winnerId] ?? 0) + 1;
    for (const [type, n] of Object.entries(g.completionsByType)) {
      completionsByType[type as MissionType] =
        (completionsByType[type as MissionType] ?? 0) + (n ?? 0);
    }
    for (const [type, n] of Object.entries(g.offeredByType)) {
      offeredByType[type as MissionType] = (offeredByType[type as MissionType] ?? 0) + (n ?? 0);
    }
    for (const [type, n] of Object.entries(g.keptByType)) {
      keptByType[type as MissionType] = (keptByType[type as MissionType] ?? 0) + (n ?? 0);
    }
    for (const type of g.winnerMissionTypes)
      winnerMissionTypes[type] = (winnerMissionTypes[type] ?? 0) + 1;
    let gameScans = 0;
    let gameLaunched = 0;
    let gameIntercepted = 0;
    for (const p of Object.values(g.perPlayer)) {
      if (p.firstDockRound !== null) firstDock.push(p.firstDockRound);
      if (p.firstJumpRound !== null) firstJump.push(p.firstJumpRound);
      hidden.push(p.hiddenTilesAtEnd);
      gameScans += p.scans;
      gameLaunched += p.missilesLaunched;
      gameIntercepted += p.missilesIntercepted;
      const lw = (loadoutWins[p.loadout] ??= { games: 0, wins: 0 });
      lw.games++;
      if (g.winnerId === p.playerId) lw.wins++;
      seats++;
      for (const type of WEAPON_SUBSYSTEM_TYPES) {
        const w = (weaponTotals[type] ??= { seats: 0, shots: 0, hits: 0, blocked: 0, hull: 0 });
        if (p.loadout.split(",").includes(type)) w.seats++;
        w.shots += p.shotsFired[type] ?? 0;
        w.hits += p.hitsByWeapon[type] ?? 0;
        w.blocked += p.blockedByWeapon[type] ?? 0;
        w.hull += p.hullDamageByWeapon[type] ?? 0;
      }
    }
    scans.push(gameScans);
    launched.push(gameLaunched);
    intercepted.push(gameIntercepted);
  }

  const meanOf = (key: keyof TurnBehaviour) =>
    games.length === 0
      ? 0
      : Math.round((games.reduce((s, g) => s + g.behaviour[key], 0) / games.length) * 1000) / 1000;
  const behaviour = Object.fromEntries(
    (Object.keys(games[0]?.behaviour ?? {}) as Array<keyof TurnBehaviour>).map((k) => [
      k,
      meanOf(k),
    ])
  ) as unknown as TurnBehaviour;

  return {
    gameCount: games.length,
    behaviour,
    unfolding: aggregateUnfolding(games),
    endReasons,
    rounds: distribution(games.map((g) => g.rounds)),
    playerTurns: distribution(games.map((g) => g.playerTurns)),
    totalDamage: distribution(games.map((g) => g.totalDamage)),
    destructions: distribution(games.map((g) => g.destructions)),
    cards: distribution(games.map((g) => g.cards)),
    points: distribution(games.map((g) => g.points)),
    completionsByType,
    offeredByType,
    keptByType,
    winnerMissionTypes,
    winsByPlayer,
    firstDockRound: distribution(firstDock),
    firstJumpRound: distribution(firstJump),
    hiddenTilesAtEnd: distribution(hidden),
    scansPerGame: distribution(scans),
    missilesLaunchedPerGame: distribution(launched),
    missilesInterceptedPerGame: distribution(intercepted),
    loadoutWins,
    weapons: Object.fromEntries(
      Object.entries(weaponTotals).map(([type, w]) => [
        type,
        {
          seatShare: seats === 0 ? 0 : Math.round((1000 * w.seats) / seats) / 1000,
          shotsPerGame: games.length === 0 ? 0 : Math.round((100 * w.shots) / games.length) / 100,
          hitsPerGame: games.length === 0 ? 0 : Math.round((100 * w.hits) / games.length) / 100,
          blockedPerGame:
            games.length === 0 ? 0 : Math.round((100 * w.blocked) / games.length) / 100,
          hullDamagePerGame:
            games.length === 0 ? 0 : Math.round((100 * w.hull) / games.length) / 100,
        },
      ])
    ),
  };
}

function aggregateUnfolding(games: PerGameStats[]): UnfoldingAggregate {
  const n = games.length;
  const perGame = (sum: number) => (n === 0 ? 0 : Math.round((100 * sum) / n) / 100);
  const ratio = (a: number, b: number) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 1000);
  const sum = (f: (u: GameUnfolding) => number) => games.reduce((s, g) => s + f(g.unfolding), 0);

  const pastRound10 = games.filter((g) => g.winnerId !== undefined && g.rounds > LEAD_CHECK_ROUND);
  const fromBehind = pastRound10.filter((g) => g.unfolding.leaderAtRound10 !== g.winnerId);
  const wrecks = sum((u) => u.wrecksLeft);
  const sales = sum((u) => u.dockSales);

  return {
    leadChangesPerGame: perGame(sum((u) => u.leadChanges)),
    gamesPastRound10: pastRound10.length,
    wonFromBehindShare: ratio(fromBehind.length, pastRound10.length),
    firstScoreRound: distribution(
      games.flatMap((g) =>
        g.unfolding.firstScoreRound === null ? [] : [g.unfolding.firstScoreRound]
      )
    ),
    escortMarksPerGame: perGame(sum((u) => u.escortMarks)),
    escortsPaidPerGame: perGame(sum((u) => u.escortsPaid)),
    escortsReleasedPerGame: perGame(sum((u) => u.escortsCarrierDied + u.escortsEscortDied)),
    escortsCarrierDiedPerGame: perGame(sum((u) => u.escortsCarrierDied)),
    escortsEscortDiedPerGame: perGame(sum((u) => u.escortsEscortDied)),
    escortMissedSalesPerGame: perGame(sum((u) => u.escortMissedSales)),
    markToCompletionRounds: distribution(games.flatMap((g) => g.unfolding.markToCompletionRounds)),
    wrecksPerGame: perGame(wrecks),
    salvagedShare: ratio(
      sum((u) => u.wrecksSalvaged),
      wrecks
    ),
    seizuresPerGame: {
      crate: perGame(sum((u) => u.seizuresByKind.crate)),
      data: perGame(sum((u) => u.seizuresByKind.data)),
    },
    dockSalesPerGame: perGame(sales),
    dockSalesNamedShare: ratio(
      sum((u) => u.dockSalesNamed),
      sales
    ),
    fuelPumpsPerGame: perGame(sum((u) => u.fuelPumps)),
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
