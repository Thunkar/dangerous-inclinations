import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Drawer, Tab, Tabs, Typography } from '@mui/material'
import {
  BOT_LOADOUT_TEMPLATES,
  MISSIONS_PER_PLAYER,
  calculateShipStatsFromLoadout,
  describeMission,
  getSubsystemConfig,
  hasSubsystemInLoadout,
  missionRequiredSubsystems,
  missionsMissingSubsystems,
  resolveShipAppearance,
  validateLoadout,
  type Player,
  type ShipAppearance,
  type ShipLoadout,
} from '@dangerous-inclinations/engine'
import { useGame } from '../../context/GameContext'
import { MissionCard } from '../common/MissionCard'
import { TableTalk } from '../table/TableTalk'
import { Header, Centered } from './ScreenChrome'
import { AppearanceControls, SystemControls } from '../../ships/ShipControls'
import { ShipStage } from '../../ships/ShipStage'
import { DEFAULT_CONFIG, parseConfig, type MountId } from '../../ships/config'
import { editorConfig } from '../../ships/visual'
import { getPlayerColor } from '../../utils/playerColors'
import { FONT_MONO, TABLE } from '../../theme'

interface Draft {
  loadout: ShipLoadout
  appearance: ShipAppearance
  missionIds: string[]
}
const PREFERENCE_KEY = 'di.ship-appearance.v1'
function readDraft(key: string, me: Player): Draft {
  const fallback = {
    loadout: structuredClone(BOT_LOADOUT_TEMPLATES.hauler),
    appearance: resolveShipAppearance(me.appearance),
    missionIds: [],
  }
  try {
    const preference = localStorage.getItem(PREFERENCE_KEY)
    if (preference) fallback.appearance = resolveShipAppearance(JSON.parse(preference))
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (saved?.version !== 1) return fallback
    const config = parseConfig({ ...DEFAULT_CONFIG, loadout: saved.loadout })
    const offered = new Set(me.missionOffers.map(m => m.id))
    return {
      loadout: config.loadout,
      appearance: resolveShipAppearance(saved.appearance),
      missionIds: Array.isArray(saved.missionIds)
        ? [
            ...new Set<string>(
              saved.missionIds.filter(
                (id: unknown): id is string => typeof id === 'string' && offered.has(id)
              )
            ),
          ].slice(0, MISSIONS_PER_PLAYER)
        : [],
    }
  } catch {
    return fallback
  }
}

export function LoadoutScreen({ headerRight }: { headerRight?: ReactNode }) {
  const { view, gameId } = useGame()
  if (!view.me)
    return <Centered>You are watching this table; there is no ship to fit out.</Centered>
  return <LoadoutEditor key={`${gameId}:${view.me.id}`} me={view.me} headerRight={headerRight} />
}

