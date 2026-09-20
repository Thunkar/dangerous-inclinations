/**
 * What the turn log draws, with no React in it: which lines are about you, and
 * how the bots' cube shuffling folds down. Pure so it can be checked against a
 * real game's events. The board keeps its model out of the renderer for the
 * same reason (`components/board/model.ts`).
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

/**
 * Cube shuffling is a third of the log and none of it is news: a round of four
 * seats routinely spends eight lines saying who moved energy where, between
 * the lines that say what happened. One line per player per turn instead,
 * unless it is your own loadout, where the cubes are the decision you just made.
 */
export interface Line {
  event: GameEvent
  /** Energy moves this line stands for. 1 is an ordinary line. */
  folded: number
  /** Net cubes routed out to tiles across the run, for the summary. */
  net: number
}

export function foldEnergy(events: GameEvent[], mine: string | undefined): Line[] {
  const out: Line[] = []
  for (const event of events) {
    const isEnergy = event.type === 'energy_allocated' || event.type === 'energy_deallocated'
    const delta =
      event.type === 'energy_allocated'
        ? event.amount
        : event.type === 'energy_deallocated'
          ? -event.amount
          : 0
    if (!isEnergy || event.playerId === mine) {
      out.push({ event, folded: 1, net: 0 })
      continue
    }
    const last = out[out.length - 1]
    const sameRun =
      last !== undefined &&
      (last.event.type === 'energy_allocated' || last.event.type === 'energy_deallocated') &&
      'playerId' in last.event &&
      last.event.playerId === event.playerId &&
      last.event.turn === event.turn
    if (sameRun) {
      last.folded += 1
      last.net += delta
    } else {
      out.push({ event, folded: 1, net: delta })
    }
  }
  return out
}

