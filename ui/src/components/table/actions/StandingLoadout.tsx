import { useLiveView } from '../../../context/AnimationContext'
import { useGame } from '../../../context/GameContext'
import { ShipEnergyLoadout } from '../ShipEnergyLoadout'

/**
 * Off your turn: what really stands on your tiles and what is broken, as the
 * turn playing leaves them. Its own component, so only it re-renders with the
 * beats of a playback.
 */
export function StandingLoadout() {
  const { view } = useGame()
  const live = useLiveView()
  const me = live ? live.me : view.me
  if (!me) return null
  return <ShipEnergyLoadout subsystems={me.ship.subsystems} />
}
