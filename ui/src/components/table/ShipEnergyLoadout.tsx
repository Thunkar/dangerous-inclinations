/**
 * The ship: every tile seated in its rail, with the energy the turn puts on it.
 *
 * **The energy is a readout, not a control.** Every action puts energy on the
 * tile it uses, so its cells fill as you build the turn: pick a hard burn and
 * the engines light to three, add a shot and the gun lights to its four.
 * Nothing to set, and nothing to get wrong. Your loadout is cleared when your
 * turn executes, so what is drawn here starts empty every turn.
 *
 * The exceptions are the three tiles that work on other players' turns:
 * shields, a ballistic rack and a sensor array. Powering one is an action, and
 * these are its controls: left click powers it (shields 2, then 4, then off; a
 * rack or a sensor 2, then off), right click takes it back a step, or click a
 * cell to set the level. A tile the turn fires or scans with is not powered as
 * well: each tile does one thing a turn, and the action leaves it up anyway.
 *
 * There is no reactor to draw. Nothing caps what a ship powers at once: every
 * point of energy here is a point of heat at the check, and the status block's
 * heat readout is where that lands.
 */
import { Box, Typography } from '@mui/material'
import type { Subsystem, SubsystemId } from '@dangerous-inclinations/engine'
import {
  BASE_CRITICAL_CHANCE,
  SHIELD_ENERGY_PER_POINT,
  getSubsystemConfig,
  interceptsPerRack,
  isPowerableType,
  rollToResult,
} from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { SubsystemTile } from '../common/SubsystemTile'
import { ShipDisplay } from '../ship'
import { useGame } from '../../context/GameContext'
import { getPlayerColor } from '../../utils/playerColors'
import { usePlan } from '../../context/PlanContext'
import { useAnimation } from '../../context/AnimationContext'
import { slotLabel } from '../../utils/slots'

const MAT_METRICS = { width: 252, height: 196, band: 44 }
const TILE = 32
const CUBE = 7

const SLOT_IDS: SubsystemId[] = ['forward-0', 'side-0', 'side-1', 'side-2', 'side-3']

export function ShipEnergyLoadout({ disabled }: { disabled: boolean }) {
  const plan = usePlan()
  const { view } = useGame()
  const { pulses } = useAnimation()
  const me = plan.me

  const subsystem = (id: SubsystemId): Subsystem | undefined =>
    plan.pendingSubsystems.find(s => s.id === id)

  const tile = (id: SubsystemId) => {
    const sub = subsystem(id)
    if (!sub) return <Box key={id} sx={{ width: TILE, height: TILE }} />
    const config = getSubsystemConfig(sub.type)
    // Only a tile you can power is a control; the rest are lit by the turn.
    const live = !disabled && plan.canPower(sub.id)

    return (
      <Box
        key={id}
        data-tile={id}
        data-energy={sub.allocatedEnergy}
        data-capacity={config.maxEnergy}
      >
        <SubsystemTile
          id={sub.id}
          type={sub.type}
          knownVia="own"
          isBroken={sub.isBroken}
          allocatedEnergy={sub.allocatedEnergy}
          capacity={config.maxEnergy}
          minEnergy={config.minEnergy}
          size={TILE}
          cubeSize={CUBE}
          pulse={Boolean(pulses[`${me.id}:${sub.id}`])}
          selected={plan.focusWeaponId === sub.id}
          tooltip={<TileTip sub={sub} usedBy={plan.usedBy(sub.id)} />}
          onClick={live ? () => plan.power(sub.id, 1) : undefined}
          onContextMenu={
            live
              ? event => {
                  event.preventDefault()
                  plan.power(sub.id, -1)
                }
              : undefined
          }
          onSetEnergy={
            live
              ? n =>
                  plan.setEnergyTo(sub.id, n < config.minEnergy ? 0 : Math.min(n, config.maxEnergy))
              : undefined
          }
        />
      </Box>
    )
  }

  // Everything that works on other players' turns once this plan is flown: a
  // tile the plan powers, and a rack it fires or a sensor it scans with, which
  // keep their energy until the next turn as well.
  const up = plan.pendingSubsystems.filter(s => isPowerableType(s.type) && s.allocatedEnergy > 0)
  const powerable = plan.pendingSubsystems.some(s => isPowerableType(s.type) && !s.isBroken)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
      <ShipDisplay
        appearance={me.appearance}
        identityColor={getPlayerColor(view.players.findIndex(p => p.id === me.id))}
        metrics={MAT_METRICS}
        slots={{ forward: [tile('forward-0')], side: SLOT_IDS.slice(1).map(tile) }}
        fixed={{ aft: [tile('engines'), tile('rotation')], forward: [tile('scoop')] }}
      />
      {powerable && (
        <Typography
          data-testid="power-summary"
          variant="caption"
          sx={{
            alignSelf: 'stretch',
            color: TABLE.inkSoft,
            lineHeight: 1.3,
            fontFamily: FONT_MONO,
          }}
        >
          {up.length === 0
            ? 'Nothing powered. Click shields, a rack or a sensor to power it.'
            : `Up until your next turn: ${up
                .map(
                  s =>
                    `${getSubsystemConfig(s.type).name} ${s.allocatedEnergy}${
                      (plan.powers[s.id] ?? 0) > 0
                        ? ''
                        : s.type === 'sensor_array'
                          ? ' (scans)'
                          : ' (fires)'
                    }`
                )
                .join(' · ')}.`}
        </Typography>
      )}
    </Box>
  )
}

