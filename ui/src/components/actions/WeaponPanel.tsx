import { Box, Typography, IconButton, Tooltip } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import type { SubsystemType, Player } from '@dangerous-inclinations/engine'
import { CustomIcon } from '../CustomIcon'

// Available subsystem types that can be targeted by critical hits
export const TARGETABLE_SUBSYSTEMS: { type: SubsystemType; label: string }[] = [
  { type: 'shields', label: 'Shields' },
  { type: 'engines', label: 'Engines' },
  { type: 'rotation', label: 'Thrusters' },
  { type: 'laser', label: 'Laser' },
  { type: 'railgun', label: 'Railgun' },
  { type: 'missiles', label: 'Missiles' },
  { type: 'scoop', label: 'Fuel Scoop' },
]

export interface FiringSolution {
  targetPlayer: Player
  inRange: boolean
}

interface WeaponPanelProps {
  title: string
  icon: 'laser' | 'railgun' | 'missiles'
  targetPlayerId?: string
  criticalTarget?: SubsystemType
  inRangeTargets: FiringSolution[]
  onTargetChange: (targetPlayerId: string) => void
  onCriticalTargetChange: (subsystemType: SubsystemType) => void
  showRangeToggle?: boolean
  rangeVisible?: boolean
  onToggleRange?: () => void
  extraInfo?: React.ReactNode
}

export function WeaponPanel({
  title,
  icon,
  targetPlayerId,
  criticalTarget = 'shields',
  inRangeTargets,
  onTargetChange,
  onCriticalTargetChange,
  showRangeToggle = false,
  rangeVisible = false,
  onToggleRange,
  extraInfo,
}: WeaponPanelProps) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: '8px',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CustomIcon icon={icon} size={20} />
          <Typography variant="body2" fontWeight="bold">
            {title}
          </Typography>
          {extraInfo}
        </Box>
        {showRangeToggle && onToggleRange && (
          <Tooltip title={rangeVisible ? 'Hide Range' : 'Show Range'}>
            <IconButton
              size="small"
              onClick={onToggleRange}
              sx={{
                padding: '4px',
                color: rangeVisible ? 'primary.main' : 'text.secondary',
              }}
            >
              {rangeVisible ? (
                <Visibility sx={{ fontSize: 16 }} />
              ) : (
                <VisibilityOff sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {/* Target Selection */}
      <select
        value={targetPlayerId || ''}
        onChange={e => onTargetChange(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 10px',
          borderRadius: '4px',
          border: targetPlayerId
            ? '2px solid rgba(76, 175, 80, 0.5)'
            : '2px solid rgba(244, 67, 54, 0.5)',
          backgroundColor: 'rgba(0,0,0,0.3)',
          color: 'white',
          fontSize: '0.875rem',
        }}
      >
        <option value="" style={{ backgroundColor: '#1a1a1a' }}>
          Select Target ({inRangeTargets.length} in range)
        </option>
        {inRangeTargets.map(solution => (
          <option
            key={solution.targetPlayer.id}
            value={solution.targetPlayer.id}
            style={{ backgroundColor: '#1a1a1a' }}
          >
            {solution.targetPlayer.name} (HP: {solution.targetPlayer.ship.hitPoints}/
            {solution.targetPlayer.ship.maxHitPoints})
          </option>
        ))}
      </select>

      {/* Critical Target Selector */}
      <Box sx={{ mt: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 0.5 }}
        >
          Critical Target (if roll = 10)
        </Typography>
        <select
          value={criticalTarget}
          onChange={e => onCriticalTargetChange(e.target.value as SubsystemType)}
          style={{
            width: '100%',
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid rgba(255,255,255,0.2)',
            backgroundColor: 'rgba(0,0,0,0.3)',
            color: 'white',
            fontSize: '0.75rem',
          }}
        >
          {TARGETABLE_SUBSYSTEMS.map(sub => (
            <option
              key={sub.type}
              value={sub.type}
              style={{ backgroundColor: '#1a1a1a' }}
            >
              {sub.label}
            </option>
          ))}
        </select>
      </Box>
    </Box>
  )
}
