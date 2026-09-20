/**
 * Your points, and the cards they will come from: the completed ones face up in
 * a row of tabs, the rest fanned as a hand you can point at and read. The hand
 * itself is `common/MissionHand.tsx`. Deployment holds the same cards the same
 * way.
 */
import type { Player } from '@dangerous-inclinations/engine'
import { Typography } from '@mui/material'
import { TABLE } from '../../theme'
import { Panel } from '../common/Panel'
import { MissionHand } from '../common/MissionHand'
import { useGame } from '../../context/GameContext'

export function MyMissions({ me }: { me: Player }) {
  const { nameOf, view } = useGame()

  return (
    <Panel
      title={`Points ${me.completedMissionCount}/${view.pointsToWin}`}
      dense
      collapseId="points"
      sx={{ flexShrink: 0, minWidth: 0 }}
    >
      <MissionHand
        missions={me.missions}
        cargo={me.cargo}
        fuel={me.ship?.reactionMass}
        nameOf={nameOf}
      />
      {me.missions.length === 0 && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
          No missions yet.
        </Typography>
      )}
    </Panel>
  )
}
