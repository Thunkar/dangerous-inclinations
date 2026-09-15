/**
 * Fitting out: one forward tile and four side tiles on the mat, and three of
 * the five mission cards you were dealt.
 *
 * Drag a tile from the palette onto a bay, or click the tile and then the bay.
 * All tiles go down face-down — the table learns what you carry only when
 * something fires, absorbs or breaks. Missions are dealt before deployment, so
 * the cards you keep should decide where you put your Home.
 */
import { useCallback, useMemo, useState } from 'react'
import { Alert, Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material'
import type { BotArchetype, ShipLoadout, SubsystemType } from '@dangerous-inclinations/engine'
import {
  BOT_LOADOUT_TEMPLATES,
  DEFAULT_DISSIPATION_CAPACITY,
  MISSIONS_PER_PLAYER,
  STARTING_REACTION_MASS,
  calculateShipStatsFromLoadout,
  canInstallInSlot,
  validateLoadout,
} from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { Panel, SectionLabel } from '../common/Panel'
import { MissionCard } from '../common/MissionCard'
import { ShipDisplay, FixedSubsystemSlot } from '../ship'
import { ComponentPalette, LoadoutSlot } from '../loadout'
import type { SlotType } from '../loadout'
import { FONT_MONO, TABLE } from '../../theme'
import { Centered, Header } from './ScreenChrome'

type Selection = { type: SubsystemType; slotType: SlotType } | null

/**
 * The hulls the bots fly, offered as starting points. They are the four
 * shapes the mission mix actually asks for; a preset fills the mat and you
 * carry on dragging from there.
 */
const PRESETS: Array<{ id: BotArchetype; name: string; blurb: string }> = [
  {
    id: 'hauler',
    name: 'Hauler',
    blurb:
      'Sensors, shields, radiator, compressor and a laser — long routes, cool running, a sting for raiders.',
  },
  {
    id: 'scout',
    name: 'Scout',
    blurb: 'Sensors, shields, radiator, compressor and missiles — shadow them, then shoot.',
  },
  {
    id: 'raider',
    name: 'Raider',
    blurb:
      'Railgun, missiles, radiator, compressor and shields — one kill, and the fuel to reach it.',
  },
  {
    id: 'hunter',
    name: 'Hunter',
    blurb:
      'Railgun, missiles, radiator, laser and shields — a volley for every ring, built to take a ship apart.',
  },
]

const STARTING_PRESET: BotArchetype = 'hauler'

function presetLoadout(id: BotArchetype): ShipLoadout {
  const template = BOT_LOADOUT_TEMPLATES[id]
  return {
    forwardSlots: [...template.forwardSlots] as ShipLoadout['forwardSlots'],
    sideSlots: [...template.sideSlots] as ShipLoadout['sideSlots'],
  }
}

function matches(loadout: ShipLoadout, id: BotArchetype): boolean {
  const template = BOT_LOADOUT_TEMPLATES[id]
  return (
    loadout.forwardSlots.every((t, i) => t === template.forwardSlots[i]) &&
    loadout.sideSlots.every((t, i) => t === template.sideSlots[i])
  )
}

export function LoadoutScreen({ headerRight }: { headerRight?: React.ReactNode }) {
  const { view, nameOf, submitLoadout } = useGame()
  const me = view.me

  const [loadout, setLoadout] = useState<ShipLoadout>(() => presetLoadout(STARTING_PRESET))
  const [selected, setSelected] = useState<Selection>(null)
  const [dragging, setDragging] = useState<SubsystemType | null>(null)
  const [kept, setKept] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validation = useMemo(() => validateLoadout(loadout), [loadout])
  const stats = useMemo(() => calculateShipStatsFromLoadout(loadout), [loadout])
  const hasSensor = loadout.forwardSlots.includes('sensor_array')

  const setForward = useCallback((type: SubsystemType | null) => {
    setLoadout(prev => ({ ...prev, forwardSlots: [type] }))
    setSelected(null)
    setError(null)
  }, [])

  const setSide = useCallback((index: number, type: SubsystemType | null) => {
    setLoadout(prev => {
      const sides = [...prev.sideSlots] as ShipLoadout['sideSlots']
      sides[index] = type
      return { ...prev, sideSlots: sides }
    })
    setSelected(null)
    setError(null)
  }, [])

  if (!me) {
    return <Centered>You are watching this table; there is no mat to fill.</Centered>
  }

  const offers = me.missionOffers
  const submitted = me.hasSubmittedLoadout

  /** An Intercept needs a scan, and a scan needs a powered sensor array. */
  const needsSensor = (type: string) => type === 'intercept_transmission'
  const keptNeedingSensor = kept.filter(id =>
    needsSensor(offers.find(m => m.id === id)?.type ?? '')
  )
  const sensorWarning = !hasSensor && keptNeedingSensor.length > 0

  const clickSlot = (group: 'forward' | 'side', index: number) => {
    if (!selected) return
    if (!canInstallInSlot(selected.type, group)) return
    if (group === 'forward') setForward(selected.type)
    else setSide(index, selected.type)
  }

  const toggleMission = (id: string) => {
    setKept(prev =>
      prev.includes(id)
        ? prev.filter(m => m !== id)
        : prev.length < MISSIONS_PER_PLAYER
          ? [...prev, id]
          : prev
    )
  }

  const canSubmit =
    validation.valid && kept.length === MISSIONS_PER_PLAYER && !submitting && !submitted

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await submitLoadout(loadout, kept)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const fits = (group: 'forward' | 'side') => {
    const candidate = dragging ?? selected?.type
    return candidate !== undefined && candidate !== null && canInstallInSlot(candidate, group)
  }

  const sideSlot = (index: number) => (
    <LoadoutSlot
      key={`side-${index}`}
      group="side"
      label={`S${index + 1}`}
      component={loadout.sideSlots[index]}
      onDrop={type => setSide(index, type)}
      onClick={() => clickSlot('side', index)}
      isHighlighted={fits('side')}
    />
  )

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header
        title="Fit out your ship"
        subtitle="One forward tile, four side tiles — all face-down. Drag a tile onto a bay, or click both."
        right={headerRight}
      />

      <Box sx={{ flex: 1, display: 'flex', gap: 1.5, p: 1.5, minHeight: 0, overflow: 'auto' }}>
        {/* The mat */}
        <Panel title="Ship mat" sx={{ width: 430, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <ShipDisplay
              faded={!validation.valid}
              activeRails={{ forward: fits('forward'), side: fits('side') }}
              slots={{
                forward: [
                  <LoadoutSlot
                    key="forward-0"
                    group="forward"
                    label="FWD"
                    component={loadout.forwardSlots[0]}
                    onDrop={setForward}
                    onClick={() => clickSlot('forward', 0)}
                    isHighlighted={fits('forward')}
                  />,
                ],
                side: [sideSlot(0), sideSlot(1), sideSlot(2), sideSlot(3)],
              }}
              fixed={{
                aft: [
                  <FixedSubsystemSlot key="engines" subsystemType="engines" />,
                  <FixedSubsystemSlot key="rotation" subsystemType="rotation" />,
                ],
                forward: [<FixedSubsystemSlot key="scoop" subsystemType="scoop" />],
              }}
            />

            <Box sx={{ display: 'flex', gap: 2.5, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Readout
                label="Dissipation"
                value={`${stats.dissipationCapacity}/turn`}
                good={stats.dissipationCapacity > DEFAULT_DISSIPATION_CAPACITY}
              />
              <Readout
                label="Fuel"
                value={`${stats.reactionMass}`}
                good={stats.reactionMass > STARTING_REACTION_MASS}
              />
              <Readout label="Engines · thrusters · scoop" value="fixed" />
            </Box>

            {!validation.valid && (
              <Alert severity="warning" sx={{ width: '100%', py: 0 }}>
                {validation.errors.join(' · ')}
              </Alert>
            )}
          </Box>
        </Panel>

        {/* Palette */}
        <Panel title="Your set of tiles" sx={{ width: 320, flexShrink: 0, overflowY: 'auto' }}>
          <Typography variant="caption" sx={{ color: TABLE.inkSoft, display: 'block', mb: 1 }}>
            One of each, except two lasers. Engines, thrusters and the fuel scoop are printed on
            every mat.
          </Typography>
          <SectionLabel>Presets</SectionLabel>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5, mb: 1.5 }}>
            {PRESETS.map(preset => {
              const active = matches(loadout, preset.id)
              return (
                <Tooltip key={preset.id} title={preset.blurb}>
                  <Box
                    onClick={() => {
                      setLoadout(presetLoadout(preset.id))
                      setSelected(null)
                      setError(null)
                    }}
                    sx={{
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      cursor: 'pointer',
                      minWidth: 140,
                      flex: '1 1 140px',
                      border: `1px solid ${active ? TABLE.accent : TABLE.plateEdge}`,
                      boxShadow: active ? `0 0 12px ${TABLE.accentGlow}` : 'none',
                      bgcolor: active ? 'rgba(255,180,69,0.08)' : 'transparent',
                      '&:hover': { borderColor: TABLE.accent },
                    }}
                  >
                    <Typography
                      sx={{
                        fontFamily: FONT_MONO,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: active ? TABLE.accent : TABLE.ink,
                      }}
                    >
                      {preset.name}
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: TABLE.inkSoft, lineHeight: 1.3 }}>
                      {preset.blurb}
                    </Typography>
                  </Box>
                </Tooltip>
              )
            })}
          </Box>

          <ComponentPalette
            onComponentSelect={(type, slotType) =>
              setSelected(prev => (prev?.type === type ? null : { type, slotType }))
            }
            onDragStart={setDragging}
            onDragEnd={() => setDragging(null)}
            selectedComponent={selected?.type ?? null}
            installedForward={loadout.forwardSlots}
            installedSide={loadout.sideSlots}
          />
        </Panel>

        {/* Missions */}
        <Panel
          title={`Missions — keep ${MISSIONS_PER_PLAYER} of ${offers.length} (${kept.length} chosen)`}
          sx={{ flex: 1, minWidth: 280, overflowY: 'auto' }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {offers.map(mission => (
              <Box key={mission.id} sx={{ position: 'relative' }}>
                <MissionCard
                  mission={mission}
                  nameOf={nameOf}
                  selected={kept.includes(mission.id)}
                  onClick={() => toggleMission(mission.id)}
                />
                {needsSensor(mission.type) && !hasSensor && (
                  <Typography
                    sx={{
                      fontFamily: FONT_MONO,
                      fontSize: '0.75rem',
                      color: TABLE.heat,
                      mt: 0.25,
                      letterSpacing: '0.06em',
                    }}
                  >
                    needs a sensor array
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
          {offers.length === 0 && (
            <Typography variant="body2" sx={{ color: TABLE.inkSoft }}>
              Waiting for the deal…
            </Typography>
          )}

          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {sensorWarning && (
              <Alert severity="warning" sx={{ py: 0 }}>
                An Intercept is completed by scanning: fit the sensor array in the forward slot, or
                keep a different card.
              </Alert>
            )}
            {kept.length < MISSIONS_PER_PLAYER && offers.length > 0 && (
              <Typography variant="caption" sx={{ color: TABLE.inkSoft }}>
                Choose {MISSIONS_PER_PLAYER - kept.length} more.
              </Typography>
            )}
            {submitted ? (
              <Alert severity="success">
                Mat submitted. Waiting for the others to finish fitting out.
              </Alert>
            ) : (
              <Button variant="contained" size="large" disabled={!canSubmit} onClick={submit}>
                {submitting ? <CircularProgress size={22} color="inherit" /> : 'Ready'}
              </Button>
            )}
          </Box>
        </Panel>
      </Box>
    </Box>
  )
}

function Readout({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <SectionLabel>{label}</SectionLabel>
      <Typography
        sx={{
          fontFamily: FONT_MONO,
          fontWeight: 700,
          fontSize: '1.05rem',
          color: good ? TABLE.success : TABLE.ink,
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}
