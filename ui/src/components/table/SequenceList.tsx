/**
 * The turn you are building, in the order it will happen. The power actions
 * come first and stay first: a tile you power works from then until your next
 * turn, so a powered sensor widens every shot the turn takes. The steps after
 * them can be moved up and down: a weapon before the move fires from where you
 * are now, after it from where you end up, and the range preview follows, as
 * does the critical range once a scan has put energy on the sensor.
 */
import {
  Box,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import CloseIcon from '@mui/icons-material/Close'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import {
  BASE_CRITICAL_FACE,
  BURN_COSTS,
  D10_FACES,
  SCAN_SECTOR_RANGE,
  fill,
  getMissileStats,
  getSubsystemConfig,
  getWellName,
} from '@dangerous-inclinations/engine'
import type { Hull, SeizableItem, Subsystem } from '@dangerous-inclinations/engine'
import type { PlanStep } from '../../plan/preview'
import { usePlan } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { FONT_MONO } from '../../theme'
import { TABLE } from '../../design/tokens'
import { hullOf, slotWithSubsystem } from '../../utils/slots'
import { placeLabel } from '../../utils/route'
import { SENSOR_CRIT } from '../../site/numbers'
import { ACTIONS } from '../../text/actions'
import { inWords, signed } from './actions/words'

const T = ACTIONS.sequence
const W = ACTIONS.words

export function SequenceList() {
  const plan = usePlan()
  const powered = plan.pendingSubsystems.filter(s => (plan.powers[s.id] ?? 0) > 0)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {powered.map((sub, index) => (
        <PowerRow key={sub.id} sub={sub} n={index + 1} />
      ))}
      {plan.steps.map((step, index) => (
        <StepRow key={step.id} step={step} index={index} offset={powered.length} />
      ))}
    </Box>
  )
}

const ROW_SX = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 0.5,
  px: 0.75,
  py: 0.5,
  bgcolor: TABLE.plateSunk,
  border: `1px solid ${TABLE.line}`,
} as const

/** A power action: always ahead of the steps, so it has no arrows, only a way to take it off. */
function PowerRow({ sub, n }: { sub: Subsystem; n: number }) {
  const plan = usePlan()
  return (
    <Box data-testid="power-row" sx={ROW_SX}>
      <Box sx={{ flex: 1, minWidth: 0, pl: 0.25 }}>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontWeight: 600,
            fontSize: '0.85rem',
            color: TABLE.ink,
            lineHeight: 1.3,
          }}
        >
          {fill(T.power, {
            n,
            slot: slotWithSubsystem(sub.id, sub.type, hullOf(plan.me)),
            energy: plan.powers[sub.id],
          })}
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.78rem',
            color: TABLE.inkFaint,
            lineHeight: 1.3,
          }}
        >
          {T.powerNote}
        </Typography>
      </Box>
      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => plan.setEnergyTo(sub.id, 0)}>
        <CloseIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  )
}

function StepRow({ step, index, offset }: { step: PlanStep; index: number; offset: number }) {
  const plan = usePlan()
  const { nameOf, view } = useGame()
  const at = plan.stepStart[index]
  const weapon =
    step.kind === 'fire' ? plan.pendingSubsystems.find(s => s.id === step.subsystemId) : undefined
  // What a seizure takes, by kind: the hold is public that far.
  const item =
    step.kind === 'seize'
      ? view.players.find(p => p.id === step.victimId)?.hold.find(i => i.cargoId === step.cargoId)
          ?.kind
      : undefined

  return (
    <Box sx={ROW_SX}>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <IconButton
          size="small"
          sx={{ p: 0.1 }}
          onClick={() => plan.reorderStep(step.id, -1)}
          disabled={index === 0}
        >
          <ArrowUpwardIcon sx={{ fontSize: 13 }} />
        </IconButton>
        <IconButton
          size="small"
          sx={{ p: 0.1 }}
          onClick={() => plan.reorderStep(step.id, 1)}
          disabled={index === plan.steps.length - 1}
        >
          <ArrowDownwardIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontWeight: 600,
            fontSize: '0.85rem',
            color: TABLE.ink,
            lineHeight: 1.3,
          }}
        >
          {fill(T.step, {
            n: offset + index + 1,
            title: stepTitle(step, nameOf, hullOf(plan.me), weapon, item),
          })}
        </Typography>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.78rem',
            color: TABLE.inkFaint,
            lineHeight: 1.3,
          }}
        >
          {fill(T.from, { place: placeLabel(at.position), facing: at.facing })}
        </Typography>

        {step.kind === 'fire' && <FireControls step={step} />}
        {step.kind === 'scan' && <ScanControls step={step} />}
        {(step.kind === 'seize' || step.kind === 'mark') && <AfterShotNote step={step} />}
      </Box>

      {step.kind !== 'move' && (
        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => plan.removeStep(step.id)}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  )
}

