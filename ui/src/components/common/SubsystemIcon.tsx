/**
 * One subsystem glyph, rendered the same way everywhere: the source artwork
 * flattened to a light silhouette. Nothing else is allowed to tint it.
 */
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { ICON_FILTER, SUBSYSTEM_ICONS } from '../../utils/icons'

export function SubsystemIcon({
  type,
  size,
  opacity = 0.92,
}: {
  type: SubsystemType
  size: number
  opacity?: number
}) {
  return (
    <Box
      component="img"
      src={SUBSYSTEM_ICONS[type]}
      alt={getSubsystemConfig(type).name}
      draggable={false}
      sx={{ width: size, height: size, objectFit: 'contain', filter: ICON_FILTER, opacity }}
    />
  )
}
