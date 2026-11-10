import { fill } from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { useGame } from '../../../context/GameContext'
import { seizeKey } from '../../../plan/preview'
import { ACTIONS } from '../../../text/actions'
import { ChoiceChip, ChoiceRow, OfferSection } from './parts'
import { when, whenTitle } from './words'

const T = ACTIONS.seize

/**
 * Piracy is a "you may" (RULES §Missions), and a step in the sequence. The
 * choice appears only when a Piracy card is free and an undocked ship
 * carrying cargo shares the sector where the turn starts or where the move
 * ends; a pick puts a seize step in the sequence (first, or right after the
 * move), and at one pick per free card the rest wait until one is taken back.
 */
export function SeizeControl() {
  const plan = usePlan()
  const disabled = plan.disabled
  const { nameOf } = useGame()
  const offer = plan.seizeOffer
  if (!offer) return null
  const full = plan.seizeChoices.length >= offer.cards
  const items = offer.cards === 1 ? T.items.one : fill(T.items.many, { count: offer.cards })
  return (
    <OfferSection label={fill(T.label, { items })}>
      <ChoiceRow>
        {offer.items.map(item => {
          const key = seizeKey(item)
          const on = plan.seizeChoices.includes(key)
          const name = nameOf(item.victimId)
          const off = disabled || (!on && full)
          return (
            <ChoiceChip
              key={key}
              title={fill(T.tip, { when: whenTitle(item.before), name })}
              selected={on}
              disabled={off}
              opacity={!on && full ? 0.5 : 1}
              onClick={() => plan.toggleSeize(item)}
            >
              {fill(T.chip, {
                item: ACTIONS.words.item[item.kind],
                name,
                when: when(item.before),
              })}
            </ChoiceChip>
          )
        })}
      </ChoiceRow>
    </OfferSection>
  )
}
