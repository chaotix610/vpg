import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Bone } from "@babylonjs/core/Bones/bone";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { GLTFLoaderAnimationStartMode } from "@babylonjs/loaders/glTF/glTFFileLoader.pure";
import "../registerLoaders";

import { creatorAssetUrl } from "@/content/characterCatalog";
import type { CharacterManifest, CostumeRecipe, WrapMode } from "@/content/characterLook";
import {
  DEFAULT_AKI_SOLE_Y,
  DEFAULT_AKI_TOE_Z,
  computeVpgRigLayout,
  transformModularMeshToVpg,
  type VpgRigLayout,
} from "@/content/vpgRig";
import { buildVpgCharacterGlb, type GlbExportPart } from "@/content/vpgGlbExport";
import type { RigTarget } from "@/render/viewer/retarget";
import { CharacterComposer } from "./CharacterComposer";

/**
 * Assembles a modular character directly onto the canonical 71-bone VPG Rig 2.0
 * inside any Babylon.js scene.
 *
 * Hierarchy matches Babylon's glTF loader output for `mannequin-blue.glb` and
 * `aki-man.glb` so VPG's `retarget()` plays any clip from `public/assets/animations/`
 * directly on the assembled character with zero rig conversion overhead:
 *
 *   __root__  (rot = (0, 1, 0, 0), scale = (h, h, -h))
 *   └─ Armature
 *      ├─ <dressed slot meshes, skinned to VPG_Rig_2_0 skeleton>
 *      └─ root -> pelvis / ik_hand_root / socket_offhand -> ... (71 bones)
 */

export interface SlotTilePreview {
  slot: number;
  name: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  source: number;
  model: number;
}

export interface CharacterBuildSummary {
  parts: number;
  swaps: string[];
  problems: string[];
  rigChanged: boolean;
}

export interface CharacterFacts {
  meshes: number;
  vertices: number;
  faces: number;
  bones: number;
  deformingBones: number;
}

interface ExportableSlotData {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
  jointsUint8: Uint8Array;
  weights: Float32Array;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  wrapU: WrapMode;
  wrapV: WrapMode;
}

const WRAP_MODE: Record<WrapMode, number> = {
  mirror: Texture.MIRROR_ADDRESSMODE,
  repeat: Texture.WRAP_ADDRESSMODE,
  clamp: Texture.CLAMP_ADDRESSMODE,
};

const CLAY_COLOR = new Color3(0.84, 0.82, 0.8);
const WHITE = new Color3(1, 1, 1);

async function rgbaToPngBytes(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const pixels = new Uint8ClampedArray(rgba.byteLength);
  pixels.set(rgba);
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create 2D context for GLB texture encoding.");
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await blob.arrayBuffer());
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create 2D context for GLB texture encoding.");
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

export class VpgCharacterRig implements RigTarget {
  readonly rootNode: TransformNode;
  readonly armature: TransformNode;
  readonly skeleton: Skeleton;
  readonly nodes = new Map<string, TransformNode>();
  readonly rest = new Map<string, Vector3>();

  private readonly composer: CharacterComposer;
  private readonly geometryCache = new Map<string, Promise<Map<string, VertexData>>>();
  private readonly boneNodes = new Map<string, TransformNode>();
  private readonly babylonBones: Bone[] = [];
  private readonly seamsByBone: Record<number, readonly [number, number] | undefined> = {};

  private rigLayout: VpgRigLayout;
  private parts: { mesh: Mesh; material: StandardMaterial; texture: RawTexture }[] = [];
  private tiles: SlotTilePreview[] = [];
  private exportParts: ExportableSlotData[] = [];
  private heightScale = 1;
  private visible = true;
  private textured = true;
  private buildTicket = 0;
  private shadows: ShadowGenerator | null;

