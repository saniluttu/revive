// The avatar's skeleton: joint names, body proportions and how a pose is put on
// the bones. The procedural model (Humanoid.jsx) and a future rigged GLB share
// this contract — anything that can hand over a { joint: Object3D } map can be
// animated by the same motions.
//
// Coordinates: metres, Y up, the avatar faces +Z (towards the front camera), so
// its left side is +X. Every limb hangs straight down (−Y) in the rest pose and
// the foot points forward (+Z). Rotations are XYZ Euler angles in degrees:
//   x  flexion: negative swings a hanging limb forward (shoulder/hip flexion),
//      positive swings it back (knee bend); on the spine positive leans forward
//   z  abduction: positive lifts a left limb out to the side, negative a right one

export const JOINTS = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'elbowL',
  'shoulderR',
  'elbowR',
  'hipL',
  'kneeL',
  'ankleL',
  'hipR',
  'kneeR',
  'ankleR',
]

// Segment lengths, joint to joint. The motions use these for foot-planted
// kinematics (e.g. how far the hips drop in a squat).
export const BODY = {
  thigh: 0.42,
  shin: 0.42,
  ankleHeight: 0.08, // ankle joint above the floor
  hipWidth: 0.1, // hip joint from the midline
  hipDrop: 0.04, // hip joints below the pelvis origin
  spine: 0.08, // pelvis → spine
  chest: 0.2, // spine → chest
  shoulderHeight: 0.22, // chest → shoulder joints
  shoulderWidth: 0.2,
  neck: 0.25, // chest → neck
  headOffset: 0.12, // neck → head centre
  upperArm: 0.28,
  forearm: 0.25,
}

/** Standing height of the pelvis origin (feet flat, legs straight). */
export const PELVIS_HEIGHT = BODY.ankleHeight + BODY.shin + BODY.thigh + BODY.hipDrop

/** Each joint's parent and position relative to it — the skeleton both models are built on. */
export const SKELETON = {
  pelvis: { parent: null, offset: [0, PELVIS_HEIGHT, 0] },
  spine: { parent: 'pelvis', offset: [0, BODY.spine, 0] },
  chest: { parent: 'spine', offset: [0, BODY.chest, 0] },
  neck: { parent: 'chest', offset: [0, BODY.neck, 0] },
  head: { parent: 'neck', offset: [0, BODY.headOffset, 0] },
  shoulderL: { parent: 'chest', offset: [BODY.shoulderWidth, BODY.shoulderHeight, 0] },
  elbowL: { parent: 'shoulderL', offset: [0, -BODY.upperArm, 0] },
  shoulderR: { parent: 'chest', offset: [-BODY.shoulderWidth, BODY.shoulderHeight, 0] },
  elbowR: { parent: 'shoulderR', offset: [0, -BODY.upperArm, 0] },
  hipL: { parent: 'pelvis', offset: [BODY.hipWidth, -BODY.hipDrop, 0] },
  kneeL: { parent: 'hipL', offset: [0, -BODY.thigh, 0] },
  ankleL: { parent: 'kneeL', offset: [0, -BODY.shin, 0] },
  hipR: { parent: 'pelvis', offset: [-BODY.hipWidth, -BODY.hipDrop, 0] },
  kneeR: { parent: 'hipR', offset: [0, -BODY.thigh, 0] },
  ankleR: { parent: 'kneeR', offset: [0, -BODY.shin, 0] },
}

/**
 * Bone names of a Mixamo-rigged GLB for each joint, for when a modelled avatar
 * replaces the procedural one. Load the GLB, look the bones up with
 * `bonesFromObject(gltf.scene, MIXAMO_BONES)` and pass them to `applyPose`
 * with that rig's rest rotations as `base`. Mixamo bone axes differ from the
 * convention above (arms rest in a T-pose), so a GLB also needs a per-joint
 * offset — measure it once from the bind pose.
 */
export const MIXAMO_BONES = {
  pelvis: 'mixamorigHips',
  spine: 'mixamorigSpine',
  chest: 'mixamorigSpine2',
  neck: 'mixamorigNeck',
  head: 'mixamorigHead',
  shoulderL: 'mixamorigLeftArm',
  elbowL: 'mixamorigLeftForeArm',
  shoulderR: 'mixamorigRightArm',
  elbowR: 'mixamorigRightForeArm',
  hipL: 'mixamorigLeftUpLeg',
  kneeL: 'mixamorigLeftLeg',
  ankleL: 'mixamorigLeftFoot',
  hipR: 'mixamorigRightUpLeg',
  kneeR: 'mixamorigRightLeg',
  ankleR: 'mixamorigRightFoot',
}

/** { joint: Object3D } from a loaded scene, using a joint → bone-name map. */
export function bonesFromObject(root, names) {
  const bones = {}
  for (const [joint, name] of Object.entries(names)) {
    const bone = root.getObjectByName(name)
    if (bone) bones[joint] = bone
  }
  return bones
}

const RAD = Math.PI / 180

/**
 * Put a pose on the bones.
 * @param bones  { joint: Object3D }
 * @param pose   { root: [x, y, z] offset from standing, joints: { joint: [x, y, z] degrees } }
 * @param base   optional { joint: [x, y, z] degrees } rest rotations added to the pose (GLB rigs)
 */
export function applyPose(bones, pose, base = {}) {
  for (const joint of JOINTS) {
    const bone = bones[joint]
    if (!bone) continue
    const r = pose.joints[joint] ?? ZERO
    const b = base[joint] ?? ZERO
    bone.rotation.set((r[0] + b[0]) * RAD, (r[1] + b[1]) * RAD, (r[2] + b[2]) * RAD)
  }
  if (bones.pelvis) {
    const [x, y, z] = pose.root
    bones.pelvis.position.set(x, PELVIS_HEIGHT + y, z)
  }
}

const ZERO = [0, 0, 0]
