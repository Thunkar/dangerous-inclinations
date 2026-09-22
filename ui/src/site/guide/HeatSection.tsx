/**
 * 05 · Energy, which is heat: every action puts energy on the tile it uses,
 * and every point of energy on the loadout is a point of heat at the check.
 *
 * The worked check is the engine's arithmetic (`heatAfterCheck`) on a turn
 * worth taking, so the example cannot drift from the rule it illustrates.
 */
import { Box } from '@mui/material'
import {
  BURN_COSTS,
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  SHIELD_ENERGY_PER_POINT,
  SHIELD_HEAT_PER_POINT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  heatAfterCheck,
} from '@dangerous-inclinations/engine'
import { PRESS } from '../../design/press'
import { Body, Slab } from '../poster'
import { RADIATOR_DISSIPATION, energyLabel } from '../numbers'
import { GuideSection, Ledger, Points, SubHead, TileChip } from './parts'

const energy = (type: keyof typeof SUBSYSTEM_CONFIGS) => SUBSYSTEM_CONFIGS[type].minEnergy

/** The example turn: a railgun shot and a hard burn, behind a full shield. */
const EXAMPLE = {
  carried: 3,
  spent: energy('railgun') + BURN_COSTS.hard.energy + SUBSYSTEM_CONFIGS.shields.maxEnergy,
}
const atCheck = EXAMPLE.carried + EXAMPLE.spent
const hull = Math.max(0, atCheck - MAX_HEAT)
const carries = heatAfterCheck(atCheck, DEFAULT_DISSIPATION_CAPACITY)

export function HeatSection() {
  return (
    <GuideSection
      id="heat"
      n={5}
      kicker="Energy and heat"
      title="Every action costs energy"
      lede="Every action puts energy on the tile it uses. At your heat check, every point of energy on your loadout is 1 heat."
      tone="deep"
    >
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 4, md: 6 },
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
          <Points
            items={[
              <>
                Energy <b>stays on the tile until your next turn</b>, so shields, a rack or a sensor
                you power work through everyone else&rsquo;s turn.
              </>,
              <>
                Over {MAX_HEAT} heat at your check is hull damage. Dissipate{' '}
                {DEFAULT_DISSIPATION_CAPACITY} (+{RADIATOR_DISSIPATION} a radiator) and carry the
                rest.
              </>,
              <>At 0 heat at your check, repair one broken tile.</>,
              <>Nothing caps what you power at once. The hull pays.</>,
            ]}
          />
          <Box>
            <SubHead>Energy an action puts on its tile</SubHead>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <TileChip type="rotation" label="Rotate" value={energy('rotation')} />
              <TileChip type="engines" label="Burn" value={energyLabel('engines')} />
              <TileChip type="engines" label="Jump" value={WELL_TRANSFER_COSTS.energy} />
              <TileChip type="scoop" label="Scoop" value={energy('scoop')} />
              <TileChip type="railgun" label="Railgun" value={energy('railgun')} />
              <TileChip type="laser" label="Laser" value={energy('laser')} />
              <TileChip type="missiles" label="Salvo" value={energy('missiles')} />
              <TileChip type="ballistic_rack" label="Rack" value={energy('ballistic_rack')} />
              <TileChip type="sensor_array" label="Sensor" value={energy('sensor_array')} />
              <TileChip type="shields" label="Shields" value={energyLabel('shields')} tone="red" />
            </Box>
            <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 1.25 }}>
              Shields: {SHIELD_ENERGY_PER_POINT} energy stop 1 damage and become{' '}
              {SHIELD_HEAT_PER_POINT} heat.
            </Body>
          </Box>
        </Box>

        <Box sx={{ border: `4px solid ${PRESS.ink}`, bgcolor: PRESS.paper, p: { xs: 2, sm: 3 } }}>
          <SubHead>A check, worked</SubHead>
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
          <Box sx={{ mt: 2.5 }}>
            <Slab to={{ kind: 'tools', tool: 'heat' }} tone="ink">
              Run the check on a phone &rarr;
            </Slab>
          </Box>
        </Box>
      </Box>
    </GuideSection>
  )
}
