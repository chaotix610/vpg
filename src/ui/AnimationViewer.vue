<!--
  Animation Viewer styled with the reusable Configuration Menus design system
  (`docs/ui/configuration-menus.md`). The Babylon side stays in plain TypeScript
  (`src/render/viewer/`); MainMenu loads this component lazily so Babylon stays
  out of the Main Menu bundle.
-->
<template>
  <ConfigScreenShell
    aria-label="Animation Viewer"
    :screen-class="panelHidden ? 'viewer viewer--panel-hidden' : 'viewer'"
  >
    <ConfigPreviewBooth
      :layout="panelHidden ? 'fullscreen' : 'framed-rail'"
      :center-x="panelHidden ? 500 : 660"
    >
      <canvas ref="canvas" class="stage-canvas" />

      <template v-if="vs.clipName" #hud-top-left>
        <span class="booth-pill">{{ vs.clipName }}</span>
      </template>

      <template #hud-bottom>
        <span v-if="vs.character" class="booth-pill booth-pill--name">
          {{ characterLabel(vs.character) }}
        </span>
        <span class="booth-pill">{{ vs.hasClip ? (vs.playing ? "PLAYING" : "PAUSED") : "NO CLIP" }}</span>
        <span class="booth-pill booth-pill--dim">{{ timeText }}</span>
      </template>
    </ConfigPreviewBooth>

    <ConfigBreadcrumbHeader
      v-if="!panelHidden"
      top="COMMISSIONER"
      second="Animation Viewer"
      back-label="BACK"
      @back="back"
    />

    <aside
      v-show="!panelHidden"
      class="panel"
      aria-label="Animation viewer menu"
      :aria-hidden="panelHidden"
    >
      <ul class="rows" role="menu" aria-label="Viewer options">
        <li
          v-for="(row, index) in rows"
          :key="row.key"
          class="row"
          role="menuitem"
          :class="{
            'row--active': index === cursor && !picker,
            'row--typing': row.key === 'search' && typing,
            'row--action': row.key === 'back',
          }"
          :aria-label="row.value ? `${row.label}: ${row.value}` : row.label"
          @mouseenter="hover(index)"
          @click="clickRow(index)"
        >
          <button
            v-if="row.key === 'back'"
            type="button"
            class="row__back"
            @focus="hover(index)"
            @click.stop="back"
            @keydown.enter.prevent.stop="activate(cursor)"
            @keydown.space.prevent.stop="activate(cursor)"
          ><span aria-hidden="true">&larr;</span> {{ row.label }}</button>
          <span v-else class="row__label">{{ row.label }}</span>
          <span v-if="row.key === 'search'" class="row__value">
            <input
              ref="search"
              v-model="filter"
              class="row__search"
              type="search"
              placeholder="Press A to type"
              autocomplete="off"
              spellcheck="false"
              :disabled="!catalog"
              aria-label="Filter animations"
              @focus="startTyping"
              @blur="typing = false"
              @click.stop
            />
          </span>
          <span v-else-if="row.value" class="row__value">
            <button
              v-if="row.adjustable"
              class="row__arrow"
              type="button"
              tabindex="-1"
              :aria-label="`Previous ${row.label}`"
              @mousedown.prevent
              @click.stop="adjust(index, -1)"
            >&#9664;</button>
            <span class="row__text">{{ row.value }}</span>
            <button
              v-if="row.adjustable"
              class="row__arrow"
              type="button"
              tabindex="-1"
              :aria-label="`Next ${row.label}`"
              @mousedown.prevent
              @click.stop="adjust(index, 1)"
            >&#9654;</button>
          </span>
          <span v-if="row.detail" class="row__detail">{{ row.detail }}</span>
        </li>
      </ul>

      <section class="timeline" aria-label="Timeline">
        <p class="timeline__name">{{ vs.clipName || "—" }}</p>
        <input
          class="timeline__scrub"
          type="range"
          step="any"
          :min="vs.from"
          :max="vs.to"
          :value="vs.frame"
          :disabled="!vs.hasClip"
          aria-label="Timeline"
          @input="scrub"
          @change="($event.target as HTMLInputElement).blur()"
        />
        <p class="timeline__time">{{ timeText }}</p>
      </section>

      <p class="status" :class="{ 'status--error': vs.error }" :title="vs.status" role="status">{{ vs.status }}</p>
    </aside>

    <!-- List picker for characters, folders and clips, opened with A. -->
    <div v-if="picker" class="modal" @click="closePicker">
      <div class="modal__box" role="dialog" aria-modal="true" :aria-label="pickerTitle" @click.stop @wheel.prevent="wheelPicker">
        <header class="modal__head">
          <h2 class="modal__title">{{ pickerTitle }}</h2>
          <p class="modal__count">{{ pickerItems.length ? `${picker.cursor + 1} / ${pickerItems.length}` : "NOTHING TO CHOOSE" }}</p>
        </header>
        <ul class="picker" role="listbox" :aria-label="pickerTitle">
          <li
            v-for="(item, k) in pickerWindow"
            :key="item.value"
            class="picker__item"
            role="option"
            :aria-selected="picker.offset + k === picker.cursor"
            :class="{
              'picker__item--active': picker.offset + k === picker.cursor,
              'picker__item--current': item.value === pickerCurrent,
            }"
            @mouseenter="picker.cursor = picker.offset + k"
            @click="choose(picker.offset + k)"
          >
            {{ item.label }}
          </li>
        </ul>
        <p class="modal__close">
          <img :src="icons.dPad.src" :alt="icons.dPad.alt" /> MOVE
          &middot; <img :src="icons.dPad.src" alt="" /> &#9664;&#9654; PAGE
          &middot; <img :src="icons.a.src" :alt="icons.a.alt" /> CHOOSE
          &middot; <img :src="icons.b.src" :alt="icons.b.alt" /> CLOSE
        </p>
      </div>
    </div>

    <ConfigControllerBar :hints="controllerHints" />
  </ConfigScreenShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { baseName, dirName } from "@/content/animationLibrary";
