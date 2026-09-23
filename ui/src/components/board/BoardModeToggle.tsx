/**
 * The chip in the header that swaps the board between the flat map and the
 * 3D table. Two states, no menu: the only thing it changes is how the same
 * model is drawn.
 *
 * Disabled, with the reason in a tooltip, on a browser that cannot give us a
 * WebGL 2 context.
 */
import { Box, ButtonBase, Tooltip } from '@mui/material'
import { useBoardMode, type BoardMode } from '../../context/BoardModeContext'
import { TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'

const MODES: Array<{ mode: BoardMode; label: string }> = [
  { mode: '2d', label: '2D' },
  { mode: '3d', label: '3D' },
]

export function BoardModeToggle() {
  const { mode, setMode, canRender3d } = useBoardMode()

  return (
    <Tooltip
      title={
        canRender3d
          ? 'How the board is drawn: the flat map, or the table in 3D'
          : 'This browser cannot render WebGL'
      }
    >
      <Box
        sx={{
          display: 'flex',
          flexShrink: 0,
          overflow: 'hidden',
          border: `1px solid ${TABLE.plateEdge}`,
          opacity: canRender3d ? 1 : 0.45,
        }}
      >
        {MODES.map(({ mode: value, label }) => {
          const selected = mode === value
          return (
            <ButtonBase
              key={value}
              disabled={!canRender3d}
              onClick={() => setMode(value)}
              sx={{
                px: 0.9,
                py: 0.15,
                fontFamily: FONT_DISPLAY,
                fontSize: '0.8rem',
                fontWeight: 600,
                letterSpacing: '0.08em',
                // The board you are looking at is a red block, the other plain type.
                bgcolor: selected ? TABLE.accentBlock : 'transparent',
                color: selected ? TABLE.onAccent : TABLE.inkSoft,
                borderLeft: value === '2d' ? 'none' : `1px solid ${TABLE.plateEdge}`,
                '&:hover': { color: canRender3d && !selected ? TABLE.ink : undefined },
              }}
            >
              {label}
            </ButtonBase>
          )
        })}
      </Box>
    </Tooltip>
  )
}
