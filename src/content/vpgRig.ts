import {
  VPG_JOINT_INDEX,
  VPG_RIG_TEMPLATE,
  type Quat,
  type Vec3,
  type VpgBoneTemplate,
} from "./vpgRigTemplate";

export type { Quat, Vec3, VpgBoneTemplate };

/**
 * Pure VPG Rig 2.0 skeleton construction and AKI-to-VPG T-pose mesh conversion.
 *
 * Modular character meshes from the creator asset library are authored in AKI units
 * (Y-up, +Z front, +X left) with arms hanging down along -Y. This module maps those
 * meshes and joints onto the canonical 71-bone VPG Rig 2.0 (see docs/animations/VPG-RIG.md
 * and scripts/blender/convert_n64_to_vpg.py):
 *   - uniform scale matching hip height to the VPG template thigh height, soles at y = 0,
 *   - arms raised cleanly into the VPG T-pose along +/-X with seam vertices kept watertight,
 *   - all 71 VPG bones placed at exact VPG head positions with rest rotations identical to
 *     mannequin-blue.glb, so every clip in public/assets/animations/ retargets directly.
 *
 * Pure TypeScript with no Babylon or DOM dependencies so unit tests can verify every
 * matrix, joint position, and seam invariant in Node.
 */

export type MutableVec3 = [number, number, number];

export interface AkiBoneSpec {
  readonly name: string;
  readonly parent: string | null;
  readonly joint: Vec3;
}

/**
 * Maps each of the 19 AKI bone names (in manifest.skeleton.boneOrder) to its
 * corresponding VPG Rig 2.0 deforming bone name.
 * Matches GROUP_MAP in scripts/blender/convert_n64_to_vpg.py.
 */
export const AKI_BONE_TO_VPG_NAME: Readonly<Record<string, string>> = {
  pelvis: "pelvis",
  lower_abdomen: "spine_01",
  upper_body: "spine_03",
  neck: "neck_01",
  head: "Head",
  left_upper_leg: "thigh_l",
  left_lower_leg: "calf_l",
  left_foot: "foot_l",
  left_upper_arm: "upperarm_l",
  left_forearm: "lowerarm_l",
  left_hand: "hand_l",
  left_fingers: "middle_01_l",
  right_upper_leg: "thigh_r",
  right_lower_leg: "calf_r",
  right_foot: "foot_r",
  right_upper_arm: "upperarm_r",
  right_forearm: "lowerarm_r",
  right_hand: "hand_r",
  right_fingers: "middle_01_r",
};

/** Default AKI sole height (Y in AKI units) when feet/boots are standard flat soles. */
export const DEFAULT_AKI_SOLE_Y = -88;

/** Default AKI toe tip Z (+Z forward in AKI units). */
export const DEFAULT_AKI_TOE_Z = 20;

/** Bones in VPG Rig 2.0 that carry no vertex weights (helpers and terminal leaf bones). */
export function isVpgHelperBone(name: string): boolean {
  return (
    name === "root" ||
    name.startsWith("ik_") ||
    name.startsWith("socket_") ||
    name.endsWith("_leaf_l") ||
    name.endsWith("_leaf_r")
  );
}

/** Primary deforming chain links for drawing the VPG Rig 2.0 skeleton overlay. */
export interface VpgSkeletonLink {
  readonly from: string;
  readonly to: string;
  readonly helper: boolean;
}

export const VPG_SKELETON_LINKS: readonly VpgSkeletonLink[] = VPG_RIG_TEMPLATE
  .filter((bone): bone is VpgBoneTemplate & { parent: string } => bone.parent !== null)
  .map((bone) => ({
    from: bone.parent,
    to: bone.name,
    helper: isVpgHelperBone(bone.name) || isVpgHelperBone(bone.parent),
  }));

/** Rigid T-pose transform for one AKI bone (in AKI units before VPG unit scaling). */
export interface AkiBoneTpose {
  /** Original joint position in AKI hanging-down pose. */
  readonly origJoint: Vec3;
  /** Joint position after raising arms into T-pose (in AKI units). */
  readonly posedJoint: Vec3;
  /** Rotation around +Z in radians (0 for torso/head/legs, +/-theta for arms). */
  readonly rotZ: number;
  readonly cosZ: number;
  readonly sinZ: number;
}

