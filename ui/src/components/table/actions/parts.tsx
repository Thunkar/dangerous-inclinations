/**
 * The pieces the turn column's controls share: a numbered step, a segmented
 * row, a pick among a few, and the plate a "you may" offer sits on.
 */
import { Box, Divider, ToggleButton, Tooltip } from '@mui/material'
import type { ReactNode } from 'react'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import { SectionLabel } from '../../common/Panel'
import { SubsystemIcon } from '../../common/SubsystemIcon'
import { FONT_MONO } from '../../../theme'
import { TABLE } from '../../../design/tokens'

/**
 * One offer under the systems (a repair, the dock, a seizure, a survey, a
 * salvage, a marker): a rule above it, its label, and whatever it offers.
 */
export function OfferSection({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <>
      <Divider />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
        <SectionLabel>{label}</SectionLabel>
        {children}
      </Box>
    </>
  )
}

/** The row of chips an offer lays out. */
export function ChoiceRow({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>{children}</Box>
}

/**
 * One pick among a few (a subsystem to repair, a sale, a carrier to mark,
 * an item to take, a wreck): a cream block when chosen, an outlined one when not.
 */
export function ChoiceChip({
  title,
  selected,
  disabled,
  opacity = 1,
  onClick,
  children,
}: {
  title: string
  selected: boolean
  disabled: boolean
  opacity?: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip title={title}>
      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={onClick}
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.75rem',
          fontWeight: 700,
          px: 0.7,
          py: '2px',
          borderRadius: 0,
          cursor: disabled ? 'default' : 'pointer',
          color: selected ? TABLE.onSelected : TABLE.inkSoft,
          border: `1px solid ${selected ? TABLE.selected : TABLE.plateEdge}`,
          bgcolor: selected ? TABLE.selected : 'transparent',
          opacity,
        }}
      >
        {children}
      </Box>
    </Tooltip>
  )
}

/**
 * One numbered block of the turn, so the column reads top to bottom. The
 * numeral is printed in the red, the way the cheatsheet numbers its sections.
 */
export function Step({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 0 }}>
      <SectionLabel sx={{ lineHeight: 1.35, color: TABLE.ink }}>
        <Box
          component="span"
          sx={{ color: TABLE.accent, fontWeight: 700, fontSize: '0.95rem', mr: 0.6 }}
        >
          {n}.
        </Box>
        {label}
      </SectionLabel>
      {children}
    </Box>
  )
}

/**
 * The mark of the subsystem an action puts its energy on, in the colour of the
 * type beside it: the same silhouette the loadout below draws on that tile,
 * so a button and the tile it will light read as one thing.
 */
export function ActionIcon({ type, className }: { type: SubsystemType; className?: string }) {
  // A Chip positions its icon by the class it clones in, so the class has to reach the SVG.
  return (
    <SubsystemIcon type={type} size={14} color="currentColor" opacity={1} className={className} />
  )
}

/**
 * A segment of a segmented control. Each button carries its own tooltip
 * (including the reason it cannot be pressed) so the row itself stays as
 * narrow as the column, whatever the reason is.
 */
export function Segment({
  label,
  title,
  selected,
  disabled,
  icon,
  onClick,
}: {
  label: string
  title: ReactNode
  selected: boolean
  disabled?: boolean
  /** The subsystem this choice uses, when it uses one. */
  icon?: SubsystemType
  onClick: () => void
}) {
  return (
    <Tooltip title={title} placement="top">
      <Box component="span" sx={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <ToggleButton
          value={label}
          size="small"
          selected={selected}
          disabled={disabled}
          onClick={onClick}
          sx={{
            flex: 1,
            minWidth: 0,
            py: 0.25,
            px: 0.5,
            fontSize: '0.78rem',
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            gap: 0.6,
          }}
        >
          {icon && <ActionIcon type={icon} />}
          {label}
        </ToggleButton>
      </Box>
    </Tooltip>
  )
}

export function SegmentedRow({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ display: 'flex', gap: 0.5, width: '100%', minWidth: 0 }}>
      {children}
    </Box>
  )
}
