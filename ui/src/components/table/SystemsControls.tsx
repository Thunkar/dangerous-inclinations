/**
 * The Systems step: everything the loadout can do this turn, one row per
 * subsystem and one control per thing it can do, grouped the way the player
 * thinks about them.
 *
 *   Weapons  · Fire, a solid red block: it queues the shot in the sequence
 *   Defence  · shields: Off / 2 / 4 · a ballistic rack: Off / On, and Fire
 *   Sensor   · Off / On, and Scan
 *
 * The three kinds never look alike: a shot is the red block, a power level is
 * a cream segment (the picked one a cream block), a scan is an outlined
 * button with the sensor's mark. Each subsystem does one thing a turn, so a
 * rack that fires or a sensor that scans shows "up" instead of its power
 * control: the action leaves its energy on it until your next turn anyway.
 * Every number comes from the engine's configs; the plan is the only thing
 * these controls touch.
 */
import { Box, Button, ToggleButton, Tooltip, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import type { ReactNode } from 'react'
import type { Subsystem } from '@dangerous-inclinations/engine'
import {
  SHIELD_ENERGY_PER_POINT,
  SLOT_IDS,
  canFireFrom,
  energyStepOf,
  getSubsystemConfig,
  interceptsPerRack,
  isOpeningRound,
  isPowerableType,
  isQuietTurn,
} from '@dangerous-inclinations/engine'
import { usePlan } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { SubsystemIcon } from '../common/SubsystemIcon'
import { FONT_MONO, TABLE } from '../../theme'
import { slotWithSubsystem } from '../../utils/slots'
import { subsystemGroup } from '../../utils/subsystemGroups'
import { SENSOR_CRIT, poweredEffect } from '../../site/numbers'

export function SystemsControls() {
  const plan = usePlan()
  const { view } = useGame()
  const disabled = plan.disabled
  const slots = SLOT_IDS.map(id => plan.pendingSubsystems.find(s => s.id === id)).filter(
    (s): s is Subsystem => Boolean(s)
  )
  const weapons = slots.filter(s => subsystemGroup(s.type) === 'weapon')
  const defence = slots.filter(s => subsystemGroup(s.type) === 'defence')
  const sensors = slots.filter(s => subsystemGroup(s.type) === 'sensor')

  // A quiet turn reaches nobody: the opening round, and your own turn back
  // from Home, which is a first round of your own.
  const quiet = isQuietTurn(view.turn, plan.me)
  const back = quiet && !isOpeningRound(view.turn)
  /**
   * Every step of the turn happens at a berth: moored at the start and still
   * there at the end. A moored ship fires at nobody (RULES §Stations). A turn
   * that only arrives at a berth can still fire before its move, so that one
   * is left to the plan's own problems to explain.
   */
  const atBerth = plan.moored && !canFireFrom(plan.finalPosition.position, view.stations)

  const fireBlock = (sub: Subsystem): string | null => {
    if (sub.isBroken) return 'Broken: it does nothing until repaired.'
    if (sub.type === 'missiles' && (sub.ammo ?? 0) <= 0)
      return 'No missiles left: the magazine refills at a station.'
    if (quiet)
      return back
        ? 'Back from Home: nothing of yours fires on this turn.'
        : 'The first round reaches nobody: nothing fires.'
    if (atBerth) return 'Moored: a ship at a berth fires at nobody. Burn off the berth first.'
    return null
  }

  if (weapons.length + defence.length + sensors.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
        Nothing aboard fires, powers or scans.
      </Typography>
    )
  }

  return (
    <Box data-testid="systems" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
      {quiet && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.35 }}>
          {back
            ? 'Back from Home: this turn is a first round of your own. Nobody touches you until it is over, and you fire at nobody and scan nobody.'
            : 'The first round reaches nobody: no weapon fires and nobody scans.'}
        </Typography>
      )}

      {weapons.length > 0 && (
        <Group label="Weapons">
          {weapons.map(sub => (
            <SystemRow key={sub.id} sub={sub} caption={weaponCaption(sub)}>
              <FireButton sub={sub} disabled={disabled} blocked={fireBlock(sub)} />
            </SystemRow>
          ))}
        </Group>
      )}

      {defence.length > 0 && (
        <Group label="Defence">
          {defence.map(sub => (
            <SystemRow key={sub.id} sub={sub} caption={defenceCaption(sub, plan.powers[sub.id] ?? 0)}>
              <PowerControl sub={sub} disabled={disabled} />
              {getSubsystemConfig(sub.type).weaponStats && (
                <FireButton sub={sub} disabled={disabled} blocked={fireBlock(sub)} />
              )}
            </SystemRow>
          ))}
        </Group>
      )}

      {sensors.length > 0 && (
        <Group label="Sensor">
          {sensors.map(sub => (
            <SystemRow key={sub.id} sub={sub} caption={sensorCaption(sub)}>
              <PowerControl sub={sub} disabled={disabled} />
              <ScanButton
                sub={sub}
                disabled={disabled}
                blocked={
                  sub.isBroken
                    ? 'Broken: it does nothing until repaired.'
                    : quiet
                      ? back
                        ? 'Back from Home: you scan nobody on this turn.'
                        : 'The first round reaches nobody: nobody scans.'
                      : null
                }
              />
            </SystemRow>
          ))}
        </Group>
      )}
    </Box>
  )
}