/** What a powered tile does until your next turn, with the engine's numbers. */
function poweredEffect(sub: Subsystem): string {
  switch (sub.type) {
    case 'shields':
      return `shields absorb 1 damage per ${SHIELD_ENERGY_PER_POINT} energy (not lasers)`
    case 'ballistic_rack':
      return `a rack rolls at ${interceptsPerRack()} missiles a turn`
    case 'sensor_array': {
      const bonus = getSubsystemConfig('sensor_array').passiveEffect?.criticalChanceBonus ?? 0
      const from =
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find(
          face => rollToResult(face, BASE_CRITICAL_CHANCE + bonus) === 'critical'
        ) ?? 10
      return `a sensor makes your criticals ${from}–10`
    }
    default:
      return ''
  }
}

/** Name, what the tile holds, and whether it is yours to power. */
function TileTip({ sub, usedBy }: { sub: Subsystem; usedBy: 'fire' | 'scan' | null }) {
  const config = getSubsystemConfig(sub.type)
  const passive = config.maxEnergy === 0
  const powerable = isPowerableType(sub.type)
  return (
    <Box>
      <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: '0.82rem' }}>
        {slotLabel(sub.id)}: {config.name}
      </Typography>
      {passive ? (
        <Typography variant="caption" sx={{ display: 'block' }}>
          Passive: it works without energy.
        </Typography>
      ) : powerable && usedBy ? (
        <Typography variant="caption" sx={{ display: 'block' }}>
          {usedBy === 'fire'
            ? 'It fires this turn, and its energy stays on until your next turn, so it is up anyway.'
            : 'It scans this turn, and its energy stays on until your next turn, so every shot after the scan has the wider range.'}{' '}
          Each subsystem does one thing a turn: nothing to power.
        </Typography>
      ) : powerable ? (
        <>
          <Typography variant="caption" sx={{ display: 'block' }}>
            Power {sub.allocatedEnergy}/{config.maxEnergy} · powered, it works until your next turn:{' '}
            {poweredEffect(sub)}. Every point of energy is heat at your check, and powering does not
            turn it face-up.
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: TABLE.inkFaint }}>
            {config.maxEnergy > config.minEnergy
              ? `Click: ${config.minEnergy}, ${config.maxEnergy}, off`
              : `Click: ${config.minEnergy}, off`}{' '}
            · right click takes it back a step
          </Typography>
        </>
      ) : (
        <>
          <Typography variant="caption" sx={{ display: 'block' }}>
            Takes {config.minEnergy} energy when it acts, and every point is heat at your check
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: TABLE.inkFaint }}>
            Powered by the step that uses it: nothing to set
          </Typography>
        </>
      )}
      {sub.isBroken && (
        <Typography variant="caption" sx={{ display: 'block', color: TABLE.danger }}>
          BROKEN · it takes no energy until repaired
        </Typography>
      )}
    </Box>
  )
}
