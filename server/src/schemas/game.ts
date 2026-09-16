import { z } from "zod";
import {
  SECTORS_PER_RING,
  SUBSYSTEM_CONFIGS,
  type PlayerAction,
  type SubsystemType,
} from "@dangerous-inclinations/engine";

const subsystemTypes = Object.keys(SUBSYSTEM_CONFIGS) as [SubsystemType, ...SubsystemType[]];
const Slot = z.enum(subsystemTypes).nullable();

export const ShipLoadoutSchema = z
  .object({
    forwardSlots: z.tuple([Slot]),
    sideSlots: z.tuple([Slot, Slot, Slot, Slot]),
  })
  .strict();

export const LoadoutSubmissionSchema = z
  .object({
    loadout: ShipLoadoutSchema,
    // The engine checks the count against MISSIONS_PER_PLAYER, that the ids
    // were actually offered, and that the mat can complete every card kept
    // (Intercept and Survey need a sensor array); this only bounds the payload.
    missionIds: z.array(z.string().min(1)).min(1).max(16),
  })
  .strict();

export const DeploySchema = z
  .object({
    /** Ignored: deployment is always on the black hole's home ring. Kept so older clients don't 400. */
    wellId: z.string().optional(),
    sector: z
      .number()
      .int()
      .finite()
      .min(0)
      .max(SECTORS_PER_RING - 1),
  })
  .strict();

export const RewindSchema = z
  .object({
    /** -1 = the initial (post-deployment) state. */
    turnIndex: z.number().int().finite().min(-1),
  })
  .strict();

export const ForkSchema = z
  .object({
    recordingId: z.string().min(1),
    turnIndex: z.number().int().finite().min(-1),
    impersonateOriginalPlayerId: z.string().min(1).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Wire shape of every action a client may submit during the active phase. The
 * engine still validates the semantics (range, energy, whose turn it is), but
 * anything that is not exactly one of these shapes is rejected before it gets
 * there: a malformed action must fail the whole submission, never silently
 * turn into a coast.
 *
 * `deploy_ship` is deliberately absent — deployment goes through
 * `POST /api/games/:gameId/deploy`, not SUBMIT_TURN.
 */
const id = z.string().min(1);
const int = z.number().int().finite();
const base = {
  playerId: id,
  /** Tactical actions execute in sequence order; clients number them from 1. */
  sequence: z.number().int().finite().positive().optional(),
};

const CoastActionSchema = z
  .object({
    ...base,
    type: z.literal("coast"),
    data: z.object({ activateScoop: z.boolean() }).strict(),
  })
  .strict();

const BurnActionSchema = z
  .object({
    ...base,
    type: z.literal("burn"),
    data: z
      .object({
        burnIntensity: z.enum(["soft", "medium", "hard"]),
        sectorAdjustment: int,
      })
      .strict(),
  })
  .strict();

const RotateActionSchema = z
  .object({
    ...base,
    type: z.literal("rotate"),
    data: z.object({ targetFacing: z.enum(["prograde", "retrograde"]) }).strict(),
  })
  .strict();

const AllocateEnergyActionSchema = z
  .object({
    ...base,
    type: z.literal("allocate_energy"),
    data: z.object({ subsystemId: id, amount: int }).strict(),
  })
  .strict();

const DeallocateEnergyActionSchema = z
  .object({
    ...base,
    type: z.literal("deallocate_energy"),
    data: z.object({ subsystemId: id, amount: int }).strict(),
  })
  .strict();

const FireWeaponActionSchema = z
  .object({
    ...base,
    type: z.literal("fire_weapon"),
    data: z
      .object({
        subsystemId: id,
        targetPlayerId: id,
        criticalTarget: id,
        compensateRecoil: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

const ScanActionSchema = z
  .object({
    ...base,
    type: z.literal("scan"),
    data: z.object({ targetPlayerId: id, peekSlot: id }).strict(),
  })
  .strict();

const WellTransferActionSchema = z
  .object({
    ...base,
    type: z.literal("well_transfer"),
    /** Phasing is optional: an older client that omits it lands on the matching sector. */
    data: z.object({ destinationWellId: id, sectorAdjustment: int.optional() }).strict(),
  })
  .strict();

export const PlayerActionSchema = z.discriminatedUnion("type", [
  CoastActionSchema,
  BurnActionSchema,
  RotateActionSchema,
  AllocateEnergyActionSchema,
  DeallocateEnergyActionSchema,
  FireWeaponActionSchema,
  ScanActionSchema,
  WellTransferActionSchema,
]);

export const SubmitTurnSchema = z
  .object({
    type: z.literal("SUBMIT_TURN"),
    payload: z
      .object({
        actions: z.array(PlayerActionSchema).max(64),
        turn: z.number().int().finite().positive(),
        activePlayerId: id,
      })
      .strict(),
  })
  .strict();

/** Compile-time proof the wire shapes stay a subset of the engine's actions. */
export type SubmittedAction = z.infer<typeof PlayerActionSchema>;
const _actionsAreEngineActions: (a: SubmittedAction) => PlayerAction = (a) => a;
void _actionsAreEngineActions;

export type LoadoutSubmissionInput = z.infer<typeof LoadoutSubmissionSchema>;
export type DeployInput = z.infer<typeof DeploySchema>;

/** Table talk: a line of chat, or a player's reasoning (`think`). */
export const ChatSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
    kind: z.enum(["say", "think"]).default("say"),
  })
  .strict();

/** Dry run of a turn's actions against the live state. */
export const PreviewSchema = z
  .object({
    actions: z.array(PlayerActionSchema),
  })
  .strict();
