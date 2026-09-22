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
  SCAN_SECTOR_RANGE,
  SECTORS_PER_RING,
  MAX_HEAT,
  SHIELD_ENERGY_PER_POINT,
  SHIELD_HEAT_PER_POINT,
  STARTING_HIT_POINTS,
  SUBSYSTEM_CONFIGS,
  interceptsPerRack,
  TANKER_FUEL,
  WELL_TRANSFER_COSTS,
} from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { useGame } from '../../context/GameContext'
// The turn is stated once. The cheatsheet and the printed card read the same
// list, so none of them can disagree about what order a turn runs in.
import { QUIET_TURN, TURN_STEPS } from '../../site/turn'

/** What one radiator dissipates, read from the tile so this card cannot drift. */
const RADIATOR_DISSIPATION = SUBSYSTEM_CONFIGS.radiator.passiveEffect?.dissipationBonus ?? 0
/** A half shield, a rack and a sensor all take this much; a full shield twice it. */
const HALF_SHIELD = SUBSYSTEM_CONFIGS.shields.minEnergy
const FULL_SHIELD = SUBSYSTEM_CONFIGS.shields.maxEnergy
const RACK_ENERGY = SUBSYSTEM_CONFIGS.ballistic_rack.minEnergy
const SENSOR_ENERGY = SUBSYSTEM_CONFIGS.sensor_array.minEnergy

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
    [
      'Energy',
      'every action puts energy on the tile it uses; it stays there until your next turn, when you clear your loadout',
    ],
    [
      'Power',
      `an action too: shields (${HALF_SHIELD} or ${FULL_SHIELD}), a ballistic rack (${RACK_ENERGY}) or a sensor array (${SENSOR_ENERGY}) work until your next turn. Each tile does one thing a turn: power it or use it`,
    ],
    ['Heat', 'every point of energy on your loadout is 1 heat at your check'],
    ['Heat track', `${MAX_HEAT} · above it is hull damage; heat does not reset`],
    [
      'Dissipation',
      `dissipate ${DEFAULT_DISSIPATION_CAPACITY} (+${RADIATOR_DISSIPATION} per radiator) at every check`,
    ],
    [
      'Shields',
      `power at ${HALF_SHIELD} or ${FULL_SHIELD}; ${SHIELD_ENERGY_PER_POINT} energy a point absorbed, ${SHIELD_HEAT_PER_POINT} heat a point; power them every turn you want them up; lasers ignore them`,
    ],
    [
      'Ballistic rack',
      `with energy on it (powered, or it fired) it rolls at ${interceptsPerRack()} missiles a turn, the same number its energy could have thrown`,
    ],
    [
      'Critical',
      "names any slot; breaks it through shields, and dumps its energy as heat (a tile holds its energy until its owner's next turn)",
    ],
    ['Repair', 'a station, on arrival, fixes everything; or one tile a turn at 0 heat'],
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
      `one action launches any number of a tile's missiles at one ship, all naming the same slot, for the tile's ${SUBSYSTEM_CONFIGS.missiles.minEnergy} energy once; a rack with energy on it rolls at ${interceptsPerRack()} of them a turn, so it takes a second rack to answer a second launcher`,
    ],
    [
      'Scan',
      `same ring, within ${SCAN_SECTOR_RANGE} sectors, sensor aboard and unbroken; the scan puts ${SENSOR_ENERGY} energy on it, so every shot after it has the wider range`,
    ],
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {TURN_STEPS.map((step, index) => (
            <Box key={step.title} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
              <Typography
                sx={{ fontFamily: FONT_MONO, fontSize: '0.75rem', color: TABLE.inkFaint, width: 12 }}
              >
                {index + 1}
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', color: TABLE.inkSoft, lineHeight: 1.35 }}>
                <Box component="strong" sx={{ color: TABLE.ink }}>
                  {step.title}.
                </Box>{' '}
                {step.blurb}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: '0.82rem', color: TABLE.inkSoft, lineHeight: 1.35, mt: 0.75 }}>
          {QUIET_TURN}
        </Typography>

        <Heading>Ring velocity</Heading>
        <Table
          rows={[
            ['Black Hole', BLACKHOLE_RINGS.map(r => r.velocity).join(' · ')],
            ['Planets', PLANET_RINGS.map(r => r.velocity).join(' · ')],
          ]}
        />

        <Heading>Hidden information</Heading>
        <Typography sx={{ fontSize: '0.82rem', color: TABLE.inkSoft, lineHeight: 1.4 }}>
          Public: positions, facing, hull, heat, fuel, the energy on every slot, Home markers, cargo
          counts, face-up tiles and the missiles left in a face-up missiles tile, completed missions.
          <br />
          Private: what a face-down tile is, the ammo in a face-down missiles tile, missions in hand, where your cargo
          is going.
          <br />
          <Box component="span" sx={{ color: TABLE.accent }}>
            Energy is the tell.
          </Box>{' '}
          Using a tile turns it face-up, so energy on a face-down slot between turns means it was
          powered, not used: {HALF_SHIELD} is a half shield, a ballistic rack or a sensor array, and{' '}
          {FULL_SHIELD} can only be a full shield. That is a deduction, not a reveal: the tile stays
          face-down and only a scan makes sure. A gun is dark until it fires, which is why a silent
          slot is the dangerous one.
        </Typography>

        <Heading>Reveals</Heading>
        <Typography sx={{ fontSize: '0.82rem', color: TABLE.inkSoft, lineHeight: 1.4 }}>
          A tile flips face-up the first time it does something: a weapon fires (or a ballistic rack
          rolls at a missile), and a missiles tile then shows what is left; shields absorb damage; a
          sensor array scans; a radiator when your heat goes above {DEFAULT_DISSIPATION_CAPACITY} at
          a heat check; a compressor when a jump costs {COMPRESSED_JUMP_MASS} fuel instead of{' '}
          {WELL_TRANSFER_COSTS.mass}; any tile when a critical breaks it. Powering a tile does not
          turn it over: a wall you never needed, a rack nothing came at and a sensor you never
          scanned with are still secrets at the end of the game.
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