function stepTitle(
  step: PlanStep,
  nameOf: (id: string) => string,
  hull: Hull,
  weapon?: Subsystem,
  item?: SeizableItem['kind']
): string {
  const S = T.title
  switch (step.kind) {
    case 'rotate':
      return S.rotate
    case 'move':
      if (step.move.kind === 'coast') return step.move.scoop ? S.coastScoop : S.coast
      if (step.move.kind === 'burn')
        return fill(S.burn, {
          intensity: W.intensityLabel[step.move.intensity],
          phase: step.move.adjustment
            ? fill(S.burnPhase, { value: signed(step.move.adjustment) })
            : '',
        })
      return fill(S.jump, { well: getWellName(step.move.destinationWellId) })
    case 'fire':
      return fill(S.fire, {
        slot: slotWithSubsystem(step.subsystemId, weapon?.type, hull),
        count: step.count > 1 ? fill(S.fireCount, { count: step.count }) : '',
        target: step.targetId ? fill(S.fireTarget, { name: nameOf(step.targetId) }) : '',
      })
    case 'scan':
      return fill(S.scan, {
        target: step.targetId ? fill(S.scanTarget, { name: nameOf(step.targetId) }) : '',
      })
    case 'seize':
      return fill(S.seize, {
        item: item ? W.item[item] : S.cargo,
        name: nameOf(step.victimId),
      })
    case 'survey':
      return S.survey
    case 'salvage':
      return step.victimId !== null
        ? fill(S.salvageKill, { name: nameOf(step.victimId) })
        : S.salvage
    case 'mark':
      return fill(S.mark, { name: nameOf(step.carrierId) })
  }
}

const F = T.fire

