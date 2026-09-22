/**
 * What the turn log draws, with no React in it: whose line each one is and
 * whether it is about you. Pure so it can be checked against a real game's
 * events. The board keeps its model out of the renderer for the same reason
 * (`components/board/model.ts`).
 *
 * It used to fold the bots' cube shuffling down to a line a turn, because
 * allocations were a third of the log and none of it was news. Nobody
 * allocates now: a tile is powered by the action that uses it, and the only
 * energy line left is somebody switching a wall, a rack or a sensor on or off,
 * which is worth a line of its own.
 */
import type { GameEvent } from '@dangerous-inclinations/engine'

/** Whose line is this? Used only to colour the bullet. */
export function actorOf(event: GameEvent): string | undefined {
  if ('playerId' in event) return event.playerId
  if ('attackerId' in event) return event.attackerId
  if ('ownerId' in event) return event.ownerId
  if ('scannerId' in event) return event.scannerId
  // A seizure is the pirate's line, not the victim's.
  if ('pirateId' in event) return event.pirateId
  if ('victimId' in event) return event.victimId
  if ('winnerId' in event) return event.winnerId
  return undefined
}

/**
 * Every id a line names, not just the one that acted. A shot at you is the
 * attacker's line by `actorOf`, so it used to be coloured and weighted like
 * the rest of their housekeeping, which is how a laser that took two hull off
 * a freshly respawned ship read as nothing at all.
 */
const SUBJECT_KEYS = [
  'playerId',
  'attackerId',
  'targetId',
  'ownerId',
  'scannerId',
  'pirateId',
  'victimId',
  'killerId',
  'by',
  'winnerId',
] as const

export function concerns(event: GameEvent, playerId: string | undefined): boolean {
  if (!playerId) return false
  const e = event as unknown as Record<string, unknown>
  return SUBJECT_KEYS.some(k => e[k] === playerId)
}
