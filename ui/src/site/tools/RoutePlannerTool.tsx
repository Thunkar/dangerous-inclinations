/**
 * The route planner, off the table.
 *
 * It is the game's own board and the game's own planner, with the seat taken
 * out. The ship and the destination are set either way a table wants: typed
 * (body, ring, sector, which is quicker on a phone) or clicked on the board.
 * A destination is a sector or a planet's station, and a station moves, so a
 * route to one is planned against where the station will be when the ship
 * gets there (`planMovementToTarget` with `orbitingTarget`, as the bots do),
 * not against the sector it is on now.
 *
 * The board renders a `BoardModel` and only that (`components/board/model.ts`),
 * which is what lets it run with no game behind it: this builds one by hand,
 * the way the 3D dev harness does.
 */
import { useMemo, useState } from 'react'
import { Box } from '@mui/material'
import type {
  Facing,
  GravityWellId,
  MovementPlan,
  Position,
  Station,
} from '@dangerous-inclinations/engine'
import {
  GRAVITY_WELLS,
  MAX_REACTION_MASS,
  SECTORS_PER_RING,
  STATION_RING,
  createInitialStations,
  getMaxRing,
  getWellName,
  isPlanet,
  orbitingTarget,
  planMovementAlternatives,
  planMovementToTarget,
  wrapSector,
} from '@dangerous-inclinations/engine'
import type { BoardModel } from '../../components/board/model'
import { GameBoardSvg } from '../../components/board/svg/GameBoardSvg'
import { getPlayerColor } from '../../utils/playerColors'
import { placeLabel, routeLegs, routeName } from '../../utils/route'
import { FONT_SANS, TABLE } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { STATION_DRIFT } from '../turn'
import { Field, Label, Plate, Segments, Stepper, Toggle } from './controls'

/** How far the search looks before it gives up. The turn column uses 20 too. */
const MAX_TURNS = 20

const SHIP_ID = 'planner'
const SHIP_COLOR = getPlayerColor(0)

/** What a click on the board sets. */
type Picking = 'ship' | 'destination'

/** Where the ship is going: a fixed sector, or a planet's station, which moves. */
type Destination = { kind: 'sector'; at: Position } | { kind: 'station'; planetId: GravityWellId }

const same = (a: Position, b: Position) =>
  a.wellId === b.wellId && a.ring === b.ring && a.sector === b.sector

