<!--
  Arena Editor, ported from VirtualProGrappler-V2. The script block describes
  how drafts, saving and imported images work in this project.
-->
<template>
  <div class="editor">
    <!-- Pick what to work on (Configuration Menus design language). -->
    <ConfigScreenShell
      v-if="!draft"
      aria-label="Arena Editor"
      screen-class="start"
    >
      <ConfigPreviewBooth layout="framed-rail" :center-x="680">
        <div class="stage-canvas preview-stage">
          <div class="preview">
            <img
              v-if="startPreviewUrl"
              class="preview__image"
              :src="startPreviewUrl"
              :alt="`${startSelected?.displayName} preview`"
            />
            <div v-else class="preview__empty">No preview</div>
          </div>
        </div>

        <template v-if="startSelected" #hud-bottom>
          <span class="booth-pill booth-pill--name">{{ startSelected.displayName }}</span>
          <span class="booth-pill">{{ startSelected.id }}</span>
          <span class="booth-pill booth-pill--dim">
            {{ startSelected.custom ? "CUSTOM" : "BUNDLED · CLONES ON EDIT" }}
          </span>
        </template>
      </ConfigPreviewBooth>

      <ConfigBreadcrumbHeader
        top="COMMISSIONER"
        second="Arena Editor"
        back-label="BACK"
        @back="chooseStart(backIndex)"
      />

      <aside class="start-rail" aria-label="Arenas">
        <p class="start__warning">
          Bundled arenas are cloned before editing. Your arenas are saved in this browser.
        </p>

        <ul class="rows">
          <li
            v-for="(arena, index) in arenas"
            :key="arena.id"
            class="row"
            :class="{ 'row--active': index === startCursor }"
            @click="chooseStart(index)"
            @mouseenter="startCursor = index"
          >
            <span class="row__name">{{ arena.displayName }}</span>
            <span v-if="arena.custom" class="row__tag">Custom</span>
            <button
              v-if="index === startCursor"
              type="button"
              class="row__clone"
              @click.stop="startClone(arena.id)"
            >
              Clone
            </button>
          </li>
          <li
            class="row row--back"
            :class="{ 'row--active': startCursor === backIndex }"
            @click="chooseStart(backIndex)"
            @mouseenter="startCursor = backIndex"
          >
            <span class="row__name">&larr; Back</span>
          </li>
        </ul>
      </aside>

      <ConfigControllerBar :hints="startControllerHints" />
    </ConfigScreenShell>

    <!-- Editing (Configuration Menus design language: docs/ui/configuration-menus.md). -->
    <ConfigScreenShell
      v-else
      aria-label="Arena Editor"
      screen-class="work"
    >
      <ConfigPreviewBooth
        layout="framed-rail"
        :center-x="360"
      >
        <canvas ref="canvas" class="stage-canvas work__canvas" :data-active="previewReady" />

        <template v-if="loading" #hud-top-left>
          <span class="booth-pill work__loading">Rendering&hellip;</span>
        </template>

        <template #hud-bottom>
          <span class="booth-pill booth-pill--name">{{ draft.displayName || draft.id }}</span>
          <span class="booth-pill">{{ draft.id }}</span>
          <span class="booth-pill booth-pill--dim">STAGE: {{ stageDisplayName }}</span>
          <span class="booth-pill booth-pill--dim">{{ autoPreview ? "LIVE PREVIEW" : "MANUAL PREVIEW" }}</span>
        </template>
      </ConfigPreviewBooth>

      <ConfigBreadcrumbHeader
        top="ARENA OPTIONS"
        :second="creating ? 'New arena' : draft.displayName || draft.id"
        second-class="panel__title"
        :back-label="creating ? 'Discard draft' : 'Close'"
        :back-disabled="saving"
        @back="closeDraft"
      />

      <aside
        ref="panel"
        class="panel"
        :class="{ 'panel--typing': fieldEditing }"
        @focusin="onPanelFocusIn"
        @pointerdown="onPanelPointerDown"
      >
        <fieldset class="panel__body" :disabled="saving">
          <!-- Identity -->
          <section class="group">
            <h3 class="group__title">Identity</h3>

            <label class="field cfg-field" :class="{ 'cfg-field--disabled': !creating }">
              <span class="field__label">Arena ID</span>
              <input
                v-model.trim="draft.id"
                class="field__input"
                :disabled="!creating"
                spellcheck="false"
              />
            </label>
            <p v-if="idError" class="field__error">{{ idError }}</p>
            <p v-if="!creating" class="field__note">
              Clone this arena to create one with a different ID.
            </p>

            <label class="field cfg-field">
              <span class="field__label">Display name</span>
              <input v-model="draft.displayName" class="field__input" />
            </label>

            <label class="field cfg-field">
              <span class="field__label">Preview image</span>
              <select v-model="draft.previewImage" class="field__input">
                <option value="">(none)</option>
                <option v-for="p in previews" :key="p" :value="p">
                  {{ shortPath(p) }}
                </option>
              </select>
            </label>
          </section>

          <!-- Environment. The stage decides which pieces fit. -->
          <section class="group">
            <h3 class="group__title">Stage</h3>

            <label class="field cfg-field">
              <span class="field__label">Stage</span>
              <select
                class="field__input"
                :value="draft.stage"
                @change="onStageChange($event)"
              >
                <option v-for="s in stages" :key="s.id" :value="s.id">
                  {{ s.displayName }}
                </option>
              </select>
            </label>

            <label
              v-for="piece in pieceFields"
              :key="piece.kind"
              class="field cfg-field"
              :class="{ 'cfg-field--disabled': piece.options.length < 2 }"
            >
              <span class="field__label">{{ piece.label }}</span>
              <select
                v-model="draft[piece.kind]"
                class="field__input"
                :disabled="piece.options.length < 2"
              >
                <option v-for="part in piece.options" :key="part.id" :value="part.id">
                  {{ part.displayName }}
                </option>
              </select>
            </label>

            <p class="field__note">
              The floor, barricade and outer bowl are modelled to meet this
              stage, so only the pieces that fit it are offered. Changing the
              stage re-picks all three.
            </p>
          </section>

          <!-- One row per slot: its texture and the colours that tint it. -->
          <section
            v-for="section in slotSections"
            :key="section.title"
            class="group"
          >
            <h3 class="group__title">{{ section.title }}</h3>

            <div v-for="slot in section.slots" :key="slot.id" class="slot">
              <label v-if="slot.folders.length" class="field cfg-field">
                <span class="field__label">{{ slot.label }}</span>
                <select
                  :value="textureValue(slot)"
                  class="field__input"
                  @change="setTexture(slot, $event)"
                >
                  <option value="">(from the model)</option>
                  <option v-for="t in textureOptions[slot.id]" :key="t" :value="t">
                    {{ fileLabel(t) }}
                  </option>
                  <!-- Any imported image fits any texture slot; folders only sort the bundled art. -->
                  <optgroup v-if="library.length" label="Imported images">
                    <option v-for="image in library" :key="image.id" :value="imageRef(image.id)">
                      {{ image.name }} ({{ image.width }}&times;{{ image.height }})
                    </option>
                  </optgroup>
                </select>
              </label>
              <ConfigMenuBar
                v-if="slot.folders.length"
                variant="clip"
                class="slot__import"
                :disabled="importing"
                @click="chooseImport(slot)"
              >
                {{ importing && importSlot === slot ? "Importing…" : "Import image…" }}
              </ConfigMenuBar>
              <span v-else class="field__label slot__label">
                {{ slot.label }}
              </span>

              <div v-if="slot.colors.length" class="tints">
                <label
                  v-for="color in slot.colors"
                  :key="color.key"
                  class="tint"
                  :title="color.key"
                >
                  <span v-if="color.label" class="tint__label">
                    {{ color.label }}
                  </span>
                  <input
                    type="color"
                    class="tint__swatch"
                    :value="swatchValue(slot, color.key)"
                    @input="setColor(slot, color.key, $event)"
                  />
                  <input
                    type="range"
                    class="tint__alpha"
                    min="0"
                    max="100"
                    :value="alphaValue(slot, color.key)"
                    :title="`Strength ${alphaValue(slot, color.key)}%`"
                    @input="setAlpha(slot, color.key, $event)"
                  />
                  <button
                    type="button"
                    class="btn btn--icon"
                    title="Clear this tint"
                    :disabled="!hasColor(slot, color.key)"
                    @click="clearColor(slot, color.key)"
                  >
                    &times;
                  </button>
                </label>
              </div>
            </div>
          </section>

          <input
            ref="imagePicker"
            type="file"
            accept="image/png,image/jpeg"
            hidden
            @change="onImageChosen"
          />

          <p v-if="strayKeys.length" class="field__error">
            This file sets keys the editor has no control for:
            {{ strayKeys.join(", ") }}. Stage materials are baked into the
            stage GLB now, so saving will drop them.
          </p>
        </fieldset>

        <footer class="panel__foot">
          <label class="toggle cfg-field">
            <input v-model="autoPreview" type="checkbox" />
            <span>Live preview</span>
          </label>
          <div class="panel__actions">
            <ConfigMenuBar variant="category" :disabled="loading" @click="refreshPreview">
              Refresh
            </ConfigMenuBar>
            <ConfigMenuBar
              variant="category"
              accent-left
              :disabled="!!idError || saving"
              @click="save"
            >
              {{ saving ? "Saving…" : "Save" }}
            </ConfigMenuBar>
            <ConfigMenuBar
              v-if="!creating"
              variant="category"
              danger
              :active="confirmingDelete"
              :disabled="saving"
              @click="deleteSaved"
            >
              {{ confirmingDelete ? "Confirm delete" : "Delete" }}
            </ConfigMenuBar>
          </div>
        </footer>

        <p v-if="status" class="panel__status" :class="{ 'panel__status--bad': statusBad }">
          {{ status }}
        </p>
        <p v-if="warnings.length" class="panel__status panel__status--bad">
          {{ warnings.join(" / ") }}
        </p>
      </aside>

      <ConfigControllerBar :hints="editControllerHints" />
    </ConfigScreenShell>
  </div>
