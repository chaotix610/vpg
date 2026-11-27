<!-- Vue presentation module. Teaching focus: how reactive screen state calls domain stores and presents results without owning gameplay rules. File: src/ui/ControlMapper.vue -->
<!--
  Interactive N64 Control Mapper styled with the reusable Configuration Menus
  design system (`docs/ui/configuration-menus.md`), preserving full 2D spatial
  keyboard/gamepad navigation across both the controller diagram and bindings.
-->
<template>
  <ConfigScreenShell aria-label="Controls" screen-class="mapper">
    <ConfigBreadcrumbHeader
      top="COMMISSIONER"
      second="Controls"
      @back="exitMapper"
    />

    <div class="mapper__body">
      <div class="mapper__layout">
        <!-- Left: Fixed lavender-bordered purple perspective showcase booth for the interactive N64 pad -->
        <section class="controller-panel" aria-label="Interactive Nintendo 64 controller">
          <div class="controller-booth">
            <PurpleGridBooth :center-x="500" />
            <div class="controller">
              <img class="controller__body" :src="controllerImage" alt="Nintendo 64 controller" />
              <button
                v-for="target in targets"
                :key="target.control"
                type="button"
                class="controller__target"
                :class="{
                  'controller__target--active': focusArea === 'controller' && rows[cursor]?.key === target.control,
                  'controller__target--listening': listeningFor === target.control,
                  'controller__target--rear': target.rear,
                }"
                :style="{ left: target.x + '%', top: target.y + '%', width: target.width + '%', height: target.height + '%' }"
                :aria-label="`${label(target.control)}: ${keyLabel(target.control)}. Click to rebind.`"
                :title="`${label(target.control)} · ${keyLabel(target.control)}`"
                :disabled="!!conflict"
                :data-mapper-nav="`controller:${target.control}`"
                @focus="selectControl(target.control)"
                @click="activateControl(target.control)"
              >
                <img v-if="target.rear" :src="icon(target.control)" alt="" />
                <span v-if="target.rear" class="controller__rear-key">{{ keyLabel(target.control) }}</span>
                <span v-else-if="target.control.startsWith('controlStick')" class="controller__direction" aria-hidden="true">{{ direction(target.control) }}</span>
                <span v-else class="sr-only">{{ label(target.control) }}</span>
              </button>
            </div>
            <p class="controller-panel__caption">L / R SHOULDER BUTTONS &middot; Z REAR TRIGGER</p>
          </div>

          <div class="selection" aria-live="polite">
            <img :src="icon(selectedControl)" alt="" />
            <div>
              <strong>{{ label(selectedControl) }}</strong>
              <p>{{ listeningFor ? "Waiting for input…" : keyLabel(selectedControl) }}</p>
            </div>
          </div>
        </section>

        <!-- Right: Scrollable instructions, 2-column Configuration Menu bars, and status -->
        <div class="mapper__content">
          <div class="mapper__banner" :class="{ 'mapper__banner--listening': listeningFor && !conflict }">
            <p class="mapper__hint">
              <template v-if="listeningFor">
                PRESS OR CLICK AN INPUT FOR <strong>{{ label(listeningFor) }}</strong>
                &mdash; KEYBOARD, MOUSE, GAMEPAD, OR STICK.
              </template>
              <template v-else>
                SELECT A CONTROLLER BUTTON TO REBIND &middot; BINDINGS SAVE AUTOMATICALLY.
              </template>
            </p>
            <ConfigMenuBar
              v-if="listeningFor && !conflict"
              variant="category"
              danger
              active
              class="mapper__cancel"
              @click="cancelListening"
            >
              Cancel rebinding
            </ConfigMenuBar>
          </div>

          <ul class="rows" aria-label="Controller bindings and actions">
            <li v-for="(row, index) in rows" :key="row.key">
              <button
                type="button"
                class="row"
                :class="{
                  'row--active': focusArea === 'bindings' && index === cursor,
                  'row--action': row.kind === 'action',
                  'row--export': row.kind === 'action' && row.action === 'export',
                  'row--reset': row.kind === 'action' && row.action === 'reset',
                  'row--listening': row.kind === 'binding' && listeningFor === row.control,
                }"
                :disabled="!!conflict"
                :data-mapper-nav="`bindings:${row.key}`"
                @focus="selectRow(index)"
                @click="activate(index)"
              >
                <img v-if="row.kind === 'binding'" class="row__icon" :src="icon(row.control)" alt="" />
                <span class="row__label">{{ row.label }}</span>
                <span v-if="row.kind === 'binding'" class="row__key">
                  {{
                    listeningFor === row.control
                      ? "PRESS A KEY"
                      : keyLabel(row.control)
                  }}
                </span>
              </button>
            </li>
          </ul>

          <p v-if="status" class="mapper__status" role="status">{{ status }}</p>
        </div>
      </div>
    </div>

    <ConfigControllerBar :hints="controllerHints" />

    <!-- Conflict confirmation modal (Configuration Menus lavender-bordered dialog). -->
    <div v-if="conflict" class="modal">
      <div class="modal__box" role="dialog" aria-modal="true" aria-label="Replace existing binding?">
        <p class="modal__text">Replace existing binding?</p>
        <p class="modal__detail">
          <strong>{{ friendlyKey(conflict.binding) }}</strong> is bound to
          <strong>{{ label(conflict.owner) }}</strong
          >. Assigning it to <strong>{{ label(conflict.control) }}</strong> will
          leave {{ label(conflict.owner) }} unbound.
        </p>
        <div class="modal__actions">
          <ConfigMenuBar variant="category" active class="modal__button" @click="confirmConflict">
            Replace (Enter)
          </ConfigMenuBar>
          <ConfigMenuBar variant="category" class="modal__button" @click="cancelConflict">
            Cancel (Esc)
          </ConfigMenuBar>
        </div>
      </div>
    </div>
  </ConfigScreenShell>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  PAD_CONTROLS,
  PAD_CONTROL_LABELS,
  PadControl,
  bindInput,
  conflictForBinding,
  describeBinding,
  exportMapping,
  keysForControl,
  resetBindings,
} from "@/input/controls";
import {
  bindingForPointer,
  eventCode,
  isMenuDown,
  isMenuUp,
  pollGamepadBindings,
  virtualInputFor,
  virtualInputForBinding,
} from "@/input/VirtualController";
import { playMenuCue } from "@/audio/menuAudio";
import { requireAsset } from "@/content/assets";
import type { ControllerHintItem } from "@/ui/controllerIcons";
import {
  ConfigBreadcrumbHeader,
  ConfigControllerBar,
  ConfigMenuBar,
  ConfigScreenShell,
  PurpleGridBooth,
} from "@/ui/configuration-menus";
import { nextNavigationTarget, type NavigationDirection } from "./spatialNavigation";