/** Resolved 71-bone VPG Rig 2.0 bone entry ready for Babylon Skeleton & glTF export. */
export interface VpgBoneLayout {
  readonly jointIndex: number;
  readonly name: string;
  readonly parent: string | null;
  readonly parentIndex: number;
  /** glTF local translation relative to parent bone. */
  readonly localTranslation: MutableVec3;
  /** glTF local rotation quaternion [x, y, z, w], identical to VPG template. */
  readonly localRotation: Quat;
  /** World head position in Armature / glTF Y-up meters (+Z front, +X left). */
  readonly worldHead: MutableVec3;
  /** World rotation quaternion [x, y, z, w] in Armature space. */
  readonly worldRotation: Quat;
}

export interface VpgRigLayout {
  readonly bones: readonly VpgBoneLayout[];
  readonly byName: ReadonlyMap<string, VpgBoneLayout>;
  /** Scale factor from AKI units to VPG meters (matches template thigh height). */
  readonly scale: number;
  /** AKI sole Y used for floor grounding (y = 0 in VPG meters). */
  readonly soleY: number;
  /** VPG template hip center in glTF meters (used to center hips). */
  readonly hipOffset: Vec3;
  /** AKI bone order index (0..18) -> VPG Rig 2.0 joint index (0..70). */
  readonly akiToVpgJoint: readonly number[];
  /** AKI bone order index (0..18) -> rigid T-pose transform in AKI units. */
  readonly akiTpose: readonly AkiBoneTpose[];
  /** Column-major 4x4 inverse bind matrices for all 71 joints (71 * 16 floats). */
  readonly inverseBindMatrices: Float32Array;
  /** Head sphere center in Armature / glTF Y-up meters (for skeleton overlay). */
  readonly headCenter: MutableVec3;
}

// ------------------------------------------------------------------ vector & quaternion math

const templateByName = new Map<string, VpgBoneTemplate>(
  VPG_RIG_TEMPLATE.map((b) => [b.name, b]),
);

