import { Box, Button, Tooltip, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import type { MovementStep } from '@dangerous-inclinations/engine'
import { fill } from '@dangerous-inclinations/engine'
import { describeStep } from '../../../utils/route'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { RED_TINT, T } from './style'

/**
 * The join between the plan and the turn. One of two states, and never a
 * guess: either the route's first step is the move on the sheet, or here is
 * the button that makes it so.
 */
export function FirstStep({
  step,
  taken,
  disabled,
  onTake,
}: {
  step: MovementStep
  taken: boolean
  disabled: boolean
  onTake: () => void
}) {
  if (taken) {
    return (
      <Box
        data-testid="route-step-taken"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          px: 0.75,
          py: 0.4,
          mt: 0.1,
          border: `1px solid ${TABLE.accentDim}`,
          bgcolor: RED_TINT,
          minWidth: 0,
        }}
      >
        <CheckIcon sx={{ fontSize: 15, color: TABLE.accent, flexShrink: 0 }} />
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.74rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: TABLE.accent,
            minWidth: 0,
          }}
          noWrap
        >
          {T.stepTaken}
        </Typography>
      </Box>
    )
  }

  return (
    <Tooltip title={fill(T.takeTip, { step: describeStep(step) })}>
      <Box component="span" sx={{ display: 'flex', mt: 0.1, minWidth: 0 }}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          color="primary"
          data-testid="route-take-step"
          disabled={disabled}
          onClick={onTake}
          sx={{
            py: 0.3,
            fontSize: '0.74rem',
            borderColor: TABLE.accentDim,
            color: TABLE.accent,
            '&:hover': { borderColor: TABLE.accent, bgcolor: RED_TINT },
          }}
        >
          {T.take}
        </Button>
      </Box>
    </Tooltip>
  )
}
