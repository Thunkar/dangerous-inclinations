/**
 * 06 · Fighting: one d10, six guns, and what a hit does.
 *
 * The roll strip asks `rollToResult` about every face (`faceResult`), bare and with a sensor
 * up, so the shading is the engine's and not a table typed out here.
 */
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  SHIELD_POINTS_PER_ENERGY,
  SUBSYSTEM_CONFIGS,
  interceptsPerRack,
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
  PLASMA_SHIELD_POINTS,
  SENSOR_CRIT,
  energyLabel,
  faceResult,
  tileName,
  weaponStats,
} from '../numbers'
import { GuideSection, Points, SubHead } from './parts'
import { MissileFlight } from './missileDiagram'
import { CHEATSHEET } from '../../text/cheatsheet'
import { rich } from '../../utils/rich'

const T = CHEATSHEET.fight

function RollStrip() {
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '4px' }}>
        {D10.map(face => {
          const bare = faceResult(face)
          const sensed = faceResult(face, true)
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
        <Box>{rich(T.roll.miss, { top: MISS_TOP })}</Box>
        <Box>{rich(T.roll.hit, { from: MISS_TOP + 1, to: BASE_CRIT - 1 })}</Box>
        <Box sx={{ color: PRESS.redText }}>
          {rich(T.roll.sensor, { from: SENSOR_CRIT, to: BASE_CRIT - 1 })}
        </Box>
        <Box sx={{ color: PRESS.redText }}>{rich(T.roll.critical, { face: BASE_CRIT })}</Box>
      </Box>
    </Box>
  )
}

const WEAPONS: Array<{ type: SubsystemType; reach: ReactNode }> = [
  {
    type: 'railgun',
    reach: rich(T.reach.railgun, { sectors: weaponStats('railgun').sectorRange! }),
  },
  {
    type: 'laser',
    reach: rich(T.reach.laser, {
      rings: weaponStats('laser').ringRange!,
      sectors: weaponStats('laser').sectorRange!,
    }),
  },
  {
    type: 'ballistic_rack',
    reach: rich(T.reach.ballistic_rack, {
      rings: weaponStats('ballistic_rack').ringRange!,
      sectors: weaponStats('ballistic_rack').sectorRange!,
      intercepts: interceptsPerRack(),
      on: INTERCEPT_ON,
    }),
  },
  {
    type: 'missiles',
    reach: rich(T.reach.missiles, {
      aboard: weaponStats('missiles').maxAmmo!,
      steps: weaponStats('missiles').stepsPerMove!,
      turns: weaponStats('missiles').maxMoves!,
    }),
  },
  {
    type: 'plasma_cannon',
    reach: rich(T.reach.plasma_cannon, {
      rings: weaponStats('plasma_cannon').ringRange!,
      sectors: weaponStats('plasma_cannon').sectorRange!,
      points: PLASMA_SHIELD_POINTS,
    }),
  },
  {
    type: 'disruptor',
    reach: rich(T.reach.disruptor, {
      rings: weaponStats('disruptor').ringRange!,
      sectors: weaponStats('disruptor').sectorRange!,
      from: MISS_TOP + 1,
      to: D10[D10.length - 1],
    }),
  },
]

function slotOf(type: SubsystemType): string {
  const slot = SUBSYSTEM_CONFIGS[type].slotType
  return slot === 'either' ? T.eitherSlot : slot
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
            {rich(T.slotLine, { slot: slotOf(type), energy: energyLabel(type) })}
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
            {T.damage}
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
    <GuideSection id="fight" n={6} kicker={T.kicker} title={T.title} lede={T.lede}>
      <Box sx={{ mb: 5 }}>
        <RollStrip />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          mb: 5,
        }}
      >
        {WEAPONS.map(weapon => (
          <Weapon key={weapon.type} {...weapon} />
        ))}
      </Box>

      <Box sx={{ mb: 5 }}>
        <SubHead>{T.missilesTitle}</SubHead>
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
          items={T.hits.map(item =>
            rich(item, {
              shieldPoints: SHIELD_POINTS_PER_ENERGY,
              plasmaPoints: PLASMA_SHIELD_POINTS,
            })
          )}
        />
        <Points items={T.rules.map(item => rich(item))} />
      </Box>
    </GuideSection>
  )
}
