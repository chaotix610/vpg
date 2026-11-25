import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { GLTFLoaderAnimationStartMode } from "@babylonjs/loaders/glTF/glTFFileLoader.pure";
import "../registerLoaders";

import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Animations/animatable";
import "@babylonjs/core/Meshes/instancedMesh";

import { ANIM_DIR, encodePath } from "@/content/animationLibrary";
import { resolveModel } from "@/content/assets";
import type { CharacterManifest, CostumeRecipe } from "@/content/characterLook";
import { VPG_SKELETON_LINKS, isVpgHelperBone } from "@/content/vpgRig";
import { describeAsset, retarget, type LoadedAsset } from "@/render/viewer/retarget";
import {
  VpgCharacterRig,
  type CharacterBuildSummary,
  type CharacterFacts,
  type SlotTilePreview,
} from "./VpgCharacterRig";

/**
 * 3D Babylon.js stage for the game-style Character Creator/Editor.
 *
 * Uses a transparent WebGL background so the retro purple perspective wireframe
 * booth renders cleanly behind the 3D wrestler, mounts modular characters onto
 * the canonical 71-bone VPG Rig 2.0, plays real VPG Rig 2.0 animations via
 * `retarget()`, and includes an optional 3D wrestling ring for the Moves preview.
 */

export type StageViewPreset = "front" | "side" | "back" | "head" | "feet" | "ring";

export interface StagePlaybackSnapshot {
  clipPath: string | null;
  clipName: string;
  playing: boolean;
  frame: number;
  from: number;
  to: number;
  fps: number;
  loadingClip: boolean;
  clipError: string | null;
}

export interface StageState {
  model: boolean;
  skeleton: boolean;
  showHelpers: boolean;
  textured: boolean;
  rotate: boolean;
  playing: boolean;
  boneScale: number;
  speed: number;
  showRing: boolean;
}

export interface VpgRigDiagnostics {
  rigName: string;
  totalBones: number;
  deformingBones: number;
  helperBones: number;
  boneNames: string[];
  scale: number;
  soleY: number;
  heightScale: number;
  pelvisWorldY: number;
  headWorldY: number;
  footWorldY: number;
}

const CAMERA_TARGET_Y = 0.86;
const RING_MODEL_PATH = "assets/environments/ring/models/ring-standard-2.glb";

export class CharacterStage {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly rig: VpgCharacterRig;
  private readonly resizeObserver: ResizeObserver;

  private readonly clipCache = new Map<string, Promise<LoadedAsset>>();
  private activeClip: LoadedAsset | null = null;
  private activeClipPath: string | null = null;
  private activeGroup: AnimationGroup | null = null;
  private activeFps = 60;
  private clipToken = 0;
  private loadingClip = false;
  private clipError: string | null = null;

  private stickBase!: Mesh;
  private helperStickBase!: Mesh;
  private jointBase!: Mesh;
  private headMark!: Mesh;
  private sticks: { from: string; to: string; helper: boolean; mesh: InstancedMesh }[] = [];
  private jointMarks: { bone: string; helper: boolean; mesh: InstancedMesh }[] = [];
  private shadowDisc!: Mesh;
  private ringRoot!: TransformNode;
  private ringContainer: AssetContainer | null = null;
  private ringLoadPromise: Promise<void> | null = null;

  private userTurning = false;
  private viewAnimToken = 0;
  private disposed = false;
  private onPointerDownBound: () => void;
  private onPointerUpBound: () => void;
  private onResizeBound: () => void;
  private onPlaybackChange?: (snap: StagePlaybackSnapshot) => void;

