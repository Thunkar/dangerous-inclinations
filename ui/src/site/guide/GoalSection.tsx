/**
 * 01 · The goal. What a first game most needs to know and the old card never
 * said: you are here for three points, and where they come from.
 *
 * The six cards are the game's own `MissionCard`, dealt from sample missions,
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
import { GuideSection, Op, SubHead, SumBlock } from './parts'

/** Seat counts, the way a card names a rival. */
const SEATS: Record<string, string> = {
  'left-1': '1st to your left',
  'left-2': '2nd to your left',
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
    scanAcquired: false,
    dataCargoId: 'g-chit',
  },
]

const SECONDARIES: Mission[] = [
  {
    id: 'g-survey',
    type: 'survey',
    isCompleted: false,
    deliveryPlanetId: 'any',
    acquired: false,
    dataCargoId: 'g-survey-chit',
  },
  { id: 'g-piracy', type: 'piracy', isCompleted: false, cargoId: 'g-loot' },
  { id: 'g-tanker', type: 'tanker', isCompleted: false },
]

/** What the card does not print: the one thing a hand must be able to do. */
const NOTE: Partial<Record<MissionType, string>> = {
  destroy_ship: 'Hull to 0. Needs a weapon.',
  deliver_cargo: 'Load at the first station, deliver at the second.',
  intercept_transmission: 'Scan them, then dock there. Needs a sensor.',
  survey: 'End a turn on black hole ring 1, then dock anywhere.',
  piracy: 'Share a sector with an undocked carrier; sell anywhere.',
  tanker: 'Arrive at a station with the fuel.',
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
            <Body size="0.88rem" color={PRESS.inkSoft}>
              {NOTE[mission.type]}
            </Body>
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
          detail={`Dealt ${PRIMARY_OFFERS_PER_PLAYER}, keep ${PRIMARIES_PER_PLAYER}. Cards count seats ("2nd to your left"), so none names its holder.`}
          missions={PRIMARIES}
        />
        <CardRow
          title={`Secondaries · ${secondaryPoints} point`}
          detail={`Everyone gets all ${SECONDARY_OFFERS_PER_PLAYER} and keeps ${SECONDARIES_PER_PLAYER}; the third goes face-down on a shared discard.`}
          missions={SECONDARIES}
        />
      </Box>
    </GuideSection>
  )
}
