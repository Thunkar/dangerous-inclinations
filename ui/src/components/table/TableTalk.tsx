/**
 * Table talk: the chat channel every seat shares, humans and agents alike.
 *
 * Two lanes on the same pad. A `say` is a line spoken at the table, in the
 * speaker's colour. A `think` is the reasoning behind a move (an agent's, or
 * a human's when they choose to think out loud) set in italics, dimmed and
 * tagged, so nobody mistakes reasoning for table talk.
 *
 * Purely presentational: it renders what the server has broadcast and posts
 * what is typed. Nothing here touches the game state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  TextField,
  Tooltip,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material'
import type { ChatKind, ChatMessage } from '../../api/types'
import { useGame } from '../../context/GameContext'
import { getPlayerColor } from '../../utils/playerColors'
import { FONT_MONO, TABLE } from '../../theme'
import { FONT_DISPLAY } from '../../design/press'
import { Panel } from '../common/Panel'

/** Within this many pixels of the foot counts as "reading the newest line". */
const STICK_THRESHOLD = 28

function Line({ message, color }: { message: ChatMessage; color: string }) {
  const think = message.kind === 'think'
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.75,
        alignItems: 'flex-start',
        minWidth: 0,
        mt: 0.6,
        pl: 0.75,
        borderLeft: `2px ${think ? 'dashed' : 'solid'} ${think ? TABLE.line : color}`,
        bgcolor: think ? TABLE.hover : 'transparent',
      }}
    >
      <Box
        sx={{
          width: 7,
          height: 7,
          bgcolor: color,
          opacity: think ? 0.5 : 1,
          mt: '6px',
          flexShrink: 0,
        }}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: FONT_DISPLAY,
              fontSize: '0.8rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: think ? TABLE.inkFaint : color,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {message.name}
          </Typography>
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.72rem',
              color: TABLE.inkFaint,
              flexShrink: 0,
            }}
          >
            T{message.turn}
          </Typography>
          {think && (
            <Typography
              sx={{
                fontFamily: FONT_DISPLAY,
                fontSize: '0.7rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: TABLE.inkFaint,
                border: `1px solid ${TABLE.plateEdge}`,
                px: 0.4,
                lineHeight: 1.5,
                flexShrink: 0,
              }}
            >
              thinking
            </Typography>
          )}
        </Box>
        <Typography
          sx={{
            fontSize: '0.875rem',
            lineHeight: 1.4,
            color: think ? TABLE.inkSoft : TABLE.ink,
            fontStyle: think ? 'italic' : 'normal',
            opacity: think ? 0.85 : 1,
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.text}
        </Typography>
      </Box>
    </Box>
  )
}

/** `sx` places the plate: the table stacks it under the log, the setup screens put it in a column. */
export function TableTalk({ sx }: { sx?: SxProps<Theme> } = {}) {
  const { chat, sendChat, gameId, view, readOnly } = useGame()
  const [draft, setDraft] = useState('')
  const [thinkOutLoud, setThinkOutLoud] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** False once the reader has scrolled up: their place is not stolen by a new line. */
  const stickRef = useRef(true)

  const colorOf = useMemo(() => {
    const index = new Map(view.players.map((p, i) => [p.id, i]))
    return (playerId: string) => getPlayerColor(index.get(playerId) ?? -1)
  }, [view.players])

  useEffect(() => {
    const pad = scrollRef.current
    if (pad && stickRef.current) pad.scrollTop = pad.scrollHeight
  }, [chat.length])

  const onScroll = useCallback(() => {
    const pad = scrollRef.current
    if (!pad) return
    stickRef.current = pad.scrollHeight - pad.scrollTop - pad.clientHeight < STICK_THRESHOLD
  }, [])

  const send = useCallback(
    async (kind: ChatKind) => {
      const text = draft.trim()
      if (!text || sending) return
      setSending(true)
      setError(null)
      try {
        await sendChat(text, kind)
        setDraft('')
        stickRef.current = true
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSending(false)
      }
    },
    [draft, sending, sendChat]
  )

  // A replay has no channel to talk on; a table you have no seat at has no voice.
  if (!gameId) return null

  return (
    <Panel
      title="Table talk"
      dense
      collapseId="table-talk"
      summary={chat.length > 0 ? `${chat.length}` : undefined}
      sx={{ flex: '1 1 0', minHeight: 190, minWidth: 0, ...(sx as object) }}
    >
      <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box
          ref={scrollRef}
          onScroll={onScroll}
          data-testid="table-talk-log"
          sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pr: 0.5 }}
        >
          {chat.length === 0 && (
            <Typography variant="caption" sx={{ color: TABLE.inkFaint }}>
              Nobody has said anything yet.
            </Typography>
          )}
          {chat.map(message => (
            <Line key={message.id} message={message} color={colorOf(message.playerId)} />
          ))}
        </Box>

        {!readOnly && (
          <Box
            sx={{
              flexShrink: 0,
              mt: 0.75,
              pt: 0.75,
              borderTop: `1px solid ${TABLE.line}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
            }}
          >
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', minWidth: 0 }}>
              <TextField
                fullWidth
                size="small"
                value={draft}
                placeholder={thinkOutLoud ? 'Think out loud…' : 'Say something…'}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  void send(thinkOutLoud ? 'think' : 'say')
                }}
                inputProps={{ maxLength: 2000, 'aria-label': 'Table talk message' }}
                sx={{
                  minWidth: 0,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 0,
                    bgcolor: TABLE.plateSunk,
                    fontSize: '0.875rem',
                  },
                  '& .MuiOutlinedInput-input': { py: 0.7, px: 1 },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: TABLE.plateEdge },
                }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => void send(thinkOutLoud ? 'think' : 'say')}
                disabled={!draft.trim() || sending}
                sx={{ flexShrink: 0, minWidth: 54, px: 1, py: 0.55, color: TABLE.ink }}
              >
                Send
              </Button>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              {/* describeChild: the button keeps its own name, the tooltip only explains it. */}
              <Tooltip
                describeChild
                title="Post as reasoning: italic and tagged, not table talk."
              >
                <Button
                  size="small"
                  onClick={() => setThinkOutLoud(v => !v)}
                  aria-pressed={thinkOutLoud}
                  sx={{
                    flexShrink: 0,
                    px: 0.75,
                    py: 0.2,
                    minWidth: 0,
                    fontSize: '0.72rem',
                    letterSpacing: '0.1em',
                    color: thinkOutLoud ? TABLE.onSelected : TABLE.inkSoft,
                    border: `1px solid ${thinkOutLoud ? TABLE.selected : TABLE.plateEdge}`,
                    bgcolor: thinkOutLoud ? TABLE.selected : 'transparent',
                    '&:hover': { bgcolor: thinkOutLoud ? TABLE.inkSoft : TABLE.hover },
                  }}
                >
                  think out loud
                </Button>
              </Tooltip>
              <Typography sx={{ fontSize: '0.75rem', color: TABLE.inkFaint }} noWrap>
                Enter sends
              </Typography>
            </Box>
            {error && (
              <Typography sx={{ fontSize: '0.75rem', color: TABLE.danger }}>{error}</Typography>
            )}
          </Box>
        )}
      </Box>
    </Panel>
  )
}
