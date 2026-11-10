/**
 * Why an action is refused, as data: a stable code (a key of
 * `text/refusals.ts`) and the values its words are filled with. The referee
 * (game/validators.ts) returns these and turns them into its errors; the walk
 * of a planned turn (game/walk.ts) returns them for the table and the agents
 * to say in their own place. Codes are compared, never the words.
 */
import type { SubsystemId, SubsystemType } from '../models/subsystems.ts'
import { getSubsystemConfig } from '../models/subsystems.ts'
import { REFUSALS } from '../text/refusals.ts'
import { fill, type SlotValue } from '../utils/fill.ts'

export type RefusalCode = Exclude<keyof typeof REFUSALS, 'words'>

export interface Refusal {
  code: RefusalCode
  /** The values the reason's words are filled with. */
  slots: Record<string, SlotValue>
  /** The subsystem a `{slot}` names, so a caller can name it its own way. */
  subsystem?: { id: SubsystemId; type: SubsystemType }
}

/** A refusal at one action of a turn (its index in the list given), or of the turn as a whole (null). */
export interface StepRefusal extends Refusal {
  step: number | null
}

export function refusal(code: RefusalCode, slots: Record<string, SlotValue> = {}): Refusal {
  return { code, slots }
}

/** A refusal about one subsystem: `{slot}` is its name unless the caller names it. */
export function subsystemRefusal(
  code: RefusalCode,
  subsystem: { id: SubsystemId; type: SubsystemType },
  slots: Record<string, SlotValue> = {}
): Refusal {
  return {
    code,
    slots: { slot: getSubsystemConfig(subsystem.type).name, ...slots },
    subsystem: { id: subsystem.id, type: subsystem.type },
  }
}

/** The word for a burn's direction, prograde or retrograde. */
export const directionWord = (facing: 'prograde' | 'retrograde'): string =>
  facing === 'prograde' ? REFUSALS.words.outward : REFUSALS.words.inward

/**
 * The reason in words. `slotName` names a subsystem the way the caller does
 * (the table says which slot); left out, it is the subsystem's own name.
 */
export function refusalText(
  r: Refusal,
  slotName?: (subsystem: { id: SubsystemId; type: SubsystemType }) => string
): string {
  const slots = r.subsystem && slotName ? { ...r.slots, slot: slotName(r.subsystem) } : r.slots
  return fill(REFUSALS[r.code] as string, slots)
}
