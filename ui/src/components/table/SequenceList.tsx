/**
 * The turn you are building, in the order it will happen. The power actions
 * come first and stay first: a tile you power works from then until your next
 * turn, so a powered sensor widens every shot the turn takes. The steps after
 * them can be moved up and down: a weapon before the move fires from where you
 * are now, after it from where you end up, and the range preview follows, as
 * does the critical range once a scan has put energy on the sensor.
 */
import { Box, Chip, FormControlLabel, IconButton, MenuItem, Select, Switch, Tooltip, Typography } from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import CloseIcon from '@mui/icons-material/Close'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import { getSubsystemConfig, getWellName } from '@dangerous-inclinations/engine'
import type { Subsystem } from '@dangerous-inclinations/engine'
import type { PlanStep } from '../../context/PlanContext'
import { usePlan } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { FONT_MONO, TABLE } from '../../theme'
import { slotLabel } from '../../utils/slots'

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
  borderRadius: 1,
  bgcolor: 'rgba(126,165,205,0.04)',
  border: `1px solid ${TABLE.line}`,
} as const

/** A power action: always ahead of the steps, so it has no arrows, only a way to take it off. */
function PowerRow({ sub, n }: { sub: Subsystem; n: number }) {
  const plan = usePlan()
  const config = getSubsystemConfig(sub.type)
  return (
    <Box data-testid="power-row" sx={ROW_SX}>
      <Box sx={{ flex: 1, minWidth: 0, pl: 0.25 }}>
        <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: '0.85rem', color: TABLE.ink, lineHeight: 1.3 }}>
          {n}. Power {config.name} ({plan.powers[sub.id]})
        </Typography>
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.78rem', color: TABLE.inkFaint, lineHeight: 1.3 }}>
          {slotLabel(sub.id)} · first, and it works until your next turn
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
  const { nameOf } = useGame()
  const at = plan.stepStart[index]

  return (
    <Box sx={ROW_SX}>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <IconButton size="small" sx={{ p: 0.1 }} onClick={() => plan.reorderStep(step.id, -1)} disabled={index === 0}>
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
        <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: '0.85rem', color: TABLE.ink, lineHeight: 1.3 }}>
          {offset + index + 1}. {stepTitle(step, nameOf)}
        </Typography>
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.78rem', color: TABLE.inkFaint, lineHeight: 1.3 }}>
          from {getWellName(at.position.wellId)} R{at.position.ring} S{at.position.sector} · {at.facing}
        </Typography>

        {step.kind === 'fire' && <FireControls step={step} />}
        {step.kind === 'scan' && <ScanControls step={step} />}
      </Box>

      {step.kind !== 'move' && (
        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => plan.removeStep(step.id)}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      )}
    </Box>
  )
}

function stepTitle(step: PlanStep, nameOf: (id: string) => string): string {
  switch (step.kind) {
    case 'rotate':
      return 'Rotate'
    case 'move':
      if (step.move.kind === 'coast') return step.move.scoop ? 'Coast, scoop fuel' : 'Coast'
      if (step.move.kind === 'burn')
        return `${step.move.intensity[0].toUpperCase()}${step.move.intensity.slice(1)} burn${
          step.move.adjustment ? `, phase ${step.move.adjustment > 0 ? '+' : ''}${step.move.adjustment}` : ''
        }`
      return `Jump to ${getWellName(step.move.destinationWellId)}`
    case 'fire':
      return `Fire ${slotLabel(step.subsystemId)}${step.count > 1 ? ` ×${step.count}` : ''}${
        step.targetId ? ` at ${nameOf(step.targetId)}` : ''
      }`
    case 'scan':
      return `Scan${step.targetId ? ` ${nameOf(step.targetId)}` : ''}`
  }
}

