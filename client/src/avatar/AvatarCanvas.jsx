// The three.js scene for the avatar panel. Loaded lazily (AvatarPanel) so
// three.js only downloads on pages that show the avatar.
//
// Rendering is on demand: frames are drawn while the motion plays or the
// camera glides to a new angle, and not at all when the panel is off-screen.

import { ContactShadows } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import Humanoid, { Chair } from './Humanoid.jsx'
import { applyPose } from './rig.js'

const FOV = 32
const CAMERAS = {
  // a slight three-quarter angle so depth (squat, arm forward) still reads
  front: { dir: new Vector3(0.28, 0.1, 1).normalize() },
  // from the avatar's left, a little in front, so the face stays readable
  side: { dir: new Vector3(1, 0.08, 0.18).normalize() },
}

// Space the avatar needs on screen (m): standing with arms up, or seated
function framing(seated) {
  return seated ? { height: 1.5, width: 1.25, centre: 0.72 } : { height: 1.95, width: 1.45, centre: 0.95 }
}

/** Glides the camera to the chosen angle, far enough back to fit the avatar at any aspect ratio. */
function CameraRig({ view, seated }) {
  const { camera, size, invalidate } = useThree()
  const goal = useRef(new Vector3())
  const target = useRef(new Vector3())
  const first = useRef(true)

  useEffect(() => {
    const f = framing(seated)
    const aspect = size.width / Math.max(1, size.height)
    const tanV = Math.tan(((FOV / 2) * Math.PI) / 180)
    const dist = Math.max(f.height / 2 / tanV, f.width / 2 / (tanV * aspect)) + 0.15
    target.current.set(0, f.centre, seated ? 0.12 : 0)
    goal.current.copy(CAMERAS[view].dir).multiplyScalar(dist).add(target.current)
    if (first.current) {
      camera.position.copy(goal.current)
      first.current = false
    }
    invalidate()
  }, [view, seated, size, camera, invalidate])

  useFrame((_, dt) => {
    if (camera.position.distanceToSquared(goal.current) > 1e-6) {
      camera.position.lerp(goal.current, 1 - Math.exp(-dt * 6))
      invalidate()
    }
    camera.lookAt(target.current)
  })
  return null
}

/** Ticks the player each frame and puts the pose on the bones. */
function Animator({ player, playing }) {
  const bones = useRef(null)
  const { invalidate } = useThree()
  const onBones = useCallback(
    (b) => {
      bones.current = b
      applyPose(b, player.tick(0).pose)
      invalidate()
    },
    [player, invalidate],
  )

  // a new exercise or a seek while paused still needs one frame
  useEffect(() => {
    if (bones.current) applyPose(bones.current, player.tick(0).pose)
    invalidate()
  })

  useFrame((_, dt) => {
    if (!bones.current) return
    // cap dt so a backgrounded tab doesn't jump a whole phase
    applyPose(bones.current, player.tick(Math.min(dt, 0.1)).pose)
    if (playing) invalidate()
  })

  return <Humanoid onBones={onBones} />
}

/**
 * @param player   from createPlayer (player.js)
 * @param playing  whether the player is running (keeps frames coming)
 * @param view     'front' | 'side'
 * @param mirrored flip left/right so the patient can follow like a mirror
 * @param visible  false when scrolled off-screen: stop rendering
 */
export default function AvatarCanvas({ player, playing, view, mirrored, visible, label }) {
  const seated = player.motion.seated
  return (
    <Canvas
      frameloop={visible ? 'demand' : 'never'}
      dpr={[1, 1.75]}
      camera={{ fov: FOV, near: 0.1, far: 30, position: [0, 1, 6] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-label={label}
      role="img"
    >
      <hemisphereLight args={['#ffffff', '#cbd5e1', 1.5]} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.8} />
      <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#dbeafe" />
      <CameraRig view={view} seated={seated} />
      <group scale={[mirrored ? -1 : 1, 1, 1]}>
        <Animator player={player} playing={playing} />
        {seated && <Chair />}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <circleGeometry args={[0.75, 48]} />
        <meshStandardMaterial color="#dbe4ee" roughness={1} transparent opacity={0.6} />
      </mesh>
      <ContactShadows position={[0, 0.001, 0]} scale={2.4} resolution={256} blur={2.2} opacity={0.45} far={1.6} />
    </Canvas>
  )
}
