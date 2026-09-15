/**
 * Your ship's state, at the top of your own column — the three numbers you
 * steer by, never further than a glance away.
 *
 * Hull, heat and fuel are the same segmented tracks the whole table reads,
 * with what the turn you are building will do to them drawn in as ghost
 * segments: heat you are about to make (with the mark where it starts costing
 * hull) and fuel you are about to spend or scoop. Missile ammo lives here too
 * — it is private, and nothing is ever written under a tile.
 *
 * The heat track reads on three levels, so you can see whether powering the
 * shields is worth it before you spend the cubes: heat you already carry
 * (solid), heat this turn's sequence will make (ghost), and the heat your
 * powered shields would make on top if they absorbed their whole allocation
 * (hatched). If that worst case lands past the dissipation mark, the hull it
 * would cost is spelled out beside the bar.
 *
 * It renders without a plan as well (a replay seat, someone else's turn): the
 * ghosts simply disappear.
 */
import { Box, Tooltip, Typography } from '@mui/material'
import { getMissileStats, getWellName } from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { CargoChits, PipTrack } from '../common/Tokens'
import { useGame } from '../../context/GameContext'
import { usePlanOptional } from '../../context/PlanContext'

export function StatusBlock({ accent }: { accent?: string }) {
  const { view } = useGame()
  const plan = usePlanOptional()
  const me = plan?.me ?? view.me
  if (!me) return null

  const stats = view.myStats
  const dissipation = stats?.dissipationCapacity ?? 5
  const maxFuel = stats?.maxReactionMass ?? 10

  const heatNow = me.ship.heat.currentHeat
  const heatAfter = plan ? plan.projectedHeat : heatNow
  /**
   * Worst case: every powered shield absorbs its full allocation, and every
   * point absorbed becomes heat (RULES §Shields). Read off the cubes as they
   * are being moved, so the cost of powering a shield shows before you commit.
   */
  const pending = plan?.pendingSubsystems ?? me.ship.subsystems
  const shieldsOnly = pending
    .filter(s => s.type === 'shields' && s.isPowered && !s.isBroken)
    .reduce((sum, s) => sum + s.allocatedEnergy, 0)
  /**
   * A powered rack fires on its own at any missile that reaches you, and
   * heats up either way (RULES §Weapons → Ballistic rack). Counted unless the
   * plan already fires it this turn, in which case its heat is in `heatAfter`.
   */
  const rackHeat = pending
    .filter(
      s =>
        s.type === 'ballistic_rack' &&
        s.isPowered &&
        !s.isBroken &&
        !plan?.steps.some(step => step.kind === 'fire' && step.subsystemId === s.id)
    )
    .reduce((sum, s) => sum + s.allocatedEnergy, 0)
  const shieldHeat = shieldsOnly + rackHeat
  const worstHeat = heatAfter + shieldHeat
  const heatMax = Math.max(dissipation + 3, heatAfter, heatNow, worstHeat)
  const overHeat = Math.max(0, heatAfter - dissipation)
  const worstOverHeat = Math.max(0, worstHeat - dissipation)
  /** Hull the shields themselves would cost, over and above the planned turn. */
  const shieldHull = worstOverHeat - overHeat

  const fuelNow = me.ship.reactionMass
  const fuelAfter = plan ? plan.projectedFuel : fuelNow

  const missiles = me.ship.subsystems.filter(s => s.type === 'missiles')
  const ammo = missiles.reduce((sum, s) => sum + (s.ammo ?? 0), 0)
  const maxAmmo = getMissileStats().maxAmmo * missiles.length

  const crates = me.cargo.filter(c => c.isPickedUp && c.kind === 'crate').length
  const data = me.cargo.filter(c => c.isPickedUp && c.kind === 'data').length

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
        background: `linear-gradient(180deg, rgba(126,165,205,0.05) 0%, rgba(0,0,0,0) 100%)`,
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
        <Box sx={{ flex: 1, minWidth: 0 }} />
        <Tooltip title="Cargo aboard">
          <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <CargoChits crates={crates} data={data} size={9} />
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
            `Heat now ${heatNow}, ${heatAfter} once this turn has played out. Anything above ` +
            `${dissipation} at the heat check becomes hull damage.` +
            (shieldHeat > 0
              ? ` Shields absorbing everything they can${rackHeat > 0 ? ' and the rack intercepting a missile' : ''} would add up to ${shieldHeat} more (hatched): ${worstHeat} at the check.`
              : '')
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
                  {shieldHeat > 0 && (
                    <Box
                      component="span"
                      sx={{
                        color: worstOverHeat > overHeat ? TABLE.danger : TABLE.inkSoft,
                        fontWeight: 400,
                      }}
                    >
                      +{shieldHeat}
                    </Box>
                  )}
                  <Box component="span" sx={{ color: TABLE.inkFaint, fontWeight: 400 }}>
                    /{dissipation}
                  </Box>
                </>
              }
            />
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
            title={
              `Shields absorb up to ${shieldsOnly} damage and every point absorbed becomes heat` +
              (rackHeat > 0
                ? `; a powered rack heats by ${rackHeat} when it intercepts a missile`
                : '') +
              `. All of it and the heat check reads ${worstHeat} against a dissipation of ${dissipation}: ` +
              (overHeat > 0
                ? `${worstOverHeat} hull instead of ${overHeat}.`
                : `${worstOverHeat} hull.`)
            }
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
              {rackHeat > 0 ? 'shields or point defence' : 'shields'} would cost −{shieldHull} hull
              if hit
            </Typography>
          </Tooltip>
        )}
      </Box>

      {/* Fuel and what is in the racks */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          rowGap: 0.35,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <Tooltip title={`Fuel now ${fuelNow}, ${fuelAfter} once this turn has played out`}>
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
        {missiles.length > 0 && (
          <Tooltip title={`Missiles aboard: ${ammo} of ${maxAmmo}`}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, flexShrink: 0 }}>
              <Typography variant="overline" sx={{ color: TABLE.inkFaint, lineHeight: 1 }}>
                Ammo
              </Typography>
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  color: ammo === 0 ? TABLE.danger : TABLE.ink,
                }}
              >
                {ammo}
                <Box component="span" sx={{ color: TABLE.inkFaint, fontWeight: 400 }}>
                  /{maxAmmo}
                </Box>
              </Typography>
            </Box>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}
