/**
 * Scans. A scan needs a powered, unused sensor array and a target on the
 * bot's ring within SCAN_SECTOR_RANGE sectors. It acquires the transmission
 * for an Intercept mission on that target and reveals one of their
 * face-down tiles to the bot.
 */
import type { Position } from "../../models/game.ts";
import { isQuietTurn } from "../../models/game.ts";
import type { Subsystem, SubsystemId } from "../../models/subsystems.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";
import { SCAN_SECTOR_RANGE } from "../../models/missions.ts";
import { sectorDistance } from "../../game/geometry.ts";
import type { BotParameters, Opponent, TacticalSituation } from "../types.ts";
import type { FiringPhase } from "./combat.ts";

export interface ScanIntent {
  sensor: Subsystem;
  targetId: string;
  peekSlot: SubsystemId;
  phase: FiringPhase;
  heat: number;
  energy: number;
  /** The scan acquires an Intercept transmission. */
  forMission: boolean;
}

export function canScanFrom(from: Position, target: Position): boolean {
  return (
    from.wellId === target.wellId &&
    from.ring === target.ring &&
    sectorDistance(from.sector, target.sector) <= SCAN_SECTOR_RANGE
  );
}

/**
 * Slot to look at: the face-down tile whose energy cubes make it the most
 * interesting (a powered slot is doing something), else any face-down one,
 * else the first slot: a scan of a known tile is legal and still acquires
 * an Intercept transmission.
 */
export function choosePeekSlot(target: Opponent): SubsystemId {
  const ranked = [...target.unknownSlots].sort(
    (a, b) =>
      b.slot.allocatedEnergy - a.slot.allocatedEnergy ||
      (b.suspected?.damage ?? 0) - (a.suspected?.damage ?? 0)
  );
  return ranked[0]?.slot.id ?? target.player.slots[0]?.id ?? "forward-0";
}

/**
 * The best scan available this turn, or null. Mission scans come first,
 * then (if the parameters allow) peeking at an adjacent unknown ship.
 */
export function scanOption(
  situation: TacticalSituation,
  pre: Position,
  post: Position,
  parameters: BotParameters
): ScanIntent | null {
  // A quiet turn reaches nobody, a scan included: the engine would refuse it.
  // The opening round is one (RULES §A Turn) and so is the bot's own turn back
  // from Home (RULES §Destruction and Respawn).
  if (isQuietTurn(situation.view.turn, situation.me)) return null;
  const sensor = situation.status.sensors.find((s) => !s.isBroken && !s.usedThisTurn);
  if (!sensor) return null;
  const energy = getSubsystemConfig("sensor_array").minEnergy;

  const interceptTargets = new Set(
    situation.me.missions.flatMap((m) =>
      m.type === "intercept_transmission" && !m.isCompleted && !m.scanAcquired
        ? [m.targetPlayerId]
        : []
    )
  );

  let best: ScanIntent | null = null;
  for (const opponent of situation.opponents) {
    if (!opponent.sameWell) continue;
    // Untouchable until their returning turn is over: the engine refuses the
    // scan (RULES §Destruction and Respawn).
    if (opponent.recovering) continue;
    const phase: FiringPhase | null = canScanFrom(post, opponent.position)
      ? "post"
      : canScanFrom(pre, opponent.position)
        ? "pre"
        : null;
    if (!phase) continue;
    const forMission = interceptTargets.has(opponent.player.id);
    if (!forMission && (!parameters.scanUnknowns || opponent.unknownSlots.length === 0)) continue;
    const intent: ScanIntent = {
      sensor,
      targetId: opponent.player.id,
      peekSlot: choosePeekSlot(opponent),
      phase,
      heat: energy,
      energy,
      forMission,
    };
    if (!best || (intent.forMission && !best.forMission)) best = intent;
  }
  return best;
}