function sub3(a: Vec3, b: Vec3): MutableVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): MutableVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: Vec3, k: number): MutableVec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function len3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normQuat(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

function mulQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return normQuat([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

function conjQuat(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Rotate vector v by unit quaternion q. */
export function rotateVecByQuat(q: Quat, v: Vec3): MutableVec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

/**
 * Column-major 4x4 inverse of rigid transform M = T(pos) * R(quat).
 * M^{-1} = R^T * T(-pos), so column 3 is -R^T * pos and upper-left 3x3 is R^T.
 */
function writeRigidInverseMatrix(out: Float32Array, offset: number, pos: Vec3, worldQuat: Quat): void {
  const [x, y, z, w] = normQuat(worldQuat);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  // Rotation matrix R (column-major):
  // col 0: (1-(yy+zz), xy+wz, xz-wy)
  // col 1: (xy-wz, 1-(xx+zz), yz+wx)
  // col 2: (xz+wy, yz-wx, 1-(xx+yy))
  // Transpose R^T (column-major):
  const r00 = 1 - (yy + zz);
  const r10 = xy - wz;
  const r20 = xz + wy;

  const r01 = xy + wz;
  const r11 = 1 - (xx + zz);
  const r21 = yz - wx;

  const r02 = xz - wy;
  const r12 = yz + wx;
  const r22 = 1 - (xx + yy);

  // -R^T * pos
  const tx = -(r00 * pos[0] + r01 * pos[1] + r02 * pos[2]);
  const ty = -(r10 * pos[0] + r11 * pos[1] + r12 * pos[2]);
  const tz = -(r20 * pos[0] + r21 * pos[1] + r22 * pos[2]);

  out[offset + 0] = r00;
  out[offset + 1] = r10;
  out[offset + 2] = r20;
  out[offset + 3] = 0;

  out[offset + 4] = r01;
  out[offset + 5] = r11;
  out[offset + 6] = r21;
  out[offset + 7] = 0;

  out[offset + 8] = r02;
  out[offset + 9] = r12;
  out[offset + 10] = r22;
  out[offset + 11] = 0;

  out[offset + 12] = tx;
  out[offset + 13] = ty;
  out[offset + 14] = tz;
  out[offset + 15] = 1;
}

/**
 * Column-major 4x4 forward rigid transform M = T(pos) * R(quat).
 * Exported for unit-test verification against inverseBindMatrices.
 */
export function rigidMatrixFromTrs(pos: Vec3, quat: Quat): Float32Array {
  const [x, y, z, w] = normQuat(quat);
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  return new Float32Array([
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

// ------------------------------------------------------------------ AKI -> VPG T-pose + skeleton

function computeArmChainTpose(
  jointsByName: Map<string, Vec3>,
  prefix: "left_" | "right_",
  sign: 1 | -1,
): Record<string, AkiBoneTpose> {
  const sh = jointsByName.get(`${prefix}upper_arm`)!;
  const el = jointsByName.get(`${prefix}forearm`)!;
  const wr = jointsByName.get(`${prefix}hand`)!;
  const kn = jointsByName.get(`${prefix}fingers`)!;

  const uaVec = sub3(el, sh);
  const faVec = sub3(wr, el);
  const haVec = sub3(kn, wr);

  const uaLen = len3(uaVec);
  const faLen = len3(faVec);
  const haLen = len3(haVec);

  // Rotate each arm bone around +Z so its bone axis (head -> child) points along (sign, 0, 0).
  const targetAngle = sign > 0 ? 0 : Math.PI;
  const normalizeAngle = (a: number): number => {
    let r = a;
    while (r > Math.PI) r -= 2 * Math.PI;
    while (r < -Math.PI) r += 2 * Math.PI;
    return r;
  };
  const uaRotZ = normalizeAngle(targetAngle - Math.atan2(uaVec[1], uaVec[0]));
  const faRotZ = normalizeAngle(targetAngle - Math.atan2(faVec[1], faVec[0]));
  const haRotZ = normalizeAngle(targetAngle - Math.atan2(haVec[1], haVec[0]));

  const shT: Vec3 = [sh[0], sh[1], sh[2]];
  const elT: Vec3 = [shT[0] + sign * uaLen, shT[1], shT[2]];
  const wrT: Vec3 = [elT[0] + sign * faLen, elT[1], elT[2]];
  const knT: Vec3 = [wrT[0] + sign * haLen, wrT[1], wrT[2]];

  const make = (origJoint: Vec3, posedJoint: Vec3, rotZ: number): AkiBoneTpose => ({
    origJoint,
    posedJoint,
    rotZ,
    cosZ: Math.cos(rotZ),
    sinZ: Math.sin(rotZ),
  });

  return {
    [`${prefix}upper_arm`]: make(sh, shT, uaRotZ),
    [`${prefix}forearm`]: make(el, elT, faRotZ),
    [`${prefix}hand`]: make(wr, wrT, haRotZ),
    [`${prefix}fingers`]: make(kn, knT, haRotZ),
  };
}

/**
 * Computes the complete 71-bone VPG Rig 2.0 layout corresponding to an AKI skeleton,
 * following the exact rules of scripts/blender/convert_n64_to_vpg.py:
 *   - scale matches hip height to template thigh height with soles at y = 0,
 *   - arms raised into VPG T-pose along +/-X,
 *   - every VPG bone keeps its exact template rest rotation,
 *   - local translations are derived from parent world rotation inverse.
 */
export function computeVpgRigLayout(
  akiBones: readonly AkiBoneSpec[],
  boneOrder: readonly string[],
  options: {
    soleY?: number;
    toeZL?: number;
    toeZR?: number;
    headCenterAki?: Vec3;
  } = {},
): VpgRigLayout {
  const soleY = options.soleY ?? DEFAULT_AKI_SOLE_Y;
  const toeZL = options.toeZL ?? DEFAULT_AKI_TOE_Z;
  const toeZR = options.toeZR ?? DEFAULT_AKI_TOE_Z;
  const headCenterAki: Vec3 = options.headCenterAki ?? [0, 77.2, 0.7];

  const jointsByName = new Map<string, Vec3>(akiBones.map((b) => [b.name, b.joint]));
  const armTpose: Record<string, AkiBoneTpose> = {
    ...computeArmChainTpose(jointsByName, "left_", 1),
    ...computeArmChainTpose(jointsByName, "right_", -1),
  };

  const akiTpose: AkiBoneTpose[] = boneOrder.map((name) => {
    if (armTpose[name]) return armTpose[name];
    const joint = jointsByName.get(name) ?? [0, 0, 0];
    return { origJoint: joint, posedJoint: joint, rotZ: 0, cosZ: 1, sinZ: 0 };
  });

  const akiToVpgJoint: number[] = boneOrder.map((name) => {
    const vpgName = AKI_BONE_TO_VPG_NAME[name];
    const idx = vpgName ? VPG_JOINT_INDEX.get(vpgName) : undefined;
    if (idx === undefined) throw new Error(`No VPG Rig 2.0 bone mapping for AKI bone "${name}"`);
    return idx;
  });

  const T = (name: string): Vec3 => {
    const b = templateByName.get(name);
    if (!b) throw new Error(`Unknown VPG template bone "${name}"`);
    return b.worldHead;
  };

  const tThighL = T("thigh_l");
  const tThighR = T("thigh_r");
  const tHip: Vec3 = [
    (tThighL[0] + tThighR[0]) / 2,
    (tThighL[1] + tThighR[1]) / 2,
    (tThighL[2] + tThighR[2]) / 2,
  ];

  const akiHipL = jointsByName.get("left_upper_leg")!;
  const akiHipR = jointsByName.get("right_upper_leg")!;
  const akiHipCenter: Vec3 = [
    (akiHipL[0] + akiHipR[0]) / 2,
    (akiHipL[1] + akiHipR[1]) / 2,
    (akiHipL[2] + akiHipR[2]) / 2,
  ];

  const hipHeightAki = akiHipCenter[1] - soleY;
  const scale = hipHeightAki > 1e-4 ? tHip[1] / hipHeightAki : 0.01;
  const hipOffset: Vec3 = [
    tHip[0] - akiHipCenter[0] * scale,
    -soleY * scale,
    tHip[2] - akiHipCenter[2] * scale,
  ];

  const toVpg = (p: Vec3): MutableVec3 => [
    p[0] * scale + hipOffset[0],
    p[1] * scale + hipOffset[1],
    p[2] * scale + hipOffset[2],
  ];

  // Posed AKI joint positions in VPG meters (glTF Y-up, +Z front, +X left)
  const J = new Map<string, MutableVec3>();
  boneOrder.forEach((name, idx) => {
    J.set(name, toVpg(akiTpose[idx].posedJoint));
  });

  // Compute world head position N[name] for all 71 VPG bones (exact convert_n64_to_vpg.py parity)
  const N = new Map<string, MutableVec3>();
  N.set("root", [...T("root")]);
  N.set("pelvis", [...T("pelvis")]);
  N.set("spine_01", [...J.get("lower_abdomen")!]);
  N.set("spine_03", [...J.get("upper_body")!]);
  const rSpine = (T("spine_02")[1] - T("spine_01")[1]) / (T("spine_03")[1] - T("spine_01")[1]);
  N.set("spine_02", add3(N.get("spine_01")!, scale3(sub3(N.get("spine_03")!, N.get("spine_01")!), rSpine)));
  N.set("neck_01", [...J.get("neck")!]);
  N.set("Head", [...J.get("head")!]);
  for (const helper of ["ik_hand_root", "ik_hand_gun", "socket_offhand"] as const) {
    N.set(helper, [...T(helper)]);
  }

  const toeZBySide = {
    l: toeZL * scale + hipOffset[2],
    r: toeZR * scale + hipOffset[2],
  };

  for (const [side, prefix] of [["l", "left_"], ["r", "right_"]] as const) {
    const upperarm = J.get(`${prefix}upper_arm`)!;
    const lowerarm = J.get(`${prefix}forearm`)!;
    const hand = J.get(`${prefix}hand`)!;
    const middle01 = J.get(`${prefix}fingers`)!;

    N.set(`upperarm_${side}`, [...upperarm]);
    N.set(`lowerarm_${side}`, [...lowerarm]);
    N.set(`hand_${side}`, [...hand]);
    N.set(`middle_01_${side}`, [...middle01]);

    // Clavicle: X scaled with shoulder width, Y offset from shoulder, Z offset from spine_03
    const tc = T(`clavicle_${side}`);
    const tu = T(`upperarm_${side}`);
    const sx = upperarm[0] / tu[0];
    N.set(`clavicle_${side}`, [
      upperarm[0] + (tc[0] - tu[0]) * sx,
      upperarm[1] + (tc[1] - tu[1]),
      N.get("spine_03")![2] + (tc[2] - T("spine_03")[2]),
    ]);

    // Fingers, thumb, and hand IK target: template layout scaled to hand -> knuckle distance
    const sh = len3(sub3(middle01, hand)) / len3(sub3(T(`middle_01_${side}`), T(`hand_${side}`)));
    for (const f of ["index", "ring", "pinky"] as const) {
      N.set(
        `${f}_01_${side}`,
        add3(middle01, scale3(sub3(T(`${f}_01_${side}`), T(`middle_01_${side}`)), sh)),
      );
    }
    N.set(
      `thumb_01_${side}`,
      add3(hand, scale3(sub3(T(`thumb_01_${side}`), T(`hand_${side}`)), sh)),
    );
    for (const f of ["index", "middle", "ring", "pinky", "thumb"] as const) {
      const chain = [`${f}_01_${side}`, `${f}_02_${side}`, `${f}_03_${side}`, `${f}_04_leaf_${side}`];
      for (let i = 0; i < chain.length - 1; i += 1) {
        N.set(
          chain[i + 1],
          add3(N.get(chain[i])!, scale3(sub3(T(chain[i + 1]), T(chain[i])), sh)),
        );
      }
    }
    N.set(
      `ik_hand_${side}`,
      add3(hand, scale3(sub3(T(`ik_hand_${side}`), T(`hand_${side}`)), sh)),
    );

    // Legs and feet
    const thigh = J.get(`${prefix}upper_leg`)!;
    const calf = J.get(`${prefix}lower_leg`)!;
    const foot = J.get(`${prefix}foot`)!;
    N.set(`thigh_${side}`, [...thigh]);
    N.set(`calf_${side}`, [...calf]);
    N.set(`foot_${side}`, [...foot]);

    const tFoot = T(`foot_${side}`);
    const tBallLeaf = T(`ball_leaf_${side}`);
    const footLenDenom = tBallLeaf[2] - tFoot[2];
    const szFoot = Math.abs(footLenDenom) > 1e-5 ? (toeZBySide[side] - foot[2]) / footLenDenom : scale / 0.01;
    const syFoot = Math.abs(tFoot[1]) > 1e-5 ? foot[1] / tFoot[1] : scale / 0.01;
    for (const [par, ch] of [[`foot_${side}`, `ball_${side}`], [`ball_${side}`, `ball_leaf_${side}`]] as const) {
      const d = sub3(T(ch), T(par));
      const pPos = N.get(par)!;
      N.set(ch, [pPos[0] + d[0], pPos[1] + d[1] * syFoot, pPos[2] + d[2] * szFoot]);
    }
  }
  N.set("socket_offhand_grip", [...N.get("ik_hand_l")!]);

  // Build world rotations, glTF local translations, and 71x16 inverse bind matrices
  const bones: VpgBoneLayout[] = [];
  const byName = new Map<string, VpgBoneLayout>();
  const inverseBindMatrices = new Float32Array(VPG_RIG_TEMPLATE.length * 16);

  for (const tmpl of VPG_RIG_TEMPLATE) {
    const worldHead = N.get(tmpl.name);
    if (!worldHead) throw new Error(`Missing VPG bone head position for "${tmpl.name}"`);
    const localRotation = normQuat(tmpl.rotation);
    const parentLayout = tmpl.parent ? byName.get(tmpl.parent) ?? null : null;
    const parentIndex = parentLayout ? parentLayout.jointIndex : -1;

    let worldRotation: Quat;
    let localTranslation: MutableVec3;
    if (parentLayout) {
      worldRotation = mulQuat(parentLayout.worldRotation, localRotation);
      const deltaWorld = sub3(worldHead, parentLayout.worldHead);
      localTranslation = rotateVecByQuat(conjQuat(parentLayout.worldRotation), deltaWorld);
    } else {
      worldRotation = localRotation;
      localTranslation = [worldHead[0], worldHead[1], worldHead[2]];
    }

    writeRigidInverseMatrix(inverseBindMatrices, tmpl.jointIndex * 16, worldHead, worldRotation);

    const entry: VpgBoneLayout = {
      jointIndex: tmpl.jointIndex,
      name: tmpl.name,
      parent: tmpl.parent,
      parentIndex,
      localTranslation,
      localRotation,
      worldHead,
      worldRotation,
    };
    bones.push(entry);
    byName.set(tmpl.name, entry);
  }

  return {
    bones,
    byName,
    scale,
    soleY,
    hipOffset,
    akiToVpgJoint,
    akiTpose,
    inverseBindMatrices,
    headCenter: toVpg(headCenterAki),
  };
}

export interface ModularMeshSkinInput {
  readonly positions: ArrayLike<number>;
  readonly normals: ArrayLike<number>;
  readonly partBone: number;
  readonly influence: number;
  readonly seams: Readonly<Record<number, readonly [number, number] | undefined>>;
  readonly rig: VpgRigLayout;
}

export interface SkinnedVpgMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Babylon.js VertexData matricesIndices (4 floats per vertex, VPG joint index in slot 0). */
  readonly matricesIndices: Float32Array;
  /** Babylon.js VertexData matricesWeights (4 floats per vertex, [1, 0, 0, 0]). */
  readonly matricesWeights: Float32Array;
  /** glTF JOINTS_0 buffer (4 uint8 per vertex, VPG joint index in slot 0). */
  readonly jointsUint8: Uint8Array;
}

/**
 * Converts a modular AKI mesh part into VPG Rig 2.0 T-pose vertex space (glTF Y-up meters,
 * soles at y = 0) and skins every vertex (including AKI seam vertices) to the corresponding
 * bone of the 71-bone VPG Rig 2.0 skeleton.
 */
export function transformModularMeshToVpg(input: ModularMeshSkinInput): SkinnedVpgMeshData {
  const { positions: srcPos, normals: srcNrm, partBone, influence, seams, rig } = input;
  const count = Math.floor(srcPos.length / 3);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const matricesIndices = new Float32Array(count * 4);
  const matricesWeights = new Float32Array(count * 4);
  const jointsUint8 = new Uint8Array(count * 4);

  const runs = seams[partBone] ?? [partBone, partBone];
  const first = influence >> 4;
  const second = influence & 15;
  const { scale, hipOffset, akiTpose, akiToVpgJoint } = rig;
  const ox = hipOffset[0];
  const oy = hipOffset[1];
  const oz = hipOffset[2];

  for (let i = 0; i < count; i += 1) {
    const akiBone = i < first ? runs[0] : i < first + second ? runs[1] : partBone;
    const pose = akiTpose[akiBone];
    const vpgJoint = akiToVpgJoint[akiBone];

    const px = srcPos[i * 3];
    const py = srcPos[i * 3 + 1];
    const pz = srcPos[i * 3 + 2];

    let tx: number;
    let ty: number;
    let tz: number;
    if (pose.rotZ === 0) {
      tx = px;
      ty = py;
      tz = pz;
    } else {
      const dx = px - pose.origJoint[0];
      const dy = py - pose.origJoint[1];
      tx = pose.posedJoint[0] + dx * pose.cosZ - dy * pose.sinZ;
      ty = pose.posedJoint[1] + dx * pose.sinZ + dy * pose.cosZ;
      tz = pz;
    }

    positions[i * 3] = tx * scale + ox;
    positions[i * 3 + 1] = ty * scale + oy;
    positions[i * 3 + 2] = tz * scale + oz;

    if (srcNrm.length >= (i + 1) * 3) {
      const nx = srcNrm[i * 3];
      const ny = srcNrm[i * 3 + 1];
      const nz = srcNrm[i * 3 + 2];
      if (pose.rotZ === 0) {
        normals[i * 3] = nx;
        normals[i * 3 + 1] = ny;
        normals[i * 3 + 2] = nz;
      } else {
        normals[i * 3] = nx * pose.cosZ - ny * pose.sinZ;
        normals[i * 3 + 1] = nx * pose.sinZ + ny * pose.cosZ;
        normals[i * 3 + 2] = nz;
      }
    }

    matricesIndices[i * 4] = vpgJoint;
    matricesWeights[i * 4] = 1;
    jointsUint8[i * 4] = vpgJoint;
  }

  return { positions, normals, matricesIndices, matricesWeights, jointsUint8 };
}
