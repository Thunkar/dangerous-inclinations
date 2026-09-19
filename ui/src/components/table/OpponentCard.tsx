/**
 * A rival's mat, seen from across the table and kept narrow: name and colour,
 * hull and heat, home port, the hold, the fuel they have burned, the score,
 * and the five slots.
 *
 * The crosshair by the name pings them: rings expand off their hull on the
 * board and, on the 3D board, the camera swings to their well. It asks the
 * table a question and changes nothing in the game — three wells and 120
 * sectors are a lot of board to search by eye.
 *
 * The slots are the interesting part. A face-down tile shows only which slot
 * it is — but the energy cubes on it are public, so four cubes on a face-down
 * forward slot can only be a railgun. A tile you have seen through a scan
 * carries an eye badge; it is face-up for you alone.
 *
 * Clicking a slot names it: the slot a critical hit would break, or the tile a
 * scan will look at. A scan wants a face-down tile — but once you know them
 * all, any slot will do (the engine takes whichever it can and tells you).
 */
import { ShipMark } from '../../ships/ShipMark'
import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import type { PlayerView, SubsystemId } from '@dangerous-inclinations/engine'
import {
  MAX_HEAT,
  CARGO_HOLD_CRATES,
  isCriticalTarget,
} from '@dangerous-inclinations/engine'
import { FONT_MONO, TABLE } from '../../theme'
import { Panel } from '../common/Panel'
import { SubsystemTile } from '../common/SubsystemTile'
import { CargoChits, PipTrack } from '../common/Tokens'
import { missionFamilyColor, missionFamilyLabel } from '../../utils/missions'
import { slotLabel } from '../../utils/slots'
import { agentLabel } from '../../utils/agents'
import { useGame } from '../../context/GameContext'
import { useAnimation } from '../../context/AnimationContext'

const SLOT_TILE = 36
const FIXED_TILE = 22

interface OpponentCardProps {
  player: PlayerView
  color: string
  /** Non-null when a click on a slot means something. */
  picking: 'crit' | 'peek' | null
  onPickSlot?: (playerId: string, slotId: SubsystemId) => void
  onPickPlayer?: (playerId: string) => void
  selectedSlotId?: SubsystemId | null
  isTargeted?: boolean
  pulses: Record<string, number>
}

