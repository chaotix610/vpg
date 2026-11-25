<!--
  Menu screen for the animation viewer. The Babylon side is plain TypeScript
  (src/render/viewer/); this component is its menu, drawn and driven like the
  rest of the app's menus: a cursor over rows, moved by the d-pad or stick and
  worked by the same virtual controller, so rebinding in Commissioner →
  Controls applies here too. MainMenu loads it on demand, so Babylon stays out
  of the menu's chunk.
-->
<template>
  <main class="viewer" :class="{ 'viewer--panel-hidden': panelHidden }">
    <aside class="panel" :style="panelStyle" aria-label="Animation viewer menu" :aria-hidden="panelHidden">
      <h1 class="panel__title">Animation Viewer</h1>

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

      <p class="status" :class="{ 'status--error': vs.error }" role="status">{{ vs.status }}</p>

      <p class="hint">
        <span><img :src="icons.dPad" alt="D-Pad" /> move &middot; &#9664;&#9654; change</span>
        <span><img :src="icons.a" alt="A button" /> select</span>
        <span><img :src="icons.start" alt="Start" /> play</span>
        <span><img :src="icons.l" alt="L" /><img :src="icons.r" alt="R" /> clip</span>
        <span><img :src="icons.c" alt="C buttons" /> camera</span>
        <span><img :src="icons.z" alt="Z button" /> hide</span>
        <span><img :src="icons.b" alt="B button" /> back</span>
      </p>
    </aside>

    <div class="viewport">
      <canvas ref="canvas"></canvas>
      <p v-if="panelHidden" class="viewport__hint">
        <img :src="icons.z" alt="Z button" /> menu
        &middot; <img :src="icons.start" alt="Start" /> play
        &middot; <img :src="icons.l" alt="L" /><img :src="icons.r" alt="R" /> clip
      </p>
    </div>

    <!-- List picker for characters, folders and clips, opened with A. -->
    <div v-if="picker" class="modal" @click="closePicker">
      <div class="modal__box" role="dialog" aria-modal="true" :aria-label="pickerTitle" @click.stop @wheel.prevent="wheelPicker">
        <h2 class="modal__title">{{ pickerTitle }}</h2>
        <p class="modal__count">{{ pickerItems.length ? `${picker.cursor + 1} / ${pickerItems.length}` : "Nothing to choose" }}</p>
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
          <img :src="icons.dPad" alt="D-Pad" /> move
          &middot; <img :src="icons.dPad" alt="" /> &#9664;&#9654; page
          &middot; <img :src="icons.a" alt="A button" /> choose
          &middot; <img :src="icons.b" alt="B button" /> close
        </p>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from "vue";
import { baseName, dirName } from "@/content/animationLibrary";
import { requireAsset } from "@/content/assets";
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

const emit = defineEmits<{ back: [] }>();

const icons = {
  dPad: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-D-Pad.svg"),
  a: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-A.svg"),
  b: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-B.svg"),
  z: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-D-Z.svg"),
  start: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-Start.svg"),
  l: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-L.svg"),
  r: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-R.svg"),
  c: requireAsset("assets/ui/textures/controller/ButtonIcon-N64-C.svg"),
};
const panelStyle = {
  backgroundImage: `linear-gradient(rgba(11, 14, 20, 0.8), rgba(11, 14, 20, 0.92)), url(${requireAsset("assets/ui/textures/artwork/crowd-1.png")})`,
};

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
.viewer {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: minmax(19rem, 23rem) 1fr;
  background: #15171c;
  color: #f2f5f8;
  font-family: var(--vpg-font-body);
}

.viewer--panel-hidden {
  grid-template-columns: 0 1fr;
}

.viewer--panel-hidden .panel {
  visibility: hidden;
}

/* ----------------------------------------------------------- panel */

.panel {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  min-width: 0;
  padding: 1.25rem 1rem 1rem;
  overflow-y: auto;
  border-right: var(--vpg-frame-width) solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 22px rgba(173, 216, 230, 0.18);
  background-size: cover;
  background-position: center;
  z-index: 1;
}

.panel__title {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-size: clamp(1.25rem, 2.2vw, 1.7rem);
  font-weight: 400;
  letter-spacing: 0.1em;
  text-align: center;
  text-transform: uppercase;
}

/* Rows share the menu's type and cursor (see ControlMapper's rows). */
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 0.75rem;
  min-height: 2.5rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid #ffffff18;
  border-left: 3px solid transparent;
  border-radius: 0.3rem;
  background: rgba(20, 26, 36, 0.85);
  color: var(--vpg-item-color-idle);
  font-family: var(--vpg-font-menu-item);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  -webkit-text-stroke-width: 0.5px;
  -webkit-text-stroke-color: var(--vpg-item-stroke);
  cursor: pointer;
  user-select: none;
  transition: -webkit-text-fill-color var(--vpg-state-transition),
    -webkit-text-stroke-width var(--vpg-state-transition);
}

.row--active {
  border-left-color: var(--vpg-item-color-active);
  background: rgba(242, 143, 61, 0.14);
  -webkit-text-fill-color: var(--vpg-item-color-active);
  -webkit-text-stroke-width: 1px;
  animation: glowPulse 1s ease-in-out infinite;
}

