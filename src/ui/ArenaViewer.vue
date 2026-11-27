<!--
  Arena Viewer styled with the reusable Configuration Menus design system
  (`docs/ui/configuration-menus.md`). Shows every arena (bundled and saved in
  this browser) with its preview art in the purple wireframe booth; choosing
  one opens it in a full-viewport orbiting Babylon scene. MainMenu loads this
  component on demand so Babylon stays out of the menu's chunk.
-->
<template>
  <ConfigScreenShell
    aria-label="Arena Viewer"
    :screen-class="sceneOpen ? 'viewer viewer--scene' : 'viewer'"
    :toast-message="status"
    :toast-error="Boolean(status)"
  >
    <canvas ref="canvas" class="viewer__canvas" :data-active="sceneOpen" />

    <!-- Selection UI, hidden once an arena is on screen. -->
    <template v-if="!sceneOpen">
      <ConfigPreviewBooth layout="framed-rail" :center-x="680">
        <div class="stage-canvas preview-stage">
          <div class="preview">
            <img
              v-if="previewUrl"
              class="preview__image"
              :src="previewUrl"
              :alt="`${selected?.displayName} preview`"
            />
            <div v-else class="preview__empty">No preview</div>
          </div>
        </div>

        <template v-if="selected" #hud-bottom>
          <span class="booth-pill booth-pill--name">{{ selected.displayName }}</span>
          <span class="booth-pill">{{ selected.id }}</span>
          <span class="booth-pill booth-pill--dim">{{ selected.custom ? "CUSTOM" : "BUNDLED" }}</span>
        </template>
      </ConfigPreviewBooth>

      <ConfigBreadcrumbHeader
        top="COMMISSIONER"
        second="Arena Viewer"
        back-label="BACK"
        @back="exitViewer"
      />

      <aside class="select-rail" aria-label="Arenas">
        <p class="rail-meta">{{ arenas.length }} ARENAS</p>
        <ul class="rows">
          <li
            v-for="(arena, index) in arenas"
            :key="arena.id"
            class="row"
            :class="{ 'row--active': index === cursor }"
            @click="choose(index)"
            @mouseenter="cursor = index"
          >
            <span class="row__name">{{ arena.displayName }}</span>
            <span v-if="arena.custom" class="row__tag">Custom</span>
          </li>
          <li
            class="row row--back"
            :class="{ 'row--active': cursor === backIndex }"
            @click="choose(backIndex)"
            @mouseenter="cursor = backIndex"
          >
            <span class="row__name">&larr; Back</span>
          </li>
        </ul>
      </aside>

      <ConfigControllerBar :hints="selectControllerHints" />
    </template>

    <!-- Overlay while a 3D arena scene is open. -->
    <template v-else>
      <!-- Live camera readout; polled because mouse drags move it too. -->
      <dl v-if="view" class="position">
        <dt>Pos</dt>
        <dd>{{ formatVec(view.position) }}</dd>
        <dt>Target</dt>
        <dd>{{ formatVec(view.target) }}</dd>
        <dt>Orbit</dt>
        <dd>
          &alpha; {{ degrees(view.alpha) }}&deg; &middot; &beta; {{ degrees(view.beta) }}&deg; &middot; r
          {{ view.radius.toFixed(2) }}
        </dd>
      </dl>

      <div class="hud">
        <span class="hud__name">{{ selected?.displayName }}</span>
        <span class="hud__keys">
          <kbd>{{ keyFor("controlStickUp") }}</kbd><kbd>{{ keyFor("controlStickLeft") }}</kbd><kbd>{{ keyFor("controlStickDown") }}</kbd><kbd>{{ keyFor("controlStickRight") }}</kbd>
          rotate &middot; <kbd>{{ keyFor("cUp") }}</kbd>/<kbd>{{ keyFor("cDown") }}</kbd> zoom &middot; mouse drag/scroll &middot;
          <kbd>{{ keyFor("b") }}</kbd> close
        </span>
        <ConfigMenuBar variant="back" class="hud__close" @click="onCloseClick">Close</ConfigMenuBar>
        <span v-if="warnings.length" class="hud__warning">{{ warnings.join(" / ") }}</span>
      </div>

      <ConfigControllerBar :hints="sceneControllerHints" />
    </template>

    <div v-if="loading" class="loading">
      <span class="loading__pill">Loading Arena&hellip;</span>
    </div>
  </ConfigScreenShell>
</template>

