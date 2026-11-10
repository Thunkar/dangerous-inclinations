import { Box, Typography } from '@mui/material'
import type { MovementPlan } from '@dangerous-inclinations/engine'
import { routeName } from '../../../utils/route'
import { SectionLabel } from '../../common/Panel'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { HOVER_TINT, T } from './style'

const ROUTE_COLUMNS = '1fr 46px 46px'

/**
 * The alternatives, as a read-out rather than a wall of buttons: one line
 * each, the two numbers you choose between in their own columns.
 */
export function RouteTable({
  routes,
  selected,
  onSelect,
}: {
  routes: MovementPlan[]
  selected: number
  onSelect: (index: number) => void
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: ROUTE_COLUMNS,
          px: 0.6,
          pb: 0.1,
        }}
      >
        <SectionLabel sx={{ lineHeight: 1.3 }}>{T.columns.route}</SectionLabel>
        <SectionLabel sx={{ lineHeight: 1.3, textAlign: 'right' }}>{T.columns.turns}</SectionLabel>
        <SectionLabel sx={{ lineHeight: 1.3, textAlign: 'right' }}>{T.columns.fuel}</SectionLabel>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2, minWidth: 0 }}>
        {routes.map((alt, i) => {
          const on = i === selected
          return (
            <Box
              key={`${alt.label ?? i}-${alt.totalTurns}-${alt.totalMassCost}`}
              component="button"
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={on}
              sx={{
                appearance: 'none',
                display: 'grid',
                gridTemplateColumns: ROUTE_COLUMNS,
                alignItems: 'center',
                width: '100%',
                px: 0.6,
                py: 0.3,
                border: `1px solid ${on ? TABLE.selected : 'transparent'}`,
                borderRadius: 0,
                bgcolor: on ? TABLE.selected : 'transparent',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                '&:hover': { bgcolor: on ? TABLE.selected : HOVER_TINT },
              }}
            >
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '0.76rem',
                  fontWeight: on ? 700 : 400,
                  color: on ? TABLE.onSelected : TABLE.inkSoft,
                  minWidth: 0,
                }}
                noWrap
              >
                {routeName(alt, i)}
              </Typography>
              <Readout value={alt.totalTurns} on={on} />
              <Readout value={alt.totalMassCost} on={on} tint={TABLE.fuel} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function Readout({ value, on, tint }: { value: number; on: boolean; tint?: string }) {
  return (
    <Typography
      sx={{
        fontFamily: FONT_MONO,
        fontSize: '0.78rem',
        fontWeight: 700,
        textAlign: 'right',
        color: on ? TABLE.onSelected : (tint ?? TABLE.ink),
      }}
    >
      {value}
    </Typography>
  )
}
