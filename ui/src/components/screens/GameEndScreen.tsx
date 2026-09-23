/**
 * End of game. The winner is whoever the engine says it is; the standings
 * show every player's completed cards, face-up as they were flipped.
 */
import { Box, Button, Typography } from '@mui/material'
import { useGame } from '../../context/GameContext'
import { Panel, SectionLabel } from '../common/Panel'
import { MissionCard } from '../common/MissionCard'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'

export function GameEndScreen({ onLeave }: { onLeave?: () => void }) {
  const { view, nameOf } = useGame()
  const winner = view.players.find((p) => p.id === view.winnerId)
  const standings = [...view.players].sort((a, b) => b.completedMissionCount - a.completedMissionCount)

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 3,
      }}
    >
      <Typography variant="h3" sx={{ color: TABLE.ink }}>
        {winner ? `${winner.name} wins` : 'The game is over'}
      </Typography>
      <Typography variant="body2" sx={{ color: TABLE.inkSoft }}>
        {winner
          ? `${winner.completedMissionCount} of ${view.pointsToWin} points.`
          : 'No winner was declared.'}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1100 }}>
        {standings.map((player) => {
          const index = view.players.findIndex((p) => p.id === player.id)
          return (
            <Panel
              key={player.id}
              accent={getPlayerColor(index)}
              sx={{ width: 300 }}
              title={
                <Typography
                  sx={{
                    fontFamily: FONT_DISPLAY,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    fontWeight: 600,
                    color: TABLE.ink,
                  }}
                >
                  {player.name}
                  {player.isMe ? ' (you)' : ''}
                  {player.id === view.winnerId ? ' 🏆' : ''}
                </Typography>
              }
            >
              <SectionLabel>
                {player.completedMissionCount} / {view.pointsToWin} points · hull{' '}
                {player.ship?.hitPoints ?? 0}/{player.ship?.maxHitPoints ?? 10}
              </SectionLabel>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                {player.completedMissions.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} nameOf={nameOf} faceUpToTable compact />
                ))}
                {player.completedMissions.length === 0 && (
                  <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
                    Nothing completed.
                  </Typography>
                )}
              </Box>
            </Panel>
          )
        })}
      </Box>

      {onLeave && (
        <Button variant="contained" size="large" onClick={onLeave} sx={{ mt: 1 }}>
          Back to the lobby
        </Button>
      )}
    </Box>
  )
}
