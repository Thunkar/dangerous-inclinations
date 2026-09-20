/**
 * Your turn, in the order a turn is actually played: read the ship, route the
 * reactor, then decide what to do with it.
 *
 *   status          — hull, heat, fuel, ammo, where you are: always on screen
 *   1. Ship & energy — cubes on the tiles, and what is left in the reactor
 *   2. Orientation  — which way the nose points
 *   3. Move         — coast, burn or jump; exactly one per turn
 *      Route planner — its own plate under the move row: a navigation aid
 *                      that proposes a move, never one that commits it
 *   4. Weapons & scan
 *   5. The sequence you have built, in the order it will happen
 *   6. End turn
 *
 * Only the middle scrolls: the status block is pinned to the top and the
 * button that ends the turn to the bottom, so neither is ever more than a
 * glance away. Everything previewed here (costs, heat, range) comes from the
 * engine; the server is the referee.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Slider,
  ToggleButton,
  Tooltip,
  Typography,
} from '@mui/material'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import SendIcon from '@mui/icons-material/Send'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SensorsIcon from '@mui/icons-material/Sensors'
import type { ReactNode } from 'react'
import type { BurnIntensity } from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  getSubsystemConfig,
  getWellName,
  hasWorkingCompressor,
  phasedJumpDestination,
  isOpeningRound,
} from '@dangerous-inclinations/engine'
import { usePlan } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { Panel, SectionLabel } from '../common/Panel'
import { FONT_MONO, TABLE } from '../../theme'
import { slotLabel } from '../../utils/slots'
import { RoutePlanner } from './RoutePlanner'
import { SequenceList } from './SequenceList'
import { ShipEnergyLoadout } from './ShipEnergyLoadout'
import { StatusBlock } from './StatusBlock'

const INTENSITIES: BurnIntensity[] = ['soft', 'medium', 'hard']

export function ActionPanel() {
  const { view, submitTurn, isAnimating, turnErrors, clearTurnErrors, readOnly } = useGame()
  const plan = usePlan()
  const me = plan.me

  const destroyed = me.ship.hitPoints <= 0
  const waiting = !plan.isMyTurn
  const disabled = waiting || isAnimating || readOnly
  /**
   * A turn you hold but cannot play. Only the respawn turn is one of those
   * now: the turn after it is played in full, untouchable but in command
   * (RULES §Destruction and Respawn).
   */
  const sittingOut = destroyed && !waiting && !readOnly && view.phase !== 'ended'

  const winner = view.players.find(p => p.id === view.winnerId)?.name
  const active = view.players.find(p => p.id === view.activePlayerId)

  // Whatever state the table is in, your own tracks stay at the top of the
  // column: hull, heat and fuel are never something to go looking for.
  if (view.phase === 'ended' || readOnly || waiting || destroyed) {
    const title =
      view.phase === 'ended'
        ? 'Game over'
        : readOnly
          ? 'Watching'
          : sittingOut
            ? 'Your turn'
            : 'The table'
    return (
      <TurnShell title={title} accent={sittingOut ? TABLE.danger : undefined}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pt: 0.75 }}>
          <Typography variant="body2" sx={{ color: TABLE.inkSoft }}>
            {view.phase === 'ended'
              ? winner
                ? `${winner} wins.`
                : 'The game has ended.'
              : readOnly
                ? 'Nothing here can be played.'
                : sittingOut
                  ? 'Your ship is lost. You return to Home this turn with a full hull and tank and drift; nobody can touch you until your next turn.'
                  : isAnimating
                    ? 'Watching the turn play out…'
                    : `Waiting for ${active?.name ?? 'the next player'} to act.`}
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
              Continue
            </Button>
          </Box>
        )}
      </TurnShell>
    )
  }

  const blocked = plan.issues.length > 0

  return (
    <TurnShell
      title="Your turn"
      accent={TABLE.accent}
      action={
        <Tooltip title="Clear the plan and start again">
          <Button
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={plan.reset}
            sx={{ minWidth: 0 }}
          >
            reset
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
            {turnErrors.join(' · ')}
          </Alert>
        )}

        <Step n={1} label="Ship & energy">
          <ShipEnergyLoadout disabled={disabled} />
        </Step>

        <Divider />
        <Step n={2} label="Orientation">
          <OrientationControls disabled={disabled} />
        </Step>

        <Divider />
        <Step n={3} label="Move — one per turn">
          <MoveControls disabled={disabled} />
        </Step>
        {/* Not a fourth move: an instrument that proposes one. Its own plate. */}
        <RoutePlanner disabled={disabled} />

        <Divider />
        <Step n={4} label="Weapons & scan">
          <WeaponControls disabled={disabled} />
        </Step>

        <RepairControl disabled={disabled} />

        <Divider />
        <Step n={5} label="Sequence">
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
              {plan.issues.length > 1 ? ` · +${plan.issues.length - 1} more` : ''}
            </Typography>
          </Tooltip>
        )}

        <Button
          fullWidth
          variant="contained"
          endIcon={<SendIcon />}
          disabled={disabled || blocked}
          onClick={() => submitTurn(plan.actions)}
        >
          End turn
        </Button>
      </Box>
    </TurnShell>
  )
}

