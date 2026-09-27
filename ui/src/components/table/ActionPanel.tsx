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
import SendIcon from '@mui/icons-material/Send'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import type { ReactNode } from 'react'
import type { BurnIntensity, SubsystemType } from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  getSubsystemConfig,
  getWellName,
  hasWorkingCompressor,
  phasedJumpDestination,
} from '@dangerous-inclinations/engine'
import { usePlan } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { Panel, SectionLabel } from '../common/Panel'
import { SubsystemIcon } from '../common/SubsystemIcon'
import { FONT_MONO, TABLE } from '../../theme'
import { slotWithSubsystem } from '../../utils/slots'
import { RoutePlanner } from './RoutePlanner'
import { SequenceList } from './SequenceList'
import { ShipEnergyLoadout } from './ShipEnergyLoadout'
import { SystemsControls } from './SystemsControls'
import { StatusBlock } from './StatusBlock'

const INTENSITIES: BurnIntensity[] = ['soft', 'medium', 'hard']

/** What a compressor saves on a jump, in words, from the engine's two prices. */
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five']
const COMPRESSOR_NOTE = ` (the compressor pays ${
  NUMBER_WORDS[WELL_TRANSFER_COSTS.mass - COMPRESSED_JUMP_MASS]
} of the jump's ${NUMBER_WORDS[WELL_TRANSFER_COSTS.mass]} fuel, never the phasing)`

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
      <TurnShell title={title} slab={sittingOut}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pt: 0.75 }}>
          <Typography variant="body2" sx={{ color: TABLE.inkSoft }}>
            {view.phase === 'ended'
              ? winner
                ? `${winner} wins.`
                : 'The game has ended.'
              : readOnly
                ? 'Nothing here can be played.'
                : sittingOut
                  ? 'Your ship is lost. You return to Home this turn with a full hull and tank and drift; nobody can touch you until your next turn is over.'
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
      slab
      action={
        <Tooltip title="Clear the plan and start again">
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

        {/* What the turn puts on the loadout: read here, set by the steps below. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <SectionLabel sx={{ lineHeight: 1.35 }}>Loadout · energy this turn</SectionLabel>
          <ShipEnergyLoadout />
        </Box>

        <Divider />
        <Step n={1} label="Orientation">
          <OrientationControls />
        </Step>

        <Divider />
        <Step n={2} label="Move · one per turn">
          <MoveControls />
        </Step>
        {/* Not a fourth move: an instrument that proposes one. Its own plate. */}
        <RoutePlanner />

        <Divider />
        <Step n={3} label="Systems">
          <SystemsControls />
        </Step>

        <RepairControl />
        <DockJobControl />
        <EscortControl />

        <Divider />
        <Step n={4} label="Sequence">
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
          disabled={plan.disabled || blocked}
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
 * whatever the turn needs under that. A turn that is yours to take wears its
 * title on the red slab; waiting for someone else, it is a plain plate.
 */
function TurnShell({
  title,
  slab = false,
  action,
  children,
}: {
  title: string
  slab?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Panel
      title={title}
      slab={slab}
      dense
      action={action}
      sx={{ flex: 1, minWidth: 0, minHeight: 0 }}
    >
      <Box
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 0.5 }}
      >
        <StatusBlock accent={slab ? TABLE.accentBlock : TABLE.plateEdge} />
        {children}
      </Box>
    </Panel>
  )
}

/**
 * Naming the tile a cold ship's crew will fix. It appears only when the turn as
 * built would end at 0 heat and something is broken, because those are exactly
 * the turns on which it can happen. A control that offered itself and then did
 * nothing would be worse than none.
 */
