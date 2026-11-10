/**
 * Route planner: the navigation instrument, not a move.
 *
 * The move row above commits part of *this* turn. This is a different kind of
 * thing: you name a sector, the engine lays out the turns it would take to get
 * there, and the planner offers you the first of them. Nothing here touches
 * the turn until you take that step, so it sits on its own recessed plate,
 * folded away until you ask for it.
 *
 * Reading it, top to bottom:
 *
 *   destination · where you asked to go (and the way in and out of picking)
 *   routes      · the alternatives the engine found, turns and fuel side by side
 *   itinerary   · the chosen route turn by turn, ending on the destination
 *   the step    · the one leg of it that can be this turn's move
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
import type {
  Facing,
  MovementPlan,
  MovementStep,
  Position,
  Station,
} from '@dangerous-inclinations/engine'
import { fill, getWellName } from '@dangerous-inclinations/engine'
import { usePlan } from '../../context/PlanContext'
import { moveOfRouteStep, useRoutePlan, type RouteMode } from '../../context/RoutePlanContext'
import type { MoveChoice } from '../../plan/preview'
import {
  ROUTE_SEARCH_TURNS,
  describeStep,
  facingFor,
  placeLabel,
  routeLegs,
  routeName,
} from '../../utils/route'
import { SectionLabel } from '../common/Panel'
import { FONT_MONO } from '../../theme'
import { TABLE } from '../../design/tokens'
import { STATION_DRIFT } from '../../site/turn'
import { ACTIONS } from '../../text/actions'

const T = ACTIONS.routePlanner

/** The board draws routes and their destination in the energy colour; so do we. */
const ROUTE = TABLE.energy
const ROUTE_FAINT = TABLE.inkFaint
/** Behind red type: the pick in progress, the step taken. */
const RED_TINT = TABLE.accentWash
const HOVER_TINT = TABLE.hover

/** Turns of a route shown before the list folds into "+n more". */
const ITINERARY_LIMIT = 6

function sameMove(a: MoveChoice, b: MoveChoice): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'coast' && b.kind === 'coast') return a.scoop === b.scoop
  if (a.kind === 'burn' && b.kind === 'burn')
    return a.intensity === b.intensity && a.adjustment === b.adjustment
  if (a.kind === 'jump' && b.kind === 'jump')
    return a.destinationWellId === b.destinationWellId && a.adjustment === b.adjustment
  return false
}