/**
 * The column itself: the plate, your status pinned to the top of it, and
 * whatever the turn needs under that.
 */
function TurnShell({
  title,
  accent,
  action,
  children,
}: {
  title: string
  accent?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Panel
      title={title}
      accent={accent}
      dense
      action={action}
      sx={{ flex: 1, minWidth: 0, minHeight: 0 }}
    >
      <Box
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 0.5 }}
      >
        <StatusBlock accent={accent ?? TABLE.accent} />
        {children}
      </Box>
    </Panel>
  )
}

/**
 * Naming the tile a cold ship's crew will fix. It appears only when the turn as
 * built would end at 0 heat and something is broken, because those are exactly
 * the turns on which it can happen — a control that offered itself and then did
 * nothing would be worse than none.
 */
function RepairControl({ disabled }: { disabled: boolean }) {
  const plan = usePlan()
  const broken = plan.me.ship.subsystems.filter(s => s.isBroken)
  if (broken.length === 0) return null

  const offered = plan.repairable
  return (
    <>
      <Divider />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
        <SectionLabel>Repair — one a turn, and only cold</SectionLabel>
        {offered.length === 0 ? (
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkSoft }}>
            This turn makes heat. A repair needs everything off: a plain coast, no
            scoop, no shot, no scan, shields down.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
            {broken.map(sub => {
              const can = offered.includes(sub.id)
              const on = plan.repairChoice === sub.id
              return (
                <Tooltip
                  key={sub.id}
                  title={`${getSubsystemConfig(sub.type).name} (${sub.id}) — repaired at your heat check`}
                >
                  <Box
                    component="button"
                    type="button"
                    disabled={disabled || !can}
                    onClick={() => plan.setRepairChoice(on ? null : sub.id)}
                    sx={{
                      fontFamily: FONT_MONO,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      px: 0.7,
                      py: '2px',
                      borderRadius: 1,
                      cursor: disabled || !can ? 'default' : 'pointer',
                      color: on ? TABLE.accent : TABLE.inkSoft,
                      border: `1px solid ${on ? TABLE.accent : TABLE.line}`,
                      bgcolor: on ? 'rgba(255,180,69,0.12)' : 'transparent',
                      opacity: can ? 1 : 0.45,
                    }}
                  >
                    {sub.id}
                  </Box>
                </Tooltip>
              )
            })}
          </Box>
        )}
      </Box>
    </>
  )
}

/** One numbered block of the turn, so the column reads top to bottom. */
function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
      <SectionLabel sx={{ lineHeight: 1.35 }}>
        {n}. {label}
      </SectionLabel>
      {children}
    </Box>
  )
}

