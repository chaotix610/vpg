import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VPG_JOINT_INDEX, VPG_RIG_TEMPLATE } from "@/content/vpgRigTemplate";
import {
  AKI_BONE_TO_VPG_NAME,
  computeVpgRigLayout,
  isVpgHelperBone,
  rigidMatrixFromTrs,
  rotateVecByQuat,
  transformModularMeshToVpg,
} from "@/content/vpgRig";
import { buildVpgCharacterGlb } from "@/content/vpgGlbExport";
import type { CharacterManifest } from "@/content/characterLook";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function readGlbJson(relativePath: string): {
  nodes: { name: string; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }[];
  skins?: { joints: number[] }[];
} {
  const buf = readFileSync(path.join(ROOT, relativePath));
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
}

function mulMat4Col(a: Float32Array | number[], b: Float32Array | number[]): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function glbWorldHeads(relativePath: string): Record<string, [number, number, number]> {
  const g = readGlbJson(relativePath);
  const parent = new Map<number, number>();
  g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const cache = new Map<number, Float32Array>();
  const world = (i: number): Float32Array => {
    const hit = cache.get(i);
    if (hit) return hit;
    const n = g.nodes[i];
    const t = (n.translation ?? [0, 0, 0]) as [number, number, number];
    const r = (n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number];
    const local = rigidMatrixFromTrs(t, r);
    const m = parent.has(i) ? mulMat4Col(world(parent.get(i)!), local) : local;
    cache.set(i, m);
    return m;
  };
  const out: Record<string, [number, number, number]> = {};
  g.nodes.forEach((n, i) => {
    const m = world(i);
    out[n.name] = [m[12], m[13], m[14]];
  });
  return out;
}

const manifest = JSON.parse(
  readFileSync(path.join(ROOT, "public/assets/characters/creator/manifest.json"), "utf8"),
) as CharacterManifest;

