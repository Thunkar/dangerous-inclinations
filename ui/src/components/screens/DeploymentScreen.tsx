/**
 * Deployment: in reverse turn order (last seat first), place your ship on Black Hole Ring 4. Everyone
 * starts on the same ring; the sector you pick becomes your Home — where you
 * come back after you are destroyed — so pick it with the cards you kept in
 * mind.
 */
import { useState } from 'react'
import { Alert, Box, Chip, Typography } from '@mui/material'
import type { Position } from '@dangerous-inclinations/engine'
import { HOME_RING, getWellName } from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { GameBoard } from '../board/GameBoard'
import { BoardModeToggle } from '../board/BoardModeToggle'
import { Panel, SectionLabel } from '../common/Panel'
import { MissionCard } from '../common/MissionCard'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../theme'
import { TableTalk } from '../table/TableTalk'
import { Centered, Header } from './ScreenChrome'

export function DeploymentScreen({ headerRight }: { headerRight?: React.ReactNode }) {
  const { view, nameOf, deploy } = useGame()
  const [error, setError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)

  const me = view.me
  const myTurn = view.activePlayerId === me?.id && !me?.hasDeployed
  const active = view.players.find(p => p.id === view.activePlayerId)

  if (!me) return <Centered>Watching the table — no ship to place.</Centered>

  const onDeploy = async (position: Position) => {
    if (!myTurn || placing) return
    setPlacing(true)
    setError(null)
    try {
      await deploy(position.sector)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPlacing(false)
    }
  }

  const deployed = view.players.filter(p => p.hasDeployed).length

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        title="Place your ship"
        subtitle={`${deployed} of ${view.players.length} placed · Black Hole Ring ${HOME_RING}`}
        right={
          <>
            <BoardModeToggle />
            {headerRight}
          </>
        }
      />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <GameBoard onDeploy={onDeploy} deploymentEnabled={myTurn && !placing} />
        </Box>
        <Box
          sx={{
            width: 330,
            flexShrink: 0,
            p: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            overflow: 'auto',
          }}
        >
          <Panel title="Turn order · last seat places first" dense>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {view.players.map((player, index) => (
                <Box key={player.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: getPlayerColor(index),
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    sx={{
                      fontWeight: player.isMe ? 800 : 500,
                      color: TABLE.ink,
                      fontSize: '0.88rem',
                    }}
                  >
                    {player.name}
                    {player.isMe ? ' (you)' : ''}
                  </Typography>
                  <Box sx={{ flex: 1 }} />
                  {player.hasDeployed && player.home ? (
                    <Chip
                      size="small"
                      label={`${getWellName(player.home.wellId)} R${player.home.ring} S${player.home.sector}`}
                      sx={{ fontSize: '0.78rem', height: 20 }}
                    />
                  ) : player.id === view.activePlayerId ? (
                    <Typography variant="overline" sx={{ color: TABLE.brick, lineHeight: 1 }}>
                      placing
                    </Typography>
                  ) : (
                    <Typography variant="overline" sx={{ color: TABLE.inkSoft, lineHeight: 1 }}>
                      waiting
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Panel>

          <Panel title="Your missions" dense>
            <SectionLabel>They should decide which sector Home goes in.</SectionLabel>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
              {me.missions.map(mission => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  nameOf={nameOf}
                  cargo={me.cargo}
                  held
                />
              ))}
            </Box>
          </Panel>

          {error && <Alert severity="error">{error}</Alert>}
          {!myTurn && (
            <Alert severity="info">
              {me.hasDeployed
                ? 'Your ship is placed. Waiting for the others.'
                : `Waiting for ${active?.name ?? 'the next player'} to place.`}
            </Alert>
          )}
          {myTurn && (
            <Alert severity="success">
              Place your ship on Black Hole Ring {HOME_RING} — that sector becomes your Home.
            </Alert>
          )}

          {/* The table is already talking while the ships go down. */}
          <TableTalk sx={{ flex: '1 0 auto', minHeight: 220 }} />
        </Box>
      </Box>
    </Box>
  )
}
