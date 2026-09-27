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
  MISSION_POINTS,
  PRIMARIES_PER_PLAYER,
  PRIMARY_OFFERS_PER_PLAYER,
  SECONDARIES_PER_PLAYER,
  SECONDARY_OFFERS_PER_PLAYER,
} from '@dangerous-inclinations/engine'
import { MissionCard } from '../../components/common/MissionCard'
import { PRESS } from '../../design/press'
import { Body } from '../poster'
import { GuideSection, SubHead } from './parts'

/** Seat counts, the way a card names a rival. */
const SEATS: Record<string, string> = {
  'left-1': 'the 1st player to your left',
  'left-2': 'the 2nd player to your left',
}
const nameOf = (id: string) => SEATS[id] ?? id

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
  destroy_ship: 'Needs a weapon.',
  intercept_transmission: 'Needs a sensor array.',
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
      kicker="The goal"
      title={`${DEFAULT_POINTS_TO_WIN} points end the round`}
      lede={
        <>
          Score your secret mission cards. When anyone reaches {DEFAULT_POINTS_TO_WIN}, finish the
          round; the highest score wins, then the most hull, then the most fuel.
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <CardRow
          title={`Primaries · ${primaryPoints} points`}
          detail={`Dealt ${PRIMARY_OFFERS_PER_PLAYER}, keep ${PRIMARIES_PER_PLAYER}`}
          missions={PRIMARIES}
        />
        <CardRow
          title={`Secondaries · ${secondaryPoints} point`}
          detail={`Dealt ${SECONDARY_OFFERS_PER_PLAYER} from a shuffled pile, keep any ${SECONDARIES_PER_PLAYER}; two of a kind are two jobs.`}
          missions={SECONDARIES}
        />
      </Box>
    </GuideSection>
  )
}
