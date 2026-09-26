/**
 * Whose turn it is, across the top of the board, for a moment.
 *
 * The header already says who is to act, but a turn played back over the
 * board (and filmed by the auto camera, which cuts from one ship to the next)
 * needs the name where the eye is. So the banner comes up when a playback
 * starts, naming the ship whose turn it is, and again when your own turn
 * arrives with nothing playing. It is the header's information, placed and
 * timed; it never takes a click.
 */
import { useEffect, useState } from 'react'
import { Box } from '@mui/material'
import { useGame } from '../../context/GameContext'
import { usePlayback } from '../../context/AnimationContext'
import { getPlayerColor } from '../../utils/playerColors'
import { TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'

/** How long the banner stays up, fade included. */
const SHOWN_MS = 2400

interface Banner {
  key: string
  text: string
  color: string
}

export function TurnBanner() {
  const { view } = useGame()
  const playback = usePlayback()
  const [banner, setBanner] = useState<Banner | null>(null)

  const indexOf = (playerId: string) => view.players.findIndex(p => p.id === playerId)
  const nameFor = (playerId: string) => {
    const player = view.players.find(p => p.id === playerId)
    return player?.isMe ? 'Your turn' : `${player?.name ?? 'Somebody'}'s turn`
  }

  // A playback names its actor.
  const playbackId = playback?.id
  const actorId = playback?.actorId
  useEffect(() => {
    if (!playbackId || !actorId) return
    setBanner({
      key: playbackId,
      text: nameFor(actorId),
      color: getPlayerColor(indexOf(actorId)),
    })
    // Keyed on the playback: a new one is a new banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackId])

  // Your turn, arriving once nothing is playing.
  const mine = view.me !== null && view.activePlayerId === view.me.id
  const yourTurnKey = mine && !playback ? `you-${view.turn}-${view.activePlayerId}` : null
  useEffect(() => {
    if (!yourTurnKey || !view.me) return
    setBanner({ key: yourTurnKey, text: 'Your turn', color: getPlayerColor(indexOf(view.me.id)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourTurnKey])

  const bannerKey = banner?.key
  useEffect(() => {
    if (!bannerKey) return
    const timer = setTimeout(() => setBanner(null), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [bannerKey])

  if (!banner) return null
  return (
    <Box
      key={banner.key}
      aria-live="polite"
      sx={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        zIndex: 2,
        display: 'flex',
        alignItems: 'stretch',
        bgcolor: TABLE.bar,
        border: `1px solid ${TABLE.plateEdge}`,
        animation: `di-turn-banner ${SHOWN_MS}ms ease-in-out both`,
        '@keyframes di-turn-banner': {
          '0%': { opacity: 0, transform: 'translate(-50%, -8px)' },
          '12%': { opacity: 1, transform: 'translate(-50%, 0)' },
          '80%': { opacity: 1, transform: 'translate(-50%, 0)' },
          '100%': { opacity: 0, transform: 'translate(-50%, -4px)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          animation: `di-turn-banner-still ${SHOWN_MS}ms linear both`,
          '@keyframes di-turn-banner-still': {
            '0%, 100%': { opacity: 0 },
            '10%, 85%': { opacity: 1 },
          },
        },
      }}
    >
      <Box sx={{ width: 8, bgcolor: banner.color, flexShrink: 0 }} />
      <Box
        sx={{
          px: 2,
          py: 0.75,
          fontFamily: FONT_DISPLAY,
          fontSize: '1.15rem',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: TABLE.ink,
          whiteSpace: 'nowrap',
        }}
      >
        {banner.text}
      </Box>
    </Box>
  )
}