</template>

<script lang="ts">
import { defineComponent, markRaw } from "vue";
import { type ArenaSummary, arenaById, availableArenas, isBundledArena } from "@/content/arenas";
import {
  type ArenaDraft,
  PIECE_KINDS,
  type TextureSlot,
  availablePreviews,
  cloneArena,
  draftFromArena,
  draftToArenaData,
  draftToJson,
  existingIds,
  idProblem,
  pieceOptions,
  selectStage,
  slotTextureOptions,
  unknownKeys,
} from "@/content/arenaDraft";
import { slotSections } from "@/content/textureSlots";
import { type PieceKind, availableStages } from "@/content/stages";
import type { ArenaPieceData } from "@/content/arenaPieces";
import { ArenaScene, CAMERA_INPUTS } from "@/render/arena/ArenaScene";
import { clearDraft, deleteArena, imagesInUse, readDraft, saveArena, writeDraft } from "@/save/arenaStore";
import { imageLibrary, importImageFile, libraryIds, loadImageLibrary, pruneImages } from "@/save/imageStore";
import { type LibraryImage, describeImage, userImageRef } from "@/save/images";
import { acquireImageUrls, textureValues } from "@/save/imageUrls";
import {
  type VirtualInput,
  isMenuDown,
  isMenuUp,
  isInteractivePointerTarget,
  pollGamepadBindings,
  virtualInputFor,
  virtualInputForBinding,
} from "@/input/VirtualController";
import { playMenuCue } from "@/audio/menuAudio";
import type { ControllerHintItem } from "@/ui/controllerIcons";
import {
  ConfigBreadcrumbHeader,
  ConfigControllerBar,
  ConfigMenuBar,
  ConfigPreviewBooth,
  ConfigScreenShell,
} from "@/ui/configuration-menus";

