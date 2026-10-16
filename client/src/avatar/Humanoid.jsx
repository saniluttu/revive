// A friendly stylised humanoid built from three.js primitives — no model to
// download. Joints are nested groups laid out from rig.js SKELETON; meshes hang
// off them, so posing a joint moves everything below it. `onBones` hands the
// { joint: Object3D } map to the animator, the same map a rigged GLB would give
// (see rig.js MIXAMO_BONES).

import { RoundedBox } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BODY, JOINTS, SKELETON } from './rig.js'

const COLORS = {
  skin: '#f2c6a0',
  cheek: '#f29b8f',
  hair: '#4a3426',
  eye: '#24303f',
  shirt: '#10b981', // brand-500
  shirtDark: '#059669',
  pants: '#3b4a63',
  shoe: '#f8fafc',
  sole: '#94a3b8',
}

// One material per colour, shared by every mesh
function useMaterials() {
  return useMemo(() => {
    const m = {}
    for (const [k, color] of Object.entries(COLORS)) m[k] = { color, roughness: k === 'eye' ? 0.3 : 0.75 }
    return m
  }, [])
}

/** A capsule hanging down from its joint, `length` joint to joint. */
function Limb({ length, radius, color, endRadius = radius }) {
  // a capsule's height is length + 2·radius; keep the ends inside the joints
  const core = Math.max(0.001, length - radius - endRadius)
  return (
    <mesh position={[0, -length / 2, 0]}>
      <capsuleGeometry args={[(radius + endRadius) / 2, core, 6, 16]} />
      <meshStandardMaterial {...color} />
    </mesh>
  )
}

function Joint({ radius, color }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 16, 12]} />
      <meshStandardMaterial {...color} />
    </mesh>
  )
}

const HEAD = 0.155

function Face({ m }) {
  const r = HEAD
  const k = r / 0.13 // features were laid out on a 0.13 m head
  return (
    <group>
      {/* head */}
      <mesh scale={[1, 1.08, 1]}>
        <sphereGeometry args={[r, 32, 24]} />
        <meshStandardMaterial {...m.skin} />
      </mesh>
      {/* hair: a cap over the top and back */}
      <mesh position={[0, 0.022, -0.012]} rotation={[-0.35, 0, 0]} scale={[1.06, 1.08, 1.08]}>
        <sphereGeometry args={[r, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        <meshStandardMaterial {...m.hair} />
      </mesh>
      {/* ears */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * r * 0.98, -0.01 * k, -0.005]} scale={[0.5, 1, 0.8]}>
          <sphereGeometry args={[0.03 * k, 12, 10]} />
          <meshStandardMaterial {...m.skin} />
        </mesh>
      ))}
      {/* eyes */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * 0.045 * k, 0.012 * k, r * 0.93]} scale={[1, 1.25, 0.6]}>
          <sphereGeometry args={[0.017 * k, 12, 10]} />
          <meshStandardMaterial {...m.eye} />
        </mesh>
      ))}
      {/* brows */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * 0.047 * k, 0.05 * k, r * 0.9]} rotation={[0, 0, Math.PI / 2 + side * 0.12]}>
          <capsuleGeometry args={[0.006 * k, 0.026 * k, 2, 6]} />
          <meshStandardMaterial {...m.hair} />
        </mesh>
      ))}
      {/* rosy cheeks */}
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * 0.075 * k, -0.025 * k, r * 0.84]} scale={[1, 0.6, 0.3]}>
          <sphereGeometry args={[0.022 * k, 12, 10]} />
          <meshStandardMaterial {...m.cheek} transparent opacity={0.55} />
        </mesh>
      ))}
      {/* smile: the lower half of a thin ring */}
      <mesh position={[0, -0.028 * k, r * 0.94]} rotation={[0.15, 0, Math.PI]}>
        <torusGeometry args={[0.032 * k, 0.0065 * k, 8, 20, Math.PI]} />
        <meshStandardMaterial {...m.eye} />
      </mesh>
      {/* nose */}
      <mesh position={[0, -0.005 * k, r * 1.0]}>
        <sphereGeometry args={[0.013 * k, 10, 8]} />
        <meshStandardMaterial {...m.skin} />
      </mesh>
    </group>
  )
}

function Arm({ m }) {
  return (
    <>
      <Joint radius={0.066} color={m.shirt} />
      <Limb length={BODY.upperArm} radius={0.062} endRadius={0.05} color={m.shirt} />
    </>
  )
}

function Forearm({ m }) {
  return (
    <>
      <Joint radius={0.047} color={m.skin} />
      <Limb length={BODY.forearm} radius={0.046} endRadius={0.038} color={m.skin} />
      {/* hand */}
      <mesh position={[0, -BODY.forearm - 0.038, 0.005]} scale={[0.8, 1.15, 0.6]}>
        <sphereGeometry args={[0.052, 16, 12]} />
        <meshStandardMaterial {...m.skin} />
      </mesh>
    </>
  )
}

