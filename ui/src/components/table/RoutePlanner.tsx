/**
 * Route planner — the navigation instrument, not a move.
 *
 * The move row above commits part of *this* turn. This is a different kind of
 * thing: you name a sector, the engine lays out the turns it would take to get
 * there, and the planner offers you the first of them. Nothing here touches
 * the turn until you take that step, so it sits on its own recessed plate,
 * folded away until you ask for it.
 *
 * Reading it, top to bottom:
 *
 *   destination — where you asked to go (and the way in and out of picking)
 *   routes      — the alternatives the engine found, turns and fuel side by side
 *   itinerary   — the chosen route turn by turn, ending on the destination
 *   the step    — the one leg of it that can be this turn's move
 *
 * The last block is the one a player must not misread, so it is derived, never
 * remembered: it compares the route's first step against the move actually
 * planned and says which of the two states you are in. Change the move by hand
 * and it goes back to offering.
 *
 * Colour follows the board. A route is drawn there in the energy blue, the
 * destination as a diamond in it; both are repeated here so the plate and the
 * board are obviously the same instrument. Amber stays what it always is:
 * interactive, or active.
 */
import { useState } from 'react'
import { Box, Button, Tooltip, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import RotateRightIcon from '@mui/icons-material/RotateRight'
import RouteIcon from '@mui/icons-material/Route'
import type { Facing, MovementPlan, MovementStep, Position } from '@dangerous-inclinations/engine'
import { getWellName } from '@dangerous-inclinations/engine'
import type { MoveChoice } from '../../context/PlanContext'
import { usePlan } from '../../context/PlanContext'
import { SectionLabel } from '../common/Panel'
import { FONT_MONO, TABLE } from '../../theme'

/** The board draws routes and their destination in the energy blue; so do we. */
const ROUTE = TABLE.energy
const ROUTE_FAINT = 'rgba(73,195,255,0.30)'
const AMBER_TINT = 'rgba(221,170,120,0.12)'
const HOVER_TINT = 'rgba(126,165,205,0.07)'

/** Turns of a route shown before the list folds into "+n more". */
const ITINERARY_LIMIT = 6

const placeLabel = (p: Position) => `${getWellName(p.wellId)} R${p.ring} S${p.sector}`

/** Facing a burn needs: prograde burns outward, retrograde inward. Coasts and jumps keep the facing. */
function facingFor(step: MovementStep, before: Facing): Facing {
  if (step.actionType === 'burn_prograde') return 'prograde'
  if (step.actionType === 'burn_retrograde') return 'retrograde'
  return before
}

/** One leg of a route: what it does, and whether the nose has to come round first. */
interface Leg {
  text: string
  rotate: boolean
}

/** One step of a planned route, in the words of the move row. */
function legText(step: MovementStep, facingAfter: Facing): string {
  if (step.actionType === 'coast') return `coast${step.massCost < 0 ? ' + scoop' : ''}`
  if (step.actionType === 'well_transfer') return `jump → ${getWellName(step.to.wellId)}`
  const phase = step.sectorAdjustment
    ? ` ${step.sectorAdjustment > 0 ? '+' : ''}${step.sectorAdjustment}`
    : ''
  return `${step.burnIntensity ?? 'soft'} burn ${facingAfter === 'prograde' ? 'out' : 'in'}${phase}`
}

/** The same step spelled out in full, for a tooltip that has the room. */
function describeStep(step: MovementStep, facingBefore: Facing): string {
  const needed = facingFor(step, facingBefore)
  return `${legText(step, needed)}${needed !== facingBefore ? ' (rotate first)' : ''}`
}

/** Every step described, with the facing carried from one to the next. */
function routeLegs(steps: MovementStep[], facing: Facing): Leg[] {
  const out: Leg[] = []
  let current = facing
  for (const step of steps) {
    const needed = facingFor(step, current)
    out.push({ text: legText(step, needed), rotate: needed !== current })
    current = needed
  }
  return out
}

/** The move the planner would set from a route step — the same one `applyRouteStep` builds. */
function moveForStep(step: MovementStep): MoveChoice {
  if (step.actionType === 'coast') return { kind: 'coast', scoop: step.massCost < 0 }
  if (step.actionType === 'well_transfer')
    return { kind: 'jump', destinationWellId: step.to.wellId, adjustment: step.sectorAdjustment }
  return {
    kind: 'burn',
    intensity: step.burnIntensity ?? 'soft',
    adjustment: step.sectorAdjustment,
  }
}

function sameMove(a: MoveChoice, b: MoveChoice): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'coast' && b.kind === 'coast') return a.scoop === b.scoop
  if (a.kind === 'burn' && b.kind === 'burn')
    return a.intensity === b.intensity && a.adjustment === b.adjustment
  if (a.kind === 'jump' && b.kind === 'jump')
    return a.destinationWellId === b.destinationWellId && a.adjustment === b.adjustment
  return false
}

