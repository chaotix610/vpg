import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
// Side effect: the camera's collision sweep needs the scene's collision coordinator.
import "@babylonjs/core/Collisions/collisionCoordinator";

import type { ArenaData } from "@/content/arenas";
import { type LoadedArena, type TextureResolver, disposeArena, isLightCard, loadArena } from "./ArenaLoader";

/**
 * Renders one arena for the Arena Viewer and Arena Editor: the ring, two sets
 * of steps, and whatever environment the arena lists, with its configured
 * textures. The building itself is `loadArena`'s; this class adds the orbiting
 * camera and render loop around it.
 */

export interface ArenaBounds {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  size: Vector3;
}

/** Where the orbit camera is, in world units and radians. */
export interface CameraState {
  alpha: number;
  beta: number;
  radius: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/** Anything that went wrong but did not stop the arena rendering. */
export interface ArenaLoadReport {
  warnings: string[];
}

/**
 * Texture URLs for one load, held until the arena is replaced or cleared.
 * The arena screens pass imported-image leases here; the scene never reads
 * browser storage itself.
 */
export interface TextureLease {
  resolve: TextureResolver;
  warnings?: string[];
  release?(): void;
}

/** Virtual inputs the orbit camera responds to. */
export const CAMERA_INPUTS: readonly string[] = ["stickUp", "stickDown", "stickLeft", "stickRight", "cUp", "cDown"];

export class ArenaScene {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private loaded: LoadedArena | null = null;
  private lease: TextureLease | null = null;
  /** Bumped by every load and by dispose, so a slower, older load knows it lost. */
  private generation = 0;

  /** How close, in world units, the camera may come to a surface. */
  private static readonly CAMERA_CLEARANCE = 0.5;
  private static readonly ROTATION_STEP = Math.PI / 48;
  private static readonly ZOOM_STEP = 1.2;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  // --- lifecycle -----------------------------------------------------------

  private init(): Scene {
    if (this.scene) return this.scene;

    this.engine = new Engine(this.canvas, true, { preserveDrawingBuffer: true, stencil: true });

    const scene = new Scene(this.engine);
    scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
    scene.collisionsEnabled = true;
    this.scene = scene;

    const camera = new ArcRotateCamera("arenaCamera", -Math.PI / 2, Math.PI / 2.6, 18, Vector3.Zero(), scene);
    camera.attachControl(this.canvas, true);
    camera.lowerBetaLimit = Math.PI / 6;
    camera.upperBetaLimit = Math.PI / 2.2;
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 30;
    // Babylon sweeps the camera from its last position to its new one, so a
    // move into a wall slides along its surface instead of passing through.
    // Off until the first framing: the camera starts at the origin, and the
    // sweep out from there would snag on the ring.
    camera.checkCollisions = false;
    const clearance = ArenaScene.CAMERA_CLEARANCE;
    camera.collisionRadius = new Vector3(clearance, clearance, clearance);
    this.camera = camera;

    new HemisphericLight("arenaLight", new Vector3(0, 1, 0), scene).intensity = 1.0;

    // The editor's canvas shares its row with the panel, so it can change size
    // without the window doing so.
    this.resizeObserver = new ResizeObserver(() => this.engine?.resize());
    this.resizeObserver.observe(this.canvas);
    this.engine.runRenderLoop(() => scene.render());
    return scene;
  }

  /** Tears down the whole scene. Safe to call more than once. */
  dispose(): void {
    this.generation++;
    this.clearArena();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.engine?.stopRenderLoop();
    this.scene?.dispose();
    this.engine?.dispose();
    this.engine = null;
    this.scene = null;
    this.camera = null;
  }

  // --- loading -------------------------------------------------------------

  /**
   * Loads an arena, replacing whatever was on screen.
   *
   * The editor passes draft data directly, so a draft can be rendered before -
   * or without - it ever being saved. The lease is taken over: it is released
   * when this arena is replaced, so the caller acquires the next one before the
   * previous lets go and a texture both use keeps its URL.
   *
   * A missing environment part warns and carries on, since an arena is still
   * worth looking at without its floor. A missing ring throws: there would be
   * nothing left to show.
   */
  async load(arena: ArenaData, lease?: TextureLease): Promise<ArenaLoadReport> {
    const scene = this.init();
    const generation = ++this.generation;
    this.clearArena();

    let loaded: LoadedArena;
    try {
      loaded = lease ? await loadArena(scene, arena, lease.resolve) : await loadArena(scene, arena);
    } catch (error) {
      lease?.release?.();
      throw error;
    }
    // A newer load started, or the scene was disposed, while this one was
    // importing. Its meshes were never tracked, so they are dropped here or
    // they would stay in the scene underneath the newer arena.
    if (generation !== this.generation || this.scene !== scene) {
      disposeArena(loaded);
      lease?.release?.();
      return { warnings: [] };
    }
    this.loaded = loaded;
    this.lease = lease ?? null;

    // Everything loaded is solid to the camera, except the light cards: the
    // stage haze fills the entranceway and the ceiling beams cross the ring.
    for (const mesh of this.allMeshes()) mesh.checkCollisions = !isLightCard(mesh);

    this.frameCamera();
    return { warnings: [...(lease?.warnings ?? []), ...loaded.warnings] };
  }

