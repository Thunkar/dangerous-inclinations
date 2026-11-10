import { fill } from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { useGame } from '../../../context/GameContext'
import { ACTIONS } from '../../../text/actions'
import { ChoiceChip, ChoiceRow, OfferSection } from './parts'
import { when, whenTitle } from './words'

const T = ACTIONS.mark

/**
 * An Escort marker is a "you may" (RULES §Missions, Escort) and a step in the
 * sequence: offered when a carrier the engine would let a marker go on shares
 * the ring where the turn starts or where the move ends. At one pick per
 * marker in hand the rest wait until one is taken back.
 */
export function MarkControl() {
  const plan = usePlan()
  const { nameOf } = useGame()
  const offer = plan.markOffer
  if (!offer) return null
  const full = plan.markChoices.length >= offer.markers
  const markers =
    offer.markers === 1 ? T.markers.one : fill(T.markers.many, { count: offer.markers })
  return (
    <OfferSection label={fill(T.label, { markers })}>
      <ChoiceRow>
        {offer.carriers.map(option => {
          const on = plan.markChoices.includes(option.carrierId)
          const name = nameOf(option.carrierId)
          return (
            <ChoiceChip
              key={option.carrierId}
              title={fill(T.tip, { when: whenTitle(option.before), name })}
              selected={on}
              disabled={plan.disabled || (!on && full)}
              opacity={!on && full ? 0.5 : 1}
              onClick={() => plan.toggleMark(option)}
            >
              {fill(T.chip, { name, when: when(option.before) })}
            </ChoiceChip>
          )
        })}
      </ChoiceRow>
    </OfferSection>
  )
}
