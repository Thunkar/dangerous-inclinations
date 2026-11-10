/**
 * The Escort markers sitting on a ship, as a line on its card: "Escorted by"
 * and a shield per marker in the marking player's colour, the same mark the
 * board hangs over the hull. The markers are face-up on the table, so every
 * seat sees them (RULES §Missions, Escort). Nothing when there are none.
 */
import { Box, Tooltip, Typography } from '@mui/material'
import { fill, type PlayerView } from '@dangerous-inclinations/engine'
import { TABLE } from '../../design/tokens'
import { FONT_DISPLAY } from '../../design/press'
import { useGame } from '../../context/GameContext'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE_TEXT } from '../../text/table'

const T = TABLE_TEXT.escortedBy

function Shield({ color }: { color: string }) {
  return (
    <svg width={9} height={11} viewBox="-5.5 -6.5 11 13" style={{ flexShrink: 0 }}>
      <path
        d="M -4.5 -5.5 H 4.5 V 0.5 L 0 5.5 L -4.5 0.5 Z"
        fill={color}
        stroke={TABLE.ink}
        strokeWidth={1.1}
      />
    </svg>
  )
}

export function EscortedBy({ player }: { player: PlayerView | undefined }) {
  const { view } = useGame()
  if (!player || player.escortedBy.length === 0) return null
  const escorts = view.players.flatMap((p, index) =>
    player.escortedBy.includes(p.id)
      ? [{ id: p.id, name: p.name, color: getPlayerColor(index) }]
      : []
  )
  return (
    <Tooltip
      title={fill(escorts.length > 1 ? T.tipMany : T.tipOne, {
        names: escorts.map(e => e.name).join(T.and),
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flexWrap: 'wrap' }}>
        <Typography
          sx={{
            fontFamily: FONT_DISPLAY,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontSize: '0.68rem',
            color: TABLE.inkSoft,
            lineHeight: 1.3,
          }}
        >
          {T.label}
        </Typography>
        {escorts.map(escort => (
          <Box
            key={escort.id}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.3, minWidth: 0 }}
          >
            <Shield color={escort.color} />
            <Typography
              noWrap
              sx={{
                fontFamily: FONT_DISPLAY,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 600,
                fontSize: '0.72rem',
                color: escort.color,
                lineHeight: 1.3,
              }}
            >
              {escort.name}
            </Typography>
          </Box>
        ))}
      </Box>
    </Tooltip>
  )
}
