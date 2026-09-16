/**
 * Which hull just took something.
 *
 * No event says "flinch": the flat board's mark for a hit is a number floating
 * over a hull, and that mark now names its subject, so this is where the two
 * halves meet. `Effects` posts every anchored float and burst here as it
 * appears and `Ships` samples it once a frame per hull — a hull reaction
 * therefore costs no new field on `BoardModel`, no new event, and nothing that
 * crosses React.
 *
 * The subject is a player, never a sector. Two ships can stand in one sector,
 * and a shot can push its target out of the sector its own numbers are
 * anchored to; either would flinch the wrong hull.
 */
export type ImpactKind = 'damage' | 'crit' | 'heat' | 'shield' | 'good'

/** A flinch, not a state: shorter than the float that caused it. */
const IMPACT_MS = 440

/** How hard a hull takes each kind, and what colour it flashes. */
const REACTION: Record<ImpactKind, { color: string; shake: number; flash: number }> = {
  damage: { color: '#ff5a72', shake: 1, flash: 0.95 },
  crit: { color: '#fff2d6', shake: 1.35, flash: 1.2 },
  heat: { color: '#ff7a45', shake: 0.3, flash: 0.75 },
  shield: { color: '#49c3ff', shake: 0.35, flash: 0.85 },
  good: { color: '#46d191', shake: 0, flash: 0.6 },
}

interface Impact {
  playerId: string
  kind: ImpactKind
  start: number
}

/** Short and pruned on every post: a turn never has more than a few at once. */
const impacts: Impact[] = []

export function reportImpact(playerId: string, kind: ImpactKind, start = performance.now()) {
  for (let i = impacts.length - 1; i >= 0; i--) {
    if (start - impacts[i].start > IMPACT_MS) impacts.splice(i, 1)
  }
  impacts.push({ playerId, kind, start })
}

/** Dropped when the board unmounts, so a new table starts unbruised. */
export function clearImpacts() {
  impacts.length = 0
}

export interface HullReaction {
  /** 0 when nothing is happening, 1 for a solid hit, more for a critical. */
  shake: number
  flash: number
  color: string
}

/**
 * Reused between calls: a sample is read and applied inside one `useFrame`,
 * and the alternative is four throwaway objects every frame.
 */
const sample: HullReaction = { shake: 0, flash: 0, color: '#ffffff' }

/** A sharp attack and a long decay — the shape of a hit, not of a fade. */
function envelope(u: number): number {
  if (u < 0 || u > 1) return 0
  return u < 0.1 ? u / 0.1 : (1 - u) / 0.9
}

/** The strongest live reaction on one ship. Valid until the next call. */
export function sampleImpact(playerId: string, now: number): HullReaction {
  sample.shake = 0
  sample.flash = 0
  for (const impact of impacts) {
    if (impact.playerId !== playerId) continue
    const strength = envelope((now - impact.start) / IMPACT_MS)
    if (strength <= 0) continue
    const reaction = REACTION[impact.kind]
    const flash = reaction.flash * strength
    if (flash <= sample.flash) continue
    sample.flash = flash
    sample.shake = reaction.shake * strength
    sample.color = reaction.color
  }
  return sample
}
