/**
 * A mission card, drawn as the printed one will be: a cream paper card on the
 * dark table, with one big diagonal of the family's colour across the picture,
 * a heavy black silhouette on it, and the job typed underneath. Flat ink, sharp
 * corners, thin black rules, generous empty paper — no gradient, no glow, no
 * texture. Whatever survives here survives a press.
 *
 * Two sizes and no other difference: the full card the shipyard and the
 * deployment screen lay out in a grid, and the `compact` card, which is the
 * size the table's hand fans (see `table/MyMissions.tsx`).
 */
import { Box, Typography } from '@mui/material'
import type {
  Cargo,
  Mission,
  MissionFamily,
  MissionRequirementStatus,
} from '@dangerous-inclinations/engine'
import { describeMission } from '@dangerous-inclinations/engine'
import { FONT_MONO, FONT_SANS, TABLE } from '../../theme'
import {
  missionFamily,
  missionFamilyColor,
  missionFamilyLabel,
  missionPoints,
  missionProgress,
} from '../../utils/missions'
import { MISSION_CODE, MissionGlyph } from './MissionGlyph'
import { SubsystemIcon } from './SubsystemIcon'

/** 5:7, the proportion of the card that will be printed. */
export const CARD_WIDTH = 184
const CARD_HEIGHT = Math.round((CARD_WIDTH * 7) / 5)
/** The card in the hand: the same shape, small enough that three of them fan. */
export const FAN_CARD_WIDTH = 112
export const FAN_CARD_HEIGHT = 158

/** Paper, and the ink printed on it. */
const PAPER = '#e9dfc7'
const INK = '#14161a'
const INK_SOFT = 'rgba(20,22,26,0.66)'
/**
 * The family colour as it prints. The table's screen colours are mixed for a
 * dark felt and have no bite on cream — same three hues, pressed harder.
 */
const FAMILY_INK: Record<MissionFamily, string> = {
  combat: '#d21b33',
  trade: '#0e7c94',
  secondary: '#c07a14',
}

/**
 * The one big diagonal, bottom-left corner to top-right. Its thickness is not a
 * taste: a band at `BAND_ANGLE` only contains a square of side `g` if it is
 * `g·(cos+sin)` thick, so the glyph is what sizes it, plus a margin of paper's
 * worth of colour around the mark. Same sum at both card sizes.
 */
const BAND_ANGLE = 32
const BAND_THICKNESS = (glyph: number, margin: number) =>
  Math.round(
    glyph * (Math.cos((BAND_ANGLE * Math.PI) / 180) + Math.sin((BAND_ANGLE * Math.PI) / 180)) +
      2 * margin
  )

