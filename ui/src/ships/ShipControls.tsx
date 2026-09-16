import { Box, Button, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import {
  BOT_LOADOUT_TEMPLATES,
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
      <Box
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, mt: 1, mb: 2.5 }}
      >
        {(['hunter', 'raider', 'hauler', 'scout'] as const).map(id => (
          <Button
            key={id}
            disabled={disabled}
            variant="outlined"
            aria-pressed={
              JSON.stringify(config.loadout) === JSON.stringify(BOT_LOADOUT_TEMPLATES[id])
            }
            onClick={() => onChange(structuredClone(BOT_LOADOUT_TEMPLATES[id]))}
            sx={{ minWidth: 0, px: 0.5, textTransform: 'capitalize' }}
          >
            {id}
          </Button>
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

const PAINTS = [
  '#aab4b2',
  '#dad7c8',
  '#4c5b56',
  '#344149',
  '#926b51',
  '#6a737a',
  '#37434e',
  '#b6a27b',
]
export function AppearanceControls({
  value,
  onChange,
  accent,
  disabled,
}: {
  value: ShipAppearance
  onChange: (a: ShipAppearance) => void
  accent: string
  disabled: boolean
}) {
  const patch = (p: Partial<ShipAppearance>) => onChange({ ...value, ...p })
  return (
    <Box component="fieldset" disabled={disabled} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary">
        01 / Hull finish
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.3, my: 2 }}>
        {PAINTS.map(paint => (
          <Button
            key={paint}
            disabled={disabled}
            aria-label={`Hull paint ${paint}`}
            aria-pressed={value.paint === paint}
            onClick={() => patch({ paint })}
            sx={{
              bgcolor: paint,
              minWidth: 30,
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '3px solid #1b2225',
              outline: value.paint === paint ? `1px solid ${TABLE.accent}` : '1px solid #53605b',
              '&:hover': { bgcolor: paint, outline: `2px solid ${TABLE.accent}` },
            }}
          />
        ))}
      </Box>
      {(['paint', 'secondaryPaint'] as const).map(key => (
        <Box
          component="label"
          key={key}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            my: 2,
            fontSize: 14,
          }}
        >
          {key === 'paint' ? 'Hull paint' : 'Secondary paint'}
          <input
            type="color"
            aria-label={key === 'paint' ? 'Custom hull paint' : 'Secondary paint'}
            value={value[key]}
            onChange={e => patch({ [key]: e.target.value })}
            style={{
              height: 32,
              width: 50,
              padding: 2,
              border: '1px solid #59665e',
              background: 'transparent',
            }}
          />
        </Box>
      ))}
      <Typography variant="caption" color="text.secondary">
        Livery
      </Typography>
      <ToggleButtonGroup
        fullWidth
        exclusive
        value={value.livery}
        onChange={(_, livery) => livery && patch({ livery })}
        sx={{ mt: 1, mb: 2 }}
      >
        {(['panels', 'bands', 'split'] as const).map(v => (
          <ToggleButton key={v} value={v} disabled={disabled}>
            {v}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <ToggleButtonGroup
        fullWidth
        exclusive
        value={value.finish}
        onChange={(_, finish) => finish && patch({ finish })}
      >
        <ToggleButton value="matte" disabled={disabled}>
          Matte paint
        </ToggleButton>
        <ToggleButton value="metal" disabled={disabled}>
          Exposed metal
        </ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        02 / Hull details
      </Typography>
      {(
        [
          ['armorRelief', 'Armor relief'],
          ['spineHeight', 'Dorsal profile'],
          ['wear', 'Weathering'],
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
      <Box
        sx={{
          mt: 2,
          p: 1.5,
          bgcolor: TABLE.plateSunk,
          border: `1px solid ${TABLE.plateEdge}`,
          borderRadius: 1,
        }}
      >
        <Typography variant="overline" color="text.secondary">
          Player identification · fixed
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.75 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              bgcolor: accent,
              border: '2px solid #e0e3db',
              borderRadius: 0.5,
            }}
          />
          <Typography variant="body2">Your seat color stays on the hull markings.</Typography>
        </Box>
      </Box>
      <Button
        fullWidth
        disabled={disabled}
        variant="outlined"
        onClick={() => onChange({ ...DEFAULT_SHIP_APPEARANCE })}
        sx={{ mt: 2 }}
      >
        Reset appearance
      </Button>
    </Box>
  )
}
