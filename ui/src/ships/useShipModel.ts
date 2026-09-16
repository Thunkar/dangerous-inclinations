import { useEffect, useLayoutEffect, useMemo } from 'react'
import { createShip } from './model'
import type { WorkshopConfig } from './config'
import { visibleSlots } from './visual'

/** Rebuild only the structural hull; paint and individual slots update in place. */
export function useShipModel(config: WorkshopConfig, concealed = false) {
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
          wear: 0,
          finish: 'matte',
        }
      : undefined,
  })
  const model = useMemo(() => createShip(JSON.parse(structural) as WorkshopConfig), [structural])
  useLayoutEffect(() => {
    model.update(config, visibleSlots(config, concealed))
  }, [model, config, concealed])
  useEffect(() => () => model.dispose(), [model])
  return model
}
