/**
 * 06 · Fighting: one d10, four guns, and what a hit does.
 *
 * The roll strip asks `rollToResult` about every face, bare and with a sensor
 * up, so the shading is the engine's and not a table typed out here.
 */
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  BASE_CRITICAL_CHANCE,
  SHIELD_ENERGY_PER_POINT,
  SUBSYSTEM_CONFIGS,
  interceptsPerRack,
  rollToResult,
} from '@dangerous-inclinations/engine'
import type { ReactNode } from 'react'
import { TileIcon } from '../../art/glyphs'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Body, Display, Numeral } from '../poster'
import {
  BASE_CRIT,
  D10,
  INTERCEPT_ON,
  MISS_TOP,
  SENSOR_CRIT,
  SENSOR_CRIT_BONUS,
  energyLabel,
  tileName,
  weaponStats,
} from '../numbers'
import { GuideSection, Points, SubHead } from './parts'
import { MissileFlight } from './missileDiagram'

function RollStrip() {
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px' }}>
        {D10.map(face => {
          const bare = rollToResult(face, BASE_CRITICAL_CHANCE)
          const sensed = rollToResult(face, BASE_CRITICAL_CHANCE + SENSOR_CRIT_BONUS)
          const bg = bare === 'critical' ? PRESS.red : bare === 'hit' ? PRESS.ink : 'transparent'
          const fg = bare === 'miss' ? PRESS.ink : PRESS.paper
          return (
            <Box
              key={face}
              sx={{
                aspectRatio: '1',
                position: 'relative',
                bgcolor: bg,
                border: `3px solid ${bare === 'critical' ? PRESS.red : PRESS.ink}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              <Numeral size={{ xs: '1.5rem', sm: '2.6rem' }} color={fg}>
                {face}
              </Numeral>
              {bare !== 'critical' && sensed === 'critical' && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: '22%',
                    bgcolor: PRESS.red,
                  }}
                />
              )}
            </Box>
          )
        })}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: `${MISS_TOP}fr ${SENSOR_CRIT - MISS_TOP - 1}fr ${BASE_CRIT - SENSOR_CRIT}fr ${11 - BASE_CRIT}fr`,
          },
          gap: '4px',
          mt: 1,
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '0.9rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: 1.2,
        }}
      >
        <Box>{MISS_TOP} misses</Box>
        <Box>
          {MISS_TOP + 1}&ndash;{BASE_CRIT - 1} hit
        </Box>
        <Box sx={{ color: PRESS.redText }}>
          {SENSOR_CRIT}&ndash;{BASE_CRIT - 1}: crit with a powered sensor
        </Box>
        <Box sx={{ color: PRESS.redText }}>{BASE_CRIT} critical</Box>
      </Box>
    </Box>
  )
}

const WEAPONS: Array<{ type: SubsystemType; reach: ReactNode }> = [
  {
    type: 'railgun',
    reach: (
      <>
        Same ring, 1&ndash;{weaponStats('railgun').sectorRange} sectors ahead. The recoil pushes you
        a ring, unless you spend 1 fuel to hold.
      </>
    ),
  },
  {
    type: 'laser',
    reach: (
      <>
        &plusmn;{weaponStats('laser').ringRange} rings, &plusmn;{weaponStats('laser').sectorRange}{' '}
        sector, off one side. <b>Ignores shields.</b>
      </>
    ),
  },
  {
    type: 'ballistic_rack',
    reach: (
      <>
        &plusmn;{weaponStats('ballistic_rack').ringRange} ring, &plusmn;
        {weaponStats('ballistic_rack').sectorRange} sector, either side. With energy on it, shoots
        down {interceptsPerRack()} missiles a turn on {INTERCEPT_ON}+.
      </>
    ),
  },
  {
    type: 'missiles',
    reach: (
      <>
        Any ship in your well. Launch any number at one ship: {weaponStats('missiles').maxAmmo}{' '}
        aboard, {weaponStats('missiles').fuelPerTurn} steps a turn for{' '}
        {weaponStats('missiles').maxMoves} turns.
      </>
    ),
  },
]

function slotOf(type: SubsystemType): string {
  const slot = SUBSYSTEM_CONFIGS[type].slotType
  return slot === 'either' ? 'forward or side' : slot
}

function Weapon({ type, reach }: { type: SubsystemType; reach: ReactNode }) {
  return (
    <Box sx={{ border: `4px solid ${PRESS.ink}`, display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          bgcolor: PRESS.ink,
          color: PRESS.paper,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 1.5,
          py: 1.25,
        }}
      >
        <TileIcon type={type} size={30} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Display size="1.5rem" color={PRESS.paper} component="h3">
            {tileName(type)}
          </Display>
          <Box
            sx={{
              fontFamily: FONT_DISPLAY,
              fontSize: '0.8rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: PRESS.paperSoft,
              mt: 0.5,
            }}
          >
            {slotOf(type)} · {energyLabel(type)} energy
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Numeral size="2.6rem" color={PRESS.red}>
            {weaponStats(type).damage}
          </Numeral>
          <Box
            sx={{
              fontFamily: FONT_DISPLAY,
              fontSize: '0.72rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: PRESS.paperSoft,
            }}
          >
            damage
          </Box>
        </Box>
      </Box>
      <Body size="0.94rem" sx={{ p: 1.75 }}>
        {reach}
      </Body>
    </Box>
  )
}

export function FightSection() {
  return (
    <GuideSection
      id="fight"
      n={6}
      kicker="Combat"
      title="Roll one d10"
      lede="Each weapon fires once a turn. Name a slot on the target, then roll."
    >
      <Box sx={{ mb: 5 }}>
        <RollStrip />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
          mb: 5,
        }}
      >
        {WEAPONS.map(weapon => (
          <Weapon key={weapon.type} {...weapon} />
        ))}
      </Box>

      <Box sx={{ mb: 5 }}>
        <SubHead>Missiles in flight</SubHead>
        <MissileFlight />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: { xs: 3, md: 6 },
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        }}
      >
        <Points
          items={[
            <>
              <b>Shields absorb first</b>: {SHIELD_ENERGY_PER_POINT} energy stop 1 damage. Lasers
              ignore them.
            </>,
            <>The rest is hull. At 0 the ship is destroyed (see 08).</>,
          ]}
        />
        <Points
          items={[
            <>
              <b>A critical breaks the slot you named</b>, shields or not, and its energy goes onto
              its owner&rsquo;s heat.
            </>,
            <>In your own sector every weapon reaches. Nothing fires across wells.</>,
          ]}
        />
      </Box>
    </GuideSection>
  )
}
