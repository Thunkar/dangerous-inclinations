/**
 * End of game. The winner is whoever the engine says it is; the standings
 * show every player's completed cards, face-up as they were flipped, in the
 * engine's order: points, then hull, then fuel, then the earlier seat.
 */
import { Box, Button, Typography } from '@mui/material'
import { STARTING_HIT_POINTS, fill, rankPlayers } from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { Panel, SectionLabel } from '../common/Panel'
import { MissionCard } from '../common/MissionCard'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../design/tokens'
import { FONT_DISPLAY } from '../../design/press'
import { SCREENS } from '../../text/screens'

const S = SCREENS.gameEnd

export function GameEndScreen({ onLeave }: { onLeave?: () => void }) {
  const { view, nameOf } = useGame()
  const winner = view.players.find(p => p.id === view.winnerId)
  const standings = rankPlayers(view).ranked

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
        {winner ? fill(S.wins, { name: winner.name }) : S.over}
      </Typography>
      <Typography variant="body2" sx={{ color: TABLE.inkSoft }}>
        {winner ? fill(S.score, { points: winner.points, toWin: view.pointsToWin }) : S.noWinner}
      </Typography>

      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 1100,
        }}
      >
        {standings.map(player => {
          const index = view.players.findIndex(p => p.id === player.id)
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
                  {player.isMe ? S.you : ''}
                </Typography>
              }
            >
              <SectionLabel>
                {fill(S.standing, {
                  points: player.points,
                  toWin: view.pointsToWin,
                  hull: player.ship?.hitPoints ?? 0,
                  maxHull: player.ship?.maxHitPoints ?? STARTING_HIT_POINTS,
                })}
              </SectionLabel>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                {player.completedMissions.map(mission => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    nameOf={nameOf}
                    faceUpToTable
                    compact
                  />
                ))}
                {player.completedMissions.length === 0 && (
                  <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
                    {S.nothing}
                  </Typography>
                )}
              </Box>
            </Panel>
          )
        })}
      </Box>

      {onLeave && (
        <Button variant="contained" size="large" onClick={onLeave} sx={{ mt: 1 }}>
          {S.back}
        </Button>
      )}
    </Box>
  )
}