/**
 * A segment of a segmented control. Each button carries its own tooltip —
 * including the reason it cannot be pressed — so the row itself stays as
 * narrow as the column, whatever the reason is.
 */
function Segment({
  label,
  title,
  selected,
  disabled,
  onClick,
}: {
  label: string
  title: ReactNode
  selected: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip title={title} placement="top">
      <Box component="span" sx={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <ToggleButton
          value={label}
          size="small"
          selected={selected}
          disabled={disabled}
          onClick={onClick}
          sx={{
            flex: 1,
            minWidth: 0,
            py: 0.25,
            px: 0.5,
            fontSize: '0.78rem',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </ToggleButton>
      </Box>
    </Tooltip>
  )
}

function SegmentedRow({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ display: 'flex', gap: 0.5, width: '100%', minWidth: 0 }}>
      {children}
    </Box>
  )
}

function OrientationControls({ disabled }: { disabled: boolean }) {
  const plan = usePlan()
  const rotating = plan.steps.some(s => s.kind === 'rotate')
  const ready = plan.rotateReady
  const facing = plan.me.ship.facing

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Tooltip
        title={
          ready.ok || rotating
            ? 'Flip facing. Needs 1 cube on the thrusters; costs that much heat.'
            : `No rotation: ${ready.reason}.`
        }
      >
        <Box component="span" sx={{ display: 'flex' }}>
          <Chip
            size="small"
            icon={<RotateRightIcon sx={{ fontSize: 15 }} />}
            label={rotating ? 'rotating' : 'rotate'}
            color={rotating ? 'primary' : 'default'}
            variant={rotating ? 'filled' : 'outlined'}
            onClick={plan.toggleRotate}
            // A queued rotation can always be taken back, whatever the loadout says.
            disabled={disabled || (!rotating && !ready.ok)}
          />
        </Box>
      </Tooltip>
      <Typography variant="caption" sx={{ fontFamily: FONT_MONO, color: TABLE.inkSoft }} noWrap>
        {facing}
        {rotating ? ` → ${facing === 'prograde' ? 'retrograde' : 'prograde'}` : ''}
      </Typography>
    </Box>
  )
}

/**
 * Phasing: the sectors a burn or a jump shifts its arrival by, 1 fuel each.
 * The same control for both, because it is the same rule.
 */
function PhaseSlider({
  value,
  range,
  disabled,
  onChange,
}: {
  value: number
  range: { min: number; max: number }
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{ fontFamily: FONT_MONO, color: TABLE.inkFaint, flexShrink: 0 }}
      >
        phase {value > 0 ? '+' : ''}
        {value}
      </Typography>
      <Slider
        size="small"
        value={value}
        min={range.min}
        max={range.max}
        step={1}
        marks
        valueLabelDisplay="auto"
        disabled={disabled || range.min === range.max}
        onChange={(_, next) => onChange(Array.isArray(next) ? next[0] : next)}
        sx={{ mx: 0.5, flex: 1, minWidth: 0 }}
      />
    </Box>
  )
}

