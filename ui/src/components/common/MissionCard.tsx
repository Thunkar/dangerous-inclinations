/**
 * A mission card, drawn as the printed one will be: a cream paper card on the
 * dark table, with one big diagonal of the family's colour across the picture,
 * a heavy black silhouette on it, and the job typed underneath. Flat ink, sharp
 * corners, thin black rules — no gradient, no glow, no texture. Whatever
 * survives here survives a press.
 *
 * **Every card of a size is the same card.** A deck is cut, not laid out: the
 * title strip, the picture, the description and the foot bar each have a fixed
 * height, the text is clamped to a fixed number of lines, and the foot's space
 * is reserved even when there is nothing to print in it. Two cards of the same
 * size therefore measure the same however long their wording is, and both sizes
 * are 5:7. The `compact` card is the size the table's hand fans (see
 * `table/MyMissions.tsx`).
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

/** Paper, and the ink printed on it. */
const PAPER = '#e9dfc7'
const INK = '#14161a'
const INK_SOFT = 'rgba(20,22,26,0.66)'
const PAPER_SOFT = 'rgba(233,223,199,0.6)'
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
 * The cut of the card. Width and height are 5:7; the title strip, description
 * and foot are fixed, three hairline rules separate the four sections, and the
 * picture is whatever is left — so the sum is the height by construction and
 * cannot drift when a number here is edited.
 */
interface Cut {
  width: number
  height: number
  title: number
  desc: number
  foot: number
  glyph: number
  stamp: number
  /** Colour left around the glyph inside the diagonal. */
  margin: number
  pad: number
  titleSize: string
  textSize: string
  progressSize: string
  /** The badge in the corner, the footer line, and the serial in it. */
  stateSize: string
  footSize: string
  icon: number
  /** Lines the description is allowed before it is cut with an ellipsis. */
  textLines: number
  progressLines: number
}

const FULL: Cut = {
  width: 168,
  height: 235,
  title: 24,
  desc: 70,
  foot: 18,
  glyph: 58,
  stamp: 30,
  margin: 10,
  pad: 7,
  titleSize: '1rem',
  textSize: '0.74rem',
  progressSize: '0.66rem',
  stateSize: '0.5rem',
  footSize: '0.46rem',
  icon: 9,
  textLines: 2,
  progressLines: 2,
}

const FAN: Cut = {
  width: 112,
  height: 157,
  title: 14,
  desc: 68,
  foot: 14,
  glyph: 32,
  stamp: 18,
  margin: 6,
  pad: 4,
  titleSize: '0.66rem',
  textSize: '0.6rem',
  progressSize: '0.56rem',
  stateSize: '0.42rem',
  footSize: '0.42rem',
  icon: 8,
  textLines: 3,
  progressLines: 2,
}

/** 5:7, the proportion of the card that will be printed. */
export const CARD_WIDTH = FULL.width
export const FAN_CARD_WIDTH = FAN.width
export const FAN_CARD_HEIGHT = FAN.height

/**
 * What the other three sections leave for the picture. Every box is
 * border-box, so each section's own hairline rule is already inside its
 * height; only the card's two borders come off the top. Counting the rules
 * again here is what left three pixels of bare paper under the footer.
 */
const artHeight = (cut: Cut) => cut.height - 2 - cut.title - cut.desc - cut.foot

/**
 * The one big diagonal, bottom-left corner to top-right. Its thickness is not a
 * taste: a band at `BAND_ANGLE` only contains a square of side `g` if it is
 * `g·(cos+sin)` thick, so the glyph is what sizes it, plus a margin of colour
 * round the mark. Same sum at both card sizes.
 */
const BAND_ANGLE = 32
const bandThickness = (cut: Cut) =>
  Math.round(
    cut.glyph * (Math.cos((BAND_ANGLE * Math.PI) / 180) + Math.sin((BAND_ANGLE * Math.PI) / 180)) +
      2 * cut.margin
  )