const BODIES = GRAVITY_WELLS.map(well => ({
  value: well.id,
  label: well.type === 'planet' ? well.name : 'Black hole',
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
      <Field label="Body">
        <Segments
          value={value.wellId}
          options={BODIES}
          onChange={wellId =>
            onChange({ ...value, wellId, ring: Math.min(value.ring, getMaxRing(wellId)) })
          }
        />
      </Field>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Field label="Ring">
          <Segments
            value={String(value.ring)}
            options={rings(value.wellId)}
            onChange={ring => onChange({ ...value, ring: Number(ring) })}
          />
        </Field>
        <Field label="Sector">
          <Stepper
            value={value.sector}
            min={0}
            max={SECTORS_PER_RING - 1}
            wrap
            editable
            onChange={sector => onChange({ ...value, sector })}
            label={`${label} sector`}
          />
        </Field>
      </Box>
    </Box>
  )
}

export function RoutePlannerTool() {
  const [from, setFrom] = useState<Position>({ wellId: 'blackhole', ring: 3, sector: 0 })
  const [destination, setDestination] = useState<Destination>({
    kind: 'station',
    planetId: 'planet-alpha',
  })
  const [stations, setStations] = useState<Station[]>(() => createInitialStations())
  const [facing, setFacing] = useState<Facing>('prograde')
  const [fuel, setFuel] = useState(MAX_REACTION_MASS)
  const [compressor, setCompressor] = useState(false)
  const [picking, setPicking] = useState<Picking>('destination')
  const [chosen, setChosen] = useState(0)

  const station =
    destination.kind === 'station' ? stations.find(s => s.planetId === destination.planetId) : null
  const stationAt = (s: Station): Position => ({
    wellId: s.planetId,
    ring: s.ring,
    sector: s.sector,
  })
  const moveStation = (planetId: GravityWellId, sector: number) =>
    setStations(all => all.map(s => (s.planetId === planetId ? { ...s, sector } : s)))

  const options = {
    availableMass: fuel,
    hasFuelScoop: true,
    maxFuelCapacity: MAX_REACTION_MASS,
    hasFuelCompressor: compressor,
    allowWellTransfers: true,
    maxTurns: MAX_TURNS,
  }

  const routes = useMemo<MovementPlan[]>(() => {
    const origin = { ...from, facing }
    if (destination.kind === 'station') {
      if (!station) return []
      const plan = planMovementToTarget(
        origin,
        orbitingTarget(stationAt(station), STATION_DRIFT),
        options
      )
      return plan ? [{ ...plan, label: 'fastest' }] : []
    }
    if (same(from, destination.at)) return []
    return planMovementAlternatives(origin, destination.at, options)?.alternatives ?? []
    // `options` is rebuilt from these every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, facing, destination, station, fuel, compressor])

  const current = Math.min(chosen, Math.max(0, routes.length - 1))
  const route = routes[current] ?? null

  /** A click on the board: the ship, a station (which then moves), or a sector. */
  const pick = (position: Position) => {
    if (picking === 'ship') return setFrom(position)
    const hit = stations.find(s => same(stationAt(s), position))
    setDestination(
      hit ? { kind: 'station', planetId: hit.planetId } : { kind: 'sector', at: position }
    )
  }

  const model = useMemo<BoardModel>(
    () => ({
      ships: [
        {
          playerId: SHIP_ID,
          name: 'your ship',
          color: SHIP_COLOR,
          position: from,
          facing,
          crowd: { index: 0, count: 1 },
          isActive: true,
          isMe: true,
          hitPoints: 10,
          maxHitPoints: 10,
          heat: 0,
        },
      ],
      homes: [],
      stations,
      missiles: [],
      missilePreviews: [],
      plannedPoints: [],
      route,
      focusWeapon: null,
      rangeCells: [],
      missilePaths: {},
      selectableIds: [],
      activeLaneIds: [],
      onPickDestination: pick,
      onPickTarget: null,
      deployment: null,
      animating: false,
      effects: [],
      ping: null,
      myColor: SHIP_COLOR,
      colorOf: () => SHIP_COLOR,
      nameOf: () => 'your ship',
      positionOf: playerId => (playerId === SHIP_ID ? from : null),
      pointOf: () => null,
    }),
    // `pick` closes over these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, facing, route, stations, picking]
  )

  const legs = route ? routeLegs(route.steps, facing) : []
  const where =
    destination.kind === 'station' && station
      ? `${getWellName(station.planetId)} station`
      : destination.kind === 'sector'
        ? placeLabel(destination.at)
        : ''
  const arrival =
    destination.kind === 'station' && station && route
      ? wrapSector(station.sector + STATION_DRIFT * Math.max(0, route.totalTurns - 1))
      : null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Plate>
          <Label>Your ship</Label>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
            <PlaceInput value={from} onChange={setFrom} label="ship" />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <Field label="Facing">
                <Segments
                  value={facing}
                  options={[
                    { value: 'prograde' as Facing, label: 'Prograde' },
                    { value: 'retrograde' as Facing, label: 'Retrograde' },
                  ]}
                  onChange={setFacing}
                />
              </Field>
              <Field label="Fuel">
                <Stepper
                  value={fuel}
                  min={0}
                  max={MAX_REACTION_MASS}
                  onChange={setFuel}
                  label="fuel"
                />
              </Field>
              <Toggle on={compressor} label="Compressor" onChange={setCompressor} />
            </Box>
          </Box>
        </Plate>

        <Plate>
          <Label>Where to</Label>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1.5 }}>
            <Segments
              value={destination.kind}
              options={[
                { value: 'station', label: 'A station' },
                { value: 'sector', label: 'A sector' },
              ]}
              onChange={kind =>
                setDestination(
                  kind === 'station'
                    ? {
                        kind: 'station',
                        planetId: isPlanet(from.wellId) ? from.wellId : 'planet-alpha',
                      }
                    : { kind: 'sector', at: station ? stationAt(station) : from }
                )
              }
            />
            {destination.kind === 'station' && station ? (
              <>
                <Field label="Planet">
                  <Segments
                    value={station.planetId}
                    options={BODIES.filter(b => isPlanet(b.value))}
                    onChange={planetId => setDestination({ kind: 'station', planetId })}
                  />
                </Field>
                <Field label={`Station now at (ring ${STATION_RING})`}>
                  <Stepper
                    value={station.sector}
                    min={0}
                    max={SECTORS_PER_RING - 1}
                    wrap
                    editable
                    onChange={sector => moveStation(station.planetId, sector)}
                    label="station sector"
                  />
                </Field>
                <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem', color: PRESS.inkSoft }}>
                  It moves {STATION_DRIFT} sectors a round; the route meets it where it will be.
                </Box>
              </>
            ) : destination.kind === 'sector' ? (
              <PlaceInput
                value={destination.at}
                onChange={at => setDestination({ kind: 'sector', at })}
                label="destination"
              />
            ) : null}
          </Box>
        </Plate>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, flexWrap: 'wrap' }}>
        <Field label="A click on the board sets">
          <Segments
            value={picking}
            options={[
              { value: 'ship' as Picking, label: 'The ship' },
              { value: 'destination' as Picking, label: 'Where to' },
            ]}
            onChange={setPicking}
          />
        </Field>
        <Box sx={{ fontFamily: FONT_SANS, fontSize: '0.9rem', color: PRESS.inkSoft, pb: 1.25 }}>
          Click a station to head for it.
        </Box>
      </Box>

      <Box
        sx={{
          position: 'relative',
          height: { xs: '58vh', md: 'min(68vh, 680px)' },
          minHeight: 340,
          border: `4px solid ${PRESS.ink}`,
          overflow: 'hidden',
          bgcolor: TABLE.felt,
        }}
      >
        <GameBoardSvg model={model} />
      </Box>

      <Box sx={{ border: `4px solid ${PRESS.ink}`, bgcolor: PRESS.paper }}>
        <Box
          sx={{
            bgcolor: PRESS.ink,
            color: PRESS.paper,
            px: 2,
            py: 1,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'baseline',
            fontFamily: FONT_DISPLAY,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <Box component="span" sx={{ fontSize: '1.1rem' }}>
            The route
          </Box>
          <Box component="span" sx={{ ml: 'auto', fontSize: '0.9rem', color: PRESS.paperSoft }}>
            {placeLabel(from)} &rarr; {where}
            {arrival !== null && ` (S${arrival} on arrival)`}
          </Box>
        </Box>
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {!route ? (
            <Box sx={{ fontFamily: FONT_SANS, fontSize: '1rem' }}>
              {destination.kind === 'sector' && same(from, destination.at)
                ? 'The ship is already there.'
                : `No route there within ${MAX_TURNS} turns on ${fuel} fuel.`}
            </Box>
          ) : (
            <>
              <Segments
                value={String(current)}
                options={routes.map((alternative, index) => ({
                  value: String(index),
                  label: `${routeName(alternative, index)} · ${alternative.totalTurns} turns · ${alternative.totalMassCost} fuel`,
                }))}
                onChange={index => setChosen(Number(index))}
              />
              <Box
                component="ol"
                sx={{
                  listStyle: 'none',
                  m: 0,
                  mt: 2,
                  p: 0,
                  display: 'grid',
                  gap: '4px',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                }}
              >
                {legs.map((leg, index) => (
                  <Box
                    component="li"
                    key={index}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '34px 1fr auto',
                      alignItems: 'center',
                      gap: 1,
                      border: `2px solid ${PRESS.ink}`,
                      bgcolor: index === 0 ? PRESS.ink : 'transparent',
                      color: index === 0 ? PRESS.paper : PRESS.ink,
                      pr: 1,
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
                          rotate,{' '}
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
                  </Box>
                ))}
              </Box>
              <Box
                sx={{ mt: 1.5, fontFamily: FONT_SANS, fontSize: '0.9rem', color: PRESS.inkSoft }}
              >
                One line per turn, first turn in black. The figure on the right is the fuel it
                spends or the scoop brings in.
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