const controllerImage = requireAsset("assets/ui/textures/controller/n64-controller.svg");

interface Target {
  control: PadControl;
  x: number;
  y: number;
  width: number;
  height: number;
  rear?: boolean;
}

const targets: Target[] = [
  { control: "dpadUp", x: 23.35, y: 28.5, width: 6, height: 7 },
  { control: "dpadDown", x: 23.35, y: 38.5, width: 6, height: 7 },
  { control: "dpadLeft", x: 18.35, y: 33.5, width: 7, height: 6 },
  { control: "dpadRight", x: 28.35, y: 33.5, width: 7, height: 6 },
  { control: "controlStickUp", x: 51.35, y: 48, width: 9, height: 8 },
  { control: "controlStickDown", x: 51.35, y: 59, width: 9, height: 8 },
  { control: "controlStickLeft", x: 45.85, y: 53.5, width: 8, height: 9 },
  { control: "controlStickRight", x: 56.85, y: 53.5, width: 8, height: 9 },
  { control: "cUp", x: 81.7, y: 24.9, width: 6, height: 6 },
  { control: "cDown", x: 81.7, y: 35.6, width: 6, height: 6 },
  { control: "cLeft", x: 76.35, y: 30.25, width: 6, height: 6 },
  { control: "cRight", x: 87.05, y: 30.25, width: 6, height: 6 },
  { control: "a", x: 75.05, y: 41.4, width: 9, height: 9 },
  { control: "b", x: 68.62, y: 34.9, width: 9, height: 9 },
  { control: "start", x: 51.35, y: 34, width: 10, height: 10 },
  { control: "l", x: 20, y: 8, width: 18, height: 13, rear: true },
  { control: "r", x: 82, y: 8, width: 18, height: 13, rear: true },
  { control: "z", x: 77, y: 75, width: 18, height: 15, rear: true },
];

type Row =
  | { kind: "binding"; key: string; label: string; control: PadControl }
  | { kind: "action"; key: string; label: string; action: "reset" | "export" | "back" };

