/**
 * The heat check, done for you.
 *
 * Heat is a track that does not reset, which is the part a table gets wrong:
 * the turn's energy goes on, the excess over the top comes off the hull, the
 * dissipation comes off the rest and what is left rides into the next turn.
 * Three numbers in, the tally out, and the arithmetic is the engine's
 * (`heatAfterCheck`). The tally is the one the cheatsheet works by hand.
 *
 * "Carry" is what makes it a tracker rather than a calculator: it rolls the
 * result into the next turn's carried heat and clears the turn. The carried
 * number is kept in this browser, so a phone locking does not lose the game's
 * one piece of state a table cannot re-derive.
 */
import { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  DEFAULT_DISSIPATION_CAPACITY,
  MAX_HEAT,
  SHIELD_HEAT_PER_POINT,
  SIDE_SLOT_COUNT,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  heatAfterCheck,
} from '@dangerous-inclinations/engine'
import { TileIcon } from '../../art/glyphs'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Slab } from '../poster'
import { RADIATOR_DISSIPATION } from '../numbers'
import { Ledger } from '../guide/parts'
import type { LedgerRow } from '../guide/parts'
import { Field, Label, Plate, Stepper } from './controls'

/** The energy each action puts on its tile, priced off the tiles rather than typed out. */
const ADDS: Array<{ label: string; type: SubsystemType; heat: number }> = [
  { label: 'rotate', type: 'rotation', heat: SUBSYSTEM_CONFIGS.rotation.minEnergy },
  { label: 'soft burn', type: 'engines', heat: BURN_COSTS.soft.energy },
  { label: 'medium burn', type: 'engines', heat: BURN_COSTS.medium.energy },
  { label: 'hard burn', type: 'engines', heat: BURN_COSTS.hard.energy },
  { label: 'jump', type: 'engines', heat: WELL_TRANSFER_COSTS.energy },
  { label: 'scoop', type: 'scoop', heat: SUBSYSTEM_CONFIGS.scoop.minEnergy },
  { label: 'railgun', type: 'railgun', heat: SUBSYSTEM_CONFIGS.railgun.minEnergy },
  { label: 'laser', type: 'laser', heat: SUBSYSTEM_CONFIGS.laser.minEnergy },
  { label: 'salvo', type: 'missiles', heat: SUBSYSTEM_CONFIGS.missiles.minEnergy },
  { label: 'rack', type: 'ballistic_rack', heat: SUBSYSTEM_CONFIGS.ballistic_rack.minEnergy },
  { label: 'sensor', type: 'sensor_array', heat: SUBSYSTEM_CONFIGS.sensor_array.minEnergy },
  { label: 'shields', type: 'shields', heat: SUBSYSTEM_CONFIGS.shields.minEnergy },
  { label: 'full shields', type: 'shields', heat: SUBSYSTEM_CONFIGS.shields.maxEnergy },
  { label: 'point absorbed', type: 'shields', heat: SHIELD_HEAT_PER_POINT },
]

const STORAGE_KEY = 'di.tools.heat'
const TURN_CEILING = 30

function loadCarried(): number {
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY))
    return Number.isInteger(raw) && raw >= 0 && raw <= MAX_HEAT ? raw : 0
  } catch {
    return 0
  }
}

export function HeatTrackerTool() {
  const [carried, setCarried] = useState(loadCarried)
  const [spent, setSpent] = useState(0)
  const [radiators, setRadiators] = useState(0)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(carried))
    } catch {
      // A private window refuses to store; the check still works this turn.
    }
  }, [carried])

  const dissipation = DEFAULT_DISSIPATION_CAPACITY + radiators * RADIATOR_DISSIPATION
  const atCheck = carried + spent
  const damage = Math.max(0, atCheck - MAX_HEAT)
  const next = heatAfterCheck(atCheck, dissipation)

  const rows: LedgerRow[] = [
    { value: `${carried}`, label: 'carried in' },
    { value: `+${spent}`, label: 'energy, and heat absorbed' },
    { value: `${atCheck}`, label: 'at the check', rule: true },
  ]
  if (atCheck === 0) rows.push({ value: '0', label: 'cold: repair one broken tile', tone: 'ink' })
  if (damage > 0) {
    rows.push({ value: `−${damage}`, label: `hull: everything over ${MAX_HEAT}`, tone: 'red' })
    rows.push({ value: `${MAX_HEAT}`, label: 'the track stops at the top' })
  }
  rows.push({
    value: `−${dissipation}`,
    label:
      radiators > 0 ? `dissipate (${radiators} radiator${radiators > 1 ? 's' : ''})` : 'dissipate',
  })
  rows.push({ value: `${next}`, label: 'into your next turn', tone: 'ink' })

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr' },
        alignItems: 'start',
      }}
    >
      <Plate>
        <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap' }}>
          <Field label="Carried in">
            <Stepper
              value={carried}
              min={0}
              max={MAX_HEAT}
              onChange={setCarried}
              label="heat carried in"
            />
          </Field>
          <Field label="This turn">
            <Stepper
              value={spent}
              min={0}
              max={TURN_CEILING}
              onChange={setSpent}
              label="heat this turn"
            />
          </Field>
          <Field label="Radiators">
            <Stepper
              value={radiators}
              min={0}
              max={SIDE_SLOT_COUNT}
              onChange={setRadiators}
              label="working radiators"
            />
          </Field>
        </Box>

        <Box sx={{ mt: 3 }}>
          <Label>Add each action, and what your shields took</Label>
          <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap', mt: 1 }}>
            {ADDS.map(add => (
              <Box
                key={add.label}
                component="button"
                type="button"
                onClick={() => setSpent(c => Math.min(TURN_CEILING, c + add.heat))}
                sx={{
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.75,
                  pl: 1,
                  pr: 0,
                  border: `2px solid ${PRESS.ink}`,
                  bgcolor: 'transparent',
                  color: PRESS.ink,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  '&:hover': { bgcolor: PRESS.ink, color: PRESS.paper },
                }}
              >
                <TileIcon type={add.type} size={18} title={null} />
                <Box
                  component="span"
                  sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem', fontWeight: 600 }}
                >
                  {add.label}
                </Box>
                <Box
                  component="span"
                  sx={{
                    alignSelf: 'stretch',
                    display: 'flex',
                    alignItems: 'center',
                    px: 1,
                    bgcolor: PRESS.red,
                    color: PRESS.paper,
                    fontFamily: FONT_DISPLAY,
                    fontWeight: 700,
                    fontSize: '1.05rem',
                  }}
                >
                  +{add.heat}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Plate>

      <Plate>
        <Label>The check</Label>
        <Box sx={{ mt: 1.5 }}>
          <Ledger rows={rows} />
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3 }}>
          <Slab
            tone="red"
            onClick={() => {
              setCarried(next)
              setSpent(0)
            }}
          >
            Carry {next} into the next turn
          </Slab>
          <Slab
            tone="paper"
            onClick={() => {
              setCarried(0)
              setSpent(0)
            }}
          >
            Reset
          </Slab>
        </Box>
      </Plate>
    </Box>
  )
}