function Foot({ m }) {
  return (
    <group position={[0, -BODY.ankleHeight / 2, 0.05]}>
      <RoundedBox args={[0.115, 0.08, 0.25]} radius={0.038} smoothness={3}>
        <meshStandardMaterial {...m.shoe} />
      </RoundedBox>
      <RoundedBox args={[0.12, 0.02, 0.255]} radius={0.01} smoothness={2} position={[0, -0.03, 0]}>
        <meshStandardMaterial {...m.sole} />
      </RoundedBox>
    </group>
  )
}

// What hangs off each joint
const PARTS = {
  pelvis: ({ m }) => (
    <mesh position={[0, -0.02, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.85, 1, 0.8]}>
      <capsuleGeometry args={[0.11, 0.1, 6, 16]} />
      <meshStandardMaterial {...m.pants} />
    </mesh>
  ),
  spine: ({ m }) => (
    <mesh position={[0, 0.1, 0]} scale={[1, 1, 0.74]}>
      <capsuleGeometry args={[0.15, 0.06, 6, 20]} />
      <meshStandardMaterial {...m.shirt} />
    </mesh>
  ),
  chest: ({ m }) => (
    <>
      <mesh position={[0, 0.11, 0]} scale={[1, 1, 0.7]}>
        <capsuleGeometry args={[0.175, 0.08, 8, 24]} />
        <meshStandardMaterial {...m.shirt} />
      </mesh>
      {/* shoulders */}
      <mesh position={[0, BODY.shoulderHeight - 0.01, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, 0.75]}>
        <capsuleGeometry args={[0.075, BODY.shoulderWidth * 2 - 0.1, 6, 16]} />
        <meshStandardMaterial {...m.shirt} />
      </mesh>
      {/* collar */}
      <mesh position={[0, BODY.shoulderHeight + 0.035, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.055, 0.014, 8, 20]} />
        <meshStandardMaterial {...m.shirtDark} />
      </mesh>
    </>
  ),
  neck: ({ m }) => (
    <mesh position={[0, 0.02, 0]}>
      <cylinderGeometry args={[0.05, 0.055, 0.1, 16]} />
      <meshStandardMaterial {...m.skin} />
    </mesh>
  ),
  head: Face,
  shoulderL: Arm,
  shoulderR: Arm,
  elbowL: Forearm,
  elbowR: Forearm,
  hipL: ({ m }) => <Limb length={BODY.thigh} radius={0.088} endRadius={0.07} color={m.pants} />,
  hipR: ({ m }) => <Limb length={BODY.thigh} radius={0.088} endRadius={0.07} color={m.pants} />,
  kneeL: ({ m }) => (
    <>
      <Joint radius={0.07} color={m.pants} />
      <Limb length={BODY.shin} radius={0.068} endRadius={0.052} color={m.pants} />
    </>
  ),
  kneeR: ({ m }) => (
    <>
      <Joint radius={0.07} color={m.pants} />
      <Limb length={BODY.shin} radius={0.068} endRadius={0.052} color={m.pants} />
    </>
  ),
  ankleL: Foot,
  ankleR: Foot,
}

const CHILDREN = Object.fromEntries(JOINTS.map((j) => [j, JOINTS.filter((c) => SKELETON[c].parent === j)]))

function Bone({ joint, register, m }) {
  const Part = PARTS[joint]
  return (
    <group ref={(o) => register(joint, o)} position={SKELETON[joint].offset} name={joint}>
      <Part m={m} />
      {CHILDREN[joint].map((c) => (
        <Bone key={c} joint={c} register={register} m={m} />
      ))}
    </group>
  )
}

export default function Humanoid({ onBones }) {
  const m = useMaterials()
  const bones = useRef({})
  const register = (joint, o) => {
    if (o) bones.current[joint] = o
  }
  useLayoutEffect(() => {
    onBones(bones.current)
  }, [onBones])
  return <Bone joint="pelvis" register={register} m={m} />
}

/** A simple wooden chair, seat top at knee height, back behind the hips. */
export function Chair() {
  const seat = BODY.ankleHeight + BODY.shin - 0.09 // under the thighs
  const wood = { color: '#c08a5b', roughness: 0.8 }
  const legs = [
    [0.21, 0.24],
    [-0.21, 0.24],
    [0.21, -0.17],
    [-0.21, -0.17],
  ]
  return (
    <group position={[0, 0, 0.02]}>
      <RoundedBox args={[0.5, 0.05, 0.5]} radius={0.02} position={[0, seat - 0.025, 0.02]}>
        <meshStandardMaterial {...wood} />
      </RoundedBox>
      {legs.map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, (seat - 0.05) / 2, z]}>
          <cylinderGeometry args={[0.02, 0.018, seat - 0.05, 10]} />
          <meshStandardMaterial {...wood} />
        </mesh>
      ))}
      {/* back */}
      {[0.21, -0.21].map((x) => (
        <mesh key={x} position={[x, seat + 0.22, -0.17]}>
          <cylinderGeometry args={[0.02, 0.02, 0.44, 10]} />
          <meshStandardMaterial {...wood} />
        </mesh>
      ))}
      <RoundedBox args={[0.48, 0.18, 0.04]} radius={0.015} position={[0, seat + 0.34, -0.18]}>
        <meshStandardMaterial {...wood} />
      </RoundedBox>
    </group>
  )
}
