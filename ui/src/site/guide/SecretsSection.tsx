/**
 * 07 · What is hidden and how it comes out, and 08 · what happens when a ship
 * is destroyed: the two rules a first game is most often surprised by.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  MISSION_POINTS,
  SCAN_SECTOR_RANGE,
} from '@dangerous-inclinations/engine'
import { TileIcon } from '../../art/glyphs'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Numeral } from '../poster'
import { GuideSection, Points, SubHead } from './parts'

const REVEALS: Array<{ types: SubsystemType[]; when: ReactNode }> = [
  { types: ['railgun', 'laser', 'missiles'], when: 'A weapon, when it fires.' },
  { types: ['ballistic_rack'], when: 'A rack, when it fires or rolls at a missile.' },
  { types: ['shields'], when: 'Shields, when they absorb damage.' },
  { types: ['sensor_array'], when: 'A sensor, when it scans.' },
  {
    types: ['radiator'],
    when: `A radiator, when your heat is over ${DEFAULT_DISSIPATION_CAPACITY} at a check.`,
  },
  {
    types: ['fuel_compressor'],
    when: `A compressor, when a jump costs ${COMPRESSED_JUMP_MASS} fuel.`,
  },
  { types: [], when: 'Any subsystem, when a critical breaks it.' },
]

function Reveals() {
  return (
    <Box sx={{ border: `4px solid ${PRESS.ink}` }}>
      <Box
        sx={{
          bgcolor: PRESS.ink,
          color: PRESS.paper,
          px: 2,
          py: 1.25,
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '1.2rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        Turned face-up when
      </Box>
      {REVEALS.map((row, index) => (
        <Box
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: '92px 1fr',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.1,
            borderTop: index === 0 ? 'none' : `2px solid ${PRESS.inkFaint}`,
          }}
        >
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            {row.types.map(type => (
              <TileIcon key={type} type={type} size={24} />
            ))}
          </Box>
          <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.96rem' }}>{row.when}</Box>
        </Box>
      ))}
      <Box sx={{ bgcolor: PRESS.red, color: PRESS.paper, px: 2, py: 1.25 }}>
        <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.96rem', fontWeight: 700 }}>
          Powering a subsystem does not turn it face-up.
        </Box>
      </Box>
    </Box>
  )
}

export function SecretsSection() {
  return (
    <GuideSection
      id="secrets"
      n={7}
      kicker="Hidden information"
      title="Secret until powered"
      lede="Subsystems turn face-up the first time they do their job."
      tone="deep"
    >
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 4, md: 6 },
          gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' },
          alignItems: 'start',
        }}
      >
        <Reveals />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box>
            <SubHead>Read the energy</SubHead>
            <Points
              items={[
                <>
                  Energy on every subsystem is <b>public</b>. On a face-down subsystem it means
                  powered, not used.
                </>,
                <>A gun is dark until it fires.</>,
              ]}
            />
          </Box>
          <Box>
            <SubHead>Scan to be sure</SubHead>
            <Points
              items={[
                <>
                  With a sensor, scan a ship on your ring within {SCAN_SECTOR_RANGE} sectors: look
                  at one of its face-down subsystems. Intercept holders take its data.
                </>,
              ]}
            />
          </Box>
        </Box>
      </Box>
    </GuideSection>
  )
}

const DEATH: Array<{ when: string; title: string; text: string }> = [
  {
    when: 'At 0 hull',
    title: 'Off the board',
    text: `Crates go back to their station, data is lost. Your Destroy holder scores ${MISSION_POINTS.destroy_ship}.`,
  },
  {
    when: 'Your next turn',
    title: 'Back at Home',
    text: 'Full hull and fuel, heat 0, drifting. That is the turn.',
  },
  {
    when: 'The turn after',
    title: 'A quiet turn',
    text: 'Move as usual, fire at nobody. Nobody can touch you until it ends.',
  },
]

export function DeathSection() {
  return (
    <GuideSection
      id="death"
      n={8}
      kicker="Destruction"
      title="Nobody is out"
      lede="A destroyed ship comes back, minus its cargo and a turn."
    >
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 1.5, md: 0 },
          gridTemplateColumns: { xs: '1fr', md: '1fr auto 1fr auto 1fr' },
          alignItems: 'stretch',
        }}
      >
        {DEATH.map((step, index) => (
          <Box key={step.when} sx={{ display: 'contents' }}>
            {index > 0 && (
              <Box
                aria-hidden
                sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', px: 1.25 }}
              >
                <svg width={34} height={30} viewBox="0 0 34 30" focusable="false">
                  <path d="M0 10h18V0l16 15-16 15V20H0z" fill={PRESS.red} />
                </svg>
              </Box>
            )}
            <Box
              sx={{
                border: `4px solid ${PRESS.ink}`,
                bgcolor: index === 0 ? PRESS.ink : 'transparent',
                color: index === 0 ? PRESS.paper : PRESS.ink,
                p: 2.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <Numeral size="1.1rem" color={index === 0 ? PRESS.red : PRESS.redText}>
                {step.when.toUpperCase()}
              </Numeral>
              <Display size="1.7rem" color={index === 0 ? PRESS.paper : PRESS.ink} component="h3">
                {step.title}
              </Display>
              <Body size="0.96rem" color={index === 0 ? PRESS.paperSoft : PRESS.ink}>
                {step.text}
              </Body>
            </Box>
          </Box>
        ))}
      </Box>
    </GuideSection>
  )
}
