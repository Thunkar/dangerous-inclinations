import { useEffect, useLayoutEffect, useMemo } from 'react'
import { createShip } from './model'
import type { ShipConfig } from './config'
import { visibleSlots } from './visual'

/** Rebuild only the structural hull; paint and individual slots update in place. */
export function useShipModel(config: ShipConfig, concealed = false) {
  const structural = JSON.stringify({
    ...config,
    paint: '#aab4b2',
    accent: '#d3683d',
    loadout: { forwardSlots: [null], sideSlots: [null, null, null, null] },
    appearance: config.appearance
      ? {
          ...config.appearance,
          paint: '#aab4b2',
          secondaryPaint: '#647776',
          finish: 'matte',
        }
      : undefined,
  })
  const model = useMemo(() => createShip(JSON.parse(structural) as ShipConfig), [structural])
  useLayoutEffect(() => {
    model.update(config, visibleSlots(config, concealed))
  }, [model, config, concealed])
  useEffect(() => () => model.dispose(), [model])
  return model
}