/** "⚡ Fastest" → "fastest": the engine labels for people, we label for the plate. */
const routeName = (route: MovementPlan, index: number) =>
  (route.label ?? `route ${index + 1}`).replace(/^[^\p{L}]+/u, '').toLowerCase()

export function RoutePlanner({ disabled }: { disabled: boolean }) {
  const plan = usePlan()
  const picking = plan.picking?.kind === 'destination'
  const dest = plan.routeDestination
  const route = plan.route
  /**
   * Folded away until it is wanted. Asking for a destination — or already
   * having one — is asking for the planner, so the fold is derived from that
   * unless you have said otherwise since; both buttons that change what the
   * planner is *for* hand the fold back to it.
   */
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? Boolean(dest || picking)

  const first = route?.steps[0]
  /**
   * Is the route's first step already the move on the sheet? Derived every
   * render from the plan itself, so changing the move by hand takes it back.
   */
  const taken = Boolean(
    first &&
      sameMove(moveForStep(first), plan.moveStep.move) &&
      facingFor(first, plan.moveFrom.facing) === plan.moveFrom.facing
  )

  const edge = picking ? TABLE.accent : route ? ROUTE_FAINT : TABLE.line

  return (
    <Box
      data-testid="route-planner"
      data-open={open ? 'true' : 'false'}
      sx={{
        mt: 0.5,
        minWidth: 0,
        // `overflow: hidden` zeroes a flex item's automatic minimum size, and
        // the turn column is a flex column: without this the plate is squashed.
        flexShrink: 0,
        borderRadius: 1,
        border: `1px solid ${picking ? TABLE.accent : TABLE.line}`,
        borderLeft: `2px solid ${edge}`,
        bgcolor: TABLE.plateSunk,
        boxShadow: picking
          ? `0 0 0 1px ${TABLE.accentGlow}`
          : 'inset 0 1px 0 rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.03)',
        overflow: 'hidden',
      }}
    >
      <PlannerHeader
        open={open}
        onToggle={() => setOverride(!open)}
        dest={dest}
        route={route}
        hasRoutes={plan.routes.length > 0}
        taken={taken}
      />

      {open && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0.6,
            px: 0.75,
            pb: 0.75,
            pt: 0.5,
            minWidth: 0,
            borderTop: `1px solid ${TABLE.line}`,
          }}
        >
          <DestinationRow
            dest={dest}
            picking={picking}
            disabled={disabled}
            onPick={() => {
              // Going into picking hands the fold back to the planner; coming
              // back out of it must not fold the plate away under the pointer.
              setOverride(picking ? true : null)
              plan.setPicking(picking ? null : { kind: 'destination' })
            }}
            onClear={() => {
              setOverride(true)
              plan.setRouteDestination(null)
            }}
          />

          {dest && plan.routes.length === 0 && (
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.74rem',
                color: TABLE.inkSoft,
                lineHeight: 1.4,
              }}
            >
              No route there within 20 turns on the fuel aboard.
            </Typography>
          )}

          {route && (
            <>
              <RouteTable
                routes={plan.routes}
                selected={plan.routeIndex}
                onSelect={plan.selectRoute}
              />
              <Itinerary route={route} facing={plan.me.ship.facing} taken={taken} />
              <FirstStep
                step={route.steps[0]}
                facing={plan.me.ship.facing}
                taken={taken}
                disabled={disabled}
                onTake={plan.applyRouteStep}
              />
            </>
          )}
        </Box>
      )}
    </Box>
  )
}

