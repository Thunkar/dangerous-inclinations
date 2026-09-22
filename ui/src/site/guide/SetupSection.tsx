/**
 * 02 · Setting up: the ship, built for the missions you keep.
 *
 * The loadout is drawn as the slots a player fills, with the subsystems each
 * slot takes read off their own slot types, so a subsystem that changes slot
 * moves here too.
 */
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { FORWARD_SLOT_COUNT, SIDE_SLOT_COUNT } from '@dangerous-inclinations/engine'
import { TileIcon } from '../../art/glyphs'
import { FONT_SANS } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { FIXED_TILES, FORWARD_TILES, SIDE_TILES, tileName } from '../numbers'
import { GuideSection } from './parts'

/** A face-down tile: black, with only its slot printed on the back. */
function FaceDown({ label, size }: { label: string; size: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        bgcolor: PRESS.ink,
        color: PRESS.paper,
        display: 'flex',
        alignItems: 'flex-end',
        p: 0.75,
        fontFamily: FONT_DISPLAY,
        fontWeight: 600,
        fontSize: '0.78rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        flexShrink: 0,
      }}
    >
      {label}
    </Box>
  )
}

/** A tile printed on every ship: face-up, paper, with its mark. */
function Printed({ type }: { type: SubsystemType }) {
  return (
    <Box
      sx={{
        width: 56,
        height: 56,
        border: `3px solid ${PRESS.ink}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <TileIcon type={type} size={30} />
    </Box>
  )
}

function Options({ types }: { types: readonly SubsystemType[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', mt: 1.25 }}>
      {types.map(type => (
        <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
          <TileIcon type={type} size={18} />
          <Box component="span" sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem' }}>
            {tileName(type)}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          fontSize: '0.95rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          mb: 1,
        }}
      >
        {title}
      </Box>
      {children}
    </Box>
  )
}

function Loadout() {
  return (
    <Box
      sx={{
        border: `4px solid ${PRESS.ink}`,
        p: { xs: 2, sm: 3 },
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: '1.1fr 1.6fr 1fr' },
      }}
    >
      <Group title={`Forward · ${FORWARD_SLOT_COUNT}`}>
        <FaceDown label="Fwd" size={72} />
        <Options types={FORWARD_TILES} />
      </Group>
      <Group title={`Side · ${SIDE_SLOT_COUNT}`}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {Array.from({ length: SIDE_SLOT_COUNT }, (_, i) => (
            <FaceDown key={i} label={`S${i + 1}`} size={56} />
          ))}
        </Box>
        <Options types={SIDE_TILES} />
      </Group>
      <Group title="Mandatory on every ship">
        <Box sx={{ display: 'flex', gap: 1 }}>
          {FIXED_TILES.map(type => (
            <Printed key={type} type={type} />
          ))}
        </Box>
        <Options types={FIXED_TILES} />
      </Group>
    </Box>
  )
}

export function SetupSection() {
  return (
    <GuideSection
      id="setup"
      n={2}
      kicker="Before the first turn"
      title="Build the ship"
      lede="Make it yours, keep your eye on the missions"
      tone="deep"
    >
      <Loadout />
    </GuideSection>
  )
}
