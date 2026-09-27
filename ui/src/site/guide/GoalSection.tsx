/**
 * 01 · The goal: you are here for three points, and this is where they come
 * from.
 *
 * The eight cards are the game's own `MissionCard`, dealt from sample missions,
 * so the cheatsheet shows the card a player is holding at the table rather
 * than a description of one.
 */
import { Box } from '@mui/material'
import type { Mission, MissionType } from '@dangerous-inclinations/engine'
import {
  DEFAULT_POINTS_TO_WIN,
  MISSION_CARDS,
  fill,
  MISSION_POINTS,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  SECONDARY_OFFERS_PER_PLAYER,
} from '@dangerous-inclinations/engine'
import { MissionCard } from '../../components/common/MissionCard'
import { PRESS } from '../../design/press'
import { Body } from '../poster'
import { CHEATSHEET } from '../../text/cheatsheet'
import { rich } from '../../utils/rich'
import { GuideSection, SubHead } from './parts'

const T = CHEATSHEET.goal

/** Seat counts, the way a card names a rival. */
const nameOf = (id: string) => T.rivals[id] ?? id

const PRIMARIES: Mission[] = [
  { id: 'g-destroy', type: 'destroy_ship', isCompleted: false, targetPlayerId: 'left-2' },
  {
    id: 'g-deliver',
    type: 'deliver_cargo',
    isCompleted: false,
    pickupPlanetId: 'planet-alpha',
    deliveryPlanetId: 'planet-gamma',
    cargoId: 'g-crate',
  },
  {
    id: 'g-intercept',
    type: 'intercept_transmission',
    isCompleted: false,
    targetPlayerId: 'left-1',
    deliveryPlanetId: 'planet-beta',
    dataCargoId: 'g-data',
  },
]

const SECONDARIES: Mission[] = [
  {
    id: 'g-survey',
    type: 'survey',
    isCompleted: false,
    dataCargoId: 'g-survey-data',
  },
  { id: 'g-piracy', type: 'piracy', isCompleted: false, cargoId: 'g-loot' },
  { id: 'g-tanker', type: 'tanker', isCompleted: false },
  { id: 'g-escort', type: 'escort', isCompleted: false, markedPlayerId: null },
  { id: 'g-salvage', type: 'salvage', isCompleted: false, cargoId: 'g-salvage-box' },
]

/** What the card does not print: the subsystem it needs aboard. */
const NOTE: Partial<Record<MissionType, string>> = {
  destroy_ship: MISSION_CARDS.destroy_ship.needs,
  intercept_transmission: MISSION_CARDS.intercept_transmission.needs,
}

const primaryPoints = MISSION_POINTS.destroy_ship
const secondaryPoints = MISSION_POINTS.survey

function CardRow({
  title,
  detail,
  missions,
}: {
  title: string
  detail: string
  missions: Mission[]
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '260px 1fr' },
        gap: { xs: 2, md: 4 },
        alignItems: 'start',
      }}
    >
      <Box>
        <SubHead>{title}</SubHead>
        <Body size="0.98rem">{detail}</Body>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, 168px)',
          justifyContent: { xs: 'center', sm: 'start' },
          gap: 2.5,
        }}
      >
        {missions.map(mission => (
          <Box key={mission.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <MissionCard mission={mission} nameOf={nameOf} cargo={[]} />
            {NOTE[mission.type] && (
              <Body size="0.88rem" color={PRESS.inkSoft}>
                {NOTE[mission.type]}
              </Body>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export function GoalSection() {
  return (
    <GuideSection
      id="goal"
      n={1}
      kicker={T.kicker}
      title={fill(T.title, { points: DEFAULT_POINTS_TO_WIN })}
      lede={rich(T.lede, { points: DEFAULT_POINTS_TO_WIN })}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <CardRow
          title={fill(T.primaries.title, { points: primaryPoints })}
          detail={fill(T.primaries.detail, {
            dealt: PRIMARY_OFFERS_PER_PLAYER,
            kept: PRIMARIES_PER_PLAYER,
          })}
          missions={PRIMARIES}
        />
        <CardRow
          title={fill(T.secondaries.title, { points: secondaryPoints })}
          detail={fill(T.secondaries.detail, {
            dealt: SECONDARY_OFFERS_PER_PLAYER,
            kept: SECONDARIES_PER_PLAYER,
          })}
          missions={SECONDARIES}
        />
      </Box>
    </GuideSection>
  )
}
