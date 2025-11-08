import { Box, Paper, Typography, Stack, Chip } from '@mui/material'
import type { Player, TurnLogEntry } from '../types/game'

interface StatusDisplayProps {
  players: Player[]
  activePlayerIndex: number
  turnLog: TurnLogEntry[]
}

export function StatusDisplay({ players, activePlayerIndex, turnLog }: StatusDisplayProps) {
  return (
    <Box>
      {/* Players Status */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Players Status
        </Typography>
        <Stack spacing={2}>
          {players.map((player, index) => {
            const isActive = index === activePlayerIndex
            return (
              <Paper
                key={player.id}
                sx={{
                  p: 2,
                  bgcolor: isActive ? `${player.color}20` : 'background.paper',
                  border: isActive ? `2px solid ${player.color}` : 'none',
                }}
                variant={isActive ? 'elevation' : 'outlined'}
                elevation={isActive ? 3 : 0}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: player.color,
                      mr: 1,
                    }}
                  />
                  <Typography variant="subtitle1" fontWeight="bold">
                    {player.name}
                  </Typography>
                  {isActive && <Chip label="Active" size="small" color="primary" sx={{ ml: 1 }} />}
                </Box>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 1,
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Position
                    </Typography>
                    <Typography variant="body2">
                      Ring {player.ship.ring}, Sector {player.ship.sector}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Facing
                    </Typography>
                    <Typography variant="body2">{player.ship.facing}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Hull Points
                    </Typography>
                    <Typography
                      variant="body2"
                      color={player.ship.hitPoints <= 3 ? 'error.main' : 'inherit'}
                    >
                      {player.ship.hitPoints} / {player.ship.maxHitPoints}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Reactor
                    </Typography>
                    <Typography variant="body2">
                      {player.ship.reactor.availableEnergy} / {player.ship.reactor.totalCapacity}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Reaction Mass
                    </Typography>
                    <Typography variant="body2">{player.ship.reactionMass}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Heat
                    </Typography>
                    <Typography
                      variant="body2"
                      color={player.ship.heat.currentHeat > 0 ? 'error.main' : 'inherit'}
                    >
                      {player.ship.heat.currentHeat}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Status
                    </Typography>
                    <Typography variant="body2">
                      {player.ship.transferState
                        ? `Transfer → R${player.ship.transferState.destinationRing}`
                        : 'Stable'}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            )
          })}
        </Stack>
      </Paper>

      {/* Turn Log */}
      <Paper sx={{ p: 2, maxHeight: 300, overflow: 'auto' }}>
        <Typography variant="h6" gutterBottom>
          Turn Log
        </Typography>
        {turnLog.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No actions yet
          </Typography>
        ) : (
          <Box>
            {turnLog
              .slice()
              .reverse()
              .map((entry, index) => {
                const player = players.find(p => p.id === entry.playerId)
                return (
                  <Box
                    key={`${entry.turn}-${entry.playerId}-${index}`}
                    sx={{
                      mb: 1,
                      pb: 1,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: player?.color,
                          mr: 1,
                        }}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Turn {entry.turn} - {entry.playerName}
                      </Typography>
                    </Box>
                    <Typography variant="body2">
                      <strong>{entry.action}:</strong> {entry.result}
                    </Typography>
                  </Box>
                )
              })}
          </Box>
        )}
      </Paper>
    </Box>
  )
}
