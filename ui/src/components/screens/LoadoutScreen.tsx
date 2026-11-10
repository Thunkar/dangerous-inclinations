import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Box, Button, Drawer, Tab, Tabs, Typography } from '@mui/material'
import {
  BOT_PRESET_LOADOUTS,
  MISSION_POINTS,
  MISSIONS_PER_PLAYER,
  PRIMARIES_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  SLOT_IDS,
  isPrimaryType,
  calculateShipStatsFromLoadout,
  describeMission,
  describeMissionRequirement,
  fill,
  missionRequirementStatus,
  missionsMissingRequirements,
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
import { FONT_MONO } from '../../theme'
import { TABLE } from '../../design/tokens'
import { SCREENS } from '../../text/screens'

const S = SCREENS.shipyard

interface Draft {
  loadout: ShipLoadout
  appearance: ShipAppearance
  missionIds: string[]
}
const PREFERENCE_KEY = 'di.ship-appearance.v1'
function readDraft(key: string, me: Player): Draft {
  const fallback = {
    loadout: structuredClone(BOT_PRESET_LOADOUTS.freighter),
    appearance: resolveShipAppearance(me.appearance),
    missionIds: [],
  }
  try {
    const preference = localStorage.getItem(PREFERENCE_KEY)
    if (preference) fallback.appearance = resolveShipAppearance(JSON.parse(preference))
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!saved) return fallback
    const config = parseConfig({ ...DEFAULT_CONFIG, loadout: saved.loadout })
    return {
      loadout: config.loadout,
      appearance: resolveShipAppearance(saved.appearance),
      missionIds: saved.missionIds,
    }
  } catch {
    return fallback
  }
}

export function LoadoutScreen({ headerRight }: { headerRight?: ReactNode }) {
  const { view, gameId } = useGame()
  if (!view.me) return <Centered>{S.spectator}</Centered>
  return <LoadoutEditor key={`${gameId}:${view.me.id}`} me={view.me} headerRight={headerRight} />
}