interface Conflict {
  control: PadControl;
  binding: string;
  owner: PadControl;
}

export default defineComponent({
  name: "ControlMapper",

  components: {
    ConfigBreadcrumbHeader,
    ConfigControllerBar,
    ConfigMenuBar,
    ConfigScreenShell,
    PurpleGridBooth,
  },

  emits: ["back"],

  data() {
    return {
      controllerImage,
      targets,
      cursor: 0,
      focusArea: "bindings" as "bindings" | "controller",
      listeningFor: null as PadControl | null,
      conflict: null as Conflict | null,
      status: "",
      /** Bumped to force the key column to re-read the mapping after a bind. */
      revision: 0,
      stopGamepadPolling: null as (() => void) | null,
    };
  },

  computed: {
    navigationId(): string {
      return `${this.focusArea}:${this.rows[this.cursor].key}`;
    },
    selectedControl(): PadControl {
      const row = this.rows[this.cursor];
      return this.listeningFor ?? (row?.kind === "binding" ? row.control : "a");
    },
    rows(): Row[] {
      const bindings: Row[] = PAD_CONTROLS.map((control) => ({
        kind: "binding" as const,
        key: control,
        label: PAD_CONTROL_LABELS[control],
        control,
      }));
      return [
        ...bindings,
        { kind: "action", key: "reset", label: "Reset Defaults", action: "reset" },
        { kind: "action", key: "export", label: "Export JSON", action: "export" },
        { kind: "action", key: "back", label: "Back", action: "back" },
      ];
    },
    controllerHints(): ControllerHintItem[] {
      if (this.listeningFor) {
        return [{ icons: ["a"], label: `PRESS ANY INPUT FOR ${this.label(this.listeningFor).toUpperCase()}` }];
      }
      return [
        { icons: ["dPad"], label: "MOVE" },
        { icons: ["a"], label: "REBIND / SELECT" },
        { icons: ["b"], label: "BACK" },
      ];
    },
  },

  watch: {
    // Keep keyboard selection visible on smaller screens.
    navigationId() {
      this.$nextTick(this.focusSelection);
    },
  },

  mounted() {
    this.$nextTick(this.focusSelection);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("pointerdown", this.onPointerDown, true);
    this.stopGamepadPolling = pollGamepadBindings(this.onGamepadBinding);
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("pointerdown", this.onPointerDown, true);
    this.stopGamepadPolling?.();
  },

  methods: {
    exitMapper() {
      playMenuCue("back");
      this.$emit("back");
    },

    icon(control: PadControl): string {
      const name = control.startsWith("dpad") ? "D-Pad"
        : control.startsWith("controlStick") ? "Control_Stick"
        : control.startsWith("c") ? "C"
        : control === "start" ? "Start" : control.toUpperCase();
      return requireAsset(`assets/ui/textures/controller/ButtonIcon-N64-${name}.svg`);
    },

    direction(control: PadControl): string {
      if (control.endsWith("Up")) return "↑";
      if (control.endsWith("Down")) return "↓";
      if (control.endsWith("Left")) return "←";
      return "→";
    },

    selectRow(index: number) {
      this.cursor = index;
      this.focusArea = "bindings";
    },

    selectControl(control: PadControl) {
      this.cursor = this.rows.findIndex((row) => row.key === control);
      this.focusArea = "controller";
    },

    activateControl(control: PadControl) {
      this.selectControl(control);
      this.activate(this.cursor, "controller");
    },

    focusSelection() {
      if (this.conflict) return;
      const root = this.$el as HTMLElement;
      const selected = root.querySelector<HTMLButtonElement>(`[data-mapper-nav="${this.navigationId}"]`);
      selected?.focus({ preventScroll: true });
      selected?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },

    label(control: PadControl): string {
      return PAD_CONTROL_LABELS[control];
    },

    keyLabel(control: PadControl): string {
      // `revision` is read so Vue re-evaluates this after a rebind; the
      // bindings live outside the reactive graph on purpose.
      void this.revision;
      const keys = keysForControl(control);
      return keys.length ? keys.map(describeBinding).join(", ") : "unbound";
    },

    /** Turns a KeyboardEvent.code into something readable on screen. */
    friendlyKey(code: string): string {
      return describeBinding(code);
    },

    onKeyDown(event: KeyboardEvent) {
      // The mapper owns the keyboard while it is open: without this, rebinding
      // to a key the browser acts on (Space scrolling, arrows) fights the UI.
      if (event.key === "Tab" && !this.listeningFor && !this.conflict) return;
      // Let focused dialog/cancel buttons keep their native keyboard activation.
      if ((event.key === "Enter" || event.key === " ") &&
          event.target instanceof HTMLButtonElement && !event.target.dataset.mapperNav) return;
      event.preventDefault();
      if (event.repeat) return;

      if (this.conflict) return this.onConflictKey(event);
      if (this.listeningFor) return this.onListeningKey(event);
      this.onNavigationKey(event);
    },

    onPointerDown(event: PointerEvent) {
      if (!this.listeningFor || this.conflict) return;
      if (event.target instanceof Element && event.target.closest(".mapper__cancel")) return;
      const binding = bindingForPointer(event);
      if (!binding) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.onListeningBinding(binding);
    },

    onGamepadBinding(binding: string) {
      if (this.conflict) return;
      if (this.listeningFor) return this.onListeningBinding(binding);
      const input = virtualInputForBinding(binding);
      if (input) this.onNavigationInput(input);
    },

    /**
     * The raw key is what matters, not what it is bound to, so it can be moved
     * off the control it already serves.
     */
    onListeningKey(event: KeyboardEvent) {
      this.onListeningBinding(eventCode(event));
    },

    onListeningBinding(binding: string) {
      const control = this.listeningFor!;
      const owner = conflictForBinding(control, binding);
      if (owner) {
        this.conflict = { control, binding, owner };
        this.listeningFor = null;
        playMenuCue("deny");
        return;
      }

      this.apply(control, binding);
    },

    onConflictKey(event: KeyboardEvent) {
      const code = eventCode(event);
      if (code === "Escape") return this.cancelConflict();
      if (code === "Enter" || code === "NumpadEnter") return this.confirmConflict();
    },

    cancelListening() {
      this.listeningFor = null;
      this.status = "Rebinding cancelled.";
      playMenuCue("back");
      this.$nextTick(this.focusSelection);
    },

    onNavigationKey(event: KeyboardEvent) {
      const input = virtualInputFor(event);
      if (!input) return;

      this.onNavigationInput(input);
    },

    onNavigationInput(input: ReturnType<typeof virtualInputFor>) {
      if (!input) return;
      if (isMenuUp(input)) return this.move("up");
      if (isMenuDown(input)) return this.move("down");
      if (input === "left" || input === "stickLeft") return this.move("left");
      if (input === "right" || input === "stickRight") return this.move("right");
      if (input === "a") return this.activate(this.cursor, this.focusArea);
      if (input === "b") {
        playMenuCue("back");
        return this.$emit("back");
      }
    },

    move(direction: NavigationDirection) {
      const root = this.$el as HTMLElement;
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-mapper-nav]:not(:disabled)"));
      const targets = buttons.map((button) => {
        const bounds = button.getBoundingClientRect();
        return { id: button.dataset.mapperNav!, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      });
      const next = nextNavigationTarget(targets, this.navigationId, direction);
      if (!next) return;
      const target = buttons.find((button) => button.dataset.mapperNav === next);
      if (!target) return;
      target.focus({ preventScroll: true });
      if (next.startsWith("bindings:")) {
        target.scrollIntoView({ block: "nearest" });
      }
      this.status = "";
      playMenuCue("move");
    },

    activate(index: number, area: "bindings" | "controller" = "bindings") {
      if (this.conflict) return;
      this.listeningFor = null;
      this.cursor = index;
      this.focusArea = area;
      const row = this.rows[index];

      if (row.kind === "binding") {
        this.listeningFor = row.control;
        this.status = "";
        playMenuCue("select");
        return;
      }

      if (row.action === "back") {
        playMenuCue("back");
        return this.$emit("back");
      }
      playMenuCue("select");
      if (row.action === "reset") return this.reset();
      if (row.action === "export") return this.exportJson();
    },

    apply(control: PadControl, binding: string) {
      const { displaced } = bindInput(control, binding);
      this.listeningFor = null;
      this.revision += 1;
      this.status = displaced
        ? `${this.friendlyKey(binding)} bound to ${this.label(control)}, taken from ${this.label(displaced)}.`
        : `${this.friendlyKey(binding)} bound to ${this.label(control)}.`;
      playMenuCue("confirm");
      this.$nextTick(this.focusSelection);
    },

    confirmConflict() {
      const pending = this.conflict;
      if (!pending) return;
      this.conflict = null;
      this.apply(pending.control, pending.binding);
    },

    cancelConflict() {
      this.conflict = null;
      this.status = "Rebinding cancelled.";
      playMenuCue("back");
      this.$nextTick(this.focusSelection);
    },

    reset() {
      resetBindings();
      this.revision += 1;
      this.status = "Bindings restored to defaults.";
      playMenuCue("confirm");
    },

    exportJson() {
      const json = JSON.stringify(exportMapping(), null, 2);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "control-mappings.json";
      link.click();
      URL.revokeObjectURL(url);
      this.status = "Exported control-mappings.json.";
      playMenuCue("confirm");
    },
  },
});
</script>

