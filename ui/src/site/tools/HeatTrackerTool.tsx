/**
 * The heat check on a mat: your loadout, with the energy on it.
 *
 * Set the five slots once and the mat is your ship for the rest of the game.
 * A click on a subsystem puts on the energy its next action takes (the engines
 * go 1, 2, 3 for the burns; shields 1, then 2), a right click takes a step
 * off, and on a phone a tap past the top clears it. The check is the engine's
 * arithmetic (`heatAfterCheck`, `getDissipationCapacity`), so the radiators it
 * dissipates with are the working ones on the mat.
 *
 * The mat follows the turn rather than a calculator's reset. The heat check
 * bills the energy and leaves it where it is, because it stays on until your
 * next turn: a wall is still up while everyone else plays. What happens to it
 * then is the engine's too. A shield that absorbs spends an energy a point (a
 * point of anything, two of plasma) and puts every point it stopped on the
 * track, and a break dumps the subsystem's energy onto the track on the spot.
 * "Start my turn" clears the loadout, the rule's first step.
 *
 * Everything is kept in this browser (`heatMatStorage.ts`).
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Box } from '@mui/material'
import type { SubsystemType } from '@dangerous-inclinations/engine'
import {
  BURN_COSTS,
  COMPRESSED_JUMP_MASS,
  INTERCEPT_HEAT,
  MAX_HEAT,
  SHIELD_POINTS_PER_ENERGY,
  SUBSYSTEM_CONFIGS,
  WELL_TRANSFER_COSTS,
  fill,
  getDissipationCapacity,
  heatAfterCheck,
  heatDamage,
} from '@dangerous-inclinations/engine'
import { TOOLS } from '../../text/tools'
import { TileIcon } from '../../art/glyphs'
import { FONT_SANS } from '../../theme'
import { BAND_ANGLE, FONT_DISPLAY, PRESS } from '../../design/press'
import { mountLabel } from '../../ships/mounts'
import type { MountId } from '../../ships/mounts'
import { Body, Numeral, Slab } from '../poster'
import {
  FORWARD_TILES,
  PLASMA_SHIELD_POINTS,
  RADIATOR_DISSIPATION,
  SENSOR_CRIT,
  SIDE_TILES,
  tileName,
  weaponStats,
} from '../numbers'
import { Ledger } from '../guide/parts'
import type { LedgerRow } from '../guide/parts'
import { Field, Label, Plate, Segments, Stepper } from './controls'
import {
  FIXED,
  SLOTS,
  TRACK_CEILING,
  absorb,
  absorbingShield,
  breakSlot,
  rackAnswers,
  spentCubes,
  turnEnds,
  upRack,
  typeAt,
  type Mat,
  type SlotId,
} from './heatMat'
import { levelsOf, loadMat, saveMat } from './heatMatStorage'

const T = TOOLS.heat

/** The point the "Shields absorb" button stops: one at a time, as the engine walks a hit. */
const ONE_POINT = 1

const CAPS = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
} as const

/** What the energy on a subsystem is for, in a word or two. */
function purpose(type: SubsystemType, energy: number): string {
  if (energy === 0) return T.off
  switch (type) {
    case 'engines': {
      const uses = Object.entries(BURN_COSTS)
        .filter(([, cost]) => cost.energy === energy)
        .map(([burn]) => fill(T.burn, { burn }))
      if (WELL_TRANSFER_COSTS.energy === energy) uses.push(T.jump)
      return uses.join(', ')
    }
    case 'rotation':
      return T.rotate
    case 'scoop':
      return T.scoop
    case 'shields':
      return fill(T.absorbs, { points: energy * SHIELD_POINTS_PER_ENERGY })
    case 'missiles':
      return T.salvo
    case 'sensor_array':
      return fill(T.scan, { crit: SENSOR_CRIT })
    case 'ballistic_rack':
      return T.rack
    default:
      return T.fire
  }
}

/** What a subsystem that takes no energy does instead. */
function passiveNote(type: SubsystemType): string {
  if (type === 'radiator') return fill(T.radiator, { dissipation: RADIATOR_DISSIPATION })
  if (type === 'fuel_compressor') return fill(T.compressor, { fuel: COMPRESSED_JUMP_MASS })
  return ''
}

