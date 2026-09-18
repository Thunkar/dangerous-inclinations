/**
 * Instrument plates. Everything on the table is mounted on one of these:
 * a matte dark plate with a thin luminous edge and a monospace stencil label.
 *
 * A plate given a `collapseId` can be folded away by its label, and remembers
 * that per player and per plate. The left column stacks the rivals' mats, the
 * turn log and the table talk in whatever height is left, and on a short
 * window that leaves the two pads too small to read — folding a plate you are
 * not using is cheaper than scrolling the column.
 */
import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { Box, Paper, Typography, type SxProps, type Theme } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { TABLE } from '../../theme'

interface PanelProps {
  children: ReactNode
  /** Stencilled label along the top of the plate. */
  title?: ReactNode
  action?: ReactNode
  /** Accent colour for the luminous top edge (player colour, family colour…). */
  accent?: string
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
        borderRadius: 1.5,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxShadow: '0 1px 0 rgba(255,255,255,0.05) inset, 0 4px 14px rgba(0,0,0,0.16)',
        ...(sx as object),
        // A folded plate is its label and nothing else, whatever the caller asked for.
        ...(collapsed ? { flex: '0 0 auto', minHeight: 0 } : {}),
      }}
    >
      {accent && <Box sx={{ height: 2, flexShrink: 0, bgcolor: accent }} />}
      {(title || action) && (
        <Box
          onClick={foldable ? toggle : undefined}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: dense ? 1 : 1.5,
            pt: dense ? 0.6 : 0.9,
            pb: 0.4,
            flexShrink: 0,
            borderBottom: collapsed ? 'none' : `1px solid ${TABLE.line}`,
            cursor: foldable ? 'pointer' : 'default',
            userSelect: foldable ? 'none' : undefined,
            '&:hover': foldable ? { background: 'rgba(255,255,255,0.04)' } : undefined,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, minWidth: 0 }}>
            {foldable && (
              <Chevron sx={{ fontSize: 15, color: TABLE.inkFaint, flexShrink: 0, ml: '-3px' }} />
            )}
            {typeof title === 'string' ? (
              <Typography variant="overline" sx={{ color: TABLE.inkSoft, lineHeight: 1.5 }} noWrap>
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
        borderRadius: 1,
        '&:hover': { background: 'rgba(255,255,255,0.04)' },
      }}
    >
      <Chevron sx={{ fontSize: 15, color: TABLE.inkFaint, flexShrink: 0 }} />
      <Typography variant="overline" sx={{ color: TABLE.inkSoft, lineHeight: 1.5 }} noWrap>
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
      sx={{ color: TABLE.inkFaint, display: 'block', lineHeight: 1.7, ...(sx as object) }}
    >
      {children}
    </Typography>
  )
}
