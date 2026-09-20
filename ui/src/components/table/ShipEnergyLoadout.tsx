/**
 * Ship & energy — the first thing you do on your turn.
 *
 * The hull with every tile seated in its rail, the cubes routed to each of
 * them, and what is left in the reactor. A tile that takes energy prints a
 * row of cells: lit up to what it holds, hollow to its maximum, with a tick
 * after the minimum it needs to do anything at all. Passive tiles print no
 * cells at all — they never take a cube — and nothing is ever written under
 * a tile: missile ammo is read off the status block above.
 *
 * Left click powers a tile up (to its minimum from cold, then one cube at a
 * time); right click takes a cube back, and turns the tile off at its
 * minimum. A cell can also be clicked directly to set the level — below the
 * minimum that means off, because a tile is either off or powered.
 *
 * Nothing here touches the ship: these are cubes moved on your own loadout, and
 * they leave as allocate/deallocate actions when you end the turn.
 */
import { Box, Typography } from '@mui/material'
import type { Subsystem, SubsystemId } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { SectionLabel } from '../common/Panel'
import { SubsystemTile } from '../common/SubsystemTile'
import { EnergyCubes } from '../common/Tokens'
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
  const free = plan.availableEnergy

  const subsystem = (id: SubsystemId): Subsystem | undefined =>
    plan.pendingSubsystems.find(s => s.id === id)

  const tile = (id: SubsystemId) => {
    const sub = subsystem(id)
    if (!sub) return <Box key={id} sx={{ width: TILE, height: TILE }} />
    const config = getSubsystemConfig(sub.type)
    const passive = config.maxEnergy === 0
    const live = !disabled && !sub.isBroken && !passive

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, alignSelf: 'stretch' }}>
        <SectionLabel sx={{ flexShrink: 0 }}>Reactor</SectionLabel>
        <EnergyCubes
          count={free}
          capacity={me.ship.reactor.totalCapacity}
          size={11}
          title={`${free} of ${me.ship.reactor.totalCapacity} cubes still in the reactor`}
        />
        <Typography
          data-testid="reactor-free"
          sx={{ fontFamily: FONT_MONO, fontSize: '0.8rem', color: TABLE.ink, fontWeight: 700 }}
        >
          {free}
          <Box component="span" sx={{ color: TABLE.inkFaint, fontWeight: 400 }}>
            {' '}
            free
          </Box>
        </Typography>
      </Box>
    </Box>
  )
}

/** Name, what the tile holds, and what it needs — the same on every tile. */
function TileTip({ sub }: { sub: Subsystem }) {
  const config = getSubsystemConfig(sub.type)
  const passive = config.maxEnergy === 0
  return (
    <Box>
      <Typography sx={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: '0.82rem' }}>
        {slotLabel(sub.id)}: {config.name}
      </Typography>
      {passive ? (
        <Typography variant="caption" sx={{ display: 'block' }}>
          Passive — it works without a cube.
        </Typography>
      ) : (
        <>
          <Typography variant="caption" sx={{ display: 'block' }}>
            Energy {sub.allocatedEnergy}/{config.maxEnergy} · min {config.minEnergy} to power
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', color: TABLE.inkFaint }}>
            Left click adds a cube · right click takes one back
          </Typography>
        </>
      )}
      {sub.isBroken && (
        <Typography variant="caption" sx={{ display: 'block', color: TABLE.danger }}>
          BROKEN — it takes no energy until repaired
        </Typography>
      )}
    </Box>
  )
}
