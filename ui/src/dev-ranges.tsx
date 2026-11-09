/**
 * Dev harness for the range cards (`/dev-ranges.html`): every card at
 * `?zoom=` (3 by default), outside the cheatsheet page. Dev only: Vite builds
 * `index.html`, so this page never reaches production.
 */
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/oswald'
import '@fontsource-variable/noto-sans'
import { LOADOUT_CSS } from './site/loadouts/loadoutStyles'
import { RANGE_CSS } from './site/ranges/rangeStyles'
import { RANGE_CARDS } from './site/ranges/reach'
import { RangeCard } from './site/ranges/RangeCard'

const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 3)

createRoot(document.getElementById('root')!).render(
  <div style={{ background: '#cfc4a8', minHeight: '100vh', padding: 32 }}>
    <style>{LOADOUT_CSS + RANGE_CSS}</style>
    <div className="di-lo-row" style={{ ['--lo-zoom' as string]: zoom, gap: 24 }}>
      {RANGE_CARDS.map(t => (
        <div key={t} className="di-lo-frame">
          <RangeCard type={t} />
        </div>
      ))}
    </div>
  </div>
)
