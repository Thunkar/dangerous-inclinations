/**
 * The stations a player has sold at, as a line on their card: "Sold at" and
 * each station's name in its planet's colour, the same colour the board
 * draws the station in. A station buys one item from each player, once, and
 * which ones a player has used is public (RULES §Stations). Nothing when
 * there are none.
 */
import { Box, Tooltip, Typography } from '@mui/material'
import type { PlayerView } from '@dangerous-inclinations/engine'
import { getWellName } from '@dangerous-inclinations/engine'
import { TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'
import { wellColor } from '../board/geometry'

export function SoldAt({ player }: { player: PlayerView | undefined }) {
  if (!player || player.soldAt.length === 0) return null
  const names = player.soldAt.map(id => getWellName(id))
  return (
    <Tooltip
      title={`${names.join(', ')} ${names.length > 1 ? 'buy' : 'buys'} nothing more from ${player.isMe ? 'you' : player.name}.`}
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
          Sold at
        </Typography>
        {player.soldAt.map(id => (
          <Typography
            key={id}
            noWrap
            sx={{
              fontFamily: FONT_DISPLAY,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              fontWeight: 600,
              fontSize: '0.72rem',
              color: wellColor(id),
              lineHeight: 1.3,
            }}
          >
            {getWellName(id)}
          </Typography>
        ))}
      </Box>
    </Tooltip>
  )
}