function MoveControls({ disabled }: { disabled: boolean }) {
  const plan = usePlan()
  const move = plan.moveStep.move
  const compressor = hasWorkingCompressor({ ...plan.me.ship, subsystems: plan.pendingSubsystems })
  const scoop = plan.pendingSubsystems.find(s => s.id === 'scoop')
  /** Cubes on the scoop: a coast runs it unless told not to. */
  const scoopReady = Boolean(
    scoop && !scoop.isBroken && scoop.allocatedEnergy >= getSubsystemConfig('scoop').minEnergy
  )
  const burnDirection = plan.moveFrom.facing === 'prograde' ? 'outward' : 'inward'
  const jumpFuel =
    move.kind === 'jump'
      ? calculateJumpMassCost(move.adjustment, compressor)
      : 0

  /** What an intensity costs, or what is standing in its way. */
  const burnReason = (intensity: BurnIntensity) => {
    const cost = BURN_COSTS[intensity]
    const ready = plan.burnReady[intensity]
    if (!ready.ok) return `No ${intensity} burn: ${ready.reason}.`
    return `${cost.rings} ring${cost.rings > 1 ? 's' : ''} ${burnDirection} · ${cost.energy} energy on the engines · ${cost.mass} fuel`
  }
  /** The mode button offers a burn when any intensity is available. */
  const anyBurn = INTENSITIES.find(i => plan.burnReady[i].ok)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <SegmentedRow testId="move-modes">
        <Segment
          label="Coast"
          title={
            plan.moored
              ? 'Moored: you hold this berth and ride the station when it advances. Burn to cast off.'
              : 'Ride the ring: you drift its velocity in sectors, and nothing heats up.'
          }
          selected={move.kind === 'coast'}
          disabled={disabled}
          // A powered scoop runs on a coast unless you say otherwise: the
          // cubes on the tile are the decision.
          onClick={() => plan.setMove({ kind: 'coast', scoop: scoopReady })}
        />
        <Segment
          label="Burn"
          title={
            anyBurn
              ? 'Change ring with the engines. Prograde burns outward, retrograde inward.'
              : `No burn: ${plan.burnReady.soft.reason}.`
          }
          selected={move.kind === 'burn'}
          disabled={disabled || !anyBurn}
          onClick={() =>
            anyBurn && plan.setMove({ kind: 'burn', intensity: anyBurn, adjustment: 0 })
          }
        />
        <Segment
          label="Jump"
          title={
            plan.jumpReady.ok
              ? `Take the transfer lane to ${getWellName(plan.jumpOptions[0].destination.wellId)}.`
              : `No jump: ${plan.jumpReady.reason}.`
          }
          selected={move.kind === 'jump'}
          disabled={disabled || !plan.jumpReady.ok}
          onClick={() =>
            plan.jumpOptions[0] &&
            plan.setMove({
              kind: 'jump',
              destinationWellId: plan.jumpOptions[0].destination.wellId,
              adjustment: 0,
            })
          }
        />
      </SegmentedRow>

      {move.kind === 'coast' && plan.moored && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.3 }}>
          The station carries you 4 sectors at the end of the round, and holding the berth repairs
          nothing more — the dock happened on arrival.
        </Typography>
      )}

      {move.kind === 'coast' && (
        <Tooltip
          title={`Recover fuel equal to this ring's velocity (${plan.scoopGain}). Needs ${
            getSubsystemConfig('scoop').minEnergy
          } cubes on the scoop — a berth is as good a place to skim from as any.`}
        >
          <Box component="span" sx={{ display: 'flex' }}>
            <Chip
              size="small"
              label={
                move.scoop ? `scooping +${plan.scoopGain} fuel` : `scoop +${plan.scoopGain} fuel`
              }
              color={move.scoop ? 'primary' : 'default'}
              variant={move.scoop ? 'filled' : 'outlined'}
              onClick={() => plan.setMove({ kind: 'coast', scoop: !move.scoop })}
              disabled={disabled || !scoop || scoop.isBroken}
            />
          </Box>
        </Tooltip>
      )}

      {move.kind === 'burn' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <SegmentedRow testId="burn-intensities">
            {INTENSITIES.map(intensity => (
              <Segment
                key={intensity}
                label={intensity[0].toUpperCase() + intensity.slice(1)}
                title={burnReason(intensity)}
                selected={move.intensity === intensity}
                disabled={disabled || !plan.burnReady[intensity].ok}
                onClick={() => plan.setMove({ ...move, intensity })}
              />
            ))}
          </SegmentedRow>
          <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.3 }} noWrap>
            {BURN_COSTS[move.intensity].rings} ring
            {BURN_COSTS[move.intensity].rings > 1 ? 's' : ''} {burnDirection} ·{' '}
            {BURN_COSTS[move.intensity].energy} energy ·{' '}
            {calculateBurnMassCost(BURN_COSTS[move.intensity].mass, move.adjustment)} fuel
          </Typography>
          <PhaseSlider
            value={move.adjustment}
            range={plan.adjustmentRange}
            disabled={disabled}
            onChange={adjustment => plan.setMove({ ...move, adjustment })}
          />
        </Box>
      )}

      {move.kind === 'jump' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {plan.jumpOptions.map(option => {
              const selected = move.destinationWellId === option.destination.wellId
              const landing =
                (selected && phasedJumpDestination(option, move.adjustment)) || option.destination
              return (
                <Chip
                  key={option.lane.id}
                  size="small"
                  label={`${getWellName(landing.wellId)} R${landing.ring} S${landing.sector}`}
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  onClick={() =>
                    plan.setMove({
                      kind: 'jump',
                      destinationWellId: option.destination.wellId,
                      adjustment: 0,
                    })
                  }
                  disabled={disabled}
                />
              )
            })}
          </Box>
          <PhaseSlider
            value={move.adjustment}
            range={plan.jumpAdjustmentRange}
            disabled={disabled}
            onChange={adjustment => plan.setMove({ ...move, adjustment })}
          />
          <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.3 }}>
            Engines at {WELL_TRANSFER_COSTS.energy}, {jumpFuel} fuel
            {compressor ? " (the compressor pays two of the jump's three fuel, never the phasing)" : ''}. Phasing
            never lands you outside the arrival arc.
          </Typography>
        </Box>
      )}
    </Box>
  )
}

