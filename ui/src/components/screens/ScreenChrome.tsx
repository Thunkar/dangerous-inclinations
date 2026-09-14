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
        px: 2,
        py: 1,
        flexShrink: 0,
        borderBottom: `1px solid ${TABLE.line}`,
        background: `linear-gradient(180deg, ${TABLE.feltLight} 0%, rgba(0,0,0,0) 100%)`,
      }}
    >
      <Typography variant="h6" sx={{ color: TABLE.ink, letterSpacing: '0.1em' }}>
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
