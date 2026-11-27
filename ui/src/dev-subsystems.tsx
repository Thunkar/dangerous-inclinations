/**
 * Dev harness for the subsystems card (`/dev-subsystems.html`): both faces at
 * `?zoom=` (3 by default), outside the cheatsheet page. Dev only: Vite builds
 * `index.html`, so this page never reaches production.
 */
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/oswald'
import '@fontsource-variable/noto-sans'
import { SUBSYSTEM_CSS } from './site/subsystems/subsystemStyles'
import { SubsystemBack, SubsystemFront } from './site/subsystems/SubsystemCard'

const zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 3)

createRoot(document.getElementById('root')!).render(
  <div style={{ background: '#cfc4a8', minHeight: '100vh', padding: 32 }}>
    <style>{SUBSYSTEM_CSS}</style>
    <div className="sx-faces" style={{ ['--sx-zoom' as string]: zoom, flexWrap: 'nowrap' }}>
      <SubsystemFront />
      <SubsystemBack />
    </div>
  </div>
)
