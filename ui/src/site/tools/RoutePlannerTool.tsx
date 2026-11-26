/**
 * The route planner, off the table.
 *
 * It is the game's own board and the game's own planner, with the seat taken
 * out. The ship and the destination are set either way a table wants: typed
 * (body, ring, sector, which is quicker on a phone) or clicked on the board.
 * A destination is a sector or a planet's station, and a station moves, so a
 * route to one is planned against where the station will be when the ship
 * gets there (the forward search with `stationTarget`, as the bots do), not
 * against the sector it is on now. Every destination gets the same three
 * alternatives, fastest, balanced and economical: from the reverse search to
 * a fixed sector, from the forward search to a station or when the route
 * must arrive with fuel aboard, since only that search knows the tank at
 * every step.
 *
 * At the table the route is followed a turn at a time: Done on its first
 * step moves the ship and the stations on and keeps the rest of the route
 * (`routeProgress.ts`), and any edit plans afresh.
 *
 * On a phone the two plates fold to one line each, so the board sits near
 * the top with the route's steps under it.
 *
 * Under the planner sit the orbital windows (`OrbitalWindows.tsx`), read off
 * the same station clock the "Stations now at" control sets.
 *
 * The board renders a `BoardModel` and only that (`components/board/model.ts`),
 * which is what lets it run with no game behind it: this builds one with the
 * model's own `quietBoardModel` and `crowdShips`, as the 3D dev harness does.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Box, useMediaQuery, type Theme } from '@mui/material'
import type { Facing, GravityWellId, MovementPlan, Position } from '@dangerous-inclinations/engine'
import {
  GRAVITY_WELLS,
  MAX_REACTION_MASS,
  SECTORS_PER_RING,
  STATION_DRIFT,
  STATION_RING,
  STARTING_HIT_POINTS,
  createInitialStations,
  fill,
  getMaxRing,
  getWellName,
  isPlanet,
  staticTarget,
  stationSectors,
  planAlternativesToTarget,
  planMovementAlternatives,
  samePosition,
  stationPosition,
  stationTarget,
} from '@dangerous-inclinations/engine'
import {
  crowdShips,
  quietBoardModel,
  stationMarkers,
  type BoardModel,
} from '../../components/board/model'
import { GameBoardSvg } from '../../components/board/svg/GameBoardSvg'
import { getPlayerColor } from '../../utils/playerColors'
import { ROUTE_SEARCH_TURNS, placeLabel, routeLegs, routeName } from '../../utils/route'
import { FONT_SANS } from '../../theme'
import { TABLE } from '../../design/tokens'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Field, Label, Segments, Stepper, Toggle } from './controls'
import { OrbitalWindows } from './OrbitalWindows'
import { edit, hasArrived, markDone, startTrip, undoDone, type Trip } from './routeProgress'
import { TOOLS } from '../../text/tools'

const T = TOOLS.route

const SHIP_ID = 'planner'
/** The sectors a station can stand on: the station clock's readings. */
const STATION_CLOCK = stationSectors()
const SHIP_COLOR = getPlayerColor(0)

/** What a tap on the board sets. */
type Picking = 'ship' | 'destination'

/** Where the ship is going: a fixed sector, or a planet's station, which moves. */
type Destination = { kind: 'sector'; at: Position } | { kind: 'station'; planetId: GravityWellId }

const BODIES = GRAVITY_WELLS.map(well => ({
  value: well.id,
  label: well.type === 'planet' ? well.name : T.blackHole,
}))

