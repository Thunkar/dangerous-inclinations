import type { Mission, SaleOption } from '@dangerous-inclinations/engine'
import { SELL_NOTHING, fill, getWellName } from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { ACTIONS } from '../../../text/actions'
import { ChoiceChip, ChoiceRow, OfferSection } from './parts'

const T = ACTIONS.dock

/** What an option on offer is: the load, or a sale in the words of the card it pays. */
function saleLabel(option: SaleOption, missions: readonly Mission[], loads: number): string {
  const mission = missions.find(m => m.id === option.missionId)
  switch (option.kind) {
    case 'load':
      return fill(loads === 1 ? T.sale.load.one : T.sale.load.many, { count: loads })
    case 'fuel':
      return T.sale.fuel
    case 'loot':
      return T.sale.loot
    case 'crate':
      return mission?.type === 'deliver_cargo'
        ? fill(T.sale.deliver, { planet: getWellName(mission.deliveryPlanetId) })
        : T.sale.crate
    case 'data':
      return mission?.type === 'intercept_transmission'
        ? T.sale.intercept
        : mission?.type === 'salvage'
          ? T.sale.salvage
          : T.sale.survey
  }
}

/** The tooltip of an option: what it is worth, and whether it is the default. */
function saleTitle(option: SaleOption, isDefault: boolean): string {
  const worth =
    option.kind === 'load'
      ? T.notSale
      : fill(option.points === 1 ? T.points.one : T.points.many, { points: option.points })
  return isDefault ? worth + T.isDefault : worth
}

/**
 * What the visit does (RULES §Stations): load your crates or sell one item,
 * and each station buys from you once per game. It appears when the turn as
 * built arrives at a station; the options, their points and the default come
 * from the engine, and the default is lit until another is picked. Doing
 * nothing keeps the station for later. A station that has bought from you
 * already says so.
 */
export function DockSaleControl() {
  const plan = usePlan()
  const disabled = plan.disabled
  const offer = plan.dockOffer
  if (!offer) return null
  const station = getWellName(offer.planetId)
  return (
    <OfferSection label={offer.soldHere ? fill(T.soldHere, { station }) : T.label}>
      {offer.options.length > 0 && (
        <ChoiceRow>
          {offer.options.map(option => (
            <ChoiceChip
              key={option.sale}
              title={saleTitle(option, option.sale === offer.default?.sale)}
              selected={plan.dockSale === option.sale}
              disabled={disabled}
              onClick={() => plan.setDockSale(option.sale)}
            >
              {saleLabel(option, plan.me.missions, offer.loads)}
              {option.kind === 'load' ? '' : fill(T.chipPoints, { points: option.points })}
            </ChoiceChip>
          ))}
          <ChoiceChip
            title={fill(T.keepTip, { station })}
            selected={plan.dockSale === SELL_NOTHING}
            disabled={disabled}
            onClick={() => plan.setDockSale(SELL_NOTHING)}
          >
            {T.keep}
          </ChoiceChip>
        </ChoiceRow>
      )}
    </OfferSection>
  )
}