import { playMenuCue } from "@/audio/menuAudio";
import { startAnimationViewer, type AnimationViewerHandle, type ViewerCatalog, type ViewerState } from "@/render/viewer";
import {
  isMenuDown,
  isMenuUp,
  pollGamepadBindings,
  virtualInputFor,
  virtualInputForBinding,
  type VirtualInput,
} from "@/input/VirtualController";
import { loadControllerIcons, type ControllerHintItem } from "@/ui/controllerIcons";
import {
  ConfigBreadcrumbHeader,
  ConfigControllerBar,
  ConfigPreviewBooth,
  ConfigScreenShell,
} from "@/ui/configuration-menus";

const emit = defineEmits<{ back: [] }>();

const icons = loadControllerIcons();

const ALL = "*";
const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2];
/** Rows the picker shows at once. Lists run to thousands of clips, so only a window is drawn. */
const PICKER_ROWS = 11;
/** How far ◀/▶ jump in the picker. */
const PICKER_PAGE = 10;
/** Camera speeds while a C button is held. */
const ORBIT_RATE = 1.8;   // radians per second
const ZOOM_RATE = 1.6;    // radius scale per second

type RowKey = "character" | "folder" | "animation" | "search" | "playback" | "speed" | "loop" | "follow" | "back";
type PickerKind = "character" | "folder" | "animation";

interface Row {
  key: RowKey;
  label: string;
  value: string;
  /** Extra text under the value, e.g. the clip's place in its list. */
  detail?: string;
  /** Shows ◀ ▶ and responds to left/right. */
  adjustable: boolean;
}

interface Option {
  value: string;
  label: string;
}

// ------------------------------------------------------------ state

const canvas = ref<HTMLCanvasElement | null>(null);
const search = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
const catalog = shallowRef<ViewerCatalog | null>(null);
const vs = reactive<ViewerState>({
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
});

const cursor = ref(0);
const folder = ref(ALL);
const filter = ref("");
const typing = ref(false);
const panelHidden = ref(false);
const speedIndex = ref(SPEEDS.indexOf(1));
const loop = ref(true);
const follow = ref(true);
const picker = ref<{ kind: PickerKind; cursor: number; offset: number } | null>(null);

let handle: AnimationViewerHandle | null = null;

// ------------------------------------------------------------ derived lists

const folderOptions = computed<Option[]>(() => {
  const cat = catalog.value;
  if (!cat) return [];
  const options: Option[] = [{ value: ALL, label: `All folders (${cat.clips.length})` }];
  for (const [path, clips] of cat.folders) {
    options.push({ value: path, label: `${path ? path.split("/").join(" / ") : "(top level)"} (${clips.length})` });
  }
  return options;
});

