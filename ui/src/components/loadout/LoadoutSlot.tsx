/**
 * An empty bay on the loadout, or the tile seated in it. Drop a palette card on
 * it, or click it while a card is selected. The little × pulls the tile back
 * out.
 */
import { useState } from 'react'
import { Box, Tooltip } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AddIcon from '@mui/icons-material/Add'
import type { SlotGroup, SubsystemType } from '@dangerous-inclinations/engine'
import { canInstallInSlot, getSubsystemConfig } from '@dangerous-inclinations/engine'
import { subsystemCategoryColor } from '../../utils/icons'
import { SubsystemIcon } from '../common/SubsystemIcon'
import { FONT_MONO, TABLE } from '../../theme'
import { readDragItem } from './types'

interface LoadoutSlotProps {
  group: SlotGroup
  label: string
  component: SubsystemType | null
  onDrop: (componentType: SubsystemType | null) => void
  onClick: () => void
  /** Something is selected or being dragged that would fit here. */
  isHighlighted?: boolean
  isSelected?: boolean
  size?: number
}

export function LoadoutSlot({
  group,
  label,
  component,
  onDrop,
  onClick,
  isHighlighted = false,
  isSelected = false,
  size = 44,
}: LoadoutSlotProps) {
  const [over, setOver] = useState(false)
  const config = component ? getSubsystemConfig(component) : null

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!over) setOver(true)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const item = readDragItem(e.dataTransfer)
    if (item && canInstallInSlot(item.componentType, group)) onDrop(item.componentType)
  }

  const edge = isSelected || over ? TABLE.accent : isHighlighted ? TABLE.accentDim : TABLE.plateEdge

  return (
    <Tooltip title={config ? `${label}: ${config.name}` : `${label}: empty`}>
      <Box
        onClick={onClick}
        onDragOver={handleDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        data-slot={label}
        sx={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '4px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: `1px ${component ? 'solid' : 'dashed'} ${edge}`,
          ...(component ? { borderTop: `2px solid ${subsystemCategoryColor(component)}` } : null),
          background: component
            ? `linear-gradient(180deg, ${TABLE.plateHi} 0%, ${TABLE.plateSunk} 100%)`
            : over
              ? 'rgba(255,180,69,0.12)'
              : 'rgba(126,165,205,0.04)',
          boxShadow: over || isSelected ? `0 0 0 1px ${TABLE.accentGlow}, 0 0 14px ${TABLE.accentGlow}` : 'none',
          transition: 'border-color 140ms ease, box-shadow 140ms ease, background 140ms ease',
          '&:hover': { borderColor: TABLE.accent },
          '&:hover .di-clear': { opacity: 1 },
        }}
      >
        {component ? (
          <SubsystemIcon type={component} size={size * 0.56} />
        ) : (
          <AddIcon sx={{ fontSize: size * 0.4, color: TABLE.inkFaint }} />
        )}

        <Box
          component="span"
          sx={{
            position: 'absolute',
            bottom: -14,
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: '0.1em',
            color: TABLE.inkFaint,
            pointerEvents: 'none',
          }}
        >
          {label}
        </Box>

        {component && (
          <Box
            className="di-clear"
            onClick={(e) => {
              e.stopPropagation()
              onDrop(null)
            }}
            sx={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 15,
              height: 15,
              borderRadius: '50%',
              bgcolor: TABLE.danger,
              color: '#0b0f14',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 140ms ease',
              '&:hover': { filter: 'brightness(1.15)' },
            }}
          >
            <CloseIcon sx={{ fontSize: 11 }} />
          </Box>
        )}
      </Box>
    </Tooltip>
  )
}
