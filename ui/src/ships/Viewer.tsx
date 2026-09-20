import { Component, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Vector3, type Group, type PerspectiveCamera, type WebGLRenderer } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { MOUNTS, mountTransform, type MountId, type ShipConfig } from './config'
import { poseShip } from './model'
import { useShipModel } from './useShipModel'

export type CameraView = 'Perspective' | 'Top' | 'Broadside' | 'Engines'
export interface ViewerHandle {
  model: Group
  renderer: WebGLRenderer
  capture: () => string
}
interface ViewerProps {
  config: ShipConfig
  selected: MountId
  onSelect: (id: MountId) => void
  exploded: number
  labels: boolean
  concealed: boolean
  turntable: boolean
  view: CameraView
  reset: number
  handleRef: { current: ViewerHandle | null }
}

class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="webgl-fallback">
        The 3D view is unavailable. You can still edit every system and color using the controls.
      </div>
    ) : (
      this.props.children
    )
  }
}

function Scene(props: ViewerProps) {
  const {
    config,
    selected,
    onSelect,
    exploded,
    labels,
    concealed,
    turntable,
    view,
    reset,
    handleRef,
  } = props
  const model = useShipModel(config, concealed)
  const { gl, scene, camera, size, invalidate } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const framingRadius = exploded > 0 ? 8.8 : 6.9

  useLayoutEffect(() => {
    poseShip(model, exploded, selected)
    invalidate()
  }, [model, config, concealed, exploded, selected, invalidate])
  useEffect(() => {
    handleRef.current = {
      model: model.root,
      renderer: gl,
      capture: () => {
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      },
    }
    return () => {
      handleRef.current = null
    }
  }, [model, gl, scene, camera, handleRef])

  useEffect(() => {
    const perspective = camera as PerspectiveCamera
    const direction = new Vector3(
      ...(
        {
          Perspective: [10, 8, 12],
          Top: [0, 18, 0.001],
          Broadside: [0, 0, 18],
          Engines: [-14, 6, 9],
        } as const
      )[view]
    ).normalize()
    // Leave room for the separated modules without chasing every slider tick.
    const verticalFov = (perspective.fov * Math.PI) / 180
    const limitingFov = Math.min(
      verticalFov,
      2 * Math.atan((Math.tan(verticalFov / 2) * size.width) / size.height)
    )
    const distance = framingRadius / Math.sin(limitingFov / 2)
    const target = new Vector3(framingRadius > 7 ? 1 : 0.2, 0, 0)
    camera.position.copy(target).addScaledVector(direction, distance)
    camera.up.set(view === 'Top' ? 1 : 0, view === 'Top' ? 0 : 1, 0)
    camera.lookAt(target)
    controls.current?.target.copy(target)
    controls.current?.update()
    invalidate()
  }, [camera, view, reset, size.width, size.height, invalidate, framingRadius])

  function select(event: ThreeEvent<MouseEvent>) {
    if (event.delta > 5) return
    let object = event.object
    while (object.parent && !object.userData.mountId) object = object.parent
    if (object.userData.mountId) {
      event.stopPropagation()
      onSelect(object.userData.mountId as MountId)
    }
  }

  return (
    <>
      <color attach="background" args={['#20292d']} />
      <fog attach="fog" args={['#20292d', 38, 85]} />
      <hemisphereLight args={['#dee7eb', '#3d4542', 1.65]} />
      <directionalLight
        position={[2, 10, 5]}
        color="#fff2da"
        intensity={3.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-13}
        shadow-camera-right={13}
        shadow-camera-top={13}
        shadow-camera-bottom={-13}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[-7, 4, -6]} color="#87b8cf" intensity={3} />
      <directionalLight position={[7, -1, 4]} color="#b7cbd5" intensity={0.8} />
      <primitive object={model.root} onClick={select} />
      {labels &&
        MOUNTS.map(mount => {
          const transform = mountTransform(config, mount.id)
          return (
            <group
              key={mount.id}
              position={transform.position}
              rotation={transform.rotation}
              scale={transform.scale}
            >
              <Html position={[0, 0.32 + exploded * 2.2, 0.99]} center zIndexRange={[20, 0]}>
                <button
                  className={`mount-tag ${selected === mount.id ? 'active' : ''}`}
                  title={mount.label}
                  aria-label={`Select ${mount.label}`}
                  onClick={() => onSelect(mount.id)}
                >
                  {mount.short}
                </button>
              </Html>
            </group>
          )
        })}
      <mesh position={[0, -3.3, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#202a2e" roughness={0.95} metalness={0.1} />
      </mesh>
      <gridHelper args={[40, 40, '#3c4b4e', '#2d3b3e']} position={[0, -3.285, 0]} />
      <mesh position={[0, -3.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.87, 6.89, 128]} />
        <meshBasicMaterial color="#607070" transparent opacity={0.25} />
      </mesh>
      <OrbitControls
        ref={controls}
        makeDefault
        autoRotate={turntable}
        autoRotateSpeed={0.6}
        enableDamping
        minDistance={7}
        maxDistance={60}
        maxPolarAngle={Math.PI * 0.94}
      />
    </>
  )
}

export function Viewer(props: ViewerProps) {
  return (
    <ViewBoundary>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        frameloop={props.turntable ? 'always' : 'demand'}
        camera={{ position: [15, 12, 18], fov: 36, near: 0.1, far: 150 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        fallback={
          <div className="webgl-fallback">
            The 3D view is unavailable. Use the slot list to fit your ship.
          </div>
        }
      >
        <Scene {...props} />
      </Canvas>
    </ViewBoundary>
  )
}
