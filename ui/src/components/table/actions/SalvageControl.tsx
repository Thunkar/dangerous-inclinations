import { fill } from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { useGame } from '../../../context/GameContext'
import { salvageOptionKey } from '../../../plan/preview'
import { ACTIONS } from '../../../text/actions'
import { ChoiceChip, ChoiceRow, OfferSection } from './parts'
import { when, whenTitle } from './words'

const T = ACTIONS.salvage

/**
 * Salvage is a "you may" (RULES §Missions) and a step in the sequence:
 * offered when a Salvage card wants a black box and a wreck is on the sector
 * where the turn starts or where the move ends, or when a shot of the plan
 * could destroy a ship in the sector the ship is in after it (the wreck is
 * there at once, so the step goes right after the shot). One wreck a turn.
 */
export function SalvageControl() {
  const plan = usePlan()
  const { nameOf } = useGame()
  const offer = plan.salvageOffer
  if (!offer) return null
  const chosen = plan.salvageChoice
  return (
    <OfferSection label={T.label}>
      <ChoiceRow>
        {offer.kills.map(kill => {
          const key = salvageOptionKey(kill)
          const on = chosen === key
          const full = chosen !== null && !on
          const name = nameOf(kill.victimId)
          return (
            <ChoiceChip
              key={key}
              title={fill(T.killTip, { name })}
              selected={on}
              disabled={plan.disabled || full}
              opacity={full ? 0.5 : 1}
              onClick={() => plan.toggleSalvage(kill)}
            >
              {fill(T.kill, { name })}
            </ChoiceChip>
          )
        })}
        {offer.wrecks.map((wreck, index) => {
          const on = chosen === salvageOptionKey(wreck)
          const full = chosen !== null && !on
          return (
            <ChoiceChip
              key={wreck.id}
              title={fill(T.wreckTip, { when: whenTitle(wreck.before) })}
              selected={on}
              disabled={plan.disabled || full}
              opacity={full ? 0.5 : 1}
              onClick={() => plan.toggleSalvage(wreck)}
            >
              {offer.wrecks.length > 1
                ? fill(T.wreck, { n: index + 1, when: when(wreck.before) })
                : fill(T.theWreck, { when: when(wreck.before) })}
            </ChoiceChip>
          )
        })}
      </ChoiceRow>
    </OfferSection>
  )
}
