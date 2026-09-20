/**
 * The table, in three columns.
 *
 *   left   · the rivals' loadouts stacked one above the other, with the turn log
 *            and table talk sharing whatever is left
 *   middle · the board, the full height of the window
 *   right  · your cards, then your turn: status first, then the reactor, the
 *            move, the guns, the sequence, and the button that ends it
 *
 * Perspective is always the logged-in player: the active player is
 * highlighted, never impersonated.
 *
 * A spectator (a replay watched from nobody's seat, or a table you have no
 * ship at) gets the same table without the right column: there is no plan to
 * build, so nothing here reaches for one. When the seat is yours but the game
 * is only being watched, your status and cards move to the left column.
 */
import { Box, Chip, Tooltip, Typography } from '@mui/material'
import FastForwardIcon from '@mui/icons-material/FastForward'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { useGame } from '../../context/GameContext'
import { usePlanOptional } from '../../context/PlanContext'
import { getPlayerColor } from '../../utils/playerColors'
import { useAnimation } from '../../context/AnimationContext'
import { FONT_MONO, TABLE } from '../../theme'
import { FoldHeader, useCollapsed } from '../common/Panel'
import { GameBoard } from '../board/GameBoard'
import { BoardModeToggle } from '../board/BoardModeToggle'
import { OpponentCard } from './OpponentCard'
import { ActionPanel } from './ActionPanel'
import { EventLog } from './EventLog'
import { MyMissions } from './MyMissions'
import { RulesButton } from './RulesDialog'
import { StatusBlock } from './StatusBlock'
import { TableTalk } from './TableTalk'
import { DiceTray } from './DiceTray'
import { TurnTransport } from './TurnTransport'

/** The rivals' column: narrow enough that the board keeps the middle. */
const LEFT_WIDTH = 252
/** Your own column: the loadout sets the floor at 252 + the plate's padding. */
const RIGHT_WIDTH = 348