const START_CONTROLLER_HINTS: readonly ControllerHintItem[] = [
  { icons: ["dPad"], label: "MOVE" },
  { icons: ["a"], label: "EDIT" },
  { icons: ["z"], label: "CLONE" },
  { icons: ["b"], label: "BACK" },
];

/**
 * Arena Editor, ported from VirtualProGrappler-V2.
 *
 * Pick an arena, then change its stage, pieces, textures and tints with a live
 * preview. Bundled arenas are cloned under a new id first; saved arenas live
 * in this browser (src/save/arenaStore.ts), and imported texture images in
 * IndexedDB (src/save/imageStore.ts). The unfinished draft is parked in
 * storage on every change, so a reload or hot update picks it back up.
 *
 * The d-pad drives the panel and the control stick drives the camera, so both
 * are live at once and there is no mode to toggle between them.
 */

/**
 * How long to wait after the last edit before re-rendering.
 *
 * A reload re-imports every GLB, and the largest arena part is over 10MB, so
 * rebuilding on each keystroke would make typing unusable. Long enough to let
 * a name be typed out, short enough to still feel like a live preview.
 */
const PREVIEW_DEBOUNCE_MS = 600;

/** How the three piece dropdowns are labelled. */
const PIECE_LABELS: Record<PieceKind, string> = {
  floor: "Floor",
  barricade: "Barricade",
  outer: "Arena outer",
};

/**
 * A tint the arena files write as `rgba(r, g, b, a)`.
 *
 * The panel edits it as a colour swatch plus a strength slider, because that is
 * what the value means in practice - the overlay is multiplied over the
 * texture, so alpha reads as "how much of this colour" rather than opacity.
 */
interface Tint {
  hex: string;
  /** 0-100, as the slider carries it. */
  alpha: number;
}

const NO_TINT: Tint = { hex: "#ffffff", alpha: 0 };

function parseTint(value: string | undefined): Tint {
  if (!value) return NO_TINT;

  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return { hex: `#${digits.toLowerCase()}`, alpha: 100 };
  }

  const rgb = value.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (!rgb) return NO_TINT;

  const channel = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, "0");
  return {
    hex: `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`,
    alpha: Math.round((rgb[4] === undefined ? 1 : Number(rgb[4])) * 100),
  };
}

/**
 * A tint back as the schema spells it.
 *
 * Alpha is written as `0`, `1` or a leading-zero decimal, which is the only
 * form `css_color` in the arena schema accepts - `1.0` would be rejected.
 */
