/**
 * 03 · The turn, on a black band because it is the thing a table reads most:
 * the seven steps in order (`site/turn.ts`, which the rules dialog and the
 * printed card read too), and the one rule of the opening round.
 */
import { Box } from '@mui/material'
import { PRESS } from '../../design/press'
import { Body, Display, Kicker, Numeral } from '../poster'
import { QUIET_TURN, TURN_STEPS } from '../turn'
import { CHEATSHEET } from '../../text/cheatsheet'
import { rich } from '../../utils/rich'
import { GuideSection } from './parts'

const T = CHEATSHEET.turn

export function TurnSection() {
  return (
    <GuideSection id="turn" n={3} kicker={T.kicker} title={T.title} lede={T.lede} tone="ink">
      <Box
        component="ol"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gap: '4px',
          bgcolor: PRESS.paperSoft,
          border: `4px solid ${PRESS.paperSoft}`,
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        }}
      >
        {TURN_STEPS.map((step, index) => (
          <Box
            component="li"
            key={step.title}
            sx={{
              // The round's step is not anyone's turn: it is set on paper.
              bgcolor: step.roundEnd ? PRESS.paper : PRESS.ink,
              p: { xs: 2.5, sm: 3 },
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Numeral size="3.6rem">{index + 1}</Numeral>
              {index === 0 && <Kicker color={PRESS.paperSoft}>{T.respawnNote}</Kicker>}
              {index === 2 && <Kicker color={PRESS.paperSoft}>{T.actionsNote}</Kicker>}
              {step.roundEnd && <Kicker>{T.roundEndNote}</Kicker>}
            </Box>
            <Display size="1.75rem" color={step.roundEnd ? PRESS.ink : PRESS.paper} component="h3">
              {step.title}
            </Display>
            <Body size="0.96rem" color={step.roundEnd ? PRESS.ink : PRESS.paperSoft}>
              {step.blurb}
            </Body>
          </Box>
        ))}
        <Box
          component="li"
          sx={{
            bgcolor: PRESS.red,
            p: { xs: 2.5, sm: 3 },
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
          }}
        >
          <Numeral size="3.6rem" color={PRESS.ink}>
            {T.quiet.numeral}
          </Numeral>
          <Display size="1.75rem" color={PRESS.paper} component="h3">
            {T.quiet.title}
          </Display>
          <Body size="0.96rem" color={PRESS.paper}>
            {rich(T.quiet.text, { quietTurn: QUIET_TURN })}
          </Body>
        </Box>
      </Box>
    </GuideSection>
  )
}
