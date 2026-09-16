/**
 * One clock for every shader on the board.
 *
 * Animated materials share a single time uniform rather than each keeping its
 * own: one `useFrame` advances it, nothing re-renders, and every ribbon on the
 * table stays in phase. React state never sees it.
 *
 * **Why the clock writes through the scene rather than just advancing a number.**
 * Sharing `sceneTime` by reference looks like it should be enough, and it is
 * not. Every `<shaderMaterial uniforms={...} />` has its uniforms run through
 * three's `cloneUniforms`, which copies a number by value and shares an object
 * or a typed array by reference. So a material receives a private `{ value }`
 * holding whatever the clock read at mount, and every later `sceneTime.value +=
 * delta` writes to an object the renderer has already stopped looking at. The
 * board was mounting with 40 such materials and freezing all of them about a
 * third of a second in: the ring dashes that show how fast a ring carries a
 * ship, the flow that shows which way a lane runs, the planets' rotation, the
 * accretion disc, the starfield's twinkle. Nothing moved, and nothing looked
 * broken enough to notice.
 *
 * A typed array survived, because `cloneUniforms` passes one by reference —
 * which is exactly the asymmetry that named the bug.
 *
 * So the clock walks the scene each frame and writes the time into every
 * material that asked for one. Anything mounted later is picked up on its first
 * frame, and a material that never declares `uTime` costs a property check.
 */
import { useFrame } from '@react-three/fiber'
import type { Material, Mesh, Object3D, ShaderMaterial } from 'three'

/**
 * Seconds since the scene mounted.
 *
 * Still the one source of board time, and still what to read from a `useFrame`
 * of your own. Passing it straight to a `<shaderMaterial>` as `uTime` is
 * correct and is what the scene does — the clock is what makes it true.
 */
export const sceneTime = { value: 0 }

/** The uniform every animated material on the board agrees to call its clock. */
const TIME_UNIFORM = 'uTime'

function writeTime(material: Material | Material[] | undefined, time: number): void {
  if (!material) return
  if (Array.isArray(material)) {
    for (const one of material) writeTime(one, time)
    return
  }
  const uniforms = (material as ShaderMaterial).uniforms
  const slot = uniforms?.[TIME_UNIFORM]
  if (slot) slot.value = time
}

/** Mount once inside the canvas; it is the only thing that writes `sceneTime`. */
export function SceneClock() {
  useFrame((state, delta) => {
    sceneTime.value += delta
    const time = sceneTime.value
    state.scene.traverse((object: Object3D) => {
      writeTime((object as Mesh).material, time)
    })
  })
  return null
}
