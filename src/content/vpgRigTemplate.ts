/**
 * Canonical 71-bone VPG Rig 2.0 template extracted from
 * public/assets/characters/models/mannequin-blue.glb (see docs/animations/VPG-RIG.md).
 *
 * Bones are listed in exact glTF skin joint order (strictly parent-before-child).
 * Every VPG animation clip keys these exact 71 bones using these exact rest rotations.
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

export interface VpgBoneTemplate {
  readonly jointIndex: number;
  readonly name: string;
  readonly parent: string | null;
  /** glTF local rest rotation quaternion [x, y, z, w]. */
  readonly rotation: Quat;
  /** World-space bone head position in glTF Y-up meters (+Z front, +X left). */
  readonly worldHead: Vec3;
}

export const VPG_RIG_TEMPLATE: readonly VpgBoneTemplate[] = [
  { jointIndex: 0, name: "root", parent: null, rotation: [-0.7071068, 0, 0, 0.7071068], worldHead: [0, 0, 0] },
  { jointIndex: 1, name: "ik_hand_root", parent: "root", rotation: [0.7071066, 0, 0, 0.7071069], worldHead: [0, 0, 0] },
  { jointIndex: 2, name: "ik_hand_gun", parent: "ik_hand_root", rotation: [0, 1e-7, 0, 1], worldHead: [0, 0, 0] },
  { jointIndex: 3, name: "ik_hand_l", parent: "ik_hand_gun", rotation: [0, -1e-7, 0, 1], worldHead: [0.7935499, 1.4407996, -0.0654005] },
  { jointIndex: 4, name: "ik_hand_r", parent: "ik_hand_gun", rotation: [0, -1e-7, 0, 1], worldHead: [-0.79355, 1.4407996, -0.0654005] },
  { jointIndex: 5, name: "pelvis", parent: "root", rotation: [0.7904685, 0, 0, 0.6125028], worldHead: [0, 0.9167, -0.0501] },
  { jointIndex: 6, name: "spine_01", parent: "pelvis", rotation: [-0.0647027, 1e-7, 0, 0.9979046], worldHead: [0, 1.0505, -0.0156] },
  { jointIndex: 7, name: "spine_02", parent: "spine_01", rotation: [-0.0772798, -1e-7, 0, 0.9970095], worldHead: [0, 1.1736002, -0.0004] },
  { jointIndex: 8, name: "spine_03", parent: "spine_02", rotation: [-0.0002686, 0, 0, 1], worldHead: [0, 1.3148004, -0.0049001] },
  { jointIndex: 9, name: "clavicle_l", parent: "spine_03", rotation: [-0.6040207, -0.345103, -0.3567177, 0.6235507], worldHead: [0.0188, 1.4579007, 0.0713999] },
  { jointIndex: 10, name: "upperarm_l", parent: "clavicle_l", rotation: [0.1802696, 0.6838499, -0.1798365, 0.6837478], worldHead: [0.1918999, 1.4408007, -0.0654001] },
  { jointIndex: 11, name: "lowerarm_l", parent: "upperarm_l", rotation: [0.0171823, -0.0000203, 6e-7, 0.9998524], worldHead: [0.4663, 1.4408006, -0.0701001] },
  { jointIndex: 12, name: "hand_l", parent: "lowerarm_l", rotation: [-0.0086197, -4e-7, -2e-7, 0.9999629], worldHead: [0.7389003, 1.4408004, -0.0654] },
  { jointIndex: 13, name: "index_01_l", parent: "hand_l", rotation: [0, 0.7071095, 0, 0.7071041], worldHead: [0.8588003, 1.4388007, -0.0345] },
  { jointIndex: 14, name: "index_02_l", parent: "index_01_l", rotation: [0, 0, 0, 1], worldHead: [0.8995004, 1.4388006, -0.0345] },
  { jointIndex: 15, name: "index_03_l", parent: "index_02_l", rotation: [0, 0, 0, 1], worldHead: [0.9343004, 1.4388006, -0.0345] },
  { jointIndex: 16, name: "index_04_leaf_l", parent: "index_03_l", rotation: [0, 1, 0, 0.0000035], worldHead: [0.9644005, 1.4388006, -0.0345] },
  { jointIndex: 17, name: "middle_01_l", parent: "hand_l", rotation: [-0.0167025, 0.7069122, -0.0167026, 0.7069068], worldHead: [0.8605004, 1.4412009, -0.0602] },
  { jointIndex: 18, name: "middle_02_l", parent: "middle_01_l", rotation: [0, 0, 0.0015136, 0.9999989], worldHead: [0.9028004, 1.441201, -0.0622] },
  { jointIndex: 19, name: "middle_03_l", parent: "middle_02_l", rotation: [0, 0, -0.0011296, 0.9999993], worldHead: [0.9367004, 1.4412008, -0.0637] },
  { jointIndex: 20, name: "middle_04_leaf_l", parent: "middle_03_l", rotation: [0, 1, 0, 0.0000035], worldHead: [0.9711003, 1.4412007, -0.0653] },
  { jointIndex: 21, name: "pinky_01_l", parent: "hand_l", rotation: [-0.0237061, 0.706712, -0.0237062, 0.7067066], worldHead: [0.8466002, 1.4392009, -0.1062] },
  { jointIndex: 22, name: "pinky_02_l", parent: "pinky_01_l", rotation: [0, 0, -0.0008343, 0.9999996], worldHead: [0.8868002, 1.439201, -0.1089] },
  { jointIndex: 23, name: "pinky_03_l", parent: "pinky_02_l", rotation: [0, 0, 0.0006097, 0.9999998], worldHead: [0.9144003, 1.4392011, -0.1108] },
  { jointIndex: 24, name: "pinky_04_leaf_l", parent: "pinky_03_l", rotation: [2e-7, 1, 0, 0.0000037], worldHead: [0.9425004, 1.4392012, -0.1127] },
  { jointIndex: 25, name: "ring_01_l", parent: "hand_l", rotation: [-0.0125887, 0.7069974, -0.0125888, 0.706992], worldHead: [0.8580002, 1.4409007, -0.0825] },
  { jointIndex: 26, name: "ring_02_l", parent: "ring_01_l", rotation: [0, 0, 0.0000122, 1], worldHead: [0.8973003, 1.4409007, -0.0839] },
  { jointIndex: 27, name: "ring_03_l", parent: "ring_02_l", rotation: [0, 0, -0.001067, 0.9999994], worldHead: [0.9282003, 1.4409011, -0.085] },
  { jointIndex: 28, name: "ring_04_leaf_l", parent: "ring_03_l", rotation: [0, 1, 0, 0.0000037], worldHead: [0.9600004, 1.4409013, -0.0862001] },
  { jointIndex: 29, name: "thumb_01_l", parent: "hand_l", rotation: [0.2474133, 0.9457945, 0.2034411, 0.053584], worldHead: [0.7662003, 1.4180009, -0.0318] },
  { jointIndex: 30, name: "thumb_02_l", parent: "thumb_01_l", rotation: [-0.0001357, -0.0000741, 0.0000481, 1], worldHead: [0.8004004, 1.398801, -0.0141] },
  { jointIndex: 31, name: "thumb_03_l", parent: "thumb_02_l", rotation: [0.000248, 0.0000809, -0.0005359, 0.9999999], worldHead: [0.8394004, 1.3769011, 0.0061] },
  { jointIndex: 32, name: "thumb_04_leaf_l", parent: "thumb_03_l", rotation: [1e-7, 0.5061781, 0, 0.862429], worldHead: [0.8719004, 1.3587013, 0.0229] },
  { jointIndex: 33, name: "clavicle_r", parent: "spine_03", rotation: [-0.6040207, 0.3451029, 0.3567176, 0.6235508], worldHead: [-0.0188, 1.4579007, 0.0713999] },
  { jointIndex: 34, name: "upperarm_r", parent: "clavicle_r", rotation: [0.1802697, -0.68385, 0.1798365, 0.6837476], worldHead: [-0.1918999, 1.4408006, -0.0654001] },
  { jointIndex: 35, name: "lowerarm_r", parent: "upperarm_r", rotation: [0.0171824, 0.0000205, -4e-7, 0.9998524], worldHead: [-0.4662999, 1.4408006, -0.0701001] },
  { jointIndex: 36, name: "hand_r", parent: "lowerarm_r", rotation: [-0.0086197, 5e-7, 0, 0.9999629], worldHead: [-0.7388999, 1.4408005, -0.0653999] },
  { jointIndex: 37, name: "index_01_r", parent: "hand_r", rotation: [0, -0.7071096, 0, 0.7071039], worldHead: [-0.8587998, 1.4388007, -0.0344999] },
  { jointIndex: 38, name: "index_02_r", parent: "index_01_r", rotation: [0, 0, 0, 1], worldHead: [-0.8994999, 1.4388008, -0.0344999] },
  { jointIndex: 39, name: "index_03_r", parent: "index_02_r", rotation: [0, 0, 0, 1], worldHead: [-0.9343, 1.438801, -0.0344999] },
  { jointIndex: 40, name: "index_04_leaf_r", parent: "index_03_r", rotation: [0, -1, 0, 0.0000037], worldHead: [-0.9644, 1.4388011, -0.0344999] },
  { jointIndex: 41, name: "middle_01_r", parent: "hand_r", rotation: [-0.0167024, -0.7069122, 0.0167025, 0.7069067], worldHead: [-0.8604999, 1.4412007, -0.0601999] },
  { jointIndex: 42, name: "middle_02_r", parent: "middle_01_r", rotation: [0, 0, -0.0015136, 0.9999989], worldHead: [-0.9028, 1.441201, -0.0621999] },
  { jointIndex: 43, name: "middle_03_r", parent: "middle_02_r", rotation: [0, 0, 0.0011296, 0.9999993], worldHead: [-0.9367, 1.4412012, -0.0636999] },
  { jointIndex: 44, name: "middle_04_leaf_r", parent: "middle_03_r", rotation: [1e-7, -1, 0, 0.0000037], worldHead: [-0.9711001, 1.4412015, -0.0652999] },
  { jointIndex: 45, name: "pinky_01_r", parent: "hand_r", rotation: [-0.023706, -0.7067121, 0.0237061, 0.7067065], worldHead: [-0.8465998, 1.4392008, -0.1061999] },
  { jointIndex: 46, name: "pinky_02_r", parent: "pinky_01_r", rotation: [0, 0, 0.0008343, 0.9999996], worldHead: [-0.8867997, 1.439201, -0.1088999] },
  { jointIndex: 47, name: "pinky_03_r", parent: "pinky_02_r", rotation: [0, 0, -0.0006095, 0.9999998], worldHead: [-0.9143998, 1.4392009, -0.1107999] },
  { jointIndex: 48, name: "pinky_04_leaf_r", parent: "pinky_03_r", rotation: [0, -1, 0, 0.0000037], worldHead: [-0.9424999, 1.4392011, -0.1126999] },
  { jointIndex: 49, name: "ring_01_r", parent: "hand_r", rotation: [-0.0125887, -0.7069973, 0.0125888, 0.7069921], worldHead: [-0.8579998, 1.4409004, -0.0824999] },
  { jointIndex: 50, name: "ring_02_r", parent: "ring_01_r", rotation: [0, 0, -0.0000122, 1], worldHead: [-0.8972999, 1.4409007, -0.0838999] },
  { jointIndex: 51, name: "ring_03_r", parent: "ring_02_r", rotation: [0, 0, 0.0010671, 0.9999994], worldHead: [-0.9282, 1.4409012, -0.0849999] },
  { jointIndex: 52, name: "ring_04_leaf_r", parent: "ring_03_r", rotation: [0, -1, 0, 0.0000035], worldHead: [-0.9600001, 1.4409013, -0.0861999] },
  { jointIndex: 53, name: "thumb_01_r", parent: "hand_r", rotation: [0.2474127, -0.9457946, -0.2034414, 0.0535843], worldHead: [-0.7661999, 1.4180008, -0.0317999] },
  { jointIndex: 54, name: "thumb_02_r", parent: "thumb_01_r", rotation: [-0.0001354, 0.0000741, -0.0000481, 1], worldHead: [-0.8003998, 1.3988005, -0.0140999] },
  { jointIndex: 55, name: "thumb_03_r", parent: "thumb_02_r", rotation: [0.000248, -0.000081, 0.0005354, 0.9999999], worldHead: [-0.8393998, 1.3769007, 0.0061001] },
  { jointIndex: 56, name: "thumb_04_leaf_r", parent: "thumb_03_r", rotation: [1e-7, -0.5061779, 0, 0.8624291], worldHead: [-0.8718999, 1.3587006, 0.0229001] },
  { jointIndex: 57, name: "neck_01", parent: "spine_03", rotation: [0.110986, 0, 0, 0.993822], worldHead: [0, 1.4876005, -0.0105001] },
  { jointIndex: 58, name: "Head", parent: "neck_01", rotation: [-0.0786743, 0, 0, 0.9969004], worldHead: [0, 1.5687005, 0.0050998] },
  { jointIndex: 59, name: "thigh_l", parent: "pelvis", rotation: [0.9924845, 0, 0, 0.1223704], worldHead: [0.089, 0.9321, 0.0014] },
  { jointIndex: 60, name: "calf_l", parent: "thigh_l", rotation: [0.0365859, -0.0001312, -0.0000048, 0.9993305], worldHead: [0.089, 0.5318001, -0.0014001] },
  { jointIndex: 61, name: "foot_l", parent: "calf_l", rotation: [-0.5290714, -0.0003281, 0.0003435, 0.8485772], worldHead: [0.089, 0.1037, -0.0358001] },
  { jointIndex: 62, name: "ball_l", parent: "foot_l", rotation: [0.0001371, -0.9643067, 0.2647874, 0.0004995], worldHead: [0.089, 0.0152, 0.1131999] },
  { jointIndex: 63, name: "ball_leaf_l", parent: "ball_l", rotation: [0, 0, 0, 1], worldHead: [0.089, 0.0152, 0.1920999] },
  { jointIndex: 64, name: "thigh_r", parent: "pelvis", rotation: [0.9924845, 0, 1e-7, 0.1223704], worldHead: [-0.089, 0.9321, 0.0014] },
  { jointIndex: 65, name: "calf_r", parent: "thigh_r", rotation: [0.0365859, -0.0001312, -0.0000048, 0.9993305], worldHead: [-0.089, 0.5318, -0.0014001] },
  { jointIndex: 66, name: "foot_r", parent: "calf_r", rotation: [-0.5290715, -0.0003281, 0.0003435, 0.8485772], worldHead: [-0.089, 0.1037001, -0.0358001] },
  { jointIndex: 67, name: "ball_r", parent: "foot_r", rotation: [0.0001371, -0.9643067, 0.2647875, 0.0004995], worldHead: [-0.089, 0.0152001, 0.1131999] },
  { jointIndex: 68, name: "ball_leaf_r", parent: "ball_r", rotation: [0, 0, 0, 1], worldHead: [-0.089, 0.0152001, 0.1921] },
  { jointIndex: 69, name: "socket_offhand", parent: "root", rotation: [0.7071066, 0, 0, 0.7071069], worldHead: [0, 0, 0] },
  { jointIndex: 70, name: "socket_offhand_grip", parent: "socket_offhand", rotation: [0, 0, 0, 1], worldHead: [0.79355, 1.4407996, -0.0654004] },
] as const;

export const VPG_JOINT_INDEX: ReadonlyMap<string, number> = new Map(
  VPG_RIG_TEMPLATE.map((bone) => [bone.name, bone.jointIndex]),
);
