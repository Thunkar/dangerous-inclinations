/**
 * 03 · The turn, on a black band because it is the thing a table reads most:
 * the seven steps in order (`site/turn.ts`, which the rules dialog and the
 * printed card read too), and the one rule of the opening round.
 */
import { Box } from '@mui/material'
import { PRESS } from '../../design/press'
import { Body, Display, Kicker, Numeral } from '../poster'
import { QUIET_TURN, TURN_STEPS } from '../turn'
import { GuideSection } from './parts'

export function TurnSection() {
  return (
    <GuideSection
      id="turn"
      n={3}
      kicker="Your turn"
      title="Seven steps, in this order"
      lede="Whole turns, one player at a time, going left. You choose the order of your actions; the rest is fixed."
      tone="ink"
    >
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
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
        }}
      >
        {TURN_STEPS.map((step, index) => (
          <Box
            component="li"
            key={step.title}
            sx={{
              bgcolor: PRESS.ink,
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
              {index === 0 && <Kicker color={PRESS.paperSoft}>If destroyed</Kicker>}
              {index === 2 && <Kicker color={PRESS.paperSoft}>Any order</Kicker>}
            </Box>
            <Display size="1.75rem" color={PRESS.paper} component="h3">
              {step.title}
            </Display>
            <Body size="0.96rem" color={PRESS.paperSoft}>
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
            R1
          </Numeral>
          <Display size="1.75rem" color={PRESS.paper} component="h3">
            Round one is quiet
          </Display>
          <Body size="0.96rem" color={PRESS.paper}>
            {QUIET_TURN} So is your first turn back from Home.
          </Body>
        </Box>
      </Box>
    </GuideSection>
  )
}