export function OpponentCard({
  player,
  color,
  picking,
  onPickSlot,
  onPickPlayer,
  selectedSlotId,
  isTargeted,
  pulses,
}: OpponentCardProps) {
  const ship = player.ship
  const destroyed = ship?.isDestroyed ?? false
  const { ping } = useAnimation()
  /** Who plays this seat: an agent's driver and model, or nothing for people and bots. */
  const { seats, view } = useGame()
  const agent = agentLabel(seats.find(s => s.playerId === player.id)?.agent)
  /** Back at Home with a full hull, and nobody can touch it until it acts. */
  const recovering = !destroyed && player.recovering
  const slots = [...player.slots].sort((a, b) =>
    a.group === b.group ? a.index - b.index : a.group === 'forward' ? -1 : 1
  )

  const clickable = picking !== null && !!onPickSlot
  const peekOnly = picking === 'peek'
  const allSlotsKnown = slots.every(slot => slot.type !== null)
  const peekable = (slot: (typeof slots)[number]) =>
    !peekOnly || slot.type === null || allSlotsKnown

  return (
    <Panel
      accent={color}
      dense
      sx={{
        flexShrink: 0,
        minWidth: 0,
        outline: isTargeted
          ? `1px solid ${TABLE.accent}`
          : player.isActive
            ? `1px solid ${color}`
            : 'none',
        outlineOffset: -1,
        boxShadow: isTargeted
          ? `0 0 16px ${TABLE.accentGlow}`
          : player.isActive
            ? `0 0 14px ${color}55`
            : undefined,
        opacity: destroyed ? 0.6 : recovering ? 0.8 : 1,
      }}
      title={
        <Box
          onClick={onPickPlayer ? () => onPickPlayer(player.id) : undefined}
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 0.6,
            minWidth: 0,
            cursor: onPickPlayer ? 'pointer' : 'default',
          }}
        >
          <Box sx={{ width: 42, height: 20, flexShrink: 0, alignSelf: 'center' }}>
            <ShipMark appearance={player.appearance} accent={color} />
          </Box>
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontWeight: 600,
              fontSize: '0.86rem',
              color: TABLE.ink,
              lineHeight: 1.2,
              flexShrink: 0,
            }}
            noWrap
          >
            {player.name}
          </Typography>
          {agent && (
            // The name always fits; the driver and model give way and tell the rest on hover.
            <Tooltip title={agent}>
              <Typography
                noWrap
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '0.62rem',
                  color: TABLE.inkSoft,
                  lineHeight: 1.2,
                  minWidth: 0,
                  flex: '1 1 auto',
                }}
              >
                {agent}
              </Typography>
            </Tooltip>
          )}
          <Tooltip
            title={destroyed ? 'Nothing on the board to find' : `Find ${player.name} on the board`}
          >
            <Box component="span" sx={{ display: 'flex', flexShrink: 0 }}>
              <IconButton
                size="small"
                aria-label={`Ping ${player.name}`}
                disabled={destroyed || !ship}
                onClick={event => {
                  // The card's own click aims this turn's step at the player;
                  // the crosshair only looks.
                  event.stopPropagation()
                  ping(player.id)
                }}
                sx={{ p: 0.25, color: TABLE.inkFaint, '&:hover': { color } }}
              >
                <GpsFixedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Box>
          </Tooltip>
          {player.isActive && (
            <Typography variant="overline" sx={{ color, lineHeight: 1, fontSize: '0.68rem' }}>
              acting
            </Typography>
          )}
          {destroyed && (
            <Typography
              variant="overline"
              sx={{ color: TABLE.danger, lineHeight: 1, fontSize: '0.68rem' }}
            >
              lost
            </Typography>
          )}
          {recovering && (
            <Tooltip title="Respawned at Home — no shot, missile or scan reaches it until it acts">
              <Typography
                variant="overline"
                noWrap
                sx={{ color: TABLE.accent, lineHeight: 1, fontSize: '0.68rem', flexShrink: 0 }}
              >
                respawned, untouchable this round
              </Typography>
            </Tooltip>
          )}
        </Box>
      }
      action={
        <Tooltip
          title={`${player.completedMissionCount} of ${view.pointsToWin} points`}
        >
          <Box sx={{ display: 'flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
            {Array.from({ length: view.pointsToWin }, (_, i) => (
              <Box
                key={i}
                sx={{
                  width: 8,
                  height: 12,
                  borderRadius: '1px',
                  bgcolor: i < player.completedMissionCount ? TABLE.accent : 'transparent',
                  border: `1px solid ${i < player.completedMissionCount ? TABLE.accent : TABLE.plateEdge}`,
                  boxShadow:
                    i < player.completedMissionCount ? `0 0 7px ${TABLE.accentGlow}` : 'none',
                }}
              />
            ))}
          </Box>
        </Tooltip>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35, minWidth: 0 }}>
        <PipTrack
          value={ship?.hitPoints ?? 0}
          max={ship?.maxHitPoints ?? 10}
          color={TABLE.hull}
          label="Hull"
          size={8}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
            {/* Against the redline, not a guess: heat carries, and 10 is where it costs hull. */}
            <PipTrack
              value={ship?.heat ?? 0}
              max={Math.max(MAX_HEAT, ship?.heat ?? 0)}
              color={ship && ship.heat >= MAX_HEAT ? TABLE.danger : TABLE.heat}
              label="Heat"
              size={8}
            />
          </Box>
          {/* Fuel is public: the cubes sit on the mat (RULES §Hidden information). */}
          <Tooltip title={`Fuel aboard: ${ship?.fuel ?? 0}. Everyone can count it.`}>
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.72rem',
                fontWeight: 700,
                color: TABLE.fuel,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {ship?.fuel ?? 0}
              <Box component="span" sx={{ color: TABLE.inkFaint, fontWeight: 400 }}>
                {' '}
                fuel
              </Box>
            </Typography>
          </Tooltip>
        </Box>

        {/* Home is on the board with a marker of its own and never moves, so
            printing it on the card was a line that told nobody anything. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <Tooltip
            title={`Cargo aboard. The hold takes ${CARGO_HOLD_CRATES} crate; data rides free. Destinations are private.`}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <CargoChits
                crates={player.cargoAboard.crates}
                data={player.cargoAboard.data}
                size={8}
              />
            </Box>
          </Tooltip>
        </Box>

        {/* The five slots, on one row */}
        <Box sx={{ display: 'flex', gap: '5px', alignItems: 'flex-start', minWidth: 0 }}>
          {slots.map(slot => (
            <SubsystemTile
              key={slot.id}
              id={slot.id}
              type={slot.type}
              knownVia={slot.knownVia}
              isBroken={slot.isBroken}
              allocatedEnergy={slot.allocatedEnergy}
              ammo={slot.ammo}
              size={SLOT_TILE}
              cubeSize={5}
              selected={selectedSlotId === slot.id}
              highlighted={clickable && peekable(slot)}
              pulse={Boolean(pulses[`${player.id}:${slot.id}`])}
              onClick={
                clickable && onPickSlot !== undefined && peekable(slot)
                  ? () => onPickSlot(player.id, slot.id)
                  : undefined
              }
            />
          ))}
        </Box>

        {/* The fixed systems, as small badges */}
        <Box sx={{ display: 'flex', gap: '5px', alignItems: 'flex-start', minWidth: 0 }}>
          {player.fixed.map(fixed => {
            const targetable = isCriticalTarget(fixed.id)
            return (
              <Tooltip
                key={fixed.id}
                title={`${slotLabel(fixed.id)}${fixed.isBroken ? ' — broken' : ''}${
                  targetable ? '' : ' — a critical cannot name it'
                }`}
              >
                <Box>
                  <SubsystemTile
                    id={fixed.id}
                    type={fixed.type}
                    knownVia="revealed"
                    isBroken={fixed.isBroken}
                    allocatedEnergy={fixed.allocatedEnergy}
                    size={FIXED_TILE}
                    cubeSize={5}
                    pulse={Boolean(pulses[`${player.id}:${fixed.id}`])}
                    onClick={
                      picking === 'crit' && targetable && onPickSlot !== undefined
                        ? () => onPickSlot(player.id, fixed.id)
                        : undefined
                    }
                    selected={selectedSlotId === fixed.id}
                    highlighted={picking === 'crit' && targetable}
                  />
                </Box>
              </Tooltip>
            )
          })}
        </Box>

        {/* Completed missions, face-up for everyone */}
        {player.completedMissions.length > 0 && (
          <Box sx={{ display: 'flex', gap: '4px', flexWrap: 'wrap', minWidth: 0 }}>
            {player.completedMissions.map(mission => (
              <Tooltip key={mission.id} title={missionFamilyLabel(mission)}>
                <Typography
                  sx={{
                    fontFamily: FONT_MONO,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    lineHeight: 1.6,
                    px: 0.5,
                    borderRadius: '2px',
                    color: missionFamilyColor(mission),
                    border: `1px solid ${missionFamilyColor(mission)}66`,
                    background: `${missionFamilyColor(mission)}14`,
                  }}
                >
                  {missionFamilyLabel(mission)}
                </Typography>
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>
    </Panel>
  )
}
