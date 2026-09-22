import { Box, Button, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'

import {
  BOT_LOADOUT_TEMPLATES,
  BOT_ROLES,
  HULL_VARIANTS,
  DEFAULT_SHIP_APPEARANCE,
  INSTALLABLE_SUBSYSTEMS,
  canInstallInSlot,
  getSubsystemConfig,
  type BotRole,
  type HullVariant,
  type ShipAppearance,
  type ShipLoadout,
} from '@dangerous-inclinations/engine'
import { SubsystemIcon } from '../components/common/SubsystemIcon'
import { TABLE, FONT_MONO } from '../theme'
import { MODULE_NOTES, MOUNTS, moduleAt, setModule, type MountId, type ShipConfig } from './config'

const DEFAULT_ROLE: BotRole = 'hauler'
const DEFAULT_VARIANT: HullVariant = 'tanky'

/** What each choice buys, in the words the loadout itself would use. */
const ROLE_NOTE: Record<BotRole, string> = {
  interceptor: 'Sensor array: scans, and the Intercept and Survey cards that need one',
  hunter: 'Railgun: the long shot down your own ring, for a Destroy card',
  hauler: 'Fuel compressor: jumps cost 1 fuel, but you can never scan',
}
const VARIANT_NOTE: Record<HullVariant, string> = {
  tanky: 'A second shield, and the one gun a Destroy card needs',
  aggressive: 'A second gun, and the radiator that volley needs',
}

/**
 * The hunter is the one tanky hull that is not two walls: two powered shields
 * are eight heat a turn and a hunter that cooks cannot fire, so its fourth
 * subsystem is a second radiator (see `ai/behaviors/loadout.ts`).
 */
const variantNote = (role: BotRole, variant: HullVariant): string =>
  role === 'hunter' && variant === 'tanky'
    ? 'A second radiator: one shield you can keep up beside the railgun'
    : VARIANT_NOTE[variant]

const templateFor = (role: BotRole, variant: HullVariant): ShipLoadout =>
  structuredClone(BOT_LOADOUT_TEMPLATES[`${role}-${variant}`])

/** Which profile this loadout is, or null once it has been edited into its own. */
function archetypeOf(loadout: ShipLoadout): { role: BotRole; variant: HullVariant } | null {
  const same = (a: ShipLoadout, b: ShipLoadout) => JSON.stringify(a) === JSON.stringify(b)
  for (const role of BOT_ROLES) {
    for (const variant of HULL_VARIANTS) {
      if (same(loadout, BOT_LOADOUT_TEMPLATES[`${role}-${variant}`])) return { role, variant }
    }
  }
  return null
}

function ArchetypeChoice<T extends string>({
  label,
  options,
  value,
  describe,
  onChange,
  disabled,
}: {
  label: string
  options: readonly T[]
  value: T | null
  describe: (option: T) => string
  onChange: (option: T) => void
  disabled: boolean
}) {
  return (
    <Box sx={{ mt: 1, mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: TABLE.inkSoft, display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={value}
        disabled={disabled}
        onChange={(_e, next: T | null) => next && onChange(next)}
      >
        {options.map(option => (
          <ToggleButton
            key={option}
            value={option}
            title={describe(option)}
            sx={{ textTransform: 'capitalize', fontFamily: FONT_MONO, fontSize: '0.78rem' }}
          >
            {option}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}

export function SystemControls({
  config,
  selected,
  onSelect,
  onChange,
  disabled,
}: {
  config: ShipConfig
  selected: MountId
  onSelect: (id: MountId) => void
  onChange: (loadout: ShipLoadout) => void
  disabled: boolean
}) {
  const mount = MOUNTS.find(m => m.id === selected)!
  const archetype = archetypeOf(config.loadout)
  const current = moduleAt(config, selected)
  const detail = current ? getSubsystemConfig(current) : null
  return (
    <>
      <Typography variant="overline" color="text.secondary">
        01 / Mission profile (presets)
      </Typography>
      {/*
        Two decisions, not six loadouts. What the forward slot is for is the plan
        you came with (a gun, eyes or legs, one for each two-point card) and
        how the four side slots are spent is taste. As a matrix the six cells
        all read "tanky" or "aggressive" and said nothing; as two rows each
        button names its own choice.
      */}
      <ArchetypeChoice
        label="Primary role"
        options={BOT_ROLES}
        value={archetype?.role ?? null}
        describe={role => ROLE_NOTE[role]}
        onChange={role => onChange(templateFor(role, archetype?.variant ?? DEFAULT_VARIANT))}
        disabled={disabled}
      />
      <ArchetypeChoice
        label="Secondary role"
        options={HULL_VARIANTS}
        value={archetype?.variant ?? null}
        describe={variant => variantNote(archetype?.role ?? DEFAULT_ROLE, variant)}
        onChange={variant => onChange(templateFor(archetype?.role ?? DEFAULT_ROLE, variant))}
        disabled={disabled}
      />
      {archetype === null && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft, display: 'block', mb: 2.5 }}>
          Loadout of your own: pick a profile to start from, or leave it.
        </Typography>
      )}

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
            title={MODULE_NOTES[type]}
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
            : `Energy ${detail.minEnergy}–${detail.maxEnergy} · its cubes are heat at every check`}
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
