import { Typography } from '@mui/material'
import { fill } from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { hullOf, slotWithSubsystem } from '../../../utils/slots'
import { ACTIONS } from '../../../text/actions'
import { ChoiceChip, ChoiceRow, OfferSection } from './parts'

const T = ACTIONS.repair

/**
 * Naming the tile a cold ship's crew will fix. It appears only when the turn as
 * built would end at 0 heat and something is broken, because those are exactly
 * the turns on which it can happen. A control that offered itself and then did
 * nothing would be worse than none.
 */
export function RepairControl() {
  const plan = usePlan()
  const disabled = plan.disabled
  const broken = plan.me.ship.subsystems.filter(s => s.isBroken)
  if (broken.length === 0) return null

  const offered = plan.repairable
  return (
    <OfferSection label={T.label}>
      {offered.length === 0 ? (
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkSoft }}>
          {T.hot}
        </Typography>
      ) : (
        <ChoiceRow>
          {broken.map(sub => {
            const can = offered.includes(sub.id)
            const on = plan.repairChoice === sub.id
            const slot = slotWithSubsystem(sub.id, sub.type, hullOf(plan.me))
            return (
              <ChoiceChip
                key={sub.id}
                title={fill(T.tip, { slot })}
                selected={on}
                disabled={disabled || !can}
                opacity={can ? 1 : 0.45}
                onClick={() => plan.setRepairChoice(on ? null : sub.id)}
              >
                {slot}
              </ChoiceChip>
            )
          })}
        </ChoiceRow>
      )}
    </OfferSection>
  )
}
