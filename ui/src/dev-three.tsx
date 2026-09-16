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
 */
import { createRoot } from 'react-dom/client'
import { Box, CssBaseline, ThemeProvider } from '@mui/material'
import './index.css'
import { theme } from './theme'
import GameBoardThree from './components/board/three/GameBoardThree'
import { createFixtureModel } from './components/board/three/dev/fixtureModel'

const model = createFixtureModel()

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Box sx={{ position: 'fixed', inset: 0 }}>
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <GameBoardThree model={model} />
      </Box>
    </Box>
  </ThemeProvider>
)
