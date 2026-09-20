/**
 * A fixed system printed on every loadout: engines, thrusters, fuel scoop. It
 * cannot be changed, so it sits in its rail dimmed and unlit.
 */
import { Box, Tooltip } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { SubsystemIcon } from '../common/SubsystemIcon'
import { TABLE } from '../../theme'

export function FixedSubsystemSlot({ subsystemType, size = 40 }: { subsystemType: SubsystemType; size?: number }) {
  const config = getSubsystemConfig(subsystemType)
  return (
    <Tooltip title={`${config.name} — fixed, always aboard`}>
      <Box
        sx={{
          width: size,
          height: size,
          borderRadius: '4px',
          border: `1px dashed ${TABLE.plateEdge}`,
          bgcolor: 'rgba(126,165,205,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <SubsystemIcon type={subsystemType} size={size * 0.55} opacity={0.5} />
      </Box>
    </Tooltip>
  )
}
