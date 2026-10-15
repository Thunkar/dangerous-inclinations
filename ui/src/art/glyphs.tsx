/**
 * The subsystems' icons, in one place.
 *
 * The marks are the stencils in `subsystemArt.ts`, each drawn from the module
 * the yard builds, so a subsystem is the same mark on the board, in the
 * loadout, on the printed cards and on the printed pieces.
 *
 * An icon carries no colour of its own. Whatever encloses it decides, so the
 * same railgun is bone white on the board and black on the card.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { SUBSYSTEM_PATHS } from './subsystemArt'

/**
 * One subsystem's icon. It carries the subsystem's name unless told
 * otherwise; `title={null}` makes it decorative, for an icon inside something
 * that already names it (a tooltip, whose own label a native SVG title would
 * only duplicate).
 */
export function TileIcon({
  type,
  size,
  color,
  opacity,
  title,
  className,
}: {
  type: SubsystemType
  size: number
  /** Only where the enclosing text colour is not what is wanted. */
  color?: string
  opacity?: number
  /** Screen-reader name; `null` for a decorative icon. */
  title?: string | null
  /** For a parent that styles its icon by class (a MUI Chip clones one in). */
  className?: string
}) {
  const name = title === null ? undefined : (title ?? getSubsystemConfig(type).name)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      role={name ? 'img' : undefined}
      aria-hidden={name ? undefined : true}
      focusable="false"
      className={className}
      style={{ color, opacity, display: 'block', flexShrink: 0 }}
    >
      {name && <title>{name}</title>}
      <path fillRule="evenodd" d={SUBSYSTEM_PATHS[type]} />
    </svg>
  )
}