  constructor(
    private readonly scene: Scene,
    private readonly manifest: CharacterManifest,
    options: { composer?: CharacterComposer; shadows?: ShadowGenerator | null } = {},
  ) {
    this.composer = options.composer ?? new CharacterComposer(manifest);
    this.shadows = options.shadows ?? null;

    for (const [key, pair] of Object.entries(manifest.skeleton.seams ?? {})) {
      this.seamsByBone[Number(key)] = pair;
    }

    // Match Babylon glTF loader's handedness root node so VPG animations apply verbatim.
    this.rootNode = new TransformNode("__root__", scene);
    if (!scene.useRightHandedSystem) {
      this.rootNode.rotationQuaternion = new Quaternion(0, 1, 0, 0);
      this.rootNode.scaling.set(1, 1, -1);
    } else {
      this.rootNode.rotationQuaternion = Quaternion.Identity();
      this.rootNode.scaling.set(1, 1, 1);
    }

    this.armature = new TransformNode("Armature", scene);
    this.armature.parent = this.rootNode;
    this.armature.rotationQuaternion = Quaternion.Identity();

    this.rigLayout = computeVpgRigLayout(
      manifest.skeleton.bones,
      manifest.skeleton.boneOrder,
      { soleY: DEFAULT_AKI_SOLE_Y, toeZL: DEFAULT_AKI_TOE_Z, toeZR: DEFAULT_AKI_TOE_Z, headCenterAki: manifest.skeleton.headCenter },
    );

    this.skeleton = new Skeleton("VPG_Rig_2_0", "VPG_Rig_2_0", scene);
    this.buildVpgSkeletonNodes();
  }

  private buildVpgSkeletonNodes(): void {
    this.nodes.set("__root__", this.rootNode);
    this.nodes.set("Armature", this.armature);
    this.rest.set("__root__", this.rootNode.position.clone());
    this.rest.set("Armature", this.armature.position.clone());

    const boneByName = new Map<string, Bone>();
    for (const boneSpec of this.rigLayout.bones) {
      const node = new TransformNode(boneSpec.name, this.scene);
      const parentNode = boneSpec.parent ? this.boneNodes.get(boneSpec.parent)! : this.armature;
      node.parent = parentNode;
      node.position.set(boneSpec.localTranslation[0], boneSpec.localTranslation[1], boneSpec.localTranslation[2]);
      node.rotationQuaternion = new Quaternion(
        boneSpec.localRotation[0],
        boneSpec.localRotation[1],
        boneSpec.localRotation[2],
        boneSpec.localRotation[3],
      );
      node.scaling.set(1, 1, 1);

      this.boneNodes.set(boneSpec.name, node);
      this.nodes.set(boneSpec.name, node);
      this.rest.set(boneSpec.name, node.position.clone());

      const parentBone = boneSpec.parent ? boneByName.get(boneSpec.parent) ?? null : null;
      const localMat = Matrix.Compose(
        Vector3.One(),
        node.rotationQuaternion.clone(),
        node.position.clone(),
      );
      const babylonBone = new Bone(
        boneSpec.name,
        this.skeleton,
        parentBone,
        localMat,
        null,
        null,
        boneSpec.jointIndex,
      );
      babylonBone.linkTransformNode(node);
      boneByName.set(boneSpec.name, babylonBone);
      this.babylonBones.push(babylonBone);
    }
    this.syncBindMatrices();
  }

  private syncBindMatrices(): void {
    // Update each bone's rest/base matrix and absolute inverse bind matrix from rigLayout.
    for (const boneSpec of this.rigLayout.bones) {
      const bone = this.babylonBones[boneSpec.jointIndex];
      const localMat = Matrix.Compose(
        Vector3.One(),
        new Quaternion(
          boneSpec.localRotation[0],
          boneSpec.localRotation[1],
          boneSpec.localRotation[2],
          boneSpec.localRotation[3],
        ),
        new Vector3(boneSpec.localTranslation[0], boneSpec.localTranslation[1], boneSpec.localTranslation[2]),
      );
      bone.updateMatrix(localMat, false, false);
      bone._updateAbsoluteBindMatrices(undefined, false);
    }
  }