function RepairControl() {
  const plan = usePlan()
  const disabled = plan.disabled
  const broken = plan.me.ship.subsystems.filter(s => s.isBroken)
  if (broken.length === 0) return null

  const offered = plan.repairable
  return (
    <>
      <Divider />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
        <SectionLabel>Repair · one a turn, and only cold</SectionLabel>
        {offered.length === 0 ? (
          <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkSoft }}>
            This turn makes heat. A repair needs no energy on any subsystem: a plain
            coast, no scoop, no shot, no scan, nothing powered.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
            {broken.map(sub => {
              const can = offered.includes(sub.id)
              const on = plan.repairChoice === sub.id
              return (
                <ChoiceChip
                  key={sub.id}
                  title={`${slotWithSubsystem(sub.id, sub.type)} · repaired at your heat check`}
                  selected={on}
                  disabled={disabled || !can}
                  opacity={can ? 1 : 0.45}
                  onClick={() => plan.setRepairChoice(on ? null : sub.id)}
                >
                  {slotWithSubsystem(sub.id, sub.type)}
                </ChoiceChip>
              )
            })}
          </Box>
        )}
      </Box>
    </>
  )
}

/**
 * The one job a visit does (RULES §Stations). It appears only when the turn as
 * built arrives at a station and the visit could do more than one job; the
 * jobs, their points and the default all come from the engine, and the
 * default is lit until another is picked.
 */
function DockJobControl() {
  const plan = usePlan()
  const disabled = plan.disabled
  const offer = plan.dockOffer
  if (!offer) return null
  return (
    <>
      <Divider />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
        <SectionLabel>At the dock · one job a visit</SectionLabel>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
          {offer.jobs.map(({ job, points }) => {
            const on = plan.dockJob === job
            return (
              <ChoiceChip
                key={job}
                title={`${points} point${points === 1 ? '' : 's'} this visit${
                  job === offer.default ? ' · the default' : ''
                }`}
                selected={on}
                disabled={disabled}
                onClick={() => plan.setDockJob(job)}
              >
                {job} · {points}
              </ChoiceChip>
            )
          })}
        </Box>
      </Box>
    </>
  )
}

/**
 * An Escort marker is a "you may" (RULES §Missions, Escort). The choice
 * appears only when the turn as built ends in the sector of a carrier the
 * engine would let a marker go on; nothing is lit until picked, and at one
 * pick per marker in hand the rest wait until one is taken back.
 */
function EscortControl() {
  const plan = usePlan()
  const disabled = plan.disabled
  const { view } = useGame()
  const offer = plan.escortOffer
  if (!offer) return null
  const full = plan.escortChoices.length >= offer.markers
  return (
    <>
      <Divider />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
        <SectionLabel>
          Escort · you may place {offer.markers === 1 ? 'your marker' : `${offer.markers} markers`}
        </SectionLabel>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
          {offer.carriers.map(carrierId => {
            const on = plan.escortChoices.includes(carrierId)
            const name = view.players.find(p => p.id === carrierId)?.name ?? carrierId
            const off = disabled || (!on && full)
            return (
              <ChoiceChip
                key={carrierId}
                title={`Put your marker on ${name}: done the next time they deliver, sell or file anything, or pump fuel; back to you if they are destroyed first`}
                selected={on}
                disabled={off}
                opacity={!on && full ? 0.5 : 1}
                onClick={() => plan.toggleEscort(carrierId)}
              >
                Escort {name}
              </ChoiceChip>
            )
          })}
        </Box>
      </Box>
    </>
  )
}

/**
 * One pick among a few (a subsystem to repair, a dock job, a carrier to
 * escort): a cream block when chosen, an outlined one when not.
 */
function ChoiceChip({
  title,
  selected,
  disabled,
  opacity = 1,
  onClick,
  children,
}: {
  title: string
  selected: boolean
  disabled: boolean
  opacity?: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip title={title}>
      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onClick}
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.75rem',
          fontWeight: 700,
          px: 0.7,
          py: '2px',
          borderRadius: 0,
          cursor: disabled ? 'default' : 'pointer',
          color: selected ? TABLE.onSelected : TABLE.inkSoft,
          border: `1px solid ${selected ? TABLE.selected : TABLE.plateEdge}`,
          bgcolor: selected ? TABLE.selected : 'transparent',
          opacity,
        }}
      >
        {children}
      </Box>
    </Tooltip>
  )
}

/**
 * One numbered block of the turn, so the column reads top to bottom. The
 * numeral is printed in the red, the way the cheatsheet numbers its sections.
 */
