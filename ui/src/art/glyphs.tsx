/**
 * The icons, in one place.
 *
 * The artwork is the PNG set in `public/assets/icons`, traced into vector by
 * `scripts/trace-icons.py` (see `paths.ts`). It is drawn from the vector
 * rather than the bitmap for two reasons: a bitmap flattened by a CSS filter
 * can be made white but not black, and the printed card needs black ink; and
 * a 400px bitmap at 6mm is not what you want on paper.
 *
 * An icon carries no colour of its own. Whatever encloses it decides, so the
 * same railgun is bone white on the board and black on the card.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import type { IconName } from './icons'
import { SUBSYSTEM_ICON } from './icons'
import { TRACED_PATHS } from './paths'

interface IconProps {
  size: number
  /** Only where the enclosing text colour is not what is wanted. */
  color?: string
  opacity?: number
  /** Screen-reader name. Without one the icon is decorative and hidden. */
  title?: string
}

export function Icon({ name, size, color, opacity, title }: IconProps & { name: IconName }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={{ color, opacity, display: 'block', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      <path d={TRACED_PATHS[name]} />
    </svg>
  )
}

/**
 * One tile's icon, named by the engine's type rather than by the artwork. It
 * carries the tile's name unless told otherwise; `title={null}` makes it
 * decorative, for an icon inside something that already names it (a tooltip,
 * whose own label a native SVG title would only duplicate).
 */
export function TileIcon({
  type,
  title,
  ...rest
}: Omit<IconProps, 'title'> & { type: SubsystemType; title?: string | null }) {
  return (
    <Icon
      name={SUBSYSTEM_ICON[type]}
      title={title === null ? undefined : (title ?? getSubsystemConfig(type).name)}
      {...rest}
    />
  )
}
