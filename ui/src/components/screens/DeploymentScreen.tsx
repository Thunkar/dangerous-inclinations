/**
 * Deployment: in reverse turn order (last seat first), place your ship on Black
 * Hole Ring 3 or Ring 4, at least three sectors from every ship already
 * placed. The position you pick becomes your Home — where you come back after
 * you are destroyed — so pick it with the cards you kept in mind: Ring 4
 * drifts 2 a turn and lines up with the lanes, Ring 3 drifts 4 and brings the
 * ring past you.
 *
 * The legal cells are the engine's own answer (`legalDeploymentsAgainst`), so
 * neither the board nor the sector strip can offer one the server would
 * refuse.
 */
import { useMemo, useState } from 'react'
import { Alert, Box, Chip, Tooltip, Typography } from '@mui/material'
import type { Position } from '@dangerous-inclinations/engine'
import {
  BLACKHOLE_RINGS,
  DEPLOYMENT_GAP,
  HOME_RING,
  HOME_RINGS,
  HOME_WELL_ID,
  SECTORS_PER_RING,
  getWellName,
  legalDeploymentsAgainst,
  placedShipPositions,
} from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { GameBoard } from '../board/GameBoard'
import { BoardModeToggle } from '../board/BoardModeToggle'
import { Panel, SectionLabel } from '../common/Panel'
import { MissionHand } from '../common/MissionHand'
import { getPlayerColor } from '../../utils/playerColors'
import { FONT_MONO, TABLE } from '../../theme'
import { TableTalk } from '../table/TableTalk'
import { Centered, Header } from './ScreenChrome'

/** What a ring does to a ship sitting on it, straight from the ring table. */
function driftOf(ring: number): number {
  return BLACKHOLE_RINGS.find(r => r.ring === ring)?.velocity ?? 0
}

export function DeploymentScreen({ headerRight }: { headerRight?: React.ReactNode }) {
  const { view, nameOf, deploy } = useGame()
  const [error, setError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [ring, setRing] = useState<number>(HOME_RING)

  const me = view.me
  const myTurn = view.activePlayerId === me?.id && !me?.hasDeployed
  const active = view.players.find(p => p.id === view.activePlayerId)
  // The rule, asked of the engine once and read by both the board and the strip.
  const legal = useMemo(() => legalDeploymentsAgainst(placedShipPositions(view)), [view])
  const legalHere = useMemo(
    () => new Set(legal.filter(p => p.ring === ring).map(p => p.sector)),
    [legal, ring]
  )

  if (!me) return <Centered>Watching the table — no ship to place.</Centered>

  const onDeploy = async (position: Position) => {
    if (!myTurn || placing) return
    setPlacing(true)
    setError(null)
    try {
      await deploy(position.sector, position.ring)
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
        subtitle={`${deployed} of ${view.players.length} placed · Black Hole Ring ${HOME_RINGS.join(' or ')}, ${DEPLOYMENT_GAP}+ sectors from every ship already placed`}
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
          <Panel title="Ring and sector" dense sx={{ flexShrink: 0 }}>
            <SectionLabel>
              Black Hole Ring {HOME_RINGS.join(' or ')}, at least {DEPLOYMENT_GAP} sectors from
              every ship already placed — that position becomes your Home.
            </SectionLabel>
            <Box sx={{ display: 'flex', gap: 0.75, mt: 0.75 }}>
              {HOME_RINGS.map(r => (
                <Chip
                  key={r}
                  size="small"
                  label={`Ring ${r} · drifts ${driftOf(r)}`}
                  onClick={() => setRing(r)}
                  aria-pressed={r === ring}
                  sx={{
                    fontSize: '0.78rem',
                    bgcolor: r === ring ? TABLE.accent : 'transparent',
                    color: r === ring ? TABLE.plate : TABLE.inkSoft,
                    border: `1px solid ${r === ring ? TABLE.accent : TABLE.plateEdge}`,
                    // The pointer sits on the chip that was just clicked; MUI's
                    // hover colour would take the chosen ring's fill away.
                    '&:hover': { bgcolor: r === ring ? TABLE.accent : 'transparent' },
                  }}
                />
              ))}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: 0.5,
                mt: 1,
              }}
            >
              {Array.from({ length: SECTORS_PER_RING }, (_, sector) => sector).map(sector => {
                const open = legalHere.has(sector)
                const cell = (
                  <Box
                    onClick={
                      open && myTurn
                        ? () => onDeploy({ wellId: HOME_WELL_ID, ring, sector })
                        : undefined
                    }
                    role={open && myTurn ? 'button' : undefined}
                    aria-disabled={!open}
                    sx={{
                      py: 0.25,
                      textAlign: 'center',
                      fontFamily: FONT_MONO,
                      fontSize: '0.74rem',
                      color: open ? TABLE.ink : TABLE.inkFaint,
                      border: `1px solid ${open ? TABLE.plateEdge : 'transparent'}`,
                      bgcolor: open ? 'transparent' : 'rgba(255,255,255,0.03)',
                      opacity: open ? 1 : 0.5,
                      cursor: open && myTurn ? 'pointer' : 'not-allowed',
                      '&:hover': open && myTurn ? { borderColor: TABLE.accent } : undefined,
                    }}
                  >
                    {sector}
                  </Box>
                )
                return open ? (
                  <Box key={sector}>{cell}</Box>
                ) : (
                  <Tooltip key={sector} title={`within ${DEPLOYMENT_GAP} sectors of a placed ship`}>
                    <Box>{cell}</Box>
                  </Tooltip>
                )
              })}
            </Box>
          </Panel>

          <Panel title="Turn order · last seat places first" dense sx={{ flexShrink: 0 }}>
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

          {/* The hand is one card tall and no shorter: a column that squeezed
              it would cut the cards off again. */}
          <Panel title="Your missions" dense sx={{ flexShrink: 0 }}>
            <SectionLabel>They should decide which ring and sector Home goes in.</SectionLabel>
            {/* The same hand you will hold at the table: one card tall, no
                column of cards to scroll past the board. */}
            <Box sx={{ mt: 0.5 }}>
              <MissionHand missions={me.missions} cargo={me.cargo} nameOf={nameOf} />
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
              Place your ship on Black Hole Ring {HOME_RINGS.join(' or ')}, at least{' '}
              {DEPLOYMENT_GAP} sectors from every ship already placed — that position becomes your
              Home.
            </Alert>
          )}

          {/* The table is already talking while the ships go down. */}
          <TableTalk sx={{ flex: '1 0 auto', minHeight: 220 }} />
        </Box>
      </Box>
    </Box>
  )
}
