/**
 * A tile in the palette. Drag it onto a slot on the loadout, or click it and then
 * click the slot — both work, because at the table you would just pick the
 * chit up.
 */
import { Box, Tooltip, Typography } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  FORWARD_SLOT_COUNT,
  SIDE_SLOT_COUNT,
  getSubsystemConfig,
} from '@dangerous-inclinations/engine'
import { CATEGORY_LABEL, subsystemCategory, subsystemCategoryColor } from '../../utils/icons'
import { SubsystemIcon } from '../common/SubsystemIcon'
import { FONT_MONO, TABLE } from '../../theme'
import { DRAG_MIME, type SlotType } from './types'

interface ComponentCardProps {
  componentType: SubsystemType
  slotType: SlotType
  onDragStart: () => void
  onDragEnd: () => void
  onClick: () => void
  isSelected?: boolean
  installCount?: number
}

export function ComponentCard({
  componentType,
  slotType,
  onDragStart,
  onDragEnd,
  onClick,
  isSelected = false,
  installCount = 0,
}: ComponentCardProps) {
  const config = getSubsystemConfig(componentType)
  // Repeats are allowed: a tile is only "used up" once every slot it fits holds one.
  const max =
    slotType === 'forward'
      ? FORWARD_SLOT_COUNT
      : slotType === 'side'
        ? SIDE_SLOT_COUNT
        : FORWARD_SLOT_COUNT + SIDE_SLOT_COUNT
  const exhausted = installCount >= max

  const handleDragStart = (e: React.DragEvent) => {
    const payload = JSON.stringify({ componentType, slotType })
    e.dataTransfer.setData(DRAG_MIME, payload)
    e.dataTransfer.setData('text/plain', payload)
    e.dataTransfer.effectAllowed = 'copy'
    onDragStart()
  }

  const energy = config.maxEnergy === 0 ? 'passive' : `${config.minEnergy}–${config.maxEnergy}⚡`

  return (
    <Tooltip
      title={`${config.name} · ${CATEGORY_LABEL[subsystemCategory(componentType)]} · ${energy}${''}${config.weaponStats ? ` · ${config.weaponStats.damage} damage` : ''}`}
    >
      <Box
        draggable
        onDragStart={handleDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        sx={{
          position: 'relative',
          width: 84,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.4,
          px: 0.5,
          py: 0.75,
          borderRadius: 1,
          cursor: 'grab',
          userSelect: 'none',
          background: `linear-gradient(180deg, ${TABLE.plateHi} 0%, ${TABLE.plateSunk} 100%)`,
          border: `1px solid ${isSelected ? TABLE.accent : TABLE.plateEdge}`,
          borderTop: `2px solid ${subsystemCategoryColor(componentType)}`,
          boxShadow: isSelected
            ? `0 0 0 1px ${TABLE.accentGlow}, 0 0 14px ${TABLE.accentGlow}`
            : 'none',
          opacity: exhausted ? 0.42 : 1,
          transition: 'border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
          '&:hover': { borderColor: TABLE.accent },
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <SubsystemIcon type={componentType} size={28} />
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.78rem',
            lineHeight: 1.15,
            textAlign: 'center',
            color: TABLE.ink,
          }}
        >
          {config.name}
        </Typography>
        <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.75rem', color: TABLE.inkFaint }}>
          {energy}
        </Typography>
        {installCount > 0 && (
          <Box
            sx={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 17,
              height: 17,
              px: '3px',
              borderRadius: '9px',
              bgcolor: TABLE.accent,
              color: '#12181f',
              fontFamily: FONT_MONO,
              fontSize: '0.75rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 10px ${TABLE.accentGlow}`,
            }}
          >
            {installCount}
          </Box>
        )}
      </Box>
    </Tooltip>
  )
}
