/**
 * The tools a table wants that a table cannot do quickly in its head.
 *
 * Each one calls the engine for the part that is a rule, so a route it plots
 * or a check it runs is the one the video game would give. Nothing here talks
 * to the server: the page works on a phone with the tab open and the signal
 * gone.
 */
import { Box } from '@mui/material'
import { FONT_DISPLAY, PRESS } from '../design/press'
import type { ToolName } from './routes'
import { TOOL_NAMES } from './routes'
import { SiteLink } from './SiteLink'
import { PageTitle, SitePage } from './SiteChrome'
import { Body, Display, Numeral } from './poster'
import { RoutePlannerTool } from './tools/RoutePlannerTool'
import { HeatTrackerTool } from './tools/HeatTrackerTool'
import { DiceTool } from './tools/DiceTool'

interface Tool {
  name: ToolName
  title: string
  blurb: string
}

const TOOLS: Record<ToolName, Tool> = {
  route: {
    name: 'route',
    title: 'Route planner',
    blurb:
      'The game’s own board: click where the ship is, click where it is going, and the engine lays out the turns, the burns, the phasing and the lane.',
  },
  heat: {
    name: 'heat',
    title: 'Heat check',
    blurb:
      'Heat carried in, the energy your turn spent, radiators. It bills the hull for anything over 10, dissipates and carries the rest.',
  },
  dice: {
    name: 'dice',
    title: 'Dice',
    blurb:
      'A d10, or a fistful of them for a salvo and the rack that answers it, read for hits and criticals.',
  },
}

const ORDER = TOOL_NAMES.map(name => TOOLS[name])

function ToolTabs({ current }: { current: ToolName }) {
  return (
    <Box
      component="nav"
      aria-label="Tools"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: '4px', mb: { xs: 3, sm: 4 } }}
    >
      {ORDER.map((tool, index) => {
        const on = tool.name === current
        return (
          <SiteLink
            key={tool.name}
            to={{ kind: 'tools', tool: tool.name }}
            aria-current={on ? 'page' : undefined}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              minHeight: 48,
              px: 2,
              bgcolor: on ? PRESS.red : PRESS.ink,
              color: PRESS.paper,
              fontFamily: FONT_DISPLAY,
              fontWeight: 600,
              fontSize: '1.05rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              '&:hover': { bgcolor: PRESS.red },
            }}
          >
            <Box component="span" sx={{ color: on ? PRESS.ink : PRESS.red, fontWeight: 700 }}>
              0{index + 1}
            </Box>
            {tool.title}
          </SiteLink>
        )
      })}
    </Box>
  )
}

function ToolsIndex() {
  return (
    <>
      <PageTitle
        kicker="Table tools"
        title="The sums, done for you"
        blurb="For a game with real tiles and cubes. Each tool does the arithmetic of a turn with the engine that runs the video game, so the two always agree."
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          border: `4px solid ${PRESS.ink}`,
        }}
      >
        {ORDER.map((tool, index) => (
          <SiteLink
            key={tool.name}
            to={{ kind: 'tools', tool: tool.name }}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: { xs: 2.5, sm: 3.5 },
              bgcolor: index === 0 ? PRESS.ink : 'transparent',
              color: index === 0 ? PRESS.paper : PRESS.ink,
              borderLeft: { md: index === 0 ? 'none' : `4px solid ${PRESS.ink}` },
              borderTop: { xs: index === 0 ? 'none' : `4px solid ${PRESS.ink}`, md: 'none' },
              '&:hover': { bgcolor: PRESS.red, color: PRESS.paper },
              '&:hover .tool-num': { color: PRESS.ink },
            }}
          >
            <Box className="tool-num" sx={{ color: PRESS.red }}>
              <Numeral size="4rem" color="inherit">
                0{index + 1}
              </Numeral>
            </Box>
            <Display size="2.2rem" color="inherit" component="h2">
              {tool.title}
            </Display>
            <Body color="inherit">{tool.blurb}</Body>
          </SiteLink>
        ))}
      </Box>
    </>
  )
}

export function Tools({ tool }: { tool: ToolName | null }) {
  if (!tool) {
    return (
      <SitePage>
        <ToolsIndex />
      </SitePage>
    )
  }

  const meta = TOOLS[tool]
  return (
    <SitePage>
      <ToolTabs current={tool} />
      <PageTitle kicker="Table tools" title={meta.title} blurb={meta.blurb} />
      {tool === 'route' && <RoutePlannerTool />}
      {tool === 'heat' && <HeatTrackerTool />}
      {tool === 'dice' && <DiceTool />}
    </SitePage>
  )
}