function formatTint(tint: Tint): string {
  const n = parseInt(tint.hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const a = Math.round(tint.alpha) / 100;
  const alpha = a === 0 ? "0" : a === 1 ? "1" : String(a);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default defineComponent({
  name: "ArenaEditor",

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
      draft: null as ArenaDraft | null,
      /** The id being edited, or null while creating a new arena. */
      editingId: null as string | null,
      previews: availablePreviews(),
      stages: availableStages(),
      slotSections: slotSections(),
      textureOptions: slotTextureOptions() as Record<string, string[]>,
      saving: false,
      importing: false,
      /** The slot an import in progress will dress. */
      importSlot: null as TextureSlot | null,
      /** Delete is two presses, so one stray press cannot lose an arena. */
      confirmingDelete: false,
      loading: false,
      previewReady: false,
      autoPreview: true,
      status: "",
      statusBad: false,
      warnings: [] as string[],
      scene: null as ArenaScene | null,
      loadToken: 0,
      previewTimer: 0,
      /** Cursor on the arena list. */
      startCursor: 0,
      /** Which of the panel's controls the d-pad is on. */
      focusIndex: 0,
      /** True while a text field has the keyboard to itself. */
      fieldEditing: false,
      stopGamepadPolling: null as (() => void) | null,
      startControllerHints: START_CONTROLLER_HINTS,
    };
  },

  computed: {
    arenas(): ArenaSummary[] {
      return availableArenas();
    },

    creating(): boolean {
      return this.editingId === null;
    },

    /** The Back row sits after the arenas. */
    backIndex(): number {
      return this.arenas.length;
    },

    startSelected(): ArenaSummary | null {
      return this.arenas[this.startCursor] ?? null;
    },

    startPreviewUrl(): string | null {
      return this.startSelected?.previewUrl ?? null;
    },

    /** Ids that would collide with this draft's. */
    takenIds(): string[] {
      const ids = existingIds();
      return this.creating ? ids : ids.filter((id) => id !== this.editingId);
    },

    idError(): string | null {
      if (!this.draft) return null;
      return idProblem(this.draft.id, this.takenIds);
    },

    /** The three piece dropdowns, with the options this stage allows. */
    pieceFields(): { kind: PieceKind; label: string; options: ArenaPieceData[] }[] {
      const draft = this.draft;
      if (!draft) return [];
      return PIECE_KINDS.map((kind) => ({ kind, label: PIECE_LABELS[kind], options: pieceOptions(draft, kind) }));
    },

    /** Imported images, offered on every texture slot. */
    library(): readonly LibraryImage[] {
      return imageLibrary.value;
    },

    /** Texture keys in the file that no slot owns. */
    strayKeys(): string[] {
      return this.draft ? unknownKeys(this.draft) : [];
    },

    stageDisplayName(): string {
      const id = this.draft?.stage;
      return this.stages.find((s) => s.id === id)?.displayName ?? id ?? "";
    },

    editControllerHints(): ControllerHintItem[] {
      if (this.fieldEditing) {
        return [{ icons: ["b"], label: "STOP TYPING" }];
      }
      return [
        { icons: ["dPad"], label: "FIELD · ◀▶ CHANGE" },
        { icons: ["stick"], label: "CAMERA" },
        { icons: ["a"], label: "USE / EDIT" },
        { icons: ["z"], label: "SAVE" },
        { icons: ["b"], label: this.creating ? "DISCARD" : "CLOSE" },
      ];
    },
  },

  watch: {
    startCursor() {
      this.$nextTick(() => {
        this.$el?.querySelector?.(".row--active")?.scrollIntoView({ block: "nearest" });
      });
    },

    // Deep: the panel edits texture maps in place.
    draft: {
      deep: true,
      handler(draft: ArenaDraft | null, previous: ArenaDraft | null) {
        if (!draft) return;
        this.persistDraft();
        // A new draft object was opened, and opening it already rendered it;
        // only edits to the same draft schedule another render.
        if (draft !== previous) return;
        this.confirmingDelete = false;
        if (this.autoPreview) this.schedulePreview();
      },
    },
  },

  async mounted() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("pointerdown", this.onPointerDown);
    // A held stick keeps orbiting, as a held key does.
    this.stopGamepadPolling = pollGamepadBindings(this.onGamepadBinding, {
      repeat: (binding) => CAMERA_INPUTS.includes(virtualInputForBinding(binding) ?? ""),
      repeatDelay: 120,
      repeatInterval: 30,
    });
    // Before the draft, so a recovered draft's imported images validate.
    await loadImageLibrary();
    this.restoreDraft();
  },

  beforeUnmount() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("pointerdown", this.onPointerDown);
    this.stopGamepadPolling?.();
    window.clearTimeout(this.previewTimer);
    this.loadToken += 1;
    this.scene?.dispose();
    this.scene = null;
  },

  methods: {
    onKeyDown(event: KeyboardEvent) {
      const input = virtualInputFor(event);
      if (!input) return;
      this.onMappedInput(input, event);
    },

    onPointerDown(event: PointerEvent) {
      if (isInteractivePointerTarget(event)) return;
      const input = virtualInputFor(event);
      if (!input) return;
      this.onMappedInput(input, event);
    },

    onGamepadBinding(binding: string, repeat = false) {
      const input = virtualInputForBinding(binding);
      // Only the camera repeats; a repeat never presses a panel control.
      if (input && (!repeat || (this.draft && CAMERA_INPUTS.includes(input)))) this.onMappedInput(input);
    },

    onMappedInput(input: VirtualInput, event?: Event) {
      // While a field is being typed into, the keyboard belongs to it -
      // otherwise navigation would eat the characters. Only Back leaves.
      if (this.fieldEditing) {
        if (input === "b") {
          event?.preventDefault();
          this.stopFieldEditing();
          playMenuCue("toggle");
        }
        return;
      }

      if (!this.draft) return this.onStartKey(event, input);
      return this.onEditKey(event, input);
    },

    /** The arena list. Moves and selects like any other menu. */
    onStartKey(event: Event | undefined, input: VirtualInput) {
      if (isMenuUp(input)) {
        event?.preventDefault();
        return this.moveStartCursor(-1);
      }
      if (isMenuDown(input)) {
        event?.preventDefault();
        return this.moveStartCursor(1);
      }
      if (input === "a") {
        event?.preventDefault();
        return this.chooseStart(this.startCursor);
      }
      const arena = this.arenas[this.startCursor];
      if (input === "z" && arena) {
        event?.preventDefault();
        return this.startClone(arena.id);
      }
      if (input === "b") {
        event?.preventDefault();
        playMenuCue("back");
        return this.$emit("back");
      }
    },

    /** The editing screen: d-pad on the panel, stick and C buttons on the camera. */
    onEditKey(event: Event | undefined, input: VirtualInput) {
      if (input === "b") {
        event?.preventDefault();
        return this.closeDraft();
      }
      if (CAMERA_INPUTS.includes(input)) {
        event?.preventDefault();
        this.scene?.moveCamera(input);
        return;
      }
      if (input === "up") {
        event?.preventDefault();
        return this.moveFocus(-1);
      }
      if (input === "down") {
        event?.preventDefault();
        return this.moveFocus(1);
      }
      if (input === "left") {
        event?.preventDefault();
        return this.adjustFocused(-1);
      }
      if (input === "right") {
        event?.preventDefault();
        return this.adjustFocused(1);
      }
      if (input === "a") {
        event?.preventDefault();
        return this.activateFocused();
      }
      if (input === "z") {
        event?.preventDefault();
        return this.save();
      }
    },

    /**
     * Puts the d-pad on the panel's first editable control as a draft opens,
     * rather than on the header's Delete/Close buttons.
     */
    beginEditing() {
      this.fieldEditing = false;
      this.confirmingDelete = false;
      this.focusIndex = 0;
      this.$nextTick(() => {
        const items = this.panelFocusables();
        const body = this.$el?.querySelector?.(".panel__body");
        const first = items.findIndex((el) => body?.contains(el));
        this.focusAt(first >= 0 ? first : 0, items);
      });
    },

    moveStartCursor(delta: number) {
      // The arenas plus the Back row.
      const count = this.arenas.length + 1;
      this.startCursor = (this.startCursor + delta + count) % count;
      playMenuCue("move");
    },

    chooseStart(index: number) {
      this.startCursor = index;
      if (index === this.backIndex) {
        playMenuCue("back");
        return this.$emit("back");
      }
      const arena = this.arenas[index];
      if (arena) this.editArena(arena.id);
    },

    /**
     * The panel's controls, in the order they appear. Read from the DOM rather
     * than mirrored here, so it cannot drift from the template.
     */
    panelFocusables(): HTMLElement[] {
      const panel = this.$refs.panel as HTMLElement | undefined;
      if (!panel) return [];
      return [...panel.querySelectorAll<HTMLElement>("input, select, button")].filter(
        (el) => !(el as HTMLInputElement).disabled && el.offsetParent,
      );
    },

    moveFocus(delta: number) {
      const items = this.panelFocusables();
      if (!items.length) return;
      const next = (this.focusIndex + delta + items.length) % items.length;
      this.focusAt(next, items);
      playMenuCue("move");
    },

    focusAt(index: number, items?: HTMLElement[]) {
      const list = items ?? this.panelFocusables();
      const el = list[index];
      if (!el) return;
      this.focusIndex = index;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    },

    /** Left/right on the focused control, so values change without a mouse. */
    adjustFocused(delta: number) {
      const el = this.panelFocusables()[this.focusIndex];
      if (!el) return;

      if (el instanceof HTMLSelectElement) {
        const next = el.selectedIndex + delta;
        // Either end of the list is a refusal, not a silent no-op.
        if (next < 0 || next >= el.options.length) return playMenuCue("deny");
        el.selectedIndex = next;
        // v-model and @change listen for the event, not the assignment.
        el.dispatchEvent(new Event("change", { bubbles: true }));
        playMenuCue("move");
        return;
      }

      if (el instanceof HTMLInputElement) {
        if (el.type === "checkbox") {
          el.checked = !el.checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          playMenuCue("toggle");
          return;
        }
        if (el.type === "range") {
          const step = Number(el.step) || 1;
          const value = Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + step * 5 * delta));
          el.value = String(value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          playMenuCue("move");
        }
      }
    },

    /** A on the focused control: press it, or start typing into it. */
    activateFocused() {
      const el = this.panelFocusables()[this.focusIndex];
      if (!el) return;

      if (el instanceof HTMLButtonElement) {
        playMenuCue("select");
        return el.click();
      }

      if (el instanceof HTMLInputElement) {
        if (el.type === "checkbox") {
          el.checked = !el.checked;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          playMenuCue("toggle");
          return;
        }
        if (el.type === "color") {
          // Opens the browser's own picker, which takes the keyboard while up.
          playMenuCue("select");
          return el.click();
        }
        if (el.type === "text" || el.type === "") {
          // Text fields need real characters, so hand the keyboard over until Back gives it back.
          return this.startFieldEditing(el);
        }
      }

      // A dropdown or slider, which is driven with left and right rather than pressed.
      playMenuCue("deny");
    },

    startFieldEditing(el: HTMLInputElement) {
      this.fieldEditing = true;
      playMenuCue("toggle");
      el.focus({ preventScroll: true });
      el.select();
    },

    stopFieldEditing() {
      this.fieldEditing = false;
      this.panelFocusables()[this.focusIndex]?.focus({ preventScroll: true });
    },

    /**
     * Keeps the cursor wherever focus lands, so the pad and the mouse agree.
     * Only the cursor: arriving on a text field must not start typing into it.
     */
    onPanelFocusIn(event: FocusEvent) {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      const index = this.panelFocusables().indexOf(el);
      if (index >= 0) this.focusIndex = index;
    },

    /** A click into a text field is an intent to type, unlike arriving there. */
    onPanelPointerDown(event: PointerEvent) {
      const el = event.target as HTMLElement | null;
      if (el instanceof HTMLInputElement && (el.type === "text" || el.type === "")) this.fieldEditing = true;
    },

    /** A model or preview path without the folders every option shares. */
    shortPath(path: string): string {
      return path.replace(/^assets\/environments\/arenas\/shared\/(models\/|textures\/)?/, "");
    },

    /**
     * A texture's filename alone, without its folder or extension. The folder
     * is already implied by the row the dropdown sits on.
     */
    fileLabel(path: string): string {
      return path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path;
    },

    editArena(id: string) {
      if (isBundledArena(id)) return this.startClone(id);
      const arena = arenaById(id);
      if (!arena) return playMenuCue("deny");
      playMenuCue("select");
      this.editingId = id;
      this.draft = draftFromArena(arena);
      this.setStatus("", false);
      this.beginEditing();
      void this.openPreview();
    },

    startClone(id: string) {
      const source = arenaById(id);
      if (!source) return playMenuCue("deny");
      playMenuCue("select");
      // Suggested rather than final - the id field is editable while creating,
      // and the save is blocked until it is both valid and free.
      let suggested = `${id}_copy`;
      let suffix = 2;
      const taken = existingIds();
      while (taken.includes(suggested)) suggested = `${id}_copy_${suffix++}`;
      this.editingId = null;
      this.draft = cloneArena(source, suggested, `${source.displayName} copy`);
      this.setStatus("", false);
      this.beginEditing();
      void this.openPreview();
    },

    closeDraft() {
      playMenuCue("back");
      clearDraft();
      window.clearTimeout(this.previewTimer);
      this.loadToken += 1;
      this.scene?.dispose();
      this.scene = null;
      this.draft = null;
      this.editingId = null;
      this.previewReady = false;
      this.loading = false;
      this.confirmingDelete = false;
      this.fieldEditing = false;
      this.status = "";
      this.warnings = [];
      this.pruneUnusedImages();
    },

    deleteSaved() {
      const id = this.editingId;
      if (!id || this.saving) return playMenuCue("deny");
      if (!this.confirmingDelete) {
        this.confirmingDelete = true;
        this.setStatus(`Press Delete again to remove “${arenaById(id)?.displayName ?? id}” from this browser.`, true);
        return playMenuCue("toggle");
      }
      try {
        deleteArena(id);
      } catch (error) {
        this.setStatus(message(error), true);
        return playMenuCue("deny");
      }
      this.closeDraft();
      this.startCursor = Math.min(this.startCursor, this.arenas.length);
    },

    onStageChange(event: Event) {
      const draft = this.draft;
      if (!draft) return;
      // Pieces are per-stage, so this re-picks the floor, barricade and outer
      // rather than leaving three fields pointing at parts that no longer fit.
      selectStage(draft, (event.target as HTMLSelectElement).value);
    },

    /** The texture a slot currently shows, read from its first material. */
    textureValue(slot: TextureSlot): string {
      const draft = this.draft;
      if (!draft || !slot.materials.length) return "";
      return draft[slot.map][slot.materials[0]] ?? "";
    },

    setTexture(slot: TextureSlot, event: Event) {
      const draft = this.draft;
      if (!draft) return;
      const value = (event.target as HTMLSelectElement).value;
      for (const material of slot.materials) {
        // One choice covers every material the slot names, which is what makes
        // the three ropes a single control. Removing the key leaves the GLB's
        // own texture in place, unlike setting it to an empty string.
        if (value) draft[slot.map][material] = value;
        else delete draft[slot.map][material];
      }
    },

    imageRef(id: string): string {
      return userImageRef(id);
    },

    chooseImport(slot: TextureSlot) {
      if (this.importing) return playMenuCue("deny");
      this.importSlot = slot;
      (this.$refs.imagePicker as HTMLInputElement | undefined)?.click();
    },

    /** Stores the chosen file in the image library, then dresses the slot with it. */
    async onImageChosen(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      const slot = this.importSlot;
      if (!file || !slot || !this.draft) {
        this.importSlot = null;
        return;
      }
      this.importing = true;
      try {
        const { image, duplicate } = await importImageFile(file);
        const draft = this.draft;
        if (draft) {
          for (const material of slot.materials) draft[slot.map][material] = userImageRef(image.id);
        }
        this.setStatus(
          duplicate
            ? `“${image.name}” was already imported; using it for ${slot.label}.`
            : `Imported “${image.name}” (${describeImage(image)}).`,
          false,
        );
        playMenuCue("confirm");
      } catch (error) {
        this.setStatus(`Import failed: ${message(error)}`, true);
        playMenuCue("deny");
      } finally {
        this.importing = false;
        this.importSlot = null;
      }
    },

    hasColor(slot: TextureSlot, key: string): boolean {
      return !!this.draft && key in this.draft[slot.map];
    },

    tint(slot: TextureSlot, key: string): Tint {
      return parseTint(this.draft ? this.draft[slot.map][key] : undefined);
    },

    swatchValue(slot: TextureSlot, key: string): string {
      return this.tint(slot, key).hex;
    },

    alphaValue(slot: TextureSlot, key: string): number {
      return this.tint(slot, key).alpha;
    },

    setColor(slot: TextureSlot, key: string, event: Event) {
      const hex = (event.target as HTMLInputElement).value;
      // Picking a colour on an untinted slot would otherwise write a fully
      // transparent overlay and appear to do nothing, so it takes effect.
      const alpha = this.hasColor(slot, key) ? this.tint(slot, key).alpha : 100;
      this.writeColor(slot, key, { hex, alpha });
    },

    setAlpha(slot: TextureSlot, key: string, event: Event) {
      const alpha = Number((event.target as HTMLInputElement).value);
      this.writeColor(slot, key, { hex: this.tint(slot, key).hex, alpha });
    },

    writeColor(slot: TextureSlot, key: string, tint: Tint) {
      if (this.draft) this.draft[slot.map][key] = formatTint(tint);
    },

    clearColor(slot: TextureSlot, key: string) {
      if (this.draft) delete this.draft[slot.map][key];
    },

    schedulePreview() {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = window.setTimeout(() => void this.openPreview(), PREVIEW_DEBOUNCE_MS);
    },

    refreshPreview() {
      window.clearTimeout(this.previewTimer);
      void this.openPreview();
    },

    async openPreview() {
      const draft = this.draft;
      if (!draft) return;

      const token = ++this.loadToken;
      this.loading = true;
      this.warnings = [];
      await this.$nextTick();

      try {
        if (!this.scene) {
          const canvas = this.$refs.canvas as HTMLCanvasElement | undefined;
          if (!canvas) return;
          this.scene = markRaw(new ArenaScene(canvas));
        }
        const arena = draftToArenaData(draft);
        const lease = await acquireImageUrls(textureValues(arena));
        if (token !== this.loadToken || !this.scene) {
          lease.release();
          return;
        }
        const report = await this.scene.load(arena, lease);
        if (token !== this.loadToken) return;
        this.warnings = report.warnings;
        this.previewReady = true;
      } catch (error) {
        if (token !== this.loadToken) return;
        this.previewReady = false;
        this.setStatus(`Preview failed: ${message(error)}`, true);
        playMenuCue("deny");
      } finally {
        if (token === this.loadToken) this.loading = false;
      }
    },

    save() {
      const draft = this.draft;
      // A save blocked by a bad id is silent on screen, so it says so here.
      if (!draft || this.saving) return playMenuCue("deny");
      if (this.idError) {
        this.setStatus(this.idError, true);
        return playMenuCue("deny");
      }

      this.saving = true;
      try {
        const { created } = saveArena(draftToJson(draft), libraryIds());
        this.editingId = draft.id;
        this.persistDraft();
        this.setStatus(`${created ? "Created" : "Saved"} “${draft.displayName || draft.id}” in this browser.`, false);
        playMenuCue("confirm");
        this.pruneUnusedImages();
      } catch (error) {
        this.setStatus(message(error), true);
        playMenuCue("deny");
      } finally {
        this.saving = false;
      }
    },

    setStatus(text: string, bad: boolean) {
      this.status = text;
      this.statusBad = bad;
    },

    /** Parks the draft so a reload or hot update does not lose it. */
    persistDraft() {
      if (!this.draft) return;
      if (!writeDraft({ editingId: this.editingId, draft: this.draft })) {
        this.setStatus("Draft recovery is unavailable: browser storage refused the draft.", true);
      }
    },

    /** Picks a parked draft back up, if this mount followed a reload. */
    restoreDraft() {
      const recovery = readDraft();
      if (!recovery) return;
      this.draft = recovery.draft;
      this.editingId = recovery.editingId;
      this.setStatus("Recovered your unfinished arena draft.", false);
      this.beginEditing();
      void this.openPreview();
    },

    /** Imports nothing uses any more are deleted; failure only means they linger. */
    pruneUnusedImages() {
      void pruneImages(imagesInUse()).catch(() => {});
    },
  },
});
</script>

