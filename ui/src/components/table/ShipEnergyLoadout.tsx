/**
 * The ship: every tile seated in its rail, with the cubes the turn puts on it.
 *
 * **The cubes are a readout, not a control.** A tile that acts is powered by
 * the step that uses it, so its cells fill as you build the turn: pick a hard
 * burn and the engines light to three, add a shot and the gun lights to its
 * four. Nothing to set, and nothing to get wrong.
 *
 * The exceptions are the three tiles that work while you are not acting:
 * shields, a ballistic rack and a sensor array. Those you hold up yourself,
 * and only those answer a click: left to switch on (to the minimum, then a
 * step at a time), right to come back down, or click a cell to set the level.
 * A shield reads 0, 2 or 4, because two cubes buy one point.
 *
 * There is no reactor to draw. Nothing caps what a ship lights at once: every
 * cube here is a point of heat at the check, and the status block's heat
 * readout is where that lands.
 */
import { Box, Typography } from '@mui/material'
import type { Subsystem, SubsystemId } from '@dangerous-inclinations/engine'
import { getSubsystemConfig, isStandingType } from '@dangerous-inclinations/engine'
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
    // Only a standing tile is a control; the rest are lit by the turn.
    const live = !disabled && !sub.isBroken && isStandingType(sub.type)

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
          tooltip={<TileTip sub={sub} />}
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
      <ShipDisplay
        appearance={me.appearance}
        identityColor={getPlayerColor(view.players.findIndex(p => p.id === me.id))}
        metrics={MAT_METRICS}
        slots={{ forward: [tile('forward-0')], side: SLOT_IDS.slice(1).map(tile) }}
        fixed={{ aft: [tile('engines'), tile('rotation')], forward: [tile('scoop')] }}
      />
    </Box>
  )
}

/** Name, what the tile holds, and whether it is yours to set. */
function TileTip({ sub }: { sub: Subsystem }) {
  const config = getSubsystemConfig(sub.type)
  const passive = config.maxEnergy === 0
  const standing = isStandingType(sub.type)
  return (
    <Box>
      <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: '0.82rem' }}>
        {slotLabel(sub.id)}: {config.name}
      </Typography>
      {passive ? (
        <Typography variant="caption" sx={{ display: 'block' }}>
          Passive: it works without a cube.
        </Typography>
      ) : standing ? (
        <>
          <Typography variant="caption" sx={{ display: 'block' }}>
            Standing {sub.allocatedEnergy}/{config.maxEnergy} · it works while you are not acting,
            so it is up until you take it down and costs its cubes in heat at every check
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: TABLE.inkFaint }}>
            Left click brings it up · right click takes it down
          </Typography>
        </>
      ) : (
        <>
          <Typography variant="caption" sx={{ display: 'block' }}>
            Takes {config.minEnergy} cubes when it acts, and every cube is heat at your check
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