/** The printed card's ship is the corvette, so the mat names its slots the corvette's way. */
function slotTitle(slot: SlotId): string {
  if (slot === 'engines' || slot === 'rotation' || slot === 'scoop') return T.fixed
  return mountLabel(slot, 'corvette')
}

type TapMode = 'power' | 'break'

export function HeatTrackerTool() {
  const [mat, setMat] = useState(loadMat)
  const [mode, setMode] = useState<TapMode>('power')

  useEffect(() => saveMat(mat), [mat])

  const energyOf = (slot: SlotId) => mat.energy[slot] ?? 0
  const isBroken = (slot: SlotId) => mat.broken.includes(slot)

  /** One step up (wrapping to off, for a phone) or one step down. */
  const power = (slot: SlotId, direction: 1 | -1) =>
    setMat(m => {
      if (m.checked || m.broken.includes(slot)) return m
      const levels = levelsOf(typeAt(m, slot))
      const at = Math.max(0, levels.indexOf(m.energy[slot] ?? 0))
      const next = direction > 0 ? levels[(at + 1) % levels.length] : levels[Math.max(0, at - 1)]
      return { ...m, energy: { ...m.energy, [slot]: next } }
    })

  /** A break dumps the subsystem's energy onto the track; a repair just stands it up again. */
  const toggleBroken = (slot: SlotId) =>
    setMat(m =>
      m.broken.includes(slot)
        ? { ...m, broken: m.broken.filter(s => s !== slot) }
        : breakSlot(m, slot)
    )

  const tap = (slot: SlotId, direction: 1 | -1) => {
    if (mode === 'break') {
      if (direction > 0) toggleBroken(slot)
    } else {
      power(slot, direction)
    }
  }

  const choose = (mount: MountId, type: SubsystemType) =>
    setMat(m => ({
      ...m,
      loadout: { ...m.loadout, [mount]: type },
      energy: { ...m.energy, [mount]: 0 },
      spent: { ...m.spent, [mount]: 0 },
      broken: m.broken.filter(s => s !== mount),
    }))

  // The shields absorb in slot order, as the engine walks them: a point of
  // anything, or a whole plasma bolt at its own rate.
  const canAbsorb = absorbingShield(mat) !== undefined
  const plasmaBolt = (m: Mat) =>
    absorb(m, weaponStats('plasma_cannon').damage, PLASMA_SHIELD_POINTS)
  const absorbPoint = () => setMat(m => absorb(m, ONE_POINT))
  const absorbPlasma = () => setMat(plasmaBolt)
  const answerMissiles = () => setMat(rackAnswers)
  const theirTurnEnds = () => setMat(turnEnds)

  const onMat = SLOTS.reduce((sum, slot) => sum + energyOf(slot), 0)
  const hull = SLOTS.map(slot => ({ type: typeAt(mat, slot), isBroken: isBroken(slot) }))
  const radiators = hull.filter(s => s.type === 'radiator' && !s.isBroken).length
  const dissipation = getDissipationCapacity(hull)
  const atCheck = mat.track + onMat
  const damage = heatDamage(atCheck)
  const next = heatAfterCheck(atCheck, dissipation)

  const rows: LedgerRow[] = [
    { value: `${mat.track}`, label: T.onTrack },
    { value: `+${onMat}`, label: T.onSubsystems },
    { value: `${atCheck}`, label: T.total, rule: true },
  ]
  if (atCheck === 0) {
    rows.push({
      value: '0',
      label: mat.broken.length ? T.coldRepair : T.cold,
      tone: 'ink',
    })
  }
  if (damage > 0) {
    rows.push({ value: `−${damage}`, label: fill(T.overTop, { maxHeat: MAX_HEAT }), tone: 'red' })
    rows.push({ value: `${MAX_HEAT}`, label: T.stopsAtTop })
  }
  rows.push({
    value: `−${dissipation}`,
    label:
      radiators > 0
        ? fill(T.dissipateWith, {
            radiators: fill(radiators > 1 ? T.radiators : T.oneRadiator, { count: radiators }),
          })
        : T.dissipate,
  })
  rows.push({ value: `${next}`, label: T.intoNextTurn, tone: 'ink' })

  const card = (slot: SlotId) => (
    <SlotCard
      key={slot}
      slot={slot}
      type={typeAt(mat, slot)}
      energy={energyOf(slot)}
      broken={isBroken(slot)}
      locked={mode === 'power' && mat.checked}
      mode={mode}
      onTap={direction => tap(slot, direction)}
      onChoose={slot in mat.loadout ? type => choose(slot as MountId, type) : undefined}
    />
  )

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' },
        alignItems: 'start',
      }}
    >
      <Plate>
        <Label>{T.tap}</Label>
        <Box sx={{ mt: 0.75 }}>
          <Segments
            value={mode}
            onChange={setMode}
            options={[
              { value: 'power', label: T.powers },
              { value: 'break', label: T.breaks },
            ]}
          />
        </Box>
        <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 1, mb: 2 }}>
          {mode === 'power' ? T.powersNote : T.breaksNote}
        </Body>

        {/* The ship as it lies on the table: bow up, port and starboard, the fixed three astern. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1,
            maxWidth: 480,
            mx: 'auto',
          }}
        >
          <Box sx={{ gridColumn: '1 / -1', justifySelf: 'center', width: 'calc(50% - 4px)' }}>
            {card('forward-0')}
          </Box>
          {card('side-0')}
          {card('side-2')}
          {card('side-1')}
          {card('side-3')}
          <Box
            sx={{
              gridColumn: '1 / -1',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
            }}
          >
            {FIXED.map(card)}
          </Box>
        </Box>

        {/* The sum, kept in sight on a phone while the mat scrolls under the thumb. */}
        <Box
          aria-live="polite"
          sx={{
            position: 'sticky',
            bottom: 0,
            mt: 2,
            mx: { xs: -2, sm: -3 },
            mb: { xs: -2, sm: -3 },
            px: { xs: 2, sm: 3 },
            py: 1.25,
            bgcolor: PRESS.ink,
            color: PRESS.paper,
            display: 'flex',
            alignItems: 'flex-end',
            gap: { xs: 2, sm: 3 },
            flexWrap: 'wrap',
          }}
        >
          {mat.checked ? (
            <>
              <Figure label={T.checkedOnTrack} value={`${mat.track}`} />
              <Box sx={{ ...CAPS, fontSize: '0.8rem', color: PRESS.paperSoft, pb: 0.25 }}>
                {T.staysOn}
              </Box>
            </>
          ) : (
            <>
              <Figure label={T.energy} value={`${onMat}`} />
              <Figure label={T.atCheck} value={`${atCheck}`} />
              {damage > 0 && <Figure label={T.hull} value={`−${damage}`} tone="red" />}
              <Figure label={T.nextTurn} value={`${next}`} />
            </>
          )}
        </Box>
      </Plate>

      <Plate>
        <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label={T.track}>
            <Stepper
              value={mat.track}
              min={0}
              max={TRACK_CEILING}
              onChange={track => setMat(m => ({ ...m, track }))}
              label={T.trackAloud}
              editable
            />
          </Field>
          <AbsorbButton
            label={fill(T.absorbPoint, { points: ONE_POINT })}
            badge={`+${absorb(mat, ONE_POINT).track - mat.track}`}
            disabled={!canAbsorb}
            onClick={absorbPoint}
          />
          <AbsorbButton
            label={T.absorbPlasma}
            badge={`+${plasmaBolt(mat).track - mat.track}`}
            disabled={!canAbsorb}
            onClick={absorbPlasma}
          />
          <AbsorbButton
            label={T.rackAnswers}
            icon="ballistic_rack"
            badge={`+${rackAnswers(mat).track - mat.track}`}
            disabled={!upRack(mat)}
            onClick={answerMissiles}
          />
          <AbsorbButton
            label={T.turnEnds}
            badge={fill(T.back, { energy: spentCubes(mat) })}
            disabled={spentCubes(mat) === 0}
            onClick={theirTurnEnds}
          />
        </Box>
        <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 1 }}>
          {fill(T.shieldsRule, {
            points: SHIELD_POINTS_PER_ENERGY,
            plasma: PLASMA_SHIELD_POINTS,
            interceptHeat: INTERCEPT_HEAT,
          })}
        </Body>

        <Box sx={{ mt: 3 }}>
          <Label>{T.check}</Label>
          <Box sx={{ mt: 1.5 }}>
            {mat.checked ? (
              <Ledger rows={[{ value: `${mat.track}`, label: T.onTrack, tone: 'ink' }]} />
            ) : (
              <Ledger rows={rows} />
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 3 }}>
          {mat.checked ? (
            <Slab
              tone="red"
              onClick={() => setMat(m => ({ ...m, energy: {}, spent: {}, checked: false }))}
            >
              {T.startTurn}
            </Slab>
          ) : (
            <Slab tone="red" onClick={() => setMat(m => ({ ...m, track: next, checked: true }))}>
              {T.runCheck}
            </Slab>
          )}
          <Slab
            tone="paper"
            onClick={() =>
              setMat(m => ({ ...m, energy: {}, spent: {}, broken: [], track: 0, checked: false }))
            }
          >
            {T.reset}
          </Slab>
        </Box>
        <Body size="0.92rem" color={PRESS.inkSoft} sx={{ mt: 1.5 }}>
          {mat.checked ? T.clearsNote : T.staysNote}
        </Body>
      </Plate>
    </Box>
  )
}

