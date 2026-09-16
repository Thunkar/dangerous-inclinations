/**
 * Chrome shared by the full-screen setup screens: the felt-level title bar and
 * a centred message for the states where there is nothing to do.
 */
import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import { TABLE } from '../../theme'

export function Header({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: { xs: 2, md: 3 },
        flexWrap: 'wrap',
        py: 1.5,
        flexShrink: 0,
        borderBottom: `1px solid ${TABLE.line}`,
        background: TABLE.feltLight,
      }}
    >
      <Typography variant="h6" sx={{ color: TABLE.ink, letterSpacing: '-0.02em' }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
          {subtitle}
        </Typography>
      )}
      <Box sx={{ flex: 1 }} />
      {right}
    </Box>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
      <Typography sx={{ color: TABLE.inkSoft }}>{children}</Typography>
    </Box>
  )
}