/** Clips in the current folder that match every word of the filter. */
const clips = computed<string[]>(() => {
  const cat = catalog.value;
  if (!cat) return [];
  const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = folder.value === ALL ? cat.clips : cat.folders.get(folder.value) ?? [];
  return words.length ? list.filter((p) => words.every((w) => p.toLowerCase().includes(w))) : list;
});

const clipIndex = computed(() => (vs.clip ? clips.value.indexOf(vs.clip) : -1));

const clipLabel = (path: string) => (folder.value === ALL ? path.replace(/\.glb$/i, "") : baseName(path));
const characterLabel = (key: string) => catalog.value?.characterLabels.get(key) ?? baseName(key);

const rows = computed<Row[]>(() => {
  const cat = catalog.value;
  const folderLabel = folderOptions.value.find((o) => o.value === folder.value)?.label ?? "";
  const n = clips.value.length;
  return [
    { key: "character", label: "Character", value: cat ? characterLabel(vs.character ?? cat.startCharacter) : "…", adjustable: !!cat },
    { key: "folder", label: "Folder", value: cat ? folderLabel : "…", adjustable: !!cat },
    {
      key: "animation",
      label: "Animation",
      value: !cat ? "…" : clipIndex.value >= 0 ? baseName(vs.clip!) : n ? "None selected" : "No matches",
      detail: cat ? `${clipIndex.value >= 0 ? clipIndex.value + 1 : "–"} / ${n}` : undefined,
      adjustable: n > 0,
    },
    { key: "search", label: "Search", value: filter.value, adjustable: false },
    { key: "playback", label: "Playback", value: vs.hasClip ? (vs.playing ? "Playing" : "Paused") : "—", adjustable: vs.hasClip },
    { key: "speed", label: "Speed", value: `${SPEEDS[speedIndex.value]}×`, adjustable: true },
    { key: "loop", label: "Loop", value: loop.value ? "On" : "Off", adjustable: true },
    { key: "follow", label: "Camera Follow", value: follow.value ? "On" : "Off", adjustable: true },
    { key: "back", label: "Back to Menu", value: "", adjustable: false },
  ];
});

const timeText = computed(() => {
  if (!vs.hasClip) return "0.00 / 0.00 s";
  const elapsed = ((vs.frame - vs.from) / vs.fps).toFixed(2);
  const total = ((vs.to - vs.from) / vs.fps).toFixed(2);
  const frame = Math.round(((vs.frame - vs.from) * 30) / vs.fps);
  const frames = Math.round(((vs.to - vs.from) * 30) / vs.fps);
  return `${elapsed} / ${total} s · frame ${frame} / ${frames}`;
});

const controllerHints = computed<ControllerHintItem[]>(() => {
  if (panelHidden.value) {
    return [
      { icons: ["z"], label: "SHOW MENU" },
      { icons: ["start"], label: vs.playing ? "PAUSE" : "PLAY" },
      { icons: ["l", "r"], label: "CLIP" },
      { icons: ["c"], label: "CAMERA" },
      { icons: ["b"], label: "BACK" },
    ];
  }
  return [
    { icons: ["dPad"], label: "MOVE · ◀▶ CHANGE" },
    { icons: ["a"], label: "SELECT" },
    { icons: ["start"], label: vs.playing ? "PAUSE" : "PLAY" },
    { icons: ["l", "r"], label: "CLIP" },
    { icons: ["c"], label: "CAMERA" },
    { icons: ["z"], label: "HIDE MENU" },
    { icons: ["b"], label: "BACK" },
  ];
});

// ------------------------------------------------------------ picker

const PICKER_TITLES: Record<PickerKind, string> = { character: "Character", folder: "Folder", animation: "Animation" };
const pickerTitle = computed(() => (picker.value ? PICKER_TITLES[picker.value.kind] : ""));

const pickerItems = computed<Option[]>(() => {
  const kind = picker.value?.kind;
  if (kind === "character") return (catalog.value?.characters ?? []).map((f) => ({ value: f, label: characterLabel(f) }));
  if (kind === "folder") return folderOptions.value;
  if (kind === "animation") return clips.value.map((p) => ({ value: p, label: clipLabel(p) }));
  return [];
});

const pickerCurrent = computed(() => {
  const kind = picker.value?.kind;
  if (kind === "character") return vs.character;
  if (kind === "folder") return folder.value;
  return vs.clip;
});