/** One slot of the mat: what is in it, what it carries, and the tap that changes it. */
function SlotCard({
  slot,
  type,
  energy,
  broken,
  locked,
  mode,
  onTap,
  onChoose,
}: {
  slot: SlotId
  type: SubsystemType
  energy: number
  broken: boolean
  /** Checked: the energy is on until the next turn, so a tap has nothing to change. */
  locked: boolean
  mode: TapMode
  onTap: (direction: 1 | -1) => void
  onChoose?: (type: SubsystemType) => void
}) {
  const { maxEnergy } = SUBSYSTEM_CONFIGS[type]
  const passive = maxEnergy === 0
  const inert = mode === 'power' && (locked || broken || passive)
  const lit = energy > 0
  const fg = lit ? PRESS.paper : PRESS.ink
  const title = slotTitle(slot)
  const name = tileName(type)

  return (
    <Box
      data-slot={slot}
      data-energy={energy}
      sx={{
        border: `3px solid ${PRESS.ink}`,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          ...CAPS,
          fontSize: '0.7rem',
          px: 0.75,
          py: 0.25,
          color: PRESS.inkSoft,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </Box>

      <Box
        component="button"
        type="button"
        aria-label={fill(T.slotAloud, {
          slot: title,
          name,
          state: broken ? T.brokenAloud : fill(T.energyAloud, { energy }),
        })}
        aria-disabled={inert || undefined}
        onClick={() => onTap(1)}
        onContextMenu={event => {
          event.preventDefault()
          onTap(-1)
        }}
        onKeyDown={event => {
          if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault()
            onTap(-1)
          }
        }}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          flex: 1,
          minHeight: 92,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          py: 1,
          px: 0.5,
          border: 'none',
          borderTop: `3px solid ${PRESS.ink}`,
          borderBottom: onChoose ? `3px solid ${PRESS.ink}` : 'none',
          bgcolor: lit ? PRESS.ink : 'transparent',
          color: fg,
          font: 'inherit',
          cursor: inert ? 'default' : 'pointer',
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          '&:hover': inert ? undefined : { outline: `3px solid ${PRESS.red}`, outlineOffset: -6 },
          '&:focus-visible': { outline: `3px solid ${PRESS.red}`, outlineOffset: -6 },
        }}
      >
        <Box sx={{ opacity: broken ? 0.35 : 1, display: 'flex' }}>
          <TileIcon type={type} size={34} color={fg} title={null} />
        </Box>
        {passive ? (
          <Caption color={PRESS.inkSoft}>{passiveNote(type)}</Caption>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: '3px' }}>
              {Array.from({ length: maxEnergy }, (_, i) => (
                <Box
                  key={i}
                  sx={{
                    width: 12,
                    height: 12,
                    bgcolor: i < energy ? PRESS.red : 'transparent',
                    border: `2px solid ${i < energy ? PRESS.red : lit ? PRESS.paperSoft : PRESS.inkFaint}`,
                  }}
                />
              ))}
            </Box>
            <Caption color={lit ? PRESS.paperSoft : PRESS.inkSoft}>{purpose(type, energy)}</Caption>
          </>
        )}
        {broken && (
          // The one diagonal every printed thing carries, pressed across the tile.
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: '-20%',
              right: '-20%',
              top: '50%',
              transform: `translateY(-50%) rotate(-${BAND_ANGLE / 2}deg)`,
              bgcolor: PRESS.red,
              color: PRESS.paper,
              ...CAPS,
              fontWeight: 700,
              fontSize: '0.95rem',
              textAlign: 'center',
              py: 0.25,
            }}
          >
            {T.broken}
          </Box>
        )}
      </Box>

      {onChoose ? (
        <Box sx={{ position: 'relative' }}>
          <Box
            component="select"
            aria-label={fill(T.chooseAloud, { slot: title })}
            value={type}
            onChange={event => onChoose(event.currentTarget.value as SubsystemType)}
            sx={{
              appearance: 'none',
              width: '100%',
              minHeight: 40,
              pl: 0.75,
              pr: 3,
              border: 'none',
              borderRadius: 0,
              bgcolor: PRESS.paper,
              color: PRESS.ink,
              ...CAPS,
              fontSize: '0.88rem',
              cursor: 'pointer',
              textOverflow: 'ellipsis',
              '&:focus-visible': { outline: `3px solid ${PRESS.red}`, outlineOffset: -3 },
            }}
          >
            {(slot === 'forward-0' ? FORWARD_TILES : SIDE_TILES).map(option => (
              <option key={option} value={option}>
                {tileName(option)}
              </option>
            ))}
          </Box>
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `7px solid ${PRESS.ink}`,
            }}
          />
        </Box>
      ) : (
        <Box
          sx={{
            ...CAPS,
            fontSize: '0.88rem',
            px: 0.75,
            py: 0.5,
            borderTop: `3px solid ${PRESS.ink}`,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </Box>
      )}
    </Box>
  )
}