function FireControls({ step }: { step: Extract<PlanStep, { kind: 'fire' }> }) {
  const plan = usePlan()
  const { nameOf, view } = useGame()
  const weapon = plan.pendingSubsystems.find(s => s.id === step.subsystemId)
  /** Their slot, named for their hull with what you know sits in it. */
  const victim = view.players.find(p => p.id === step.targetId)
  const theirs = victim?.slots.find(slot => slot.id === step.criticalTarget)
  const config = weapon ? getSubsystemConfig(weapon.type) : null
  const inRange = plan.targetsInRange(step)
  const picking = plan.picking?.kind === 'crit' && plan.picking.stepId === step.id
  /**
   * Legal to launch at, but the missile expires before it closes. The rules
   * allow the shot (a missile is self-guided and nobody stops you throwing
   * one away) so the target stays in the list, marked.
   */
  const outOfReach = new Set(plan.targetsOutOfReach(step).map(t => t.id))
  const wasted = step.targetId !== null && outOfReach.has(step.targetId)
  /**
   * One action launches as many of this tile's rounds as you like at one ship
   * (RULES §Weapons → Missiles). With one round left there is nothing to
   * decide, so the control only appears when the magazine holds a choice.
   */
  const ammo = weapon?.type === 'missiles' ? (weapon.ammo ?? 0) : 0
  /**
   * The critical range this shot rolls with, from the engine: wider once the
   * sensor has energy on it, which is a power (first) or a scan before the
   * shot. A missile that lands as it is launched rolls then too; one still
   * flying rolls on a later turn, with the sensor its owner has up then.
   */
  const critFrom = plan.criticalFrom(step)
  const sensor = plan.me.ship.subsystems.find(s => s.type === 'sensor_array' && !s.isBroken)
  const crit = { from: critFrom, base: BASE_CRITICAL_FACE, sensor: SENSOR_CRIT, top: D10_FACES }
  const critTip =
    weapon?.type === 'missiles'
      ? critFrom < BASE_CRITICAL_FACE
        ? fill(F.crit.launchSensed, crit)
        : sensor
          ? fill(F.crit.launchSensor, crit)
          : fill(F.crit.bare, crit)
      : critFrom < BASE_CRITICAL_FACE
        ? fill(F.crit.shotSensed, crit)
        : sensor
          ? fill(F.crit.shotSensor, crit)
          : fill(F.crit.bare, crit)

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
      <Select
        size="small"
        value={step.targetId ?? ''}
        displayEmpty
        onChange={e => plan.updateStep(step.id, { targetId: e.target.value || null })}
        onOpen={() => plan.setFocusWeapon(step.subsystemId)}
        sx={{ fontSize: '0.82rem', minWidth: 116, '& .MuiSelect-select': { py: 0.35 } }}
      >
        <MenuItem value="" sx={{ fontSize: '0.82rem' }}>
          {inRange.length === 0 ? F.nothingInRange : F.pickTarget}
        </MenuItem>
        {inRange.map(target => (
          <MenuItem key={target.id} value={target.id} sx={{ fontSize: '0.82rem' }}>
            {nameOf(target.id)}
            {outOfReach.has(target.id) ? F.tooFar : ''}
          </MenuItem>
        ))}
      </Select>

      {ammo > 1 && (
        <Tooltip title={F.countTip}>
          <Select
            size="small"
            value={Math.min(step.count, ammo)}
            onChange={e => plan.updateStep(step.id, { count: Number(e.target.value) })}
            sx={{ fontSize: '0.82rem', minWidth: 72, '& .MuiSelect-select': { py: 0.35 } }}
          >
            {Array.from({ length: ammo }, (_, i) => i + 1).map(n => (
              <MenuItem key={n} value={n} sx={{ fontSize: '0.82rem' }}>
                {fill(F.count, { count: n })}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
      )}

      {inRange.length === 0 && plan.reachesBeforeMove(step) && (
        <Tooltip title={F.beforeTip}>
          <Chip
            size="small"
            label={F.before}
            color="primary"
            variant="outlined"
            onClick={() => plan.fireBeforeMove(step.id)}
            sx={{ fontSize: '0.78rem', height: 22 }}
          />
        </Tooltip>
      )}

      {wasted && (
        <Typography sx={{ fontSize: '0.74rem', color: TABLE.danger, lineHeight: 1.3 }}>
          {fill(F.wasted, {
            moves: inWords(getMissileStats().maxMoves),
            steps: inWords(getMissileStats().stepsPerMove),
          })}
        </Typography>
      )}

      <Tooltip title={critTip}>
        <Typography
          data-testid="crit-range"
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.74rem',
            color: critFrom < BASE_CRITICAL_FACE ? TABLE.accent : TABLE.inkSoft,
            lineHeight: 1.3,
            cursor: 'help',
          }}
        >
          {fill(critFrom < BASE_CRITICAL_FACE ? F.critRange : F.critBare, {
            from: critFrom,
            top: D10_FACES,
          })}
        </Typography>
      </Tooltip>

      <Tooltip title={F.critTargetTip}>
        <Chip
          size="small"
          icon={<MyLocationIcon sx={{ fontSize: 14 }} />}
          label={fill(F.critTarget, {
            slot: slotWithSubsystem(step.criticalTarget, theirs?.type, hullOf(victim)),
          })}
          color={picking ? 'primary' : 'default'}
          variant={picking ? 'filled' : 'outlined'}
          onClick={() => plan.setPicking(picking ? null : { kind: 'crit', stepId: step.id })}
          sx={{ fontSize: '0.78rem', height: 22 }}
        />
      </Tooltip>

      {config?.weaponStats?.hasRecoil && (
        <Tooltip title={fill(F.recoilTip, { fuel: BURN_COSTS.soft.mass })}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={step.compensateRecoil}
                onChange={e => plan.updateStep(step.id, { compensateRecoil: e.target.checked })}
              />
            }
            label={
              <Typography sx={{ fontSize: '0.78rem', color: TABLE.inkSoft }}>{F.recoil}</Typography>
            }
          />
        </Tooltip>
      )}
    </Box>
  )
}

