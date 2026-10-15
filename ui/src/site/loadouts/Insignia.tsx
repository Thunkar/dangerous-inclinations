/**
 * A preset's insignia: its role's badge in the family ink, and its signature
 * subsystem's mark in ink inside. The badge says the role before the name is
 * read (a shield for a hunter, a diamond for an interceptor, a clipped
 * octagon for a hauler), and the mark which of the role's four ships it is.
 */
import type { BotRole, SubsystemType } from '@dangerous-inclinations/engine'
import { PRESS } from '../../design/press'
import { SUBSYSTEM_PATHS } from '../../art/subsystemArt'

/** Each badge on a 64x64 box, and where and how large the mark sits in it. */
const BADGE: Record<BotRole, { d: string; scale: number; cx: number; cy: number }> = {
  hunter: { d: 'M32 1L62 21V63H2V21Z', scale: 0.6, cx: 32, cy: 39 },
  interceptor: { d: 'M32 0L64 32L32 64L0 32Z', scale: 0.5, cx: 32, cy: 32 },
  /** A 62-square at (1, 1) with its corners clipped 14 in. */
  hauler: { d: 'M15 1L49 1L63 15L63 49L49 63L15 63L1 49L1 15Z', scale: 0.64, cx: 32, cy: 32 },
}

export function Insignia({
  role,
  mark,
  ink,
  className,
}: {
  role: BotRole
  mark: SubsystemType
  ink: string
  className?: string
}) {
  const badge = BADGE[role]
  const x = badge.cx - 32 * badge.scale
  const y = badge.cy - 32 * badge.scale
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={badge.d} fill={ink} />
      <path
        d={SUBSYSTEM_PATHS[mark]}
        fillRule="evenodd"
        fill={PRESS.ink}
        transform={`translate(${x} ${y}) scale(${badge.scale})`}
      />
    </svg>
  )
}
