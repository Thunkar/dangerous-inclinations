/**
 * Your turn, in the order a turn is actually played: read the ship, point
 * it, move it, then decide what its systems do.
 *
 *   status          · hull, heat, fuel, ammo, where you are: always on screen
 *   Loadout         · a readout, not a control: the energy the turn puts on
 *                     each subsystem (every cube is heat at the check)
 *   1. Orientation  · which way the nose points
 *   2. Move         · coast, burn or jump; exactly one per turn
 *      Route planner · its own plate under the move row: a navigation aid
 *                      that proposes a move, never one that commits it
 *   3. Systems      · fire a weapon, power a shield, a rack or a sensor, scan
 *   4. The sequence you have built, in the order it will happen
 *   End turn        · pinned to the bottom
 *
 * Only the middle scrolls: the status block is pinned to the top and the
 * button that ends the turn to the bottom, so neither is ever more than a
 * glance away. Everything previewed here (costs, heat, range) comes from the
 * engine; the server is the referee.
 */
import { Alert, Box, Button, Divider, Tooltip, Typography } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { fill } from '@dangerous-inclinations/engine'
import { usePlan } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { SectionLabel } from '../common/Panel'
import { TABLE } from '../../design/tokens'
import { ACTIONS } from '../../text/actions'
import { RoutePlanner } from './RoutePlanner'
import { SequenceList } from './SequenceList'
import { ShipEnergyLoadout } from './ShipEnergyLoadout'
import { SystemsControls } from './SystemsControls'
import { DockSaleControl } from './actions/DockSaleControl'
import { MarkControl } from './actions/MarkControl'
import { MoveControls } from './actions/MoveControls'
import { OrientationControls } from './actions/OrientationControls'
import { RepairControl } from './actions/RepairControl'
import { SalvageControl } from './actions/SalvageControl'
import { SeizeControl } from './actions/SeizeControl'
import { StandingLoadout } from './actions/StandingLoadout'
import { Step } from './actions/parts'
import { SurveyControl } from './actions/SurveyControl'
import { TurnShell } from './actions/TurnShell'

const T = ACTIONS.panel

export function ActionPanel() {
  const { view, submitTurn, isAnimating, turnErrors, clearTurnErrors, readOnly } = useGame()
  const plan = usePlan()
  const me = plan.me

  const destroyed = me.ship.hitPoints <= 0
  const waiting = !plan.isMyTurn
  /**
   * A turn you hold but cannot play. Only the respawn turn is one of those:
   * the turn after it is yours to fly, untouchable and in command, and quiet
   * only in that no weapon of yours fires and you scan nobody (RULES
   * §Destruction and Respawn).
   */
  const sittingOut = destroyed && !waiting && !readOnly && view.phase !== 'ended'

  const winner = view.players.find(p => p.id === view.winnerId)?.name
  const active = view.players.find(p => p.id === view.activePlayerId)

  // Whatever state the table is in, your own tracks stay at the top of the
  // column: hull, heat and fuel are never something to go looking for.
  if (view.phase === 'ended' || readOnly || waiting || destroyed || isAnimating) {
    const title =
      view.phase === 'ended'
        ? T.title.ended
        : readOnly
          ? T.title.watching
          : sittingOut
            ? T.title.yours
            : T.title.table
    return (
      <TurnShell title={title} slab={sittingOut}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pt: 0.75 }}>
          <StandingLoadout />
          <Typography variant="body2" sx={{ color: TABLE.inkSoft }}>
            {view.phase === 'ended'
              ? winner
                ? fill(T.winner, { winner })
                : T.ended
              : readOnly
                ? T.watching
                : sittingOut
                  ? T.sittingOut
                  : isAnimating
                    ? T.animating
                    : fill(T.waiting, { name: active?.name ?? T.nextPlayer })}
          </Typography>
        </Box>
        {sittingOut && (
          <Box sx={{ flexShrink: 0, pt: 0.75 }}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              endIcon={<SendIcon />}
              disabled={isAnimating}
              onClick={() => submitTurn([])}
            >
              {T.continue}
            </Button>
          </Box>
        )}
      </TurnShell>
    )
  }

  const blocked = plan.issues.length > 0

  return (
    <TurnShell
      title={T.title.yours}
      slab
      action={
        <Tooltip title={T.resetTip}>
          <Button
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={plan.reset}
            sx={{
              minWidth: 0,
              py: 0,
              color: TABLE.onAccent,
              '&:hover': { bgcolor: TABLE.shade },
            }}
          >
            {T.reset}
          </Button>
        </Tooltip>
      }
    >
      {/* Everything you decide, in turn order */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          pr: 0.5,
        }}
      >
        {turnErrors.length > 0 && (
          <Alert severity="error" onClose={clearTurnErrors} sx={{ py: 0 }}>
            {turnErrors.join(T.errorsJoin)}
          </Alert>
        )}

        {/* What the turn puts on the loadout: read here, set by the steps below. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <SectionLabel sx={{ lineHeight: 1.35 }}>{T.loadout}</SectionLabel>
          <ShipEnergyLoadout subsystems={plan.pendingSubsystems} planned />
        </Box>

        <Divider />
        <Step n={1} label={T.steps.orientation}>
          <OrientationControls />
        </Step>

        <Divider />
        <Step n={2} label={T.steps.move}>
          <MoveControls />
        </Step>
        {/* Not a fourth move: an instrument that proposes one. Its own plate. */}
        <RoutePlanner />

        <Divider />
        <Step n={3} label={T.steps.systems}>
          <SystemsControls />
        </Step>

        <RepairControl />
        <DockSaleControl />
        <SeizeControl />
        <SurveyControl />
        <SalvageControl />
        <MarkControl />

        <Divider />
        <Step n={4} label={T.steps.sequence}>
          <SequenceList />
        </Step>
      </Box>

      {/* Pinned: what still stands in the way, and the only way out of the turn */}
      <Box
        sx={{
          flexShrink: 0,
          pt: 0.75,
          mt: 0.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          borderTop: `1px solid ${TABLE.line}`,
        }}
      >
        {blocked && (
          <Tooltip
            title={
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {plan.issues.map(issue => (
                  <li key={issue}>
                    <Typography variant="caption">{issue}</Typography>
                  </li>
                ))}
              </Box>
            }
          >
            <Typography
              variant="caption"
              sx={{ color: TABLE.heat, lineHeight: 1.3, cursor: 'help' }}
              noWrap
            >
              {plan.issues[0]}
              {plan.issues.length > 1 ? fill(T.moreIssues, { count: plan.issues.length - 1 }) : ''}
            </Typography>
          </Tooltip>
        )}

        <Button
          fullWidth
          variant="contained"
          endIcon={<SendIcon />}
          disabled={plan.disabled || blocked}
          onClick={() => submitTurn(plan.actions)}
        >
          {T.endTurn}
        </Button>
      </Box>
    </TurnShell>
  )
}
