/**
 * The dice tray. Every d10 rolled during the turn being played lands here,
 * with the thresholds marked: 1 misses, 2–9 hit, 10 is a critical (8–10 when
 * the attacker's sensor array is face-up).
 */
import { Box, Typography } from '@mui/material'
import { useDice } from '../../context/AnimationContext'
import { useGame } from '../../context/GameContext'
import { DieResult } from '../common/DieFace'
import { TABLE } from '../../theme'

export function DiceTray() {
  const dice = useDice()
  const { nameOf } = useGame()

  if (dice.length === 0) return null

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 12,
        top: 12,
        maxWidth: 230,
        px: 1,
        py: 0.75,
        bgcolor: TABLE.plate,
        border: `1px solid ${TABLE.plateEdge}`,
        borderTop: `3px solid ${TABLE.accentBlock}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        animation: 'di-fade-in 220ms ease',
        pointerEvents: 'none',
      }}
    >
      <Typography variant="overline" sx={{ color: TABLE.ink, lineHeight: 1.4 }}>
        Dice
      </Typography>
      {dice.slice(-4).map((die) => (
        <DieResult key={die.id} die={die} nameOf={nameOf} />
      ))}
    </Box>
  )
}
