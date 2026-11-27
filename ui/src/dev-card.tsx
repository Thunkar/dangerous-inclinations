/**
 * Dev harness for the player card (`/dev-card.html`): both faces at
 * `?zoom=` (3 by default), outside the cheatsheet page. Dev only: Vite builds
 * `index.html`, so this page never reaches production.
 */
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/oswald'
import '@fontsource-variable/noto-sans'
import { FONT_BODY, FONT_DISPLAY } from './design/press'
import { CARD_CSS } from './site/card/cardStyles'
import { CardBack, CardFront } from './site/card/CardFaces'

const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 3)

createRoot(document.getElementById('root')!).render(
  <div style={{ background: '#cfc4a8', minHeight: '100vh', padding: 32 }}>
    <style>{`:root { --di-sans: ${FONT_BODY}; --di-display: ${FONT_DISPLAY}; }\n${CARD_CSS}`}</style>
    <div className="di-cards" style={{ ['--card-zoom' as string]: zoom, flexWrap: 'nowrap' }}>
      <CardFront />
      <CardBack />
    </div>
  </div>
)