<script lang="ts">
import { defineComponent, markRaw } from "vue";
import { type ArenaSummary, arenaById, availableArenas } from "@/content/arenas";
import { type PadControl, describeBinding, keysForControl } from "@/input/controls";
import {
  type VirtualInput,
  isInteractivePointerTarget,
  isMenuDown,
  isMenuUp,
  pollGamepadBindings,
  virtualInputFor,
  virtualInputForBinding,
} from "@/input/VirtualController";
import { playMenuCue } from "@/audio/menuAudio";
import { ArenaScene, CAMERA_INPUTS, type CameraState } from "@/render/arena/ArenaScene";
import { acquireImageUrls, textureValues } from "@/save/imageUrls";
import type { ControllerHintItem } from "@/ui/controllerIcons";
import {
  ConfigBreadcrumbHeader,
  ConfigControllerBar,
  ConfigMenuBar,
  ConfigPreviewBooth,
  ConfigScreenShell,
} from "@/ui/configuration-menus";

const SELECT_CONTROLLER_HINTS: readonly ControllerHintItem[] = [
  { icons: ["dPad"], label: "MOVE" },
  { icons: ["a"], label: "VIEW" },
  { icons: ["b"], label: "BACK" },
];

const SCENE_CONTROLLER_HINTS: readonly ControllerHintItem[] = [
  { icons: ["stick"], label: "ROTATE" },
  { icons: ["c"], label: "ZOOM" },
  { icons: ["b"], label: "CLOSE" },
];

export default defineComponent({
  name: "ArenaViewer",

  components: {
    ConfigBreadcrumbHeader,
    ConfigControllerBar,
    ConfigMenuBar,
    ConfigPreviewBooth,
    ConfigScreenShell,
  },

  emits: ["back"],

  data() {
    return {
      cursor: 0,
      sceneOpen: false,
      loading: false,
      status: "",
      warnings: [] as string[],
      // markRaw keeps Vue from proxying the Babylon scene graph, which would
      // be slow and subtly break engine internals.
      scene: null as ArenaScene | null,
      /** Guards against an older load finishing after a newer one. */
      loadToken: 0,
      /** The camera as of the last readout poll. */
      view: null as CameraState | null,
      viewTimer: 0,
      stopGamepadPolling: null as (() => void) | null,
      selectControllerHints: SELECT_CONTROLLER_HINTS,
      sceneControllerHints: SCENE_CONTROLLER_HINTS,
    };
  },

  computed: {
    arenas(): ArenaSummary[] {
      return availableArenas();
    },

    /** The Back row sits after the arenas. */
    backIndex(): number {
      return this.arenas.length;
    },

    selected(): ArenaSummary | null {
      return this.arenas[this.cursor] ?? null;
    },

    previewUrl(): string | null {
      return this.selected?.previewUrl ?? null;
    },
  },

  mounted() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("pointerdown", this.onPointerDown);
    // A held stick keeps orbiting, as a held key does.
    this.stopGamepadPolling = pollGamepadBindings(this.onGamepadBinding, {
      repeat: (binding) => CAMERA_INPUTS.includes(virtualInputForBinding(binding) ?? ""),
      repeatDelay: 120,
      repeatInterval: 30,
    });
    // A few updates a second is plenty to read, and keeps Vue out of the render loop.
    this.viewTimer = window.setInterval(this.pollView, 100);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("pointerdown", this.onPointerDown);
    this.stopGamepadPolling?.();
    window.clearInterval(this.viewTimer);
    this.loadToken += 1;
    this.scene?.dispose();
    this.scene = null;
  },

  methods: {
    keyFor(control: PadControl): string {
      const [binding] = keysForControl(control);
      return binding ? describeBinding(binding) : "unbound";
    },

    exitViewer() {
      playMenuCue("back");
      this.$emit("back");
    },

    onKeyDown(event: KeyboardEvent) {
      const input = virtualInputFor(event);
      if (!input) return;
      event.preventDefault();
      this.onMappedInput(input);
    },

    onPointerDown(event: PointerEvent) {
      if (isInteractivePointerTarget(event)) return;
      const input = virtualInputFor(event);
      if (!input) return;
      event.preventDefault();
      this.onMappedInput(input);
    },

    onGamepadBinding(binding: string, repeat = false) {
      const input = virtualInputForBinding(binding);
      // Only the camera repeats; a repeat never reaches the menu.
      if (input && (!repeat || (this.sceneOpen && CAMERA_INPUTS.includes(input)))) this.onMappedInput(input);
    },

    onMappedInput(input: VirtualInput) {
      if (this.sceneOpen) {
        if (input === "b") {
          playMenuCue("back");
          return this.closeScene();
        }
        if (CAMERA_INPUTS.includes(input)) this.scene?.moveCamera(input);
        return;
      }

      if (isMenuUp(input)) return this.move(-1);
      if (isMenuDown(input)) return this.move(1);
      if (input === "a") return this.choose(this.cursor);
      if (input === "b") return this.exitViewer();
      // Left and right stay inert, as they are in the menus.
    },

    pollView() {
      this.view = this.sceneOpen ? (this.scene?.cameraState() ?? null) : null;
    },

    formatVec(v: { x: number; y: number; z: number }): string {
      return [v.x, v.y, v.z].map((n) => n.toFixed(2)).join(", ");
    },

    degrees(radians: number): string {
      return ((radians * 180) / Math.PI).toFixed(1);
    },

    move(delta: number) {
      // The arenas plus the Back row.
      const count = this.arenas.length + 1;
      this.cursor = (this.cursor + delta + count) % count;
      this.status = "";
      playMenuCue("move");
      this.$nextTick(() => this.$el?.querySelector?.(".row--active")?.scrollIntoView({ block: "nearest" }));
    },

    choose(index: number) {
      this.cursor = index;
      if (index === this.backIndex) {
        return this.exitViewer();
      }
      const arena = this.arenas[index];
      if (!arena) return;
      playMenuCue("select");
      void this.open(arena.id);
    },

    async open(arenaId: string) {
      const token = ++this.loadToken;
      this.loading = true;
      this.status = "";
      this.warnings = [];
      // Shown before loading so the canvas has its full size when the engine
      // measures it; a hidden canvas would come back with a zero viewport.
      this.sceneOpen = true;
      await this.$nextTick();

      try {
        const arena = arenaById(arenaId);
        if (!arena) throw new Error(`No arena data for "${arenaId}"`);
        if (!this.scene) this.scene = markRaw(new ArenaScene(this.$refs.canvas as HTMLCanvasElement));
        const lease = await acquireImageUrls(textureValues(arena));
        if (token !== this.loadToken || !this.scene) {
          lease.release();
          return;
        }
        const report = await this.scene.load(arena, lease);
        if (token !== this.loadToken) return;
        this.warnings = report.warnings;
      } catch (error) {
        if (token !== this.loadToken) return;
        this.closeScene();
        this.status = `Could not load ${arenaId}: ${error instanceof Error ? error.message : String(error)}`;
        playMenuCue("deny");
      } finally {
        if (token === this.loadToken) this.loading = false;
      }
    },

    onCloseClick() {
      playMenuCue("back");
      this.closeScene();
    },

    closeScene() {
      // Invalidates any load still in flight.
      this.loadToken += 1;
      this.scene?.dispose();
      this.scene = null;
      this.sceneOpen = false;
      this.loading = false;
      this.warnings = [];
    },
  },
});
</script>