const rings = (wellId: GravityWellId) =>
  Array.from({ length: getMaxRing(wellId) }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}`,
  }))

/** Body, ring and sector: typed, for the phone at the table. */
function PlaceInput({
  value,
  onChange,
  label,
}: {
  value: Position
  onChange: (next: Position) => void
  label: string
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Field label={T.body}>
        <Segments
          value={value.wellId}
          options={BODIES}
          onChange={wellId =>
            onChange({ ...value, wellId, ring: Math.min(value.ring, getMaxRing(wellId)) })
          }
        />
      </Field>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Field label={T.ring}>
          <Segments
            value={String(value.ring)}
            options={rings(value.wellId)}
            onChange={ring => onChange({ ...value, ring: Number(ring) })}
          />
        </Field>
        <Field label={T.sector}>
          <Stepper
            value={value.sector}
            min={0}
            max={SECTORS_PER_RING - 1}
            wrap
            editable
            onChange={sector => onChange({ ...value, sector })}
            label={fill(T.sectorOf, { place: label })}
          />
        </Field>
      </Box>
    </Box>
  )
}

const CAPS = {
  fontFamily: FONT_DISPLAY,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
} as const

/** A pressable block in the press's idiom, at least 44px. */
function Press({
  onClick,
  children,
  red = false,
}: {
  onClick: () => void
  children: ReactNode
  red?: boolean
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        minHeight: 44,
        minWidth: 44,
        px: 1.75,
        border: `3px solid ${red ? PRESS.red : PRESS.ink}`,
        bgcolor: red ? PRESS.red : PRESS.paper,
        color: red ? PRESS.paper : PRESS.ink,
        ...CAPS,
        fontWeight: 700,
        fontSize: '1rem',
        cursor: 'pointer',
        touchAction: 'manipulation',
        // A finger's tap leaves :hover on; only a mouse gets it.
        '@media (hover: hover)': {
          '&:hover': { bgcolor: PRESS.ink, borderColor: PRESS.ink, color: PRESS.paper },
        },
      }}
    >
      {children}
    </Box>
  )
}

/**
 * A plate's head: its name and what is set on it, on one line. On a phone it
 * is the button that opens the plate; on a wide screen the plate is always
 * open and the head only names it.
 */
function PlateHead({
  title,
  summary,
  open,
  onToggle,
}: {
  title: string
  summary: string
  open: boolean
  /** Null when the plate does not fold. */
  onToggle: (() => void) | null
}) {
  const filled = open && onToggle !== null
  return (
    <Box
      component={onToggle ? 'button' : 'div'}
      type={onToggle ? 'button' : undefined}
      aria-expanded={onToggle ? open : undefined}
      onClick={onToggle ?? undefined}
      sx={{
        width: '100%',
        minWidth: 0,
        minHeight: 56,
        px: 1.5,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        textAlign: 'left',
        border: `4px solid ${PRESS.ink}`,
        borderBottomWidth: onToggle ? 4 : 0,
        bgcolor: filled || !onToggle ? PRESS.ink : PRESS.paper,
        color: filled || !onToggle ? PRESS.paper : PRESS.ink,
        cursor: onToggle ? 'pointer' : 'default',
        touchAction: 'manipulation',
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ ...CAPS, fontSize: '0.8rem', color: PRESS.red }}>{title}</Box>
        <Box
          sx={{
            ...CAPS,
            fontSize: '0.95rem',
            fontWeight: 700,
            lineHeight: 1.2,
            overflowWrap: 'anywhere',
          }}
        >
          {summary}
        </Box>
      </Box>
      {onToggle && (
        <Box aria-hidden sx={{ fontFamily: FONT_DISPLAY, fontSize: '1.2rem', flexShrink: 0 }}>
          {open ? '▴' : '▾'}
        </Box>
      )}
    </Box>
  )
}

/** The plate under a head. */
function PlateBody({ children, area }: { children: ReactNode; area: string }) {
  return (
    <Box
      sx={{
        gridArea: area,
        minWidth: 0,
        p: { xs: 1.5, sm: 2.5 },
        border: `4px solid ${PRESS.ink}`,
        borderTop: 'none',
        bgcolor: PRESS.paper,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {children}
    </Box>
  )
}

type Open = 'ship' | 'destination' | null

export function RoutePlannerTool() {
  const wide = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'), { noSsr: true })
  /** On a phone one plate is open at a time, and none to begin with. */
  const [open, setOpen] = useState<Open>(null)
  const toggle = (plate: Exclude<Open, null>) =>
    wide ? null : () => setOpen(o => (o === plate ? null : plate))
  const shows = (plate: Exclude<Open, null>) => wide || open === plate

  const [trip, setTrip] = useState<Trip>(() =>
    startTrip(
      {
        at: { wellId: 'blackhole', ring: 3, sector: 0 },
        facing: 'prograde',
        fuel: MAX_REACTION_MASS,
      },
      createInitialStations()
    )
  )
  const [destination, setDestinationRaw] = useState<Destination>({
    kind: 'station',
    planetId: 'planet-alpha',
  })
  /**
   * Fuel the route must still have aboard on arrival: a Tanker's card, say.
   * It may run lower on the way and scoop back up.
   */
  const [reserve, setReserveRaw] = useState(0)
  const [compressor, setCompressorRaw] = useState(false)
  const [picking, setPicking] = useState<Picking>('destination')
  const [chosen, setChosen] = useState(0)

  const { ship, stations, kept } = trip
  const from = ship.at
  const { facing, fuel } = ship
  const keep = Math.min(reserve, fuel)

  // Every input set by hand drops a kept route: the tool plans afresh.
  const setShip = (change: Partial<typeof ship>) =>
    setTrip(t => edit(t, { ship: { ...t.ship, ...change } }))
  const setFrom = (at: Position) => setShip({ at })
  const setFacing = (next: Facing) => setShip({ facing: next })
  const setFuel = (next: number) => setShip({ fuel: next })
  const dropKept = () => setTrip(t => edit(t))
  const setDestination = (next: Destination) => {
    setDestinationRaw(next)
    dropKept()
  }
  const setReserve = (next: number) => {
    setReserveRaw(next)
    dropKept()
  }
  const setCompressor = (next: boolean) => {
    setCompressorRaw(next)
    dropKept()
  }

  const station =
    destination.kind === 'station' ? stations.find(s => s.planetId === destination.planetId) : null
  // The stations all step together, so one reading moves all three, and a
  // station only ever stands on a sector of its clock.
  const moveStations = (sector: number) =>
    setTrip(t => edit(t, { stations: t.stations.map(s => ({ ...s, sector })) }))

  const options = {
    availableMass: fuel,
    hasFuelScoop: true,
    maxFuelCapacity: MAX_REACTION_MASS,
    hasFuelCompressor: compressor,
    allowWellTransfers: true,
    maxTurns: ROUTE_SEARCH_TURNS,
    arrivalMass: keep,
  }

  const following = kept !== null
  const routes = useMemo<MovementPlan[]>(() => {
    // A kept route is followed, not searched for again.
    if (following) return []
    const origin = { ...from, facing }
    if (destination.kind === 'station') {
      if (!station) return []
      const target = stationTarget(station)
      return planAlternativesToTarget(origin, target, options)?.alternatives ?? []
    }
    if (samePosition(from, destination.at)) return []
    // Only the forward search knows the fuel at every step, so a route that
    // has to arrive with some is planned by it.
    if (keep > 0) {
      const target = staticTarget(destination.at)
      return planAlternativesToTarget(origin, target, options)?.alternatives ?? []
    }
    return planMovementAlternatives(origin, destination.at, options)?.alternatives ?? []
    // `options` is rebuilt from these every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, from, facing, destination, station, fuel, keep, compressor])

  const current = Math.min(chosen, Math.max(0, routes.length - 1))
  const route = kept ?? routes[current] ?? null
  const arrived = hasArrived(trip)

  /** A tap on the board: the ship, a station (which then moves), or a sector. */
  const pick = (position: Position) => {
    if (picking === 'ship') return setFrom(position)
    const hit = stations.find(s => samePosition(stationPosition(s), position))
    setDestination(
      hit ? { kind: 'station', planetId: hit.planetId } : { kind: 'sector', at: position }
    )
  }

  const model = useMemo<BoardModel>(
    () =>
      quietBoardModel({
        ships: crowdShips(
          [
            {
              playerId: SHIP_ID,
              name: T.shipName,
              color: SHIP_COLOR,
              position: from,
              facing,
              escorts: [],
              isActive: true,
              isMe: true,
              hitPoints: STARTING_HIT_POINTS,
              maxHitPoints: STARTING_HIT_POINTS,
              heat: 0,
            },
          ],
          stations.map(stationPosition)
        ),
        stations: stationMarkers(stations),
        route: arrived ? null : route,
        onPickDestination: pick,
        colorOf: () => SHIP_COLOR,
        nameOf: () => T.shipName,
      }),
    // `pick` closes over these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, facing, route, arrived, stations, picking, destination]
  )

  const legs = route ? routeLegs(route.steps) : []
  const where =
    destination.kind === 'station' && station
      ? fill(T.station, { planet: getWellName(station.planetId) })
      : destination.kind === 'sector'
        ? placeLabel(destination.at)
        : ''
  const arrival =
    destination.kind === 'station' && station && route && !arrived
      ? stationTarget(station).positionAt(route.totalTurns).sector
      : null
  const shipSummary = fill(T.shipSummary, {
    place: placeLabel(from),
    facing: facing === 'prograde' ? T.prograde : T.retrograde,
    fuel,
  })

  const done = () => route && setTrip(t => markDone(t, route))
  const undo = () => setTrip(undoDone)
  const canUndo = trip.history.length > 0

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 1.5, md: 2 } }}>
      <Box
        sx={{
          display: 'grid',
          columnGap: { xs: '4px', md: 2 },
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gridTemplateAreas: {
            xs: '"shipHead whereHead" "body body"',
            md: '"shipHead whereHead" "shipBody whereBody"',
          },
        }}
      >
        <Box sx={{ gridArea: 'shipHead', minWidth: 0, display: 'flex' }}>
          <PlateHead
            title={T.ship}
            summary={shipSummary}
            open={open === 'ship'}
            onToggle={toggle('ship')}
          />
        </Box>
        <Box sx={{ gridArea: 'whereHead', minWidth: 0, display: 'flex' }}>
          <PlateHead
            title={T.whereTo}
            summary={where}
            open={open === 'destination'}
            onToggle={toggle('destination')}
          />
        </Box>

        {shows('ship') && (
          <PlateBody area={wide ? 'shipBody' : 'body'}>
            <PlaceInput value={from} onChange={setFrom} label={T.shipPlace} />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label={T.facing}>
                <Segments
                  value={facing}
                  options={[
                    { value: 'prograde' as Facing, label: T.prograde },
                    { value: 'retrograde' as Facing, label: T.retrograde },
                  ]}
                  onChange={setFacing}
                />
              </Field>
              <Field label={T.fuel}>
                <Stepper
                  value={fuel}
                  min={0}
                  max={MAX_REACTION_MASS}
                  onChange={setFuel}
                  label={T.fuelAloud}
                />
              </Field>
              <Field label={T.arriveWith}>
                <Stepper
                  value={keep}
                  min={0}
                  max={fuel}
                  onChange={setReserve}
                  label={T.arriveWithAloud}
                />
              </Field>
              <Toggle on={compressor} label={T.compressor} onChange={setCompressor} />
            </Box>
          </PlateBody>
        )}

        {shows('destination') && (
          <PlateBody area={wide ? 'whereBody' : 'body'}>
            <Segments
              value={destination.kind}
              options={[
                { value: 'station', label: T.aStation },
                { value: 'sector', label: T.aSector },
              ]}
              onChange={kind =>
                setDestination(
                  kind === 'station'
                    ? {
                        kind: 'station',
                        planetId: isPlanet(from.wellId) ? from.wellId : 'planet-alpha',
                      }
                    : { kind: 'sector', at: station ? stationPosition(station) : from }
                )
              }
            />
            {destination.kind === 'station' && station ? (
              <>
                <Field label={T.planet}>
                  <Segments
                    value={station.planetId}
                    options={BODIES.filter(b => isPlanet(b.value))}
                    onChange={planetId => setDestination({ kind: 'station', planetId })}
                  />
                </Field>
                <Field label={fill(T.stationsAt, { ring: STATION_RING })}>
                  <Segments
                    value={String(station.sector)}
                    options={STATION_CLOCK.map(sector => ({
                      value: String(sector),
                      label: sector,
                    }))}
                    onChange={sector => moveStations(Number(sector))}
                  />
                </Field>
                <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem', color: PRESS.inkSoft }}>
                  {fill(T.stationsMove, { drift: STATION_DRIFT })}
                </Box>
              </>
            ) : destination.kind === 'sector' ? (
              <PlaceInput
                value={destination.at}
                onChange={at => setDestination({ kind: 'sector', at })}
                label={T.destinationPlace}
              />
            ) : null}
          </PlateBody>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          columnGap: 1.5,
          rowGap: 0.5,
          flexWrap: 'wrap',
        }}
      >
        <Label>{T.tapSets}</Label>
        <Segments
          value={picking}
          options={[
            { value: 'ship' as Picking, label: T.theShip },
            { value: 'destination' as Picking, label: T.whereTo },
          ]}
          onChange={setPicking}
        />
        <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem', color: PRESS.inkSoft }}>
          {T.tapStation}
        </Box>
      </Box>

      <Box
        sx={{
          position: 'relative',
          height: { xs: '62svh', md: 'min(68vh, 680px)' },
          minHeight: 320,
          border: `4px solid ${PRESS.ink}`,
          overflow: 'hidden',
          bgcolor: TABLE.felt,
        }}
      >
        <GameBoardSvg model={model} fitRoute />
      </Box>

      <Box sx={{ border: `4px solid ${PRESS.ink}`, bgcolor: PRESS.paper, minWidth: 0 }}>
        <Box
          sx={{
            bgcolor: PRESS.ink,
            color: PRESS.paper,
            px: { xs: 1.5, sm: 2 },
            py: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'baseline',
            ...CAPS,
          }}
        >
          <Box component="span" sx={{ fontSize: '1.1rem' }}>
            {T.theRoute}
          </Box>
          <Box
            component="span"
            sx={{
              ml: 'auto',
              fontSize: '0.9rem',
              color: PRESS.paperSoft,
              overflowWrap: 'anywhere',
            }}
          >
            {fill(T.fromTo, { from: placeLabel(from), to: where })}
            {arrival !== null && fill(T.onArrival, { sector: arrival })}
          </Box>
        </Box>
        <Box sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {arrived ? (
            <Box sx={{ fontFamily: FONT_SANS, fontSize: '1rem', fontWeight: 600 }}>
              {fill(T.arrived, { to: where })}
            </Box>
          ) : !route ? (
            <Box sx={{ fontFamily: FONT_SANS, fontSize: '1rem' }}>
              {destination.kind === 'sector' && samePosition(from, destination.at)
                ? T.alreadyThere
                : keep > 0
                  ? fill(T.noRouteKeeping, { turns: ROUTE_SEARCH_TURNS, fuel, keep })
                  : fill(T.noRoute, { turns: ROUTE_SEARCH_TURNS, fuel })}
            </Box>
          ) : (
            <>
              {kept ? (
                <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.95rem' }}>
                  {fill(T.following, {
                    name: routeName(kept, current),
                    turns: kept.totalTurns,
                  })}
                </Box>
              ) : (
                <Segments
                  value={String(current)}
                  options={routes.map((alternative, index) => ({
                    value: String(index),
                    label: fill(T.alternative, {
                      name: routeName(alternative, index),
                      turns: alternative.totalTurns,
                      fuel: alternative.totalMassCost,
                    }),
                  }))}
                  onChange={index => setChosen(Number(index))}
                />
              )}
              <Box
                component="ol"
                sx={{
                  listStyle: 'none',
                  m: 0,
                  p: 0,
                  display: 'grid',
                  gap: '4px',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))',
                }}
              >
                {legs.map((leg, index) => (
                  <Box
                    component="li"
                    key={index}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '34px minmax(0, 1fr) auto auto',
                      alignItems: 'center',
                      gap: 1,
                      minHeight: 44,
                      // The turn being made gets the whole width, with its Done.
                      gridColumn: index === 0 ? '1 / -1' : undefined,
                      border: `2px solid ${PRESS.ink}`,
                      bgcolor: index === 0 ? PRESS.ink : 'transparent',
                      color: index === 0 ? PRESS.paper : PRESS.ink,
                      pr: index === 0 ? 0 : 1,
                    }}
                  >
                    <Box
                      sx={{
                        alignSelf: 'stretch',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: PRESS.red,
                        color: PRESS.paper,
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 700,
                        fontSize: '1.2rem',
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Box
                      sx={{
                        fontFamily: FONT_SANS,
                        fontSize: '0.95rem',
                        py: 0.75,
                        lineHeight: 1.25,
                      }}
                    >
                      {leg.rotate && (
                        <Box
                          component="b"
                          sx={{ color: index === 0 ? PRESS.paper : PRESS.redText }}
                        >
                          {T.rotate}
                        </Box>
                      )}
                      {leg.text}
                    </Box>
                    <Box sx={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.05rem' }}>
                      {leg.massCost > 0
                        ? `−${leg.massCost}`
                        : leg.massCost < 0
                          ? `+${-leg.massCost}`
                          : ''}
                    </Box>
                    {index === 0 ? (
                      <Box sx={{ alignSelf: 'stretch', display: 'flex' }}>
                        <Press red onClick={done}>
                          {T.done}
                        </Press>
                      </Box>
                    ) : (
                      <span />
                    )}
                  </Box>
                ))}
              </Box>
              <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem', color: PRESS.inkSoft }}>
                {T.legsNote}
              </Box>
            </>
          )}
          {canUndo && (
            <Box>
              <Press onClick={undo}>{T.undo}</Press>
            </Box>
          )}
        </Box>
      </Box>

      <OrbitalWindows now={stations[0].sector} />
    </Box>
  )
}
