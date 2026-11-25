import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { ANIM_DIR, CHAR_DIR, dirName, encodePath, naturalSort, resolveAssets } from "@/content/animationLibrary";
import { loadBundledWrestler, loadCreatorManifest } from "@/content/characterCatalog";
import { CharacterLookBook, heightScaleFor } from "@/content/characterLook";
import { savedBundledEdit, savedCreatedById, savedCustomCharactersForViewer } from "@/save/characterStore";
import { VpgCharacterRig } from "@/render/character/VpgCharacterRig";
import { describeAsset, retarget, type LoadedAsset, type RigTarget } from "./retarget";
import { CAMERA_HOME, createViewer } from "./scene";

const DEFAULT_CLIP = "shared/standing/stances/standing-movement-style-0.glb";
export const CUSTOM_CHARACTER_PREFIX = "custom:";

/** Everything the viewer can show, sorted. Clip paths are relative to ANIM_DIR. */
export interface ViewerCatalog {
  characters: string[];
  /** Friendly labels for custom created characters (keyed by entry in `characters`). */
  characterLabels: Map<string, string>;
  clips: string[];
  /** Folder path -> the clips directly inside it, in folder order. */
  folders: Map<string, string[]>;
  /** The character and clip picked on start-up (from the URL hash, or the defaults). */
  startCharacter: string;
  startClip: string;
}

/** What the screen needs to draw. Sent whenever it changes, including every frame while a clip plays. */
export interface ViewerState {
  status: string;
  error: boolean;
  /** Character file name within CHAR_DIR, once loaded. */
  character: string | null;
  /** Clip path within ANIM_DIR, once loaded. */
  clip: string | null;
  /** Display name of the playing clip. */
  clipName: string;
  hasClip: boolean;
  playing: boolean;
  frame: number;
  from: number;
  to: number;
  fps: number;
}

export interface PlaybackOptions {
  speed: number;
  loop: boolean;
  follow: boolean;
}

export interface AnimationViewerHandle {
  /** Resolves with the catalog once the file lists are in, or null when they could not be read. */
  ready: Promise<ViewerCatalog | null>;
  /** Swaps the character, keeping the clip, its time and its play/pause state. */
  loadCharacter(file: string): void;
  loadClip(path: string): void;
  togglePlay(): void;
  /** Pauses and moves by whole 30 fps frames. */
  stepFrame(delta: number): void;
  /** Pauses on a frame, for the timeline. */
  seek(frame: number): void;
  setSpeed(speed: number): void;
  setLoop(loop: boolean): void;
  setFollow(follow: boolean): void;
  /** Orbits the camera, in radians. */
  orbit(alpha: number, beta: number): void;
  /** Scales the camera distance; below 1 moves in. */
  zoom(factor: number): void;
  dispose(): void;
}

interface ClipTime {
  frame: number;
  playing: boolean;
}

/**
 * Runs the animation viewer on `canvas`. The viewer owns the Babylon scene and
 * playback only: all of its UI, and all input apart from the mouse orbiting the
 * camera, belongs to the screen that hosts it (AnimationViewer.vue).
 */