  private applyRigLayout(next: VpgRigLayout): void {
    this.rigLayout = next;
    for (const boneSpec of next.bones) {
      const node = this.boneNodes.get(boneSpec.name);
      if (!node) continue;
      node.position.set(boneSpec.localTranslation[0], boneSpec.localTranslation[1], boneSpec.localTranslation[2]);
      node.rotationQuaternion = new Quaternion(
        boneSpec.localRotation[0],
        boneSpec.localRotation[1],
        boneSpec.localRotation[2],
        boneSpec.localRotation[3],
      );
      node.scaling.set(1, 1, 1);
      this.rest.set(boneSpec.name, node.position.clone());
    }
    this.syncBindMatrices();
  }

  get layout(): VpgRigLayout {
    return this.rigLayout;
  }

  get heightScaleValue(): number {
    return this.heightScale;
  }

  get composedTiles(): readonly SlotTilePreview[] {
    return this.tiles;
  }

  getBoneNode(name: string): TransformNode | undefined {
    return this.boneNodes.get(name);
  }

  /** Restores all 71 VPG Rig 2.0 bones to their exact T-pose rest transform. */
  resetToRestPose(): void {
    for (const boneSpec of this.rigLayout.bones) {
      const node = this.boneNodes.get(boneSpec.name);
      if (!node) continue;
      node.position.set(boneSpec.localTranslation[0], boneSpec.localTranslation[1], boneSpec.localTranslation[2]);
      if (!node.rotationQuaternion) node.rotationQuaternion = new Quaternion();
      node.rotationQuaternion.set(
        boneSpec.localRotation[0],
        boneSpec.localRotation[1],
        boneSpec.localRotation[2],
        boneSpec.localRotation[3],
      );
      node.scaling.set(1, 1, 1);
    }
  }

  /** Uniformly scales the character height while keeping soles planted at y = 0. */
  setHeightScale(scale: number): void {
    this.heightScale = Math.min(1.25, Math.max(0.82, scale));
    if (!this.scene.useRightHandedSystem) {
      this.rootNode.scaling.set(this.heightScale, this.heightScale, -this.heightScale);
    } else {
      this.rootNode.scaling.set(this.heightScale, this.heightScale, this.heightScale);
    }
  }

  setAppearance(options: { visible?: boolean; textured?: boolean }): void {
    if (options.visible !== undefined) this.visible = options.visible;
    if (options.textured !== undefined) this.textured = options.textured;
    for (const part of this.parts) {
      part.mesh.isVisible = this.visible;
      part.material.diffuseTexture = this.textured ? part.texture : null;
      part.material.diffuseColor = this.textured ? WHITE : CLAY_COLOR;
    }
  }

  private loadPartGeometry(src: string): Promise<Map<string, VertexData>> {
    let pending = this.geometryCache.get(src);
    if (!pending) {
      pending = (async () => {
        const url = creatorAssetUrl(src);
        const container = await LoadAssetContainerAsync(url, this.scene, {
          pluginExtension: ".glb",
          pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
        });
        const map = new Map<string, VertexData>();
        for (const mesh of container.meshes) {
          if (!mesh.getTotalVertices()) continue;
          map.set(mesh.name, VertexData.ExtractFromMesh(mesh as Mesh, true, true));
        }
        container.dispose();
        return map;
      })().catch((err) => {
        this.geometryCache.delete(src);
        throw err;
      });
      this.geometryCache.set(src, pending);
    }
    return pending;
  }

