/**
 * A subsystem tile: a flat printed square seated in a slot.
 *
 * Face-down it is hatched and shows only the slot it sits in and a "?";
 * face-up it shows the system's icon on a plain plate with a hairline edge. A tile learned through a scan
 * carries a small eye badge: it is face-up for you alone. Broken tiles are
 * struck through and go dark.
 *
 * Energy cells are drawn under every tile for every player, face-down or not:
 * at the table the cubes sit on top of the module in the open, and they stay
 * there until their owner's next turn. Using a tile turns it face-up, so
 * energy on a face-down slot means it was powered, not used: two is a half
 * shield, a ballistic rack or a sensor array, four is a full shield, and a gun
 * is dark until it fires. A tile that takes no energy at all prints no cells,
 * and nothing else is ever written under a tile.
 */
import { Box, Tooltip, Typography } from '@mui/material'
import type { SlotKnowledge, SubsystemId, SubsystemType } from '@dangerous-inclinations/engine'
import { getSubsystemConfig } from '@dangerous-inclinations/engine'
import { subsystemCategoryColor } from '../../utils/icons'
import { SubsystemIcon } from './SubsystemIcon'
import { slotLabel, slotShortLabel } from '../../utils/slots'
import { FONT_MONO, TABLE } from '../../theme'
import { EnergyCubes } from './Tokens'

export interface SubsystemTileProps {
  id: SubsystemId
  type: SubsystemType | null
  knownVia?: SlotKnowledge
  isBroken?: boolean | null
  allocatedEnergy: number
  size?: number
  /** Cells to print. Defaults to the system's max energy (0 when unknown). */
  capacity?: number
  onSetEnergy?: (n: number) => void
  onClick?: () => void
  /** Right click on the tile or its cells (the caller calls preventDefault). */
  onContextMenu?: (event: React.MouseEvent) => void
  selected?: boolean
  highlighted?: boolean
  pulse?: boolean
  /** Cubes needed to power the tile: a tick is drawn after that cell. */
  minEnergy?: number
  /**
   * Missiles left in a face-up rack, public once the tile is (RULES §Hidden
   * Information). null on anything that is not a readable missile tile.
   */
  ammo?: number | null
  /** Overrides the built-in tooltip. */
  tooltip?: React.ReactNode
  /** Cell size under the tile. Defaults to a share of the tile. */
  cubeSize?: number
}

export function SubsystemTile({
  id,
  type,
  knownVia = null,
  isBroken,
  allocatedEnergy,
  size = 54,
  capacity,
  onSetEnergy,
  onClick,
  onContextMenu,
  selected,
  highlighted,
  pulse,
  minEnergy,
  ammo,
  tooltip,
  cubeSize,
}: SubsystemTileProps) {
  const config = type ? getSubsystemConfig(type) : null
  const faceDown = type === null
  const cubeCapacity = capacity ?? (config ? config.maxEnergy : 0)
  // A face-down tile still shows the cells that are lit on it.
  const wells = faceDown ? Math.max(allocatedEnergy, 4) : cubeCapacity
  const live = allocatedEnergy > 0 && !isBroken

  const name = config?.name ?? `${slotLabel(id)} · face down`
  const tip =
    tooltip ??
    (faceDown
      ? `${slotLabel(id)}: face down. ${allocatedEnergy} energy on it.`
      : `${name}${knownVia === 'scanned' ? ' (seen by your scan)' : ''}${
          ammo === null || ammo === undefined ? '' : ` · ${ammo} left`
        }${isBroken ? ' · BROKEN' : ''}`)

  // A powered tile is ruled in cream, a named or pickable one in red: edges, never glows.
  const edge =
    selected || highlighted
      ? TABLE.accent
      : isBroken
        ? TABLE.danger
        : live
          ? TABLE.inkSoft
          : TABLE.plateEdge

  // Below this the tile is a badge, not a module: the slot stamp is dropped
  // and the glyph fills it.
  const stamped = size >= 32
  const glyph = stamped ? size * 0.5 : size * 0.58

  return (
    <Box
      onContextMenu={onContextMenu}
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}
    >
      <Tooltip title={tip} placement="top">
        <Box
          onClick={onClick}
          sx={{
            position: 'relative',
            width: size,
            height: size,
            borderRadius: 0,
            boxSizing: 'border-box',
            cursor: onClick ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pt: stamped ? '12px' : 0,
            pb: stamped ? '4px' : 0,
            flexShrink: 0,
            // Face-down is hatched flat, two tones and a hard edge, the way a
            // printed card marks a blank.
            bgcolor: faceDown ? TABLE.faceDown : TABLE.plateHi,
            backgroundImage: faceDown
              ? `repeating-linear-gradient(135deg, ${TABLE.hatch} 0 2px, transparent 2px 6px)`
              : 'none',
            border: `${selected ? 2 : 1}px solid ${edge}`,
            boxShadow: 'none',
            opacity: isBroken ? 0.55 : 1,
            animation: pulse ? 'di-pulse 600ms ease 2' : undefined,
            transition: 'border-color 140ms ease',
            '&:hover': onClick ? { borderColor: TABLE.accent } : undefined,
          }}
        >
          {/* Slot stamp across the top, so the glyph below it is never crowded. */}
          {stamped && (
            <Typography
              sx={{
                position: 'absolute',
                top: 1,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: FONT_MONO,
                fontSize: 11,
                lineHeight: 1,
                letterSpacing: '0.06em',
                color: TABLE.inkFaint,
                pointerEvents: 'none',
              }}
            >
              {slotShortLabel(id)}
            </Typography>
          )}

          {faceDown ? (
            <Typography
              sx={{ fontFamily: FONT_MONO, fontSize: Math.max(13, glyph), fontWeight: 700, lineHeight: 1, color: TABLE.inkSoft }}
            >
              ?
            </Typography>
          ) : (
            <SubsystemIcon type={type} size={glyph} opacity={isBroken ? 0.45 : 0.92} />
          )}

          {/* Category shows as a thin edge, never as the glyph's colour. */}
          {!faceDown && type && (
            <Box
              sx={{
                position: 'absolute',
                left: 3,
                right: 3,
                bottom: 2,
                height: 2,
                bgcolor: subsystemCategoryColor(type),
                opacity: isBroken ? 0.3 : 0.75,
              }}
            />
          )}

          {/* Scanned-only knowledge */}
          {knownVia === 'scanned' && (
            <Box
              sx={{
                position: 'absolute',
                top: -5,
                right: -5,
                width: 15,
                height: 15,
                bgcolor: TABLE.felt,
                color: TABLE.teal,
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${TABLE.teal}`,
              }}
            >
              ◉
            </Box>
          )}

          {/* Broken */}
          {isBroken && (
            <Box
              component="svg"
              viewBox="0 0 100 100"
              sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            >
              <path d="M14 14 L86 86 M86 14 L14 86" stroke={TABLE.danger} strokeWidth={8} strokeLinecap="square" />
            </Box>
          )}
        </Box>
      </Tooltip>

      {/*
        Nothing is ever written under a tile: a tile that takes no energy
        (radiator, compressor) simply prints no cells, and ammo is read off
        the status block, not the loadout.
      */}
      <Box sx={{ minHeight: Math.max(7, Math.round(size * 0.15)) }}>
        <EnergyCubes
          count={allocatedEnergy}
          capacity={wells}
          size={cubeSize ?? Math.max(6, Math.round(size * 0.14))}
          onSet={onSetEnergy}
          disabled={isBroken === true}
          threshold={minEnergy}
        />
      </Box>
    </Box>
  )
}
