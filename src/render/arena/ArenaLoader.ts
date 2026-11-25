import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Constants } from "@babylonjs/core/Engines/constants";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import "../registerLoaders";

import { resolveAsset, resolveModel } from "@/content/assets";
import { type ArenaData, arenaParts } from "@/content/arenas";
import { colorTargets } from "@/content/textureSlots";
import { cssColorToRgb } from "./cssColor";

/**
 * Builds one arena into a scene: the ring, two sets of steps, whatever
 * environment the arena file lists, and the ceiling, with the arena's textures
 * and colours applied.
 *
 * Scene-agnostic on purpose. The Arena Viewer and Arena Editor own an orbiting
 * camera around this, and a future match renderer will play inside it; all of
 * them need the arena to look the same, so the building lives here.
 */

const RING_PATH = "assets/environments/ring/models/ring-standard-2.glb";

const RING_STEPS_PATH = "assets/environments/arenas/shared/models/ring-steps.glb";

/**
 * Trusses, lights and hanging banners over the ring.
 *
 * Added by the renderer rather than listed per arena, on the same footing as
 * the ring steps: every arena has a ceiling, so there is nothing for an arena
 * file to decide beyond how it is dressed. The GLB is authored in place -
 * centred on the ring, spanning about +-11.8 units and sitting 9.3 to 13.3
 * units up - so it loads with no placement of its own.
 *
 * Its textures are packed into the file, so it renders correctly untouched.
 * An arena that wants its own banners names `mat_ceiling_banners` in
 * `arenaTextures`.
 *
 * This is the lit copy of `ceiling_trusses.glb`: the same trusses plus a
 * `glow_*` card on each of the 44 lamp lenses and a `beam_*` shaft from each
 * lamp card down to the ring.
 */
const CEILING_TRUSSES_PATH = "assets/environments/arenas/shared/models/ceiling_trusses_lit.glb";

/**
 * The steps GLB ships with a 1x1 placeholder baked into `mat_ring_steps`, so
 * on its own it renders flat white. The real art sits beside it in the texture
 * tree. Applied before the arena's own textures, so an arena file that names
 * `mat_ring_steps` still wins.
 */
const DEFAULT_STEPS_TEXTURE = "assets/environments/arenas/shared/textures/ring_steps.png";

/**
 * Where the two sets of steps sit, measured from the authored ring.
 *
 * These rotations are quaternions, ordered [x, y, z, w] - a different
 * convention from the Euler triples an arena file uses for `arenaParts`.
 */
const RING_STEPS_PLACEMENTS: {
  corner: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
}[] = [
  {
    corner: "ne",
    position: [3.7936058044433594, 0.675000011920929, -3.80749249458313],
    quaternion: [0.27059805393218994, 0.6532813310623169, -0.6532816290855408, 0.2705979645252228],
  },
  {
    corner: "sw",
    position: [-3.5595788955688477, 0.675000011920929, 3.2128915786743164],
    quaternion: [0.6532816290855408, -0.27059799432754517, 0.2705981135368347, 0.6532813310623169],
  },
];

/**
 * Lighting is baked into stage and ceiling GLBs as flat cards, named for what
 * they do. glTF can say neither "face the camera" nor "add your light to what
 * is behind you", so the names carry it. Every kind blends additively.
 */
interface LightCardKind {
  /** Turns to face the camera. */
  billboard: boolean;
  /** Pulses in size and brightness. */
  twinkle: boolean;
  /** Bleeds light into its surroundings through the bloom layer. */
  bloom: boolean;
}

const LIGHT_CARDS: Record<string, LightCardKind> = {
  /** Star glints on a stage truss. */
  flare_: { billboard: true, twinkle: true, bloom: true },
  /** Steady glows on the ceiling lamp lenses. */
  glow_: { billboard: true, twinkle: false, bloom: true },
  /** Glow filling a stage entranceway. Too big to bloom without fogging it. */
  haze_: { billboard: false, twinkle: false, bloom: false },
  /** Shafts from the ceiling lamps down to the ring. */
  beam_: { billboard: false, twinkle: false, bloom: false },
};

