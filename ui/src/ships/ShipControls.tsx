import { useState, type ReactNode } from 'react'
import { Box, Button, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'

import {
  BOT_PRESET_LOADOUTS,
  PRESETS_BY_ROLE,
  PRESET_NAMES,
  DEFAULT_SHIP_APPEARANCE,
  INSTALLABLE_SUBSYSTEMS,
  LIVERIES,
  canInstallInSlot,
  getSubsystemConfig,
  presetRole,
  type BotPresetId,
  type BotRole,
  type Livery,
  type ShipAppearance,
  type ShipLoadout,
} from '@dangerous-inclinations/engine'
import { SubsystemIcon } from '../components/common/SubsystemIcon'
import { TABLE, FONT_MONO } from '../theme'
import { MODULE_NOTES, MOUNTS, moduleAt, setModule, type MountId, type ShipConfig } from './config'

const DEFAULT_ROLE: BotRole = 'hauler'

/** The order the roles are offered in, the way a table says them. */
const ROLE_ORDER: readonly BotRole[] = ['hunter', 'interceptor', 'hauler']

/** The role is the plan you came with: one for each two-point card. */
const ROLE_NAME: Record<BotRole, string> = {
  hunter: 'Hunter',
  interceptor: 'Interceptor',
  hauler: 'Hauler',
}

/** What each preset carries, what it is for, and the card that asks for it. */
const PRESET_NOTE: Record<BotPresetId, string> = {
  gunship: 'Railgun, laser and rack: a shot through shields, and point defence',
  corsair: 'Missile bow, laser and rack: run carriers down, for Piracy',
  striker: 'Railgun, missiles and laser: hits from across the well, for Salvage',
  warden: 'Disruptor bow and two plasma: strip a wall, break what is behind, for Escort',
  raider: 'Plasma and disruptor: strip a wall, then break what is behind it',
  jammer: "Two disruptors: break a carrier's engines, for Piracy",
  picket: 'Two launchers: hits from across the well, for Salvage',
  sentry: 'Laser and rack: ride beside a carrier with point defence, for Escort',
  freighter: 'Two shields and a laser: the safe cargo run',
  privateer: 'Two shields and plasma: take the fight to a carrier, for Piracy',
  smuggler: 'Two launchers: hits from across the well, for Salvage',
  ghost: "Two disruptors and two radiators: break a pursuer's engines, for Tanker",
}

const templateFor = (preset: BotPresetId): ShipLoadout =>
  structuredClone(BOT_PRESET_LOADOUTS[preset])

const same = (a: ShipLoadout, b: ShipLoadout) => JSON.stringify(a) === JSON.stringify(b)

/** Which preset this loadout is, or null once it has been edited into its own. */
function presetOf(loadout: ShipLoadout): BotPresetId | null {
  const ids = Object.keys(BOT_PRESET_LOADOUTS) as BotPresetId[]
  return ids.find(id => same(loadout, BOT_PRESET_LOADOUTS[id])) ?? null
}

/**
 * The role a loadout starts under: its preset's, or for a loadout of its own
 * the first role with a preset of the same bow. Only the starting value: from
 * then on a loadout no preset matches keeps the role last chosen.
 */
function startingRole(loadout: ShipLoadout): BotRole {
  const preset = presetOf(loadout)
  if (preset) return presetRole(preset)
  const bow = loadout.forwardSlots[0]
  return (
    ROLE_ORDER.find(role =>
      PRESETS_BY_ROLE[role].some(id => BOT_PRESET_LOADOUTS[id].forwardSlots[0] === bow)
    ) ?? DEFAULT_ROLE
  )
}

/** A list of named options, each with an optional one-line note; a row when `horizontal`. */
function NotedChoice<T extends string>({
  label,
  options,
  name,
  note,
  value,
  onChange,
  disabled,
  horizontal = false,
}: {
  label: string
  options: readonly T[]
  name: (option: T) => string
  note?: (option: T) => string
  value: T | null
  onChange: (option: T) => void
  disabled: boolean
  horizontal?: boolean
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: TABLE.inkSoft, display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        orientation={horizontal ? 'horizontal' : 'vertical'}
        size="small"
        value={value}
        disabled={disabled}
        onChange={(_e, next: T | null) => next && onChange(next)}
      >
        {options.map(option => (
          <ToggleButton
            key={option}
            value={option}
            sx={{
              display: 'block',
              textAlign: horizontal ? 'center' : 'left',
              textTransform: 'none',
              px: 1.5,
              py: 0.75,
            }}
          >
            <Box
              component="span"
              sx={{ display: 'block', fontFamily: FONT_MONO, fontSize: '0.78rem' }}
            >
              {name(option)}
            </Box>
            {note && (
              <Box component="span" sx={{ display: 'block', fontSize: '0.72rem', opacity: 0.75 }}>
                {note(option)}
              </Box>
            )}
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
  const preset = presetOf(config.loadout)
  // A role is a list of presets, not a bow: a preset's role is the list it
  // is in, and a loadout of your own keeps the role of the last preset.
  const [lastRole, setLastRole] = useState(() => startingRole(config.loadout))
  const role = preset ? presetRole(preset) : lastRole
  if (role !== lastRole) setLastRole(role)
  const current = moduleAt(config, selected)
  const detail = current ? getSubsystemConfig(current) : null
  return (
    <>
      <Typography variant="overline" color="text.secondary">
        01 / Mission profile (presets)
      </Typography>
      {/*
        Two decisions. The role is the plan you came with, one for each
        two-point card; the preset is the hull, and each role has three, named
        for the secondary that asks for it.
      */}
      <Box sx={{ mt: 1 }}>
        <NotedChoice
          label="Role"
          options={ROLE_ORDER}
          name={r => ROLE_NAME[r]}
          horizontal
          value={role}
          onChange={r => onChange(templateFor(PRESETS_BY_ROLE[r][0]))}
          disabled={disabled}
        />
        <NotedChoice
          label="Preset"
          options={PRESETS_BY_ROLE[role]}
          name={p => PRESET_NAMES[p]}
          note={p => PRESET_NOTE[p]}
          value={preset}
          onChange={next => onChange(templateFor(next))}
          disabled={disabled}
        />
      </Box>
      {preset === null && (
        <Typography variant="caption" sx={{ color: TABLE.inkSoft, display: 'block', mb: 2.5 }}>
          Loadout of your own: pick a preset to start from, or leave it.
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
                borderColor: TABLE.plateEdge,
                bgcolor: TABLE.plateHi,
              }}
            >
              {/* Pressed, the theme inverts the button; everything inside follows its colour. */}
              <Box
                component="span"
                sx={{
                  fontFamily: FONT_MONO,
                  color: selected === m.id ? 'inherit' : TABLE.inkSoft,
                }}
              >
                {m.short}
              </Box>
              {type && <SubsystemIcon type={type} size={25} color="currentColor" />}
              <Box sx={{ textAlign: 'left' }}>
                <Typography
                  component="span"
                  display="block"
                  variant="caption"
                  sx={{ color: selected === m.id ? 'inherit' : 'text.secondary', opacity: 0.8 }}
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
              borderColor: TABLE.plateEdge,
            }}
          >
            <SubsystemIcon type={type} size={27} color="currentColor" />
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
/** Primers and enamels for the hull and its trim. */
const PAINTS = ['#d6cfbd', '#ece4d0', '#9aa2a2', '#6b6a66', '#3b4046', '#8f6d4a', '#2f4a52']

const CHIP = {
  minWidth: 28,
  width: 28,
  height: 28,
  p: 0,
  borderRadius: 0,
  border: `3px solid ${TABLE.plate}`,
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
  swatches = PAINTS,
}: {
  label: string
  value: string
  onChange: (color: string) => void
  disabled: boolean
  swatches?: string[]
}) {
  const custom = !swatches.includes(value.toLowerCase())
  const ring = (selected: boolean) =>
    selected ? `2px solid ${TABLE.ink}` : `1px solid ${TABLE.plateEdge}`
  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="caption" sx={{ fontFamily: FONT_MONO, color: TABLE.inkSoft }}>
          {value.toUpperCase()}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.1, mt: 1 }}>
        {swatches.map(paint => (
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
              '&:hover': { bgcolor: paint, outline: `2px solid ${TABLE.ink}` },
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

const LIVERY_NAME: Record<Livery, string> = {
  band: 'Band',
  split: 'Split',
  chevron: 'Chevron',
  stern: 'Stern',
  spine: 'Spine',
}

/** The hull's profile, masked the way `model.ts` masks it, in the paints chosen. */
const LIVERY_MASK: Record<Livery, ReactNode> = {
  band: (
    <>
      <path d="M24 23 L35 7 L44 7 L33 23 Z" />
      <path d="M36 23 L47 7 L48.5 7 L37.5 23 Z" />
    </>
  ),
  split: <path d="M4 16 L62 16 L58 18 L46 23 L10 23 L4 17 Z" />,
  chevron: <path d="M44 7 L50 7 L56 15 L50 23 L44 23 L50 15 Z" />,
  stern: (
    <>
      <path d="M7 10 L11 7 L14 7 L14 23 L11 23 L7 20 Z" />
      <rect x="16" y="7" width="2" height="16" />
    </>
  ),
  spine: <rect x="10" y="7" width="36" height="3" />,
}
const HULL_PROFILE = 'M4 13 L10 7 L46 7 L58 12 L62 15 L58 18 L46 23 L10 23 L4 17 Z'

function LiveryMark({ livery, paint, ink }: { livery: Livery; paint: string; ink: string }) {
  const clip = `livery-${livery}`
  return (
    <Box component="svg" viewBox="0 0 66 30" aria-hidden sx={{ width: '100%', display: 'block' }}>
      <defs>
        <clipPath id={clip}>
          <path d={HULL_PROFILE} />
        </clipPath>
      </defs>
      <path d={HULL_PROFILE} fill={paint} />
      <g clipPath={`url(#${clip})`} fill={ink}>
        {LIVERY_MASK[livery]}
      </g>
      <path d={HULL_PROFILE} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={0.8} />
    </Box>
  )
}

export function AppearanceControls({
  value,
  onChange,
  disabled,
  seatColor,
}: {
  value: ShipAppearance
  onChange: (a: ShipAppearance) => void
  disabled: boolean
  /** The livery's ink: never chosen, always the seat's. */
  seatColor: string
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
        02 / Livery
      </Typography>
      <Typography variant="body2" sx={{ color: TABLE.inkSoft }}>
        Sprayed in your seat's colour, the same as your token on the board.
      </Typography>
      <Box
        role="radiogroup"
        aria-label="Livery"
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 0.75, mt: 1 }}
      >
        {LIVERIES.map(livery => {
          const on = value.livery === livery
          return (
            <Button
              key={livery}
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => patch({ livery })}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 0.5,
                p: 0.75,
                border: `1px solid ${on ? TABLE.selected : TABLE.plateEdge}`,
                bgcolor: on ? TABLE.selected : TABLE.felt,
                color: on ? TABLE.onSelected : TABLE.inkSoft,
                '&:hover': { bgcolor: on ? TABLE.selected : TABLE.plateHi },
              }}
            >
              <LiveryMark livery={livery} paint={value.paint} ink={seatColor} />
              <Box component="span" sx={{ fontSize: '0.75rem' }}>
                {LIVERY_NAME[livery]}
              </Box>
            </Button>
          )
        })}
      </Box>
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
