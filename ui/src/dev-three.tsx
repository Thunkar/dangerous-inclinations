/**
 * Dev harness for the 3D board (`/dev-three.html`).
 *
 * The 3D board takes a `BoardModel` and nothing else, so it can be developed
 * and screenshotted without a server, a game or a seat. This page mounts it
 * full-screen inside the table's theme over a fixture model. It is a dev page
 * only: Vite builds `index.html`, so it never reaches production.
 *
 * Query flags (read by the board itself): `?preset=table|top|follow`,
 * `?fx=off` to drop the effect composer, `?stats=1` to log frame times.
 * `?board=svg` draws the same fixture with the flat renderer instead.
 * `?shots=1` fires a round of plasma and disruptor shots over it, again and
 * again (`fixtureShots`), so the guns' effects can be watched on either board;
 * `&slow=10` plays them ten times slower, and with `?preset=auto` the camera
 * films them close up.
 */
import { createRoot } from 'react-dom/client'
import { Box, CssBaseline, ThemeProvider } from '@mui/material'
import './index.css'
import { theme } from './theme'
import GameBoardThree from './components/board/three/GameBoardThree'
import { GameBoardSvg } from './components/board/svg/GameBoardSvg'
import {
  SHOTS_CYCLE,
  createFixtureModel,
  fixtureDuel,
  fixtureShots,
} from './components/board/three/dev/fixtureModel'
import type { BoardModel } from './components/board/model'

const base = createFixtureModel()
const params = new URLSearchParams(window.location.search)
const flat = params.get('board') === 'svg'
const shooting = params.has('shots')
const slow = Number(params.get('slow') ?? 1) || 1

const root = createRoot(document.getElementById('root')!)

function show(model: BoardModel) {
  root.render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ position: 'fixed', inset: 0 }}>
        <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
          {flat ? <GameBoardSvg model={model} /> : <GameBoardThree model={model} />}
        </Box>
      </Box>
    </ThemeProvider>
  )
}

if (shooting) {
  const fire = () => {
    const now = performance.now()
    show({ ...base, effects: fixtureShots(now, slow), shot: fixtureDuel(now) })
  }
  fire()
  setInterval(fire, SHOTS_CYCLE * slow)
} else {
  show(base)
}
