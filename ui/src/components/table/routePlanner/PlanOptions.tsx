import { Box, Tooltip, Typography } from '@mui/material'
import type { Station } from '@dangerous-inclinations/engine'
import { STATION_DRIFT, fill, getWellName } from '@dangerous-inclinations/engine'
import type { RouteMode } from '../../../context/RoutePlanContext'
import { SectionLabel } from '../../common/Panel'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { T } from './style'

/**
 * A station is not a place: it advances STATION_DRIFT sectors at the end of every round,
 * so a route to the sector it is on now lands where it used to be. Clicking
 * one aims at where it will be when the ship gets there; this is the way back
 * to the fixed sector, for the rare turn when that is what you meant.
 */
export function StationAim({
  station,
  mode,
  disabled,
  onSet,
}: {
  station: Station
  mode: RouteMode
  disabled: boolean
  onSet: (mode: RouteMode) => void
}) {
  const options: Array<{ value: RouteMode; label: string; tip: string }> = [
    {
      value: 'meet',
      label: T.meet,
      tip: fill(T.meetTip, { drift: STATION_DRIFT }),
    },
    {
      value: 'sector',
      label: fill(T.sector, { sector: station.sector }),
      tip: T.sectorTip,
    },
  ]
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <SectionLabel sx={{ flexShrink: 0, mr: 0.25 }}>
        {fill(T.station, { planet: getWellName(station.planetId) })}
      </SectionLabel>
      {options.map(option => {
        const on = mode === option.value
        return (
          <Tooltip key={option.value} title={option.tip}>
            <Box
              component="button"
              type="button"
              disabled={disabled}
              onClick={() => onSet(option.value)}
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.72rem',
                fontWeight: 700,
                px: 0.6,
                py: '1px',
                borderRadius: 0,
                cursor: disabled ? 'default' : 'pointer',
                color: on ? TABLE.onSelected : TABLE.inkSoft,
                border: `1px solid ${on ? TABLE.selected : TABLE.plateEdge}`,
                bgcolor: on ? TABLE.selected : 'transparent',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {option.label}
            </Box>
          </Tooltip>
        )
      })}
    </Box>
  )
}

/**
 * Fuel to arrive with: a Tanker's card, or a margin for the trip after. The
 * route is planned as if that fuel were not aboard, so it coasts where it
 * would otherwise burn.
 */
export function ReserveRow({
  reserve,
  max,
  disabled,
  onSet,
}: {
  reserve: number
  max: number
  disabled: boolean
  onSet: (fuel: number) => void
}) {
  const step = (by: number) => onSet(Math.max(0, Math.min(max, reserve + by)))
  const button = (by: number, label: string, tip: string) => (
    <Tooltip title={tip}>
      <span>
        <Box
          component="button"
          type="button"
          aria-label={tip}
          disabled={disabled || reserve + by < 0 || reserve + by > max}
          onClick={() => step(by)}
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.72rem',
            fontWeight: 700,
            width: 20,
            py: '1px',
            borderRadius: 0,
            cursor: 'pointer',
            color: TABLE.inkSoft,
            border: `1px solid ${TABLE.plateEdge}`,
            bgcolor: 'transparent',
            '&:disabled': { opacity: 0.4, cursor: 'default' },
          }}
        >
          {label}
        </Box>
      </span>
    </Tooltip>
  )
  return (
    <Box
      data-testid="route-reserve"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
    >
      <SectionLabel sx={{ flexShrink: 0, mr: 0.25 }}>{T.arriveWith}</SectionLabel>
      {button(-1, T.less, T.lessTip)}
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.8rem',
          fontWeight: 700,
          color: reserve > 0 ? TABLE.ink : TABLE.inkFaint,
          minWidth: 44,
          textAlign: 'center',
        }}
      >
        {fill(T.reserve, { fuel: reserve })}
      </Typography>
      {button(1, T.more, T.moreTip)}
    </Box>
  )
}
