import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
// The .pure module only defines the enum; the glTF loader itself is registered lazily.
import { GLTFLoaderAnimationStartMode } from "@babylonjs/loaders/glTF/glTFFileLoader.pure";
import "../registerLoaders";

// Side-effect imports: features the scene uses that the classes above don't pull in themselves.
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Animations/animatable";

export const CAMERA_HOME = new Vector3(0, 0.9, 0);
const BG = Color3.FromHexString("#15171c");
const GROUND_SIZE = 40;

export interface Viewer {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  shadows: ShadowGenerator;
  loadContainer(url: string): Promise<AssetContainer>;
  /** Stops rendering and frees the engine, scene and GPU resources. */
  dispose(): void;
}

export function createViewer(canvas: HTMLCanvasElement): Viewer {
  const engine = new Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene(engine);
  scene.clearColor = BG.toColor4(1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = BG;
  scene.fogStart = 8;
  scene.fogEnd = 20;

  const camera = new ArcRotateCamera("camera", Math.PI / 2, 1.25, 4.4, CAMERA_HOME.clone(), scene);
  camera.attachControl(canvas, true);
  camera.minZ = 0.05;
  camera.lowerRadiusLimit = 0.8;
  camera.upperRadiusLimit = 25;
  camera.wheelDeltaPercentage = 0.01;
  camera.pinchDeltaPercentage = 0.01;
  camera.upperBetaLimit = Math.PI / 2 + 0.3;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.6;
  hemi.groundColor = new Color3(0.25, 0.25, 0.3);

  // Key light from in front, above and to one side, so the shadow falls behind the character where the camera sees it.
  const sun = new DirectionalLight("sun", new Vector3(0.5, -1.4, -0.7), scene);
  sun.position = sun.direction.scale(-10);
  sun.intensity = 1.8;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 30;

  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.0005;
  shadows.normalBias = 0.01;
  shadows.darkness = 0.35;

  createGround(scene);

  engine.runRenderLoop(() => scene.render());
  const resize = () => engine.resize();
  window.addEventListener("resize", resize);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    engine,
    scene,
    camera,
    shadows,
    dispose() {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      engine.dispose();
    },
    loadContainer: (url) =>
      LoadAssetContainerAsync(url, scene, {
        pluginExtension: ".glb",
        // Don't auto-play: we read each file's rest pose straight after loading.
        pluginOptions: { gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE } },
      }),
  };
}

// 1 m grid as a tiled texture (mipmapped, so it stays clean at grazing angles and fades into the fog).
function createGround(scene: Scene) {
  const gridTex = new DynamicTexture("gridTex", { width: 256, height: 256 }, scene, true);
  const ctx = gridTex.getContext();
  ctx.fillStyle = "#2a2e37";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#454b59";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 256, 256);
  gridTex.update();
  gridTex.wrapU = gridTex.wrapV = Texture.WRAP_ADDRESSMODE;
  gridTex.uScale = gridTex.vScale = GROUND_SIZE;
  gridTex.anisotropicFilteringLevel = 16;

  const ground = CreateGround("ground", { width: GROUND_SIZE, height: GROUND_SIZE }, scene);
  const groundMat = new StandardMaterial("groundMat", scene);
  groundMat.diffuseTexture = gridTex;
  groundMat.diffuseColor = new Color3(0.45, 0.45, 0.45);
  groundMat.specularColor = Color3.Black();
  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.isPickable = false;
}
