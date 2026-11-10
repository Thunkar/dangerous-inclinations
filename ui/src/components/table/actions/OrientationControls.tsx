import { Box, Chip, Tooltip, Typography } from '@mui/material'
import { drawFor, fill, oppositeFacing } from '@dangerous-inclinations/engine'
import { usePlan } from '../../../context/PlanContext'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'
import { ACTIONS } from '../../../text/actions'
import { ActionIcon } from './parts'

const T = ACTIONS.orientation

/** Which way the nose points, and the one rotation a turn that flips it. */
export function OrientationControls() {
  const plan = usePlan()
  const disabled = plan.disabled
  const rotating = plan.steps.some(s => s.kind === 'rotate')
  const ready = plan.rotateReady
  const facing = plan.me.ship.facing

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Tooltip
        title={ready.ok || rotating ? fill(T.tip, { energy: drawFor('rotation') }) : ready.reason}
      >
        <Box component="span" sx={{ display: 'flex' }}>
          <Chip
            size="small"
            icon={<ActionIcon type="rotation" />}
            label={rotating ? T.rotating : T.rotate}
            color={rotating ? 'primary' : 'default'}
            variant={rotating ? 'filled' : 'outlined'}
            onClick={plan.toggleRotate}
            // A queued rotation can always be taken back, whatever the loadout says.
            disabled={disabled || (!rotating && !ready.ok)}
          />
        </Box>
      </Tooltip>
      <Typography variant="caption" sx={{ fontFamily: FONT_MONO, color: TABLE.inkSoft }} noWrap>
        {facing}
        {rotating ? fill(T.turnsTo, { facing: oppositeFacing(facing) }) : ''}
      </Typography>
    </Box>
  )
}
