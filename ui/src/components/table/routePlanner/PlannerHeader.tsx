import { Box, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RouteIcon from '@mui/icons-material/Route'
import type { MovementPlan, Position } from '@dangerous-inclinations/engine'
import { fill } from '@dangerous-inclinations/engine'
import { placeLabel } from '../../../utils/route'
import { SectionLabel } from '../../common/Panel'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { HOVER_TINT, ROUTE, T } from './style'

/**
 * The fold. Closed, it still answers the only question worth asking from
 * across the table: where am I headed, and what does it cost.
 */
export function PlannerHeader({
  open,
  onToggle,
  dest,
  route,
  hasRoutes,
  taken,
}: {
  open: boolean
  onToggle: () => void
  dest: Position | null
  route: MovementPlan | null
  hasRoutes: boolean
  taken: boolean
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      sx={{
        appearance: 'none',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.15,
        alignItems: 'stretch',
        textAlign: 'left',
        px: 0.75,
        py: 0.5,
        border: 0,
        borderRadius: 0,
        bgcolor: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        minWidth: 0,
        '&:hover': { bgcolor: HOVER_TINT },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
        <RouteIcon sx={{ fontSize: 15, color: route ? ROUTE : TABLE.inkFaint, flexShrink: 0 }} />
        <SectionLabel sx={{ color: TABLE.inkSoft, lineHeight: 1.4, flexShrink: 0 }}>
          {T.title}
        </SectionLabel>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {!open && !dest && (
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkFaint }}
            noWrap
          >
            {T.plot}
          </Typography>
        )}
        {!open && taken && (
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.72rem',
              fontWeight: 700,
              color: TABLE.accent,
            }}
            noWrap
          >
            {T.taken}
          </Typography>
        )}
        <ExpandMoreIcon
          sx={{
            fontSize: 17,
            color: TABLE.inkFaint,
            flexShrink: 0,
            transition: 'transform 120ms',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </Box>

      {!open && dest && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, pl: 2.6, minWidth: 0 }}>
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: ROUTE, flexShrink: 0 }}
          >
            {T.mark}
          </Typography>
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkSoft, minWidth: 0 }}
            noWrap
          >
            {placeLabel(dest)}
            {route ? fill(T.summary, { turns: route.totalTurns, fuel: route.totalMassCost }) : ''}
            {!hasRoutes ? T.noRouteShort : ''}
          </Typography>
        </Box>
      )}
    </Box>
  )
}
