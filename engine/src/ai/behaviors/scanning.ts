/**
 * Scans. A scan needs an unbroken sensor array that has done nothing else
 * this turn (the scan powers it) and a target on the bot's ring within
 * SCAN_SECTOR_RANGE sectors. It acquires the transmission for an Intercept
 * mission on that target and reveals one of their face-down subsystems to the
 * bot.
 */
import type { Position } from "../../models/game.ts";
import { isQuietTurn } from "../../models/game.ts";
import type { Subsystem, SubsystemId } from "../../models/subsystems.ts";
import { getSubsystemConfig } from "../../models/subsystems.ts";
import { inScanRange } from "../../game/scan.ts";
import type { BotParameters, Opponent, TacticalSituation } from "../types.ts";
import type { FiringPhase } from "./combat.ts";
import { interceptTargetIds } from "./missions.ts";

export interface ScanIntent {
  sensor: Subsystem;
  targetId: string;
  peekSlot: SubsystemId;
  phase: FiringPhase;
  /** The sensor's cubes, and so the scan's heat. */
  heat: number;
  /** The scan acquires an Intercept transmission. */
  forMission: boolean;
}

/**
 * Slot to look at: a **dark** face-down subsystem first, and the bow before a side.
 *
 * The cubes read a loaded slot most of the way already (a face-down slot with
 * cubes was powered, so it is a wall, a rack or a sensor), so paying a scan
 * for one buys the last quarter of an answer. A dark slot is where every
 * unfired gun on the board sits, and a dark bow is the widest unknown there
 * is: a railgun, a launcher, a compressor or a sensor that is not powered. Failing that, any face-down
 * one, else the first slot, since a scan of a known subsystem is still legal and
 * still acquires an Intercept transmission.
 */
export function choosePeekSlot(target: Opponent): SubsystemId {
  const ranked = [...target.unknownSlots].sort(
    (a, b) =>
      a.slot.allocatedEnergy - b.slot.allocatedEnergy ||
      Number(b.slot.group === "forward") - Number(a.slot.group === "forward") ||
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
  const heat = getSubsystemConfig("sensor_array").minEnergy;

  const interceptTargets = interceptTargetIds(situation.me);

  let best: ScanIntent | null = null;
  for (const opponent of situation.opponents) {
    if (!opponent.sameWell) continue;
    // Untouchable until their returning turn is over: the engine refuses the
    // scan (RULES §Destruction and Respawn).
    if (opponent.recovering) continue;
    const phase: FiringPhase | null = inScanRange(post, opponent.position)
      ? "post"
      : inScanRange(pre, opponent.position)
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
      heat,
      forMission,
    };
    if (!best || (intent.forMission && !best.forMission)) best = intent;
  }
  return best;
}
