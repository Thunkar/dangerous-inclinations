import { useState } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Collapse,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
} from '@mui/material'
import {
  ChevronLeft,
  ChevronRight,
  ExpandMore,
  Psychology,
  Speed,
  Shield,
  TrackChanges,
  BatteryChargingFull,
} from '@mui/icons-material'
import { useGame } from '../context/GameContext'
import type { TurnHistoryEntry, PlayerAction } from '@dangerous-inclinations/engine'

interface TurnHistoryPanelProps {
  defaultExpanded?: boolean
}

export function TurnHistoryPanel({ defaultExpanded = true }: TurnHistoryPanelProps) {
  const { turnHistory, gameState } = useGame()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Box
      sx={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Collapsible panel */}
      <Collapse in={isExpanded} orientation="horizontal" timeout={300}>
        <Box
          sx={{
            width: 350,
            height: '100%',
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              borderBottom: 1,
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="h6">Turn History</Typography>
            <Chip label={`Turn ${gameState.turn}`} color="primary" size="small" />
          </Box>

          {/* Turn history list */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {turnHistory.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                No turns yet
              </Typography>
            ) : (
              turnHistory
                .slice()
                .reverse()
                .map((entry, index) => (
                  <TurnHistoryItem key={`${entry.turn}-${entry.playerId}-${index}`} entry={entry} />
                ))
            )}
          </Box>
        </Box>
      </Collapse>

      {/* Toggle button */}
      <Box
        sx={{
          position: 'absolute',
          left: isExpanded ? 350 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          transition: 'left 0.3s ease',
          zIndex: 1,
        }}
      >
        <IconButton
          onClick={() => setIsExpanded(!isExpanded)}
          sx={{
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            '&:hover': {
              bgcolor: 'action.hover',
            },
          }}
          size="small"
        >
          {isExpanded ? <ChevronLeft /> : <ChevronRight />}
        </IconButton>
      </Box>
    </Box>
  )
}

interface TurnHistoryItemProps {
  entry: TurnHistoryEntry
}

function TurnHistoryItem({ entry }: TurnHistoryItemProps) {
  const isBot = !!entry.botDecision
  const playerColor = entry.playerId === 'player1' ? '#2196f3' : '#4caf50'

  return (
    <Accordion
      sx={{
        mb: 1,
        '&:before': { display: 'none' },
        bgcolor: 'background.default',
      }}
      defaultExpanded={false}
    >
      <AccordionSummary expandIcon={<ExpandMore />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Typography
            variant="caption"
            sx={{
              bgcolor: 'primary.dark',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              minWidth: 40,
              textAlign: 'center',
            }}
          >
            T{entry.turn}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: playerColor,
              flex: 1,
            }}
          >
            {entry.playerName}
          </Typography>
          {isBot && <Psychology sx={{ fontSize: 18, color: 'secondary.main' }} />}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {isBot ? <BotTurnDetails entry={entry} /> : <PlayerTurnDetails entry={entry} />}
      </AccordionDetails>
    </Accordion>
  )
}

function PlayerTurnDetails({ entry }: { entry: TurnHistoryEntry }) {
  const actionSummary = entry.actions.map((action, idx) => (
    <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5, pl: 1 }}>
      • {formatAction(action)}
    </Typography>
  ))

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
        Actions:
      </Typography>
      {actionSummary.length > 0 ? (
        actionSummary
      ) : (
        <Typography variant="caption" color="text.secondary">
          No actions
        </Typography>
      )}
    </Box>
  )
}

