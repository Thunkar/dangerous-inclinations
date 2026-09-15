/**
 * The rules card: the Quick Reference and the turn cheat sheet from RULES.md,
 * plus the tables you look up mid-turn. Numbers are read from the engine so
 * the card can never drift from the rules.
 *
 * It is a card you pick up, not a wall of the table: a button in the top bar
 * opens it over the board and it goes away again, so the rules never cost the
 * table any width.
 */
import { useState } from 'react'
import { Box, Chip, Dialog, DialogContent, IconButton, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import {
  BLACKHOLE_RINGS,
  BURN_COSTS,
  DEFAULT_DISSIPATION_CAPACITY,
  DOCK_HULL_REPAIR,
  MAX_REACTION_MASS,
  MAX_SECTOR_ADJUSTMENT,
  MISSIONS_TO_WIN,
  PLANET_RINGS,
  REACTOR_CAPACITY,
  SCAN_SECTOR_RANGE,
  SECTORS_PER_RING,
  STARTING_HIT_POINTS,
  WELL_TRANSFER_COSTS,
} from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'

const TURN_STEPS = [
  'Destroyed? Respawn at Home, turn over.',
  'Energy: move cubes.',
  'Actions in your order: rotate · move (coast / burn / jump) · fire · scan.',
  'Your missiles move.',
  'Docked? Load, deliver, repair, +hull, reload.',
  'Heat check: excess heat → hull damage; reset heat.',
  'Flip completed missions. Pass. (Last player: stations drift.)',
]

/** The button that lives in the top bar, and the card it opens. */
export function RulesButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip title="Quick reference">
        <Chip
          size="small"
          icon={<MenuBookIcon sx={{ fontSize: 15 }} />}
          label="rules"
          onClick={() => setOpen(true)}
          sx={{
            bgcolor: 'transparent',
            border: `1px solid ${TABLE.plateEdge}`,
            color: TABLE.inkSoft,
          }}
        />
      </Tooltip>
      <RulesCard open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function RulesCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const quick: Array<[string, string]> = [
    ['Reactor', `${REACTOR_CAPACITY} energy`],
    ['Dissipation', `${DEFAULT_DISSIPATION_CAPACITY} (+2 per radiator)`],
    ['Hull', `${STARTING_HIT_POINTS}`],
    ['Fuel', `${MAX_REACTION_MASS} (+6 with compressor)`],
    ['Sectors per ring', `${SECTORS_PER_RING}`],
    [
      'Burn',
      `soft ${BURN_COSTS.soft.rings} / medium ${BURN_COSTS.medium.rings} / hard ${BURN_COSTS.hard.rings} rings — same in fuel and engine energy`,
    ],
    ['Phasing', `−(velocity−1) to +${MAX_SECTOR_ADJUSTMENT} sectors, 1 fuel each`],
    [
      'Jump',
      `engines ${WELL_TRANSFER_COSTS.energy}, ${WELL_TRANSFER_COSTS.mass} fuel (free with compressor), no drift`,
    ],
    ['Hit roll', '1 miss, 2–9 hit, 10 crit (8–10 with sensors)'],
    ['Scan', `same ring, within ${SCAN_SECTOR_RANGE} sectors, sensor powered`],
    ['Docking', `+${DOCK_HULL_REPAIR} hull, repair all, reload missiles, load/deliver cargo`],
    [
      'Survey',
      'two consecutive turns on Black Hole Ring 1 with sensors powered, then dock at the named planet',
    ],
    ['Missions', 'Destroy · Deliver · Intercept · Survey'],
    [
      'Win',
      `${MISSIONS_TO_WIN} points trigger the final round; when it ends, highest score wins (hull, then fuel, break ties). Destroy is worth 2, every other card 1`,
    ],
  ]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: `1px solid ${TABLE.line}`,
        }}
      >
        <Typography variant="overline" sx={{ color: TABLE.inkSoft }}>
          Quick reference
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: TABLE.inkSoft }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 2, py: 1.5 }}>
        <Table rows={quick} />

        <Heading>Turn cheat sheet</Heading>
        <Box component="ol" sx={{ m: 0, pl: 2.25 }}>
          {TURN_STEPS.map(step => (
            <Box component="li" key={step} sx={{ mb: 0.4 }}>
              <Typography sx={{ fontSize: '0.82rem', color: TABLE.inkSoft, lineHeight: 1.35 }}>
                {step}
              </Typography>
            </Box>
          ))}
        </Box>

        <Heading>Ring velocity</Heading>
        <Table
          rows={[
            ['Black Hole', BLACKHOLE_RINGS.map(r => r.velocity).join(' · ')],
            ['Planets', PLANET_RINGS.map(r => r.velocity).join(' · ')],
          ]}
        />

        <Heading>Hidden information</Heading>
        <Typography sx={{ fontSize: '0.82rem', color: TABLE.inkSoft, lineHeight: 1.4 }}>
          Public: positions, facing, hull, heat, the cubes on every slot, Home markers, cargo
          counts, face-up tiles, completed missions.
          <br />
          Private: what a face-down tile is, fuel, missile ammo, missions in hand, where your cargo
          is going.
          <br />
          <Box component="span" sx={{ color: TABLE.accent }}>
            Energy is the tell.
          </Box>{' '}
          Four cubes on a face-down forward slot can only be a railgun.
        </Typography>

        <Heading>Reveals</Heading>
        <Typography sx={{ fontSize: '0.82rem', color: TABLE.inkSoft, lineHeight: 1.4 }}>
          A tile flips face-up the first time it does something: a weapon fires, shields absorb,
          sensors scan, a radiator saves you hull, a compressor refunds a jump — or a critical
          breaks it.
        </Typography>
      </DialogContent>
    </Dialog>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      sx={{ color: TABLE.accent, display: 'block', mt: 1.5, lineHeight: 2 }}
    >
      {children}
    </Typography>
  )
}

function Table({ rows }: { rows: Array<[string, string]> }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1, rowGap: 0.35 }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: 'contents' }}>
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.78rem',
              color: TABLE.inkFaint,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: TABLE.ink }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  )
}
