import { Box } from '@mui/material'
import type { ReactNode } from 'react'
import { Panel } from '../../common/Panel'
import { TABLE } from '../../../design/tokens'
import { StatusBlock } from '../StatusBlock'

/**
 * The column itself: the plate, your status pinned to the top of it, and
 * whatever the turn needs under that. A turn that is yours to take wears its
 * title on the red slab; waiting for someone else, it is a plain plate.
 */
export function TurnShell({
  title,
  slab = false,
  action,
  children,
}: {
  title: string
  slab?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Panel
      title={title}
      slab={slab}
      dense
      action={action}
      sx={{ flex: 1, minWidth: 0, minHeight: 0 }}
    >
      <Box
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 0.5 }}
      >
        <StatusBlock accent={slab ? TABLE.accentBlock : TABLE.plateEdge} />
        {children}
      </Box>
    </Panel>
  )
}
