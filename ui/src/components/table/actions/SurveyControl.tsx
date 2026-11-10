import { fill } from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { ACTIONS } from '../../../text/actions'
import { ChoiceChip, ChoiceRow, OfferSection } from './parts'
import { when, whenTitle } from './words'

const T = ACTIONS.survey

/**
 * Survey is a "you may" (RULES §Missions) and a step in the sequence: offered
 * when a Survey card wants data and the ship is on Black Hole Ring 1 where
 * the turn starts or where the move ends.
 */
export function SurveyControl() {
  const plan = usePlan()
  const offer = plan.surveyOffer
  if (!offer) return null
  return (
    <OfferSection label={T.label}>
      <ChoiceRow>
        <ChoiceChip
          title={fill(T.tip, { when: whenTitle(offer.before) })}
          selected={plan.steps.some(s => s.kind === 'survey')}
          disabled={plan.disabled}
          onClick={plan.toggleSurvey}
        >
          {fill(T.chip, { when: when(offer.before) })}
        </ChoiceChip>
      </ChoiceRow>
    </OfferSection>
  )
}
