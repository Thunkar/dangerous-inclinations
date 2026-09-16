import {
  resolveShipAppearance,
  type PlayerView,
  type ShipAppearance,
  type ShipLoadout,
  type SubsystemType,
} from '@dangerous-inclinations/engine'
import { DEFAULT_CONFIG, MOUNTS, type MountId, type WorkshopConfig } from './config'

export interface VisibleModule {
  type: SubsystemType | null
  unknown: boolean
  broken: boolean
}
export type VisibleSlots = Record<MountId, VisibleModule>
export interface ShipVisual {
  appearance: ShipAppearance
  slots: VisibleSlots
  identity: string
  driveBroken: boolean
}

/** Only consume an observer's filtered slots. Unknown modules have no type. */
export function visualForPlayer(player: PlayerView, seat: number): ShipVisual {
  return {
    appearance: resolveShipAppearance(player.appearance),
    driveBroken: player.fixed.some(s => s.type === 'engines' && s.isBroken),
    identity: `K—${String(seat + 1).padStart(2, '0')}`,
    slots: Object.fromEntries(
      MOUNTS.map(mount => {
        const slot = player.slots.find(s => s.id === mount.id)
        return [
          mount.id,
          {
            type: slot?.type ?? null,
            unknown: !slot?.type,
            broken: slot?.type ? slot.isBroken === true : false,
          },
        ]
      })
    ) as VisibleSlots,
  }
}

export function editorConfig(
  loadout: ShipLoadout,
  appearance: ShipAppearance,
  accent: string,
  identity?: string
): WorkshopConfig {
  return { ...DEFAULT_CONFIG, loadout, paint: appearance.paint, accent, appearance, identity }
}

export function boardConfig(visual: ShipVisual | undefined, accent: string): WorkshopConfig {
  const appearance = resolveShipAppearance(visual?.appearance)
  return editorConfig(
    {
      forwardSlots: [visual?.slots['forward-0'].type ?? null],
      sideSlots: [0, 1, 2, 3].map(
        i => visual?.slots[`side-${i}` as MountId].type ?? null
      ) as ShipLoadout['sideSlots'],
    },
    appearance,
    accent,
    visual?.identity
  )
}

export function visibleSlots(config: WorkshopConfig, concealed: boolean): VisibleSlots {
  return Object.fromEntries(
    MOUNTS.map(m => {
      const type =
        m.group === 'forward' ? config.loadout.forwardSlots[0] : config.loadout.sideSlots[m.index]
      return [
        m.id,
        { type: concealed ? null : type, unknown: concealed && type !== null, broken: false },
      ]
    })
  ) as VisibleSlots
}
