/**
 * Dev harness for the missiles and the planning overlays (`/dev-overlays.html`).
 *
 * The quiet fixture on `/dev-three.html` has no turn in it, so it cannot show a
 * missile on its way, a weapon's reach, a route or a deployment ring. This page
 * mounts the same 3D board over a fixture that has all of them, and logs every
 * click the overlays fire so a headless run can prove the callbacks arrive.
 *
 * `?board=svg` draws the same fixture with the flat renderer instead, which is
 * how the two boards are checked against each other: the same model, the same
 * marks, the same meanings. Dev only — Vite builds `index.html`, so neither
 * page reaches production.
 *
 * Query flags: `?picker=on` adds the destination picker over every sector,
 * `?deploy=off` drops the deployment ring, `?board=svg` switches renderer, plus
 * the 3D board's own `?preset=`, `?fx=on` and `?stats=1`.
 */
import { createRoot } from 'react-dom/client'
import { Box, CssBaseline, ThemeProvider } from '@mui/material'
import './index.css'
import { theme } from './theme'
import GameBoardThree from './components/board/three/GameBoardThree'
import { GameBoardSvg } from './components/board/svg/GameBoardSvg'
import { createOverlayFixtureModel } from './components/board/three/scene/overlays/fixture'

const params = new URLSearchParams(window.location.search)
const on = (flag: string, fallback: boolean) => {
  const value = params.get(flag)
  return value === null ? fallback : value === 'on' || value === '1'
}

const model = createOverlayFixtureModel({
  picker: on('picker', false),
  deployment: on('deploy', true),
  onEvent: (what, position) => console.log('[fixture]', what, position),
})

const flat = params.get('board') === 'svg'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Box sx={{ position: 'fixed', inset: 0 }}>
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        {flat ? <GameBoardSvg model={model} /> : <GameBoardThree model={model} />}
      </Box>
    </Box>
  </ThemeProvider>
)
