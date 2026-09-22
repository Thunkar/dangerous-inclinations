/**
 * The route planner, off the table.
 *
 * It is the game's own board and the game's own planner, with the seat taken
 * out: you put the ship somewhere by clicking, you put the destination
 * somewhere by clicking, and the engine's `planMovementAlternatives` lays out
 * the turns exactly as the turn column does in a live game. Nothing is
 * re-drawn and nothing is re-implemented, so a route plotted here is a route
 * the game would plot.
 *
 * The board renders a `BoardModel` and only that (`components/board/model.ts`),
 * which is what lets it run with no game behind it: this builds one by hand,
 * the way the 3D dev harness does.
 */
import { useMemo, useState } from 'react'
import { Box } from '@mui/material'
import type { Facing, MovementPlan, Position } from '@dangerous-inclinations/engine'
import {
  MAX_REACTION_MASS,
  createInitialStations,
  planMovementAlternatives,
} from '@dangerous-inclinations/engine'
import type { BoardModel } from '../../components/board/model'
import { GameBoardSvg } from '../../components/board/svg/GameBoardSvg'
import { getPlayerColor } from '../../utils/playerColors'
import { placeLabel, routeLegs, routeName } from '../../utils/route'
import { FONT_SANS, TABLE } from '../../theme'
import { FONT_DISPLAY, PRESS } from '../../design/press'
import { Field, Segments, Stepper, Toggle } from './controls'

/** How far the search looks before it gives up. The turn column uses 20 too. */
const MAX_TURNS = 20

const SHIP_ID = 'planner'
const SHIP_COLOR = getPlayerColor(0)

/** What a click on the board sets. */
type Picking = 'ship' | 'destination'

const same = (a: Position, b: Position) =>
  a.wellId === b.wellId && a.ring === b.ring && a.sector === b.sector

export function RoutePlannerTool() {
  const [from, setFrom] = useState<Position>({ wellId: 'blackhole', ring: 3, sector: 0 })
  const [to, setTo] = useState<Position | null>({ wellId: 'planet-alpha', ring: 2, sector: 12 })
  const [facing, setFacing] = useState<Facing>('prograde')
  const [fuel, setFuel] = useState(MAX_REACTION_MASS)
  const [compressor, setCompressor] = useState(false)
  const [picking, setPicking] = useState<Picking>('destination')
  const [chosen, setChosen] = useState(0)

  const routes = useMemo<MovementPlan[]>(() => {
    if (!to || same(from, to)) return []
    const result = planMovementAlternatives({ ...from, facing }, to, {
      availableMass: fuel,
      hasFuelScoop: true,
      maxFuelCapacity: MAX_REACTION_MASS,
      hasFuelCompressor: compressor,
      allowWellTransfers: true,
      maxTurns: MAX_TURNS,
    })
    return result?.alternatives ?? []
  }, [from, to, facing, fuel, compressor])

  const route = routes[Math.min(chosen, Math.max(0, routes.length - 1))] ?? null
  const stations = useMemo(() => createInitialStations(), [])

  /**
   * A board with one ship on it. Everything else is the empty value a quiet
   * board has; the contract is `BoardModel` and the renderer knows no rule.
   */
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
      onPickDestination: position => (picking === 'ship' ? setFrom(position) : setTo(position)),
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
    [from, facing, route, stations, picking]
  )

  const legs = route ? routeLegs(route.steps, facing) : []
  const current = Math.min(chosen, Math.max(0, routes.length - 1))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{ display: 'flex', alignItems: 'flex-end', gap: { xs: 2, sm: 3 }, flexWrap: 'wrap' }}
      >
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
          <Stepper value={fuel} min={0} max={MAX_REACTION_MASS} onChange={setFuel} label="fuel" />
        </Field>
        <Field label="Bow">
          <Toggle on={compressor} label="Compressor" onChange={setCompressor} />
        </Field>
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
            {placeLabel(from)} &rarr; {to ? placeLabel(to) : 'click the board'}
          </Box>
        </Box>
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
          {!route ? (
            <Box sx={{ fontFamily: FONT_SANS, fontSize: '1rem' }}>
              {!to || same(from, to)
                ? 'Click the board to set where the ship is going.'
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
                        ? `\u2212${leg.massCost}`
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