function weaponCaption(sub: Subsystem): string {
  const config = getSubsystemConfig(sub.type)
  const stats = config.weaponStats!
  if (sub.isBroken) return 'broken'
  if (sub.type === 'missiles') return `${stats.damage} dmg each · ${sub.ammo ?? 0} left`
  return `${stats.damage} dmg · ${stats.ignoresShields ? 'ignores shields' : `${config.minEnergy} energy`}`
}

function defenceCaption(sub: Subsystem, level: number): string {
  if (sub.isBroken) return 'broken'
  if (sub.type === 'shields') {
    return level > 0
      ? `absorbs ${level / SHIELD_ENERGY_PER_POINT} · ${level} energy`
      : `absorbs 1 per ${SHIELD_ENERGY_PER_POINT} energy`
  }
  return `rolls at ${interceptsPerRack()} missiles`
}

function sensorCaption(sub: Subsystem): string {
  if (sub.isBroken) return 'broken'
  return `crits ${SENSOR_CRIT}–10 while up`
}

/** A kind of subsystem, under a faint rule. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <Typography
        variant="overline"
        sx={{
          color: TABLE.inkFaint,
          lineHeight: 1.6,
          fontSize: '0.72rem',
          borderBottom: `1px solid ${TABLE.line}`,
        }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  )
}

/**
 * One subsystem: its mark and its slot named with what sits in it, the
 * engine's numbers for it, and its controls on the right of the second line.
 */
function SystemRow({ sub, caption, children }: { sub: Subsystem; caption: string; children: ReactNode }) {
  const plan = usePlan()
  return (
    <Box
      data-system={sub.id}
      onMouseEnter={() => getSubsystemConfig(sub.type).weaponStats && plan.setFocusWeapon(sub.id)}
      onMouseLeave={() => getSubsystemConfig(sub.type).weaponStats && plan.setFocusWeapon(null)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.4,
        py: 0.6,
        minWidth: 0,
        borderBottom: `1px solid ${TABLE.line}`,
        opacity: sub.isBroken ? 0.6 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <SubsystemIcon type={sub.type} size={16} opacity={1} />
        <Typography
          noWrap
          sx={{ fontSize: '0.875rem', fontWeight: 600, color: TABLE.ink, lineHeight: 1.3, minWidth: 0 }}
        >
          {slotWithSubsystem(sub.id, sub.type)}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontFamily: FONT_MONO,
            fontSize: '0.75rem',
            color: sub.isBroken ? TABLE.danger : TABLE.inkSoft,
            lineHeight: 1.3,
          }}
        >
          {caption}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>{children}</Box>
      </Box>
    </Box>
  )
}

const CONTROL_HEIGHT = 28

/** A tooltip that still shows over a disabled control. */
function Tip({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Tooltip title={title} placement="top">
      <Box component="span" sx={{ display: 'flex' }}>
        {children}
      </Box>
    </Tooltip>
  )
}

/** A step already in the sequence: taken back with its × there. */
function Queued({ label, tone }: { label: string; tone: 'fire' | 'scan' }) {
  const color = tone === 'fire' ? TABLE.accent : TABLE.ink
  return (
    <Box
      sx={{
        height: CONTROL_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 0.4,
        px: 1,
        border: `1px solid ${color}`,
        color,
        typography: 'button',
        fontSize: '0.8rem',
        whiteSpace: 'nowrap',
      }}
    >
      <CheckIcon sx={{ fontSize: 15 }} />
      {label}
    </Box>
  )
}