describe("VPG Rig 2.0 template & skeleton math", () => {
  it("matches the 71-bone VPG Rig 2.0 hierarchy in mannequin-blue.glb", () => {
    const man = readGlbJson("public/assets/characters/models/mannequin-blue.glb");
    const manJointNames = man.skins![0].joints.map((idx) => man.nodes[idx].name);

    expect(VPG_RIG_TEMPLATE).toHaveLength(71);
    expect(VPG_RIG_TEMPLATE.map((b) => b.name)).toEqual(manJointNames);

    const helpers = VPG_RIG_TEMPLATE.filter((b) => isVpgHelperBone(b.name));
    expect(helpers).toHaveLength(19);
    expect(VPG_RIG_TEMPLATE.length - helpers.length).toBe(52);

    // Every parent appears before its children
    for (const bone of VPG_RIG_TEMPLATE) {
      if (bone.parent) {
        expect(VPG_JOINT_INDEX.get(bone.parent)!).toBeLessThan(bone.jointIndex);
      }
    }
  });

  it("matches Blender convert_n64_to_vpg.py bone placement on steve-austin.glb", () => {
    const rig = computeVpgRigLayout(manifest.skeleton.bones, manifest.skeleton.boneOrder, {
      soleY: -88,
      toeZL: 20,
      toeZR: 20,
      headCenterAki: manifest.skeleton.headCenter,
    });
    const austin = glbWorldHeads("public/assets/characters/models/steve-austin.glb");

    const checkedBones = [
      "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
      "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
      "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
      "thigh_l", "calf_l", "foot_l", "ball_l", "ball_leaf_l",
      "thigh_r", "calf_r", "foot_r", "ball_r", "ball_leaf_r",
    ];
    for (const name of checkedBones) {
      const ours = rig.byName.get(name)!.worldHead;
      const target = austin[name];
      const err = Math.hypot(ours[0] - target[0], ours[1] - target[1], ours[2] - target[2]);
      expect(err, `bone ${name} differed from steve-austin.glb`).toBeLessThan(1e-4);
    }
  });

  it("reproduces exact world positions via forward kinematics and valid inverse bind matrices", () => {
    const rig = computeVpgRigLayout(manifest.skeleton.bones, manifest.skeleton.boneOrder);

    const worldPos = new Map<string, [number, number, number]>();
    for (const bone of rig.bones) {
      if (!bone.parent) {
        worldPos.set(bone.name, [...bone.localTranslation]);
      } else {
        const parent = rig.byName.get(bone.parent)!;
        const pPos = worldPos.get(bone.parent)!;
        const offset = rotateVecByQuat(parent.worldRotation, bone.localTranslation);
        worldPos.set(bone.name, [pPos[0] + offset[0], pPos[1] + offset[1], pPos[2] + offset[2]]);
      }

      const computed = worldPos.get(bone.name)!;
      expect(Math.hypot(
        computed[0] - bone.worldHead[0],
        computed[1] - bone.worldHead[1],
        computed[2] - bone.worldHead[2],
      )).toBeLessThan(1e-5);

      const forward = rigidMatrixFromTrs(bone.worldHead, bone.worldRotation);
      const ibm = rig.inverseBindMatrices.subarray(bone.jointIndex * 16, (bone.jointIndex + 1) * 16);
      const prod = mulMat4Col(ibm, forward);
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          expect(prod[c * 4 + r]).toBeCloseTo(r === c ? 1 : 0, 4);
        }
      }
    }
  });

  it("transforms modular AKI meshes into watertight VPG T-pose with soles at y = 0", () => {
    const rig = computeVpgRigLayout(manifest.skeleton.bones, manifest.skeleton.boneOrder, { soleY: -92 });
    const seams: Record<number, readonly [number, number] | undefined> = {};
    for (const [k, v] of Object.entries(manifest.skeleton.seams)) seams[Number(k)] = v;

    // Platform boot sole vertex at y = -92 must land on y = 0
    const footBone = manifest.skeleton.boneOrder.indexOf("left_foot");
    const footOut = transformModularMeshToVpg({
      positions: [9, -92, 10],
      normals: [0, -1, 0],
      partBone: footBone,
      influence: 0,
      seams,
      rig,
    });
    expect(footOut.positions[1]).toBeCloseTo(0, 5);
    expect(footOut.matricesIndices[0]).toBe(VPG_JOINT_INDEX.get("foot_l"));

    // Elbow seam vertex on left_forearm (first vertex -> seams[10][0] = left_upper_arm)
    // must coincide with the identical vertex on left_upper_arm after T-pose rotation.
    const uaBone = manifest.skeleton.boneOrder.indexOf("left_upper_arm");
    const faBone = manifest.skeleton.boneOrder.indexOf("left_forearm");
    const elbowPt = [24, 29, 3];
    const uaOut = transformModularMeshToVpg({
      positions: elbowPt,
      normals: [0, 0, 1],
      partBone: uaBone,
      influence: 0,
      seams,
      rig,
    });
    const faOut = transformModularMeshToVpg({
      positions: [...elbowPt, 24, 15, 3],
      normals: [0, 0, 1, 0, 0, 1],
      partBone: faBone,
      influence: 1 << 4, // 1 vertex follows first seam neighbour (left_upper_arm)
      seams,
      rig,
    });

    expect(faOut.positions[0]).toBeCloseTo(uaOut.positions[0], 5);
    expect(faOut.positions[1]).toBeCloseTo(uaOut.positions[1], 5);
    expect(faOut.positions[2]).toBeCloseTo(uaOut.positions[2], 5);
    expect(faOut.matricesIndices[0]).toBe(VPG_JOINT_INDEX.get(AKI_BONE_TO_VPG_NAME.left_upper_arm));
    expect(faOut.matricesIndices[4]).toBe(VPG_JOINT_INDEX.get(AKI_BONE_TO_VPG_NAME.left_forearm));
    // Forearm vertex extends outward along +X past elbow in T-pose
    expect(faOut.positions[3]).toBeGreaterThan(faOut.positions[0]);
  });

  it("exports a spec-compliant 71-bone VPG Rig 2.0 GLB binary", () => {
    const rig = computeVpgRigLayout(manifest.skeleton.bones, manifest.skeleton.boneOrder);
    const pngStub = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const glb = buildVpgCharacterGlb(
      rig,
      [
        {
          name: "pelvis",
          positions: new Float32Array([0, 0.9, 0, 0.1, 0.9, 0, 0, 1.0, 0]),
          normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
          uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
          indices: new Uint16Array([0, 1, 2]),
          jointsUint8: new Uint8Array([5, 0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0]),
          weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
          pngBytes: pngStub,
          wrapU: "mirror",
          wrapV: "clamp",
        },
      ],
      { name: "test-wrestler" },
    );

    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);

    const jsonLen = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
    expect(json.skins).toHaveLength(1);
    expect(json.skins[0].joints).toHaveLength(71);
    expect(json.nodes[json.scenes[0].nodes[0]].name).toBe("Armature");
    expect(json.skins[0].joints.map((j: number) => json.nodes[j].name)).toEqual(
      VPG_RIG_TEMPLATE.map((b) => b.name),
    );
    expect(json.meshes[0].primitives).toHaveLength(1);
    expect(json.materials[0].alphaMode).toBe("MASK");
    expect(json.materials[0].doubleSided).toBe(true);
  });
});
