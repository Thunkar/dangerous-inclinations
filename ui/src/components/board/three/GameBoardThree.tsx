/**
 * The 3D board.
 *
 * Same model as the SVG board, same marks, same meanings — drawn in WebGL so
 * the black hole is a well you can see into and a ship is a hull with a nose.
 * It renders a `BoardModel` and nothing else: every coordinate comes from
 * `geometry.ts` through `world.ts`, every rule answer is already in the model.
 *
 * Nothing in the scene re-renders per frame. The camera, the drifting ring
 * dashes, the lane flow and the sliding tokens all live in `useFrame` and in
 * refs; React only hears about a hover or a preset change.
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Box, IconButton, Tooltip } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong'
import ViewInArIcon from '@mui/icons-material/ViewInAr'
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import { Canvas } from '@react-three/fiber'
import type { GravityWellId } from '@dangerous-inclinations/engine'
import { TABLE } from '../../../theme'
import type { BoardModel } from '../model'
import { CameraRig, CameraRigProvider } from './CameraRig'
import { CAMERA_PRESETS, useCameraRig, type CameraPreset } from './cameraRigContext'
import { SceneClock } from './clock'
import { FrameStats } from './FrameStats'
import { Environment } from './scene/Environment'
import { disposeBoardSurfaces } from './surfaces'
import { Effects } from './scene/Effects'
import { Lanes } from './scene/Lanes'
import { Markers } from './scene/Markers'
import { Missiles } from './scene/Missiles'
import { Overlays } from './scene/Overlays'
import { Ships } from './scene/Ships'
import { Wells } from './scene/Wells'
import { CAMERA_FAR, CAMERA_NEAR } from './world'

const PRESET_LABEL: Record<CameraPreset, string> = {
  table: 'Table view',
  top: 'Top view',
  follow: 'Follow your ship',
}

/** The presets that get a button. 'table' is Recentre's job; see the column below. */
const BUTTON_PRESETS: readonly CameraPreset[] = ['top', 'follow']

const PRESET_ICON: Record<CameraPreset, React.ReactNode> = {
  table: <ViewInArIcon fontSize="small" />,
  top: <VerticalAlignTopIcon fontSize="small" />,
  follow: <MyLocationIcon fontSize="small" />,
}

/**
 * The composer is off by default, and the reason is the picture rather than
 * the cost. Bloom blurs the accretion disc across the event horizon, turning
 * the blackest thing on the table into a grey smudge, and it lifts the black
 * of the plates that every sector number is printed on. It is also the one
 * expensive thing in the scene: 103 ms a frame against 61 at 1440x900 under
 * SwiftShader, where the whole cheap path saves only three.
 *
 * `?fx=on` turns it on — tuned so that is defensible — and the scene's own
 * adaptive ladder in `Environment.tsx` will drop it again on a machine that
 * cannot afford it. `?quality=high|low` pins that ladder for a screenshot.
 */
const POSTPROCESSING_DEFAULT = false

/**
 * Dev flags, read once from the query string: `?preset=` frames a preset for a
 * screenshot, `?fx=on|off` requests the composer, `?stats=1` logs frame times.
 * `?quality=high|low` is read by the scene itself, not here.
 */
function readFlags() {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
  const asked = params.get('preset')
  const preset = CAMERA_PRESETS.includes(asked as CameraPreset) ? (asked as CameraPreset) : 'table'
  const fx = params.get('fx')
  return {
    preset,
    postprocessing: fx === null ? POSTPROCESSING_DEFAULT : fx === 'on' || fx === '1',
    stats: params.get('stats') === '1',
  }
}

export default function GameBoardThree({ model }: { model: BoardModel }) {
  const flags = useMemo(() => readFlags(), [])
  // The printed board's buffers are built once and shared; hand them back to
  // the GPU when the 3D board goes away.
  useEffect(() => disposeBoardSurfaces, [])
  return (
    <CameraRigProvider initialPreset={flags.preset}>
      <Board model={model} postprocessing={flags.postprocessing} stats={flags.stats} />
    </CameraRigProvider>
  )
}