<style scoped>
.mapper__body {
  position: absolute;
  top: 5.5rem;
  left: 0;
  right: 0;
  bottom: 2.35rem;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.2rem 2.2rem 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-color: var(--vpg-cfg-frame-border) rgba(15, 22, 46, 0.55);
}

.mapper__layout {
  width: min(100%, 76rem);
  display: grid;
  grid-template-columns: minmax(18.5rem, 0.96fr) minmax(24rem, 1.32fr);
  gap: 1.55rem;
  align-items: start;
}

.mapper__content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0 0.35rem 0.75rem 0.25rem;
}

.mapper__banner {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.mapper__banner--listening {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 0.2rem 0;
  background: rgba(7, 9, 20, 0.92);
}

.mapper__hint {
  margin: 0;
  padding: 0.32rem 0.68rem;
  background: var(--vpg-cfg-panel-bg);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
  color: #dbe8ff;
  font-family: var(--vpg-font-pixel);
  font-size: 0.84rem;
  letter-spacing: 0.06em;
  line-height: 1.4;
  flex: 1 1 16rem;
}

.mapper__hint strong {
  color: var(--vpg-cfg-accent-lime);
  font-weight: 400;
}

.mapper__cancel {
  width: auto;
  min-width: 11.5rem;
}

/* ----------------------------------------------------------- Left: Fixed purple wireframe N64 showcase */

.controller-panel {
  position: sticky;
  top: 0;
  align-self: start;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.controller-booth {
  position: relative;
  overflow: hidden;
  padding: 0.7rem 0.85rem 0.48rem;
  border: 7px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 28px var(--vpg-cfg-frame-glow), inset 0 0 24px rgba(18, 4, 42, 0.55);
}

.controller {
  position: relative;
  z-index: 2;
  width: min(100%, 23.5rem, calc(100vh - 16.5rem));
  margin: 0 auto;
  aspect-ratio: 1;
}

.controller__body {
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  filter: drop-shadow(0 8px 18px rgba(6, 2, 18, 0.75));
}

.controller__target {
  position: absolute;
  transform: translate(-50%, -50%);
  border: 2px solid transparent;
  border-radius: 30%;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  transition: border-color 90ms ease, background 90ms ease, box-shadow 90ms ease;
}

.controller__target--rear {
  border-radius: 0;
  background: var(--vpg-cfg-bar-idle);
  border: 1px solid rgba(204, 168, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0 0.25rem;
}

.controller__target:hover,
.controller__target:focus-visible,
.controller__target--active {
  border-color: var(--vpg-cfg-accent-lime);
  background: rgba(204, 168, 255, 0.42);
  box-shadow: 0 0 18px rgba(204, 168, 255, 0.75);
  outline: none;
}

.controller__target--rear.controller__target--active,
.controller__target--rear:hover,
.controller__target--rear:focus-visible {
  background: var(--vpg-cfg-bar-active);
  color: var(--vpg-cfg-text-active);
  border-color: #ffffff;
}

.controller__target--listening,
.controller__target--listening:hover,
.controller__target--listening:focus-visible {
  border-color: #ffffff;
  background: var(--vpg-cfg-bar-typing);
  color: #071324;
  box-shadow: 0 0 20px rgba(124, 200, 255, 0.85);
}

.controller__target--rear img {
  width: 50%;
  height: 80%;
  object-fit: contain;
}

.controller__direction {
  color: var(--vpg-cfg-accent-lime);
  font-size: clamp(0.85rem, 1.8vw, 1.4rem);
  text-shadow: 0 1px 4px #000000;
}

.controller__rear-key {
  font-size: clamp(0.65rem, 0.95vw, 0.88rem);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.controller-panel__caption {
  position: relative;
  z-index: 2;
  margin: 0.4rem 0 0;
  text-align: center;
  color: #dcc8ff;
  font-family: var(--vpg-font-pixel);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
}

.selection {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.85rem;
  background: var(--vpg-cfg-panel-bg);
  border: 2px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 16px rgba(176, 118, 255, 0.28);
}

.selection img {
  width: 2.25rem;
  height: 2.25rem;
  object-fit: contain;
}

.selection strong {
  display: block;
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-pixel);
  font-size: 0.92rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.selection p {
  margin: 0.14rem 0 0;
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.84rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ----------------------------------------------------------- Right: Configuration Menu Bar grid */

.rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.36rem 0.45rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows li {
  min-width: 0;
}

.rows li:nth-last-child(-n+3) {
  grid-column: 1 / -1;
}

.row {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 2.55rem;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
  padding: 0.28rem 0.68rem;
  border: 0;
  border-radius: 0;
  background: var(--vpg-cfg-bar-idle);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.88rem;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
  text-shadow: 1px 1px 0 rgba(7, 14, 34, 0.85);
  -webkit-font-smoothing: none;
  cursor: pointer;
  transition: transform 90ms ease, background 90ms ease, color 90ms ease;
}

.row:hover:not(:disabled) {
  filter: brightness(1.08);
}

.row--active,
.row:focus-visible:not(:disabled) {
  outline: none;
  background: var(--vpg-cfg-bar-active);
  color: var(--vpg-cfg-text-active);
  text-shadow: none;
  transform: scaleX(1.025);
  box-shadow: 0 0 16px rgba(204, 168, 255, 0.55);
  z-index: 4;
}

.row--listening,
.row--listening:hover,
.row--listening:focus-visible {
  outline: none;
  background: var(--vpg-cfg-bar-typing);
  color: #071324;
  text-shadow: none;
  transform: scaleX(1.025);
  box-shadow: 0 0 18px rgba(124, 200, 255, 0.65);
  z-index: 5;
}

.row--action {
  justify-content: center;
  min-height: 2.4rem;
  margin-top: 0.1rem;
  font-size: 0.92rem;
}

.row--export {
  border-left: 4px solid var(--vpg-cfg-accent-lime);
}

.row--reset.row--active,
.row--reset:focus-visible:not(:disabled) {
  background: var(--vpg-cfg-bar-danger);
  color: #210509;
}

.row__icon {
  width: 1.6rem;
  height: 1.6rem;
  object-fit: contain;
  flex-shrink: 0;
}

.row__label {
  flex: 1;
  min-width: 0;
}

.row__key {
  max-width: 46%;
  color: #c8dcff;
  text-align: right;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.row--active .row__key,
.row:focus-visible .row__key,
.row--listening .row__key {
  color: inherit;
}

.mapper__status {
  width: 100%;
  margin: 0;
  padding: 0.36rem 0.7rem;
  background: rgba(12, 18, 40, 0.92);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
  color: #d7f8b8;
  font-family: var(--vpg-font-pixel);
  font-size: 0.86rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* ----------------------------------------------------------- Conflict Dialog */

.modal {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgba(6, 4, 18, 0.78);
}

.modal__box {
  width: min(92vw, 30rem);
  padding: 1.25rem 1.35rem;
  background: var(--vpg-cfg-modal-bg);
  border: 4px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 32px rgba(176, 118, 255, 0.45);
}

.modal__text {
  margin: 0 0 0.65rem;
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-display);
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.modal__detail {
  margin: 0 0 1.15rem;
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.9rem;
  line-height: 1.5;
}

.modal__detail strong {
  color: var(--vpg-cfg-frame-border);
  font-weight: 400;
}

.modal__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.modal__button {
  min-height: 2.5rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 820px) {
  .mapper__body {
    top: 5.4rem;
    padding: 0.25rem 0.75rem 1rem;
  }

  .mapper__layout {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .controller-panel {
    position: static;
  }

  .controller {
    width: min(100%, 22rem);
  }

  .mapper__content {
    padding: 0;
  }

  .controller-booth {
    border-width: 6px;
    padding: 0.6rem;
  }

  .row {
    font-size: 0.76rem;
    padding: 0.24rem 0.45rem;
    min-height: 2.35rem;
  }

  .row__icon {
    width: 1.3rem;
    height: 1.3rem;
  }

  .controller__rear-key {
    font-size: 0.66rem;
  }
}
</style>