<style scoped>
fieldset.panel__body { border: 0; margin: 0; min-width: 0; }
.editor {
  position: absolute;
  inset: 0;
  background: #0b0e14;
  color: #f2f5f8;
  font-family: var(--vpg-font-body);
  overflow: hidden;
}

/* --- start screen (Configuration Menus design) ---------------------------- */

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

.start-rail {
  position: absolute;
  top: 19.2%;
  bottom: 6.2%;
  left: 3.4%;
  width: clamp(19rem, 34vw, 28rem);
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
  min-height: 0;
  z-index: 8;
  font-family: var(--vpg-font-pixel);
}

.start__warning {
  margin: 0 0.55rem 0 0.15rem;
  padding: 0.26rem 0.62rem;
  background: var(--vpg-cfg-panel-bg);
  border-left: 3px solid var(--vpg-cfg-accent-amber);
  color: var(--vpg-cfg-accent-amber);
  font-family: var(--vpg-font-pixel);
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  line-height: 1.3;
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
  gap: 0.5rem;
  min-height: 2.2rem;
  padding: 0.22rem 0.78rem;
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
  font-size: 0.68rem;
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

/* --- editing (Configuration Menus design) -------------------------------- */

.work__canvas {
  outline: none;
  background: #070914;
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

.panel {
  position: absolute;
  top: 20.5%;
  bottom: 10.5%;
  left: 3.4%;
  width: clamp(19rem, 35vw, 29.5rem);
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 0.38rem;
  z-index: 8;
  font-family: var(--vpg-font-pixel);
}

.panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem 0.55rem 0.35rem 0.2rem;
  scrollbar-color: var(--vpg-cfg-frame-border) rgba(15, 22, 46, 0.55);
}

.panel__foot {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.25rem 0.55rem 0 0.2rem;
}

.panel__actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6.2rem, 1fr));
  gap: 0.38rem;
}

