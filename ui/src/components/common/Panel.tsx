/**
 * Instrument plates. Everything on the table is mounted on one of these:
 * a matte dark plate with a thin luminous edge and a monospace stencil label.
 */
import type { ReactNode } from 'react'
import { Box, Paper, Typography, type SxProps, type Theme } from '@mui/material'
import { TABLE } from '../../theme'

interface PanelProps {
  children: ReactNode
  /** Stencilled label along the top of the plate. */
  title?: ReactNode
  action?: ReactNode
  /** Accent colour for the luminous top edge (player colour, family colour…). */
  accent?: string
  dense?: boolean
  sx?: SxProps<Theme>
}

export function Panel({ children, title, action, accent, dense, sx }: PanelProps) {
  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        background: TABLE.plate,
        border: `1px solid ${TABLE.plateEdge}`,
        borderRadius: 1.5,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 4px 14px rgba(0,0,0,0.16)',
        ...(sx as object),
      }}
    >
      {accent && (
        <Box
          sx={{
            height: 2,
            flexShrink: 0,
            bgcolor: accent,
          }}
        />
      )}
      {(title || action) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: dense ? 1 : 1.5,
            pt: dense ? 0.6 : 0.9,
            pb: 0.4,
            flexShrink: 0,
            borderBottom: `1px solid ${TABLE.line}`,
          }}
        >
          {typeof title === 'string' ? (
            <Typography variant="overline" sx={{ color: TABLE.inkSoft, lineHeight: 1.5 }}>
              {title}
            </Typography>
          ) : (
            title
          )}
          {action}
        </Box>
      )}
      <Box sx={{ px: dense ? 1 : 1.5, py: dense ? 0.75 : 1.25, minHeight: 0, flex: 1 }}>
        {children}
      </Box>
    </Paper>
  )
}

export function SectionLabel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      variant="overline"
      sx={{ color: TABLE.inkFaint, display: 'block', lineHeight: 1.7, ...(sx as object) }}
    >
      {children}
    </Typography>
  )
}
