/**
 * The dice tray. Every d10 rolled during the turn being played lands here,
 * with the thresholds marked: 1 misses, 2–9 hit, 10 is a critical (8–10 when
 * the attacker's sensor array is face-up).
 */
import { Box, Typography } from '@mui/material'
import { useAnimation } from '../../context/AnimationContext'
import { useGame } from '../../context/GameContext'
import { DieResult } from '../common/DieFace'
import { TABLE } from '../../theme'

export function DiceTray() {
  const { dice } = useAnimation()
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
        borderRadius: 1.5,
        background: `linear-gradient(180deg, ${TABLE.plateHi} 0%, ${TABLE.plate} 100%)`,
        border: `1px solid ${TABLE.plateEdge}`,
        boxShadow: '0 10px 26px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        animation: 'di-fade-in 220ms ease',
        pointerEvents: 'none',
      }}
    >
      <Typography variant="overline" sx={{ color: TABLE.inkFaint, lineHeight: 1.4 }}>
        Dice
      </Typography>
      {dice.slice(-4).map((die) => (
        <DieResult key={die.id} die={die} nameOf={nameOf} />
      ))}
    </Box>
  )
}
