import { Box, Typography, styled } from '@mui/material'
import type { Player } from '../../types/game'
import type { Subsystem } from '../../types/subsystems'
import { WeaponCard } from './WeaponCard'

interface WeaponPanelProps {
  laserSubsystem: Subsystem | undefined
  railgunSubsystem: Subsystem | undefined
  missilesSubsystem: Subsystem | undefined
  currentPlayer: Player
  allPlayers: Player[]
  selectedTargets: {
    laser: string
    railgun: string
    missiles: string
  }
  onTargetSelect: (weaponType: 'laser' | 'railgun' | 'missiles', targetId: string) => void
  showRanges: {
    laser: boolean
    railgun: boolean
    missiles: boolean
  }
  onRangeToggle: (weaponType: 'laser' | 'railgun' | 'missiles') => void
}

const Container = styled(Box)(({ theme }) => ({
  padding: '12px',
  borderRadius: '8px',
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}))

export function WeaponPanel({
  laserSubsystem,
  railgunSubsystem,
  missilesSubsystem,
  currentPlayer,
  allPlayers,
  selectedTargets,
  onTargetSelect,
  showRanges,
  onRangeToggle,
}: WeaponPanelProps) {
  return (
    <Container>
      <Typography variant="body2" fontWeight="bold" gutterBottom>
        Weapons
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <WeaponCard
          subsystem={laserSubsystem}
          currentPlayer={currentPlayer}
          allPlayers={allPlayers}
          selectedTarget={selectedTargets.laser}
          onTargetSelect={targetId => onTargetSelect('laser', targetId)}
          showRange={showRanges.laser}
          onRangeToggle={() => onRangeToggle('laser')}
        />

        <WeaponCard
          subsystem={railgunSubsystem}
          currentPlayer={currentPlayer}
          allPlayers={allPlayers}
          selectedTarget={selectedTargets.railgun}
          onTargetSelect={targetId => onTargetSelect('railgun', targetId)}
          showRange={showRanges.railgun}
          onRangeToggle={() => onRangeToggle('railgun')}
        />

        <WeaponCard
          subsystem={missilesSubsystem}
          currentPlayer={currentPlayer}
          allPlayers={allPlayers}
          selectedTarget={selectedTargets.missiles}
          onTargetSelect={targetId => onTargetSelect('missiles', targetId)}
          showRange={showRanges.missiles}
          onRangeToggle={() => onRangeToggle('missiles')}
        />
      </Box>
    </Container>
  )
}
