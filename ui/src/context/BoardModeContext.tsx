/**
 * BoardModeContext: which renderer draws the board.
 *
 * One choice, remembered across sessions in `localStorage` (the same pattern
 * as the player id), because it is a preference about how you like to look at
 * the table rather than anything about the game. `?board=3d` (or `2d`)
 * overrides it for this session only. Deep links and screenshots need to
 * name a renderer without changing what the player gets next time.
 *
 * A browser with no WebGL 2 is pinned to the flat board and told why: the 3D
 * board is a playtest aid, never a requirement for sitting down.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type BoardMode = '2d' | '3d'

const STORAGE_KEY = 'di.boardMode'

interface BoardModeContextValue {
  mode: BoardMode
  setMode: (mode: BoardMode) => void
  /** False when this browser cannot give us a WebGL 2 context. */
  canRender3d: boolean
}

const BoardModeContext = createContext<BoardModeContextValue | null>(null)

const isMode = (value: string | null): value is BoardMode => value === '2d' || value === '3d'

/** One probe per page load: creating contexts is not free. */
let webgl2Probe: boolean | null = null

function probeWebgl2(): boolean {
  if (webgl2Probe !== null) return webgl2Probe
  try {
    webgl2Probe = document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    webgl2Probe = false
  }
  return webgl2Probe
}

/** The query flag wins for this session; otherwise whatever was stored last. */
function initialMode(): BoardMode {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('board')
    if (isMode(fromUrl)) return fromUrl
  } catch {
    // A URL we cannot read is simply no preference.
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isMode(stored)) return stored
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return '2d'
}

export function BoardModeProvider({ children }: { children: ReactNode }) {
  const canRender3d = useMemo(() => probeWebgl2(), [])
  const [stored, setStored] = useState<BoardMode>(() => initialMode())

  const setMode = useCallback((next: BoardMode) => {
    setStored(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // The choice still holds for this session.
    }
  }, [])

  const value = useMemo<BoardModeContextValue>(
    () => ({ mode: canRender3d ? stored : '2d', setMode, canRender3d }),
    [stored, setMode, canRender3d]
  )

  return <BoardModeContext.Provider value={value}>{children}</BoardModeContext.Provider>
}

/** The flat board, for anything rendered outside the provider. */
const FALLBACK: BoardModeContextValue = { mode: '2d', setMode: () => {}, canRender3d: false }

export function useBoardMode(): BoardModeContextValue {
  return useContext(BoardModeContext) ?? FALLBACK
}
