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
import { Box, Typography } from '@mui/material'
import { fill } from '@dangerous-inclinations/engine'
import { usePlan } from '../../context/PlanContext'
import { moveOfRouteStep, useRoutePlan } from '../../context/RoutePlanContext'
import type { MoveChoice } from '../../plan/preview'
import { ROUTE_SEARCH_TURNS } from '../../utils/route'
import { FONT_MONO } from '../../theme'
import { TABLE } from '../../design/tokens'
import { ROUTE_FAINT, T } from './routePlanner/style'
import { PlannerHeader } from './routePlanner/PlannerHeader'
import { ReserveRow, StationAim } from './routePlanner/PlanOptions'
import { DestinationRow } from './routePlanner/DestinationRow'
import { RouteTable } from './routePlanner/RouteTable'
import { Itinerary } from './routePlanner/Itinerary'
import { FirstStep } from './routePlanner/FirstStep'

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
      (first.actionType === 'coast' || first.from.facing === plan.moveFrom.facing)
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
              <Itinerary route={route} taken={taken} />
              <FirstStep
                step={route.steps[0]}
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