export function TableScreen({
  headerRight,
  footer,
}: {
  headerRight?: React.ReactNode
  footer?: React.ReactNode
}) {
  const { view, isAnimating, readOnly } = useGame()
  const { pulses, skip } = useAnimation()
  const plan = usePlanOptional()

  const meIndex = view.players.findIndex(p => p.isMe)
  const myColor = getPlayerColor(meIndex)
  const opponents = view.players.filter(p => !p.isMe)
  const rivalsFolded = useCollapsed('rivals', false)
  const seated = view.me !== null && plan !== null
  /** Read-only tables have no turn to build, so the right column goes away. */
  const playing = seated && !readOnly

  const loadoutPick = plan?.picking && plan.picking.kind !== 'destination' ? plan.picking : null
  const picking = loadoutPick ? loadoutPick.kind : null
  const activeStep = loadoutPick ? plan?.steps.find(s => s.id === loadoutPick.stepId) : undefined
  const selectedSlotId =
    activeStep?.kind === 'fire'
      ? activeStep.criticalTarget
      : activeStep?.kind === 'scan'
        ? activeStep.peekSlot
        : null
  const targetedId =
    activeStep && (activeStep.kind === 'fire' || activeStep.kind === 'scan')
      ? activeStep.targetId
      : null

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 1.5,
          py: 0.4,
          flexShrink: 0,
          minWidth: 0,
          borderBottom: `1px solid ${TABLE.line}`,
          background: `linear-gradient(180deg, ${TABLE.feltLight} 0%, rgba(0,0,0,0) 100%)`,
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontWeight: 600,
            fontSize: '0.88rem',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: TABLE.ink,
            flexShrink: 0,
          }}
          noWrap
        >
          Dangerous Inclinations
        </Typography>
        <Chip
          size="small"
          label={`Turn ${view.turn}`}
          sx={{
            bgcolor: 'transparent',
            border: `1px solid ${TABLE.plateEdge}`,
            color: TABLE.inkSoft,
            flexShrink: 0,
          }}
        />
        {view.finalRound && view.phase === 'active' && (
          <Tooltip title={`Someone reached ${view.pointsToWin} points. The round is played out, then highest score wins (hull breaks ties).`}>
            <Chip
              size="small"
              label="FINAL ROUND"
              sx={{
                bgcolor: TABLE.accent,
                color: '#1a1206',
                fontWeight: 700,
                letterSpacing: '0.06em',
                flexShrink: 0,
                boxShadow: `0 0 12px ${TABLE.accentGlow}`,
              }}
            />
          </Tooltip>
        )}
        <Chip
          size="small"
          label={`${view.players.find(p => p.id === view.activePlayerId)?.name ?? 'Nobody'} to act`}
          sx={{
            bgcolor: 'transparent',
            border: `1px solid ${getPlayerColor(view.activePlayerIndex)}`,
            color: getPlayerColor(view.activePlayerIndex),
            boxShadow: `0 0 10px ${getPlayerColor(view.activePlayerIndex)}55`,
            flexShrink: 0,
          }}
        />
        {readOnly && (
          <Tooltip
            title={
              view.me
                ? 'Nothing here can be played.'
                : 'Everything shown here is public information.'
            }
          >
            <Chip
              size="small"
              icon={<VisibilityIcon sx={{ fontSize: 15 }} />}
              label={view.me ? `Watching · ${view.me.name}'s seat` : 'Watching'}
              sx={{
                bgcolor: 'transparent',
                border: `1px solid ${TABLE.plateEdge}`,
                color: TABLE.inkSoft,
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
        {isAnimating && (
          <Tooltip title="Skip to the end of this turn">
            <Chip
              size="small"
              icon={<FastForwardIcon sx={{ fontSize: 15 }} />}
              label="skip"
              onClick={skip}
              sx={{
                bgcolor: 'transparent',
                border: `1px solid ${TABLE.accent}`,
                color: TABLE.accent,
                flexShrink: 0,
              }}
            />
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        <BoardModeToggle />
        <RulesButton />
        {headerRight}
      </Box>

      <Box sx={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, gap: 0.75, p: 0.75 }}>
        {/* Across the table: the rivals, your cards, the score pad */}
        <Box
          sx={{
            width: LEFT_WIDTH,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            minHeight: 0,
            minWidth: 0,
          }}
        >
          {/*
            The loadouts keep their own height; the log and the chat split what is
            left. On a short window that leaves both pads too small to read, so
            every section here folds by its label and remembers it: fold the
            rivals you are not watching and the pads take the height back.
          */}
          <FoldHeader
            label="Rivals"
            summary={`${opponents.length}`}
            collapsed={rivalsFolded.collapsed}
            onToggle={rivalsFolded.toggle}
          />
          <Box
            sx={{
              flex: '0 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: rivalsFolded.collapsed ? 'none' : 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            {/* Watching from a seat: your own tracks have no turn column to sit in. */}
            {seated && !playing && <StatusBlock accent={myColor} />}
            {seated && !playing && view.me && <MyMissions me={view.me} />}
            {opponents.map(player => (
              <OpponentCard
                key={player.id}
                player={player}
                color={getPlayerColor(view.players.findIndex(p => p.id === player.id))}
                picking={picking}
                onPickSlot={plan?.pickSlot}
                onPickPlayer={plan?.pickTarget}
                selectedSlotId={targetedId === player.id ? selectedSlotId : null}
                isTargeted={targetedId === player.id}
                pulses={pulses}
              />
            ))}
          </Box>
          <EventLog />
          <TableTalk />
        </Box>

        {/* The board, the full height of the table */}
        <Box sx={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0 }}>
          <GameBoard />
          <DiceTray />
        </Box>

        {/* Your turn */}
        {playing && (
          <Box
            sx={{
              width: RIGHT_WIDTH,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            {view.me && <MyMissions me={view.me} />}
            <ActionPanel />
          </Box>
        )}
      </Box>

      <TurnTransport />
      {footer}
    </Box>
  )
}
