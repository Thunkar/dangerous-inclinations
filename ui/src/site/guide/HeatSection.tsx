/**
 * 05 · Energy, which is heat: every action puts energy on the tile it uses,
 * and every point of energy on the loadout is a point of heat at the check.
 *
 * The worked check is the engine's arithmetic (`heatAfterCheck`) on a turn
 * worth taking, so the example cannot drift from the rule it illustrates.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  heatAfterCheck,
} from '@dangerous-inclinations/engine'
import { TileIcon } from '../../art/glyphs'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Numeral } from '../poster'
import { RADIATOR_DISSIPATION, energyLabel } from '../numbers'
import { GuideSection, Ledger, Points, SubHead } from './parts'

const energy = (type: keyof typeof SUBSYSTEM_CONFIGS) => SUBSYSTEM_CONFIGS[type].minEnergy

/** The example turn: a railgun shot and a hard burn, behind a full shield. */
const EXAMPLE = {
  carried: 3,
  spent: energy('railgun') + BURN_COSTS.hard.energy + SUBSYSTEM_CONFIGS.shields.maxEnergy,
}
const atCheck = EXAMPLE.carried + EXAMPLE.spent
const hull = Math.max(0, atCheck - MAX_HEAT)
const carries = heatAfterCheck(atCheck, DEFAULT_DISSIPATION_CAPACITY)

/** One action's energy: its mark and name, and the figure it puts on the subsystem. */
function EnergyCell({
  type,
  label,
  value,
}: {
  type: SubsystemType
  label: string
  value: ReactNode
}) {
  return (
    <Box
      sx={{
        border: `2px solid ${PRESS.ink}`,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, px: 0.75, py: 0.6 }}>
        <TileIcon type={type} size={16} title={null} />
        <Box
          component="span"
          sx={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            fontSize: '0.85rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </Box>
      </Box>
      <Box sx={{ bgcolor: PRESS.ink, px: 0.75, py: 0.4, textAlign: 'right' }}>
        <Numeral size="1.6rem" color={PRESS.paper}>
          {value}
        </Numeral>
      </Box>
    </Box>
  )
}

export function HeatSection() {
  return (
    <GuideSection
      id="heat"
      n={5}
      kicker="Energy and heat"
      title="Every action costs energy"
      lede="At your heat check, every point of energy on your loadout is 1 heat."
      tone="deep"
    >
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 4, md: 6 },
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          alignItems: 'stretch',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          <Points
            items={[
              <>
                Energy <b>stays on the subsystem until your next turn</b>, so shields, a rack or a
                sensor you power work through everyone else&rsquo;s turn.
              </>,
              <>
                Over {MAX_HEAT} heat at your check is hull damage. Dissipate{' '}
                {DEFAULT_DISSIPATION_CAPACITY} (+{RADIATOR_DISSIPATION} a radiator) and carry the
                rest.
              </>,
              <>If you have 0 heat at your check, repair one broken subsystem.</>,
            ]}
          />
          <Box>
            <SubHead>Energy an action puts on its subsystem</SubHead>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' },
                gap: 1,
              }}
            >
              <EnergyCell type="rotation" label="Rotate" value={energy('rotation')} />
              <EnergyCell type="engines" label="Burn" value={energyLabel('engines')} />
              <EnergyCell type="engines" label="Jump" value={WELL_TRANSFER_COSTS.energy} />
              <EnergyCell type="scoop" label="Scoop" value={energy('scoop')} />
              <EnergyCell type="railgun" label="Railgun" value={energy('railgun')} />
              <EnergyCell type="laser" label="Laser" value={energy('laser')} />
              <EnergyCell type="missiles" label="Salvo" value={energy('missiles')} />
              <EnergyCell type="ballistic_rack" label="Rack" value={energy('ballistic_rack')} />
              <EnergyCell type="sensor_array" label="Sensor" value={energy('sensor_array')} />
              <EnergyCell type="shields" label="Shields" value={energyLabel('shields')} />
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            border: `4px solid ${PRESS.ink}`,
            bgcolor: PRESS.paper,
            p: { xs: 2, sm: 3 },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Ledger
            rows={[
              { value: `${EXAMPLE.carried}`, label: 'carried in' },
              {
                value: `+${EXAMPLE.spent}`,
                label: `railgun ${energy('railgun')} · hard burn ${BURN_COSTS.hard.energy} · shields ${SUBSYSTEM_CONFIGS.shields.maxEnergy}`,
              },
              { value: `${atCheck}`, label: 'at the check', rule: true },
              { value: `−${hull}`, label: `hull: over ${MAX_HEAT}`, tone: 'red' },
              { value: `${MAX_HEAT}`, label: 'the track stops' },
              { value: `−${DEFAULT_DISSIPATION_CAPACITY}`, label: 'dissipate' },
              { value: `${carries}`, label: 'into your next turn', tone: 'ink' },
            ]}
          />
        </Box>
      </Box>
    </GuideSection>
  )
}