function WeaponControls({ disabled }: { disabled: boolean }) {
  const plan = usePlan()
  const { view } = useGame()
  const weapons = plan.pendingSubsystems.filter(s => getSubsystemConfig(s.type).weaponStats)
  const sensor = plan.pendingSubsystems.find(s => s.type === 'sensor_array')
  const opening = isOpeningRound(view.turn)

  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
      {weapons.length === 0 && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
          No weapons aboard.
        </Typography>
      )}
      {opening && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
          The first round reaches nobody: no weapon fires and nobody scans.
        </Typography>
      )}
      {weapons.map(weapon => {
        const config = getSubsystemConfig(weapon.type)
        const queued = plan.steps.some(s => s.kind === 'fire' && s.subsystemId === weapon.id)
        const stats = config.weaponStats!
        const noAmmo = weapon.type === 'missiles' && (weapon.ammo ?? 0) <= 0
        return (
          <Tooltip
            key={weapon.id}
            title={`${config.name} · ${stats.damage} damage${stats.ignoresShields ? ' (ignores shields)' : ''} · ${config.minEnergy} energy${
              weapon.isPowered ? '' : ' (not powered — put cubes on it above)'
            }${weapon.isBroken ? ' — broken' : ''}${noAmmo ? ' — no ammo' : ''}${
              opening ? ' — nothing fires in the first round' : ''
            }`}
          >
            <Box component="span" sx={{ display: 'flex' }}>
              <Chip
                size="small"
                label={`${slotLabel(weapon.id)}: ${config.name}`}
                color={queued ? 'primary' : 'default'}
                variant={queued ? 'filled' : 'outlined'}
                onClick={() => plan.addFire(weapon.id)}
                onMouseEnter={() => plan.setFocusWeapon(weapon.id)}
                onMouseLeave={() => plan.setFocusWeapon(null)}
                disabled={disabled || queued || weapon.isBroken || noAmmo || opening}
                sx={{ fontSize: '0.8rem' }}
              />
            </Box>
          </Tooltip>
        )
      })}
      <Tooltip
        title={`Scan a ship on your ring within 3 sectors and look at one of their face-down tiles.${
          opening ? ' Nobody scans in the first round.' : ''
        }`}
      >
        <Box component="span" sx={{ display: 'flex' }}>
          <Chip
            size="small"
            icon={<SensorsIcon sx={{ fontSize: 15 }} />}
            label="scan"
            variant="outlined"
            onClick={plan.addScan}
            disabled={disabled || !sensor || opening}
          />
        </Box>
      </Tooltip>
    </Box>
  )
}