<style scoped>
.viewer__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
  touch-action: none;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: 0;
  background: #070914;
}

.viewer__canvas[data-active="true"] {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  z-index: 5;
}

/* ----------------------------------------------------------- Booth Preview Art */

.preview-stage {
  display: grid;
  place-items: center;
  padding: 1.5rem 2.2rem 2.8rem;
  box-sizing: border-box;
}

.preview {
  width: min(100%, 34rem);
  border: 4px solid var(--vpg-cfg-frame-border);
  background: rgba(12, 8, 30, 0.9);
  box-shadow: 0 0 28px rgba(176, 118, 255, 0.35), 0 12px 28px rgba(4, 2, 14, 0.65);
}

.preview__image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
}

.preview__empty {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  color: #b4a2d6;
  font-family: var(--vpg-font-pixel);
  font-size: 0.95rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.booth-pill {
  padding: 0.14rem 0.44rem;
  background: rgba(12, 8, 30, 0.82);
  border: 1px solid rgba(208, 172, 255, 0.45);
  color: #e6d4ff;
  font-family: var(--vpg-font-pixel);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.booth-pill--name {
  border-color: rgba(182, 255, 116, 0.55);
  color: #c2ff7e;
}

.booth-pill--dim {
  color: #b4a2d6;
  border-color: rgba(208, 172, 255, 0.25);
}

/* ----------------------------------------------------------- Left Selection Rail */

.select-rail {
  position: absolute;
  top: 19.2%;
  bottom: 6.2%;
  left: 3.4%;
  width: clamp(18.5rem, 33.5vw, 27.5rem);
  display: flex;
  flex-direction: column;
  gap: 0.34rem;
  min-height: 0;
  z-index: 8;
  font-family: var(--vpg-font-pixel);
}

.rail-meta {
  margin: 0 0.55rem 0 0.15rem;
  padding: 0.24rem 0.65rem;
  background: var(--vpg-cfg-panel-bg);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
  color: var(--vpg-cfg-accent-lime);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.24rem;
  margin: 0;
  padding: 0.12rem 0.55rem 0.25rem 0.15rem;
  list-style: none;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--vpg-cfg-frame-border) rgba(15, 22, 46, 0.55);
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  min-height: 2.2rem;
  padding: 0.22rem 0.8rem;
  background: var(--vpg-cfg-bar-idle);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.9rem;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-shadow: 1px 1px 0 rgba(7, 14, 34, 0.85);
  -webkit-font-smoothing: none;
  cursor: pointer;
  user-select: none;
  transition: transform 90ms ease, background 90ms ease, color 90ms ease;
}

.row:hover {
  filter: brightness(1.08);
}

.row--back {
  margin-top: 0.28rem;
  justify-content: center;
}

.row--back .row__name {
  flex: 0 1 auto;
}

.row--active {
  background: var(--vpg-cfg-bar-active);
  color: var(--vpg-cfg-text-active);
  text-shadow: none;
  transform: scaleX(1.035);
  box-shadow: 0 0 16px rgba(204, 168, 255, 0.55);
  z-index: 4;
}

.row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__tag {
  padding: 0.1rem 0.42rem;
  border: 1px solid rgba(182, 255, 116, 0.65);
  background: rgba(12, 18, 40, 0.72);
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-pixel);
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: none;
  flex-shrink: 0;
}