const pickerWindow = computed(() => {
  const p = picker.value;
  return p ? pickerItems.value.slice(p.offset, p.offset + PICKER_ROWS) : [];
});

function openPicker(kind: PickerKind) {
  picker.value = { kind, cursor: 0, offset: 0 };
  const items = pickerItems.value;
  if (!items.length) {
    picker.value = null;
    return playMenuCue("deny");
  }
  const current = Math.max(0, items.findIndex((o) => o.value === pickerCurrent.value));
  const offset = Math.min(Math.max(0, current - Math.floor(PICKER_ROWS / 2)), Math.max(0, items.length - PICKER_ROWS));
  picker.value = { kind, cursor: current, offset };
  playMenuCue("select");
}

function closePicker() {
  picker.value = null;
  playMenuCue("back");
}

/** Moves the picker cursor, wrapping on single presses and stopping at the ends on held or paged moves. */
function movePicker(delta: number, wrap: boolean) {
  const p = picker.value;
  const n = pickerItems.value.length;
  if (!p || !n) return;
  let next = p.cursor + delta;
  if (wrap) next = (next + n) % n;
  else next = Math.min(Math.max(next, 0), n - 1);
  if (next === p.cursor) return playMenuCue("deny");
  p.cursor = next;
  if (next < p.offset) p.offset = next;
  else if (next >= p.offset + PICKER_ROWS) p.offset = next - PICKER_ROWS + 1;
  playMenuCue("move");
}

function wheelPicker(event: WheelEvent) {
  if (event.deltaY) movePicker(Math.sign(event.deltaY) * 3, false);
}

function choose(index: number) {
  const p = picker.value;
  const item = pickerItems.value[index];
  if (!p || !item) return;
  picker.value = null;
  playMenuCue("select");
  if (p.kind === "character") setCharacter(item.value);
  else if (p.kind === "folder") selectFolder(item.value);
  else loadClip(item.value);
}

// ------------------------------------------------------------ actions

function setCharacter(file: string) {
  if (file !== vs.character) handle?.loadCharacter(file);
}

function loadClip(path: string) {
  if (path !== vs.clip) handle?.loadClip(path);
}

function cycle<T>(list: readonly T[], current: T, delta: number): T {
  const index = list.indexOf(current);
  return list[(index + delta + list.length) % list.length];
}

function selectFolder(value: string) {
  folder.value = value;
  filter.value = "";
  // Land on a clip from the new folder, unless the playing one is already in it.
  if (clipIndex.value < 0 && clips.value.length) loadClip(clips.value[0]);
}

/** Next or previous clip in the list. Stops at the ends, so reaching one is audible. */
function stepClip(delta: number) {
  const list = clips.value;
  if (!list.length) return playMenuCue("deny");
  const current = clipIndex.value;
  const next = current < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.min(Math.max(current + delta, 0), list.length - 1);
  if (next === current) return playMenuCue("deny");
  playMenuCue("move");
  loadClip(list[next]);
}

function togglePlay() {
  if (!vs.hasClip) return playMenuCue("deny");
  handle?.togglePlay();
  playMenuCue("toggle");
}

/** Left/right on a row. */
function adjust(index: number, delta: number) {
  cursor.value = index;
  const cat = catalog.value;
  switch (rows.value[index].key) {
    case "character":
      if (!cat) return playMenuCue("deny");
      playMenuCue("move");
      return setCharacter(cycle(cat.characters, vs.character ?? cat.startCharacter, delta));
    case "folder":
      if (!cat) return playMenuCue("deny");
      playMenuCue("move");
      return selectFolder(cycle(folderOptions.value.map((o) => o.value), folder.value, delta));
    case "animation":
      return stepClip(delta);
    case "search":
      // ◀ clears the filter; there is no text entry on a pad.
      if (delta < 0 && filter.value) {
        filter.value = "";
        return playMenuCue("back");
      }
      return playMenuCue("deny");
    case "playback":
      if (!vs.hasClip) return playMenuCue("deny");
      handle?.stepFrame(delta);
      return playMenuCue("move");
    case "speed": {
      const next = Math.min(Math.max(speedIndex.value + delta, 0), SPEEDS.length - 1);
      if (next === speedIndex.value) return playMenuCue("deny");
      speedIndex.value = next;
      return playMenuCue("move");
    }
    case "loop":
      loop.value = !loop.value;
      return playMenuCue("toggle");
    case "follow":
      follow.value = !follow.value;
      return playMenuCue("toggle");
    case "back":
      return playMenuCue("deny");
  }
}