/**
 * The fold. Closed, it still answers the only question worth asking from
 * across the table: where am I headed, and what does it cost.
 */
function PlannerHeader({
  open,
  onToggle,
  dest,
  route,
  hasRoutes,
  taken,
}: {
  open: boolean
  onToggle: () => void
  dest: Position | null
  route: MovementPlan | null
  hasRoutes: boolean
  taken: boolean
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      sx={{
        appearance: 'none',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.15,
        alignItems: 'stretch',
        textAlign: 'left',
        px: 0.75,
        py: 0.5,
        border: 0,
        borderRadius: 0,
        bgcolor: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        font: 'inherit',
        minWidth: 0,
        '&:hover': { bgcolor: HOVER_TINT },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
        <RouteIcon sx={{ fontSize: 15, color: route ? ROUTE : TABLE.inkFaint, flexShrink: 0 }} />
        <SectionLabel sx={{ color: TABLE.inkSoft, lineHeight: 1.4, flexShrink: 0 }}>
          Route planner
        </SectionLabel>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {!open && !dest && (
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkFaint }}
            noWrap
          >
            plot a route…
          </Typography>
        )}
        {!open && taken && (
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.72rem', fontWeight: 700, color: TABLE.accent }}
            noWrap
          >
            step 1 taken
          </Typography>
        )}
        <ExpandMoreIcon
          sx={{
            fontSize: 17,
            color: TABLE.inkFaint,
            flexShrink: 0,
            transition: 'transform 120ms',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </Box>

      {!open && dest && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, pl: 2.6, minWidth: 0 }}>
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: ROUTE, flexShrink: 0 }}
          >
            ◆
          </Typography>
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkSoft, minWidth: 0 }}
            noWrap
          >
            {placeLabel(dest)}
            {route ? ` · ${route.totalTurns} turns · ${route.totalMassCost} fuel` : ''}
            {!hasRoutes ? ' · no route' : ''}
          </Typography>
        </Box>
      )}
    </Box>
  )
}

/**
 * Where you asked to go. With nothing chosen it is the way into picking; while
 * picking it is the loud amber state and the way straight back out of it.
 */
function DestinationRow({
  dest,
  picking,
  disabled,
  onPick,
  onClear,
}: {
  dest: Position | null
  picking: boolean
  disabled: boolean
  onPick: () => void
  onClear: () => void
}) {
  if (picking) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          px: 0.75,
          py: 0.5,
          borderRadius: 1,
          border: `1px solid ${TABLE.accent}`,
          bgcolor: AMBER_TINT,
          minWidth: 0,
        }}
      >
        <MyLocationIcon
          sx={{
            fontSize: 15,
            color: TABLE.accent,
            flexShrink: 0,
            animation: 'route-pick-pulse 1.4s ease-in-out infinite',
            '@keyframes route-pick-pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.35 },
            },
          }}
        />
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.76rem',
            fontWeight: 700,
            color: TABLE.accent,
            minWidth: 0,
            flex: 1,
          }}
          noWrap
        >
          click a sector on the board
        </Typography>
        <Button
          size="small"
          data-testid="route-cancel-pick"
          onClick={onPick}
          sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: TABLE.inkSoft }}
        >
          cancel
        </Button>
      </Box>
    )
  }

  if (!dest) {
    return (
      <Tooltip title="Pick a sector on the board. The planner lays out the turns to get there, and offers you the first of them.">
        <Button
          fullWidth
          size="small"
          variant="outlined"
          data-testid="route-pick-destination"
          aria-label="pick a destination"
          startIcon={<MyLocationIcon sx={{ fontSize: 15 }} />}
          disabled={disabled}
          onClick={onPick}
          sx={{ justifyContent: 'flex-start', py: 0.3, fontSize: '0.74rem' }}
        >
          pick a destination
        </Button>
      </Tooltip>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.8rem', color: ROUTE, flexShrink: 0 }}>
        ◆
      </Typography>
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.8rem',
          fontWeight: 700,
          color: TABLE.ink,
          flex: 1,
          minWidth: 0,
        }}
        noWrap
      >
        {placeLabel(dest)}
      </Typography>
      <Tooltip title="Pick a different destination">
        <Button
          size="small"
          data-testid="route-repick"
          aria-label="pick a different destination"
          disabled={disabled}
          onClick={onPick}
          sx={{ minWidth: 0, px: 0.6, py: 0, fontSize: '0.72rem', flexShrink: 0 }}
        >
          change
        </Button>
      </Tooltip>
      <Tooltip title="Forget this destination">
        <Button
          size="small"
          data-testid="route-clear"
          aria-label="forget this destination"
          onClick={onClear}
          sx={{ minWidth: 0, px: 0.4, py: 0, color: TABLE.inkFaint, flexShrink: 0 }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </Button>
      </Tooltip>
    </Box>
  )
}