function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
      <SectionLabel sx={{ lineHeight: 1.35, color: TABLE.ink }}>
        <Box
          component="span"
          sx={{ color: TABLE.accent, fontWeight: 700, fontSize: '0.95rem', mr: 0.6 }}
        >
          {n}.
        </Box>
        {label}
      </SectionLabel>
      {children}
    </Box>
  )
}

/**
 * The mark of the subsystem an action puts its energy on, in the colour of the
 * type beside it: the same silhouette the loadout below draws on that tile,
 * so a button and the tile it will light read as one thing.
 */
function ActionIcon({ type, className }: { type: SubsystemType; className?: string }) {
  // A Chip positions its icon by the class it clones in, so the class has to reach the SVG.
  return (
    <SubsystemIcon
      type={type}
      size={14}
      color="currentColor"
      opacity={1}
      className={className}
    />
  )
}

/**
 * A segment of a segmented control. Each button carries its own tooltip
 * (including the reason it cannot be pressed) so the row itself stays as
 * narrow as the column, whatever the reason is.
 */
function Segment({
  label,
  title,
  selected,
  disabled,
  icon,
  onClick,
}: {
  label: string
  title: ReactNode
  selected: boolean
  disabled?: boolean
  /** The subsystem this choice uses, when it uses one. */
  icon?: SubsystemType
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
            gap: 0.6,
          }}
        >
          {icon && <ActionIcon type={icon} />}
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

function OrientationControls() {
  const plan = usePlan()
  const disabled = plan.disabled
  const rotating = plan.steps.some(s => s.kind === 'rotate')
  const ready = plan.rotateReady
  const facing = plan.me.ship.facing

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Tooltip
        title={
          ready.ok || rotating
            ? 'Flip facing: 1 energy on the thrusters, 1 heat at your check.'
            : `No rotation: ${ready.reason}.`
        }
      >
        <Box component="span" sx={{ display: 'flex' }}>
          <Chip
            size="small"
            icon={<ActionIcon type="rotation" />}
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

function MoveControls() {
  const plan = usePlan()
  const disabled = plan.disabled
  const move = plan.moveStep.move
  const compressor = hasWorkingCompressor({ ...plan.me.ship, subsystems: plan.pendingSubsystems })
  const scoop = plan.pendingSubsystems.find(s => s.id === 'scoop')
  /**
   * Whether coming back to a coast keeps the scoop running. The loadout is
   * cleared every turn, so there is no running scoop to read: a coast keeps
   * whatever the scoop chip was last set to, and starts off.
   */
  const scoopReady = Boolean(
    scoop && !scoop.isBroken && move.kind === 'coast' && move.scoop
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
          icon="engines"
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
          icon={compressor ? 'fuel_compressor' : 'engines'}
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
          nothing more: the dock happened on arrival.
        </Typography>
      )}

      {/* A coast's own choice, the way a burn's is its intensity: drift, or
          skim the ring for fuel with the scoop. */}
      {move.kind === 'coast' && (
        <SegmentedRow testId="coast-options">
          <Segment
            label="Drift"
            title="Ride the ring and nothing more: no energy, no heat."
            selected={!move.scoop}
            disabled={disabled}
            onClick={() => plan.setMove({ kind: 'coast', scoop: false })}
          />
          <Segment
            label={`Scoop +${plan.scoopGain} fuel`}
            title={
              !scoop || scoop.isBroken
                ? 'No scoop: it is broken.'
                : `Recover fuel equal to this ring's velocity (${plan.scoopGain}). Puts ${
                    getSubsystemConfig('scoop').minEnergy
                  } energy on the scoop. A berth is as good a place to skim from as any.`
            }
            selected={Boolean(move.scoop)}
            icon="scoop"
            disabled={disabled || !scoop || scoop.isBroken}
            onClick={() => plan.setMove({ kind: 'coast', scoop: true })}
          />
        </SegmentedRow>
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
            {compressor ? COMPRESSOR_NOTE : ''}. Phasing
            never lands you outside the arrival arc.
          </Typography>
        </Box>
      )}
    </Box>
  )
}
