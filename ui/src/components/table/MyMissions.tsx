/**
 * The three cards behind your screen, stacked in the left column under the
 * rivals' mats. They are yours alone: the table sees that you hold them, not
 * what they say.
 */
import { Box, Typography } from '@mui/material'
import type { Player } from '@dangerous-inclinations/engine'
import { MISSIONS_TO_WIN } from '@dangerous-inclinations/engine'
import { TABLE } from '../../theme'
import { Panel } from '../common/Panel'
import { MissionCard } from '../common/MissionCard'
import { useGame } from '../../context/GameContext'

export function MyMissions({ me }: { me: Player }) {
  const { nameOf } = useGame()

  return (
    <Panel
      title={`Points ${me.completedMissionCount}/${MISSIONS_TO_WIN}`}
      dense
      collapseId="points"
      sx={{ flexShrink: 0, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
        {me.missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            nameOf={nameOf}
            cargo={me.cargo}
            held={!mission.isCompleted}
            compact
          />
        ))}
        {me.missions.length === 0 && (
          <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
            No missions yet.
          </Typography>
        )}
      </Box>
    </Panel>
  )
}
