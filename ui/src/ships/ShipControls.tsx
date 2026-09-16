import { Box, Button, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { Fragment } from 'react'
import {
  BOT_LOADOUT_TEMPLATES,
  BOT_ROLES,
  HULL_VARIANTS,
  DEFAULT_SHIP_APPEARANCE,
  INSTALLABLE_SUBSYSTEMS,
  canInstallInSlot,
  getSubsystemConfig,
  type ShipAppearance,
  type ShipLoadout,
} from '@dangerous-inclinations/engine'
import { SubsystemIcon } from '../components/common/SubsystemIcon'
import { TABLE, FONT_MONO } from '../theme'
import {
  MODULE_NOTES,
  MOUNTS,
  moduleAt,
  setModule,
  type MountId,
  type WorkshopConfig,
} from './config'

export function SystemControls({
  config,
  selected,
  onSelect,
  onChange,
  disabled,
}: {
  config: WorkshopConfig
  selected: MountId
  onSelect: (id: MountId) => void
  onChange: (loadout: ShipLoadout) => void
  disabled: boolean
}) {
  const mount = MOUNTS.find(m => m.id === selected)!
  const current = moduleAt(config, selected)
  const detail = current ? getSubsystemConfig(current) : null
  return (
    <>
      <Typography variant="overline" color="text.secondary">
        01 / Mission profile
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 0.5, mt: 1, mb: 2.5 }}>
        <Box />
        {HULL_VARIANTS.map(v => (
          <Typography
            key={v}
            variant="caption"
            color="text.secondary"
            sx={{ textAlign: 'center', textTransform: 'capitalize' }}
          >
            {v}
          </Typography>
        ))}
        {BOT_ROLES.map(role => (
          <Fragment key={role}>
            <Typography
              variant="caption"
              sx={{ alignSelf: 'center', pr: 1, textTransform: 'capitalize' }}
            >
              {role}
            </Typography>
            {HULL_VARIANTS.map(variant => {
              const id = `${role}-${variant}` as const
              return (
                <Button
                  key={id}
                  disabled={disabled}
                  variant="outlined"
                  aria-label={`${role}, ${variant}`}
                  aria-pressed={
                    JSON.stringify(config.loadout) === JSON.stringify(BOT_LOADOUT_TEMPLATES[id])
                  }
                  onClick={() => onChange(structuredClone(BOT_LOADOUT_TEMPLATES[id]))}
                  sx={{ minWidth: 0, px: 0.5, textTransform: 'capitalize' }}
                >
                  {variant}
                </Button>
              )
            })}
          </Fragment>
        ))}
      </Box>
      <Typography variant="overline" color="text.secondary">
        02 / Attachment points
      </Typography>
      <Box sx={{ display: 'grid', gap: 0.75, mt: 1 }}>
        {MOUNTS.map(m => {
          const type = moduleAt(config, m.id)
          return (
            <Button
              key={m.id}
              onClick={() => onSelect(m.id)}
              aria-pressed={selected === m.id}
              aria-label={`${m.label}: ${type ? getSubsystemConfig(type).name : 'Empty mount'}`}
              variant="outlined"
              sx={{
                justifyContent: 'flex-start',
                gap: 1.5,
                px: 1.5,
                py: 1,
                minHeight: 56,
                color: TABLE.ink,
                borderColor: selected === m.id ? TABLE.accent : TABLE.plateEdge,
                bgcolor: selected === m.id ? '#ddaa7810' : TABLE.plateHi,
              }}
            >
              <Box
                component="span"
                sx={{
                  fontFamily: FONT_MONO,
                  color: selected === m.id ? TABLE.accent : TABLE.inkSoft,
                }}
              >
                {m.short}
              </Box>
              {type && <SubsystemIcon type={type} size={25} />}
              <Box sx={{ textAlign: 'left' }}>
                <Typography
                  component="span"
                  display="block"
                  variant="caption"
                  color="text.secondary"
                >
                  {m.label}
                </Typography>
                <Typography component="span" variant="body2">
                  {type ? getSubsystemConfig(type).name : 'Empty mount'}
                </Typography>
              </Box>
            </Button>
          )
        })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
        <Typography variant="overline" color="text.secondary">
          Refit {mount.short}
        </Typography>
        <Button
          size="small"
          disabled={disabled || !current}
          onClick={() => onChange(setModule(config, selected, null).loadout)}
        >
          Remove module
        </Button>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75, mt: 1 }}>
        {INSTALLABLE_SUBSYSTEMS.filter(t => canInstallInSlot(t, mount.group)).map(type => (
          <Button
            key={type}
            disabled={disabled}
            aria-pressed={type === current}
            aria-label={`Fit ${getSubsystemConfig(type).name}`}
            variant="outlined"
            onClick={() => onChange(setModule(config, selected, type).loadout)}
            sx={{
              flexDirection: 'column',
              gap: 1,
              fontSize: 12,
              lineHeight: 1.3,
              minHeight: 84,
              p: 1,
              borderColor: type === current ? TABLE.accent : TABLE.plateEdge,
            }}
          >
            <SubsystemIcon type={type} size={27} />
            {getSubsystemConfig(type).name}
          </Button>
        ))}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.7 }}>
        {current ? MODULE_NOTES[current] : 'Choose a compatible system for this mount.'}
      </Typography>
      {detail && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: TABLE.accent }}>
          {detail.maxEnergy === 0
            ? 'Passive · no energy required'
            : `Energy ${detail.minEnergy}–${detail.maxEnergy} · ${detail.generatesHeatOnUse ? 'generates heat when used' : 'no heat on use'}`}
        </Typography>
      )}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 3, pt: 2, borderTop: `1px solid ${TABLE.line}` }}
      >
        Built into every hull: main drive, maneuvering thrusters, and fuel scoop.
      </Typography>
    </>
  )
}