function LoadoutEditor({ me, headerRight }: { me: Player; headerRight?: ReactNode }) {
  const { view, gameId, nameOf, submitLoadout, readOnly } = useGame()
  const draftKey = `di.ship-draft.v1:${gameId}:${me.id}`
  const [draft, setDraft] = useState(() => readDraft(draftKey, me))
  const [selected, setSelected] = useState<MountId>('forward-0')
  const [tab, setTab] = useState('systems')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageError, setStorageError] = useState(false)
  const [talk, setTalk] = useState(false)
  const submitted = me.hasSubmittedLoadout
  const disabled = submitted || submitting || readOnly
  const loadout = submitted ? me.ship.loadout : draft.loadout
  const appearance = submitted ? resolveShipAppearance(me.appearance) : draft.appearance
  const missionIds = submitted ? me.missions.map(m => m.id) : draft.missionIds
  const offers = me.missionOffers.length ? me.missionOffers : me.missions
  const seat = view.players.findIndex(p => p.id === me.id)
  const accent = getPlayerColor(seat)
  const config = useMemo(
    () => editorConfig(loadout, appearance, accent, `K—${String(seat + 1).padStart(2, '0')}`),
    [loadout, appearance, accent, seat]
  )
  const validation = validateLoadout(loadout)
  const stats = calculateShipStatsFromLoadout(loadout)
  const filled = [...loadout.forwardSlots, ...loadout.sideSlots].filter(Boolean).length
  const gaps = missionsMissingSubsystems(
    offers.filter(m => missionIds.includes(m.id)),
    loadout
  )
  const blocked = !validation.valid
    ? validation.errors.join(' · ')
    : missionIds.length !== MISSIONS_PER_PLAYER
      ? `Choose ${MISSIONS_PER_PLAYER - missionIds.length} more mission${MISSIONS_PER_PLAYER - missionIds.length === 1 ? '' : 's'}.`
      : gaps.length
        ? `Fit ${[...new Set(gaps.flatMap(g => g.missing))].map(t => getSubsystemConfig(t).name).join(' and ')}, or choose different missions.`
        : null

  useEffect(() => {
    if (submitted || readOnly) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ version: 1, ...draft }))
        localStorage.setItem(PREFERENCE_KEY, JSON.stringify(draft.appearance))
      } catch {
        setStorageError(true)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [draft, draftKey, submitted, readOnly])

  const patch = (next: Partial<Draft>) => {
    if (!disabled) {
      setDraft(d => ({ ...d, ...next }))
      setError(null)
    }
  }
  const submit = async () => {
    if (blocked || disabled) return
    setSubmitting(true)
    setError(null)
    try {
      await submitLoadout(loadout, missionIds, appearance)
      try {
        localStorage.removeItem(draftKey)
      } catch {
        /* Server already saved the ship. */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }
  const missions = (
    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
        <Typography variant="h6">Choose your missions</Typography>
        <Typography variant="overline" color="primary">
          {missionIds.length}/{MISSIONS_PER_PLAYER} selected
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(176px, 1fr))',
          gap: 1,
        }}
      >
        {offers.map(m => (
          <MissionCard
            key={m.id}
            mission={m}
            nameOf={nameOf}
            selected={missionIds.includes(m.id)}
            requires={missionRequiredSubsystems(m.type).map(type => ({
              type,
              met: hasSubsystemInLoadout(loadout, type),
            }))}
            onClick={
              disabled
                ? undefined
                : () =>
                    patch({
                      missionIds: missionIds.includes(m.id)
                        ? missionIds.filter(id => id !== m.id)
                        : missionIds.length < MISSIONS_PER_PLAYER
                          ? [...missionIds, m.id]
                          : missionIds,
                    })
            }
          />
        ))}
      </Box>
      {offers.length === 0 && (
        <Typography color="text.secondary">Waiting for the mission deal…</Typography>
      )}
      {gaps.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {gaps
            .map(
              g =>
                `${describeMission(g.mission, nameOf)} needs ${g.missing.map(t => getSubsystemConfig(t).name).join(' and ')}.`
            )
            .join(' ')}
        </Alert>
      )}
    </Box>
  )

  return (
    <Box
      sx={{
        height: { xs: 'auto', md: '100dvh' },
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: TABLE.felt,
      }}
    >
      <Header
        title="Kestrel / Shipyard"
        subtitle="Fit your systems. Choose your missions. Make it yours."
        right={
          <>
            <Button onClick={() => setTalk(true)}>Table talk</Button>
            {headerRight}
          </>
        }
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'minmax(0, 1fr) 370px',
            xl: 'minmax(0, 1fr) 400px',
          },
          flex: 1,
          minHeight: 0,
        }}
      >
        <Box
          sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: { md: 'auto' } }}
        >
          <Box sx={{ flex: '1 0 420px', minHeight: 420 }}>
            <ShipStage
              config={config}
              selected={selected}
              onSelect={id => {
                setSelected(id)
                setTab('systems')
              }}
            />
          </Box>
          <Box
            sx={{
              display: { xs: 'none', md: 'block' },
              borderTop: `1px solid ${TABLE.line}`,
              bgcolor: TABLE.plateSunk,
            }}
          >
            {missions}
          </Box>
        </Box>
        <Box
          component="aside"
          sx={{
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            bgcolor: TABLE.plate,
            borderLeft: `1px solid ${TABLE.line}`,
          }}
        >
          <Box sx={{ px: 2.5, pt: 2.5, pb: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Vessel configuration
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              Make it your own.
            </Typography>
          </Box>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="fullWidth"
            aria-label="Ship configuration"
            sx={{ borderTop: `1px solid ${TABLE.line}`, borderBottom: `1px solid ${TABLE.line}` }}
          >
            <Tab
              label="Systems"
              value="systems"
              id="ship-tab-systems"
              aria-controls="ship-panel-systems"
            />
            <Tab
              label="Appearance"
              value="appearance"
              id="ship-tab-appearance"
              aria-controls="ship-panel-appearance"
            />
            <Tab
              label="Missions"
              value="missions"
              id="ship-tab-missions"
              aria-controls="ship-panel-missions"
            />
          </Tabs>
          <Box
            role="tabpanel"
            id={`ship-panel-${tab}`}
            aria-labelledby={`ship-tab-${tab}`}
            sx={{
              p: tab === 'missions' ? 0 : 2.5,
              overflowY: { md: 'auto' },
              flex: 1,
              minHeight: 0,
            }}
          >
            {tab === 'systems' && (
              <SystemControls
                config={config}
                selected={selected}
                onSelect={setSelected}
                onChange={loadout => patch({ loadout })}
                disabled={disabled}
              />
            )}
            {tab === 'appearance' && (
              <AppearanceControls
                value={appearance}
                onChange={appearance => patch({ appearance })}
                accent={accent}
                disabled={disabled}
              />
            )}
            {tab === 'missions' && missions}
          </Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-around',
              px: 2,
              py: 2,
              borderTop: `1px solid ${TABLE.line}`,
              bgcolor: TABLE.plateSunk,
            }}
          >
            {[
              ['Dissipation', `${stats.dissipationCapacity}/turn`],
              ['Reaction mass', stats.reactionMass],
              ['Systems', `${filled}/5`],
            ].map(([label, value]) => (
              <Box key={label} sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 21, color: TABLE.accent }}>
                  {value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Box
        component="footer"
        sx={{
          position: { xs: 'sticky', md: 'relative' },
          bottom: 0,
          zIndex: 30,
          p: 1.5,
          px: { xs: 2, md: 3 },
          bgcolor: TABLE.feltLight,
          borderTop: `1px solid ${TABLE.plateEdge}`,
          flexShrink: 0,
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        {storageError && (
          <Alert severity="warning" sx={{ mb: 1 }}>
            Browser storage is unavailable. Keep this page open until you submit.
          </Alert>
        )}
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between' }}
        >
          <Box aria-live="polite">
            <Typography variant="body2">
              {submitted
                ? 'Ship submitted. Waiting for the other players.'
                : (blocked ?? 'All systems fitted. Missions ready.')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {submitted
                ? 'Your design is saved with this game.'
                : `${filled}/5 systems · ${missionIds.length}/${MISSIONS_PER_PLAYER} missions · Appearance is cosmetic`}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            disabled={Boolean(blocked) || disabled}
            onClick={() => void submit()}
            sx={{ minWidth: 110 }}
          >
            {submitted ? 'Ready' : submitting ? 'Saving…' : 'Ready'}
          </Button>
        </Box>
      </Box>
      <Drawer anchor="right" open={talk} onClose={() => setTalk(false)}>
        <Box
          sx={{
            width: 'min(360px, 100vw)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            p: 1,
          }}
        >
          <Button onClick={() => setTalk(false)}>Close table talk</Button>
          <TableTalk sx={{ flex: 1, minHeight: 0 }} />
        </Box>
      </Drawer>
    </Box>
  )
}
