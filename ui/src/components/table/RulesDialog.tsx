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
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  DEPLOYMENT_GAP,
  HOME_RINGS,
  MAX_REACTION_MASS,
  MAX_SECTOR_ADJUSTMENT,
  PLANET_RINGS,
  REACTOR_CAPACITY,
  SCAN_SECTOR_RANGE,
  SECTORS_PER_RING,
  MAX_HEAT,
  SHIELD_ENERGY_PER_POINT,
  SHIELD_HEAT_PER_POINT,
  STARTING_HIT_POINTS,
  SUBSYSTEM_CONFIGS,
  TANKER_FUEL,
  WELL_TRANSFER_COSTS,
} from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { useGame } from '../../context/GameContext'

/** What one radiator sheds, read from the tile so this card cannot drift. */
const RADIATOR_DISSIPATION = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0

const TURN_STEPS = [
  'Destroyed? Respawn at Home, turn over. Next turn is a first round of your own: untouchable until it ends, no firing, no scanning.',
  'Energy: move cubes.',
  'Actions in your order: rotate · move (coast / burn / jump) · fire · scan.',
  'Your missiles move.',
  'Just arrived at a station? Load, deliver, repair, +hull, reload. Moored until you burn away.',
  'Heat check: add your powered shields\' cubes; over the top of the track is hull damage; shed your dissipation and carry the rest.',
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
  // The number this game is played to, read off the view.
  const { view } = useGame()
  const quick: Array<[string, string]> = [
    ['Reactor', `${REACTOR_CAPACITY} energy`],
    ['Heat track', `${MAX_HEAT} · above it is hull damage; heat does not reset`],
    [
      'Dissipation',
      `${DEFAULT_DISSIPATION_CAPACITY} (+${RADIATOR_DISSIPATION} per radiator), shed at every check`,
    ],
    [
      'Shields',
      `${SHIELD_ENERGY_PER_POINT} cubes a point absorbed, ${SHIELD_HEAT_PER_POINT} heat a point, and its cubes as heat every turn it is powered`,
    ],
    ['Hull', `${STARTING_HIT_POINTS}`],
    ['Fuel', `${MAX_REACTION_MASS}`],
    ['Sectors per ring', `${SECTORS_PER_RING}`],
    [
      'Burn',
      `soft ${BURN_COSTS.soft.rings} / medium ${BURN_COSTS.medium.rings} / hard ${BURN_COSTS.hard.rings} rings · same in fuel and engine energy`,
    ],
    ['Phasing', `−(velocity−1) to +${MAX_SECTOR_ADJUSTMENT} sectors, 1 fuel each`],
    [
      'Jump',
      `engines ${WELL_TRANSFER_COSTS.energy}, ${WELL_TRANSFER_COSTS.mass} fuel (${COMPRESSED_JUMP_MASS} with a compressor), no drift`,
    ],
    ['Hit roll', '1 miss, 2–9 hit, 10 crit (8–10 with sensors)'],
    [
      'Salvo',
      `one action launches any number of a tile's missiles at one ship, all naming the same slot, for the tile's ${SUBSYSTEM_CONFIGS.missiles.minEnergy} heat, and a powered ballistic rack rolls at every missile that reaches it in a turn for its ${SUBSYSTEM_CONFIGS.ballistic_rack.minEnergy} heat`,
    ],
    ['Scan', `same ring, within ${SCAN_SECTOR_RANGE} sectors, sensor powered`],
    [
      'Docking',
      'on arrival only: full hull, repair all, reload missiles, load/deliver cargo; you stay moored until you burn away',
    ],
    ['Survey', 'end a turn on Black Hole Ring 1 (take the chit) then dock at any station'],
    [
      'Piracy',
      'end a turn in the same sector as an undocked ship carrying a crate or a data chit: it is yours. The loot fills your hold and sells at any station, and their card goes back to undone',
    ],
    [
      'Tanker',
      `arrive at a station with ${TANKER_FUEL} or more fuel and pump it in: the card is done`,
    ],
    [
      'Deployment',
      `Black Hole Ring ${HOME_RINGS.join(' or ')}, at least ${DEPLOYMENT_GAP} sectors from every ship already placed (if no sector qualifies, the farthest one); that position is your Home`,
    ],
    [
      'Missions',
      'Primaries (2 pts): Destroy · Deliver · Intercept. Secondaries (1 pt): Survey · Piracy · Tanker',
    ],
    [
      'Win',
      `${view.pointsToWin} points trigger the final round; when it ends, highest score wins (hull, then fuel, break ties). Your primary and either secondary is a win; two secondaries are not`,
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
          Public: positions, facing, hull, heat, fuel, the cubes on every slot, Home markers, cargo
          counts, face-up tiles, completed missions.
          <br />
          Private: what a face-down tile is, the ammo in a face-down missiles tile, missions in hand, where your cargo
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
          sensors scan, a radiator saves you hull, a compressor cheapens a jump, or a critical
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
