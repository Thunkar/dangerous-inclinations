/**
 * The controls the table tools are built from, in the press's idiom: black
 * rules, solid blocks, red for what is chosen.
 *
 * These are for a phone propped against the box while somebody else is taking
 * their turn: every target is at least 44px, nothing needs a keyboard, and a
 * number is changed by pressing a button rather than by typing into a field
 * that the browser will then try to autocomplete.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { FONT_DISPLAY, PRESS } from '../../design/press'

const TAP = 44

const CAPS = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
} as const

/** A sheet with a heavy black edge: the frame every tool sits in. */
export function Plate({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      sx={[
        { p: { xs: 2, sm: 3 }, border: `4px solid ${PRESS.ink}`, bgcolor: PRESS.paper },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  )
}

export function Label({ children, color = PRESS.ink }: { children: ReactNode; color?: string }) {
  return <Box sx={{ ...CAPS, fontSize: '0.9rem', lineHeight: 1.2, color }}>{children}</Box>
}

/** A labelled control that stacks on a narrow screen. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Label>{label}</Label>
      {children}
    </Box>
  )
}

/**
 * A number with a button either side. `wrap` is for a sector, which is on a
 * ring and therefore has no ends. `editable` makes the number a field that
 * opens the phone's number pad, for jumping straight to a sector rather than
 * pressing + a dozen times.
 */
export function Stepper({
  value,
  min,
  max,
  onChange,
  wrap = false,
  width = 64,
  label,
  editable = false,
}: {
  value: number
  min: number
  max: number
  onChange: (next: number) => void
  wrap?: boolean
  width?: number
  /** What the number is, for a screen reader. */
  label?: string
  editable?: boolean
}) {
  const step = (delta: number) => {
    const span = max - min + 1
    const next = wrap ? min + ((((value - min + delta) % span) + span) % span) : value + delta
    if (next < min || next > max) return
    onChange(next)
  }
  const atMin = !wrap && value <= min
  const atMax = !wrap && value >= max

  return (
    <Box sx={{ display: 'flex', alignItems: 'stretch', height: TAP }}>
      <StepButton sign="−" what={label} onClick={() => step(-1)} disabled={atMin} />
      {editable ? (
        <NumberField
          value={value}
          min={min}
          max={max}
          onChange={onChange}
          label={label}
          width={width}
        />
      ) : (
        <Box
          aria-live="polite"
          sx={{
            minWidth: width,
            px: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: `3px solid ${PRESS.ink}`,
            borderBottom: `3px solid ${PRESS.ink}`,
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: '1.6rem',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: PRESS.ink,
          }}
        >
          {value}
        </Box>
      )}
      <StepButton sign="+" what={label} onClick={() => step(1)} disabled={atMax} />
    </Box>
  )
}

/** The number in the middle of a stepper, typed rather than stepped. */
function NumberField({
  value,
  min,
  max,
  onChange,
  label,
  width,
}: {
  value: number
  min: number
  max: number
  onChange: (next: number) => void
  label?: string
  width: number
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <Box
      component="input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={text}
      onFocus={event => event.currentTarget.select()}
      onChange={event => {
        const raw = event.currentTarget.value.replace(/[^0-9]/g, '').slice(0, 2)
        setText(raw)
        const n = Number(raw)
        if (raw !== '' && n >= min && n <= max) onChange(n)
      }}
      onBlur={() => setText(String(value))}
      sx={{
        width,
        minWidth: width,
        px: 1,
        border: 'none',
        borderTop: `3px solid ${PRESS.ink}`,
        borderBottom: `3px solid ${PRESS.ink}`,
        borderRadius: 0,
        bgcolor: PRESS.paper,
        textAlign: 'center',
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: '1.6rem',
        lineHeight: 1,
        color: PRESS.ink,
        outline: 'none',
        '&:focus': { bgcolor: '#fff' },
      }}
    />
  )
}

function StepButton({
  sign,
  what,
  onClick,
  disabled,
}: {
  sign: '−' | '+'
  what?: string
  onClick: () => void
  disabled: boolean
}) {
  const verb = sign === '−' ? 'decrease' : 'increase'
  return (
    <Box
      component="button"
      type="button"
      aria-label={what ? `${verb} ${what}` : verb}
      onClick={onClick}
      disabled={disabled}
      sx={{
        width: TAP,
        border: `3px solid ${PRESS.ink}`,
        bgcolor: disabled ? 'transparent' : PRESS.ink,
        color: disabled ? PRESS.inkFaint : PRESS.paper,
        borderColor: disabled ? PRESS.inkFaint : PRESS.ink,
        fontFamily: FONT_DISPLAY,
        fontWeight: 700,
        fontSize: '1.4rem',
        lineHeight: 1,
        cursor: disabled ? 'default' : 'pointer',
        touchAction: 'manipulation',
        '&:hover': disabled ? undefined : { bgcolor: PRESS.red, borderColor: PRESS.red },
      }}
    >
      {sign}
    </Box>
  )
}

/** The look of a pressable block, on or off. */
function block(on: boolean) {
  return {
    minHeight: TAP,
    px: 1.75,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1,
    border: `3px solid ${on ? PRESS.red : PRESS.ink}`,
    bgcolor: on ? PRESS.red : 'transparent',
    color: on ? PRESS.paper : PRESS.ink,
    ...CAPS,
    fontSize: '1rem',
    cursor: 'pointer',
    touchAction: 'manipulation',
    '&:hover': on ? {} : { bgcolor: PRESS.ink, color: PRESS.paper },
  } as const
}

/** One of a short list. Wraps rather than scrolls, so nothing hides. */
export function Segments<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: ReactNode }>
  onChange: (next: T) => void
}) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {options.map(option => {
        const on = option.value === value
        return (
          <Box
            key={option.value}
            component="button"
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            sx={block(on)}
          >
            {option.label}
          </Box>
        )
      })}
    </Box>
  )
}

/** On or off, with the same weight as a segment. */
export function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      sx={block(on)}
    >
      <Box
        aria-hidden
        sx={{
          width: 14,
          height: 14,
          border: `3px solid currentColor`,
          bgcolor: on ? PRESS.paper : 'transparent',
          flexShrink: 0,
        }}
      />
      {label}
    </Box>
  )
}