export function startAnimationViewer(
  canvas: HTMLCanvasElement,
  onState: (state: ViewerState) => void,
  options: PlaybackOptions,
): AnimationViewerHandle {
  const playback = { ...options };
  const state = {
    disposed: false,
    assetBase: "",
    char: null as LoadedAsset | null,
    customChar: null as { path: string; rig: VpgCharacterRig } | null,
    clip: null as LoadedAsset | null,
    group: null as AnimationGroup | null,     // retargeted clip playing on the character
    fps: 60,
    clipFrame: null as ClipTime | null,       // carried across a character switch
  };
  const activeRig = (): RigTarget | null => state.customChar?.rig ?? state.char;
  const activeCharPath = (): string | null => state.customChar?.path ?? state.char?.path ?? null;
  const view: ViewerState = {
    status: "Starting…",
    error: false,
    character: null,
    clip: null,
    clipName: "",
    hasClip: false,
    playing: false,
    frame: 0,
    from: 0,
    to: 0,
    fps: 60,
  };

  const viewer = createViewer(canvas);
  const { scene, camera, shadows } = viewer;
  // The pad's bindings drive the camera instead (C buttons); Babylon's own arrow
  // keys would otherwise spin it while the menu cursor moves.
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

  function emit() {
    if (state.disposed) return;
    const g = state.group;
    view.character = activeCharPath();
    view.clip = state.clip?.path ?? null;
    view.hasClip = !!g;
    view.clipName = g?.name ?? "";
    view.playing = !!g?.isPlaying;
    view.frame = g ? g.getCurrentFrame() : 0;
    view.from = g?.from ?? 0;
    view.to = g?.to ?? 0;
    view.fps = state.fps;
    onState({ ...view });
  }

  function setStatus(text: string, isError = false) {
    view.status = text;
    view.error = isError;
    emit();
  }

  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const loadContainer = (path: string) => viewer.loadContainer(state.assetBase + encodePath(path));

  function applyClip() {
    state.group?.dispose();
    state.group = null;
    const rig = activeRig();
    if (!rig || !state.clip) return emit();

    const { group, fps } = retarget(state.clip, rig, scene);
    state.group = group;
    state.fps = fps;
    group.onAnimationGroupEndObservable.add(emit);
    group.start(playback.loop, playback.speed, group.from, group.to);
    emit();
  }

  // -------------------------------------------------------------- loading

  let charToken = 0;
  async function loadCharacter(file: string) {
    const token = ++charToken;
    setStatus(`Loading character ${file}…`);
    try {
      if (file.startsWith(CUSTOM_CHARACTER_PREFIX)) {
        const id = file.slice(CUSTOM_CHARACTER_PREFIX.length);
        const manifest = await loadCreatorManifest();
        const created = savedCreatedById(id);
        let doc = created;
        if (!doc) {
          const bundled = await loadBundledWrestler(id);
          const edit = savedBundledEdit(id);
          doc = edit ? { ...structuredClone(bundled), profile: edit.profile, look: edit.look } : structuredClone(bundled);
        }
        const look = new CharacterLookBook(manifest);
        const costume = look.normalise(structuredClone(doc.look.costumes[0]));
        const recipe = look.recipe(costume, { entrance: false });
        const rig = new VpgCharacterRig(scene, manifest, { shadows });
        rig.setHeightScale(heightScaleFor(doc.profile.heightRaw ?? 13));
        const built = await rig.build(recipe);
        if (state.disposed || token !== charToken || !built) {
          rig.dispose();
          return;
        }
        state.group?.dispose();
        state.group = null;
        state.char?.container.dispose();
        state.char = null;
        state.customChar?.rig.dispose();
        state.customChar = { path: file, rig };
      } else {
        const container = await loadContainer(CHAR_DIR + file);
        if (state.disposed || token !== charToken) return container.dispose();
        const char = describeAsset(file, container);
        state.group?.dispose();
        state.group = null;
        state.customChar?.rig.dispose();
        state.customChar = null;
        state.char?.container.dispose();
        container.addAllToScene();
        for (const mesh of container.meshes) {
          if (mesh.getTotalVertices() > 0) shadows.addShadowCaster(mesh, false);
        }
        state.char = char;
      }
      const carried = state.clipFrame;
      state.clipFrame = null;
      applyClip();
      if (carried) restoreTime(carried);
      setStatus(describe());
    } catch (err) {
      if (!state.disposed && token === charToken) setStatus(`Couldn't load ${file}: ${errorText(err)}`, true);
    }
    saveHash();
  }

  let clipToken = 0;
  async function loadClip(path: string) {
    const token = ++clipToken;
    setStatus(`Loading ${path}…`);
    try {
      const container = await loadContainer(ANIM_DIR + path);
      if (state.disposed || token !== clipToken) return container.dispose();
      state.clip?.container.dispose();
      state.clip = describeAsset(path, container);
      applyClip();
      setStatus(describe());
    } catch (err) {
      if (!state.disposed && token === clipToken) setStatus(`Couldn't load ${path}: ${errorText(err)}`, true);
    }
    saveHash();
  }

  function restoreTime({ frame, playing }: ClipTime) {
    const g = state.group;
    if (!g) return;
    g.goToFrame(Math.min(Math.max(frame, g.from), g.to));
    if (!playing) g.pause();
    emit();
  }

  function describe() {
    const charPath = activeCharPath();
    if (!state.clip) return charPath ? `${charPath} loaded` : "";
    const g = state.group;
    const secs = g ? ((g.to - g.from) / state.fps).toFixed(2) : "?";
    return `${ANIM_DIR}${state.clip.path} · ${secs}s` + (state.assetBase ? ` · from ${new URL(state.assetBase, location.href).host}` : "");
  }

  // -------------------------------------------------------------- transport

  /** Starts a group that was never started (or was stopped) in a paused state, so it can be posed. */
  function ensureStarted(g: AnimationGroup) {
    if (!g.isStarted) {
      g.start(playback.loop, playback.speed, g.from, g.to);
      g.pause();
    }
  }

  function togglePlay() {
    const g = state.group;
    if (!g) return;
    if (g.isPlaying) g.pause();
    else if (!g.isStarted || (!playback.loop && g.getCurrentFrame() >= g.to)) {
      g.stop();
      g.start(playback.loop, playback.speed, g.from, g.to);
    } else g.play(playback.loop);
    emit();
  }

  function seek(frame: number) {
    const g = state.group;
    if (!g) return;
    ensureStarted(g);
    g.pause();
    g.goToFrame(Math.min(Math.max(frame, g.from), g.to));
    emit();
  }

  function stepFrame(delta: number) {
    const g = state.group;
    if (!g) return;
    // Clips are authored at 30 fps; one step is one authored frame whatever the file's tick rate.
    const step = state.fps / 30;
    const current = Math.round((g.getCurrentFrame() - g.from) / step);
    const count = Math.round((g.to - g.from) / step);
    let next = current + delta;
    if (next < 0) next = count;          // wrap, so the pose loops like the clip
    else if (next > count) next = 0;
    seek(g.from + next * step);
  }

  // -------------------------------------------------------------- URL hash (bookmarkable)

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    return { character: p.get("character"), animation: p.get("animation") };
  }

  function saveHash() {
    if (state.disposed) return;
    const p = new URLSearchParams();
    const charPath = activeCharPath();
    if (charPath) p.set("character", charPath);
    if (state.clip) p.set("animation", state.clip.path);
    history.replaceState(null, "", "#" + p.toString().replace(/%2F/g, "/"));
  }

  // -------------------------------------------------------------- per-frame updates

  const followTarget = new Vector3();
  scene.onBeforeRenderObservable.add(() => {
    const pelvis = activeRig()?.nodes.get("pelvis");
    if (playback.follow && pelvis && state.group) {
      const p = pelvis.getAbsolutePosition();
      followTarget.set(p.x, CAMERA_HOME.y, p.z);
      Vector3.LerpToRef(camera.target, followTarget, 0.08, camera.target);
    }
    if (state.group?.isPlaying) emit();
  });

  // -------------------------------------------------------------- start up

  async function init(): Promise<ViewerCatalog | null> {
    setStatus("Indexing animations…");
    let listing;
    try {
      listing = await resolveAssets();
    } catch (err) {
      setStatus(`Couldn't list the animation files: ${errorText(err)}.`, true);
      return null;
    }
    if (state.disposed) return null;
    state.assetBase = listing.assetBase;
    const folders = new Map<string, string[]>();
    for (const p of listing.animations) {
      const d = dirName(p);
      const list = folders.get(d);
      if (list) list.push(p);
      else folders.set(d, [p]);
    }

    const want = readHash();
    const characterLabels = new Map<string, string>();
    const customEntries = savedCustomCharactersForViewer();
    const customKeys: string[] = [];
    for (const item of customEntries) {
      const key = `${CUSTOM_CHARACTER_PREFIX}${item.id}`;
      customKeys.push(key);
      characterLabels.set(key, `${item.name} (${item.custom ? "Custom" : "Edited"})`);
    }
    const characters = [...listing.characters, ...customKeys];
    const clips = listing.animations;
    const startCharacter = want.character && characters.includes(want.character) ? want.character
      : listing.characters.find((f) => /mannequin/i.test(f)) ?? characters[0];
    const startClip = [want.animation, DEFAULT_CLIP].find((p): p is string => !!p && clips.includes(p)) ?? clips[0];

    // Character first, then the clip, so the clip retargets onto it straight away.
    void loadCharacter(startCharacter).then(() => {
      if (!state.disposed) void loadClip(startClip);
    });

    return {
      characters,
      characterLabels,
      clips,
      folders: new Map([...folders].sort(([a], [b]) => naturalSort(a, b))),
      startCharacter,
      startClip,
    };
  }

  return {
    ready: init(),
    loadCharacter(file) {
      state.clipFrame = state.group ? { frame: state.group.getCurrentFrame(), playing: state.group.isPlaying } : null;
      void loadCharacter(file);
    },
    loadClip(path) {
      void loadClip(path);
    },
    togglePlay,
    stepFrame,
    seek,
    setSpeed(speed) {
      playback.speed = speed;
      if (state.group) state.group.speedRatio = speed;
    },
    setLoop(loop) {
      playback.loop = loop;
      if (state.group) state.group.loopAnimation = loop;
    },
    setFollow(follow) {
      playback.follow = follow;
      if (!follow) camera.target.copyFrom(CAMERA_HOME);
    },
    orbit(alpha, beta) {
      camera.alpha += alpha;
      camera.beta = Math.min(Math.max(camera.beta + beta, 0.1), camera.upperBetaLimit ?? Math.PI);
    },
    zoom(factor) {
      const lower = camera.lowerRadiusLimit ?? 0.1;
      const upper = camera.upperRadiusLimit ?? 100;
      camera.radius = Math.min(Math.max(camera.radius * factor, lower), upper);
    },
    dispose() {
      state.disposed = true;
      state.customChar?.rig.dispose();
      state.customChar = null;
      viewer.dispose();
      // Back on the menu, the URL no longer points at a clip.
      history.replaceState(null, "", location.pathname + location.search);
    },
  };
}
