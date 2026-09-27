/**
 * Dev harness for the mission cards (`/dev-cards.html`): every card at both
 * sizes, as a rival sees it and as its holder does halfway through, so text
 * that does not fit shows at a glance. A clipped text box is outlined in red
 * and listed at the top (`#overflow`, read by headless checks). Dev only:
 * Vite builds `index.html`, so this page never reaches production.
 */
import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { Box, CssBaseline, ThemeProvider, Typography } from '@mui/material'
import type { Cargo, Mission } from '@dangerous-inclinations/engine'
import './index.css'
import { theme, TABLE } from './theme'
import { MissionCard } from './components/common/MissionCard'

const NAMES: Record<string, string> = { 'left-1': 'the 1st player to your left', 'left-2': 'the 2nd player to your left', rival: 'Kestrel' }
const nameOf = (id: string) => NAMES[id] ?? id

const MISSIONS: Mission[] = [
  { id: 'destroy', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'left-2' },
  { id: 'deliver', type: 'deliver_cargo', isCompleted: false, pickupPlanetId: 'planet-alpha', deliveryPlanetId: 'planet-gamma', cargoId: 'crate-deliver' },
  { id: 'intercept', type: 'intercept_transmission', isCompleted: false, targetPlayerId: 'left-1', deliveryPlanetId: 'planet-beta', dataCargoId: 'data-intercept' },
  { id: 'survey', type: 'survey', isCompleted: false, dataCargoId: 'data-survey' },
  { id: 'piracy', type: 'piracy', isCompleted: false, cargoId: 'loot-piracy' },
  { id: 'tanker', type: 'tanker', isCompleted: false },
  { id: 'escort', type: 'escort', isCompleted: false, markedPlayerId: 'rival' },
  { id: 'salvage', type: 'salvage', isCompleted: false, cargoId: 'salvage-salvage' },
] as Mission[]

/** The holder's cargo halfway through each card: the longest progress line each can print. */
const HALFWAY: Cargo[] = [
  { id: 'crate-other', missionId: 'other', kind: 'crate', deliveryPlanetId: 'planet-beta', pickupPlanetId: 'planet-gamma', isPickedUp: true },
  { id: 'crate-deliver', missionId: 'deliver', kind: 'crate', deliveryPlanetId: 'planet-gamma', pickupPlanetId: 'planet-alpha', isPickedUp: false },
  { id: 'data-intercept', missionId: 'intercept', kind: 'data', deliveryPlanetId: 'planet-beta', isPickedUp: true },
  { id: 'data-survey', missionId: 'survey', kind: 'data', deliveryPlanetId: 'any', isPickedUp: true },
  { id: 'loot-piracy', missionId: 'piracy', kind: 'crate', deliveryPlanetId: 'any', isPickedUp: true },
  { id: 'salvage-salvage', missionId: 'salvage', kind: 'data', deliveryPlanetId: 'any', isPickedUp: true },
]

function Overflow() {
  const [clipped, setClipped] = useState<string[]>([])
  useEffect(() => {
    const check = () => {
      const found: string[] = []
      document.querySelectorAll<HTMLElement>('[data-card-text]').forEach(el => {
        const over = el.scrollHeight > el.clientHeight + 1
        el.style.outline = over ? '2px solid red' : ''
        if (over) found.push(`${el.closest('[data-card]')?.getAttribute('data-card')}:${el.dataset.cardText}`)
      })
      setClipped(found)
    }
    document.fonts.ready.then(() => setTimeout(check, 50))
  }, [])
  return (
    <pre id="overflow" style={{ color: clipped.length ? '#ff6b6b' : '#8fd18f', margin: 0, whiteSpace: 'pre-wrap' }}>
      {clipped.length ? `clipped: ${clipped.join(', ')}` : 'nothing clipped'}
    </pre>
  )
}

function Row({ compact, cargo, label }: { compact: boolean; cargo?: Cargo[]; label: string }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography sx={{ color: TABLE.inkSoft, mb: 1 }}>{label}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        {MISSIONS.map(m => (
          <Box key={m.id} data-card={`${compact ? 'fan' : 'full'}${cargo ? '+held' : ''}/${m.id}`}>
            <MissionCard mission={m} nameOf={nameOf} compact={compact} cargo={cargo} fuel={cargo ? 5 : undefined} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Box sx={{ p: 3, background: TABLE.felt, minHeight: '100vh' }}>
      <Overflow />
      <Row compact={false} label="Full size, as a rival sees it" />
      <Row compact={false} cargo={HALFWAY} label="Full size, held, halfway through" />
      <Row compact label="Fan size, as a rival sees it" />
      <Row compact cargo={HALFWAY} label="Fan size, held, halfway through" />
    </Box>
  </ThemeProvider>
)