/** A on a row. */
function activate(index: number) {
  cursor.value = index;
  switch (rows.value[index].key) {
    case "character":
    case "folder":
    case "animation":
      if (!catalog.value) return playMenuCue("deny");
      return openPicker(rows.value[index].key as PickerKind);
    case "search":
      return focusSearch();
    case "playback":
      return togglePlay();
    case "speed":
      speedIndex.value = (speedIndex.value + 1) % SPEEDS.length;
      return playMenuCue("move");
    case "loop":
    case "follow":
      return adjust(index, 1);
    case "back":
      return back();
  }
}

function move(delta: number) {
  const n = rows.value.length;
  cursor.value = (cursor.value + delta + n) % n;
  if (rows.value[cursor.value].key !== "back" && document.activeElement instanceof HTMLButtonElement &&
      document.activeElement.classList.contains("row__back")) document.activeElement.blur();
  playMenuCue("move");
}

function hover(index: number) {
  if (!picker.value) cursor.value = index;
}

function clickRow(index: number) {
  if (picker.value) return;
  activate(index);
}

function togglePanel() {
  panelHidden.value = !panelHidden.value;
  if (panelHidden.value) searchInput()?.blur();
  playMenuCue("toggle");
}

function scrub(event: Event) {
  handle?.seek(Number((event.target as HTMLInputElement).value));
}

// ------------------------------------------------------------ search field

function searchInput(): HTMLInputElement | null {
  const el = search.value;
  return Array.isArray(el) ? el[0] ?? null : el;
}

function focusSearch() {
  if (!catalog.value) return playMenuCue("deny");
  playMenuCue("select");
  void nextTick(() => searchInput()?.focus());
}

function startTyping() {
  typing.value = true;
  cursor.value = rows.value.findIndex((r) => r.key === "search");
}

/** Leaves the search field. Committing (Enter) loads the first match when the playing clip was filtered out. */
function stopTyping(commit: boolean) {
  searchInput()?.blur();
  if (commit && clipIndex.value < 0 && clips.value.length) loadClip(clips.value[0]);
  playMenuCue(commit ? "confirm" : "back");
}

// ------------------------------------------------------------ input

/** Directions that repeat while held, on the keyboard and the pad alike. */
const REPEATABLE = new Set<VirtualInput>(["up", "down", "left", "right", "stickUp", "stickDown", "stickLeft", "stickRight"]);
/** Inputs that act for as long as they are held: the camera. */
const CAMERA = new Set<VirtualInput>(["cUp", "cDown", "cLeft", "cRight"]);
const held = new Set<VirtualInput>();

function onInput(input: VirtualInput, repeat: boolean) {
  if (CAMERA.has(input)) return;     // handled per frame while held
  if (repeat && !REPEATABLE.has(input)) return;
  if (input === "start") return togglePlay();

  if (typing.value) {
    // Only reachable from a pad: the keyboard goes to the field while typing.
    if (input === "a" || input === "b") return stopTyping(input === "a");
    if (isMenuUp(input) || isMenuDown(input)) {
      stopTyping(false);
      return move(isMenuUp(input) ? -1 : 1);
    }
    return;
  }

  const isLeft = input === "left" || input === "stickLeft";
  const isRight = input === "right" || input === "stickRight";

  if (picker.value) {
    if (isMenuUp(input)) return movePicker(-1, !repeat);
    if (isMenuDown(input)) return movePicker(1, !repeat);
    if (isLeft || input === "l") return movePicker(-PICKER_PAGE, false);
    if (isRight || input === "r") return movePicker(PICKER_PAGE, false);
    if (input === "a") return choose(picker.value.cursor);
    if (input === "b") return closePicker();
    return;
  }

  if (panelHidden.value) {
    // With the menu hidden the d-pad steps through clips; anything menu-like brings it back.
    if (isLeft || input === "l") return stepClip(-1);
    if (isRight || input === "r") return stepClip(1);
    if (isMenuUp(input) || isMenuDown(input) || input === "a" || input === "b" || input === "z") return togglePanel();
    return;
  }

  if (isMenuUp(input)) return move(-1);
  if (isMenuDown(input)) return move(1);
  if (isLeft) return adjust(cursor.value, -1);
  if (isRight) return adjust(cursor.value, 1);
  if (input === "a") return activate(cursor.value);
  if (input === "b") return back();
  if (input === "l") return stepClip(-1);
  if (input === "r") return stepClip(1);
  if (input === "z") return togglePanel();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  if (typing.value) {
    // The field owns the keyboard (bound letters included) until it is left.
    if (event.key === "Enter") stopTyping(true);
    else if (event.key === "Escape" || event.key === "Tab") stopTyping(false);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      stopTyping(false);
      move(event.key === "ArrowUp" ? -1 : 1);
    } else return;
    event.preventDefault();
    return;
  }

  const input = virtualInputFor(event);
  if (!input) return;
  event.preventDefault();
  if (CAMERA.has(input)) held.add(input);
  onInput(input, event.repeat);
}