function FireButton({
  sub,
  disabled,
  blocked,
}: {
  sub: Subsystem
  disabled: boolean
  blocked: string | null
}) {
  const plan = usePlan()
  const config = getSubsystemConfig(sub.type)
  const stats = config.weaponStats!
  const queued = plan.steps.some(s => s.kind === 'fire' && s.subsystemId === sub.id)
  const salvo = sub.type === 'missiles'
  if (queued) {
    return (
      <Tip title="In the sequence below: pick the target there, or take it back with its ×.">
        <Queued label="Firing" tone="fire" />
      </Tip>
    )
  }
  const tip = blocked
    ? `No shot: ${blocked}`
    : `${salvo ? 'Launch a salvo' : 'Fire'}: ${stats.damage} damage${
        stats.ignoresShields ? ', ignores shields' : ''
      }. Puts ${config.minEnergy} energy on it, heat at your check${
        isPowerableType(sub.type) ? ', and it is up until your next turn' : ''
      }.`
  return (
    <Tip title={tip}>
      <Button
        size="small"
        variant="contained"
        color="primary"
        disabled={disabled || Boolean(blocked)}
        onClick={() => plan.addFire(sub.id)}
        startIcon={<SubsystemIcon type={sub.type} size={14} color="currentColor" opacity={1} />}
        sx={{ height: CONTROL_HEIGHT, minWidth: 0, px: 1.25, fontSize: '0.8rem', whiteSpace: 'nowrap' }}
      >
        Fire
      </Button>
    </Tip>
  )
}

/**
 * The power a shield, rack or sensor stands at until your next turn: every
 * legal setting as a segment, off first. A subsystem a step fires or scans
 * with shows that instead, because the step already leaves it powered.
 */
function PowerControl({ sub, disabled }: { sub: Subsystem; disabled: boolean }) {
  const plan = usePlan()
  const config = getSubsystemConfig(sub.type)
  const usedBy = plan.usedBy(sub.id)
  if (usedBy) {
    return (
      <Tip
        title={
          usedBy === 'fire'
            ? 'It fires this turn and keeps that energy until your next turn, so it is up anyway: each subsystem does one thing a turn.'
            : 'It scans this turn and keeps that energy until your next turn, so every shot after the scan has the wider critical range.'
        }
      >
        <Box
          sx={{
            height: CONTROL_HEIGHT,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            px: 0.75,
            border: `1px dashed ${TABLE.unlitEdge}`,
            color: TABLE.inkSoft,
            typography: 'button',
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
          }}
        >
          Up
        </Box>
      </Tip>
    )
  }

  const step = energyStepOf(sub.type)
  const levels = [0]
  for (let n = config.minEnergy; n <= config.maxEnergy; n += step) levels.push(n)
  const onOff = levels.length === 2
  const current = plan.powers[sub.id] ?? 0
  const label = (n: number) => (n === 0 ? 'Off' : onOff ? 'On' : `${n}`)
  const tip = (n: number) =>
    sub.isBroken
      ? 'Broken: it takes no energy until repaired.'
      : n === 0
        ? 'Leave it off: no energy, no heat.'
        : `Power it at ${n}: ${poweredEffect(sub.type)}, until your next turn. ${n} heat at your check, and powering does not turn it face-up.`

  return (
    <Box role="group" aria-label={`Power ${slotWithSubsystem(sub.id, sub.type)}`} sx={{ display: 'flex' }}>
      {levels.map((n, i) => (
        <Tip key={n} title={tip(n)}>
          <ToggleButton
            value={n}
            size="small"
            selected={current === n}
            disabled={disabled || sub.isBroken}
            onClick={() => plan.setEnergyTo(sub.id, n)}
            sx={{
              height: CONTROL_HEIGHT,
              minWidth: onOff ? 40 : 32,
              px: 0.75,
              py: 0,
              fontSize: '0.8rem',
              lineHeight: 1,
              fontFamily: n === 0 || onOff ? undefined : FONT_MONO,
              ml: i === 0 ? 0 : '-1px',
            }}
          >
            {label(n)}
          </ToggleButton>
        </Tip>
      ))}
    </Box>
  )
}

function ScanButton({
  sub,
  disabled,
  blocked,
}: {
  sub: Subsystem
  disabled: boolean
  blocked: string | null
}) {
  const plan = usePlan()
  if (plan.steps.some(s => s.kind === 'scan')) {
    return (
      <Tip title="In the sequence below: pick the ship and the slot there, or take it back with its ×.">
        <Queued label="Scanning" tone="scan" />
      </Tip>
    )
  }
  return (
    <Tip
      title={
        blocked
          ? `No scan: ${blocked}`
          : `Scan a ship on your ring within 3 sectors and look at one of their face-down subsystems. Puts ${
              getSubsystemConfig(sub.type).minEnergy
            } energy on the sensor, up until your next turn.`
      }
    >
      <Button
        size="small"
        variant="outlined"
        color="primary"
        disabled={disabled || Boolean(blocked)}
        onClick={plan.addScan}
        startIcon={<SubsystemIcon type={sub.type} size={14} color="currentColor" opacity={1} />}
        sx={{
          height: CONTROL_HEIGHT,
          minWidth: 0,
          px: 1.25,
          fontSize: '0.8rem',
          whiteSpace: 'nowrap',
          borderColor: TABLE.inkSoft,
          '&:hover': { borderColor: TABLE.ink, backgroundColor: TABLE.hover },
        }}
      >
        Scan
      </Button>
    </Tip>
  )
}