function lightCardKind(mesh: AbstractMesh): LightCardKind | null {
  for (const [prefix, kind] of Object.entries(LIGHT_CARDS)) {
    if (mesh.name.startsWith(prefix)) return kind;
  }
  return null;
}

/** True for a light card, which is light rather than something solid. */
export function isLightCard(mesh: AbstractMesh): boolean {
  return lightCardKind(mesh) !== null;
}

/** The scene's one bloom layer, shared by every arena loaded into it. */
const BLOOM_LAYER = "lightCardBloom";

/**
 * Turns an arena file's texture value into a URL. Bundled paths resolve
 * through the asset index; the arena screens also resolve imported images.
 */
export type TextureResolver = (value: string) => string | null;

/** Every mesh one arena load produced, grouped by where it came from. */
export interface LoadedArena {
  ring: AbstractMesh[];
  steps: AbstractMesh[];
  arena: AbstractMesh[];
  ceiling: AbstractMesh[];
  /** Anything that went wrong but did not stop the arena rendering. */
  warnings: string[];
}

async function importMeshes(url: string, scene: Scene): Promise<AbstractMesh[]> {
  // Deployment URLs may carry no recognisable extension once encoded, so the
  // loader is named rather than sniffed.
  return (await ImportMeshAsync(url, scene, { pluginExtension: ".glb" })).meshes;
}

/**
 * Loads an arena into `scene`.
 *
 * A missing environment part warns and carries on, since an arena is still
 * worth looking at without its floor. A missing ring throws: there would be
 * nothing left to show, and nothing to wrestle in.
 */
export async function loadArena(
  scene: Scene,
  arena: ArenaData,
  resolveTexture: TextureResolver = resolveAsset,
): Promise<LoadedArena> {
  const warnings: string[] = [];
  const loaded: LoadedArena = { ring: [], steps: [], arena: [], ceiling: [], warnings };

  const ringUrl = resolveModel(RING_PATH);
  if (!ringUrl) throw new Error(`Ring model is missing: public/${RING_PATH}`);
  loaded.ring = await importMeshes(ringUrl, scene);

  // Everything after the ring is optional: a part that is not shipped, or
  // fails to download, becomes a warning rather than a half-built scene.
  const optional = async (path: string, label: string): Promise<AbstractMesh[] | null> => {
    const url = resolveModel(path);
    if (!url) {
      warnings.push(`${label} missing: ${path}`);
      return null;
    }
    try {
      return await importMeshes(url, scene);
    } catch (error) {
      warnings.push(`${label} failed to load: ${path} (${error instanceof Error ? error.message : String(error)})`);
      return null;
    }
  };

  for (const placement of RING_STEPS_PLACEMENTS) {
    const meshes = await optional(RING_STEPS_PATH, "Ring steps");
    if (!meshes) break;
    placeSteps(meshes, placement);
    loaded.steps.push(...meshes);
  }
  applyDefaultStepsTexture(scene, loaded.steps);

  for (const part of arenaParts(arena)) {
    const meshes = await optional(part.glb, "Arena part");
    if (!meshes) continue;
    placePart(meshes, part.position, part.rotation);
    applyLightCards(scene, meshes);
    loaded.arena.push(...meshes);
  }

  const ceiling = await optional(CEILING_TRUSSES_PATH, "Ceiling trusses");
  if (ceiling) {
    loaded.ceiling = ceiling;
    applyLightCards(scene, ceiling);
  }

  warnings.push(...applyTextures(scene, arena, loaded, resolveTexture));
  return loaded;
}

/** Every mesh in a load, in one list. */
export function allArenaMeshes(loaded: LoadedArena): AbstractMesh[] {
  return [...loaded.ring, ...loaded.steps, ...loaded.arena, ...loaded.ceiling];
}