export function RoutePlanner() {
  const plan = usePlan()
  const routePlan = useRoutePlan()
  const disabled = plan.disabled
  const picking = plan.picking?.kind === 'destination'
  const dest = routePlan.routeDestination
  const route = routePlan.route
  /**
   * Folded away until it is wanted. Asking for a destination (or already
   * having one) is asking for the planner, so the fold is derived from that
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
      sameMove(moveOfRouteStep(first), plan.moveStep.move) &&
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
        border: `1px solid ${picking ? TABLE.accent : TABLE.line}`,
        borderLeft: `3px solid ${edge}`,
        bgcolor: TABLE.plateSunk,
        overflow: 'hidden',
      }}
    >
      <PlannerHeader
        open={open}
        onToggle={() => setOverride(!open)}
        dest={dest}
        route={route}
        hasRoutes={routePlan.routes.length > 0}
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
          {routePlan.routeStation && (
            <StationAim
              station={routePlan.routeStation}
              mode={routePlan.routeMode}
              disabled={disabled}
              onSet={routePlan.setRouteMode}
            />
          )}

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
              routePlan.setRouteDestination(null)
            }}
          />

          {dest && (
            <ReserveRow
              reserve={Math.min(routePlan.routeReserve, plan.me.ship.reactionMass)}
              max={plan.me.ship.reactionMass}
              disabled={disabled}
              onSet={routePlan.setRouteReserve}
            />
          )}

          {dest && routePlan.routes.length === 0 && (
            <Typography
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.74rem',
                color: TABLE.inkSoft,
                lineHeight: 1.4,
              }}
            >
              {routePlan.routeReserve > 0
                ? fill(T.noRouteReserve, {
                    turns: ROUTE_SEARCH_TURNS,
                    fuel: Math.min(routePlan.routeReserve, plan.me.ship.reactionMass),
                  })
                : fill(T.noRoute, { turns: ROUTE_SEARCH_TURNS })}
            </Typography>
          )}

          {route && (
            <>
              <RouteTable
                routes={routePlan.routes}
                selected={routePlan.routeIndex}
                onSelect={routePlan.selectRoute}
              />
              <Itinerary route={route} facing={plan.me.ship.facing} taken={taken} />
              <FirstStep
                step={route.steps[0]}
                facing={plan.me.ship.facing}
                taken={taken}
                disabled={disabled}
                onTake={routePlan.applyRouteStep}
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
          {T.title}
        </SectionLabel>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {!open && !dest && (
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkFaint }}
            noWrap
          >
            {T.plot}
          </Typography>
        )}
        {!open && taken && (
          <Typography
            sx={{
              fontFamily: FONT_MONO,
              fontSize: '0.72rem',
              fontWeight: 700,
              color: TABLE.accent,
            }}
            noWrap
          >
            {T.taken}
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
            {T.mark}
          </Typography>
          <Typography
            sx={{ fontFamily: FONT_MONO, fontSize: '0.74rem', color: TABLE.inkSoft, minWidth: 0 }}
            noWrap
          >
            {placeLabel(dest)}
            {route ? fill(T.summary, { turns: route.totalTurns, fuel: route.totalMassCost }) : ''}
            {!hasRoutes ? T.noRouteShort : ''}
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
/**
 * A station is not a place: it advances STATION_DRIFT sectors at the end of every round,
 * so a route to the sector it is on now lands where it used to be. Clicking
 * one aims at where it will be when the ship gets there; this is the way back
 * to the fixed sector, for the rare turn when that is what you meant.
 */
function StationAim({
  station,
  mode,
  disabled,
  onSet,
}: {
  station: Station
  mode: RouteMode
  disabled: boolean
  onSet: (mode: RouteMode) => void
}) {
  const options: Array<{ value: RouteMode; label: string; tip: string }> = [
    {
      value: 'meet',
      label: T.meet,
      tip: fill(T.meetTip, { drift: STATION_DRIFT }),
    },
    {
      value: 'sector',
      label: fill(T.sector, { sector: station.sector }),
      tip: T.sectorTip,
    },
  ]
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <SectionLabel sx={{ flexShrink: 0, mr: 0.25 }}>
        {fill(T.station, { planet: getWellName(station.planetId) })}
      </SectionLabel>
      {options.map(option => {
        const on = mode === option.value
        return (
          <Tooltip key={option.value} title={option.tip}>
            <Box
              component="button"
              type="button"
              disabled={disabled}
              onClick={() => onSet(option.value)}
              sx={{
                fontFamily: FONT_MONO,
                fontSize: '0.72rem',
                fontWeight: 700,
                px: 0.6,
                py: '1px',
                borderRadius: 0,
                cursor: disabled ? 'default' : 'pointer',
                color: on ? TABLE.onSelected : TABLE.inkSoft,
                border: `1px solid ${on ? TABLE.selected : TABLE.plateEdge}`,
                bgcolor: on ? TABLE.selected : 'transparent',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {option.label}
            </Box>
          </Tooltip>
        )
      })}
    </Box>
  )
}

/**
 * Fuel to arrive with: a Tanker's card, or a margin for the trip after. The
 * route is planned as if that fuel were not aboard, so it coasts where it
 * would otherwise burn.
 */
function ReserveRow({
  reserve,
  max,
  disabled,
  onSet,
}: {
  reserve: number
  max: number
  disabled: boolean
  onSet: (fuel: number) => void
}) {
  const step = (by: number) => onSet(Math.max(0, Math.min(max, reserve + by)))
  const button = (by: number, label: string, tip: string) => (
    <Tooltip title={tip}>
      <span>
        <Box
          component="button"
          type="button"
          aria-label={tip}
          disabled={disabled || reserve + by < 0 || reserve + by > max}
          onClick={() => step(by)}
          sx={{
            fontFamily: FONT_MONO,
            fontSize: '0.72rem',
            fontWeight: 700,
            width: 20,
            py: '1px',
            borderRadius: 0,
            cursor: 'pointer',
            color: TABLE.inkSoft,
            border: `1px solid ${TABLE.plateEdge}`,
            bgcolor: 'transparent',
            '&:disabled': { opacity: 0.4, cursor: 'default' },
          }}
        >
          {label}
        </Box>
      </span>
    </Tooltip>
  )
  return (
    <Box
      data-testid="route-reserve"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
    >
      <SectionLabel sx={{ flexShrink: 0, mr: 0.25 }}>{T.arriveWith}</SectionLabel>
      {button(-1, T.less, T.lessTip)}
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontSize: '0.8rem',
          fontWeight: 700,
          color: reserve > 0 ? TABLE.ink : TABLE.inkFaint,
          minWidth: 44,
          textAlign: 'center',
        }}
      >
        {fill(T.reserve, { fuel: reserve })}
      </Typography>
      {button(1, T.more, T.moreTip)}
    </Box>
  )
}

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
          border: `1px solid ${TABLE.accent}`,
          bgcolor: RED_TINT,
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
          {T.picking}
        </Typography>
        <Button
          size="small"
          data-testid="route-cancel-pick"
          onClick={onPick}
          sx={{ minWidth: 0, px: 0.75, py: 0, fontSize: '0.72rem', color: TABLE.inkSoft }}
        >
          {T.cancel}
        </Button>
      </Box>
    )
  }

  if (!dest) {
    return (
      <Tooltip title={T.pickTip}>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          data-testid="route-pick-destination"
          aria-label={T.pick}
          startIcon={<MyLocationIcon sx={{ fontSize: 15 }} />}
          disabled={disabled}
          onClick={onPick}
          sx={{ justifyContent: 'flex-start', py: 0.3, fontSize: '0.74rem' }}
        >
          {T.pick}
        </Button>
      </Tooltip>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
      <Typography sx={{ fontFamily: FONT_MONO, fontSize: '0.8rem', color: ROUTE, flexShrink: 0 }}>
        {T.mark}
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
      <Tooltip title={T.repickTip}>
        <Button
          size="small"
          data-testid="route-repick"
          aria-label={T.repickLabel}
          disabled={disabled}
          onClick={onPick}
          sx={{ minWidth: 0, px: 0.6, py: 0, fontSize: '0.72rem', flexShrink: 0 }}
        >
          {T.repick}
        </Button>
      </Tooltip>
      <Tooltip title={T.clearTip}>
        <Button
          size="small"
          data-testid="route-clear"
          aria-label={T.clearLabel}
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
        <SectionLabel sx={{ lineHeight: 1.3 }}>{T.columns.route}</SectionLabel>
        <SectionLabel sx={{ lineHeight: 1.3, textAlign: 'right' }}>{T.columns.turns}</SectionLabel>
        <SectionLabel sx={{ lineHeight: 1.3, textAlign: 'right' }}>{T.columns.fuel}</SectionLabel>
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
                border: `1px solid ${on ? TABLE.selected : 'transparent'}`,
                borderRadius: 0,
                bgcolor: on ? TABLE.selected : 'transparent',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                '&:hover': { bgcolor: on ? TABLE.selected : HOVER_TINT },
              }}
            >
              <Typography
                sx={{
                  fontFamily: FONT_MONO,
                  fontSize: '0.76rem',
                  fontWeight: on ? 700 : 400,
                  color: on ? TABLE.onSelected : TABLE.inkSoft,
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
        color: on ? TABLE.onSelected : (tint ?? TABLE.ink),
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
      <SectionLabel sx={{ lineHeight: 1.3, pl: 0.6 }}>{T.itinerary}</SectionLabel>
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
          <LegRow
            index={null}
            text={fill(hidden > 1 ? T.hidden.many : T.hidden.one, { count: hidden })}
            now={false}
          />
        )}
        <LegRow
          index={T.mark}
          text={fill(T.arrive, { place: placeLabel(route.destination) })}
          now={false}
          arrival
        />
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
          border:
            index === null || arrival ? 'none' : `1px solid ${now ? TABLE.accent : ROUTE_FAINT}`,
          bgcolor: taken ? TABLE.selected : arrival ? 'transparent' : TABLE.plateSunk,
          color: taken ? TABLE.onSelected : now ? TABLE.accent : arrival ? ROUTE : TABLE.inkFaint,
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
          titleAccess={T.rotateFirst}
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
          {T.thisTurn}
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
          border: `1px solid ${TABLE.accentDim}`,
          bgcolor: RED_TINT,
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
          {T.stepTaken}
        </Typography>
      </Box>
    )
  }

  return (
    <Tooltip title={fill(T.takeTip, { step: describeStep(step, facing) })}>
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
            '&:hover': { borderColor: TABLE.accent, bgcolor: RED_TINT },
          }}
        >
          {T.take}
        </Button>
      </Box>
    </Tooltip>
  )
}