/** Industrial swatches, light to dark. Both defaults are on the row. */
const PAINTS = ['#aab4b2', '#dad7c8', '#b6a27b', '#926b51', '#647776', '#4c5b56', '#344149']

const CHIP = {
  minWidth: 28,
  width: 28,
  height: 28,
  p: 0,
  borderRadius: '50%',
  border: '3px solid #1b2225',
}

/**
 * One colour, chosen once: the swatches and the custom picker are the same
 * control, and the row is labelled instead of the section above it.
 */
function PaintRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (color: string) => void
  disabled: boolean
}) {
  const custom = !PAINTS.includes(value.toLowerCase())
  const ring = (selected: boolean) => (selected ? `2px solid ${TABLE.accent}` : '1px solid #53605b')
  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="caption" sx={{ fontFamily: FONT_MONO, color: TABLE.inkSoft }}>
          {value.toUpperCase()}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.1, mt: 1 }}>
        {PAINTS.map(paint => (
          <Button
            key={paint}
            disabled={disabled}
            aria-label={`${label}: ${paint}`}
            aria-pressed={value.toLowerCase() === paint}
            onClick={() => onChange(paint)}
            sx={{
              ...CHIP,
              bgcolor: paint,
              outline: ring(value.toLowerCase() === paint),
              '&:hover': { bgcolor: paint, outline: `2px solid ${TABLE.accent}` },
            }}
          />
        ))}
        <Box
          component="label"
          title={`${label}: any colour`}
          sx={{
            ...CHIP,
            position: 'relative',
            overflow: 'hidden',
            cursor: disabled ? 'default' : 'pointer',
            outline: ring(custom),
            background: custom
              ? value
              : 'conic-gradient(#c0563f, #c9a13f, #7fae5c, #4f9bb0, #6e6fb4, #b1588f, #c0563f)',
          }}
        >
          <input
            type="color"
            aria-label={`${label}: any colour`}
            disabled={disabled}
            value={value}
            onChange={event => onChange(event.target.value)}
            style={{
              position: 'absolute',
              inset: -6,
              width: 60,
              height: 60,
              opacity: 0,
              padding: 0,
              border: 0,
              cursor: 'inherit',
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}

export function AppearanceControls({
  value,
  onChange,
  disabled,
}: {
  value: ShipAppearance
  onChange: (a: ShipAppearance) => void
  disabled: boolean
}) {
  const patch = (p: Partial<ShipAppearance>) => onChange({ ...value, ...p })
  return (
    <Box component="fieldset" disabled={disabled} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary">
        01 / Paint
      </Typography>
      <PaintRow
        label="Hull"
        value={value.paint}
        disabled={disabled}
        onChange={paint => patch({ paint })}
      />
      <PaintRow
        label="Trim and panels"
        value={value.secondaryPaint}
        disabled={disabled}
        onChange={secondaryPaint => patch({ secondaryPaint })}
      />
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        02 / Finish
      </Typography>
      <ToggleButtonGroup
        fullWidth
        exclusive
        value={value.finish}
        onChange={(_, finish) => finish && patch({ finish })}
        sx={{ mt: 1 }}
      >
        <ToggleButton value="matte" disabled={disabled}>
          Matte paint
        </ToggleButton>
        <ToggleButton value="metal" disabled={disabled}>
          Exposed metal
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        03 / Hull profile
      </Typography>
      {(
        [
          ['armorRelief', 'Armor relief'],
          ['spineHeight', 'Dorsal profile'],
        ] as const
      ).map(([key, label]) => (
        <Box key={key} sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2">{label}</Typography>
            <Typography variant="caption" color="primary">
              {Math.round(value[key] * 100)}%
            </Typography>
          </Box>
          <Slider
            aria-label={label}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            value={value[key]}
            onChange={(_, n) => patch({ [key]: n as number })}
          />
        </Box>
      ))}
      <Button
        fullWidth
        disabled={disabled}
        variant="outlined"
        onClick={() => onChange({ ...DEFAULT_SHIP_APPEARANCE })}
        sx={{ mt: 3 }}
      >
        Reset appearance
      </Button>
    </Box>
  )
}
