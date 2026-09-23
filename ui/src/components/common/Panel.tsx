/**
 * Plates. Everything on the table is mounted on one of these: a flat ink
 * plate with a hairline edge, square corners and a label in the poster face.
 * A plate that belongs to someone carries their colour as a heavy rule along
 * its top; the one plate that is yours to act on (`slab`) wears its label on
 * a block of the poster red, cut by the band every printed thing carries.
 *
 * A plate given a `collapseId` can be folded away by its label, and remembers
 * that per player and per plate. The left column stacks the rivals' loadouts, the
 * turn log and the table talk in whatever height is left, and on a short
 * window that leaves the two pads too small to read. Folding a plate you are
 * not using is cheaper than scrolling the column.
 */
import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { Box, Paper, Typography, type SxProps, type Theme } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { TABLE } from '../../theme'
import { BAND_ANGLE } from '../../design/press'

interface PanelProps {
  children: ReactNode
  /** Stencilled label along the top of the plate. */
  title?: ReactNode
  action?: ReactNode
  /** Colour of the heavy rule along the top edge (player colour, family colour…). */
  accent?: string
  /**
   * The label on a solid red slab instead of a ruled line: the plate you act
   * on. `accent`, if given, colours the slab instead of the red.
   */
  slab?: boolean
  dense?: boolean
  sx?: SxProps<Theme>
  /** Makes the label a fold control and remembers the state under this key. */
  collapseId?: string
  /** Folded on first sight. Ignored once the player has chosen. */
  defaultCollapsed?: boolean
  /** Shown beside the label while folded: what you are not looking at. */
  summary?: ReactNode
}

const storageKey = (id: string) => `di.panel.${id}`

export function useCollapsed(id: string | undefined, initial: boolean) {
  const [collapsed, setCollapsed] = useState(() => {
    if (!id) return false
    try {
      const saved = window.localStorage.getItem(storageKey(id))
      if (saved !== null) return saved === '1'
    } catch {
      /* private window, blocked storage: fall back to the default */
    }
    return initial
  })
  const toggle = useCallback(() => {
    setCollapsed(now => {
      const next = !now
      if (id) {
        try {
          window.localStorage.setItem(storageKey(id), next ? '1' : '0')
        } catch {
          /* nothing to remember it with; the session still folds */
        }
      }
      return next
    })
  }, [id])
  return { collapsed, toggle }
}

export function Panel({
  children,
  title,
  action,
  accent,
  slab = false,
  dense,
  sx,
  collapseId,
  defaultCollapsed = false,
  summary,
}: PanelProps) {
  const { collapsed, toggle } = useCollapsed(collapseId, defaultCollapsed)
  const foldable = collapseId !== undefined
  const Chevron = collapsed ? ChevronRightIcon : ExpandMoreIcon

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        background: TABLE.plate,
        border: `1px solid ${TABLE.plateEdge}`,
        borderRadius: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxShadow: 'none',
        ...(sx as object),
        // A folded plate is its label and nothing else, whatever the caller asked for.
        ...(collapsed ? { flex: '0 0 auto', minHeight: 0 } : {}),
      }}
    >
      {accent && !slab && <Box sx={{ height: 4, flexShrink: 0, bgcolor: accent }} />}
      {(title || action) && (
        <Box
          onClick={foldable ? toggle : undefined}
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: dense ? 1 : 1.5,
            pt: slab ? 0.5 : dense ? 0.6 : 0.9,
            pb: slab ? 0.5 : 0.4,
            flexShrink: 0,
            overflow: 'hidden',
            borderBottom: collapsed || slab ? 'none' : `1px solid ${TABLE.line}`,
            bgcolor: slab ? (accent ?? TABLE.accentBlock) : undefined,
            color: slab ? TABLE.onAccent : undefined,
            cursor: foldable ? 'pointer' : 'default',
            userSelect: foldable ? 'none' : undefined,
            '&:hover': foldable && !slab ? { background: TABLE.hover } : undefined,
            // The band: a flat darker stripe across the slab at the press's angle.
            '&::before': slab
              ? {
                  content: '""',
                  position: 'absolute',
                  left: '42%',
                  top: '-150%',
                  width: 20,
                  height: '400%',
                  bgcolor: TABLE.shade,
                  transform: `rotate(${90 - BAND_ANGLE}deg)`,
                  transformOrigin: 'center',
                  pointerEvents: 'none',
                }
              : undefined,
            '& > *': { position: 'relative' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
            {foldable && (
              <Chevron sx={{ fontSize: 15, color: TABLE.inkFaint, flexShrink: 0, ml: '-3px' }} />
            )}
            {typeof title === 'string' ? (
              <Typography
                variant="overline"
                sx={
                  slab
                    ? { color: TABLE.onAccent, lineHeight: 1.5, fontWeight: 700, fontSize: '0.95rem' }
                    : { color: TABLE.ink, lineHeight: 1.5 }
                }
                noWrap
              >
                {title}
              </Typography>
            ) : (
              title
            )}
            {collapsed && summary && (
              <Typography
                variant="overline"
                sx={{ color: TABLE.inkFaint, lineHeight: 1.5, ml: 0.5, minWidth: 0 }}
                noWrap
              >
                {summary}
              </Typography>
            )}
          </Box>
          {/* The action belongs to the plate, not the fold. */}
          <Box onClick={e => e.stopPropagation()} sx={{ display: 'flex', flexShrink: 0 }}>
            {action}
          </Box>
        </Box>
      )}
      {!collapsed && (
        <Box sx={{ px: dense ? 1 : 1.5, py: dense ? 0.75 : 1.25, minHeight: 0, flex: 1 }}>
          {children}
        </Box>
      )}
    </Paper>
  )
}

/** A fold control for a stack that is not itself a plate (the rivals). */
export function FoldHeader({
  label,
  summary,
  collapsed,
  onToggle,
}: {
  label: string
  summary?: ReactNode
  collapsed: boolean
  onToggle: () => void
}) {
  const Chevron = collapsed ? ChevronRightIcon : ExpandMoreIcon
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.25,
        px: 0.5,
        cursor: 'pointer',
        userSelect: 'none',
        flexShrink: 0,
        '&:hover': { background: TABLE.hover },
      }}
    >
      <Chevron sx={{ fontSize: 15, color: TABLE.inkFaint, flexShrink: 0 }} />
      <Typography variant="overline" sx={{ color: TABLE.ink, lineHeight: 1.5 }} noWrap>
        {label}
      </Typography>
      {summary !== undefined && (
        <Typography variant="overline" sx={{ color: TABLE.inkFaint, lineHeight: 1.5, ml: 0.5 }} noWrap>
          {summary}
        </Typography>
      )}
    </Box>
  )
}

export function SectionLabel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      variant="overline"
      sx={{ color: TABLE.inkSoft, display: 'block', lineHeight: 1.7, ...(sx as object) }}
    >
      {children}
    </Typography>
  )
}
