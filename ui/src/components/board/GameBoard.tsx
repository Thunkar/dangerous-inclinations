/**
 * The board in the middle of the table, and the switch between its two
 * renderers.
 *
 * Both draw the same `BoardModel` (derived here, once, from the view, the
 * turn being animated and the plan being built) so a range, a path or a
 * target can never differ between them. The 3D board is a lazy chunk: a table
 * played on the flat board never downloads it.
 */
import { Suspense, lazy } from 'react'
import { Box, Typography } from '@mui/material'
import type { Position } from '@dangerous-inclinations/engine'
import { useBoardMode } from '../../context/BoardModeContext'
import { TABLE } from '../../theme'
import { useBoardModel } from './model'
import { GameBoardSvg } from './svg/GameBoardSvg'
import { TurnBanner } from './TurnBanner'

const GameBoardThree = lazy(() => import('./three/GameBoardThree'))

interface GameBoardProps {
  /** Deployment phase: clicking a legal Black Hole ring-3 or ring-4 sector places your ship and Home. */
  onDeploy?: (position: Position) => void
  deploymentEnabled?: boolean
}

export function GameBoard({ onDeploy, deploymentEnabled }: GameBoardProps) {
  const model = useBoardModel({ onDeploy, deploymentEnabled })
  const { mode } = useBoardMode()

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      {mode === '3d' ? (
        <Suspense fallback={<LoadingPlate />}>
          <GameBoardThree model={model} />
        </Suspense>
      ) : (
        <GameBoardSvg model={model} />
      )}
      <TurnBanner />
    </Box>
  )
}

function LoadingPlate() {
  return (
    <Box sx={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderRadius: 1.5,
          border: `1px solid ${TABLE.plateEdge}`,
          background: `linear-gradient(180deg, ${TABLE.plateHi} 0%, ${TABLE.plate} 100%)`,
        }}
      >
        <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
          Loading 3D board…
        </Typography>
      </Box>
    </Box>
  )
}