  /** Removes the loaded arena but keeps the engine and camera alive. */
  private clearArena(): void {
    if (this.loaded) disposeArena(this.loaded);
    this.loaded = null;
    this.lease?.release?.();
    this.lease = null;
  }

  // --- camera --------------------------------------------------------------

  /** Everything currently loaded, for framing. */
  private allMeshes(): AbstractMesh[] {
    const l = this.loaded;
    return l ? [...l.ring, ...l.steps, ...l.arena, ...l.ceiling] : [];
  }

  bounds(meshes: AbstractMesh[] = this.loaded?.ring ?? []): ArenaBounds | null {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    let found = false;

    for (const mesh of meshes) {
      if (!mesh.getTotalVertices?.()) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, box.minimumWorld);
      max = Vector3.Maximize(max, box.maximumWorld);
      found = true;
    }

    if (!found) return null;
    return { min, max, center: min.add(max).scale(0.5), size: max.subtract(min) };
  }

  /**
   * Frames the ring if it has geometry, else whatever else loaded.
   *
   * The camera jumps straight to its framed spot rather than sweeping there:
   * the sweep from wherever it was could catch on the arena on the way.
   */
  private frameCamera(): void {
    const camera = this.camera;
    if (!camera) return;

    camera.checkCollisions = false;
    this.placeCamera(camera);
    camera.getViewMatrix(true);
    camera.checkCollisions = true;
  }

  private placeCamera(camera: ArcRotateCamera): void {
    const bounds = this.bounds() ?? this.bounds(this.allMeshes());
    if (!bounds) return;

    const largest = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
    const target = bounds.center.clone();
    target.y += bounds.size.y * 0.1;

    camera.setTarget(target);
    camera.radius = Math.max(largest * 1.2, 12);
    camera.lowerRadiusLimit = Math.max(largest * 0.35, 8);

    // The opening shot stays on the ring, but the outer limit is measured
    // against everything loaded so the ceiling - roughly three times the
    // ring's span and well above it - can be pulled back into view.
    const whole = this.bounds(this.allMeshes()) ?? bounds;
    const widest = Math.max(whole.size.x, whole.size.y, whole.size.z);
    camera.upperRadiusLimit = Math.max(widest * 3, camera.radius + 10);
  }

  /** Nudges the camera. `input` is a virtual controller input. */
  moveCamera(input: string): void {
    const camera = this.camera;
    if (!camera) return;

    const step = ArenaScene.ROTATION_STEP;
    const zoom = ArenaScene.ZOOM_STEP;

    switch (input) {
      case "stickUp":
        camera.beta = clamp(camera.beta + step, camera.lowerBetaLimit, camera.upperBetaLimit);
        break;
      case "stickDown":
        camera.beta = clamp(camera.beta - step, camera.lowerBetaLimit, camera.upperBetaLimit);
        break;
      case "stickLeft":
        camera.alpha -= step;
        break;
      case "stickRight":
        camera.alpha += step;
        break;
      case "cUp":
        camera.radius = clamp(camera.radius - zoom, camera.lowerRadiusLimit, camera.upperRadiusLimit);
        break;
      case "cDown":
        camera.radius = clamp(camera.radius + zoom, camera.lowerRadiusLimit, camera.upperRadiusLimit);
        break;
    }
  }

  /** Camera state, for tests, debugging and the viewer's position readout. */
  cameraState(): CameraState | null {
    const c = this.camera;
    if (!c) return null;
    const { x, y, z } = c.position;
    const t = c.target;
    return { alpha: c.alpha, beta: c.beta, radius: c.radius, position: { x, y, z }, target: { x: t.x, y: t.y, z: t.z } };
  }

  /** The material names present in the loaded scene, grouped the way an arena's texture maps are. */
  materialNames(): { arena: string[]; ring: string[] } {
    const names = (meshes: AbstractMesh[]): string[] =>
      [...new Set(meshes.map((mesh) => mesh.material?.name).filter((name): name is string => !!name))].sort();
    const l = this.loaded;
    return {
      arena: names(l ? [...l.arena, ...l.ceiling] : []),
      ring: names(l ? [...l.ring, ...l.steps] : []),
    };
  }

  /** How many meshes are loaded, by group. For tests. */
  meshCounts(): { ring: number; steps: number; arena: number; ceiling: number } {
    const l = this.loaded;
    return { ring: l?.ring.length ?? 0, steps: l?.steps.length ?? 0, arena: l?.arena.length ?? 0, ceiling: l?.ceiling.length ?? 0 };
  }
}

function clamp(value: number, lower: number | null, upper: number | null): number {
  return Math.min(Math.max(value, lower ?? -Infinity), upper ?? Infinity);
}
