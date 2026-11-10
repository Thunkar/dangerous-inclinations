import { Box, Button, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import type { Position } from '@dangerous-inclinations/engine'
import { placeLabel } from '../../../utils/route'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { RED_TINT, ROUTE, T } from './style'

/**
 * Where you asked to go. With nothing chosen it is the way into picking; while
 * picking it is the loud amber state and the way straight back out of it.
 */
export function DestinationRow({
  dest,
  picking,
  disabled,
  onPick,
  onClear,
}: {
  dest: Position | null
  picking: boolean
  disabled: boolean
  onPick: () => void
  onClear: () => void
}) {
  if (picking) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          px: 0.75,
          py: 0.5,
          border: `1px solid ${TABLE.accent}`,
          bgcolor: RED_TINT,
          minWidth: 0,
        }}
      >
        <MyLocationIcon
          sx={{
            fontSize: 15,
            color: TABLE.accent,
            flexShrink: 0,
            animation: 'route-pick-pulse 1.4s ease-in-out infinite',
            '@keyframes route-pick-pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.35 },
            },
          }}
        />
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.76rem',
            fontWeight: 700,
            color: TABLE.accent,
            minWidth: 0,
            flex: 1,
          }}
          noWrap
        >
          {T.picking}
        </Typography>
        <Button
          size="small"
          data-testid="route-cancel-pick"
          onClick={onPick}
          sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: TABLE.inkSoft }}
        >
          {T.cancel}
        </Button>
      </Box>
    )
  }

  if (!dest) {
    return (
      <Tooltip title={T.pickTip}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          data-testid="route-pick-destination"
          aria-label={T.pick}
          startIcon={<MyLocationIcon sx={{ fontSize: 15 }} />}
          disabled={disabled}
          onClick={onPick}
          sx={{ justifyContent: 'flex-start', py: 0.3, fontSize: '0.74rem' }}
        >
          {T.pick}
        </Button>
      </Tooltip>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.8rem', color: ROUTE, flexShrink: 0 }}>
        {T.mark}
      </Typography>
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.8rem',
          fontWeight: 700,
          color: TABLE.ink,
          flex: 1,
          minWidth: 0,
        }}
        noWrap
      >
        {placeLabel(dest)}
      </Typography>
      <Tooltip title={T.repickTip}>
        <Button
          size="small"
          data-testid="route-repick"
          aria-label={T.repickLabel}
          disabled={disabled}
          onClick={onPick}
          sx={{ minWidth: 0, px: 0.6, py: 0, fontSize: '0.72rem', flexShrink: 0 }}
        >
          {T.repick}
        </Button>
      </Tooltip>
      <Tooltip title={T.clearTip}>
        <Button
          size="small"
          data-testid="route-clear"
          aria-label={T.clearLabel}
          onClick={onClear}
          sx={{ minWidth: 0, px: 0.4, py: 0, color: TABLE.inkFaint, flexShrink: 0 }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </Button>
      </Tooltip>
    </Box>
  )
}