.panel__status {
  margin: 0 0.55rem 0 0.2rem;
  padding: 0.36rem 0.65rem;
  background: rgba(12, 18, 40, 0.92);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
  color: #d7f8b8;
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  letter-spacing: 0.04em;
}

.panel__status--bad {
  border-left-color: var(--vpg-cfg-accent-danger);
  color: #ffb4be;
}

.group {
  margin-bottom: 0.9rem;
}

.group__title {
  margin: 0 0 0.35rem;
  padding: 0.2rem 0.55rem;
  background: var(--vpg-cfg-panel-bg);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-display);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
  margin-bottom: 0.32rem;
}

.cfg-field {
  min-height: 2.35rem;
  padding: 0.26rem 0.72rem;
  background: var(--vpg-cfg-bar-idle);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.88rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-shadow: 1px 1px 0 rgba(7, 14, 34, 0.85);
  transition: transform 90ms ease, background 90ms ease, color 90ms ease;
}

.cfg-field:focus-within {
  background: var(--vpg-cfg-bar-active);
  color: var(--vpg-cfg-text-active);
  text-shadow: none;
  transform: scaleX(1.025);
  box-shadow: 0 0 16px rgba(204, 168, 255, 0.5);
  position: relative;
  z-index: 4;
}

.panel--typing .cfg-field:focus-within {
  background: var(--vpg-cfg-bar-typing);
  color: #071324;
}