const ROUTE_COLUMNS = '1fr 46px 46px'

/**
 * The alternatives, as a read-out rather than a wall of buttons: one line
 * each, the two numbers you choose between in their own columns.
 */
function RouteTable({
  routes,
  selected,
  onSelect,
}: {
  routes: MovementPlan[]
  selected: number
  onSelect: (index: number) => void
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: ROUTE_COLUMNS,
          px: 0.6,
          pb: 0.1,
        }}
      >
        <SectionLabel sx={{ lineHeight: 1.3 }}>route</SectionLabel>
        <SectionLabel sx={{ lineHeight: 1.3, textAlign: 'right' }}>turns</SectionLabel>
        <SectionLabel sx={{ lineHeight: 1.3, textAlign: 'right' }}>fuel</SectionLabel>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2, minWidth: 0 }}>
        {routes.map((alt, i) => {
          const on = i === selected
          return (
            <Box
              key={`${alt.label ?? i}-${alt.totalTurns}-${alt.totalMassCost}`}
              component="button"
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={on}
              sx={{
                appearance: 'none',
                display: 'grid',
                gridTemplateColumns: ROUTE_COLUMNS,
                alignItems: 'center',
                width: '100%',
                px: 0.6,
                py: 0.3,
                border: `1px solid ${on ? TABLE.accentDim : 'transparent'}`,
                borderRadius: 1,
                bgcolor: on ? AMBER_TINT : 'transparent',
                boxShadow: on ? `inset 2px 0 0 ${TABLE.accent}` : 'none',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                '&:hover': { bgcolor: on ? AMBER_TINT : HOVER_TINT },
              }}
            >
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '0.76rem',
                  fontWeight: on ? 700 : 400,
                  color: on ? TABLE.accent : TABLE.inkSoft,
                  minWidth: 0,
                }}
                noWrap
              >
                {routeName(alt, i)}
              </Typography>
              <Readout value={alt.totalTurns} on={on} />
              <Readout value={alt.totalMassCost} on={on} tint={TABLE.fuel} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

function Readout({ value, on, tint }: { value: number; on: boolean; tint?: string }) {
  return (
    <Typography
      sx={{
        fontFamily: FONT_MONO,
        fontSize: '0.78rem',
        fontWeight: 700,
        textAlign: 'right',
        color: on ? TABLE.accent : (tint ?? TABLE.ink),
      }}
    >
      {value}
    </Typography>
  )
}

/**
 * The chosen route, turn by turn, on a dotted rail that repeats the one drawn
 * across the board. The first turn is lit; everything after it is a later
 * turn, and dimmed to say so.
 */
function Itinerary({
  route,
  facing,
  taken,
}: {
  route: MovementPlan
  facing: Facing
  taken: boolean
}) {
  const legs = routeLegs(route.steps, facing)
  const shown = legs.slice(0, ITINERARY_LIMIT)
  const hidden = legs.length - shown.length

  return (
    <Box sx={{ minWidth: 0 }}>
      <SectionLabel sx={{ lineHeight: 1.3, pl: 0.6 }}>itinerary</SectionLabel>
      <Box sx={{ position: 'relative', pl: 0.6, minWidth: 0 }}>
        {/* the rail: the board's dotted track, stood on end */}
        <Box
          sx={{
            position: 'absolute',
            left: 12,
            top: 9,
            bottom: 9,
            borderLeft: `1px solid ${ROUTE_FAINT}`,
          }}
        />
        {shown.map((leg, i) => (
          <LegRow
            key={i}
            index={i + 1}
            text={leg.text}
            rotate={leg.rotate}
            now={i === 0}
            taken={taken && i === 0}
          />
        ))}
        {hidden > 0 && (
          <LegRow index={null} text={`+${hidden} more turn${hidden > 1 ? 's' : ''}`} now={false} />
        )}
        <LegRow index="◆" text={`arrive ${placeLabel(route.destination)}`} now={false} arrival />
      </Box>
    </Box>
  )
}

function LegRow({
  index,
  text,
  rotate,
  now,
  taken,
  arrival,
}: {
  index: number | string | null
  text: string
  rotate?: boolean
  now: boolean
  taken?: boolean
  arrival?: boolean
}) {
  const colour = arrival ? ROUTE : now ? TABLE.ink : TABLE.inkFaint
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 0.45,
        minWidth: 0,
        py: 0.18,
        pr: 0.5,
      }}
    >
      <Box
        sx={{
          width: 16,
          height: 16,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          border:
            index === null || arrival ? 'none' : `1px solid ${now ? TABLE.accent : ROUTE_FAINT}`,
          bgcolor: taken ? TABLE.accent : arrival ? 'transparent' : TABLE.plateSunk,
          color: taken ? '#12181f' : now ? TABLE.accent : arrival ? ROUTE : TABLE.inkFaint,
          fontFamily: FONT_MONO,
          fontSize: arrival ? '0.85rem' : '0.72rem',
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {taken ? <CheckIcon sx={{ fontSize: 12 }} /> : index}
      </Box>
      {rotate && (
        <RotateRightIcon
          titleAccess="rotate first"
          sx={{ fontSize: 13, color: colour, flexShrink: 0, opacity: now ? 1 : 0.8 }}
        />
      )}
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.74rem',
          fontWeight: now ? 700 : 400,
          color: colour,
          lineHeight: 1.35,
          flex: 1,
          minWidth: 0,
        }}
        noWrap
      >
        {text}
      </Typography>
      {now && (
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.72rem',
            letterSpacing: '0.08em',
            color: TABLE.accent,
            flexShrink: 0,
            ml: 0.5,
            opacity: 0.85,
          }}
        >
          THIS TURN
        </Typography>
      )}
    </Box>
  )
}

