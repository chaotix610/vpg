import type { VpgRigLayout } from "./vpgRig";

/**
 * Pure TypeScript glTF 2.0 Binary (.glb) exporter for modular VPG Rig 2.0 characters.
 *
 * Writes a self-contained, spec-compliant .glb with:
 *   - Scene root node "Armature" (matching docs/animations/VPG-RIG.md),
 *   - All 71 VPG Rig 2.0 joint nodes with exact rest translations and rotations,
 *   - One skin referencing all 71 joints in canonical order + 71x16 inverseBindMatrices,
 *   - One skinned mesh with one primitive per dressed slot (POSITION, NORMAL, TEXCOORD_0,
 *     JOINTS_0, WEIGHTS_0, indices) and embedded PNG textures with alpha-test double-sided materials.
 *
 * Output GLBs load directly in Babylon.js, VPG's Animation Viewer, and Blender.
 */

export type WrapModeName = "mirror" | "repeat" | "clamp";

export interface GlbExportPart {
  readonly name: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly jointsUint8: Uint8Array;
  readonly weights: Float32Array;
  readonly pngBytes: Uint8Array;
  readonly wrapU: WrapModeName;
  readonly wrapV: WrapModeName;
}

const GLTF_WRAP: Record<WrapModeName, number> = {
  clamp: 33071,  // CLAMP_TO_EDGE
  mirror: 33648, // MIRRORED_REPEAT
  repeat: 10497, // REPEAT
};

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942;  // "BIN\0"

class BinaryBuilder {
  private chunks: Uint8Array[] = [];
  private length = 0;

  append(data: Uint8Array, align = 4): { byteOffset: number; byteLength: number } {
    const pad = (align - (this.length % align)) % align;
    if (pad > 0) {
      this.chunks.push(new Uint8Array(pad));
      this.length += pad;
    }
    const byteOffset = this.length;
    this.chunks.push(data);
    this.length += data.byteLength;
    return { byteOffset, byteLength: data.byteLength };
  }

  appendTyped(view: ArrayBufferView, align = 4): { byteOffset: number; byteLength: number } {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return this.append(bytes, align);
  }

  finish(): Uint8Array {
    const pad = (4 - (this.length % 4)) % 4;
    if (pad > 0) {
      this.chunks.push(new Uint8Array(pad));
      this.length += pad;
    }
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
}

function minMaxVec3(values: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      const v = values[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return {
    min: min.map((v) => (Number.isFinite(v) ? v : 0)),
    max: max.map((v) => (Number.isFinite(v) ? v : 0)),
  };
}

/**
 * Builds a complete VPG Rig 2.0 `.glb` binary buffer.
 * `heightScale` scales the top-level Armature cleanly if non-1, or keeps 1.0 when omitted.
 */
export function buildVpgCharacterGlb(
  rig: VpgRigLayout,
  parts: readonly GlbExportPart[],
  options: { name?: string; heightScale?: number } = {},
): Uint8Array {
  const stem = (options.name || "vpg-character").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "vpg-character";
  const bin = new BinaryBuilder();

  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const images: Record<string, unknown>[] = [];
  const samplers: Record<string, unknown>[] = [];
  const textures: Record<string, unknown>[] = [];
  const materials: Record<string, unknown>[] = [];
  const primitives: Record<string, unknown>[] = [];

  const pushView = (data: ArrayBufferView | Uint8Array, target?: number): number => {
    const { byteOffset, byteLength } =
      data instanceof Uint8Array ? bin.append(data, 4) : bin.appendTyped(data, 4);
    const view: Record<string, unknown> = { buffer: 0, byteOffset, byteLength };
    if (target !== undefined) view.target = target;
    bufferViews.push(view);
    return bufferViews.length - 1;
  };

  // Inverse bind matrices for all 71 VPG Rig 2.0 joints
  const ibmView = pushView(rig.inverseBindMatrices);
  accessors.push({
    bufferView: ibmView,
    componentType: 5126, // FLOAT
    count: rig.bones.length,
    type: "MAT4",
  });
  const ibmAccessor = accessors.length - 1;

  const samplerKeyToIndex = new Map<string, number>();
  const samplerFor = (wrapU: WrapModeName, wrapV: WrapModeName): number => {
    const key = `${wrapU}:${wrapV}`;
    const existing = samplerKeyToIndex.get(key);
    if (existing !== undefined) return existing;
    samplers.push({
      magFilter: 9729, // LINEAR
      minFilter: 9729, // LINEAR
      wrapS: GLTF_WRAP[wrapU],
      wrapT: GLTF_WRAP[wrapV],
    });
    const idx = samplers.length - 1;
    samplerKeyToIndex.set(key, idx);
    return idx;
  };

  for (const part of parts) {
    const vertCount = Math.floor(part.positions.length / 3);
    if (vertCount === 0 || part.indices.length === 0) continue;

    const posBounds = minMaxVec3(part.positions);
    const posView = pushView(part.positions, 34962);
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: vertCount,
      type: "VEC3",
      min: posBounds.min,
      max: posBounds.max,
    });
    const posAcc = accessors.length - 1;

    const nrmView = pushView(part.normals, 34962);
    accessors.push({
      bufferView: nrmView,
      componentType: 5126,
      count: vertCount,
      type: "VEC3",
    });
    const nrmAcc = accessors.length - 1;

    const uvView = pushView(part.uvs, 34962);
    accessors.push({
      bufferView: uvView,
      componentType: 5126,
      count: vertCount,
      type: "VEC2",
    });
    const uvAcc = accessors.length - 1;

    const jointsView = pushView(part.jointsUint8, 34962);
    accessors.push({
      bufferView: jointsView,
      componentType: 5121, // UNSIGNED_BYTE
      count: vertCount,
      type: "VEC4",
    });
    const jointsAcc = accessors.length - 1;

    const weightsView = pushView(part.weights, 34962);
    accessors.push({
      bufferView: weightsView,
      componentType: 5126,
      count: vertCount,
      type: "VEC4",
    });
    const weightsAcc = accessors.length - 1;

    const useUint32 = part.indices instanceof Uint32Array || vertCount > 65535;
    const indexTyped = useUint32
      ? part.indices instanceof Uint32Array
        ? part.indices
        : Uint32Array.from(part.indices)
      : part.indices instanceof Uint16Array
        ? part.indices
        : Uint16Array.from(part.indices);
    const idxView = pushView(indexTyped, 34963);
    accessors.push({
      bufferView: idxView,
      componentType: useUint32 ? 5125 : 5123, // UNSIGNED_INT / UNSIGNED_SHORT
      count: indexTyped.length,
      type: "SCALAR",
    });
    const idxAcc = accessors.length - 1;

    const imgView = pushView(part.pngBytes);
    images.push({
      name: `${part.name}_tex`,
      bufferView: imgView,
      mimeType: "image/png",
    });
    const imgIdx = images.length - 1;

    textures.push({
      sampler: samplerFor(part.wrapU, part.wrapV),
      source: imgIdx,
    });
    const texIdx = textures.length - 1;

    materials.push({
      name: `${part.name}_mat`,
      doubleSided: true,
      alphaMode: "MASK",
      alphaCutoff: 0.5,
      pbrMetallicRoughness: {
        baseColorTexture: { index: texIdx },
        metallicFactor: 0,
        roughnessFactor: 0.9,
      },
    });
    const matIdx = materials.length - 1;

    primitives.push({
      attributes: {
        POSITION: posAcc,
        NORMAL: nrmAcc,
        TEXCOORD_0: uvAcc,
        JOINTS_0: jointsAcc,
        WEIGHTS_0: weightsAcc,
      },
      indices: idxAcc,
      material: matIdx,
    });
  }

