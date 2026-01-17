import type { ReactNode } from 'react'

export type SlotPosition = 'forward' | 'side'

export interface ShipSlotContent {
  forward: [ReactNode, ReactNode]
  side: [ReactNode, ReactNode, ReactNode, ReactNode]
}

export interface FixedSlotContent {
  aft?: ReactNode[]
}

export interface ShipDisplayProps {
  slots: ShipSlotContent
  fixedSlots?: FixedSlotContent
  stats?: ReactNode
  shipImageSrc?: string
  className?: string
  blurShip?: boolean
}

export interface SlotRegionProps {
  position: 'aft' | 'port' | 'forward' | 'starboard'
  children: ReactNode
  shouldBlur?: boolean
}