/** Disposes a load's meshes, and each shared material once. */
export function disposeArena(loaded: LoadedArena): void {
  const materials = new Set<Material>();
  for (const mesh of allArenaMeshes(loaded)) {
    // Meshes share materials - the ring has ~69 meshes over 10 materials -
    // so they are collected and disposed once rather than per mesh.
    if (mesh.material) materials.add(mesh.material);
    mesh.dispose();
  }
  for (const material of materials) material.dispose(false, true);
}

function placeSteps(meshes: AbstractMesh[], placement: (typeof RING_STEPS_PLACEMENTS)[number]): void {
  const target = meshes.find((m) => m.name === "ring-steps") ?? meshes[0];
  if (!target) return;
  target.position.set(...placement.position);
  target.rotationQuaternion = new Quaternion(...placement.quaternion);
}

function placePart(meshes: AbstractMesh[], position: [number, number, number], rotation: [number, number, number]): void {
  const offset = new Vector3(...position);
  const euler = new Vector3(...rotation);
  const hasOffset = offset.lengthSquared() > 0;
  const hasRotation = euler.lengthSquared() > 0;
  if (!hasOffset && !hasRotation) return;

  for (const mesh of meshes) {
    // Only roots move; children follow their parent.
    if (mesh.parent) continue;

    if (hasRotation) {
      const spin = Quaternion.RotationYawPitchRoll(euler.y, euler.x, euler.z);
      mesh.rotationQuaternion = mesh.rotationQuaternion ? spin.multiply(mesh.rotationQuaternion) : spin;
    }
    if (hasOffset) mesh.position.addInPlace(offset);
  }
}

function applyLightCards(scene: Scene, meshes: AbstractMesh[]): void {
  const twinkling: AbstractMesh[] = [];
  for (const mesh of meshes) {
    const kind = lightCardKind(mesh);
    if (!kind) continue;
    mesh.isPickable = false;

    // Shared by every card of one colour, so this repeats harmlessly.
    const material = mesh.material;
    if (material) {
      material.alphaMode = Constants.ALPHA_ADD;
      material.disableDepthWrite = true;
      material.backFaceCulling = false;
    }

    if (kind.billboard) {
      // The glTF root mirrors Z to change handedness, and Babylon's billboard
      // maths mishandles a mirrored parent - every card lands upside down
      // below the floor. Detaching first keeps the world position it has now.
      // It must happen before billboarding, which would bake in that error.
      mesh.parent?.computeWorldMatrix(true);
      mesh.setParent(null);
      mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    }
    if (kind.twinkle) twinkling.push(mesh);
  }
  if (twinkling.length) twinkle(scene, twinkling);
  ensureBloom(scene);
}

/**
 * Adds the bloom layer the first time any arena loads into `scene`.
 *
 * Every mesh renders into it - the rest in black, so a truss in front of a
 * lamp still hides its glow - but only cards whose kind blooms give off
 * light. Unlit cards keep their colour in the albedo texture rather than an
 * emissive one, so the layer is pointed there.
 */
function ensureBloom(scene: Scene): void {
  if (scene.getGlowLayerByName(BLOOM_LAYER)) return;

  const bloom = new GlowLayer(BLOOM_LAYER, scene, { blurKernelSize: 32 });
  bloom.intensity = 0.8;
  const blooms = (mesh: AbstractMesh) => lightCardKind(mesh)?.bloom === true;
  // Typed as always returning a texture, but Babylon reads null as "none".
  bloom.customEmissiveTextureSelector = (mesh, _subMesh, material) =>
    (blooms(mesh) && material instanceof PBRMaterial ? material.albedoTexture : null) as Texture;
  bloom.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
    if (blooms(mesh)) result.set(1, 1, 1, 1);
    else result.set(0, 0, 0, 0);
  };
}

/**
 * Pulses each flare's size and brightness on its own rate and phase, so the
 * truss sparkles rather than breathing in unison.
 */
