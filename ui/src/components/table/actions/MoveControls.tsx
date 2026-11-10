import { Box, Chip, Slider, Typography } from '@mui/material'
import type { BurnIntensity } from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  WELL_TRANSFER_COSTS,
  calculateBurnMassCost,
  calculateJumpMassCost,
  fill,
  getSubsystemConfig,
  getWellName,
  hasWorkingCompressor,
  phasedJumpDestination,
} from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { placeLabel } from '../../../utils/route'
import { STATION_DRIFT } from '../../../site/turn'
import { ACTIONS } from '../../../text/actions'
import { Segment, SegmentedRow } from './parts'
import { inWords, ringsPhrase, signed } from './words'

const T = ACTIONS.move
const W = ACTIONS.words

const INTENSITIES: BurnIntensity[] = ['soft', 'medium', 'hard']

/** What a compressor saves on a jump, in words, from the engine's two prices. */
const COMPRESSOR_NOTE = fill(T.compressor, {
  saved: inWords(WELL_TRANSFER_COSTS.mass - COMPRESSED_JUMP_MASS),
  fuel: inWords(WELL_TRANSFER_COSTS.mass),
})

/**
 * Phasing: the sectors a burn or a jump shifts its arrival by, 1 fuel each.
 * The same control for both, because it is the same rule.
 */
function PhaseSlider({
  value,
  range,
  disabled,
  onChange,
}: {
  value: number
  range: { min: number; max: number }
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{ fontFamily: FONT_MONO, color: TABLE.inkFaint, flexShrink: 0 }}
      >
        {fill(T.phase, { value: signed(value) })}
      </Typography>
      <Slider
        size="small"
        value={value}
        min={range.min}
        max={range.max}
        step={1}
        marks
        valueLabelDisplay="auto"
        disabled={disabled || range.min === range.max}
        onChange={(_, next) => onChange(Array.isArray(next) ? next[0] : next)}
        sx={{ mx: 0.5, flex: 1, minWidth: 0 }}
      />
    </Box>
  )
}

