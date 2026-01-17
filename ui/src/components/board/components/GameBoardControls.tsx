import { Box, IconButton, Tooltip } from '@mui/material'

interface GameBoardControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetView: () => void
}

/**
 * UI controls for the game board (zoom buttons and indicator)
 */
export function GameBoardControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
}: GameBoardControlsProps) {
  return (
    <>
      {/* Control buttons */}
      <Box
        sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Tooltip title="Reset View" placement="left">
          <IconButton
            onClick={onResetView}
            sx={{
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.9)',
              },
            }}
          >
            ⟲
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom In" placement="left">
          <IconButton
            onClick={onZoomIn}
            sx={{
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.9)',
              },
            }}
          >
            +
          </IconButton>
        </Tooltip>
        <Tooltip title="Zoom Out" placement="left">
          <IconButton
            onClick={onZoomOut}
            sx={{
              bgcolor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.9)',
              },
            }}
          >
            −
          </IconButton>
        </Tooltip>
      </Box>

      {/* Zoom indicator */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          bgcolor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          px: 2,
          py: 1,
          borderRadius: 1,
          fontSize: '0.875rem',
          fontFamily: 'monospace',
        }}
      >
        {zoom.toFixed(1)}x
      </Box>
    </>
  )
}