  readonly state: StageState = {
    model: true,
    skeleton: false,
    showHelpers: false,
    textured: true,
    rotate: false,
    playing: true,
    boneScale: 1.0,
    speed: 1.0,
    showRing: false,
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    manifest: CharacterManifest,
    options: { onPlaybackChange?: (snap: StagePlaybackSnapshot) => void } = {},
  ) {
    this.onPlaybackChange = options.onPlaybackChange;

    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      alpha: true,
      premultipliedAlpha: false,
      antialias: true,
    });
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

    const scene = new Scene(this.engine);
    this.scene = scene;
    // Transparent clear colour lets the retro purple perspective grid booth show through.
    scene.clearColor = new Color4(0, 0, 0, 0);

    // Facing +Z in Babylon LH: alpha = Math.PI / 2 puts camera directly in front of the wrestler.
    const camera = new ArcRotateCamera(
      "characterCamera",
      Math.PI / 2,
      1.45,
      3.55,
      new Vector3(0, CAMERA_TARGET_Y, 0),
      scene,
    );
    camera.attachControl(canvas, true);
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    camera.minZ = 0.05;
    camera.fov = 0.62;
    camera.lowerRadiusLimit = 0.7;
    camera.upperRadiusLimit = 22;
    camera.wheelDeltaPercentage = 0.012;
    camera.pinchDeltaPercentage = 0.012;
    camera.upperBetaLimit = Math.PI / 2 + 0.25;
    camera.lowerBetaLimit = 0.15;
    this.camera = camera;
    this.syncCameraDataset();

    this.onPointerDownBound = () => {
      this.userTurning = true;
    };
    this.onPointerUpBound = () => {
      this.userTurning = false;
    };
    canvas.addEventListener("pointerdown", this.onPointerDownBound);
    window.addEventListener("pointerup", this.onPointerUpBound);

    const hemi = new HemisphericLight("hemi", new Vector3(0.15, 1, 0.35), scene);
    hemi.intensity = 0.78;
    hemi.groundColor = new Color3(0.28, 0.2, 0.36);

    const key = new DirectionalLight("key", new Vector3(0.4, -1.15, -0.8), scene);
    key.position = key.direction.scale(-8);
    key.intensity = 1.45;
    key.shadowMinZ = 1;
    key.shadowMaxZ = 24;

    const rim = new DirectionalLight("rim", new Vector3(-0.6, -0.3, 0.8), scene);
    rim.intensity = 0.55;
    rim.diffuse = new Color3(0.88, 0.72, 1.0);

    const shadows = new ShadowGenerator(1024, key);
    shadows.usePercentageCloserFiltering = true;
    shadows.bias = 0.0005;
    shadows.normalBias = 0.01;
    shadows.darkness = 0.45;

    this.createShadowDisc();
    this.ringRoot = new TransformNode("previewRing", this.scene);
    this.ringRoot.setEnabled(false);
    this.rig = new VpgCharacterRig(scene, manifest, { shadows });
    this.createSkeletonOverlay();

    scene.onBeforeRenderObservable.add(() => this.tick());
    this.engine.runRenderLoop(() => {
      if (!this.disposed) scene.render();
    });

    this.onResizeBound = () => this.engine.resize();
    window.addEventListener("resize", this.onResizeBound);
    this.resizeObserver = new ResizeObserver(this.onResizeBound);
    this.resizeObserver.observe(canvas);
  }

  private createShadowDisc(): void {
    const tex = new DynamicTexture("shadowDiscTex", { width: 256, height: 256 }, this.scene, false);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 256, 256);
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 120);
    grad.addColorStop(0, "rgba(12, 4, 24, 0.62)");
    grad.addColorStop(0.55, "rgba(12, 4, 24, 0.28)");
    grad.addColorStop(1, "rgba(12, 4, 24, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    tex.hasAlpha = true;
    tex.update();

    const mat = new StandardMaterial("shadowDiscMat", this.scene);
    mat.diffuseTexture = tex;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 1, 1);

    this.shadowDisc = CreateGround("shadowDisc", { width: 1.5, height: 1.3 }, this.scene);
    this.shadowDisc.material = mat;
    this.shadowDisc.position.y = 0.003;
    this.shadowDisc.isPickable = false;
  }

  /** Lazily loads `assets/environments/ring/models/ring-standard-2.glb` for the Moves preview booth. */
  private ensurePreviewRing(): Promise<void> {
    if (this.ringContainer) return Promise.resolve();
    if (this.ringLoadPromise) return this.ringLoadPromise;

    const url = resolveModel(RING_MODEL_PATH);
    if (!url) {
      return Promise.resolve();
    }

    this.ringLoadPromise = LoadAssetContainerAsync(url, this.scene, {
      pluginExtension: ".glb",
      pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
    })
      .then((container) => {
        if (this.disposed) {
          container.dispose();
          return;
        }
        this.ringContainer = container;
        container.addAllToScene();

        for (const root of container.rootNodes) {
          root.parent = this.ringRoot;
        }
        this.ringRoot.setEnabled(true);
        this.ringRoot.computeWorldMatrix(true);

        // Align the ring so the mat canvas top sits flush at y = 0 centered at (0, 0, 0) under the wrestler.
        let min = new Vector3(Infinity, Infinity, Infinity);
        let max = new Vector3(-Infinity, -Infinity, -Infinity);
        let foundCanvas = false;
        for (const mesh of container.meshes) {
          mesh.isPickable = false;
          if (!mesh.getTotalVertices()) continue;
          if (mesh.name === "canvas") {
            mesh.receiveShadows = true;
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;
            min = Vector3.Minimize(min, box.minimumWorld);
            max = Vector3.Maximize(max, box.maximumWorld);
            foundCanvas = true;
          }
        }
        if (!foundCanvas) {
          for (const mesh of container.meshes) {
            if (!mesh.getTotalVertices()) continue;
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;
            min = Vector3.Minimize(min, box.minimumWorld);
            max = Vector3.Maximize(max, box.maximumWorld);
          }
        }
        if (Number.isFinite(min.x) && Number.isFinite(max.y)) {
          this.ringRoot.position.set(-(min.x + max.x) * 0.5, -max.y, -(min.z + max.z) * 0.5);
        }

        this.ringRoot.setEnabled(this.state.showRing);
      })
      .catch(() => {
        this.ringLoadPromise = null;
      });

    return this.ringLoadPromise;
  }

  private createSkeletonOverlay(): void {
    const bodyMat = new StandardMaterial("vpgBoneBody", this.scene);
    bodyMat.emissiveColor = new Color3(0.72, 1.0, 0.45);
    bodyMat.diffuseColor = Color3.Black();
    bodyMat.specularColor = Color3.Black();
    bodyMat.disableLighting = true;
    bodyMat.alpha = 0.94;

    const helperMat = new StandardMaterial("vpgBoneHelper", this.scene);
    helperMat.emissiveColor = new Color3(0.35, 0.74, 1.0);
    helperMat.diffuseColor = Color3.Black();
    helperMat.specularColor = Color3.Black();
    helperMat.disableLighting = true;
    helperMat.alpha = 0.65;

    const jointMat = new StandardMaterial("vpgJoint", this.scene);
    jointMat.emissiveColor = new Color3(0.92, 0.82, 1.0);
    jointMat.diffuseColor = Color3.Black();
    jointMat.specularColor = Color3.Black();
    jointMat.disableLighting = true;
    jointMat.alpha = 0.96;

    this.stickBase = CreateCylinder("vpgStick", { height: 1, diameter: 1, tessellation: 8 }, this.scene);
    this.stickBase.material = bodyMat;
    this.stickBase.renderingGroupId = 1;
    this.stickBase.isVisible = false;

    this.helperStickBase = CreateCylinder("vpgHelperStick", { height: 1, diameter: 1, tessellation: 6 }, this.scene);
    this.helperStickBase.material = helperMat;
    this.helperStickBase.renderingGroupId = 1;
    this.helperStickBase.isVisible = false;

    this.jointBase = CreateSphere("vpgJointSphere", { diameter: 1, segments: 6 }, this.scene);
    this.jointBase.material = jointMat;
    this.jointBase.renderingGroupId = 1;
    this.jointBase.isVisible = false;

    this.headMark = CreateTorus("vpgHeadRing", { diameter: 1, thickness: 0.06, tessellation: 28 }, this.scene);
    this.headMark.material = bodyMat;
    this.headMark.renderingGroupId = 1;
    this.headMark.isVisible = false;
    this.headMark.isPickable = false;

    this.sticks = VPG_SKELETON_LINKS.map((link) => {
      const base = link.helper ? this.helperStickBase : this.stickBase;
      const mesh = base.createInstance(`vpgStick_${link.from}_${link.to}`);
      mesh.isPickable = false;
      mesh.isVisible = false;
      return { ...link, mesh };
    });

    this.jointMarks = this.rig.layout.bones.map((bone) => {
      const mesh = this.jointBase.createInstance(`vpgJoint_${bone.name}`);
      mesh.isPickable = false;
      mesh.isVisible = false;
      return { bone: bone.name, helper: isVpgHelperBone(bone.name), mesh };
    });

    this.scene.setRenderingAutoClearDepthStencil(1, true);
  }

  // ------------------------------------------------------------------ character & animation

  async build(recipe: CostumeRecipe, heightScale: number): Promise<CharacterBuildSummary | null> {
    this.rig.setHeightScale(heightScale);
    if (!this.state.showRing) {
      this.camera.target.y = CAMERA_TARGET_Y * this.rig.heightScaleValue;
    }
    this.shadowDisc.scaling.setAll(this.rig.heightScaleValue);

    const summary = await this.rig.build(recipe);
    if (!summary || this.disposed) return null;

    if (summary.rigChanged && this.activeClip) {
      this.applyActiveClip(true);
    } else if (!this.activeClip) {
      this.rig.resetToRestPose();
    }
    return summary;
  }

  setHeightScale(heightScale: number): void {
    this.rig.setHeightScale(heightScale);
    if (!this.state.showRing) {
      this.camera.target.y = CAMERA_TARGET_Y * this.rig.heightScaleValue;
    }
    this.shadowDisc.scaling.setAll(this.rig.heightScaleValue);
  }

  setShowRing(enabled: boolean): void {
    if (this.state.showRing === enabled) return;
    this.state.showRing = enabled;
    if (enabled) void this.ensurePreviewRing();
    this.ringRoot.setEnabled(enabled);
    this.shadowDisc.isVisible = !enabled;
    this.view(enabled ? "ring" : "front", { immediate: false });
  }

  /** Loads and plays a VPG Rig 2.0 clip relative to `public/assets/animations/`, or null for T-Pose. */
  async setAnimation(clipPath: string | null): Promise<void> {
    const token = ++this.clipToken;
    this.activeClipPath = clipPath;
    this.clipError = null;

    if (!clipPath) {
      this.activeGroup?.dispose();
      this.activeGroup = null;
      this.activeClip = null;
      this.loadingClip = false;
      this.rig.resetToRestPose();
      this.emitPlayback();
      return;
    }

    this.loadingClip = true;
    this.emitPlayback();
    try {
      const clip = await this.loadClipAsset(clipPath);
      if (this.disposed || token !== this.clipToken) return;
      this.activeClip = clip;
      this.loadingClip = false;
      this.applyActiveClip(false);
    } catch (err) {
      if (this.disposed || token !== this.clipToken) return;
      this.loadingClip = false;
      this.clipError = err instanceof Error ? err.message : String(err);
      this.emitPlayback();
    }
  }

  replayAnimation(): void {
    const g = this.activeGroup;
    if (!g) return;
    this.state.playing = true;
    g.stop();
    g.start(true, this.state.speed, g.from, g.to);
    this.emitPlayback();
  }

  private loadClipAsset(clipPath: string): Promise<LoadedAsset> {
    let pending = this.clipCache.get(clipPath);
    if (!pending) {
      pending = (async () => {
        const base = import.meta.env.VITE_ASSET_BASE || import.meta.env.BASE_URL;
        const prefix = base.endsWith("/") ? base : `${base}/`;
        const url = prefix + encodePath(ANIM_DIR + clipPath);
        const container = await LoadAssetContainerAsync(url, this.scene, {
          pluginExtension: ".glb",
          pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
        });
        return describeAsset(clipPath, container);
      })().catch((err) => {
        this.clipCache.delete(clipPath);
        throw err;
      });
      this.clipCache.set(clipPath, pending);
    }
    return pending;
  }

  private applyActiveClip(preserveTime: boolean): void {
    const prevFrame = preserveTime && this.activeGroup ? this.activeGroup.getCurrentFrame() : null;
    this.activeGroup?.dispose();
    this.activeGroup = null;
    if (!this.activeClip) {
      this.rig.resetToRestPose();
      this.emitPlayback();
      return;
    }

    const { group, fps } = retarget(this.activeClip, this.rig, this.scene);
    this.activeGroup = group;
    this.activeFps = fps;
    group.start(true, this.state.speed, group.from, group.to);
    if (prevFrame !== null) {
      group.goToFrame(Math.min(Math.max(prevFrame, group.from), group.to));
    }
    if (!this.state.playing) group.pause();
    this.emitPlayback();
  }

  setOption<K extends keyof StageState>(key: K, value: StageState[K]): void {
    this.state[key] = value;
    if (key === "model" || key === "textured") {
      this.rig.setAppearance({ visible: this.state.model, textured: this.state.textured });
    } else if (key === "playing") {
      const g = this.activeGroup;
      if (g) {
        if (this.state.playing) {
          if (!g.isStarted) g.start(true, this.state.speed, g.from, g.to);
          else g.play(true);
        } else {
          g.pause();
        }
      }
      this.emitPlayback();
    } else if (key === "speed") {
      if (this.activeGroup) this.activeGroup.speedRatio = this.state.speed;
    } else if (key === "showRing") {
      if (this.state.showRing) void this.ensurePreviewRing();
      this.ringRoot.setEnabled(this.state.showRing);
      this.shadowDisc.isVisible = !this.state.showRing;
    }
  }

  seek(frame: number): void {
    const g = this.activeGroup;
    if (!g) return;
    if (!g.isStarted) {
      g.start(true, this.state.speed, g.from, g.to);
      g.pause();
    }
    this.state.playing = false;
    g.pause();
    g.goToFrame(Math.min(Math.max(frame, g.from), g.to));
    this.emitPlayback();
  }

  view(preset: StageViewPreset, options: { immediate?: boolean } = {}): void {
    const token = ++this.viewAnimToken;
    if (preset !== "ring") this.state.rotate = false;
    const h = this.rig.heightScaleValue;
    this.rig.rootNode.computeWorldMatrix(true);
    const headNode = this.rig.getBoneNode("Head");
    headNode?.computeWorldMatrix(true);
    const liveHeadY = headNode ? headNode.getAbsolutePosition().y + 0.05 * h : 1.44 * h;
    const targets: Record<StageViewPreset, { alpha: number; beta: number; radius: number; targetY: number }> = {
      front: { alpha: Math.PI / 2, beta: 1.45, radius: 3.55, targetY: CAMERA_TARGET_Y * h },
      side: { alpha: 0, beta: 1.45, radius: 3.55, targetY: CAMERA_TARGET_Y * h },
      back: { alpha: -Math.PI / 2, beta: 1.45, radius: 3.55, targetY: CAMERA_TARGET_Y * h },
      head: { alpha: Math.PI / 2, beta: 1.48, radius: 1.12, targetY: liveHeadY },
      feet: { alpha: Math.PI / 2, beta: 1.38, radius: 2.25, targetY: 0.44 * h },
      ring: { alpha: Math.PI / 2, beta: 1.38, radius: 12.2, targetY: 0.35 },
    };
    const goal = targets[preset];
    if (options.immediate) {
      this.camera.alpha = goal.alpha;
      this.camera.beta = goal.beta;
      this.camera.radius = goal.radius;
      this.camera.target.y = goal.targetY;
      this.syncCameraDataset();
      return;
    }
    const startAlpha = this.camera.alpha;
    let deltaAlpha = (goal.alpha - startAlpha) % (Math.PI * 2);
    if (deltaAlpha > Math.PI) deltaAlpha -= Math.PI * 2;
    if (deltaAlpha < -Math.PI) deltaAlpha += Math.PI * 2;
    const startBeta = this.camera.beta;
    const startRadius = this.camera.radius;
    const startY = this.camera.target.y;
    const began = performance.now();
    const step = () => {
      if (this.disposed || token !== this.viewAnimToken) return;
      const t = Math.min(1, (performance.now() - began) / 320);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.alpha = startAlpha + deltaAlpha * eased;
      this.camera.beta = startBeta + (goal.beta - startBeta) * eased;
      this.camera.radius = startRadius + (goal.radius - startRadius) * eased;
      this.camera.target.y = startY + (goal.targetY - startY) * eased;
      this.syncCameraDataset();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  orbit(deltaAlpha: number, deltaBeta: number): void {
    this.viewAnimToken += 1;
    this.state.rotate = false;
    this.camera.alpha += deltaAlpha;
    this.camera.beta = Math.min(
      Math.max(this.camera.beta + deltaBeta, this.camera.lowerBetaLimit ?? 0.15),
      this.camera.upperBetaLimit ?? Math.PI,
    );
    this.syncCameraDataset();
  }

  zoom(factor: number): void {
    this.viewAnimToken += 1;
    const lower = this.camera.lowerRadiusLimit ?? 0.7;
    const upper = this.camera.upperRadiusLimit ?? 22;
    this.camera.radius = Math.min(Math.max(this.camera.radius * factor, lower), upper);
    this.syncCameraDataset();
  }

  private syncCameraDataset(): void {
    this.canvas.dataset.camAlpha = this.camera.alpha.toFixed(4);
    this.canvas.dataset.camRadius = this.camera.radius.toFixed(4);
  }

  resize(): void {
    this.engine.resize();
  }

  facts(): CharacterFacts {
    return this.rig.facts();
  }

  tilePictures(): readonly SlotTilePreview[] {
    return this.rig.composedTiles;
  }

  async exportGlb(name: string): Promise<Uint8Array> {
    return this.rig.exportGlb(name);
  }

  diagnostics(): VpgRigDiagnostics {
    this.rig.rootNode.computeWorldMatrix(true);
    const pelvis = this.rig.getBoneNode("pelvis");
    const head = this.rig.getBoneNode("Head");
    const foot = this.rig.getBoneNode("foot_l");
    pelvis?.computeWorldMatrix(true);
    head?.computeWorldMatrix(true);
    foot?.computeWorldMatrix(true);
    const bones = this.rig.layout.bones;
    const helperBones = bones.filter((b) => isVpgHelperBone(b.name)).length;
    return {
      rigName: "VPG Rig 2.0",
      totalBones: bones.length,
      deformingBones: bones.length - helperBones,
      helperBones,
      boneNames: bones.map((b) => b.name),
      scale: this.rig.layout.scale,
      soleY: this.rig.layout.soleY,
      heightScale: this.rig.heightScaleValue,
      pelvisWorldY: pelvis ? pelvis.getAbsolutePosition().y : 0,
      headWorldY: head ? head.getAbsolutePosition().y : 0,
      footWorldY: foot ? foot.getAbsolutePosition().y : 0,
    };
  }

  private emitPlayback(): void {
    if (!this.onPlaybackChange || this.disposed) return;
    const g = this.activeGroup;
    this.onPlaybackChange({
      clipPath: this.activeClipPath,
      clipName: g?.name ?? (this.activeClipPath ? this.activeClipPath : "T-Pose (Rest)"),
      playing: Boolean(g?.isPlaying),
      frame: g ? g.getCurrentFrame() : 0,
      from: g?.from ?? 0,
      to: g?.to ?? 0,
      fps: this.activeFps,
      loadingClip: this.loadingClip,
      clipError: this.clipError,
    });
  }

  private lastEmitMs = 0;

  private tick(): void {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    if (this.state.rotate && !this.userTurning) {
      this.camera.alpha += dt * 0.45;
    }

    if (this.activeGroup?.isPlaying) {
      const now = performance.now();
      if (now - this.lastEmitMs > 60) {
        this.lastEmitMs = now;
        this.emitPlayback();
      }
    }

    const showSkel = this.state.skeleton;
    const showHelpers = this.state.showHelpers;
    if (!showSkel) {
      for (const stick of this.sticks) stick.mesh.isVisible = false;
      for (const mark of this.jointMarks) mark.mesh.isVisible = false;
      this.headMark.isVisible = false;
      return;
    }

    this.rig.rootNode.computeWorldMatrix(true);
    const posCache = new Map<string, Vector3>();
    const worldOf = (name: string): Vector3 => {
      let cached = posCache.get(name);
      if (!cached) {
        const node = this.rig.getBoneNode(name);
        if (node) {
          node.computeWorldMatrix(true);
          cached = node.getAbsolutePosition().clone();
        } else {
          cached = Vector3.Zero();
        }
        posCache.set(name, cached);
      }
      return cached;
    };

    const h = this.rig.heightScaleValue;
    const baseThickness = 0.014 * this.state.boneScale * h;

    for (const stick of this.sticks) {
      const visible = showSkel && (!stick.helper || showHelpers);
      stick.mesh.isVisible = visible;
      if (!visible) continue;
      const a = worldOf(stick.from);
      const b = worldOf(stick.to);
      const dir = b.subtract(a);
      const length = dir.length();
      if (length < 1e-4) {
        stick.mesh.isVisible = false;
        continue;
      }
      const isFinger = /index_|middle_|ring_|pinky_|thumb_/.test(stick.to);
      const thickness = baseThickness * (stick.helper ? 0.55 : isFinger ? 0.35 : 1);
      stick.mesh.position.copyFrom(a.add(b).scale(0.5));
      stick.mesh.scaling.set(thickness, length, thickness);
      const normDir = dir.scale(1 / length);
      const axis = Vector3.Cross(Vector3.Up(), normDir);
      const dot = Math.min(1, Math.max(-1, Vector3.Dot(Vector3.Up(), normDir)));
      if (axis.lengthSquared() < 1e-8) {
        stick.mesh.rotationQuaternion =
          dot < 0 ? Quaternion.RotationAxis(Vector3.Right(), Math.PI) : Quaternion.Identity();
      } else {
        stick.mesh.rotationQuaternion = Quaternion.RotationAxis(axis.normalize(), Math.acos(dot));
      }
    }

    for (const mark of this.jointMarks) {
      const visible = showSkel && (!mark.helper || showHelpers);
      mark.mesh.isVisible = visible;
      if (!visible) continue;
      const isFinger = /index_|middle_|ring_|pinky_|thumb_/.test(mark.bone);
      mark.mesh.position.copyFrom(worldOf(mark.bone));
      mark.mesh.scaling.setAll(baseThickness * (isFinger ? 0.7 : 1.75));
    }

    const headNode = this.rig.getBoneNode("Head");
    this.headMark.isVisible = showSkel && Boolean(headNode);
    if (showSkel && headNode) {
      const headPos = worldOf("Head");
      this.headMark.position.set(headPos.x, headPos.y + 0.09 * h, headPos.z);
      this.headMark.scaling.setAll(0.2 * h);
      this.headMark.rotationQuaternion = Quaternion.FromEulerAngles(Math.PI / 2, -this.camera.alpha + Math.PI / 2, 0);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clipToken += 1;
    this.viewAnimToken += 1;
    this.activeGroup?.dispose();
    this.activeGroup = null;
    for (const pending of this.clipCache.values()) {
      void pending.then((asset) => asset.container.dispose()).catch(() => {});
    }
    this.clipCache.clear();
    this.ringContainer?.dispose();
    this.ringContainer = null;
    this.rig.dispose();
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onResizeBound);
    this.canvas.removeEventListener("pointerdown", this.onPointerDownBound);
    window.removeEventListener("pointerup", this.onPointerUpBound);
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
