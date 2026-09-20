/**
 * Everything the table needs around it: the animator that plays a turn's
 * events, and the plan you are building (only when you actually hold a seat).
 *
 * A spectator has no plan, so no PlanProvider is mounted and nothing under the
 * table may reach for one: `TableScreen` renders its controls only when a
 * seat exists.
 */
import type { ReactNode } from 'react'
import { AnimationProvider } from '../../context/AnimationContext'
import { PlanProvider } from '../../context/PlanContext'
import { useGame } from '../../context/GameContext'
import { TableScreen } from './TableScreen'

export function TableRoot({ headerRight, footer }: { headerRight?: ReactNode; footer?: ReactNode }) {
  const { view } = useGame()
  const table = <TableScreen headerRight={headerRight} footer={footer} />
  return <AnimationProvider>{view.me ? <PlanProvider>{table}</PlanProvider> : table}</AnimationProvider>
}