function onKeyUp(event: KeyboardEvent) {
  const input = virtualInputFor(event);
  if (input) held.delete(input);
}

function releaseAll() {
  held.clear();
}

let frame = 0;
let lastTime = 0;
function tickCamera(time: number) {
  const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
  lastTime = time;
  if (handle && held.size && dt) {
    const orbit = (held.has("cLeft") ? 1 : 0) - (held.has("cRight") ? 1 : 0);
    const zoom = (held.has("cDown") ? 1 : 0) - (held.has("cUp") ? 1 : 0);
    if (orbit) handle.orbit(orbit * ORBIT_RATE * dt, 0);
    if (zoom) handle.zoom(Math.pow(ZOOM_RATE, zoom * dt));
  }
  frame = requestAnimationFrame(tickCamera);
}

function back() {
  playMenuCue("back");
  // Deferred: the B press that triggered this is still being delivered (keydown
  // reaches MainMenu's window listener after this document listener, and both
  // poll the gamepad in the same frame). Closing synchronously would let the
  // menu see the same press with the viewer already gone and back out a page.
  setTimeout(() => emit("back"));
}

// ------------------------------------------------------------ lifecycle

watch(speedIndex, (i) => handle?.setSpeed(SPEEDS[i]));
watch(loop, (value) => handle?.setLoop(value));
watch(follow, (value) => handle?.setFollow(value));

const cleanups: (() => void)[] = [];

onMounted(() => {
  handle = startAnimationViewer(canvas.value!, (state) => Object.assign(vs, state), {
    speed: SPEEDS[speedIndex.value],
    loop: loop.value,
    follow: follow.value,
  });
  void handle.ready.then((cat) => {
    if (!cat) return;
    catalog.value = cat;
    folder.value = dirName(cat.startClip);
  });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  cleanups.push(() => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", releaseAll);
  });
  cleanups.push(pollGamepadBindings(
    (binding, repeat) => {
      const input = virtualInputForBinding(binding);
      if (!input) return;
      if (CAMERA.has(input)) held.add(input);
      onInput(input, repeat);
    },
    {
      onRelease(binding) {
        const input = virtualInputForBinding(binding);
        if (input) held.delete(input);
      },
      repeat(binding) {
        const input = virtualInputForBinding(binding);
        return !!input && REPEATABLE.has(input);
      },
    },
  ));
  frame = requestAnimationFrame(tickCamera);
  cleanups.push(() => cancelAnimationFrame(frame));
});

onBeforeUnmount(() => {
  for (const cleanup of cleanups) cleanup();
  handle?.dispose();
  handle = null;
});
</script>

<style scoped>
/* ----------------------------------------------------------- Booth HUD pills */

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

/* ----------------------------------------------------------- Overlapping left rail */