  /**
   * Rebuilds all modular meshes and slot textures for `recipe`, skinned to the
   * 71-bone VPG Rig 2.0 skeleton.
   */
  async build(recipe: CostumeRecipe): Promise<CharacterBuildSummary | null> {
    const ticket = (this.buildTicket += 1);
    const m = this.manifest;
    const { tiles, problems } = await this.composer.compose(recipe.plan);

    const loadedParts: {
      entry: CostumeRecipe["dressed"][number];
      tile: (typeof tiles)[number];
      model: CharacterManifest["models"][string];
      data: VertexData;
    }[] = [];

    await Promise.all(
      recipe.dressed.map(async (entry) => {
        const tile = tiles[entry.slot];
        if (!tile) return;
        const model = m.models[String(entry.model)];
        if (!model) {
          problems.push(`model ${entry.model} is not in the manifest`);
          return;
        }
        try {
          const map = await this.loadPartGeometry(model.src);
          const data = map.get(model.node);
          if (!data) problems.push(`${model.src} has no node ${model.node}`);
          else loadedParts.push({ entry, tile, model, data });
        } catch (err) {
          problems.push(`${model.src}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    if (ticket !== this.buildTicket) return null;

    // Sort deterministically by slot index
    loadedParts.sort((a, b) => a.entry.slot - b.entry.slot);

    // Measure actual sole Y and toe Z from loaded feet (handles standard boots -88 and heels/platforms -92)
    let soleY = Infinity;
    let toeZL = -Infinity;
    let toeZR = -Infinity;
    for (const { entry, data } of loadedParts) {
      const pos = data.positions;
      if (!pos) continue;
      if (entry.slot === 8 || entry.slot === 15) {
        // left_foot (8) / right_foot (15)
        for (let i = 0; i < pos.length; i += 3) {
          const y = pos[i + 1];
          const z = pos[i + 2];
          if (y < soleY) soleY = y;
          if (entry.slot === 8 && z > toeZL) toeZL = z;
          if (entry.slot === 15 && z > toeZR) toeZR = z;
        }
      }
    }
    if (!Number.isFinite(soleY)) soleY = DEFAULT_AKI_SOLE_Y;
    if (!Number.isFinite(toeZL)) toeZL = DEFAULT_AKI_TOE_Z;
    if (!Number.isFinite(toeZR)) toeZR = DEFAULT_AKI_TOE_Z;

    const rigChanged = Math.abs(soleY - this.rigLayout.soleY) > 1e-3;
    if (rigChanged) {
      const nextLayout = computeVpgRigLayout(m.skeleton.bones, m.skeleton.boneOrder, {
        soleY,
        toeZL,
        toeZR,
        headCenterAki: m.skeleton.headCenter,
      });
      this.applyRigLayout(nextLayout);
    }

    this.disposeParts();
    this.tiles = [];
    this.exportParts = [];

    for (const { entry, tile, model, data } of loadedParts) {
      if (!data.positions || !data.uvs || !data.indices) continue;
      const count = Math.floor(data.positions.length / 3);
      const skinned = transformModularMeshToVpg({
        positions: data.positions,
        normals: data.normals ?? [],
        partBone: entry.bone,
        influence: model.influence,
        seams: this.seamsByBone,
        rig: this.rigLayout,
      });

      // UVs are stored in texels in the modular GLBs; convert to normalized [0, 1] tile UVs.
      const uvs = new Float32Array(count * 2);
      for (let at = 0; at < count; at += 1) {
        uvs[at * 2] = (data.uvs[at * 2] + 2 * tile.width) / tile.width;
        uvs[at * 2 + 1] = (data.uvs[at * 2 + 1] + 2 * tile.height) / tile.height;
      }

      const vertexData = new VertexData();
      vertexData.positions = skinned.positions;
      vertexData.normals = skinned.normals;
      vertexData.uvs = uvs;
      vertexData.indices = data.indices;
      vertexData.matricesIndices = skinned.matricesIndices;
      vertexData.matricesWeights = skinned.matricesWeights;

      const name = m.slots.names[entry.slot] ?? `slot_${entry.slot}`;
      const mesh = new Mesh(`vpg_${name}`, this.scene);
      vertexData.applyToMesh(mesh, false);
      mesh.skeleton = this.skeleton;
      mesh.numBoneInfluencers = 1;
      mesh.parent = this.armature;
      mesh.isPickable = false;
      mesh.isVisible = this.visible;

      const picture = m.pictures[String(tile.source)];
      const wrapU: WrapMode = picture?.wrap?.[0] ?? "repeat";
      const wrapV: WrapMode = picture?.wrap?.[1] ?? "repeat";

      const rgbaCopy = new Uint8Array(tile.rgba.byteLength);
      rgbaCopy.set(tile.rgba);
      const texture = RawTexture.CreateRGBATexture(
        rgbaCopy,
        tile.width,
        tile.height,
        this.scene,
        false,
        false,
        Texture.BILINEAR_SAMPLINGMODE,
      );
      texture.wrapU = WRAP_MODE[wrapU];
      texture.wrapV = WRAP_MODE[wrapV];
      texture.hasAlpha = true;

      const material = new StandardMaterial(`vpg_${name}_mat`, this.scene);
      material.diffuseTexture = this.textured ? texture : null;
      material.diffuseColor = this.textured ? WHITE : CLAY_COLOR;
      material.backFaceCulling = false;
      material.transparencyMode = Material.MATERIAL_ALPHATEST;
      material.alphaCutOff = 0.5;
      material.specularColor = new Color3(0.08, 0.08, 0.08);
      material.specularPower = 24;
      material.ambientColor = new Color3(0.45, 0.45, 0.48);
      mesh.material = material;

      if (this.shadows) this.shadows.addShadowCaster(mesh, false);

      this.parts.push({ mesh, material, texture });
      this.tiles.push({
        slot: entry.slot,
        name,
        width: tile.width,
        height: tile.height,
        rgba: tile.rgba,
        source: tile.source,
        model: entry.model,
      });

      const indicesArray =
        data.indices instanceof Uint16Array || data.indices instanceof Uint32Array
          ? data.indices
          : count > 65535
            ? Uint32Array.from(data.indices)
            : Uint16Array.from(data.indices);

      this.exportParts.push({
        name,
        positions: skinned.positions,
        normals: skinned.normals,
        uvs,
        indices: indicesArray,
        jointsUint8: skinned.jointsUint8,
        weights: skinned.matricesWeights,
        width: tile.width,
        height: tile.height,
        rgba: tile.rgba,
        wrapU,
        wrapV,
      });
    }

    return {
      parts: this.parts.length,
      swaps: recipe.swaps.map((s) => s.swap),
      problems: [...new Set(problems)],
      rigChanged,
    };
  }

  facts(): CharacterFacts {
    let vertices = 0;
    let faces = 0;
    for (const part of this.parts) {
      vertices += part.mesh.getTotalVertices();
      faces += Math.round(part.mesh.getTotalIndices() / 3);
    }
    return {
      meshes: this.parts.length,
      vertices,
      faces,
      bones: this.rigLayout.bones.length,
      deformingBones: 52,
    };
  }

  /** Exports the assembled modular character as a standalone VPG Rig 2.0 `.glb` binary. */
  async exportGlb(name: string): Promise<Uint8Array> {
    const glbParts: GlbExportPart[] = await Promise.all(
      this.exportParts.map(async (part) => ({
        name: part.name,
        positions: part.positions,
        normals: part.normals,
        uvs: part.uvs,
        indices: part.indices,
        jointsUint8: part.jointsUint8,
        weights: part.weights,
        pngBytes: await rgbaToPngBytes(part.rgba, part.width, part.height),
        wrapU: part.wrapU,
        wrapV: part.wrapV,
      })),
    );
    return buildVpgCharacterGlb(this.rigLayout, glbParts, {
      name,
      heightScale: this.heightScale,
    });
  }

  private disposeParts(): void {
    for (const part of this.parts) {
      if (this.shadows) this.shadows.removeShadowCaster(part.mesh, false);
      part.mesh.dispose();
      part.material.dispose();
      part.texture.dispose();
    }
    this.parts = [];
  }

  dispose(): void {
    this.buildTicket += 1;
    this.disposeParts();
    this.skeleton.dispose();
    for (const node of this.boneNodes.values()) node.dispose();
    this.boneNodes.clear();
    this.nodes.clear();
    this.rest.clear();
    this.armature.dispose();
    this.rootNode.dispose();
    this.geometryCache.clear();
  }
}
