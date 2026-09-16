export * from '../../ships/config'
import { DEFAULT_CONFIG, parseConfig, type WorkshopConfig } from '../../ships/config'

export const STORAGE_KEY = 'di-ship-workshop-v1'

export function initialConfig(): WorkshopConfig {
  try {
    const shared = new URLSearchParams(window.location.hash.slice(1)).get('design')
    const saved = shared ?? localStorage.getItem(STORAGE_KEY)
    if (saved) return parseConfig(JSON.parse(saved))
  } catch {
    // A stale local draft must not prevent the disposable editor from opening.
  }
  return structuredClone(DEFAULT_CONFIG)
}
