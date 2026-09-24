/**
 * One subsystem glyph, rendered the same way everywhere: the icon set's own
 * artwork, traced to vector (`art/glyphs.tsx`), which the printed card draws
 * from too. Nothing tints the mark; a tile's category shows as an edge or a
 * badge, never as the glyph's fill. It is decorative (no title, hidden from
 * screen readers): the tooltip or label around it names the tile, and a native
 * SVG title inside a tooltip is only a second tooltip.
 */
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { TileIcon } from '../../art/glyphs'
import { TABLE } from '../../theme'

export function SubsystemIcon({
  type,
  size,
  opacity = 0.92,
  color = TABLE.ink,
  className,
}: {
  type: SubsystemType
  size: number
  opacity?: number
  color?: string
  className?: string
}) {
  return (
    <TileIcon
      type={type}
      size={size}
      color={color}
      opacity={opacity}
      title={null}
      className={className}
    />
  )
}