.row--active .row__tag {
  border-color: var(--vpg-cfg-text-active);
  background: rgba(14, 7, 26, 0.14);
  color: var(--vpg-cfg-text-active);
}

/* ----------------------------------------------------------- 3D Scene HUD & Telemetry */

.position {
  position: absolute;
  top: 0.85rem;
  left: 0.95rem;
  z-index: 12;
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.18rem 0.65rem;
  margin: 0;
  padding: 0.5rem 0.75rem;
  background: var(--vpg-cfg-panel-bg);
  border: 1px solid rgba(204, 168, 255, 0.45);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
  color: #e6d4ff;
  font-family: var(--vpg-font-pixel);
  font-size: 0.78rem;
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.position dt {
  color: var(--vpg-cfg-accent-lime);
  text-transform: uppercase;
}

.position dd {
  margin: 0;
  color: var(--vpg-cfg-text);
}

.hud {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2.35rem;
  z-index: 12;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.65rem 1.25rem;
  background: linear-gradient(transparent, rgba(7, 9, 20, 0.86));
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  letter-spacing: 0.05em;
  pointer-events: none;
}

.hud__name {
  padding: 0.22rem 0.62rem;
  background: rgba(12, 8, 30, 0.88);
  border: 1px solid rgba(182, 255, 116, 0.6);
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-display);
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hud__keys {
  flex: 1;
  color: #d6e4ff;
  text-transform: uppercase;
  text-shadow: 1px 1px 0 rgba(5, 8, 18, 0.92);
}

.hud__close {
  pointer-events: auto;
  width: auto;
  min-width: 7.2rem;
  min-height: 2.25rem;
}

.hud__warning {
  flex-basis: 100%;
  padding: 0.28rem 0.6rem;
  background: rgba(42, 10, 20, 0.88);
  border-left: 3px solid var(--vpg-cfg-accent-amber);
  color: var(--vpg-cfg-accent-amber);
}

.loading {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: grid;
  place-items: center;
  background: rgba(7, 5, 18, 0.62);
  pointer-events: none;
}

.loading__pill {
  padding: 0.55rem 1.15rem;
  background: var(--vpg-cfg-modal-bg);
  border: 3px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 24px var(--vpg-cfg-frame-glow);
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-display);
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

kbd {
  display: inline-block;
  min-width: 1.3rem;
  margin: 0 0.08rem;
  padding: 0.08rem 0.34rem;
  border: 1px solid rgba(204, 168, 255, 0.55);
  background: rgba(16, 22, 52, 0.88);
  color: #f4f8ff;
  font-family: var(--vpg-font-pixel);
  font-size: 0.74rem;
  text-align: center;
}

@media (max-width: 760px) {
  .select-rail {
    top: 46%;
    bottom: 2.8rem;
    left: 1rem;
    right: 1rem;
    width: auto;
  }

  .preview-stage {
    padding: 0.75rem 1rem 2.4rem;
  }
}
</style>