.cfg-field--disabled {
  opacity: 0.58;
}

.field__label {
  flex: 0 0 auto;
  max-width: 44%;
  font-family: var(--vpg-font-pixel);
  font-size: 0.86rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.field__input {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 58%;
  box-sizing: border-box;
  padding: 0.22rem 0.45rem;
  font-family: var(--vpg-font-pixel);
  font-size: 0.86rem;
  letter-spacing: 0.04em;
  color: var(--vpg-cfg-text);
  background: rgba(8, 12, 30, 0.86);
  border: 1px solid rgba(204, 168, 255, 0.42);
  border-radius: 0;
  outline: none;
}

.cfg-field:focus-within .field__input {
  background: #ffffff;
  color: var(--vpg-cfg-text-active);
  border-color: var(--vpg-cfg-text-active);
}

.field__input option,
.field__input optgroup {
  background: #101634;
  color: #f4f8ff;
}

.field__input:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.field__error {
  margin: 0.15rem 0 0.4rem;
  padding: 0.28rem 0.55rem;
  background: rgba(42, 10, 20, 0.88);
  border-left: 3px solid var(--vpg-cfg-accent-danger);
  font-family: var(--vpg-font-pixel);
  font-size: 0.8rem;
  color: #ffb4be;
}

.field__note {
  margin: 0.15rem 0 0.45rem;
  padding: 0.28rem 0.55rem;
  background: rgba(11, 16, 36, 0.78);
  border-left: 2px solid rgba(204, 168, 255, 0.45);
  font-family: var(--vpg-font-pixel);
  font-size: 0.78rem;
  color: #c2d4f6;
}

.btn {
  padding: 0.22rem 0.5rem;
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  color: var(--vpg-cfg-text);
  background: rgba(34, 76, 150, 0.88);
  border: 1px solid rgba(204, 168, 255, 0.45);
  border-radius: 0;
  cursor: pointer;
}

.btn:hover:not(:disabled),
.btn:focus-visible:not(:disabled) {
  outline: none;
  background: var(--vpg-cfg-frame-border);
  color: var(--vpg-cfg-text-active);
  border-color: #ffffff;
}

.btn:disabled {
  opacity: 0.38;
  cursor: default;
}

.btn--icon {
  padding: 0.16rem 0.45rem;
  line-height: 1;
}

.row__clone {
  padding: 0.16rem 0.52rem;
  font-family: var(--vpg-font-pixel);
  font-size: 0.72rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vpg-cfg-text);
  background: rgba(18, 42, 92, 0.92);
  border: 1px solid rgba(14, 7, 26, 0.55);
  border-radius: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.row__clone:hover,
.row__clone:focus-visible {
  outline: none;
  background: #0e071a;
  color: var(--vpg-cfg-accent-lime);
  border-color: var(--vpg-cfg-accent-lime);
}

.slot {
  margin-bottom: 0.4rem;
}

.slot__import {
  min-height: 1.95rem;
  margin: 0 0 0.28rem;
  padding: 0.18rem 0.72rem;
  font-size: 0.82rem;
}

.slot__label {
  display: block;
  max-width: none;
  padding: 0.25rem 0.6rem;
  margin-bottom: 0.2rem;
  background: rgba(22, 42, 88, 0.85);
  color: var(--vpg-cfg-text);
}

/* The tints sit under the texture they modify in a dark translucent retro strip. */
.tints {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.7rem;
  padding: 0.3rem 0.65rem;
  background: var(--vpg-cfg-panel-bg);
  border-left: 2px solid rgba(204, 168, 255, 0.45);
}

.tint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.tint__label {
  font-family: var(--vpg-font-pixel);
  font-size: 0.78rem;
  color: #c8d8f8;
  min-width: 2.8rem;
  text-transform: uppercase;
}

.tint__swatch {
  width: 1.75rem;
  height: 1.3rem;
  padding: 0;
  background: none;
  border: 1px solid rgba(204, 168, 255, 0.65);
  border-radius: 0;
  cursor: pointer;
}

.tint__swatch:focus-visible {
  outline: 2px solid var(--vpg-cfg-accent-lime);
  outline-offset: 1px;
}

.tint__alpha {
  width: 4.4rem;
  accent-color: var(--vpg-cfg-frame-border);
}

.tint__alpha:focus-visible {
  outline: 2px solid var(--vpg-cfg-accent-lime);
  outline-offset: 2px;
}

.toggle {
  justify-content: flex-start;
  gap: 0.55rem;
  min-height: 2.05rem;
  cursor: pointer;
}

.toggle input[type="checkbox"] {
  accent-color: var(--vpg-cfg-accent-lime);
  width: 0.95rem;
  height: 0.95rem;
}

@media (max-width: 760px) {
  .start-rail,
  .panel {
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