  // Build glTF node hierarchy:
  //   node 0..70 : 71 VPG Rig 2.0 joint nodes (in canonical joint order)
  //   node 71    : skinned mesh node (<stem>_mesh)
  //   node 72    : Armature (root container node with children [71, 0])
  const childMap = new Map<number, number[]>();
  for (const bone of rig.bones) {
    if (bone.parentIndex >= 0) {
      const list = childMap.get(bone.parentIndex);
      if (list) list.push(bone.jointIndex);
      else childMap.set(bone.parentIndex, [bone.jointIndex]);
    }
  }

  const nodes: Record<string, unknown>[] = rig.bones.map((bone) => {
    const node: Record<string, unknown> = {
      name: bone.name,
      translation: [bone.localTranslation[0], bone.localTranslation[1], bone.localTranslation[2]],
      rotation: [bone.localRotation[0], bone.localRotation[1], bone.localRotation[2], bone.localRotation[3]],
    };
    const kids = childMap.get(bone.jointIndex);
    if (kids && kids.length) node.children = kids;
    return node;
  });

  const meshNodeIndex = nodes.length; // 71
  nodes.push({
    name: `${stem}_mesh`,
    mesh: 0,
    skin: 0,
  });

  const armatureIndex = nodes.length; // 72
  const armatureNode: Record<string, unknown> = {
    name: "Armature",
    children: [meshNodeIndex, 0],
  };
  if (options.heightScale && Math.abs(options.heightScale - 1) > 1e-4) {
    const s = options.heightScale;
    armatureNode.scale = [s, s, s];
  }
  nodes.push(armatureNode);

  const binBytes = bin.finish();

  const gltf: Record<string, unknown> = {
    asset: {
      version: "2.0",
      generator: "VPG Character Editor (VPG Rig 2.0)",
    },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [armatureIndex] }],
    nodes,
    skins: [
      {
        name: "VPG_Rig_2_0",
        inverseBindMatrices: ibmAccessor,
        skeleton: 0,
        joints: rig.bones.map((b) => b.jointIndex),
      },
    ],
    meshes: [
      {
        name: stem,
        primitives,
      },
    ],
    materials,
    textures,
    images,
    samplers,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBytes.byteLength }],
  };

  const jsonEncoder = new TextEncoder();
  const rawJson = jsonEncoder.encode(JSON.stringify(gltf));
  const jsonPad = (4 - (rawJson.byteLength % 4)) % 4;
  const jsonLen = rawJson.byteLength + jsonPad;
  const binLen = binBytes.byteLength;
  const totalLen = 12 + 8 + jsonLen + 8 + binLen;

  const out = new Uint8Array(totalLen);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLen, true);

  view.setUint32(12, jsonLen, true);
  view.setUint32(16, CHUNK_JSON, true);
  out.set(rawJson, 20);
  for (let i = 0; i < jsonPad; i += 1) out[20 + rawJson.byteLength + i] = 0x20; // JSON padding = space

  const binChunkOffset = 20 + jsonLen;
  view.setUint32(binChunkOffset, binLen, true);
  view.setUint32(binChunkOffset + 4, CHUNK_BIN, true);
  out.set(binBytes, binChunkOffset + 8);

  return out;
}
