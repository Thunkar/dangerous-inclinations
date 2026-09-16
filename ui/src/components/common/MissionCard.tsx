/**
 * A mission card. In hand it sits dark behind your screen (the table can see
 * you hold three cards, not what they are); completed, it lights up for
 * everyone — that is the scoreboard.
 */
import { Box, Typography } from '@mui/material'
import type { Cargo, Mission, SubsystemType } from '@dangerous-inclinations/engine'
import { describeMission, getSubsystemConfig } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { missionFamilyColor, missionFamilyLabel, missionPoints, missionProgress } from '../../utils/missions'
import { SubsystemIcon } from './SubsystemIcon'

/** A tile the card cannot be completed without, and whether the mat carries it. */
export interface MissionRequirement {
  type: SubsystemType
  met: boolean
}

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
  /**
   * Tiles this card needs aboard, checked against the mat being fitted. Only
   * the loadout screen passes them: everywhere else the ship is already built.
   */
  requires?: ReadonlyArray<MissionRequirement>
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
  requires,
}: MissionCardProps) {
  const accent = missionFamilyColor(mission)
  const points = missionPoints(mission)
  const done = mission.isCompleted || faceUpToTable
  const progress = cargo ? missionProgress(mission, cargo) : null
  const unmet = requires?.some(r => !r.met) ?? false

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
        border: `1px solid ${unmet && selected ? TABLE.heat : selected ? TABLE.accent : TABLE.plateEdge}`,
        borderLeft: `3px solid ${accent}`,
        boxShadow: selected
          ? unmet
            ? `0 0 0 1px ${TABLE.heat}66, 0 0 14px ${TABLE.heat}55`
            : `0 0 0 1px ${TABLE.accentGlow}, 0 0 14px ${TABLE.accentGlow}`
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
          {points > 1 && <Box component="span" sx={{ color: TABLE.ink, ml: 0.75 }}>{points} pts</Box>}
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
      {requires && requires.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.5 }}>
          {requires.map(r => (
            <RequirementChip key={r.type} type={r.type} met={r.met} />
          ))}
        </Box>
      )}
    </Box>
  )
}

/**
 * "Needs a sensor array" on a card whose mat has none, the same line in the
 * quiet voice once the tile is fitted. It is the only warm-red thing on the
 * loadout screen, so an unflyable card is impossible to miss.
 */
function RequirementChip({ type, met }: MissionRequirement) {
  const name = getSubsystemConfig(type).name
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.4,
        px: 0.5,
        py: '1px',
        borderRadius: 0.75,
        border: `1px solid ${met ? TABLE.line : TABLE.heat}`,
        bgcolor: met ? 'transparent' : 'rgba(255,122,69,0.12)',
      }}
    >
      <SubsystemIcon type={type} size={12} opacity={met ? 0.55 : 0.95} />
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.68rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          lineHeight: 1.5,
          color: met ? TABLE.inkFaint : TABLE.heat,
        }}
      >
        {met ? `${name} fitted` : `needs ${name}`}
      </Typography>
    </Box>
  )
}