/** The picture: panel height, the mark on it, how far the mark sits below centre. */
const ART = {
  full: { height: 128, glyph: 72, drop: 0, margin: 11 },
  fan: { height: 62, glyph: 34, drop: 5, margin: 7 },
} as const

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
  requires?: ReadonlyArray<MissionRequirementStatus>
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
  const band = FAMILY_INK[missionFamily(mission)] ?? missionFamilyColor(mission)
  const points = missionPoints(mission)
  const done = mission.isCompleted || faceUpToTable
  const progress = cargo ? missionProgress(mission, cargo) : null
  const unmet = requires?.some(r => !r.met) ?? false
  const outline = selected ? (unmet ? TABLE.heat : TABLE.accent) : null
  // Face up, behind the screen, or still on offer at the shipyard.
  const state = done
    ? 'face up'
    : held
      ? 'in hand'
      : onClick
        ? selected
          ? 'kept'
          : 'offered'
        : null
  const art = compact ? ART.fan : ART.full
  const bandThickness = BAND_THICKNESS(art.glyph, art.margin)

  return (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      onKeyDown={
        onClick
          ? event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        mx: 'auto',
        ...(compact
          ? { width: FAN_CARD_WIDTH, height: FAN_CARD_HEIGHT, flexShrink: 0 }
          : { width: '100%', maxWidth: CARD_WIDTH, minHeight: CARD_HEIGHT }),
        borderRadius: 0,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        bgcolor: PAPER,
        border: `1px solid ${INK}`,
        outline: outline ? `2px solid ${outline}` : 'none',
        outlineOffset: 0,
        transition: 'outline-color 140ms ease',
        '&:hover': onClick ? { outline: `2px solid ${outline ?? TABLE.accent}` } : undefined,
      }}
    >
      {/* The poster: one diagonal, one silhouette, the name and the stamp. */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          // The poster takes the slack: a fixed panel would leave a third of a
          // full card as blank paper under one line of type.
          flex: compact ? `0 0 ${art.height}px` : '1 1 auto',
          minHeight: art.height,
          borderBottom: `1px solid ${INK}`,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '280%',
            height: bandThickness,
            ml: '-140%',
            mt: `${art.drop - bandThickness / 2}px`,
            bgcolor: band,
            transform: `rotate(-${BAND_ANGLE}deg)`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pt: `${art.drop * 2}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: INK,
          }}
        >
          <MissionGlyph type={mission.type} size={art.glyph} />
        </Box>
        {/* Black on paper and black on the colour: legible wherever it falls. */}
        <Typography
          sx={{
            position: 'absolute',
            top: compact ? 2 : 5,
            left: compact ? 4 : 7,
            fontFamily: FONT_SANS,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.01em',
            lineHeight: 1,
            fontSize: compact ? '0.7rem' : '1.15rem',
            color: INK,
          }}
        >
          {missionFamilyLabel(mission)}
        </Typography>
        <Box
          sx={{
            position: 'absolute',
            right: compact ? 4 : 7,
            bottom: compact ? 4 : 7,
            width: compact ? 22 : 34,
            height: compact ? 22 : 34,
            borderRadius: '50%',
            bgcolor: band,
            // Black ring inside, paper ring outside: the stamp reads whether it
            // lands on the paper corner or on the band's own colour.
            border: `2px solid ${INK}`,
            outline: `2px solid ${PAPER}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography
            sx={{
              fontFamily: FONT_SANS,
              fontWeight: 800,
              lineHeight: 1,
              fontSize: compact ? '0.72rem' : '1.05rem',
              color: PAPER,
            }}
          >
            {points}
          </Typography>
        </Box>
      </Box>

      {/* The job, typed on the paper. */}
      <Box
        sx={{
          px: compact ? '5px' : 1,
          py: compact ? '4px' : 0.75,
          flexShrink: 0,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontWeight: 600,
            fontSize: compact ? '0.6rem' : '0.78rem',
            color: INK,
            lineHeight: 1.25,
            ...(compact ? CLAMP(4) : null),
          }}
        >
          {describeMission(mission, nameOf)}
        </Typography>
        {progress && !done && (
          <Typography
            sx={{
              fontSize: compact ? '0.56rem' : '0.72rem',
              color: INK_SOFT,
              lineHeight: 1.25,
              mt: compact ? '2px' : 0.4,
              ...(compact ? CLAMP(2) : null),
            }}
          >
            {progress}
          </Typography>
        )}
      </Box>

      {/* A black bar at the foot: where the card stands, and what it needs. */}
      <Box
        sx={{
          mt: 'auto',
          flexShrink: 0,
          bgcolor: INK,
          color: PAPER,
          px: compact ? '5px' : 1,
          py: compact ? '2px' : '4px',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 0.5,
          }}
        >
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              lineHeight: 1.5,
              fontSize: compact ? '0.5rem' : '0.58rem',
              color: done ? TABLE.success : selected ? TABLE.accent : PAPER,
            }}
          >
            {state}
          </Typography>
          {/* The serial, where a printed card carries it: the foot. */}
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              letterSpacing: '0.1em',
              lineHeight: 1.5,
              fontSize: compact ? '0.46rem' : '0.54rem',
              color: 'rgba(233,223,199,0.55)',
            }}
          >
            {MISSION_CODE[mission.type]}
          </Typography>
        </Box>
        {requires && requires.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.4, mb: 0.2 }}>
            {requires.map(r => (
              <RequirementChip key={r.requirement.label} status={r} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/** Fan cards are a fixed height, so long text is cut rather than pushing out. */
function CLAMP(lines: number) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  }
}

/**
 * "Needs a weapon" on a card whose mat has none, the same line in the quiet
 * voice once a tile that counts is fitted. It is the only warm-red thing on
 * the loadout screen, so an unflyable card is impossible to miss. The icons
 * are what would satisfy it — every tile that counts while it is unmet, the
 * ones actually aboard once it is — so "a weapon" never leaves a player
 * guessing which tiles are weapons. It sits in the card's black foot, which is
 * where the light subsystem icons still read.
 */
function RequirementChip({ status }: { status: MissionRequirementStatus }) {
  const { requirement, fitted, met } = status
  const icons = [...new Set(met ? fitted : requirement.anyOf)]
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.4,
        px: 0.5,
        py: '1px',
        borderRadius: 0,
        border: `1px solid ${met ? 'rgba(233,223,199,0.32)' : TABLE.heat}`,
        bgcolor: met ? 'transparent' : 'rgba(255,122,69,0.16)',
      }}
    >
      {icons.map(type => (
        <SubsystemIcon key={type} type={type} size={12} opacity={met ? 0.55 : 0.95} />
      ))}
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.68rem',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          lineHeight: 1.5,
          color: met ? 'rgba(233,223,199,0.7)' : TABLE.heat,
        }}
      >
        {met ? `${requirement.label} fitted` : `needs a ${requirement.label}`}
      </Typography>
    </Box>
  )
}