function ScanControls({ step }: { step: Extract<PlanStep, { kind: 'scan' }> }) {
  const plan = usePlan()
  const { nameOf, view } = useGame()
  const inRange = plan.targetsInRange(step)
  const picking = plan.picking?.kind === 'peek' && plan.picking.stepId === step.id

  const target = step.targetId ? view.players.find(p => p.id === step.targetId) : undefined
  const slots = target?.slots ?? []
  const faceDown = slots.filter(slot => slot.type === null)
  const chosen = step.peekSlot ? slots.find(slot => slot.id === step.peekSlot) : undefined
  const note = !target
    ? null
    : faceDown.length === 0
      ? T.scan.allKnown
      : chosen && chosen.type !== null
        ? T.scan.known
        : null

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
      <Select
        size="small"
        value={step.targetId ?? ''}
        displayEmpty
        onChange={e => plan.updateStep(step.id, { targetId: e.target.value || null })}
        sx={{ fontSize: '0.82rem', minWidth: 116, '& .MuiSelect-select': { py: 0.35 } }}
      >
        <MenuItem value="" sx={{ fontSize: '0.82rem' }}>
          {inRange.length === 0
            ? fill(T.scan.nobody, { range: SCAN_SECTOR_RANGE })
            : T.scan.pickTarget}
        </MenuItem>
        {inRange.map(target => (
          <MenuItem key={target.id} value={target.id} sx={{ fontSize: '0.82rem' }}>
            {nameOf(target.id)}
          </MenuItem>
        ))}
      </Select>

      <Tooltip title={T.scan.peekTip}>
        <Chip
          size="small"
          icon={<MyLocationIcon sx={{ fontSize: 14 }} />}
          label={
            step.peekSlot
              ? fill(T.scan.peek, {
                  slot: slotWithSubsystem(step.peekSlot, chosen?.type, hullOf(target)),
                })
              : T.scan.peekChoose
          }
          color={picking ? 'primary' : 'default'}
          variant={picking ? 'filled' : 'outlined'}
          onClick={() => plan.setPicking(picking ? null : { kind: 'peek', stepId: step.id })}
          sx={{ fontSize: '0.78rem', height: 22 }}
        />
      </Tooltip>

      {note && (
        <Typography
          sx={{ fontSize: '0.78rem', color: TABLE.inkSoft, lineHeight: 1.3, width: '100%' }}
        >
          {note}
        </Typography>
      )}
    </Box>
  )
}

/**
 * A seizure or a marker after a shot at the same ship comes to nothing if the
 * shot destroys it: the cargo goes down with the ship, the marker stays in
 * hand. The dice decide that, so the engine's walk warns rather than refuses,
 * and the step says so.
 */
function AfterShotNote({ step }: { step: Extract<PlanStep, { kind: 'seize' | 'mark' }> }) {
  const plan = usePlan()
  const code = step.kind === 'seize' ? 'seizeAfterShot' : 'markAfterShot'
  if (!plan.warnings[step.id]?.includes(code)) return null
  return (
    <Typography sx={{ fontSize: '0.78rem', color: TABLE.inkSoft, lineHeight: 1.3, mt: 0.5 }}>
      {T[code]}
    </Typography>
  )
}
