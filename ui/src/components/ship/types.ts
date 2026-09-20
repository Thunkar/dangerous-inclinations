import type { ShipAppearance } from '@dangerous-inclinations/engine'
import type { ReactNode } from 'react'

export type SlotRegionPosition = 'aft' | 'port' | 'forward' | 'starboard'

export interface ShipSlotContent {
  /** The single forward slot. */
  forward: ReactNode[]
  /** Side slots 1–4: 1 and 2 to port, 3 and 4 to starboard. */
  side: ReactNode[]
}

export interface FixedSlotContent {
  /** Engines and thrusters, at the stern. */
  aft?: ReactNode[]
  /** Fuel scoop, at the bow, above the forward slot. */
  forward?: ReactNode[]
}

export interface ShipMetrics {
  /** Overall width of the loadout, in px. */
  width: number
  height: number
  /** Thickness of the four slot rails. */
  band: number
}

/** Default loadout geometry: the loadout screen's full-size ship. */
export const DEFAULT_SHIP_METRICS: ShipMetrics = { width: 372, height: 300, band: 66 }

export interface ShipDisplayProps {
  appearance?: ShipAppearance
  identityColor?: string
  slots: ShipSlotContent
  fixed?: FixedSlotContent
  shipImageSrc?: string
  metrics?: Partial<ShipMetrics>
  /** Dim the hull plate — used while the loadout is still being filled. */
  faded?: boolean
  /** Rails that would accept whatever is being dragged or held. */
  activeRails?: { forward?: boolean; side?: boolean }
}

export interface SlotRegionProps {
  position: SlotRegionPosition
  children: ReactNode
  metrics: ShipMetrics
  /** Rail is a legal drop target for whatever is being dragged. */
  active?: boolean
}