function Board({
  model,
  postprocessing,
  stats,
}: {
  model: BoardModel
  postprocessing: boolean
  stats: boolean
}) {
  const rig = useCameraRig()
  const followWellId = model.ships.find(ship => ship.isMe)?.position.wellId

  /**
   * A ping asks "where are they?", and on this board the honest answer is to
   * point the camera at them: the rings the flat board draws are no help if
   * the ship is in a well that is off screen or behind the black hole. Keyed
   * on the ping's id, so asking twice answers twice.
   */
  const pingId = model.ping?.id
  const pingWellId = model.ping?.position.wellId
  useEffect(() => {
    if (pingId && pingWellId) rig.flyTo(pingWellId as GravityWellId)
    // The ping's id is what makes this a new answer; the rig never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pingId])

  // Dev only: the harness and the headless screenshot runs drive the camera
  // through this, because the rig lives inside the canvas.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __boardRig?: typeof rig }).__boardRig = rig
  }, [rig])

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 45, near: CAMERA_NEAR, far: CAMERA_FAR, position: [0, 1600, 1400] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
      >
        <color attach="background" args={[TABLE.felt]} />
        <SceneClock />
        <Suspense fallback={null}>
          <Environment postprocessing={postprocessing} />
          <Wells onFocusWell={rig.flyTo} />
          <Lanes activeLaneIds={model.activeLaneIds} />
          <Markers stations={model.stations} homes={model.homes} />
          <Overlays model={model} />
          <Missiles
            missiles={model.missiles}
            previews={model.missilePreviews}
            paths={model.missilePaths}
            colorOf={model.colorOf}
            nameOf={model.nameOf}
          />
          <Ships
            ships={model.ships}
            selectableIds={model.selectableIds}
            onPickTarget={model.onPickTarget}
          />
          <Effects effects={model.effects} pointOf={model.pointOf} />
        </Suspense>
        <CameraRig rig={rig} followWellId={followWellId} />
        {/* The label is the request: the scene's adaptive ladder may have since
            dropped the composer, so this says "asked for", not "running". */}
        {stats && <FrameStats label={postprocessing ? 'composer asked' : 'no composer'} />}
      </Canvas>

      <Box
        sx={{
          position: 'absolute',
          right: 8,
          top: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        <BoardButton title="Zoom in" onClick={() => rig.zoomBy(1.25)}>
          <AddIcon fontSize="small" />
        </BoardButton>
        <BoardButton title="Zoom out" onClick={() => rig.zoomBy(1 / 1.25)}>
          <RemoveIcon fontSize="small" />
        </BoardButton>
        <BoardButton title="Recentre the board" onClick={rig.reset}>
          <CenterFocusStrongIcon fontSize="small" />
        </BoardButton>
        <Box sx={{ height: 6 }} />
        {/*
          The three-quarter view has no button of its own: it is where the board
          starts and where Recentre puts it back, so a preset for it would be the
          same control twice. Only the two viewpoints that are somewhere else get
          one.
        */}
        {BUTTON_PRESETS.map(preset => (
          <BoardButton
            key={preset}
            title={PRESET_LABEL[preset]}
            selected={rig.preset === preset}
            onClick={() => rig.setPreset(preset)}
          >
            {PRESET_ICON[preset]}
          </BoardButton>
        ))}
      </Box>
    </Box>
  )
}

function BoardButton({
  title,
  onClick,
  selected,
  children,
}: {
  title: string
  onClick: () => void
  selected?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip title={title} placement="left">
      <IconButton
        size="small"
        onClick={onClick}
        sx={{
          bgcolor: 'rgba(18,25,36,0.8)',
          color: selected ? TABLE.accent : TABLE.inkSoft,
          borderRadius: 1,
          border: `1px solid ${selected ? TABLE.accent : 'rgba(126,165,205,0.2)'}`,
          '&:hover': { color: TABLE.accent, borderColor: TABLE.accent },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  )
}
