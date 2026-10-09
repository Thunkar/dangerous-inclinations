/**
 * The ship: every tile seated in its rail, with the energy the turn puts on it.
 *
 * **The energy is a readout, not a control.** Every action puts energy on the
 * tile it uses, so its cells fill as you build the turn: pick a hard burn and
 * the engines light to three, add a shot and the gun lights to its four.
 * Nothing to set, and nothing to get wrong. Your loadout is cleared when your
 * turn executes, so what is drawn here starts empty every turn.
 *
 * The three tiles that work on other players' turns (shields, a ballistic
 * rack and a sensor array) are powered from the Systems step, like every other
 * action: nothing here is a control, so nothing here takes a click.
 *
 * There is no reactor to draw. Nothing caps what a ship powers at once: every
 * point of energy here is a point of heat at the check, and the status block's
 * heat readout is where that lands.
 */
import { Box, Typography } from '@mui/material'
import type { Hull, Subsystem, SubsystemId } from '@dangerous-inclinations/engine'
import { SLOT_IDS, getSubsystemConfig, isPowerableType } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { SubsystemTile } from '../common/SubsystemTile'
import { ShipDisplay } from '../ship'
import { useGame } from '../../context/GameContext'
import { getPlayerColor } from '../../utils/playerColors'
import { usePlan } from '../../context/PlanContext'
import { usePulses } from '../../context/AnimationContext'
import { hullOf, slotWithSubsystem } from '../../utils/slots'
import { poweredEffect } from '../../site/numbers'

const MAT_METRICS = { width: 252, height: 196, band: 44 }
const TILE = 32
const CUBE = 7

const FORWARD_IDS = SLOT_IDS.filter(id => id.startsWith('forward'))
const SIDE_IDS = SLOT_IDS.filter(id => id.startsWith('side'))

export function ShipEnergyLoadout() {
  const plan = usePlan()
  const { view } = useGame()
  const pulses = usePulses()
  const me = plan.me
  const hull = hullOf(me)

  const subsystem = (id: SubsystemId): Subsystem | undefined =>
    plan.pendingSubsystems.find(s => s.id === id)

  const tile = (id: SubsystemId) => {
    const sub = subsystem(id)
    if (!sub) return <Box key={id} sx={{ width: TILE, height: TILE }} />
    const config = getSubsystemConfig(sub.type)

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
          hull={hull}
          knownVia="own"
          isBroken={sub.isBroken}
          allocatedEnergy={sub.allocatedEnergy}
          capacity={config.maxEnergy}
          minEnergy={config.minEnergy}
          size={TILE}
          cubeSize={CUBE}
          pulse={Boolean(pulses[`${me.id}:${sub.id}`])}
          selected={plan.focusWeaponId === sub.id}
          tooltip={<TileTip sub={sub} hull={hull} usedBy={plan.usedBy(sub.id)} />}
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
        slots={{ forward: FORWARD_IDS.map(tile), side: SIDE_IDS.map(tile) }}
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
          }}
        >
          {up.length === 0
            ? 'Nothing up until your next turn.'
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

/** Name, what the tile holds, and where it is powered from. */
function TileTip({
  sub,
  hull,
  usedBy,
}: {
  sub: Subsystem
  hull: Hull
  usedBy: 'fire' | 'scan' | null
}) {
  const config = getSubsystemConfig(sub.type)
  const passive = config.maxEnergy === 0
  const powerable = isPowerableType(sub.type)
  return (
    <Box>
      <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: '0.82rem' }}>
        {slotWithSubsystem(sub.id, sub.type, hull)}
      </Typography>
      {passive ? (
        <Typography variant="caption" sx={{ display: 'block' }}>
          Passive: it works without energy.
        </Typography>
      ) : powerable && usedBy ? (
        <Typography variant="caption" sx={{ display: 'block' }}>
          {usedBy === 'fire'
            ? 'It fires this turn, and its energy stays on until your next turn, so it is up anyway.'
            : 'It scans this turn, and its energy stays on until your next turn, so every shot after the scan has the wider range.'}
        </Typography>
      ) : powerable ? (
        <>
          <Typography variant="caption" sx={{ display: 'block' }}>
            Power {sub.allocatedEnergy}/{config.maxEnergy} · powered, it works until your next turn:{' '}
            {poweredEffect(sub.type)}. Every point of energy is heat at your check, and powering does
            not turn it face-up.
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: TABLE.inkFaint }}>
            Powered from the Systems step
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