function BotTurnDetails({ entry }: { entry: TurnHistoryEntry }) {
  const botDecision = entry.botDecision!

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Situation Summary */}
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          Situation
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" display="block">
            ❤️ {botDecision.situation.health}
          </Typography>
          <Typography variant="caption" display="block">
            🔥 {botDecision.situation.heat}
          </Typography>
          <Typography variant="caption" display="block">
            ⚡ {botDecision.situation.energy}
          </Typography>
          <Typography variant="caption" display="block">
            📍 {botDecision.situation.position}
          </Typography>
          <Typography variant="caption" display="block">
            🎯 Targets: {botDecision.situation.targetCount} | ⚠️ Threats:{' '}
            {botDecision.situation.threatCount}
          </Typography>
        </Box>
      </Paper>

      {/* Threats */}
      {botDecision.threats.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
            ⚠️ Threats
          </Typography>
          {botDecision.threats.map((threat: string, idx: number) => (
            <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5, pl: 1 }}>
              • {threat}
            </Typography>
          ))}
        </Paper>
      )}

      {/* Targets */}
      {botDecision.targets.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
            🎯 Targets
          </Typography>
          {botDecision.targets.map((target: string, idx: number) => (
            <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5, pl: 1 }}>
              • {target}
            </Typography>
          ))}
        </Paper>
      )}

      {/* Reasoning */}
      {botDecision.reasoning.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
          <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
            🧠 Reasoning
          </Typography>
          {botDecision.reasoning.map((reason: string, idx: number) => (
            <Typography key={idx} variant="caption" display="block" sx={{ mb: 0.5, pl: 1 }}>
              • {reason}
            </Typography>
          ))}
        </Paper>
      )}

      {/* Strategy Candidates */}
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.paper' }}>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          Strategy Evaluation
        </Typography>
        {botDecision.candidates.map((candidate: any, idx: number) => (
          <Box key={idx} sx={{ mb: 1 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 0.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight:
                    candidate.description === botDecision.selectedCandidate.description ? 600 : 400,
                  color:
                    candidate.description === botDecision.selectedCandidate.description
                      ? 'secondary.main'
                      : 'text.primary',
                }}
              >
                {candidate.description}
              </Typography>
              <Chip
                label={candidate.totalScore.toFixed(1)}
                size="small"
                color={
                  candidate.description === botDecision.selectedCandidate.description
                    ? 'secondary'
                    : 'default'
                }
                sx={{ height: 20, fontSize: '0.65rem' }}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, pl: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Speed sx={{ fontSize: 12 }} />
                <Typography variant="caption" fontSize="0.65rem">
                  Off: {candidate.scores.offense}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Shield sx={{ fontSize: 12 }} />
                <Typography variant="caption" fontSize="0.65rem">
                  Def: {candidate.scores.defense}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TrackChanges sx={{ fontSize: 12 }} />
                <Typography variant="caption" fontSize="0.65rem">
                  Pos: {candidate.scores.positioning}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <BatteryChargingFull sx={{ fontSize: 12 }} />
                <Typography variant="caption" fontSize="0.65rem">
                  Res: {candidate.scores.resources}
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
      </Paper>

      {/* Selected Actions */}
      <Paper
        variant="outlined"
        sx={{ p: 1.5, bgcolor: 'secondary.dark', borderColor: 'secondary.main' }}
      >
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, mb: 1, display: 'block', color: 'secondary.light' }}
        >
          ✓ Selected Strategy: {botDecision.selectedCandidate.description}
        </Typography>
        <Divider sx={{ mb: 1, borderColor: 'secondary.main' }} />
        {botDecision.selectedCandidate.actionSummary.map((action: string, idx: number) => (
          <Typography
            key={idx}
            variant="caption"
            display="block"
            sx={{ mb: 0.5, pl: 1, color: 'text.primary' }}
          >
            • {action}
          </Typography>
        ))}
      </Paper>
    </Box>
  )
}

function formatAction(action: PlayerAction): string {
  switch (action.type) {
    case 'allocate_energy':
      return `Allocate ${action.data.amount} energy to ${action.data.subsystemType}`
    case 'deallocate_energy':
      return `Deallocate ${action.data.amount} energy from ${action.data.subsystemType}`
    case 'rotate':
      return `Rotate to ${action.data.targetFacing}`
    case 'burn':
      return `Burn ${action.data.burnIntensity} (${action.data.sectorAdjustment >= 0 ? '+' : ''}${action.data.sectorAdjustment} sectors)`
    case 'coast':
      return `Coast${action.data.activateScoop ? ' with scoop' : ''}`
    case 'fire_weapon':
      return `Fire ${action.data.weaponType} at ${action.data.targetPlayerIds.join(', ')}`
    case 'well_transfer':
      return `Transfer to ${action.data.destinationWellId}`
    default:
      return 'Unknown action'
  }
}
