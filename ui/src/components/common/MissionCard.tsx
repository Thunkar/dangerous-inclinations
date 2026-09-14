/**
 * A mission card. In hand it sits dark behind your screen (the table can see
 * you hold three cards, not what they are); completed, it lights up for
 * everyone — that is the scoreboard.
 */
import { Box, Typography } from '@mui/material'
import type { Cargo, Mission } from '@dangerous-inclinations/engine'
import { describeMission } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { missionFamilyColor, missionFamilyLabel, missionProgress } from '../../utils/missions'

interface MissionCardProps {
  mission: Mission
  nameOf: (playerId: string) => string
  /** Your own cargo, for progress lines. Omit for opponents. */
  cargo?: ReadonlyArray<Cargo>
  /** Face-up for the whole table (completed), or held in your hand. */
  faceUpToTable?: boolean
  /** Still behind your screen: nobody else knows you hold it. */
  held?: boolean
  selected?: boolean
  onClick?: () => void
  compact?: boolean
}

export function MissionCard({
  mission,
  nameOf,
  cargo,
  faceUpToTable,
  held,
  selected,
  onClick,
  compact,
}: MissionCardProps) {
  const accent = missionFamilyColor(mission)
  const done = mission.isCompleted || faceUpToTable
  const progress = cargo ? missionProgress(mission, cargo) : null

  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'relative',
        minWidth: compact ? 132 : 176,
        px: compact ? 0.75 : 1,
        py: compact ? 0.5 : 0.75,
        borderRadius: 1,
        cursor: onClick ? 'pointer' : 'default',
        background: done
          ? `linear-gradient(180deg, rgba(255,180,69,0.10) 0%, ${TABLE.plate} 100%)`
          : `linear-gradient(180deg, ${TABLE.plateHi} 0%, ${TABLE.plateSunk} 100%)`,
        border: `1px solid ${selected ? TABLE.accent : TABLE.plateEdge}`,
        borderLeft: `3px solid ${accent}`,
        boxShadow: selected
          ? `0 0 0 1px ${TABLE.accentGlow}, 0 0 14px ${TABLE.accentGlow}`
          : done
            ? `0 0 10px ${accent}33`
            : 'none',
        opacity: held && !done ? 0.92 : 1,
        transition: 'box-shadow 140ms ease, border-color 140ms ease',
        '&:hover': onClick ? { borderColor: TABLE.accent } : undefined,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5 }}>
        <Typography variant="overline" sx={{ color: accent, lineHeight: 1.5, fontSize: '0.75rem' }}>
          {missionFamilyLabel(mission)}
        </Typography>
        {done ? (
          <Typography variant="overline" sx={{ color: TABLE.success, lineHeight: 1.5, fontSize: '0.75rem' }}>
            ✓ face up
          </Typography>
        ) : held ? (
          <Typography variant="overline" sx={{ color: TABLE.inkFaint, lineHeight: 1.5, fontSize: '0.75rem' }}>
            in hand
          </Typography>
        ) : null}
      </Box>
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontWeight: 600,
          fontSize: compact ? '0.74rem' : '0.8rem',
          color: TABLE.ink,
          lineHeight: 1.3,
        }}
      >
        {describeMission(mission, nameOf)}
      </Typography>
      {progress && !done && (
        <Typography sx={{ fontSize: '0.78rem', color: TABLE.inkSoft, mt: 0.25, lineHeight: 1.35 }}>
          {progress}
        </Typography>
      )}
    </Box>
  )
}
