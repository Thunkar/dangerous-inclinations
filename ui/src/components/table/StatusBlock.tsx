/**
 * Your ship: hull, heat, fuel, the hold, and missile ammo, which is private
 * and so lives here rather than under a tile.
 *
 * Each track shows where you are (solid) and where this turn leaves you
 * (ghost). Heat carries between turns, so its divider marks the dissipation:
 * left of it goes, right of it stays. Without a plan (a replay, someone else's
 * turn) the ghosts disappear, and the heat track hatches the worst a rival can
 * still make of it: the heat your shields would take on absorbing before your
 * next turn.
 */
import { Box, Tooltip, Typography } from '@mui/material'
import {
  MAX_HEAT,
  SHIELD_ENERGY_PER_POINT,
  SHIELD_HEAT_PER_POINT,
  getMissileStats,
  getWellName,
  heatAfterCheck,
} from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { CargoTokens, PipTrack } from '../common/Tokens'
import { useGame } from '../../context/GameContext'
import { usePlanOptional } from '../../context/PlanContext'
import { slotLabel, slotShortLabel } from '../../utils/slots'

/**
 * One round in a launcher: filled while it is aboard, an empty outline once it
 * has been fired. Drawn rather than counted because four of them read at a
 * glance and a number does not.
 */
function MissilePip({ spent, broken }: { spent: boolean; broken: boolean }) {
  const color = broken ? TABLE.inkFaint : spent ? 'rgba(126,165,205,0.30)' : TABLE.ink
  return (
    <Box
      component="svg"
      viewBox="0 0 6 14"
      aria-hidden
      sx={{ width: 6, height: 14, display: 'block', flexShrink: 0 }}
    >
      <path
        d="M3 0.5 L4.9 4.5 V9.5 L5.8 13.2 H0.2 L1.1 9.5 V4.5 Z"
        fill={spent ? 'none' : color}
        stroke={color}
        strokeWidth={spent ? 0.9 : 0.5}
        strokeLinejoin="round"
      />
    </Box>
  )
}

