import { lazy, Suspense, useRef, useState } from 'react'
import { Box, Button, CircularProgress } from '@mui/material'
import { useBoardMode } from '../context/BoardModeContext'
import { TABLE } from '../theme'
import { FONT_DISPLAY } from '../design/press'
import type { MountId, ShipConfig } from './config'
import type { CameraView, ViewerHandle } from './Viewer'

const Viewer = lazy(() => import('./Viewer').then(m => ({ default: m.Viewer })))

export function ShipStage({
  config,
  selected,
  onSelect,
}: {
  config: ShipConfig
  selected: MountId
  onSelect: (id: MountId) => void
}) {
  const { canRender3d } = useBoardMode()
  const [view, setView] = useState<CameraView>('Perspective')
  const [exploded, setExploded] = useState(false)
  const [labels, setLabels] = useState(true)
  const [reset, setReset] = useState(0)
  const handle = useRef<ViewerHandle | null>(null)
  return (
    <Box
      component="section"
      aria-label="Ship preview"
      sx={{
        position: 'relative',
        bgcolor: TABLE.felt,
        minHeight: { xs: 390, md: 420 },
        height: '100%',
        overflow: 'hidden',
        '& .mount-tag': {
          fontFamily: FONT_DISPLAY,
          fontWeight: 600,
          letterSpacing: '0.1em',
          fontSize: 12,
          border: `1px solid ${TABLE.plateEdge}`,
          borderRadius: 0,
          p: '6px 9px',
          bgcolor: 'rgba(10,11,13,0.82)',
          color: TABLE.ink,
          cursor: 'pointer',
        },
        '& .mount-tag.active': {
          borderColor: TABLE.accentBlock,
          color: TABLE.onAccent,
          bgcolor: TABLE.accentBlock,
        },
        '& .webgl-fallback': {
          position: 'absolute',
          top: '42%',
          left: '12%',
          right: '12%',
          color: TABLE.inkSoft,
        },
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0 }}>
        {canRender3d ? (
          <Suspense
            fallback={
              <CircularProgress size={24} sx={{ position: 'absolute', top: '50%', left: '50%' }} />
            }
          >
            <Viewer
              config={config}
              selected={selected}
              onSelect={onSelect}
              exploded={exploded ? 1 : 0}
              labels={labels}
              concealed={false}
              turntable={false}
              view={view}
              reset={reset}
              handleRef={handle}
            />
          </Suspense>
        ) : (
          <Box sx={{ p: 4, pt: 20, textAlign: 'center', color: TABLE.inkSoft }}>
            The 3D preview is unavailable. Select a mount in Systems to fit your ship.
          </Box>
        )}
      </Box>
      {canRender3d && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            bgcolor: 'rgba(10,11,13,0.82)',
            border: `1px solid ${TABLE.plateEdge}`,
            borderRadius: 0,
            p: 0.75,
          }}
        >
          {(['Perspective', 'Top', 'Broadside', 'Engines'] as const).map(v => (
            <Button
              key={v}
              size="small"
              aria-pressed={view === v}
              color={view === v ? 'primary' : 'inherit'}
              onClick={() => {
                setView(v)
                setReset(n => n + 1)
              }}
            >
              {v}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          <Button size="small" aria-pressed={exploded} onClick={() => setExploded(v => !v)}>
            {exploded ? 'Assemble' : 'Explode'}
          </Button>
          <Button size="small" aria-pressed={labels} onClick={() => setLabels(v => !v)}>
            Mounts
          </Button>
          <Button size="small" onClick={() => setReset(n => n + 1)}>
            Recenter
          </Button>
        </Box>
      )}
    </Box>
  )
}
