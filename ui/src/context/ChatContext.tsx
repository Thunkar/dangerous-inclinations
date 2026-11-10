/**
 * ChatContext - table talk for one live game, kept apart from the game so a
 * line said at the table re-renders the chat and nothing else.
 *
 * The history is fetched on arrival, every `CHAT` broadcast after it is added,
 * and so is the line this seat has just posted. The same message can reach us
 * twice (the POST answer and the broadcast), so the id is the identity and the
 * order a line first arrived in is the order it is shown in. A `think` is an
 * agent's reasoning: the server sends it to its author and the human seats.
 *
 * Mounted by the live game's provider. A replay keeps no table talk, so with
 * no provider the chat is empty and posting does nothing.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ChatMessage, GameSocketMessage } from '../api/types'
import { getChat, postChat } from '../api/game'
import { useWebSocket } from './WebSocketContext'

export interface ChatContextValue {
  /** Table talk, oldest first: what was said at this table, and this seat's own reasoning. */
  chat: ChatMessage[]
  /** Post a line to the table; empty text does nothing. */
  /** Say something at the table: a person never posts a `think`. */
  sendChat: (text: string) => Promise<void>
}

const NO_CHAT: ChatContextValue = { chat: [], sendChat: async () => {} }

const ChatContext = createContext<ChatContextValue>(NO_CHAT)

export function ChatProvider({ gameId, children }: { gameId: string; children: ReactNode }) {
  const { client } = useWebSocket()
  const [chat, setChat] = useState<ChatMessage[]>([])

  const merge = useCallback((incoming: ChatMessage[]) => {
    setChat(prev => {
      const seen = new Set(prev.map(m => m.id))
      const added = incoming.filter(m => !seen.has(m.id))
      return added.length === 0 ? prev : [...prev, ...added]
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new game drops the old chat before its history loads
    setChat([])
    getChat(gameId)
      .then(response => {
        if (cancelled) return
        // History first, then whatever arrived over the socket while it loaded.
        setChat(live => {
          const history = response.messages ?? []
          const seen = new Set(history.map(m => m.id))
          return [...history, ...live.filter(m => !seen.has(m.id))]
        })
      })
      .catch(() => {
        // Nothing said at this table yet, or the history is gone: start empty.
      })
    return () => {
      cancelled = true
    }
  }, [gameId])

  // The game's provider opens the socket; this only listens on it.
  useEffect(() => {
    if (!client) return
    return client.onMessage(
      'game',
      data => {
        const message = data as GameSocketMessage | null
        if (message?.type === 'CHAT') merge([message.payload])
      },
      gameId
    )
  }, [client, gameId, merge])

  const sendChat = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const { message } = await postChat(gameId, trimmed)
      merge([message])
    },
    [gameId, merge]
  )

  const value = useMemo(() => ({ chat, sendChat }), [chat, sendChat])
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
  return useContext(ChatContext)
}
