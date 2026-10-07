/**
 * The rules card: the Quick Reference and the turn cheat sheet from RULES.md,
 * plus the tables you look up mid-turn. Numbers are read from the engine so
 * the card can never drift from the rules; the words are in
 * `text/rulesDialog.ts`.
 *
 * It is a card you pick up, not a wall of the table: a button in the top bar
 * opens it over the board and it goes away again, so the rules never cost the
 * table any width.
 */
import { useState } from 'react'
import { Box, Button, Dialog, DialogContent, IconButton, Tooltip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import {
  BLACKHOLE_RINGS,
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  DEFAULT_DISSIPATION_CAPACITY,
  DEPLOYMENT_GAP,
  HOME_RINGS,
  orList,
  MAX_REACTION_MASS,
  MAX_SECTOR_ADJUSTMENT,
  PLANET_RINGS,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SCAN_SECTOR_RANGE,
  SECONDARIES_PER_PLAYER,
  SECONDARY_OFFERS_PER_PLAYER,
  SECTORS_PER_RING,
  INTERCEPT_HEAT,
  MAX_HEAT,
  MISSION_POINTS,
  SHIELD_POINTS_PER_ENERGY,
  STARTING_HIT_POINTS,
  SUBSYSTEM_CONFIGS,
  interceptsPerRack,
  TANKER_FUEL,
  WELL_TRANSFER_COSTS,
  fill,
} from '@dangerous-inclinations/engine'
import { TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'
import { useGame } from '../../context/GameContext'
// The turn is stated once. The cheatsheet and the printed card read the same
// list, so none of them can disagree about what order a turn runs in.
import { QUIET_TURN, TURN_STEPS } from '../../site/turn'
import {
  BASE_CRIT,
  FULL_SHIELD,
  HALF_SHIELD,
  MISS_TOP,
  PLASMA_SHIELD_POINTS,
  RACK_ENERGY,
  RADIATOR_DISSIPATION,
  SENSOR_CRIT,
  SENSOR_ENERGY,
} from '../../site/numbers'
import { RULES_DIALOG as T } from '../../text/rulesDialog'
import { rich } from '../../utils/rich'

/** What a kept hand is worth: the primary and both secondaries. */
const HAND_POINTS =
  MISSION_POINTS.destroy_ship * PRIMARIES_PER_PLAYER +
  MISSION_POINTS.survey * SECONDARIES_PER_PLAYER

/** Every number the quick reference names, read off the engine. */
const NUMBERS = {
  halfShield: HALF_SHIELD,
  fullShield: FULL_SHIELD,
  rackEnergy: RACK_ENERGY,
  sensorEnergy: SENSOR_ENERGY,
  maxHeat: MAX_HEAT,
  dissipation: DEFAULT_DISSIPATION_CAPACITY,
  radiator: RADIATOR_DISSIPATION,
  shieldPoints: SHIELD_POINTS_PER_ENERGY,
  plasmaPoints: PLASMA_SHIELD_POINTS,
  intercepts: interceptsPerRack(),
  interceptHeat: INTERCEPT_HEAT,
  hull: STARTING_HIT_POINTS,
  fuel: MAX_REACTION_MASS,
  sectors: SECTORS_PER_RING,
  soft: BURN_COSTS.soft.rings,
  medium: BURN_COSTS.medium.rings,
  hard: BURN_COSTS.hard.rings,
  mostPhase: MAX_SECTOR_ADJUSTMENT,
  jumpEnergy: WELL_TRANSFER_COSTS.energy,
  jumpFuel: WELL_TRANSFER_COSTS.mass,
  compressedFuel: COMPRESSED_JUMP_MASS,
  // The hit roll, read off the engine's roll table.
  miss: MISS_TOP,
  hitFrom: MISS_TOP + 1,
  hitTo: BASE_CRIT - 1,
  crit: BASE_CRIT,
  sensorCrit: SENSOR_CRIT,
  salvoEnergy: SUBSYSTEM_CONFIGS.missiles.minEnergy,
  scanRange: SCAN_SECTOR_RANGE,
  tankerFuel: TANKER_FUEL,
  homeRings: orList(HOME_RINGS),
  deploymentGap: DEPLOYMENT_GAP,
  primaryOffers: PRIMARY_OFFERS_PER_PLAYER,
  primaries: PRIMARIES_PER_PLAYER,
  secondaryOffers: SECONDARY_OFFERS_PER_PLAYER,
  secondaries: SECONDARIES_PER_PLAYER,
  handPoints: HAND_POINTS,
}

/** The button that lives in the top bar, and the card it opens. */
export function RulesButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip title={T.tooltip}>
        <Button
          size="small"
          startIcon={<MenuBookIcon sx={{ fontSize: 15 }} />}
          onClick={() => setOpen(true)}
          sx={{
            color: TABLE.ink,
            minWidth: 0,
            px: 1,
            flexShrink: 0,
            '&:hover': { color: TABLE.accent, bgcolor: 'transparent' },
          }}
        >
          {T.button}
        </Button>
      </Tooltip>
      <RulesCard open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function RulesCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The number this game is played to, read off the view.
  const { view } = useGame()
  const quick: Array<[string, string]> = T.quick.map(([label, rule]) => [
    label,
    fill(rule, { ...NUMBERS, pointsToWin: view.pointsToWin }),
  ])

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
        <Typography
          variant="overline"
          sx={{ color: TABLE.ink, fontSize: '0.95rem', fontWeight: 700 }}
        >
          {T.title}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: TABLE.inkSoft }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 2, py: 1.5 }}>
        <Table rows={quick} />

        <Heading>{T.turn.title}</Heading>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {TURN_STEPS.map((step, index) => (
            <Box key={step.title} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
              <Typography
                sx={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: TABLE.accent,
                  width: 14,
                  flexShrink: 0,
                }}
              >
                {index + 1}
              </Typography>
              <Typography sx={{ fontSize: '0.875rem', color: TABLE.inkSoft, lineHeight: 1.35 }}>
                <Box component="strong" sx={{ color: TABLE.ink }}>
                  {rich(T.turn.step, { title: step.title })}
                </Box>{' '}
                {step.blurb}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: '0.875rem', color: TABLE.inkSoft, lineHeight: 1.35, mt: 0.75 }}>
          {QUIET_TURN}
        </Typography>

        <Heading>{T.rings.title}</Heading>
        <Table
          rows={[
            [T.rings.blackHole, BLACKHOLE_RINGS.map(r => r.velocity).join(' · ')],
            [T.rings.planets, PLANET_RINGS.map(r => r.velocity).join(' · ')],
          ]}
        />
        <Typography sx={{ fontSize: '0.875rem', color: TABLE.inkSoft, lineHeight: 1.4, mt: 0.75 }}>
          {rich(
            T.rings.windows,
            {},
            {
              link: text => (
                <Box
                  component="a"
                  href="/card#windows"
                  target="_blank"
                  rel="noopener"
                  sx={{ color: TABLE.accent, '&:hover': { color: TABLE.ink } }}
                >
                  {text}
                </Box>
              ),
            }
          )}
        </Typography>

        <Heading>{T.hidden.title}</Heading>
        <Typography sx={{ fontSize: '0.875rem', color: TABLE.inkSoft, lineHeight: 1.4 }}>
          {T.hidden.public}
          <br />
          {T.hidden.private}
          <br />
          {rich(
            T.hidden.tell,
            { halfShield: HALF_SHIELD, fullShield: FULL_SHIELD },
            {
              red: text => (
                <Box component="span" sx={{ color: TABLE.accent }}>
                  {text}
                </Box>
              ),
            }
          )}
        </Typography>

        <Heading>{T.reveals.title}</Heading>
        <Typography sx={{ fontSize: '0.875rem', color: TABLE.inkSoft, lineHeight: 1.4 }}>
          {rich(T.reveals.text, {
            dissipation: DEFAULT_DISSIPATION_CAPACITY,
            compressedFuel: COMPRESSED_JUMP_MASS,
            jumpFuel: WELL_TRANSFER_COSTS.mass,
          })}
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
              fontFamily: FONT_DISPLAY,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontSize: '0.8rem',
              color: TABLE.inkSoft,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: TABLE.ink }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  )
}