function FireControls({ step }: { step: Extract<PlanStep, { kind: 'fire' }> }) {
  const plan = usePlan()
  const { nameOf } = useGame()
  const weapon = plan.pendingSubsystems.find((s) => s.id === step.subsystemId)
  const config = weapon ? getSubsystemConfig(weapon.type) : null
  const inRange = plan.targetsInRange(step)
  const picking = plan.picking?.kind === 'crit' && plan.picking.stepId === step.id
  /**
   * Legal to launch at, but the missile expires before it closes. The rules
   * allow the shot (a missile is self-guided and nobody stops you throwing
   * one away) so the target stays in the list, marked.
   */
  const outOfReach = new Set(plan.targetsOutOfReach(step).map((t) => t.id))
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
   * shot. A missile rolls when it arrives, after all your actions.
   */
  const critFrom = plan.criticalFrom(step)
  const sensor = plan.me.ship.subsystems.find(s => s.type === 'sensor_array' && !s.isBroken)
  const critTip =
    weapon?.type === 'missiles'
      ? critFrom < 10
        ? `A missile rolls when it arrives, after all your actions, and your sensor has energy on it by then: criticals on ${critFrom}–10.`
        : sensor
          ? 'A missile rolls when it arrives, after all your actions. Power the sensor or scan this turn and it criticals on 8–10.'
          : 'Criticals on 10.'
      : critFrom < 10
        ? `Your sensor has energy on it by this shot (powered, or it scanned earlier in the turn): criticals on ${critFrom}–10.`
        : sensor
          ? 'Criticals on 10. Power the sensor, or scan before this shot, and it is 8–10.'
          : 'Criticals on 10.'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
      <Select
        size="small"
        value={step.targetId ?? ''}
        displayEmpty
        onChange={(e) => plan.updateStep(step.id, { targetId: e.target.value || null })}
        onOpen={() => plan.setFocusWeapon(step.subsystemId)}
        sx={{ fontSize: '0.82rem', minWidth: 116, '& .MuiSelect-select': { py: 0.35 } }}
      >
        <MenuItem value="" sx={{ fontSize: '0.82rem' }}>
          {inRange.length === 0 ? 'nothing in range' : 'pick a target'}
        </MenuItem>
        {inRange.map((target) => (
          <MenuItem key={target.id} value={target.id} sx={{ fontSize: '0.82rem' }}>
            {nameOf(target.id)}
            {outOfReach.has(target.id) ? ' · too far to catch' : ''}
          </MenuItem>
        ))}
      </Select>

      {ammo > 1 && (
        <Tooltip title="How many rounds go up in this one launch, all at that ship and that slot.">
          <Select
            size="small"
            value={Math.min(step.count, ammo)}
            onChange={(e) => plan.updateStep(step.id, { count: Number(e.target.value) })}
            sx={{ fontSize: '0.82rem', minWidth: 72, '& .MuiSelect-select': { py: 0.35 } }}
          >
            {Array.from({ length: ammo }, (_, i) => i + 1).map((n) => (
              <MenuItem key={n} value={n} sx={{ fontSize: '0.82rem' }}>
                ×{n}
              </MenuItem>
            ))}
          </Select>
        </Tooltip>
      )}

      {wasted && (
        <Typography sx={{ fontSize: '0.74rem', color: TABLE.danger, lineHeight: 1.3 }}>
          This one runs out of fuel before it catches them: three moves of three steps, and they
          keep drifting.
        </Typography>
      )}

      <Tooltip title={critTip}>
        <Typography
          data-testid="crit-range"
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.74rem',
            color: critFrom < 10 ? TABLE.accent : TABLE.inkSoft,
            lineHeight: 1.3,
            cursor: 'help',
          }}
        >
          crit {critFrom < 10 ? `${critFrom}–10` : '10'}
        </Typography>
      </Tooltip>

      <Tooltip title="Name the slot a critical hit would break: click it on their loadout">
        <Chip
          size="small"
          icon={<MyLocationIcon sx={{ fontSize: 14 }} />}
          label={`crit: ${slotLabel(step.criticalTarget)}`}
          color={picking ? 'primary' : 'default'}
          variant={picking ? 'filled' : 'outlined'}
          onClick={() => plan.setPicking(picking ? null : { kind: 'crit', stepId: step.id })}
          sx={{ fontSize: '0.78rem', height: 22 }}
        />
      </Tooltip>

      {config?.weaponStats?.hasRecoil && (
        <Tooltip title="Absorb the recoil: 1 fuel and engine heat, and no burn this turn.">
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={step.compensateRecoil}
                onChange={(e) => plan.updateStep(step.id, { compensateRecoil: e.target.checked })}
              />
            }
            label={
              <Typography sx={{ fontSize: '0.78rem', color: TABLE.inkSoft }}>compensate recoil</Typography>
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

  const target = step.targetId ? view.players.find((p) => p.id === step.targetId) : undefined
  const slots = target?.slots ?? []
  const faceDown = slots.filter((slot) => slot.type === null)
  const chosen = step.peekSlot ? slots.find((slot) => slot.id === step.peekSlot) : undefined
  const note = !target
    ? null
    : faceDown.length === 0
      ? 'You already know every subsystem on that loadout. The scan still takes their transmission.'
      : chosen && chosen.type !== null
        ? 'You already know that subsystem: the scan will look at the first face-down one instead.'
        : null

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
      <Select
        size="small"
        value={step.targetId ?? ''}
        displayEmpty
        onChange={(e) => plan.updateStep(step.id, { targetId: e.target.value || null })}
        sx={{ fontSize: '0.82rem', minWidth: 116, '& .MuiSelect-select': { py: 0.35 } }}
      >
        <MenuItem value="" sx={{ fontSize: '0.82rem' }}>
          {inRange.length === 0 ? 'nobody within 3 sectors' : 'pick a target'}
        </MenuItem>
        {inRange.map((target) => (
          <MenuItem key={target.id} value={target.id} sx={{ fontSize: '0.82rem' }}>
            {nameOf(target.id)}
          </MenuItem>
        ))}
      </Select>

      <Tooltip title="Choose which face-down subsystem to look at: click it on their loadout">
        <Chip
          size="small"
          icon={<MyLocationIcon sx={{ fontSize: 14 }} />}
          label={step.peekSlot ? `peek: ${slotLabel(step.peekSlot)}` : 'peek: choose a slot'}
          color={picking ? 'primary' : 'default'}
          variant={picking ? 'filled' : 'outlined'}
          onClick={() => plan.setPicking(picking ? null : { kind: 'peek', stepId: step.id })}
          sx={{ fontSize: '0.78rem', height: 22 }}
        />
      </Tooltip>

      {note && (
        <Typography sx={{ fontSize: '0.78rem', color: TABLE.inkSoft, lineHeight: 1.3, width: '100%' }}>
          {note}
        </Typography>
      )}
    </Box>
  )
}