/**
 * The join between the plan and the turn. One of two states, and never a
 * guess: either the route's first step is the move on the sheet, or here is
 * the button that makes it so.
 */
function FirstStep({
  step,
  facing,
  taken,
  disabled,
  onTake,
}: {
  step: MovementStep
  facing: Facing
  taken: boolean
  disabled: boolean
  onTake: () => void
}) {
  if (taken) {
    return (
      <Box
        data-testid="route-step-taken"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.6,
          px: 0.75,
          py: 0.4,
          mt: 0.1,
          borderRadius: 1,
          border: `1px solid ${TABLE.accentDim}`,
          bgcolor: AMBER_TINT,
          minWidth: 0,
        }}
      >
        <CheckIcon sx={{ fontSize: 15, color: TABLE.accent, flexShrink: 0 }} />
        <Typography
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.74rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: TABLE.accent,
            minWidth: 0,
          }}
          noWrap
        >
          step 1 is this turn&apos;s move
        </Typography>
      </Box>
    )
  }

  return (
    <Tooltip
      title={`Set this turn's move to the first turn of the route (${describeStep(
        step,
        facing
      )}) — the rotation and the cubes it needs included. Nothing else about the turn changes.`}
    >
      <Box component="span" sx={{ display: 'flex', mt: 0.1, minWidth: 0 }}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          color="primary"
          data-testid="route-take-step"
          disabled={disabled}
          onClick={onTake}
          sx={{
            py: 0.3,
            fontSize: '0.74rem',
            borderColor: TABLE.accentDim,
            color: TABLE.accent,
            '&:hover': { borderColor: TABLE.accent, bgcolor: AMBER_TINT },
          }}
        >
          take step 1 as this turn&apos;s move
        </Button>
      </Box>
    </Tooltip>
  )
}
