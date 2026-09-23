/**
 * A d10, as rolled on the table. The face carries the number; the band under
 * it marks where the thresholds are, so the roll reads itself: 1 misses,
 * 2–9 hits, 10 is a critical (8–10 when the attacker's sensor array is up).
 */
import { Box, Tooltip, Typography } from '@mui/material'
import { FONT_MONO, TABLE } from '../../theme'
import type { DieRoll } from '../../context/AnimationContext'

const OUTCOME_COLOR: Record<DieRoll['outcome'], string> = {
  miss: TABLE.inkSoft,
  hit: TABLE.hull,
  critical: TABLE.accent,
  destroyed: TABLE.success,
  leaked: TABLE.danger,
}

const OUTCOME_TEXT: Record<DieRoll['outcome'], string> = {
  miss: 'miss',
  hit: 'hit',
  critical: 'CRIT',
  destroyed: 'stopped',
  leaked: 'leaked',
}

export function DieFace({ roll, outcome, size = 34 }: { roll: number; outcome: DieRoll['outcome']; size?: number }) {
  const color = OUTCOME_COLOR[outcome]
  return (
    <Box
      component="svg"
      viewBox="0 0 100 100"
      sx={{ width: size, height: size, flexShrink: 0, animation: 'di-dice-roll 320ms ease-out' }}
    >
      <polygon
        points="50,4 94,38 78,94 22,94 6,38"
        fill={TABLE.plateSunk}
        stroke={color}
        strokeWidth={5}
        strokeLinejoin="miter"
      />
      <polygon points="50,4 78,94 22,94" fill={TABLE.hover} />
      <text
        x="50"
        y="66"
        textAnchor="middle"
        fontSize="44"
        fontWeight="700"
        fontFamily={FONT_MONO}
        fill={color}
      >
        {roll}
      </text>
    </Box>
  )
}

/** One die plus its story: who rolled, at whom, and what the thresholds were. */
export function DieResult({
  die,
  nameOf,
  size = 34,
}: {
  die: DieRoll
  nameOf: (playerId: string) => string
  size?: number
}) {
  const critFrom = die.critThreshold
  const scale =
    die.outcome === 'destroyed' || die.outcome === 'leaked'
      ? '1 misses · 2+ destroys the missile'
      : `1 miss · 2–${critFrom - 1} hit · ${critFrom}–10 crit`

  return (
    <Tooltip title={`${nameOf(die.attackerId)} → ${nameOf(die.targetId)} · ${die.label} · ${scale}`}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <DieFace roll={die.roll} outcome={die.outcome} size={size} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontWeight: 700,
              fontSize: '0.8rem',
              color: OUTCOME_COLOR[die.outcome],
              lineHeight: 1.1,
              letterSpacing: '0.08em',
            }}
          >
            {OUTCOME_TEXT[die.outcome]}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: TABLE.inkSoft, lineHeight: 1.2 }} noWrap>
            {nameOf(die.attackerId)} → {nameOf(die.targetId)}
          </Typography>
          <ThresholdBand critFrom={critFrom} roll={die.roll} />
        </Box>
      </Box>
    </Tooltip>
  )
}

/** Ten little cells, with the crit band lit and the rolled cell marked. */
function ThresholdBand({ critFrom, roll }: { critFrom: number; roll: number }) {
  return (
    <Box sx={{ display: 'flex', gap: '1px', mt: '2px' }}>
      {Array.from({ length: 10 }, (_, i) => {
        const value = i + 1
        const kind = value === 1 ? 'miss' : value >= critFrom ? 'crit' : 'hit'
        return (
          <Box
            key={value}
            sx={{
              width: 7,
              height: 5,
              bgcolor:
                kind === 'miss'
                  ? TABLE.unlitEdge
                  : kind === 'crit'
                    ? `${TABLE.accent}cc`
                    : `${TABLE.hull}88`,
              outline: value === roll ? `1.5px solid ${TABLE.ink}` : 'none',
              outlineOffset: value === roll ? '1px' : 0,
            }}
          />
        )
      })}
    </Box>
  )
}