export function StatusBlock({ accent }: { accent?: string }) {
  const { view } = useGame()
  const plan = usePlanOptional()
  const me = plan?.me ?? view.me
  if (!me) return null

  const stats = view.myStats
  const dissipation = stats?.dissipationCapacity ?? 5
  const maxFuel = stats?.maxReactionMass ?? 10

  const heatNow = me.ship.heat.currentHeat
  /**
   * The whole heat rule: every point of energy on the loadout is a point of
   * heat at the check (RULES §Energy and Heat). While you plan, the loadout is
   * the plan's, and it starts empty: your turn clears last turn's energy, so
   * what the view still shows on your tiles is never counted again. Any other
   * time the check has already billed what your tiles hold, so there is no
   * ghost.
   */
  const planning = plan?.isMyTurn === true
  const heatAfter = planning ? plan.projectedHeat : heatNow
  /**
   * Shields that are up can still add heat before your next turn: each point
   * they absorb spends SHIELD_ENERGY_PER_POINT energy and puts
   * SHIELD_HEAT_PER_POINT heat on the track, after this check, so it is billed
   * at the next one. While you plan they are the shields the plan powers; any
   * other time they are the ones your last turn left up.
   */
  const shieldTiles = (planning ? plan.pendingSubsystems : me.ship.subsystems).filter(
    s => s.type === 'shields' && s.isPowered && !s.isBroken
  )
  const shieldsOnly = shieldTiles.reduce(
    (sum, s) => sum + Math.floor(s.allocatedEnergy / SHIELD_ENERGY_PER_POINT),
    0
  )
  const shieldHeat = shieldsOnly * SHIELD_HEAT_PER_POINT
  const heatMax = MAX_HEAT
  const overHeat = Math.max(0, heatAfter - MAX_HEAT)
  /** What is still on the track when the next turn starts. */
  const carried = heatAfterCheck(heatAfter, dissipation)
  /**
   * The worst your next turn can start from: the track as this check leaves it
   * (or as it stands, between your turns) plus everything the shields could
   * absorb. Past the redline that is hull at your next check before you do
   * anything at all.
   */
  const nextTurnWorst = (planning ? carried : heatNow) + shieldHeat
  const shieldHull = shieldHeat > 0 ? Math.max(0, nextTurnWorst - MAX_HEAT) : 0
  /** Hatched only between your turns, when the track is where absorption lands. */
  const worstHeat = planning ? undefined : heatNow + shieldHeat

  const fuelNow = me.ship.reactionMass
  const fuelAfter = plan ? plan.projectedFuel : fuelNow

  const missiles = me.ship.subsystems.filter(s => s.type === 'missiles')
  const perTubeMax = getMissileStats().maxAmmo

  const crates = me.cargo.filter(c => c.isPickedUp && c.kind === 'crate').length
  const data = me.cargo.filter(c => c.isPickedUp && c.kind === 'data').length

  /**
   * A destroyed ship is off the board and one just back from Home cannot be
   * touched, and neither fact is visible anywhere else on your own column: an
   * opponent's card carries the badge but your own tracks did not, so a hull
   * that changed while your token was missing looked like it changed for no
   * reason.
   */
  const destroyed = me.ship.hitPoints <= 0
  const recovering = !destroyed && me.recovering
  const state = destroyed
    ? { label: 'DESTROYED', tip: 'Off the board. You return to Home on your next turn.' }
    : recovering
      ? {
          label: 'UNTOUCHABLE',
          tip: 'Back from Home: this turn is a first round of your own. Nobody touches you until it is over, and you fire at nobody and scan nobody.',
        }
      : null

  /** At the top of the track any heat at all is hull, so it gets its own state. */
  const atRedline = heatAfter >= MAX_HEAT

  return (
    <Box
      data-testid="status-block"
      sx={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.35,
        px: 0.75,
        py: 0.6,
        borderRadius: 1,
        border: `1px solid ${TABLE.line}`,
        borderLeft: `2px solid ${accent ?? TABLE.plateEdge}`,
        background: `linear-gradient(180deg, rgba(132,150,142,0.05) 0%, rgba(0,0,0,0) 100%)`,
        minWidth: 0,
      }}
    >
      {/* Where you are and which way you point, with the hold beside it. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          rowGap: 0.2,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <Tooltip title="Prograde burns move you outward, retrograde inward">
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.78rem',
              fontWeight: 700,
              color: TABLE.accent,
              lineHeight: 1.2,
              flexShrink: 0,
            }}
          >
            {me.ship.facing === 'prograde' ? '↗' : '↙'} {me.ship.facing}
          </Typography>
        </Tooltip>
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.78rem',
            color: TABLE.inkSoft,
            lineHeight: 1.2,
            minWidth: 0,
          }}
          noWrap
        >
          {getWellName(me.ship.wellId)} R{me.ship.ring} S{me.ship.sector}
        </Typography>
        {state && (
          <Tooltip title={state.tip}>
            <Typography
              data-testid="ship-state"
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: TABLE.danger,
                border: `1px solid ${TABLE.danger}`,
                borderRadius: '3px',
                px: 0.5,
                lineHeight: 1.4,
                flexShrink: 0,
              }}
            >
              {state.label}
            </Typography>
          </Tooltip>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }} />
        <Tooltip title="Cargo aboard">
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <CargoTokens crates={crates} data={data} size={9} />
          </Box>
        </Tooltip>
      </Box>

      {/* Hull and heat, each on its own row: the heat track grows with the plan and must never wrap. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 0.35,
          minWidth: 0,
        }}
      >
        <PipTrack
          value={me.ship.hitPoints}
          max={me.ship.maxHitPoints}
          color={TABLE.hull}
          label="Hull"
          size={9}
        />
        <Tooltip
          title={
            [
              planning && heatAfter > heatNow ? `${heatAfter - heatNow} energy on your subsystems.` : '',
              `Dissipates ${dissipation}, carries ${carried}.`,
              overHeat > 0 ? `−${overHeat} hull.` : `Over ${MAX_HEAT} costs hull.`,
              shieldHeat > 0 ? `+${shieldHeat} by your next turn if shields absorb.` : '',
            ]
              .filter(Boolean)
              .join(' ')
          }
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            <PipTrack
              value={heatNow}
              projected={heatAfter}
              worstCase={worstHeat}
              max={heatMax}
              threshold={dissipation}
              color={TABLE.heat}
              label="Heat"
              size={9}
              readout={
                <>
                  {heatNow}
                  {heatAfter !== heatNow && (
                    <Box component="span" sx={{ color: overHeat ? TABLE.heat : TABLE.ink }}>
                      →{heatAfter}
                    </Box>
                  )}
                  {/* Between turns only, beside the hatch it reads: while you plan it is the next turn's, and the tooltip says so. */}
                  {!planning && shieldHeat > 0 && (
                    <Box
                      component="span"
                      sx={{
                        color: shieldHull > 0 ? TABLE.danger : TABLE.inkSoft,
                        fontWeight: 400,
                      }}
                    >
                      +{shieldHeat}
                    </Box>
                  )}
                  <Box
                    component="span"
                    sx={{ color: atRedline ? TABLE.danger : TABLE.inkFaint, fontWeight: atRedline ? 700 : 400 }}
                  >
                    /{MAX_HEAT}
                  </Box>
                </>
              }
            />
            {atRedline && overHeat === 0 && (
              <Typography
                data-testid="heat-redline"
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: TABLE.danger,
                }}
                noWrap
              >
                REDLINE
              </Typography>
            )}
            {overHeat > 0 && (
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: TABLE.danger,
                }}
                noWrap
              >
                −{overHeat} hull
              </Typography>
            )}
          </Box>
        </Tooltip>
        {shieldHull > 0 && (
          <Tooltip
            title={`Absorbing ${shieldsOnly} puts ${shieldHeat} heat on the track before your next turn: it would start at ${nextTurnWorst}, and your next check would cost ${shieldHull} hull before you power or use anything.`}
          >
            <Typography
              data-testid="shield-heat-warning"
              sx={{
                flexBasis: '100%',
                fontFamily: FONT_MONO,
                fontSize: '0.72rem',
                fontWeight: 700,
                color: TABLE.danger,
                lineHeight: 1.2,
              }}
            >
              −{shieldHull} hull next check if shields absorb
            </Typography>
          </Tooltip>
        )}
      </Box>

      {/* Fuel, then a line of missiles per launcher */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35, minWidth: 0 }}>
        <Tooltip
          title="Fuel is public."
        >
          <Box sx={{ display: 'flex', minWidth: 0 }}>
            <PipTrack
              value={fuelNow}
              projected={fuelAfter}
              max={maxFuel}
              color={TABLE.fuel}
              label="Fuel"
              size={9}
              readout={
                <>
                  {fuelNow}
                  {fuelAfter !== fuelNow && (
                    <Box
                      component="span"
                      sx={{ color: fuelAfter < fuelNow ? TABLE.inkSoft : TABLE.hull }}
                    >
                      →{fuelAfter}
                    </Box>
                  )}
                  <Box component="span" sx={{ color: TABLE.inkFaint, fontWeight: 400 }}>
                    /{maxFuel}
                  </Box>
                </>
              }
            />
          </Box>
        </Tooltip>
        {/*
          One line per launcher, named by its slot: two missiles tiles are two
          separate magazines and a single total cannot say which one is empty.
          The rounds are drawn rather than counted: four of them read at a
          glance, and a spent one leaves its outline behind so the magazine's
          size stays visible.
        */}
        {missiles.map(tile => {
          const left = tile.ammo ?? 0
          return (
            <Tooltip
              key={tile.id}
              title={`${slotLabel(tile.id)}: ${left} of ${perTubeMax} missiles. Private until you fire.`}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
                <Typography
                  variant="overline"
                  sx={{ color: TABLE.inkFaint, lineHeight: 1, minWidth: 30, flexShrink: 0 }}
                >
                  {slotShortLabel(tile.id)}
                </Typography>
                <Box sx={{ display: 'flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
                  {Array.from({ length: perTubeMax }, (_, i) => (
                    <MissilePip key={i} spent={i >= left} broken={tile.isBroken === true} />
                  ))}
                </Box>
              </Box>
            </Tooltip>
          )
        })}
      </Box>
    </Box>
  )
}