.panel {
  position: absolute;
  top: 19.2%;
  bottom: 6.2%;
  left: 3.4%;
  width: clamp(19rem, 34.5vw, 28.5rem);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-height: 0;
  overflow-y: auto;
  padding: 0.15rem 0.55rem 0.15rem 0.15rem;
  scrollbar-color: var(--vpg-cfg-frame-border) rgba(15, 22, 46, 0.55);
  z-index: 8;
  font-family: var(--vpg-font-pixel);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.24rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 0.65rem;
  min-height: 2.05rem;
  padding: 0.2rem 0.72rem;
  border: 0;
  border-radius: 0;
  background: var(--vpg-cfg-bar-idle);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.86rem;
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

.row--active {
  background: var(--vpg-cfg-bar-active);
  color: var(--vpg-cfg-text-active);
  text-shadow: none;
  transform: scaleX(1.03);
  box-shadow: 0 0 16px rgba(204, 168, 255, 0.55);
  z-index: 4;
}

/* Typing beats active: electric cyan edit highlight matching Configuration Menus. */
.row--typing {
  background: var(--vpg-cfg-bar-typing);
  color: #071324;
  text-shadow: none;
  transform: scaleX(1.03);
  box-shadow: 0 0 18px rgba(124, 200, 255, 0.65);
  z-index: 5;
}

.row--action {
  grid-template-columns: 1fr;
  justify-items: center;
  margin-top: 0.12rem;
}

.row__label {
  white-space: nowrap;
}

.row__back {
  width: 100%;
  padding: 0.18rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.row__back:focus-visible {
  outline: none;
}

.row__value {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  min-width: 0;
}

.row__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #d6e4ff;
}

.row--active .row__text,
.row--typing .row__text {
  color: inherit;
}

.row__detail {
  grid-column: 2;
  justify-self: end;
  margin-right: 1.3rem;
  font-size: 0.72rem;
  opacity: 0.78;
  font-variant-numeric: tabular-nums;
}

.row__arrow {
  flex: none;
  padding: 0 0.2rem;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.74rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.78;
}

.row--active .row__arrow,
.row__arrow:hover {
  opacity: 1;
}

.row__search {
  width: 100%;
  min-width: 0;
  padding: 0.2rem 0.45rem;
  border: 1px solid rgba(204, 168, 255, 0.45);
  border-radius: 0;
  background: rgba(8, 12, 30, 0.86);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.84rem;
  letter-spacing: 0.04em;
  text-transform: none;
  outline: none;
}

.row__search::placeholder {
  color: #93a6cb;
}

.row--active .row__search,
.row--typing .row__search {
  background: #ffffff;
  color: var(--vpg-cfg-text-active);
  border-color: var(--vpg-cfg-text-active);
}

/* ----------------------------------------------------------- Timeline & Status */

.timeline {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  padding: 0.38rem 0.65rem;
  background: var(--vpg-cfg-panel-bg);
  border: 1px solid rgba(204, 168, 255, 0.45);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
}

.timeline__name {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vpg-cfg-accent-lime);
  font-size: 0.84rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.timeline__scrub {
  width: 100%;
  accent-color: var(--vpg-cfg-frame-border);
}

.timeline__time {
  margin: 0;
  color: #c8d8f8;
  font-size: 0.74rem;
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
}

.status {
  margin: 0;
  padding: 0.24rem 0.6rem;
  background: rgba(12, 18, 40, 0.88);
  border-left: 3px solid rgba(204, 168, 255, 0.55);
  color: #c2d4f6;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status--error {
  border-left-color: var(--vpg-cfg-accent-danger);
  color: #ffb4be;
  white-space: normal;
  word-break: break-word;
}

/* ----------------------------------------------------------- Picker Modal */

.modal {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgba(6, 4, 18, 0.78);
}

.modal__box {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  width: min(92vw, 36rem);
  max-height: 88vh;
  padding: 1rem 1.15rem;
  background: var(--vpg-cfg-modal-bg);
  border: 4px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 32px rgba(176, 118, 255, 0.45);
}

.modal__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--vpg-cfg-accent-lime);
}

.modal__title {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-size: 1.2rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.modal__count {
  margin: 0;
  font-family: var(--vpg-font-pixel);
  font-size: 0.86rem;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.picker__item {
  overflow: hidden;
  padding: 0.36rem 0.72rem;
  border: 1px solid rgba(154, 184, 240, 0.28);
  background: rgba(33, 66, 130, 0.85);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.88rem;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  -webkit-font-smoothing: none;
  cursor: pointer;
}

.picker__item--current {
  border-color: var(--vpg-cfg-accent-lime);
}

.picker__item--current::before {
  content: "● ";
  color: var(--vpg-cfg-accent-lime);
}

.picker__item--active {
  background: var(--vpg-cfg-frame-border);
  color: var(--vpg-cfg-text-active);
  border-color: #ffffff;
}

.picker__item--active.picker__item--current::before {
  color: var(--vpg-cfg-text-active);
}

.modal__close {
  margin: 0.15rem 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  color: #c2d4f6;
}

.modal__close img {
  width: 1.05rem;
  height: 1.05rem;
  object-fit: contain;
}

@media (max-width: 760px) {
  .panel {
    top: 48%;
    bottom: 2.6rem;
    left: 1rem;
    right: 1rem;
    width: auto;
  }
}
</style>