function Caption({ children, color }: { children: ReactNode; color: string }) {
  return (
    <Box
      sx={{
        ...CAPS,
        fontWeight: 500,
        fontSize: '0.72rem',
        lineHeight: 1.1,
        textAlign: 'center',
        color,
      }}
    >
      {children}
    </Box>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'red' }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ ...CAPS, fontSize: '0.72rem', color: PRESS.paperSoft }}>{label}</Box>
      <Numeral size="1.9rem" color={tone === 'red' ? PRESS.red : PRESS.paper}>
        {value}
      </Numeral>
    </Box>
  )
}

/** A shield soaking a shot on someone else's turn: energy off it, the points it stopped on the track. */
function AbsorbButton({
  label,
  icon = 'shields',
  badge,
  disabled,
  onClick,
}: {
  label: string
  icon?: SubsystemType
  badge: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      sx={{
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        pl: 1,
        pr: 0,
        border: `3px solid ${disabled ? PRESS.inkFaint : PRESS.ink}`,
        bgcolor: 'transparent',
        color: disabled ? PRESS.inkFaint : PRESS.ink,
        cursor: disabled ? 'default' : 'pointer',
        touchAction: 'manipulation',
        '&:hover': disabled ? undefined : { bgcolor: PRESS.ink, color: PRESS.paper },
      }}
    >
      <TileIcon type={icon} size={18} title={null} />
      <Box component="span" sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem', fontWeight: 600 }}>
        {label}
      </Box>
      <Box
        component="span"
        sx={{
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center',
          px: 1,
          bgcolor: disabled ? PRESS.inkFaint : PRESS.red,
          color: PRESS.paper,
          fontFamily: FONT_DISPLAY,
          fontWeight: 700,
          fontSize: '1.05rem',
        }}
      >
        {badge}
      </Box>
    </Box>
  )
}