function LoadoutEditor({ me, headerRight }: { me: Player; headerRight?: ReactNode }) {
  const { view, gameId, nameOf, submitLoadout, readOnly } = useGame()
  const draftKey = `di.ship-draft.v1:${gameId}:${me.id}`
  const [draft, setDraft] = useState(() => readDraft(draftKey, me))
  const [selected, setSelected] = useState<MountId>('forward-0')
  // Missions first: you pick the cards, then fit the ship that can fly them.
  const [tab, setTab] = useState('missions')
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
    () => editorConfig(loadout, appearance, accent),
    [loadout, appearance, accent]
  )
  const validation = validateLoadout(loadout)
  const stats = calculateShipStatsFromLoadout(loadout)
  const filled = [...loadout.forwardSlots, ...loadout.sideSlots].filter(Boolean).length
  const gaps = missionsMissingRequirements(
    offers.filter(m => missionIds.includes(m.id)),
    loadout
  )
  const chosenPrimaries = offers.filter(m => missionIds.includes(m.id) && isPrimaryType(m.type))
  const chosenSecondaries = missionIds.length - chosenPrimaries.length
  const blocked = !validation.valid
    ? validation.errors.join(' · ')
    : chosenPrimaries.length !== PRIMARIES_PER_PLAYER
      ? S.blocked.primary
      : chosenSecondaries !== SECONDARIES_PER_PLAYER
        ? fill(S.blocked.secondaries, {
            count: SECONDARIES_PER_PLAYER,
            left: SECONDARIES_PER_PLAYER - chosenSecondaries,
          })
        : gaps.length
          ? fill(S.blocked.fit, {
              parts: [
                ...new Set(
                  gaps.flatMap(g => g.missing.map(r => fill(S.blocked.part, { label: r.label })))
                ),
              ].join(S.and),
            })
          : null

  useEffect(() => {
    if (submitted || readOnly) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft))
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
  /**
   * Two piles, two decisions (RULES §Missions). Taking a primary swaps out the
   * one you were holding, because there is only ever room for one; the second
   * list fills up and then waits for you to drop something.
   */
  const pile = (cards: typeof offers, keep: number, title: string, hint: string) => {
    const chosen = cards.filter(m => missionIds.includes(m.id))
    return (
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          </Box>
          <Typography variant="overline" sx={{ color: TABLE.accent }}>
            {chosen.length}/{keep}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 1,
          }}
        >
          {cards.map(m => (
            <MissionCard
              key={m.id}
              mission={m}
              nameOf={nameOf}
              selected={missionIds.includes(m.id)}
              requires={missionRequirementStatus(m.type, loadout)}
              onClick={
                disabled
                  ? undefined
                  : () => {
                      const mine = cards.filter(c => missionIds.includes(c.id))
                      const others = missionIds.filter(id => !mine.some(c => c.id === id))
                      const ids = mine.map(c => c.id)
                      let next: string[]
                      if (ids.includes(m.id)) next = ids.filter(id => id !== m.id)
                      else if (keep === 1) next = [m.id]
                      else if (ids.length < keep) next = [...ids, m.id]
                      else return
                      patch({ missionIds: [...others, ...next] })
                    }
              }
            />
          ))}
        </Box>
      </Box>
    )
  }

  const missions = (
    <>
      {pile(
        offers.filter(m => isPrimaryType(m.type)),
        PRIMARIES_PER_PLAYER,
        S.primary.title,
        fill(S.primary.hint, {
          points: MISSION_POINTS.destroy_ship,
          toWin: view.pointsToWin,
        })
      )}
      {pile(
        offers.filter(m => !isPrimaryType(m.type)),
        SECONDARIES_PER_PLAYER,
        S.secondary.title,
        fill(S.secondary.hint, { points: MISSION_POINTS.survey })
      )}
      {offers.length === 0 && <Typography color="text.secondary">{S.waitingForDeal}</Typography>}
      {gaps.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {gaps
            .map(g =>
              fill(S.needs, {
                mission: describeMission(g.mission, nameOf),
                requirements: g.missing.map(describeMissionRequirement).join(S.and),
              })
            )
            .join(' ')}
        </Alert>
      )}
    </>
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
        title={S.title}
        right={
          <>
            <Button onClick={() => setTalk(true)}>{S.tableTalk}</Button>
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
        {/* The stage owns the whole left column; missions live in the aside. */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: { xs: 390, md: 0 },
          }}
        >
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
            <Typography variant="h5" sx={{ mt: 0.5 }}>
              {S.aside}
            </Typography>
          </Box>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="fullWidth"
            aria-label={S.tabs.label}
            sx={{ borderTop: `1px solid ${TABLE.line}`, borderBottom: `1px solid ${TABLE.line}` }}
          >
            <Tab
              label={S.tabs.missions}
              value="missions"
              id="ship-tab-missions"
              aria-controls="ship-panel-missions"
            />
            <Tab
              label={S.tabs.systems}
              value="systems"
              id="ship-tab-systems"
              aria-controls="ship-panel-systems"
            />
            <Tab
              label={S.tabs.appearance}
              value="appearance"
              id="ship-tab-appearance"
              aria-controls="ship-panel-appearance"
            />
          </Tabs>
          <Box
            role="tabpanel"
            id={`ship-panel-${tab}`}
            aria-labelledby={`ship-tab-${tab}`}
            sx={{
              p: 2.5,
              overflowY: { md: 'auto' },
              flex: 1,
              minHeight: 0,
            }}
          >
            {tab === 'missions' && missions}
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
                seatColor={accent}
                onChange={appearance => patch({ appearance })}
                disabled={disabled}
              />
            )}
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
              [S.stats.dissipation, fill(S.stats.perTurn, { value: stats.dissipationCapacity })],
              [S.stats.fuel, stats.reactionMass],
              [S.stats.systems, `${filled}/${SLOT_IDS.length}`],
            ].map(([label, value]) => (
              <Box key={label} sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontFamily: FONT_MONO, fontSize: 21, color: TABLE.ink }}>
                  {value}
                </Typography>
                <Typography variant="overline" sx={{ color: TABLE.inkSoft, lineHeight: 1.4 }}>
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
          bgcolor: TABLE.bar,
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
            {S.storage}
          </Alert>
        )}
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between' }}
        >
          <Box aria-live="polite">
            <Typography variant="body2">
              {submitted ? S.submitted : (blocked ?? S.ready)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {submitted
                ? S.saved
                : fill(S.counts, {
                    filled,
                    slots: SLOT_IDS.length,
                    missions: missionIds.length,
                    maxMissions: MISSIONS_PER_PLAYER,
                  })}
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            disabled={Boolean(blocked) || disabled}
            onClick={() => void submit()}
            sx={{ minWidth: 110 }}
          >
            {submitting && !submitted ? S.saving : S.submit}
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
          <Button onClick={() => setTalk(false)}>{S.closeTalk}</Button>
          <TableTalk sx={{ flex: 1, minHeight: 0 }} />
        </Box>
      </Drawer>
    </Box>
  )
}