/* Typing beats active: the row is taking text, not merely selected. */
.row--typing {
  border-left-color: #6ea8ff;
  background: rgba(110, 168, 255, 0.16);
  -webkit-text-fill-color: #cfe0ff;
  animation: none;
}

.row--action {
  grid-template-columns: 1fr;
  justify-items: center;
  margin-top: 0.25rem;
}

.row__label {
  white-space: nowrap;
}

.row__back {
  width: 100%;
  padding: 0.2rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.row__back:focus-visible {
  outline: 2px solid var(--vpg-item-color-active);
  outline-offset: 2px;
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
  color: #cfdaea;
}

.row__detail {
  grid-column: 2;
  justify-self: end;
  margin-right: 1.4rem;
  font-size: 0.68rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.row__arrow {
  flex: none;
  padding: 0 0.15rem;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.7rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.55;
}

.row--active .row__arrow,
.row__arrow:hover {
  opacity: 1;
}

.row__search {
  width: 100%;
  min-width: 0;
  padding: 0.2rem 0.4rem;
  border: 1px solid #ffffff30;
  border-radius: 0.2rem;
  background: rgba(0, 0, 0, 0.35);
  color: #f2f5f8;
  -webkit-text-fill-color: #f2f5f8;
  -webkit-text-stroke-width: 0;
  font-family: var(--vpg-font-body);
  font-size: 0.8rem;
  font-weight: 400;
  letter-spacing: 0.02em;
  text-transform: none;
  outline: none;
}

.row__search::placeholder {
  color: #8d97a8;
  -webkit-text-fill-color: #8d97a8;
}

.row--typing .row__search {
  border-color: #6ea8ff;
}

/* ----------------------------------------------------------- timeline */

.timeline {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid #ffffff18;
  border-radius: 0.3rem;
  background: rgba(20, 26, 36, 0.85);
}

.timeline__name {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vpg-item-color-active);
  font-size: 0.95rem;
  letter-spacing: 0.04em;
}

.timeline__scrub {
  width: 100%;
  accent-color: var(--vpg-item-color-active);
}

.timeline__time {
  margin: 0;
  color: #aab4c4;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.status {
  min-height: 2.6em;
  margin: 0;
  color: #aab4c4;
  font-family: system-ui, sans-serif;
  font-size: 0.72rem;
  word-break: break-word;
}

.status--error {
  color: #ff6b6b;
}

/* ----------------------------------------------------------- hints */

.hint,
.viewport__hint,
.modal__close {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.15rem 0.6rem;
  margin: auto 0 0;
  font-size: 0.75rem;
  opacity: 0.75;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}

.hint span {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  white-space: nowrap;
}

.hint img,
.viewport__hint img,
.modal__close img {
  width: 1.2rem;
  height: 1.2rem;
  object-fit: contain;
  vertical-align: middle;
}

/* ----------------------------------------------------------- viewport */

.viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.viewport canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  outline: none;
}

.viewport__hint {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  gap: 0.3rem;
  padding: 0.35rem 0.7rem;
  border-radius: 0.3rem;
  background: rgba(11, 14, 20, 0.7);
}

/* ----------------------------------------------------------- picker */

.modal {
  position: fixed;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(6, 8, 12, 0.78);
}

.modal__box {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: min(92%, 34rem);
  max-height: 90vh;
  padding: 1.25rem 1.25rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 0.5rem;
  background: #141a24;
}

.modal__title {
  margin: 0;
  color: var(--vpg-item-color-active);
  font-family: var(--vpg-font-display);
  font-size: 1.3rem;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-align: center;
  text-transform: uppercase;
}

.modal__count {
  margin: 0;
  color: #aab4c4;
  font-size: 0.75rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.modal__close {
  margin-top: 0.3rem;
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.picker__item {
  overflow: hidden;
  padding: 0.3rem 0.7rem;
  border-left: 3px solid transparent;
  border-radius: 0.2rem;
  color: var(--vpg-item-color-idle);
  font-family: var(--vpg-font-menu-item);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  -webkit-text-stroke-width: 0.5px;
  -webkit-text-stroke-color: var(--vpg-item-stroke);
  cursor: pointer;
}

/* The playing choice is marked even when the cursor is elsewhere. */
.picker__item--current::before {
  content: "● ";
  color: #6ea8ff;
  -webkit-text-fill-color: #6ea8ff;
}

.picker__item--active {
  border-left-color: var(--vpg-item-color-active);
  background: rgba(242, 143, 61, 0.14);
  -webkit-text-fill-color: var(--vpg-item-color-active);
  -webkit-text-stroke-width: 1px;
  animation: glowPulse 1s ease-in-out infinite;
}

/* ----------------------------------------------------------- small screens */

@media (max-width: 720px) {
  /* The page itself doesn't scroll (the menus fill the window), so the viewer does. */
  .viewer {
    grid-template-columns: 1fr;
    grid-template-rows: 50vh auto;
    overflow-y: auto;
  }

  .viewer--panel-hidden {
    grid-template-rows: 100% 0;
  }

  .viewport {
    order: -1;
  }

  .panel {
    overflow: visible;
    border-right: 0;
    border-top: var(--vpg-frame-width) solid rgba(255, 255, 255, 0.35);
  }
}
</style>