function twinkle(scene: Scene, flares: AbstractMesh[]): void {
  const pulses = flares.map((mesh) => ({
    mesh,
    base: mesh.scaling.clone(),
    rate: 1.5 + Math.random() * 2.5,
    phase: Math.random() * Math.PI * 2,
  }));

  let seconds = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    seconds += scene.getEngine().getDeltaTime() / 1000;
    for (const pulse of pulses) {
      const wave = Math.sin(seconds * pulse.rate + pulse.phase);
      pulse.mesh.scaling.copyFrom(pulse.base).scaleInPlace(0.85 + 0.15 * wave);
      pulse.mesh.visibility = 0.9 + 0.1 * wave;
    }
  });

  // An arena is torn down by disposing its meshes, so the pulse goes with them.
  flares[0].onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(observer);
  });
}

/** Replaces the steps' 1x1 placeholder with the real art. */
function applyDefaultStepsTexture(scene: Scene, steps: AbstractMesh[]): void {
  const url = resolveAsset(DEFAULT_STEPS_TEXTURE);
  if (!url) return;
  const materials = new Set<Material>();
  for (const mesh of steps) {
    if (mesh.material?.name === "mat_ring_steps") materials.add(mesh.material);
  }
  for (const material of materials) swapTexture(scene, material, url);
}

function applyTextures(scene: Scene, arena: ArenaData, loaded: LoadedArena, resolveTexture: TextureResolver): string[] {
  // ring-standard-2.glb embeds every texture it needs (bolts included), so
  // there are no renderer-owned ring defaults to layer under the arena's own.
  return [
    ...applyTo(scene, [...loaded.ring, ...loaded.steps], arena.ringTextures, "ringTextures", resolveTexture),
    ...applyTo(scene, [...loaded.arena, ...loaded.ceiling], arena.arenaTextures, "arenaTextures", resolveTexture),
  ];
}

function applyTo(
  scene: Scene,
  meshes: AbstractMesh[],
  textures: Record<string, string> | undefined,
  label: string,
  resolveTexture: TextureResolver,
): string[] {
  if (!textures) return [];

  const byName = new Map<string, Set<Material>>();
  for (const mesh of meshes) {
    if (!mesh.material?.name) continue;
    const materials = byName.get(mesh.material.name) ?? new Set<Material>();
    materials.add(mesh.material);
    byName.set(mesh.material.name, materials);
  }

  const warnings: string[] = [];
  for (const [key, value] of Object.entries(textures)) {
    if (key.endsWith("Color")) {
      applyColor(byName, key, value);
      continue;
    }
    const materials = byName.get(key);
    if (!materials?.size) {
      warnings.push(`${label}: no material named "${key}"`);
      continue;
    }
    const url = resolveTexture(value);
    if (!url) continue;
    for (const material of materials) swapTexture(scene, material, url);
  }
  return warnings;
}

function applyColor(byName: Map<string, Set<Material>>, key: string, cssColor: string): void {
  const rgb = cssColorToRgb(cssColor);
  if (!rgb) return;

  // The slot registry owns the key -> material mapping, so a new colour
  // control works here without the renderer being told about it.
  for (const name of colorTargets(key)) {
    for (const material of byName.get(name) ?? []) {
      if (material instanceof PBRMaterial) material.albedoColor.set(rgb.r, rgb.g, rgb.b);
      else if (material instanceof StandardMaterial) material.diffuseColor.set(rgb.r, rgb.g, rgb.b);
    }
  }
}

function swapTexture(scene: Scene, material: Material, url: string): void {
  // invertY false matches the glTF UV convention; without it every swapped
  // texture appears upside down against the baked ones.
  const texture = new Texture(url, scene, undefined, false);

  // GLB materials import as PBRMaterial, so that is the branch that fires
  // for the ring and floor. StandardMaterial covers anything built in code.
  if (material instanceof PBRMaterial) material.albedoTexture = texture;
  else if (material instanceof StandardMaterial) material.diffuseTexture = texture;
}