/** A fixed box of text: as many lines as it was given, then an ellipsis. */
const clamp = (lines: number) => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
})

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
   * Tiles this card needs aboard, checked against the loadout being fitted.
   * Only the loadout screen passes them: everywhere else the ship is built.
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
  const cut = compact ? FAN : FULL
  const band = FAMILY_INK[missionFamily(mission)] ?? missionFamilyColor(mission)
  const points = missionPoints(mission)
  const done = mission.isCompleted || faceUpToTable
  const progress = cargo ? missionProgress(mission, cargo) : null
  const unmet = requires?.some(r => !r.met) ?? false
  const outline = selected ? (unmet ? TABLE.heat : TABLE.accent) : null
  // Face up, behind the screen, or kept at the shipyard. This is not card
  // content — a printed card has no such line — so it rides over the corner as
  // a badge and moves nothing.
  const state = done ? 'face up' : held ? 'in hand' : selected ? 'kept' : null
  const needs = requires !== undefined && requires.length > 0

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
        flexShrink: 0,
        mx: 'auto',
        width: cut.width,
        height: cut.height,
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
      {/* Title strip: the family name, always black on bare paper. */}
      <Box
        sx={{
          flex: `0 0 ${cut.title}px`,
          display: 'flex',
          alignItems: 'center',
          px: `${cut.pad}px`,
          borderBottom: `1px solid ${INK}`,
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_SANS,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.01em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            fontSize: cut.titleSize,
            color: INK,
          }}
        >
          {missionFamilyLabel(mission)}
        </Typography>
      </Box>

      {/* The poster: one diagonal, one silhouette, the stamp on bare paper. */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          flex: `0 0 ${artHeight(cut)}px`,
          borderBottom: `1px solid ${INK}`,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '280%',
            height: bandThickness(cut),
            ml: '-140%',
            mt: `${-bandThickness(cut) / 2}px`,
            bgcolor: band,
            transform: `rotate(-${BAND_ANGLE}deg)`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: INK,
          }}
        >
          <MissionGlyph type={mission.type} size={cut.glyph} />
        </Box>
        <Box
          sx={{
            position: 'absolute',
            right: `${cut.pad - 1}px`,
            bottom: `${cut.pad - 1}px`,
            width: cut.stamp,
            height: cut.stamp,
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

      {/* The job, typed on the paper, in a box that never changes size. */}
      <Box
        sx={{
          flex: `0 0 ${cut.desc}px`,
          overflow: 'hidden',
          px: `${cut.pad}px`,
          py: `${Math.round(cut.pad / 2)}px`,
          borderBottom: `1px solid ${INK}`,
        }}
      >
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontWeight: 600,
            fontSize: cut.textSize,
            color: INK,
            lineHeight: 1.25,
            ...clamp(cut.textLines),
          }}
        >
          {describeMission(mission, nameOf)}
        </Typography>
        {progress && !done && (
          <Typography
            sx={{
              fontSize: cut.progressSize,
              color: INK_SOFT,
              lineHeight: 1.25,
              mt: '2px',
              ...clamp(cut.progressLines),
            }}
          >
            {progress}
          </Typography>
        )}
      </Box>

      {/* One black line at the foot, flush to the border: what the card needs
          aboard on the left, its serial on the right, every card the same. */}
      <Box
        sx={{
          flex: `0 0 ${cut.foot}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          overflow: 'hidden',
          bgcolor: INK,
          color: PAPER,
          px: `${cut.pad}px`,
        }}
      >
        {needs && <RequirementLine cut={cut} requires={requires} />}
        <Typography
          sx={{
            ml: 'auto',
            flexShrink: 0,
            fontFamily: FONT_MONO,
            letterSpacing: '0.1em',
            lineHeight: 1.4,
            fontSize: cut.footSize,
            color: PAPER_SOFT,
          }}
        >
          {MISSION_CODE[mission.type]}
        </Typography>
      </Box>

      {/* Where the card stands, stamped over the corner rather than printed on
          the card: nothing under it moves whether it is there or not. */}
      {state && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bgcolor: INK,
            px: `${cut.pad - 2}px`,
            py: '2px',
            pointerEvents: 'none',
          }}
        >
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
              fontSize: cut.stateSize,
              color: done ? TABLE.success : selected ? TABLE.accent : PAPER,
            }}
          >
            {state}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

/**
 * What the card needs aboard, on the one footer line: the word, the tiles that
 * would satisfy it, and the labels. Warm red until the loadout carries one of
 * them and paper with a tick once it does, so an unflyable card is impossible
 * to miss on the shipyard screen — the only place the line has anything to say.
 * It lives on the black foot, which is where the light subsystem icons read.
 */
function RequirementLine({
  cut,
  requires,
}: {
  cut: Cut
  requires: ReadonlyArray<MissionRequirementStatus>
}) {
  const met = requires.every(r => r.met)
  const icons = [...new Set(requires.flatMap(r => (r.met ? r.fitted : r.requirement.anyOf)))]
  const labels = requires.map(r => r.requirement.label).join(' · ')
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0 }}>
      {icons.map(type => (
        <SubsystemIcon key={type} type={type} size={cut.icon} opacity={met ? 0.55 : 0.95} />
      ))}
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontWeight: 700,
          fontSize: cut.footSize,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.4,
          color: met ? PAPER_SOFT : TABLE.heat,
        }}
      >
        {`requirements · ${labels}${met ? ' ✓' : ''}`}
      </Typography>
    </Box>
  )
}
