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
import { fill, interceptsPerRack } from '@dangerous-inclinations/engine'
import type { HitRollResult } from '@dangerous-inclinations/engine'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { BASE_CRIT, D10, INTERCEPT_ON, MISS_TOP, SENSOR_CRIT, faceResult } from '../numbers'
import { Field, Label, Plate, Stepper, Toggle } from './controls'
import { TOOLS } from '../../text/tools'

const T = TOOLS.dice

/** A salvo is a magazine, and a rack answers a magazine. Nothing needs more. */
const MAX_DICE = interceptsPerRack() * 2

const TOP_FACE = D10[D10.length - 1]

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

  const results = rolls.map(roll => faceResult(roll, sensor))
  const tally = (kind: HitRollResult) => results.filter(r => r === kind).length
  const critFrom = sensor ? SENSOR_CRIT : BASE_CRIT
  const crits = critFrom < TOP_FACE ? fill(T.range, { from: critFrom, to: TOP_FACE }) : critFrom

  return (
    <Plate>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, flexWrap: 'wrap', mb: 2.5 }}>
        <Field label={T.dice}>
          <Stepper value={count} min={1} max={MAX_DICE} onChange={setCount} label={T.diceAloud} />
        </Field>
        <Toggle on={sensor} label={T.sensor} onChange={setSensor} />
      </Box>

      <Box
        component="button"
        type="button"
        onClick={() => setRolls(Array.from({ length: count }, rollD10))}
        aria-label={fill(T.rollAloud, { count })}
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
            {T.roll}
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
              {fill(T.crits, { count: tally('critical') })}
            </Box>
            <Box component="span">{fill(T.hits, { count: tally('hit') })}</Box>
            <Box component="span" sx={{ color: PRESS.inkSoft }}>
              {fill(T.misses, { count: tally('miss') })}
            </Box>
          </Box>
        )}
        <Box sx={{ flex: 1 }} />
        <Label color={PRESS.inkSoft}>
          {fill(T.faces, {
            missTop: MISS_TOP,
            hitFrom: MISS_TOP + 1,
            hitTo: critFrom - 1,
            crit: crits,
            intercept: INTERCEPT_ON,
          })}
        </Label>
      </Box>
    </Plate>
  )
}
