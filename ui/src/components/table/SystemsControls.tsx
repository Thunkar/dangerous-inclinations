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
  D10_FACES,
  SCAN_SECTOR_RANGE,
  SHIELD_POINTS_PER_ENERGY,
  SLOT_IDS,
  canFireFrom,
  fill,
  getSubsystemConfig,
  interceptsPerRack,
  isOpeningRound,
  isPowerableType,
  isQuietTurn,
} from '@dangerous-inclinations/engine'
import { usePlan } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { SubsystemIcon } from '../common/SubsystemIcon'
import { FONT_MONO } from '../../theme'
import { TABLE } from '../../design/tokens'
import { hullOf, slotWithSubsystem } from '../../utils/slots'
import { subsystemGroup } from '../../utils/subsystemGroups'
import { PLASMA_SHIELD_POINTS, SENSOR_CRIT, poweredEffect } from '../../site/numbers'
import { ACTIONS } from '../../text/actions'

const T = ACTIONS.systems

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
   * there at the end. A moored ship fires at nobody (RULES §Stations, Moored).
   * A turn that arrives at a berth is not moored until it docks, so it fires
   * before and after its move.
   */
  const atBerth = !canFireFrom(plan.me.ship, plan.finalPosition.position, view.stations)

  const fireBlock = (sub: Subsystem): string | null => {
    if (sub.isBroken) return T.broken
    if (sub.type === 'missiles' && (sub.ammo ?? 0) <= 0) return T.noMissiles
    if (quiet) return back ? T.backNoFire : T.openingNoFire
    if (atBerth) return T.mooredNoFire
    return null
  }

  if (weapons.length + defence.length + sensors.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
        {T.empty}
      </Typography>
    )
  }

  return (
    <Box
      data-testid="systems"
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}
    >
      {quiet && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.35 }}>
          {back ? T.quietBack : T.quietOpening}
        </Typography>
      )}

      {weapons.length > 0 && (
        <Group label={T.groups.weapons}>
          {weapons.map(sub => (
            <SystemRow key={sub.id} sub={sub} caption={weaponCaption(sub)}>
              <FireButton sub={sub} disabled={disabled} blocked={fireBlock(sub)} />
            </SystemRow>
          ))}
        </Group>
      )}

      {defence.length > 0 && (
        <Group label={T.groups.defence}>
          {defence.map(sub => (
            <SystemRow
              key={sub.id}
              sub={sub}
              caption={defenceCaption(sub, plan.powers[sub.id] ?? 0)}
            >
              <PowerControl sub={sub} disabled={disabled} />
              {getSubsystemConfig(sub.type).weaponStats && (
                <FireButton sub={sub} disabled={disabled} blocked={fireBlock(sub)} />
              )}
            </SystemRow>
          ))}
        </Group>
      )}

      {sensors.length > 0 && (
        <Group label={T.groups.sensor}>
          {sensors.map(sub => (
            <SystemRow key={sub.id} sub={sub} caption={sensorCaption(sub)}>
              <PowerControl sub={sub} disabled={disabled} />
              <ScanButton
                sub={sub}
                disabled={disabled}
                blocked={
                  sub.isBroken ? T.broken : quiet ? (back ? T.backNoScan : T.openingNoScan) : null
                }
              />
            </SystemRow>
          ))}
        </Group>
      )}
    </Box>
  )
}

const C = T.caption

function weaponCaption(sub: Subsystem): string {
  const config = getSubsystemConfig(sub.type)
  const stats = config.weaponStats!
  if (sub.isBroken) return C.broken
  if (sub.type === 'missiles')
    return fill(C.missiles, { damage: stats.damage, ammo: sub.ammo ?? 0 })
  return stats.ignoresShields
    ? fill(C.pierces, { damage: stats.damage })
    : fill(C.weapon, { damage: stats.damage, energy: config.minEnergy })
}

function defenceCaption(sub: Subsystem, level: number): string {
  if (sub.isBroken) return C.broken
  if (sub.type === 'shields') {
    return level > 0
      ? fill(C.shieldsUp, { points: level * SHIELD_POINTS_PER_ENERGY, energy: level })
      : fill(C.shields, { points: SHIELD_POINTS_PER_ENERGY, plasma: PLASMA_SHIELD_POINTS })
  }
  return fill(C.rack, { count: interceptsPerRack() })
}

function sensorCaption(sub: Subsystem): string {
  if (sub.isBroken) return C.broken
  return fill(C.sensor, { from: SENSOR_CRIT, top: D10_FACES })
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
function SystemRow({
  sub,
  caption,
  children,
}: {
  sub: Subsystem
  caption: string
  children: ReactNode
}) {
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
          sx={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: TABLE.ink,
            lineHeight: 1.3,
            minWidth: 0,
          }}
        >
          {slotWithSubsystem(sub.id, sub.type, hullOf(plan.me))}
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {children}
        </Box>
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
      <Tip title={T.fire.queuedTip}>
        <Queued label={T.fire.queued} tone="fire" />
      </Tip>
    )
  }
  const tip = blocked
    ? fill(T.fire.blocked, { reason: blocked })
    : fill(T.fire.tip, {
        verb: salvo ? T.fire.salvo : T.fire.shot,
        damage: stats.damage,
        pierces: stats.ignoresShields ? T.fire.pierces : '',
        energy: config.minEnergy,
        up: isPowerableType(sub.type) ? T.fire.up : '',
      })
  return (
    <Tip title={tip}>
      <Button
        size="small"
        variant="contained"
        color="primary"
        disabled={disabled || Boolean(blocked)}
        onClick={() => plan.addFire(sub.id)}
        startIcon={<SubsystemIcon type={sub.type} size={14} color="currentColor" opacity={1} />}
        sx={{
          height: CONTROL_HEIGHT,
          minWidth: 0,
          px: 1.25,
          fontSize: '0.8rem',
          whiteSpace: 'nowrap',
        }}
      >
        {T.fire.label}
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
      <Tip title={usedBy === 'fire' ? T.power.firesTip : T.power.scansTip}>
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
          {T.power.up}
        </Box>
      </Tip>
    )
  }

  const levels = [0]
  for (let n = config.minEnergy; n <= config.maxEnergy; n++) levels.push(n)
  const onOff = levels.length === 2
  const current = plan.powers[sub.id] ?? 0
  const label = (n: number) => (n === 0 ? T.power.off : onOff ? T.power.on : `${n}`)
  const tip = (n: number) =>
    sub.isBroken
      ? T.power.brokenTip
      : n === 0
        ? T.power.offTip
        : fill(T.power.onTip, { energy: n, effect: poweredEffect(sub.type) })

  return (
    <Box
      role="group"
      aria-label={fill(T.power.label, {
        slot: slotWithSubsystem(sub.id, sub.type, hullOf(plan.me)),
      })}
      sx={{ display: 'flex' }}
    >
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
      <Tip title={T.scan.queuedTip}>
        <Queued label={T.scan.queued} tone="scan" />
      </Tip>
    )
  }
  return (
    <Tip
      title={
        blocked
          ? fill(T.scan.blocked, { reason: blocked })
          : fill(T.scan.tip, {
              range: SCAN_SECTOR_RANGE,
              energy: getSubsystemConfig(sub.type).minEnergy,
            })
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
        {T.scan.label}
      </Button>
    </Tip>
  )
}