/** Coast, burn or jump: exactly one a turn, and the choices each one has. */
export function MoveControls() {
  const plan = usePlan()
  const disabled = plan.disabled
  const move = plan.moveStep.move
  const compressor = hasWorkingCompressor({ ...plan.me.ship, subsystems: plan.pendingSubsystems })
  const scoop = plan.pendingSubsystems.find(s => s.id === 'scoop')
  /**
   * Whether coming back to a coast keeps the scoop running. The loadout is
   * cleared every turn, so there is no running scoop to read: a coast keeps
   * whatever the scoop chip was last set to, and starts off.
   */
  const scoopReady = Boolean(scoop && !scoop.isBroken && move.kind === 'coast' && move.scoop)
  const burnDirection = plan.moveFrom.facing === 'prograde' ? W.outward : W.inward
  const jumpFuel = move.kind === 'jump' ? calculateJumpMassCost(move.adjustment, compressor) : 0

  /** What an intensity costs, or what is standing in its way. */
  const burnReason = (intensity: BurnIntensity) => {
    const cost = BURN_COSTS[intensity]
    const ready = plan.burnReady[intensity]
    if (!ready.ok) return ready.reason
    return fill(T.intensityTip, {
      rings: ringsPhrase(cost.rings, burnDirection),
      energy: cost.energy,
      fuel: cost.mass,
    })
  }
  /** The mode button offers a burn when any intensity is available. */
  const anyBurn = INTENSITIES.find(i => plan.burnReady[i].ok)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <SegmentedRow testId="move-modes">
        <Segment
          label={T.coast}
          title={plan.moored ? T.mooredTip : T.coastTip}
          selected={move.kind === 'coast'}
          disabled={disabled}
          onClick={() => plan.setMove({ kind: 'coast', scoop: scoopReady })}
        />
        <Segment
          label={T.burn}
          title={anyBurn ? T.burnTip : plan.burnReady.soft.reason}
          selected={move.kind === 'burn'}
          icon="engines"
          disabled={disabled || !anyBurn}
          onClick={() =>
            anyBurn && plan.setMove({ kind: 'burn', intensity: anyBurn, adjustment: 0 })
          }
        />
        <Segment
          label={T.jump}
          title={
            plan.jumpReady.ok
              ? fill(T.jumpTip, { well: getWellName(plan.jumpOptions[0].destination.wellId) })
              : plan.jumpReady.reason
          }
          selected={move.kind === 'jump'}
          icon={compressor ? 'fuel_compressor' : 'engines'}
          disabled={disabled || !plan.jumpReady.ok}
          onClick={() =>
            plan.jumpOptions[0] &&
            // A jump is a burn out of the well: a rotation to prograde goes in first.
            plan.applyMove(
              {
                kind: 'jump',
                destinationWellId: plan.jumpOptions[0].destination.wellId,
                adjustment: 0,
              },
              'prograde'
            )
          }
        />
      </SegmentedRow>

      {move.kind === 'coast' && plan.moored && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.3 }}>
          {fill(T.moored, { drift: STATION_DRIFT })}
        </Typography>
      )}

      {/* A coast's own choice, the way a burn's is its intensity: drift, or
          skim the ring for fuel with the scoop. */}
      {move.kind === 'coast' && (
        <SegmentedRow testId="coast-options">
          <Segment
            label={T.drift}
            title={T.driftTip}
            selected={!move.scoop}
            disabled={disabled}
            onClick={() => plan.setMove({ kind: 'coast', scoop: false })}
          />
          <Segment
            label={fill(T.scoop, { fuel: plan.scoopGain })}
            title={
              !scoop || scoop.isBroken
                ? T.scoopBroken
                : fill(T.scoopTip, {
                    fuel: plan.scoopGain,
                    energy: getSubsystemConfig('scoop').minEnergy,
                  })
            }
            selected={Boolean(move.scoop)}
            icon="scoop"
            disabled={disabled || !scoop || scoop.isBroken}
            onClick={() => plan.setMove({ kind: 'coast', scoop: true })}
          />
        </SegmentedRow>
      )}

      {move.kind === 'burn' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <SegmentedRow testId="burn-intensities">
            {INTENSITIES.map(intensity => (
              <Segment
                key={intensity}
                label={W.intensityLabel[intensity]}
                title={burnReason(intensity)}
                selected={move.intensity === intensity}
                disabled={disabled || !plan.burnReady[intensity].ok}
                onClick={() => plan.setMove({ ...move, intensity })}
              />
            ))}
          </SegmentedRow>
          <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.3 }} noWrap>
            {fill(T.burnCost, {
              rings: ringsPhrase(BURN_COSTS[move.intensity].rings, burnDirection),
              energy: BURN_COSTS[move.intensity].energy,
              fuel: calculateBurnMassCost(BURN_COSTS[move.intensity].mass, move.adjustment),
            })}
          </Typography>
          <PhaseSlider
            value={move.adjustment}
            range={plan.adjustmentRange}
            disabled={disabled}
            onChange={adjustment => plan.setMove({ ...move, adjustment })}
          />
        </Box>
      )}

      {move.kind === 'jump' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {plan.jumpOptions.map(option => {
              const selected = move.destinationWellId === option.destination.wellId
              const landing =
                (selected && phasedJumpDestination(option, move.adjustment)) || option.destination
              return (
                <Chip
                  key={option.lane.id}
                  size="small"
                  label={placeLabel(landing)}
                  color={selected ? 'primary' : 'default'}
                  variant={selected ? 'filled' : 'outlined'}
                  onClick={() =>
                    plan.applyMove(
                      {
                        kind: 'jump',
                        destinationWellId: option.destination.wellId,
                        adjustment: 0,
                      },
                      'prograde'
                    )
                  }
                  disabled={disabled}
                />
              )
            })}
          </Box>
          <PhaseSlider
            value={move.adjustment}
            range={plan.jumpAdjustmentRange}
            disabled={disabled}
            onChange={adjustment => plan.setMove({ ...move, adjustment })}
          />
          <Typography variant="caption" sx={{ color: TABLE.inkSoft, lineHeight: 1.3 }}>
            {fill(T.jumpCost, {
              energy: WELL_TRANSFER_COSTS.energy,
              fuel: jumpFuel,
              compressor: compressor ? COMPRESSOR_NOTE : '',
            })}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
