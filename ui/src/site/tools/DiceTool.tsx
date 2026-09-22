/**
 * A d10, or several.
 *
 * Several because a salvo is one action and a rack answers it one roll per
 * missile, so the two turns that need dice need a handful of them at once.
 * The only rule here is which numbers mean what, and that is the engine's
 * (`rollToResult`): a powered sensor array moves the critical range and
 * nothing else does. The faces are shaded as the cheatsheet's roll strip is.
 *
 * The die is the browser's cryptographic source, not the engine's seeded RNG.
 * A seeded die is the one thing a table does not want.
 */
import { useState } from 'react'
import { Box } from '@mui/material'
import {
  BASE_CRITICAL_CHANCE,
  interceptsPerRack,
  rollToResult,
} from '@dangerous-inclinations/engine'
import type { HitRollResult } from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { BASE_CRIT, INTERCEPT_ON, MISS_TOP, SENSOR_CRIT, SENSOR_CRIT_BONUS } from '../numbers'
import { Field, Label, Plate, Stepper, Toggle } from './controls'

/** A salvo is a magazine, and a rack answers a magazine. Nothing needs more. */
const MAX_DICE = interceptsPerRack() * 2

const FACE: Record<HitRollResult, { bg: string; fg: string; edge: string }> = {
  miss: { bg: 'transparent', fg: PRESS.ink, edge: PRESS.ink },
  hit: { bg: PRESS.ink, fg: PRESS.paper, edge: PRESS.ink },
  critical: { bg: PRESS.red, fg: PRESS.paper, edge: PRESS.red },
}

/** A fair d10, without the modulo bias a plain remainder would give it. */
function rollD10(): number {
  const bytes = new Uint8Array(1)
  for (;;) {
    crypto.getRandomValues(bytes)
    if (bytes[0] < 250) return (bytes[0] % 10) + 1 // 25 whole runs of ten
  }
}

export function DiceTool() {
  const [count, setCount] = useState(1)
  const [sensor, setSensor] = useState(false)
  const [rolls, setRolls] = useState<number[]>([])

  const criticalChance = BASE_CRITICAL_CHANCE + (sensor ? SENSOR_CRIT_BONUS : 0)
  const results = rolls.map(roll => rollToResult(roll, criticalChance))
  const tally = (kind: HitRollResult) => results.filter(r => r === kind).length
  const critFrom = sensor ? SENSOR_CRIT : BASE_CRIT

  return (
    <Plate>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, flexWrap: 'wrap', mb: 2.5 }}>
        <Field label="Dice">
          <Stepper value={count} min={1} max={MAX_DICE} onChange={setCount} label="dice" />
        </Field>
        <Toggle on={sensor} label="Sensor powered" onChange={setSensor} />
      </Box>

      <Box
        component="button"
        type="button"
        onClick={() => setRolls(Array.from({ length: count }, rollD10))}
        aria-label={`Roll ${count} d10`}
        sx={{
          width: '100%',
          minHeight: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 1.5,
          p: 2,
          border: `4px solid ${PRESS.ink}`,
          bgcolor: rolls.length === 0 ? PRESS.red : PRESS.paperDeep,
          cursor: 'pointer',
          touchAction: 'manipulation',
          '&:hover': { borderColor: PRESS.red },
        }}
      >
        {rolls.length === 0 ? (
          <Box
            sx={{
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: '3rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: PRESS.paper,
            }}
          >
            Roll
          </Box>
        ) : (
          rolls.map((roll, index) => {
            const look = FACE[results[index]]
            const size = rolls.length > 4 ? 72 : 110
            return (
              <Box
                key={index}
                sx={{
                  width: size,
                  height: size,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: look.bg,
                  border: `4px solid ${look.edge}`,
                  color: look.fg,
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: size > 100 ? '4rem' : '2.6rem',
                  lineHeight: 1,
                }}
              >
                {roll}
              </Box>
            )
          })
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap', mt: 2 }}>
        {rolls.length > 0 && (
          <Box
            aria-live="polite"
            sx={{
              display: 'flex',
              gap: 2,
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: '1.3rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <Box component="span" sx={{ color: PRESS.redText }}>
              {tally('critical')} crit
            </Box>
            <Box component="span">{tally('hit')} hit</Box>
            <Box component="span" sx={{ color: PRESS.inkSoft }}>
              {tally('miss')} miss
            </Box>
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <Label color={PRESS.inkSoft}>
          {MISS_TOP} miss · {MISS_TOP + 1}&ndash;{critFrom - 1} hit · {critFrom}
          {critFrom < 10 ? '–10' : ''} crit · a rack downs a missile on {INTERCEPT_ON}+
        </Label>
      </Box>
    </Plate>
  )
}
