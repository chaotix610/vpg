<!--
  Game-style, D-Pad-navigable Character Creator / Editor for Virtual Pro Grappler (VPG).
  Composed from the reusable `src/ui/configuration-menus/` UI kit
  (`docs/ui/configuration-menus.md`) while assembling every wrestler onto the
  canonical 71-bone VPG Rig 2.0 skeleton.
-->
<template>
  <ConfigScreenShell
    aria-label="Character Editor"
    :screen-class="`caw-screen--${screen}`"
    :toast-message="toastMessage"
    :toast-error="toastError"
    @pointermove="ignoreHover = false"
  >
    <!-- Boot error fallback -->
    <div v-if="bootError" class="caw-error" role="alert">
      <h2>Character Editor could not start</h2>
      <p>{{ bootError }}</p>
      <ConfigMenuBar active @click="exitEditor">BACK TO MENU</ConfigMenuBar>
    </div>

    <template v-else>
      <!-- Persistent 3D Stage Host (repositions seamlessly across screens with zero WebGL reset) -->
      <ConfigPreviewBooth
        :layout="boothLayout"
        :center-x="boothCenterX"
        :loading="!stageReady"
        :loading-label="building ? 'ASSEMBLING VPG RIG 2.0…' : 'LOADING…'"
      >
        <canvas
          ref="stageCanvas"
          class="stage-canvas"
          :data-active="stageReady"
          aria-label="3D VPG Rig 2.0 wrestler preview"
        />

        <template #hud-bottom>
          <span class="booth-pill" :data-rig-bones="rigDiagnostics?.totalBones ?? 71">
            VPG RIG 2.0 &middot; {{ rigDiagnostics?.totalBones ?? 71 }} BONES
          </span>
          <span v-if="currentDoc" class="booth-pill booth-pill--name" data-wrestler-title>
            {{ currentDoc.profile.fullName }}
          </span>
          <span class="booth-pill">
            C{{ costumeIndex + 1 }}/{{ currentDoc?.look.costumes.length ?? 4 }}<template v-if="entranceMode"> &middot; ENTR</template>
          </span>
          <span v-if="facts" class="booth-pill booth-pill--dim" data-model-facts>
            {{ facts.meshes }}M &middot; {{ facts.faces }}T &middot; {{ facts.bones }} VPG BONES
          </span>
        </template>

        <template v-if="playback.loadingClip || screen === 'moves' || screen === 'movesDetail'" #hud-top-left>
          <span class="booth-pill">{{ playback.loadingClip ? "LOADING ANIMATION…" : playback.clipName }}</span>
        </template>
      </ConfigPreviewBooth>

      <!-- Top-left Retro Breadcrumb Header + D-Pad-reachable top-right BACK bar -->
      <ConfigBreadcrumbHeader
        :top="topBreadcrumb"
        :second="secondBreadcrumb"
        :third="thirdBreadcrumb"
        :root-scale="screen === 'roster' || screen === 'options'"
        :back-active="isBackFocused"
        @back="handleBackAction"
        @back-hover="focusBackByMouse"
      />

      <!-- ========================================================= SCREEN 0: ROSTER SELECT -->
      <section v-if="screen === 'roster'" class="layer-split-left" aria-label="Select Wrestler">
        <div class="roster-toolbar">
          <label class="retro-search">
            <input
              ref="rosterSearchInput"
              v-model="rosterSearch"
              type="search"
              class="retro-search__input"
              placeholder="SEARCH ROSTER (/)"
              aria-label="Search wrestlers"
              autocomplete="off"
              spellcheck="false"
              @focus="typing = true; releaseCamera()"
              @blur="typing = false"
            />
          </label>
          <span class="roster-count">{{ rosterItems.length - 1 }} WRESTLERS</span>
        </div>

        <div ref="rosterListEl" class="menu-stack menu-stack--scroll" role="listbox" aria-label="Wrestlers">
          <ConfigMenuBar
            v-for="(item, idx) in rosterItems"
            :key="item.key"
            variant="roster"
            role="option"
            :active="!rosterFocusBack && rosterCursor === idx"
            :accent-left="item.kind === 'create'"
            :aria-selected="!rosterFocusBack && rosterCursor === idx"
            :data-wrestler-id="item.kind === 'wrestler' ? item.summary.id : undefined"
            @mouseenter="hoverRoster(idx)"
            @click="activateRoster(idx)"
          >
            <span class="game-bar__label">{{ item.label }}</span>
            <span v-if="item.badge" class="bar-tag" :class="`bar-tag--${item.badge.toLowerCase()}`">{{ item.badge }}</span>
            <span v-else-if="item.slot" class="bar-slot">{{ String(item.slot).padStart(2, "0") }}</span>
          </ConfigMenuBar>
        </div>
      </section>

      <!-- ========================================================= SCREEN 1: CHARACTER OPTIONS -->
      <section v-else-if="screen === 'options'" class="layer-split-left layer-split-left--center" aria-label="Character Options">
        <div v-if="currentDoc" class="options-meta">
          <span class="options-meta__name">{{ currentDoc.profile.fullName }}</span>
          <span class="options-meta__sub">
            {{ heightText(currentDoc.profile.heightRaw ?? 13) }} &middot; {{ weightText(currentDoc.profile.weightRaw ?? 140) }}
            <span v-if="currentIsCustom" class="bar-tag bar-tag--new">CUSTOM</span>
            <span v-else-if="currentIsEdited" class="bar-tag bar-tag--edited">EDITED</span>
          </span>
        </div>

        <nav class="menu-stack menu-stack--options" aria-label="Character options menu">
          <ConfigMenuBar
            v-for="(item, idx) in CHARACTER_OPTIONS_ITEMS"
            :key="item.id"
            variant="option"
            :active="!optionsFocusBack && optionsCursor === idx"
            :data-option-id="item.id"
            @mouseenter="hoverOptions(idx)"
            @click="openOptionScreen(item.id)"
          >
            {{ item.label }}
          </ConfigMenuBar>
        </nav>
      </section>

      <!-- ========================================================= SCREEN 2: APPEARANCE HUB -->
      <section v-else-if="screen === 'appearance'" class="layer-appearance" aria-label="Appearance categories">
        <nav class="app-col app-col--left" aria-label="Body and attire categories">
          <ConfigMenuBar
            v-for="(cat, idx) in APPEARANCE_LEFT_CATEGORIES"
            :key="cat.id"
            variant="category"
            :active="appearanceFocus.zone === 'left' && appearanceFocus.index === idx"
            :data-appearance-cat="cat.id"
            @mouseenter="hoverAppearance('left', idx)"
            @click="openAppearanceCategory(cat)"
          >
            {{ cat.label }}
          </ConfigMenuBar>
        </nav>

        <nav class="app-col app-col--right" aria-label="Gear and entrance categories">
          <ConfigMenuBar
            v-for="(cat, idx) in APPEARANCE_RIGHT_CATEGORIES"
            :key="cat.id"
            variant="category"
            :active="appearanceFocus.zone === 'right' && appearanceFocus.index === idx"
            :gap-before="cat.gapBefore"
            :data-appearance-cat="cat.id"
            @mouseenter="hoverAppearance('right', idx)"
            @click="openAppearanceCategory(cat)"
          >
            {{ cat.label }}
          </ConfigMenuBar>
        </nav>
      </section>

      <!-- ========================================================= SCREEN 2B: APPEARANCE DETAIL -->
      <section v-else-if="screen === 'appearanceDetail' && activeCategory" class="layer-left-rail" aria-label="Edit appearance category">
        <div class="menu-stack menu-stack--rail">
          <ConfigMenuBar
            v-for="(row, idx) in detailRows"
            :key="row.key"
            as="div"
            variant="value"
            :active="!detailFocusBack && detailCursor === idx"
            :data-field-row="row.key"
            @mouseenter="hoverDetail(idx)"
            @click="activateDetailRow(idx)"
          >
            <span class="game-bar__k">{{ row.label }}</span>
            <span class="game-bar__v">
              <span
                v-if="row.swatch"
                class="mini-swatch"
                :class="{ 'mini-swatch--default': row.swatch.fallback }"
                :style="{ backgroundColor: row.swatch.colour ?? 'transparent' }"
              />
              <button
                v-if="row.adjustable"
                type="button"
                class="arrow-btn"
                :aria-label="`Previous ${row.label}`"
                @click.stop="adjustDetailRow(idx, -1)"
              >&#9664;</button>
              <span class="val-text">{{ row.display }}</span>
              <button
                v-if="row.adjustable"
                type="button"
                class="arrow-btn"
                :aria-label="`Next ${row.label}`"
                @click.stop="adjustDetailRow(idx, 1)"
              >&#9654;</button>
            </span>
          </ConfigMenuBar>
        </div>

        <p v-if="recipe?.notes.length" class="retro-note">
          {{ recipe.notes.join(" · ") }}
        </p>
      </section>

      <!-- ========================================================= SCREEN 3: MOVES CATEGORIES -->
      <section v-else-if="screen === 'moves'" class="layer-left-rail" aria-label="Move categories">
        <nav class="menu-stack menu-stack--moves">
          <ConfigMenuBar
            v-for="(cat, idx) in MOVES_CATEGORIES"
            :key="cat.id"
            variant="category"
            :active="!movesFocusBack && movesCursor === idx"
            :data-move-cat="cat.id"
            @mouseenter="hoverMovesCategory(idx)"
            @click="openMovesCategory(cat)"
          >
            {{ cat.label }}
          </ConfigMenuBar>
        </nav>
      </section>

      <!-- ========================================================= SCREEN 3B: MOVES CLIP LIST -->
      <section v-else-if="screen === 'movesDetail' && activeMoveCategory" class="layer-left-rail" aria-label="Move animations">
        <div class="moves-counter">
          <span>{{ categoryClips.length ? `${moveClipCursor + 1} / ${categoryClips.length}` : "0 CLIPS" }}</span>
          <span>L/R PAGE &middot; A REPLAY</span>
        </div>
        <div class="menu-stack menu-stack--scroll menu-stack--moves-detail" role="listbox" aria-label="Category moves">
          <ConfigMenuBar
            v-for="clip in visibleCategoryClips"
            :key="clip.path"
            variant="clip"
            role="option"
            :active="!movesDetailFocusBack && moveClipCursor === clip.index"
            :aria-selected="!movesDetailFocusBack && moveClipCursor === clip.index"
            @mouseenter="hoverMoveClip(clip.index)"
            @click="activateMoveClip(clip.index)"
          >
            <span class="game-bar__label">{{ clip.label }}</span>
          </ConfigMenuBar>
          <p v-if="!categoryClips.length" class="retro-note">NO CLIPS FOUND IN THIS CATEGORY.</p>
        </div>
      </section>

      <!-- ========================================================= SCREEN 4: PROFILE -->
      <section v-else-if="screen === 'profile' && currentDoc" class="layer-left-rail" aria-label="Wrestler profile">
        <div class="menu-stack menu-stack--rail menu-stack--scroll">
          <ConfigMenuBar
            v-for="(row, idx) in profileRows"
            :key="row.key"
            as="div"
            variant="value"
            :active="!profileFocusBack && profileCursor === idx"
            :typing="editingTextKey === row.key"
            :danger="row.danger"
            :data-profile-row="row.key"
            @mouseenter="hoverProfile(idx)"
            @click="activateProfileRow(idx)"
          >
            <span class="game-bar__k">{{ row.label }}</span>
            <span class="game-bar__v">
              <input
                v-if="row.textField && editingTextKey === row.key"
                ref="inlineTextInput"
                v-model="inlineTextValue"
                type="text"
                class="inline-text"
                :aria-label="row.label"
                autocomplete="off"
                spellcheck="false"
                @keydown.enter.prevent.stop="commitInlineText"
                @keydown.escape.prevent.stop="cancelInlineText"
                @blur="commitInlineText"
                @click.stop
              />
              <template v-else>
                <button
                  v-if="row.adjustable"
                  type="button"
                  class="arrow-btn"
                  :aria-label="`Previous ${row.label}`"
                  @click.stop="adjustProfileRow(idx, -1)"
                >&#9664;</button>
                <span class="val-text">{{ row.display }}</span>
                <button
                  v-if="row.adjustable"
                  type="button"
                  class="arrow-btn"
                  :aria-label="`Next ${row.label}`"
                  @click.stop="adjustProfileRow(idx, 1)"
                >&#9654;</button>
              </template>
            </span>
          </ConfigMenuBar>
        </div>
      </section>

      <!-- ========================================================= SCREEN 5: FIGHTING STYLE & RIG -->
      <section v-else-if="screen === 'fightingStyle' && currentDoc" class="layer-left-rail" aria-label="Fighting style and VPG Rig">
        <div class="menu-stack menu-stack--rail menu-stack--scroll">
          <ConfigMenuBar
            v-for="(row, idx) in styleRows"
            :key="row.key"
            as="div"
            variant="value"
            :active="!styleFocusBack && styleCursor === idx"
            :data-style-row="row.key"
            @mouseenter="hoverStyle(idx)"
            @click="activateStyleRow(idx)"
          >
            <span class="game-bar__k">{{ row.label }}</span>
            <span class="game-bar__v">
              <button
                v-if="row.adjustable"
                type="button"
                class="arrow-btn"
                :aria-label="`Previous ${row.label}`"
                @click.stop="adjustStyleRow(idx, -1)"
              >&#9664;</button>
              <span class="val-text">{{ row.display }}</span>
              <button
                v-if="row.adjustable"
                type="button"
                class="arrow-btn"
                :aria-label="`Next ${row.label}`"
                @click.stop="adjustStyleRow(idx, 1)"
              >&#9654;</button>
            </span>
          </ConfigMenuBar>

          <div v-if="rigDiagnostics" class="rig-readout">
            <div><span>RIG</span><strong>{{ rigDiagnostics.rigName }}</strong></div>
            <div><span>BONES</span><strong>{{ rigDiagnostics.totalBones }} ({{ rigDiagnostics.deformingBones }} DEF)</strong></div>
            <div><span>PELVIS Y</span><strong>{{ rigDiagnostics.pelvisWorldY.toFixed(3) }} m</strong></div>
            <div><span>HEAD Y</span><strong>{{ rigDiagnostics.headWorldY.toFixed(3) }} m</strong></div>
          </div>
        </div>
      </section>

      <!-- ========================================================= SCREEN 6: PARAMETERS -->
      <section v-else-if="screen === 'parameter' && currentDoc" class="layer-parameters" aria-label="Wrestler parameters">
        <div class="param-col" aria-label="Offense parameters">
          <h3 class="param-col__heading">OFFENSE</h3>
          <div class="param-col__list">
            <ConfigParamSlider
              v-for="(row, idx) in offenseRows"
              :key="row.key"
              :label="row.label"
              :aria-label="`Offense ${row.label}`"
              :value="row.value"
              :min="1"
              :max="5"
              :active="paramFocus.zone === 'offense' && paramFocus.index === idx"
              :data-param-row="row.key"
              @hover="hoverParam('offense', idx)"
              @step="stepParam('attack', row.part, $event, true)"
              @change="setParamValue('attack', row.part, $event)"
            />
          </div>
        </div>

        <div class="param-col" aria-label="Defense parameters">
          <h3 class="param-col__heading">DEFENSE</h3>
          <div class="param-col__list">
            <ConfigParamSlider
              v-for="(row, idx) in defenseRows"
              :key="row.key"
              :label="row.label"
              :aria-label="`Defense ${row.label}`"
              :value="row.value"
              :min="1"
              :max="5"
              :active="paramFocus.zone === 'defense' && paramFocus.index === idx"
              :data-param-row="row.key"
              @hover="hoverParam('defense', idx)"
              @step="stepParam('defence', row.part, $event, true)"
              @change="setParamValue('defence', row.part, $event)"
            />
          </div>
        </div>
      </section>

      <!-- ========================================================= SCREEN 7: ALLY / ENEMY -->
      <section v-else-if="screen === 'allyEnemy' && currentDoc" class="layer-left-rail" aria-label="Ally and enemy">
        <div class="menu-stack menu-stack--rail">
          <ConfigMenuBar
            v-for="(row, idx) in allyRows"
            :key="row.key"
            as="div"
            variant="value"
            :active="!allyFocusBack && allyCursor === idx"
            @mouseenter="hoverAlly(idx)"
            @click="adjustAllyRow(idx, 1)"
          >
            <span class="game-bar__k">{{ row.label }}</span>
            <span class="game-bar__v">
              <button type="button" class="arrow-btn" :aria-label="`Previous ${row.label}`" @click.stop="adjustAllyRow(idx, -1)">&#9664;</button>
              <span class="val-text">{{ row.display }}</span>
              <button type="button" class="arrow-btn" :aria-label="`Next ${row.label}`" @click.stop="adjustAllyRow(idx, 1)">&#9654;</button>
            </span>
          </ConfigMenuBar>
        </div>
      </section>

      <!-- Quick Swatch / Option Picker Modal (press A on any Appearance field!) -->
      <ConfigQuickPicker
        v-if="picker"
        :title="picker.title"
        :window-items="pickerWindow"
        :total-count="picker.items.length"
        :offset="picker.offset"
        :cursor="picker.cursor"
        :current-value="picker.currentValue"
        :is-colour="picker.isColour"
        @hover="picker.cursor = $event"
        @choose="choosePicker"
        @close="closePicker"
      />

      <!-- Bottom N64 Controller Hint Bar -->
      <ConfigControllerBar :hints="controllerHints" />
    </template>
  </ConfigScreenShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from "vue";
import { playMenuCue } from "@/audio/menuAudio";
import { resolveAssets } from "@/content/animationLibrary";
import {
  CREATOR_PREVIEW_ANIMATIONS,
  loadBundledWrestler,
  loadCreatorManifest,
  loadCreatorRoster,
} from "@/content/characterCatalog";
import {
  CharacterLookBook,
  HEIGHT_CLASSES,
  WEIGHT_CLASSES,
  heightScaleFor,
  heightText,
  weightText,
  type CharacterManifest,
  type CostumeRecipe,
  type WrestlerCostume,
  type WrestlerDocument,
  type WrestlerSummary,
} from "@/content/characterLook";
import {
  APPEARANCE_LEFT_CATEGORIES,
  APPEARANCE_RIGHT_CATEGORIES,
  CHARACTER_OPTIONS_ITEMS,
  FIGHTING_STYLE_NAMES,
  MOVES_CATEGORIES,
  PARAMETER_PARTS,
  clipsForMoveCategory,
  formatMoveClipName,
  moveAppearanceFocus,
  moveParameterFocus,
  type AppearanceCategorySpec,
  type AppearanceFocus,
  type CharacterOptionId,
  type MoveCategorySpec,
  type ParameterFocus,
  type ParameterPart,
} from "@/content/characterMenus";
import {
  deleteCreatedWrestler,
  hasBundledEdit,
  isValidWrestlerDocument,
  revertBundledWrestler,
  saveWrestler,
  savedBundledEdit,
  savedCharactersRevision,
  savedCreatedById,
  savedCreatedWrestlers,
  summaryFromDocument,
} from "@/save/characterStore";
import {
  CharacterStage,
  type StagePlaybackSnapshot,
  type StageViewPreset,
  type VpgRigDiagnostics,
} from "@/render/character/CharacterStage";
import type { CharacterFacts } from "@/render/character/VpgCharacterRig";
import {
  pollGamepadBindings,
  virtualInputFor,
  virtualInputForBinding,
  type VirtualInput,
} from "@/input/VirtualController";
import type { ControllerHintItem } from "@/ui/controllerIcons";
import {
  ConfigBreadcrumbHeader,
  ConfigControllerBar,
  ConfigMenuBar,
  ConfigParamSlider,
  ConfigPreviewBooth,
  ConfigQuickPicker,
  ConfigScreenShell,
  type ConfigBoothLayout,
} from "@/ui/configuration-menus";

const emit = defineEmits<{ back: [] }>();

type ScreenId =
  | "roster"
  | "options"
  | "appearance"
  | "appearanceDetail"
  | "moves"
  | "movesDetail"
  | "profile"
  | "fightingStyle"
  | "parameter"
  | "allyEnemy";

const PARAM_OF: Record<string, string> = {
  speed: "speed",
  "attack.head": "ability_1",
  "attack.body": "ability_2",
  "attack.arms": "ability_3",
  "attack.legs": "ability_4",
  "attack.flying": "ability_5",
  "defence.head": "ability_6",
  "defence.body": "ability_7",
  "defence.arms": "ability_8",
  "defence.legs": "ability_9",
  "defence.flying": "ability_10",
};
const HEIGHT_VALUES = [...Array.from({ length: 36 }, (_, i) => i), ...Object.keys(HEIGHT_CLASSES).map(Number)];
const WEIGHT_CLASS_VALUES = Object.keys(WEIGHT_CLASSES).map(Number);
const CAMERA_PRESETS: readonly StageViewPreset[] = ["front", "side", "back", "head"];
const MOVES_WINDOW = 10;
const PICKER_WINDOW = 24;

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ------------------------------------------------------------------ core state

const stageCanvas = ref<HTMLCanvasElement | null>(null);
const rosterSearchInput = ref<HTMLInputElement | null>(null);
const rosterListEl = ref<HTMLDivElement | null>(null);
const inlineTextInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);

const bootError = ref<string | null>(null);
const building = ref(false);
const stageReady = ref(false);
const exportingGlb = ref(false);
const ignoreHover = ref(false);
const typing = ref(false);

const screen = ref<ScreenId>("roster");
const manifest = shallowRef<CharacterManifest | null>(null);
const lookBook = shallowRef<CharacterLookBook | null>(null);
const bundledSummaries = shallowRef<WrestlerSummary[]>([]);
const defaultTemplate = shallowRef<WrestlerDocument | null>(null);
const allAnimationClips = shallowRef<string[]>([]);

const selectedId = ref<string>("default");
const currentDoc = ref<WrestlerDocument | null>(null);
const costumeIndex = ref(0);
const entranceMode = ref(false);
const recipe = shallowRef<CostumeRecipe | null>(null);
const facts = ref<CharacterFacts | null>(null);
const rigDiagnostics = ref<VpgRigDiagnostics | null>(null);

// Per-screen D-Pad cursors
const rosterSearch = ref("");
const rosterCursor = ref(1); // index 0 is + NEW WRESTLER, index 1 is DEFAULT WRESTLER
const rosterFocusBack = ref(false);

const optionsCursor = ref(0);
const optionsFocusBack = ref(false);

const appearanceFocus = ref<AppearanceFocus>({ zone: "left", index: 0 });
const activeCategory = shallowRef<AppearanceCategorySpec | null>(null);
const detailCursor = ref(0);
const detailFocusBack = ref(false);
const savedEntranceBeforeCategory = ref(false);

const movesCursor = ref(0);
const movesFocusBack = ref(false);
const activeMoveCategory = shallowRef<MoveCategorySpec | null>(null);
const moveClipCursor = ref(0);
const moveClipOffset = ref(0);
const movesDetailFocusBack = ref(false);

const profileCursor = ref(0);
const profileFocusBack = ref(false);
const editingTextKey = ref<string | null>(null);
const inlineTextValue = ref("");
const confirmingDelete = ref(false);

const styleCursor = ref(0);
const styleFocusBack = ref(false);
const stancePresetIndex = ref(0);
const cameraPresetIndex = ref(0);

const paramFocus = ref<ParameterFocus>({ zone: "offense", index: 0 });

const allyCursor = ref(0);
const allyFocusBack = ref(false);

interface PickerItem {
  value: number;
  label: string;
  colour?: string | null;
}

interface PickerState {
  title: string;
  fieldName: string;
  isColour: boolean;
  items: PickerItem[];
  currentValue: number;
  cursor: number;
  offset: number;
}
const picker = ref<PickerState | null>(null);

const stageState = reactive({
  model: true,
  skeleton: false,
  showHelpers: false,
  textured: true,
  rotate: false,
  playing: true,
  boneScale: 1.0,
  speed: 1.0,
});

const playback = reactive<StagePlaybackSnapshot>({
  clipPath: CREATOR_PREVIEW_ANIMATIONS[0].clip,
  clipName: CREATOR_PREVIEW_ANIMATIONS[0].label,
  playing: true,
  frame: 0,
  from: 0,
  to: 0,
  fps: 60,
  loadingClip: false,
  clipError: null,
});

const toastMessage = ref("");
const toastError = ref(false);
let toastTimer = 0;

let stage: CharacterStage | null = null;
let figureTicket = 0;
let previewDebounce = 0;
let disposed = false;

function showToast(text: string, error = false): void {
  toastMessage.value = text;
  toastError.value = error;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = "";
  }, error ? 4200 : 2600);
}

// ------------------------------------------------------------------ computed layout & headers

const boothLayout = computed<ConfigBoothLayout>(() => {
  if (screen.value === "roster" || screen.value === "options") return "split-right";
  if (screen.value === "appearance" || screen.value === "parameter") return "framed-center";
  if (screen.value === "moves") return "framed-moves";
  if (screen.value === "movesDetail") return "framed-moves-detail";
  return "framed-rail";
});

const boothCenterX = computed(() => {
  if (screen.value === "appearance" || screen.value === "parameter") return 500;
  if (screen.value === "roster" || screen.value === "options") return 480;
  if (screen.value === "moves" || screen.value === "movesDetail") return 360;
  return 340;
});

const topBreadcrumb = computed(() => (screen.value === "roster" ? "CHARACTER EDITOR" : "CHARACTER OPTIONS"));

const secondBreadcrumb = computed(() => {
  switch (screen.value) {
    case "roster":
      return "SELECT WRESTLER";
    case "options":
      return "";
    case "appearance":
    case "appearanceDetail":
      return "APPEARANCE";
    case "moves":
    case "movesDetail":
      return "MOVES";
    case "profile":
      return "PROFILE";
    case "fightingStyle":
      return "FIGHTING STYLE";
    case "parameter":
      return "PARAMETERS";
    case "allyEnemy":
      return "ALLY / ENEMY";
  }
});

const thirdBreadcrumb = computed(() => {
  if (screen.value === "appearanceDetail") return activeCategory.value?.label ?? "";
  if (screen.value === "movesDetail") return activeMoveCategory.value?.label ?? "";
  return "";
});

const isBackFocused = computed(() => {
  switch (screen.value) {
    case "roster":
      return rosterFocusBack.value;
    case "options":
      return optionsFocusBack.value;
    case "appearance":
      return appearanceFocus.value.zone === "back";
    case "appearanceDetail":
      return detailFocusBack.value;
    case "moves":
      return movesFocusBack.value;
    case "movesDetail":
      return movesDetailFocusBack.value;
    case "profile":
      return profileFocusBack.value;
    case "fightingStyle":
      return styleFocusBack.value;
    case "parameter":
      return paramFocus.value.zone === "back";
    case "allyEnemy":
      return allyFocusBack.value;
  }
});

const dpadHint = computed(() => {
  if (screen.value === "appearanceDetail" || screen.value === "parameter" || screen.value === "profile" || screen.value === "fightingStyle" || screen.value === "allyEnemy") {
    return "MOVE · ◀▶ CHANGE";
  }
  return "MOVE";
});

const aHint = computed(() => {
  if (screen.value === "appearanceDetail") return "PICK LIST";
  if (screen.value === "movesDetail") return "REPLAY";
  if (screen.value === "profile") return "EDIT / USE";
  if (screen.value === "parameter") return paramFocus.value.zone === "back" ? "BACK" : "+1";
  return "SELECT";
});

const lrHint = computed(() => {
  if (screen.value === "appearanceDetail") return "±10 STYLE";
  if (screen.value === "movesDetail") return "PAGE";
  if (screen.value === "parameter") return "OFFENSE / DEFENSE";
  return "COSTUME";
});

const controllerHints = computed<ControllerHintItem[]>(() => [
  { icons: ["dPad"], label: dpadHint.value },
  { icons: ["stick"], label: "ROTATE / ZOOM" },
  { icons: ["a"], label: aHint.value },
  { icons: ["b"], label: "BACK" },
  { icons: ["l", "r"], label: lrHint.value },
  { icons: ["z"], label: entranceMode.value ? "RING" : "ENTRANCE" },
  { icons: ["start"], label: stageState.playing ? "PAUSE" : "PLAY" },
]);

// ------------------------------------------------------------------ computed roster & active doc

const allSummaries = computed<WrestlerSummary[]>(() => {
  void savedCharactersRevision.value;
  const out: WrestlerSummary[] = [];
  for (const base of bundledSummaries.value) {
    const edit = savedBundledEdit(base.id);
    if (edit) {
      out.push({
        ...base,
        fullName: edit.profile.fullName || base.fullName,
        shortName: edit.profile.shortName ?? base.shortName,
        ringName: edit.profile.ringName ?? base.ringName,
        heightRaw: Number(edit.profile.heightRaw ?? base.heightRaw),
        weightRaw: Number(edit.profile.weightRaw ?? base.weightRaw),
        edited: true,
      });
    } else {
      out.push(base);
    }
  }
  for (const created of savedCreatedWrestlers()) {
    out.push(summaryFromDocument(created, { custom: true }));
  }
  return out;
});

type RosterListItem =
  | { kind: "create"; key: string; label: string; badge?: string; slot?: number }
  | { kind: "wrestler"; key: string; label: string; badge?: string; slot: number; summary: WrestlerSummary };

const rosterItems = computed<RosterListItem[]>(() => {
  const query = rosterSearch.value.trim().toLowerCase();
  const list: RosterListItem[] = [
    { kind: "create", key: "__create__", label: "+ CREATE NEW WRESTLER", badge: "NEW" },
  ];
  allSummaries.value.forEach((summary, idx) => {
    if (query) {
      const hay = [summary.fullName, summary.shortName, summary.ringName, summary.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(query)) return;
    }
    list.push({
      kind: "wrestler",
      key: summary.id,
      label: summary.fullName,
      badge: summary.custom ? "CUSTOM" : summary.edited ? "EDITED" : undefined,
      slot: idx + 1,
      summary,
    });
  });
  return list;
});

const currentIsCustom = computed(() => {
  void savedCharactersRevision.value;
  return Boolean(savedCreatedById(selectedId.value));
});

const currentIsEdited = computed(() => {
  void savedCharactersRevision.value;
  return !currentIsCustom.value && hasBundledEdit(selectedId.value);
});

const activeCostume = computed<WrestlerCostume | null>(() => {
  const doc = currentDoc.value;
  if (!doc) return null;
  return doc.look.costumes[costumeIndex.value] ?? doc.look.costumes[0] ?? null;
});

// ------------------------------------------------------------------ computed screen rows

interface DetailRow {
  key: string;
  label: string;
  display: string;
  adjustable: boolean;
  fieldName?: string;
  swatch?: { colour: string | null; fallback: boolean } | null;
  action?: "height" | "weapon" | "entranceToggle" | "randomize" | "copyAll" | "reset";
}

const detailRows = computed<DetailRow[]>(() => {
  const cat = activeCategory.value;
  const lb = lookBook.value;
  const costume = activeCostume.value;
  const doc = currentDoc.value;
  if (!cat || !lb || !costume || !doc) return [];

  const rows: DetailRow[] = [];
  for (const fieldName of cat.fields) {
    const field = lb.field(fieldName);
    if (!field) continue;
    const val = lb.value(costume, fieldName);
    rows.push({
      key: `look:${fieldName}`,
      label: field.label.toUpperCase(),
      display: lb.label(field, val).toUpperCase(),
      adjustable: true,
      fieldName,
      swatch: lb.swatch(costume, field),
    });
  }

  if (cat.id === "body") {
    rows.push({
      key: "body:height",
      label: "HEIGHT",
      display: heightText(doc.profile.heightRaw ?? 13).toUpperCase(),
      adjustable: true,
      action: "height",
    });
  }

  if (cat.id === "weapons_props") {
    const weapon = doc.profile.attributes?.specificWeapon ?? 0;
    rows.push(
      {
        key: "prop:weapon",
        label: "FAVOURITE WEAPON",
        display: weapon === 0 ? "NONE" : `WEAPON ${weapon}`,
        adjustable: true,
        action: "weapon",
      },
      {
        key: "prop:entranceMode",
        label: "PREVIEW MODE",
        display: entranceMode.value ? "ENTRANCE" : "RING",
        adjustable: true,
        action: "entranceToggle",
      },
      {
        key: "prop:randomize",
        label: "RANDOMIZE COSTUME",
        display: "PRESS A",
        adjustable: false,
        action: "randomize",
      },
      {
        key: "prop:copyAll",
        label: "COPY TO ALL 4 COSTUMES",
        display: "PRESS A",
        adjustable: false,
        action: "copyAll",
      },
      {
        key: "prop:reset",
        label: "RESET COSTUME",
        display: "PRESS A",
        adjustable: false,
        action: "reset",
      },
    );
  }

  return rows;
});

const categoryClips = computed(() => {
  const cat = activeMoveCategory.value;
  if (!cat) return [];
  return clipsForMoveCategory(allAnimationClips.value, cat.prefix).map((clipPath, index) => ({
    index,
    path: clipPath,
    label: formatMoveClipName(clipPath, cat.prefix),
  }));
});

const visibleCategoryClips = computed(() =>
  categoryClips.value.slice(moveClipOffset.value, moveClipOffset.value + MOVES_WINDOW),
);

interface ProfileRow {
  key: string;
  label: string;
  display: string;
  adjustable: boolean;
  textField?: "fullName" | "shortName" | "ringName";
  danger?: boolean;
}

const profileRows = computed<ProfileRow[]>(() => {
  const doc = currentDoc.value;
  if (!doc) return [];
  const rows: ProfileRow[] = [
    { key: "fullName", label: "FULL NAME", display: doc.profile.fullName || "(EMPTY)", adjustable: false, textField: "fullName" },
    { key: "shortName", label: "SHORT NAME", display: doc.profile.shortName || "(EMPTY)", adjustable: false, textField: "shortName" },
    { key: "ringName", label: "RING NAME", display: doc.profile.ringName || "NONE", adjustable: false, textField: "ringName" },
    { key: "height", label: "HEIGHT", display: heightText(doc.profile.heightRaw ?? 13).toUpperCase(), adjustable: true },
    { key: "weight", label: "WEIGHT", display: weightText(doc.profile.weightRaw ?? 140).toUpperCase(), adjustable: true },
    { key: "costume", label: "COSTUME SLOT", display: `COSTUME ${costumeIndex.value + 1} / ${doc.look.costumes.length}`, adjustable: true },
    { key: "exportGlb", label: "EXPORT VPG GLB", display: exportingGlb.value ? "BUILDING…" : "71-BONE .GLB", adjustable: false },
    { key: "downloadJson", label: "DOWNLOAD JSON", display: `${doc.id}.json`, adjustable: false },
    { key: "copyJson", label: "COPY JSON", display: "CLIPBOARD", adjustable: false },
    { key: "pasteJson", label: "PASTE JSON", display: "FROM CLIPBOARD", adjustable: false },
    { key: "clone", label: "CLONE WRESTLER", display: "NEW SLOT", adjustable: false },
  ];
  if (currentIsCustom.value) {
    rows.push({
      key: "delete",
      label: confirmingDelete.value ? "CONFIRM DELETE" : "DELETE WRESTLER",
      display: confirmingDelete.value ? "PRESS A AGAIN" : "REMOVE",
      adjustable: false,
      danger: true,
    });
  } else if (currentIsEdited.value) {
    rows.push({
      key: "revert",
      label: "REVERT TO BUNDLED",
      display: "RESTORE",
      adjustable: false,
      danger: true,
    });
  }
  return rows;
});

interface StyleRow {
  key: string;
  label: string;
  display: string;
  adjustable: boolean;
}

const styleRows = computed<StyleRow[]>(() => {
  const doc = currentDoc.value;
  if (!doc) return [];
  const rigOverlay = !stageState.skeleton
    ? "OFF"
    : stageState.showHelpers
      ? "ALL 71 BONES"
      : "BODY 52 BONES";
  return [
    { key: "style", label: "FIGHTING STYLE", display: (doc.profile.style?.name ?? "Wrestling").toUpperCase(), adjustable: true },
    { key: "stance", label: "PREVIEW STANCE", display: CREATOR_PREVIEW_ANIMATIONS[stancePresetIndex.value].label.toUpperCase(), adjustable: true },
    { key: "rig", label: "VPG RIG OVERLAY", display: rigOverlay, adjustable: true },
    { key: "shading", label: "MODEL SHADING", display: stageState.textured ? "TEXTURED" : "CLAY", adjustable: true },
    { key: "camera", label: "CAMERA ANGLE", display: CAMERA_PRESETS[cameraPresetIndex.value].toUpperCase(), adjustable: true },
    { key: "rotate", label: "AUTO-TURN", display: stageState.rotate ? "ON" : "OFF", adjustable: true },
    { key: "entrance", label: "ATTIRE MODE", display: entranceMode.value ? "ENTRANCE" : "RING", adjustable: true },
    { key: "speed", label: "SPEED", display: `${doc.profile.attributes?.speed ?? 2} / 3`, adjustable: true },
  ];
});

interface ParamSliderRow {
  key: string;
  label: string;
  group: "attack" | "defence";
  part: ParameterPart;
  value: number;
}

const offenseRows = computed<ParamSliderRow[]>(() => {
  const attrs = currentDoc.value?.profile.attributes;
  if (!attrs) return [];
  return PARAMETER_PARTS.map((part) => ({
    key: `attack.${part}`,
    label: part.toUpperCase(),
    group: "attack" as const,
    part,
    value: Math.min(5, Math.max(1, attrs.attack?.[part] ?? 1)),
  }));
});

const defenseRows = computed<ParamSliderRow[]>(() => {
  const attrs = currentDoc.value?.profile.attributes;
  if (!attrs) return [];
  return PARAMETER_PARTS.map((part) => ({
    key: `defence.${part}`,
    label: part.toUpperCase(),
    group: "defence" as const,
    part,
    value: Math.min(5, Math.max(1, attrs.defence?.[part] ?? 1)),
  }));
});

const allyCandidates = computed(() => [
  "NONE",
  ...allSummaries.value.filter((s) => s.id !== "default" && s.id !== selectedId.value).map((s) => s.fullName),
]);

const allyRows = computed(() => {
  const profile = currentDoc.value?.profile;
  if (!profile) return [];
  const rivals = profile.rivals ?? [];
  return [
    { key: "partner", label: "PARTNER / ALLY", display: (profile.partner || "NONE").toUpperCase() },
    { key: "rival0", label: "RIVAL 1", display: (rivals[0] || "NONE").toUpperCase() },
    { key: "rival1", label: "RIVAL 2", display: (rivals[1] || "NONE").toUpperCase() },
    { key: "rival2", label: "RIVAL 3", display: (rivals[2] || "NONE").toUpperCase() },
  ];
});

const pickerWindow = computed(() => {
  const p = picker.value;
  if (!p) return [];
  return p.items.slice(p.offset, p.offset + PICKER_WINDOW);
});

// ------------------------------------------------------------------ 3D building & loading

async function refreshFigure(): Promise<void> {
  if (!stage || !lookBook.value || !currentDoc.value || !activeCostume.value) return;
  const ticket = ++figureTicket;
  building.value = true;

  const nextRecipe = lookBook.value.recipe(activeCostume.value, { entrance: entranceMode.value });
  recipe.value = nextRecipe;
  const scale = heightScaleFor(currentDoc.value.profile.heightRaw ?? 13);

  try {
    const summary = await stage.build(nextRecipe, scale);
    if (!summary || ticket !== figureTicket || disposed) return;
    facts.value = stage.facts();
    rigDiagnostics.value = stage.diagnostics();
    stageReady.value = true;
    building.value = false;
  } catch (err) {
    if (ticket !== figureTicket || disposed) return;
    building.value = false;
    showToast(err instanceof Error ? err.message : String(err), true);
  }
}

async function loadWrestlerDocument(id: string): Promise<WrestlerDocument> {
  const custom = savedCreatedById(id);
  if (custom) return custom;
  const bundled = await loadBundledWrestler(id);
  const clone = plainClone(bundled);
  const edit = savedBundledEdit(id);
  if (edit) {
    clone.profile = edit.profile;
    clone.look = edit.look;
  }
  return clone;
}

async function loadAndShowWrestler(id: string, costume = 0): Promise<void> {
  confirmingDelete.value = false;
  selectedId.value = id;
  try {
    const doc = await loadWrestlerDocument(id);
    if (disposed || selectedId.value !== id) return;
    if (lookBook.value) {
      for (const c of doc.look.costumes) lookBook.value.normalise(c);
    }
    currentDoc.value = doc;
    costumeIndex.value = Math.min(Math.max(0, costume), doc.look.costumes.length - 1);
    await refreshFigure();
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), true);
  }
}

function scheduleRosterPreview(idx: number): void {
  window.clearTimeout(previewDebounce);
  const item = rosterItems.value[idx];
  if (!item || item.kind !== "wrestler" || item.summary.id === selectedId.value) return;
  previewDebounce = window.setTimeout(() => {
    void loadAndShowWrestler(item.summary.id, 0);
  }, 110);
}

function persistCurrent(note: string): void {
  if (!currentDoc.value) return;
  const ok = saveWrestler(currentDoc.value, currentIsCustom.value, note);
  if (!ok) showToast("Browser storage full — use Export VPG GLB or JSON.", true);
}

// ------------------------------------------------------------------ screen transitions

function transitionTo(next: ScreenId): void {
  ignoreHover.value = true;
  confirmingDelete.value = false;
  editingTextKey.value = null;
  picker.value = null;
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  const wasMoves = screen.value === "moves" || screen.value === "movesDetail";
  const willBeMoves = next === "moves" || next === "movesDetail";
  screen.value = next;

  if (stage) {
    if (willBeMoves && !wasMoves) {
      stage.setShowRing(true);
    } else if (!willBeMoves && wasMoves) {
      stage.setShowRing(false);
      void stage.setAnimation(CREATOR_PREVIEW_ANIMATIONS[stancePresetIndex.value].clip);
    } else if (next === "appearance" || next === "parameter" || next === "options" || next === "roster") {
      stage.view("front");
    }
    void nextTick(() => stage?.resize());
  }
}

function focusBackByMouse(): void {
  if (ignoreHover.value) return;
  switch (screen.value) {
    case "roster":
      rosterFocusBack.value = true;
      break;
    case "options":
      optionsFocusBack.value = true;
      break;
    case "appearance":
      appearanceFocus.value = { zone: "back" };
      break;
    case "appearanceDetail":
      detailFocusBack.value = true;
      break;
    case "moves":
      movesFocusBack.value = true;
      break;
    case "movesDetail":
      movesDetailFocusBack.value = true;
      break;
    case "profile":
      profileFocusBack.value = true;
      break;
    case "fightingStyle":
      styleFocusBack.value = true;
      break;
    case "parameter":
      paramFocus.value = { zone: "back" };
      break;
    case "allyEnemy":
      allyFocusBack.value = true;
      break;
  }
}

function handleBackAction(): void {
  if (picker.value) {
    closePicker();
    return;
  }
  if (editingTextKey.value) {
    cancelInlineText();
    return;
  }
  playMenuCue("back");
  switch (screen.value) {
    case "roster":
      exitEditor();
      break;
    case "options":
      rosterFocusBack.value = false;
      transitionTo("roster");
      break;
    case "appearance":
    case "moves":
    case "profile":
    case "fightingStyle":
    case "parameter":
    case "allyEnemy":
      optionsFocusBack.value = false;
      transitionTo("options");
      break;
    case "appearanceDetail": {
      const wasEntrance = activeCategory.value?.entrance;
      activeCategory.value = null;
      detailFocusBack.value = false;
      if (wasEntrance && entranceMode.value !== savedEntranceBeforeCategory.value) {
        entranceMode.value = savedEntranceBeforeCategory.value;
        void refreshFigure();
      }
      transitionTo("appearance");
      break;
    }
    case "movesDetail":
      activeMoveCategory.value = null;
      movesDetailFocusBack.value = false;
      transitionTo("moves");
      break;
  }
}

function exitEditor(): void {
  playMenuCue("back");
  // Deferred so MainMenu's listener does not consume the same B/Escape press.
  window.setTimeout(() => emit("back"));
}

// ------------------------------------------------------------------ screen actions: roster & options

function hoverRoster(idx: number): void {
  if (ignoreHover.value) return;
  rosterFocusBack.value = false;
  if (rosterCursor.value !== idx) {
    rosterCursor.value = idx;
    scheduleRosterPreview(idx);
  }
}

async function activateRoster(idx: number): Promise<void> {
  rosterFocusBack.value = false;
  rosterCursor.value = idx;
  const item = rosterItems.value[idx];
  if (!item) return;
  playMenuCue("select");
  if (item.kind === "create") {
    await createNewWrestler();
    optionsCursor.value = 0;
    optionsFocusBack.value = false;
    transitionTo("options");
    return;
  }
  await loadAndShowWrestler(item.summary.id, 0);
  optionsCursor.value = 0;
  optionsFocusBack.value = false;
  transitionTo("options");
}

function hoverOptions(idx: number): void {
  if (ignoreHover.value) return;
  optionsFocusBack.value = false;
  optionsCursor.value = idx;
}

function openOptionScreen(id: CharacterOptionId): void {
  const idx = CHARACTER_OPTIONS_ITEMS.findIndex((i) => i.id === id);
  if (idx >= 0) optionsCursor.value = idx;
  optionsFocusBack.value = false;
  playMenuCue("select");

  if (id === "appearance") {
    appearanceFocus.value = { zone: "left", index: 0 };
    transitionTo("appearance");
  } else if (id === "moves") {
    movesCursor.value = 0;
    movesFocusBack.value = false;
    transitionTo("moves");
    void ensureAnimationLibrary().then(() => previewMoveCategory(MOVES_CATEGORIES[0]));
  } else if (id === "profile") {
    profileCursor.value = 0;
    profileFocusBack.value = false;
    transitionTo("profile");
  } else if (id === "fightingStyle") {
    styleCursor.value = 0;
    styleFocusBack.value = false;
    transitionTo("fightingStyle");
  } else if (id === "parameter") {
    paramFocus.value = { zone: "offense", index: 0 };
    transitionTo("parameter");
  } else if (id === "allyEnemy") {
    allyCursor.value = 0;
    allyFocusBack.value = false;
    transitionTo("allyEnemy");
  }
}

// ------------------------------------------------------------------ screen actions: appearance

function hoverAppearance(zone: "left" | "right", index: number): void {
  if (ignoreHover.value) return;
  appearanceFocus.value = { zone, index };
}

function openAppearanceCategory(cat: AppearanceCategorySpec): void {
  activeCategory.value = cat;
  detailCursor.value = 0;
  detailFocusBack.value = false;
  savedEntranceBeforeCategory.value = entranceMode.value;
  playMenuCue("select");

  if (cat.entrance && !entranceMode.value) {
    entranceMode.value = true;
    void refreshFigure();
  }
  transitionTo("appearanceDetail");
  stage?.view(cat.camera);
}

function hoverDetail(idx: number): void {
  if (ignoreHover.value) return;
  detailFocusBack.value = false;
  detailCursor.value = idx;
}

function adjustDetailRow(idx: number, delta: number): void {
  const row = detailRows.value[idx];
  const lb = lookBook.value;
  const costume = activeCostume.value;
  const doc = currentDoc.value;
  if (!row || !lb || !costume || !doc) return;

  if (row.fieldName) {
    const field = lb.field(row.fieldName);
    if (!field) return;
    const [first, last] = lb.range(costume, field);
    const span = last - first + 1;
    const cur = lb.value(costume, row.fieldName);
    const next = first + ((cur - first + delta + span * 100) % span);
    lb.setValue(costume, row.fieldName, next);
    persistCurrent(`${doc.profile.fullName}: ${field.label} -> ${lb.label(field, next)}`);
    playMenuCue("move");
    void refreshFigure();
    return;
  }

  if (row.action === "height") {
    const curIdx = Math.max(0, HEIGHT_VALUES.indexOf(doc.profile.heightRaw ?? 13));
    const nextRaw = HEIGHT_VALUES[(curIdx + delta + HEIGHT_VALUES.length) % HEIGHT_VALUES.length];
    doc.profile.heightRaw = nextRaw;
    doc.profile.height = heightText(nextRaw);
    stage?.setHeightScale(heightScaleFor(nextRaw));
    rigDiagnostics.value = stage?.diagnostics() ?? null;
    persistCurrent(`${doc.profile.fullName}: height -> ${doc.profile.height}`);
    playMenuCue("move");
  } else if (row.action === "weapon") {
    const cur = doc.profile.attributes.specificWeapon ?? 0;
    const next = (cur + delta + 64) % 64;
    doc.profile.attributes.specificWeapon = next;
    persistCurrent(`${doc.profile.fullName}: weapon -> ${next}`);
    playMenuCue("move");
  } else if (row.action === "entranceToggle") {
    toggleEntranceMode();
  }
}

function activateDetailRow(idx: number): void {
  detailFocusBack.value = false;
  detailCursor.value = idx;
  const row = detailRows.value[idx];
  const lb = lookBook.value;
  const costume = activeCostume.value;
  const doc = currentDoc.value;
  if (!row || !lb || !costume || !doc) return;

  if (row.fieldName) {
    const field = lb.field(row.fieldName);
    if (!field) return;
    const [first, last] = lb.range(costume, field);
    const currentValue = lb.value(costume, row.fieldName);
    const items: PickerItem[] = [];
    for (let v = first; v <= last; v += 1) {
      let colour: string | null | undefined;
      if (field.kind === "colour") colour = v ? (lb.swatches.costume[v] ?? null) : null;
      else if (field.swatch) colour = lb.swatches[field.swatch][v] ?? null;
      items.push({ value: v, label: lb.label(field, v).toUpperCase(), colour });
    }
    const cursor = Math.max(0, currentValue - first);
    const offset = Math.min(Math.max(0, cursor - Math.floor(PICKER_WINDOW / 2)), Math.max(0, items.length - PICKER_WINDOW));
    picker.value = {
      title: field.label.toUpperCase(),
      fieldName: row.fieldName,
      isColour: field.kind === "colour" || Boolean(field.swatch),
      items,
      currentValue,
      cursor,
      offset,
    };
    playMenuCue("select");
    return;
  }

  if (row.action === "randomize") {
    lb.randomize(costume);
    persistCurrent(`${doc.profile.fullName}: costume ${costumeIndex.value + 1} randomized`);
    playMenuCue("confirm");
    showToast("COSTUME RANDOMIZED");
    void refreshFigure();
  } else if (row.action === "copyAll") {
    doc.look.costumes.forEach((target, i) => {
      if (i === costumeIndex.value) return;
      for (const field of lb.fields) lb.setValue(target, field.name, lb.value(costume, field.name));
    });
    persistCurrent(`${doc.profile.fullName}: copied costume ${costumeIndex.value + 1} to all`);
    playMenuCue("confirm");
    showToast(`COPIED COSTUME ${costumeIndex.value + 1} TO ALL 4`);
  } else if (row.action === "reset") {
    for (const field of lb.fields) lb.setValue(costume, field.name, 0);
    persistCurrent(`${doc.profile.fullName}: costume ${costumeIndex.value + 1} reset`);
    playMenuCue("back");
    showToast(`COSTUME ${costumeIndex.value + 1} RESET`);
    void refreshFigure();
  } else if (row.action === "entranceToggle") {
    toggleEntranceMode();
  }
}

function choosePicker(index: number): void {
  const p = picker.value;
  const lb = lookBook.value;
  const costume = activeCostume.value;
  const doc = currentDoc.value;
  if (!p || !lb || !costume || !doc) return;
  const item = p.items[index];
  if (!item) return;
  lb.setValue(costume, p.fieldName, item.value);
  persistCurrent(`${doc.profile.fullName}: ${p.title} -> ${item.label}`);
  picker.value = null;
  playMenuCue("confirm");
  void refreshFigure();
}

function closePicker(): void {
  picker.value = null;
  playMenuCue("back");
}

// ------------------------------------------------------------------ screen actions: moves

async function ensureAnimationLibrary(): Promise<void> {
  if (allAnimationClips.value.length) return;
  try {
    const listing = await resolveAssets();
    if (!disposed) allAnimationClips.value = listing.animations;
  } catch {
    // non-fatal if animation catalog unavailable
  }
}

function previewMoveCategory(cat: MoveCategorySpec): void {
  const clips = clipsForMoveCategory(allAnimationClips.value, cat.prefix);
  if (clips.length && stage) {
    void stage.setAnimation(clips[0]);
  }
}

function hoverMovesCategory(idx: number): void {
  if (ignoreHover.value) return;
  movesFocusBack.value = false;
  if (movesCursor.value !== idx) {
    movesCursor.value = idx;
    previewMoveCategory(MOVES_CATEGORIES[idx]);
  }
}

function openMovesCategory(cat: MoveCategorySpec): void {
  activeMoveCategory.value = cat;
  moveClipCursor.value = 0;
  moveClipOffset.value = 0;
  movesDetailFocusBack.value = false;
  playMenuCue("select");
  transitionTo("movesDetail");
  const clips = clipsForMoveCategory(allAnimationClips.value, cat.prefix);
  if (clips.length && stage) {
    void stage.setAnimation(clips[0]);
  }
}

function hoverMoveClip(index: number): void {
  if (ignoreHover.value) return;
  movesDetailFocusBack.value = false;
  if (moveClipCursor.value !== index) {
    moveClipCursor.value = index;
    const clip = categoryClips.value[index];
    if (clip && stage) void stage.setAnimation(clip.path);
  }
}

function activateMoveClip(index: number): void {
  movesDetailFocusBack.value = false;
  moveClipCursor.value = index;
  const clip = categoryClips.value[index];
  if (!clip || !stage) return;
  playMenuCue("select");
  if (playback.clipPath === clip.path) stage.replayAnimation();
  else void stage.setAnimation(clip.path);
}

// ------------------------------------------------------------------ screen actions: profile

function hoverProfile(idx: number): void {
  if (ignoreHover.value) return;
  profileFocusBack.value = false;
  profileCursor.value = idx;
}

function startInlineText(key: "fullName" | "shortName" | "ringName"): void {
  if (!currentDoc.value) return;
  editingTextKey.value = key;
  inlineTextValue.value = String(currentDoc.value.profile[key] ?? "");
  typing.value = true;
  releaseCamera();
  playMenuCue("select");
  void nextTick(() => {
    const el = inlineTextInput.value;
    const input = Array.isArray(el) ? el[0] : el;
    input?.focus();
    input?.select();
  });
}

function commitInlineText(): void {
  const key = editingTextKey.value as "fullName" | "shortName" | "ringName" | null;
  if (!key || !currentDoc.value) return;
  const trimmed = inlineTextValue.value.trim();
  if (key === "ringName") currentDoc.value.profile.ringName = trimmed || null;
  else currentDoc.value.profile[key] = trimmed || (key === "fullName" ? currentDoc.value.id : "");
  editingTextKey.value = null;
  typing.value = false;
  persistCurrent(`${currentDoc.value.profile.fullName}: ${key} updated`);
  playMenuCue("confirm");
}

function cancelInlineText(): void {
  editingTextKey.value = null;
  typing.value = false;
  playMenuCue("back");
}

function adjustProfileRow(idx: number, delta: number): void {
  const row = profileRows.value[idx];
  const doc = currentDoc.value;
  if (!row || !doc) return;
  confirmingDelete.value = false;

  if (row.key === "height") {
    const curIdx = Math.max(0, HEIGHT_VALUES.indexOf(doc.profile.heightRaw ?? 13));
    const nextRaw = HEIGHT_VALUES[(curIdx + delta + HEIGHT_VALUES.length) % HEIGHT_VALUES.length];
    doc.profile.heightRaw = nextRaw;
    doc.profile.height = heightText(nextRaw);
    stage?.setHeightScale(heightScaleFor(nextRaw));
    rigDiagnostics.value = stage?.diagnostics() ?? null;
    persistCurrent(`${doc.profile.fullName}: height -> ${doc.profile.height}`);
    playMenuCue("move");
  } else if (row.key === "weight") {
    const cur = doc.profile.weightRaw ?? 140;
    let next: number;
    if (cur >= 500) {
      const ci = WEIGHT_CLASS_VALUES.indexOf(cur);
      const ni = ci + delta;
      next = ni < 0 ? 499 : ni >= WEIGHT_CLASS_VALUES.length ? 0 : WEIGHT_CLASS_VALUES[ni];
    } else {
      const step = Math.abs(delta) > 1 ? delta : delta * 5;
      const candidate = cur + step;
      next = candidate < 0 ? WEIGHT_CLASS_VALUES[WEIGHT_CLASS_VALUES.length - 1] : candidate > 499 ? WEIGHT_CLASS_VALUES[0] : candidate;
    }
    doc.profile.weightRaw = next;
    doc.profile.weight = weightText(next);
    persistCurrent(`${doc.profile.fullName}: weight -> ${doc.profile.weight}`);
    playMenuCue("move");
  } else if (row.key === "costume") {
    cycleCostume(delta);
  }
}

async function activateProfileRow(idx: number): Promise<void> {
  profileFocusBack.value = false;
  profileCursor.value = idx;
  const row = profileRows.value[idx];
  const doc = currentDoc.value;
  if (!row || !doc) return;

  if (row.textField) {
    startInlineText(row.textField);
    return;
  }
  if (row.key === "exportGlb") {
    await exportCharacterGlb();
  } else if (row.key === "downloadJson") {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    downloadBlob(`${doc.id}.json`, blob);
    playMenuCue("confirm");
    showToast(`SAVED ${doc.id}.json`);
  } else if (row.key === "copyJson") {
    try {
      await navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
      playMenuCue("confirm");
      showToast("COPIED WRESTLER JSON");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Copy failed", true);
    }
  } else if (row.key === "pasteJson") {
    try {
      const parsed: unknown = JSON.parse(await navigator.clipboard.readText());
      if (!isValidWrestlerDocument(parsed)) throw new Error("Clipboard does not hold wrestler JSON.");
      doc.profile = plainClone(parsed.profile);
      doc.look = plainClone(parsed.look);
      if (lookBook.value) for (const c of doc.look.costumes) lookBook.value.normalise(c);
      persistCurrent(`${doc.profile.fullName}: pasted JSON`);
      playMenuCue("confirm");
      showToast("PASTED WRESTLER JSON");
      await refreshFigure();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Paste failed", true);
    }
  } else if (row.key === "clone") {
    await cloneCurrentWrestler();
  } else if (row.key === "delete") {
    if (!confirmingDelete.value) {
      confirmingDelete.value = true;
      playMenuCue("toggle");
      return;
    }
    const name = doc.profile.fullName;
    deleteCreatedWrestler(doc.id, `${name} deleted`);
    confirmingDelete.value = false;
    playMenuCue("back");
    showToast(`DELETED ${name}`);
    await loadAndShowWrestler("default", 0);
    rosterCursor.value = 1;
    transitionTo("roster");
  } else if (row.key === "revert") {
    const id = doc.id;
    revertBundledWrestler(id, `${doc.profile.fullName} reverted`);
    playMenuCue("back");
    showToast("REVERTED TO BUNDLED");
    await loadAndShowWrestler(id, costumeIndex.value);
  }
}

// ------------------------------------------------------------------ screen actions: style, param, ally

function hoverStyle(idx: number): void {
  if (ignoreHover.value) return;
  styleFocusBack.value = false;
  styleCursor.value = idx;
}

function adjustStyleRow(idx: number, delta: number): void {
  const row = styleRows.value[idx];
  const doc = currentDoc.value;
  if (!row || !doc) return;

  if (row.key === "style") {
    const cur = FIGHTING_STYLE_NAMES.indexOf(doc.profile.style?.name ?? "Wrestling");
    const next = ((cur < 0 ? 0 : cur) + delta + FIGHTING_STYLE_NAMES.length) % FIGHTING_STYLE_NAMES.length;
    doc.profile.style = { index: next, name: FIGHTING_STYLE_NAMES[next] };
    persistCurrent(`${doc.profile.fullName}: style -> ${FIGHTING_STYLE_NAMES[next]}`);
    playMenuCue("move");
  } else if (row.key === "stance") {
    stancePresetIndex.value = (stancePresetIndex.value + delta + CREATOR_PREVIEW_ANIMATIONS.length) % CREATOR_PREVIEW_ANIMATIONS.length;
    void stage?.setAnimation(CREATOR_PREVIEW_ANIMATIONS[stancePresetIndex.value].clip);
    playMenuCue("move");
  } else if (row.key === "rig") {
    // 3 states: Off -> Body 52 -> All 71
    const stateIdx = !stageState.skeleton ? 0 : stageState.showHelpers ? 2 : 1;
    const next = (stateIdx + delta + 3) % 3;
    stageState.skeleton = next > 0;
    stageState.showHelpers = next === 2;
    stage?.setOption("skeleton", stageState.skeleton);
    stage?.setOption("showHelpers", stageState.showHelpers);
    playMenuCue("toggle");
  } else if (row.key === "shading") {
    stageState.textured = !stageState.textured;
    stage?.setOption("textured", stageState.textured);
    playMenuCue("toggle");
  } else if (row.key === "camera") {
    cameraPresetIndex.value = (cameraPresetIndex.value + delta + CAMERA_PRESETS.length) % CAMERA_PRESETS.length;
    stageState.rotate = false;
    stage?.view(CAMERA_PRESETS[cameraPresetIndex.value]);
    playMenuCue("move");
  } else if (row.key === "rotate") {
    stageState.rotate = !stageState.rotate;
    stage?.setOption("rotate", stageState.rotate);
    playMenuCue("toggle");
  } else if (row.key === "entrance") {
    toggleEntranceMode();
  } else if (row.key === "speed") {
    const cur = doc.profile.attributes?.speed ?? 2;
    const next = Math.min(3, Math.max(1, cur + delta));
    if (next === cur) {
      playMenuCue("deny");
      return;
    }
    doc.profile.attributes.speed = next;
    const p = doc.profile.allParams?.find((entry) => entry.name === PARAM_OF.speed);
    if (p) p.value = next;
    persistCurrent(`${doc.profile.fullName}: speed -> ${next}`);
    playMenuCue("move");
  }
}

function activateStyleRow(idx: number): void {
  styleFocusBack.value = false;
  styleCursor.value = idx;
  adjustStyleRow(idx, 1);
}

function hoverParam(zone: "offense" | "defense", index: number): void {
  if (ignoreHover.value) return;
  paramFocus.value = { zone, index };
}

function setParamValue(group: "attack" | "defence", part: ParameterPart, value: number): void {
  const doc = currentDoc.value;
  if (!doc) return;
  const clamped = Math.min(5, Math.max(1, Math.round(value)));
  const current = doc.profile.attributes[group][part] ?? 1;
  if (clamped === current) {
    playMenuCue("deny");
    return;
  }
  doc.profile.attributes[group][part] = clamped;
  const key = `${group}.${part}`;
  const paramName = PARAM_OF[key];
  const p = doc.profile.allParams?.find((entry) => entry.name === paramName);
  if (p) p.value = clamped;
  persistCurrent(`${doc.profile.fullName}: ${group} ${part} -> ${clamped}`);
  playMenuCue("move");
}

function stepParam(group: "attack" | "defence", part: ParameterPart, delta: number, wrap = false): void {
  const doc = currentDoc.value;
  if (!doc) return;
  const current = Math.min(5, Math.max(1, doc.profile.attributes[group][part] ?? 1));
  const next = wrap ? ((current - 1 + delta + 5) % 5) + 1 : Math.min(5, Math.max(1, current + delta));
  setParamValue(group, part, next);
}

function hoverAlly(idx: number): void {
  if (ignoreHover.value) return;
  allyFocusBack.value = false;
  allyCursor.value = idx;
}

function adjustAllyRow(idx: number, delta: number): void {
  const doc = currentDoc.value;
  const pool = allyCandidates.value;
  if (!doc || !pool.length) return;
  if (idx === 0) {
    const cur = Math.max(0, pool.indexOf(doc.profile.partner ?? "NONE"));
    const next = pool[(cur + delta + pool.length) % pool.length];
    doc.profile.partner = next === "NONE" ? null : next;
  } else {
    const rivals = [...(doc.profile.rivals ?? [])];
    const slot = idx - 1;
    while (rivals.length <= slot) rivals.push("");
    const cur = Math.max(0, pool.indexOf(rivals[slot] || "NONE"));
    const next = pool[(cur + delta + pool.length) % pool.length];
    rivals[slot] = next === "NONE" ? "" : next;
    doc.profile.rivals = rivals.filter(Boolean);
  }
  persistCurrent(`${doc.profile.fullName}: updated allies/rivals`);
  playMenuCue("move");
}

// ------------------------------------------------------------------ shared helpers

function nextCustomId(): string {
  const used = new Set(allSummaries.value.map((s) => s.id));
  let num = allSummaries.value.length + 1;
  while (used.has(`created-${num}`)) num += 1;
  return `created-${num}`;
}

async function createNewWrestler(): Promise<void> {
  if (!defaultTemplate.value || !lookBook.value) return;
  const doc = plainClone(defaultTemplate.value);
  const id = nextCustomId();
  const num = id.replace("created-", "");
  doc.id = id;
  doc.rosterIndex = null;
  doc.profile.fullName = `NEW WRESTLER ${num}`;
  doc.profile.shortName = "NEW";
  doc.profile.ringName = null;
  doc.source = { game: "VPG Character Editor", rig: "VPG Rig 2.0", created: new Date().toISOString() };
  for (const c of doc.look.costumes) lookBook.value.normalise(c);
  saveWrestler(doc, true, `${doc.profile.fullName} created`);
  showToast(`CREATED ${doc.profile.fullName}`);
  await loadAndShowWrestler(doc.id, 0);
}

async function cloneCurrentWrestler(): Promise<void> {
  if (!currentDoc.value || !lookBook.value) return;
  const doc = plainClone(currentDoc.value);
  const id = nextCustomId();
  doc.id = id;
  doc.rosterIndex = null;
  doc.profile.fullName = `${currentDoc.value.profile.fullName} COPY`;
  doc.source = { game: "VPG Character Editor", rig: "VPG Rig 2.0", clonedFrom: currentDoc.value.id, created: new Date().toISOString() };
  for (const c of doc.look.costumes) lookBook.value.normalise(c);
  saveWrestler(doc, true, `${doc.profile.fullName} cloned`);
  playMenuCue("confirm");
  showToast(`CLONED AS ${doc.profile.fullName}`);
  await loadAndShowWrestler(doc.id, costumeIndex.value);
}

function cycleCostume(delta: number): void {
  const doc = currentDoc.value;
  if (!doc || !doc.look.costumes.length) return;
  const len = doc.look.costumes.length;
  costumeIndex.value = (costumeIndex.value + delta + len) % len;
  playMenuCue("move");
  void refreshFigure();
}

function toggleEntranceMode(): void {
  entranceMode.value = !entranceMode.value;
  playMenuCue("toggle");
  void refreshFigure();
}

function togglePlay(): void {
  stageState.playing = !stageState.playing;
  stage?.setOption("playing", stageState.playing);
  playMenuCue("toggle");
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportCharacterGlb(): Promise<void> {
  if (!stage || !currentDoc.value || exportingGlb.value) return;
  exportingGlb.value = true;
  try {
    const stem =
      (currentDoc.value.profile.fullName || currentDoc.value.id)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || currentDoc.value.id;
    const glb = await stage.exportGlb(stem);
    const bytes = new Uint8Array(glb.byteLength);
    bytes.set(glb);
    downloadBlob(`${stem}-c${costumeIndex.value + 1}-vpg.glb`, new Blob([bytes], { type: "model/gltf-binary" }));
    playMenuCue("confirm");
    showToast(`EXPORTED ${stem}-c${costumeIndex.value + 1}-vpg.glb (71 BONES)`);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "GLB export failed", true);
  } finally {
    exportingGlb.value = false;
  }
}

// ------------------------------------------------------------------ D-Pad & VirtualController engine

const REPEATABLE = new Set<VirtualInput>(["up", "down", "left", "right"]);
const CAMERA_INPUTS = new Set<VirtualInput>([
  "stickUp",
  "stickDown",
  "stickLeft",
  "stickRight",
  "cUp",
  "cDown",
  "cLeft",
  "cRight",
]);
const heldCamera = new Set<VirtualInput>();

function scrollActiveOptionIntoView(container: HTMLElement | null): void {
  void nextTick(() => {
    container?.querySelector<HTMLElement>(".game-bar--active")?.scrollIntoView({ block: "nearest" });
  });
}

function handlePickerInput(input: VirtualInput, repeat: boolean): void {
  const p = picker.value;
  if (!p) return;
  const cols = p.isColour ? 4 : 3;
  const n = p.items.length;

  let next = p.cursor;
  if (input === "up") next = Math.max(0, p.cursor - cols);
  else if (input === "down") next = Math.min(n - 1, p.cursor + cols);
  else if (input === "left") next = Math.max(0, p.cursor - 1);
  else if (input === "right") next = Math.min(n - 1, p.cursor + 1);
  else if (input === "l") next = Math.max(0, p.cursor - PICKER_WINDOW);
  else if (input === "r") next = Math.min(n - 1, p.cursor + PICKER_WINDOW);
  else if (input === "a" && !repeat) return choosePicker(p.cursor);
  else if (input === "b" && !repeat) return closePicker();
  else return;

  if (next === p.cursor) return playMenuCue("deny");
  p.cursor = next;
  if (next < p.offset) p.offset = Math.floor(next / cols) * cols;
  else if (next >= p.offset + PICKER_WINDOW) {
    p.offset = Math.min(Math.max(0, n - PICKER_WINDOW), Math.floor((next - PICKER_WINDOW + cols) / cols) * cols);
  }
  playMenuCue("move");
}

function onVirtualInput(input: VirtualInput, repeat: boolean): void {
  if (CAMERA_INPUTS.has(input)) return;
  if (repeat && !REPEATABLE.has(input)) return;

  if (typing.value) {
    if (input === "b") {
      if (editingTextKey.value) cancelInlineText();
      else rosterSearchInput.value?.blur();
    }
    return;
  }

  if (input === "start" && !repeat) return togglePlay();
  if (input === "z" && !repeat) return toggleEntranceMode();

  if (picker.value) return handlePickerInput(input, repeat);

  const isUp = input === "up";
  const isDown = input === "down";
  const isLeft = input === "left";
  const isRight = input === "right";

  if (input === "b" && !repeat) return handleBackAction();

  // Global L/R switches costume except where L/R pages lists or styles
  if ((input === "l" || input === "r") && !repeat) {
    const dir = input === "r" ? 1 : -1;
    if (screen.value === "appearanceDetail") {
      if (!detailFocusBack.value) adjustDetailRow(detailCursor.value, dir * 10);
      return;
    }
    if (screen.value === "movesDetail") {
      const n = categoryClips.value.length;
      if (!n) return;
      movesDetailFocusBack.value = false;
      moveClipCursor.value = Math.min(n - 1, Math.max(0, moveClipCursor.value + dir * MOVES_WINDOW));
      syncMovesOffset();
      const clip = categoryClips.value[moveClipCursor.value];
      if (clip && stage) void stage.setAnimation(clip.path);
      playMenuCue("move");
      return;
    }
    if (screen.value === "parameter") {
      paramFocus.value = moveParameterFocus(paramFocus.value, "column");
      playMenuCue("move");
      return;
    }
    cycleCostume(dir);
    return;
  }

  // Screen-specific D-Pad navigation
  if (screen.value === "roster") {
    const n = rosterItems.value.length;
    if (isRight) {
      if (!rosterFocusBack.value) {
        rosterFocusBack.value = true;
        playMenuCue("move");
      }
      return;
    }
    if (isLeft && rosterFocusBack.value) {
      rosterFocusBack.value = false;
      playMenuCue("move");
      return;
    }
    if (isUp || isDown) {
      rosterFocusBack.value = false;
      rosterCursor.value = (rosterCursor.value + (isDown ? 1 : -1) + n) % n;
      playMenuCue("move");
      scrollActiveOptionIntoView(rosterListEl.value);
      scheduleRosterPreview(rosterCursor.value);
      return;
    }
    if (input === "a" && !repeat) {
      if (rosterFocusBack.value) return handleBackAction();
      void activateRoster(rosterCursor.value);
    }
    return;
  }

  if (screen.value === "options") {
    const n = CHARACTER_OPTIONS_ITEMS.length;
    if (isRight) {
      if (!optionsFocusBack.value) {
        optionsFocusBack.value = true;
        playMenuCue("move");
      }
      return;
    }
    if (isLeft && optionsFocusBack.value) {
      optionsFocusBack.value = false;
      playMenuCue("move");
      return;
    }
    if (isUp || isDown) {
      optionsFocusBack.value = false;
      optionsCursor.value = (optionsCursor.value + (isDown ? 1 : -1) + n) % n;
      playMenuCue("move");
      return;
    }
    if (input === "a" && !repeat) {
      if (optionsFocusBack.value) return handleBackAction();
      openOptionScreen(CHARACTER_OPTIONS_ITEMS[optionsCursor.value].id);
    }
    return;
  }

  if (screen.value === "appearance") {
    const dir = isUp ? "up" : isDown ? "down" : isLeft ? "left" : isRight ? "right" : null;
    if (dir) {
      const next = moveAppearanceFocus(appearanceFocus.value, dir);
      if (next !== appearanceFocus.value) {
        appearanceFocus.value = next;
        playMenuCue("move");
      }
      return;
    }
    if (input === "a" && !repeat) {
      const cur = appearanceFocus.value;
      if (cur.zone === "back") return handleBackAction();
      const cat = cur.zone === "left" ? APPEARANCE_LEFT_CATEGORIES[cur.index] : APPEARANCE_RIGHT_CATEGORIES[cur.index];
      if (cat) openAppearanceCategory(cat);
    }
    return;
  }

  if (screen.value === "appearanceDetail") {
    const n = detailRows.value.length;
    if (isUp) {
      if (detailFocusBack.value) {
        detailFocusBack.value = false;
        detailCursor.value = Math.max(0, n - 1);
      } else if (detailCursor.value === 0) {
        detailFocusBack.value = true;
      } else {
        detailCursor.value -= 1;
      }
      playMenuCue("move");
      return;
    }
    if (isDown) {
      if (detailFocusBack.value) {
        detailFocusBack.value = false;
        detailCursor.value = 0;
      } else {
        detailCursor.value = (detailCursor.value + 1) % Math.max(1, n);
      }
      playMenuCue("move");
      return;
    }
    if (isLeft || isRight) {
      if (detailFocusBack.value) {
        if (isLeft) {
          detailFocusBack.value = false;
          playMenuCue("move");
        }
        return;
      }
      const row = detailRows.value[detailCursor.value];
      if (row?.adjustable) adjustDetailRow(detailCursor.value, isRight ? 1 : -1);
      else if (isRight) {
        detailFocusBack.value = true;
        playMenuCue("move");
      }
      return;
    }
    if (input === "a" && !repeat) {
      if (detailFocusBack.value) return handleBackAction();
      activateDetailRow(detailCursor.value);
    }
    return;
  }

  if (screen.value === "moves") {
    const n = MOVES_CATEGORIES.length;
    if (isRight) {
      if (!movesFocusBack.value) {
        movesFocusBack.value = true;
        playMenuCue("move");
      }
      return;
    }
    if (isLeft && movesFocusBack.value) {
      movesFocusBack.value = false;
      playMenuCue("move");
      return;
    }
    if (isUp || isDown) {
      movesFocusBack.value = false;
      movesCursor.value = (movesCursor.value + (isDown ? 1 : -1) + n) % n;
      playMenuCue("move");
      previewMoveCategory(MOVES_CATEGORIES[movesCursor.value]);
      return;
    }
    if (input === "a" && !repeat) {
      if (movesFocusBack.value) return handleBackAction();
      openMovesCategory(MOVES_CATEGORIES[movesCursor.value]);
    }
    return;
  }

  if (screen.value === "movesDetail") {
    const n = categoryClips.value.length;
    if (isRight) {
      if (!movesDetailFocusBack.value) {
        movesDetailFocusBack.value = true;
        playMenuCue("move");
      }
      return;
    }
    if (isLeft && movesDetailFocusBack.value) {
      movesDetailFocusBack.value = false;
      playMenuCue("move");
      return;
    }
    if ((isUp || isDown) && n > 0) {
      movesDetailFocusBack.value = false;
      moveClipCursor.value = (moveClipCursor.value + (isDown ? 1 : -1) + n) % n;
      syncMovesOffset();
      playMenuCue("move");
      const clip = categoryClips.value[moveClipCursor.value];
      if (clip && stage) void stage.setAnimation(clip.path);
      return;
    }
    if (input === "a" && !repeat) {
      if (movesDetailFocusBack.value) return handleBackAction();
      activateMoveClip(moveClipCursor.value);
    }
    return;
  }

  if (screen.value === "profile") {
    const n = profileRows.value.length;
    if (isUp) {
      if (profileFocusBack.value) {
        profileFocusBack.value = false;
        profileCursor.value = Math.max(0, n - 1);
      } else if (profileCursor.value === 0) {
        profileFocusBack.value = true;
      } else {
        profileCursor.value -= 1;
      }
      confirmingDelete.value = false;
      playMenuCue("move");
      return;
    }
    if (isDown) {
      if (profileFocusBack.value) {
        profileFocusBack.value = false;
        profileCursor.value = 0;
      } else {
        profileCursor.value = (profileCursor.value + 1) % Math.max(1, n);
      }
      confirmingDelete.value = false;
      playMenuCue("move");
      return;
    }
    if (isLeft || isRight) {
      if (profileFocusBack.value) {
        if (isLeft) {
          profileFocusBack.value = false;
          playMenuCue("move");
        }
        return;
      }
      const row = profileRows.value[profileCursor.value];
      if (row?.adjustable) adjustProfileRow(profileCursor.value, isRight ? 1 : -1);
      else if (isRight) {
        profileFocusBack.value = true;
        playMenuCue("move");
      }
      return;
    }
    if (input === "a" && !repeat) {
      if (profileFocusBack.value) return handleBackAction();
      void activateProfileRow(profileCursor.value);
    }
    return;
  }

  if (screen.value === "fightingStyle") {
    const n = styleRows.value.length;
    if (isUp) {
      if (styleFocusBack.value) {
        styleFocusBack.value = false;
        styleCursor.value = n - 1;
      } else if (styleCursor.value === 0) {
        styleFocusBack.value = true;
      } else {
        styleCursor.value -= 1;
      }
      playMenuCue("move");
      return;
    }
    if (isDown) {
      if (styleFocusBack.value) {
        styleFocusBack.value = false;
        styleCursor.value = 0;
      } else {
        styleCursor.value = (styleCursor.value + 1) % n;
      }
      playMenuCue("move");
      return;
    }
    if (isLeft || isRight) {
      if (styleFocusBack.value) {
        if (isLeft) {
          styleFocusBack.value = false;
          playMenuCue("move");
        }
        return;
      }
      adjustStyleRow(styleCursor.value, isRight ? 1 : -1);
      return;
    }
    if (input === "a" && !repeat) {
      if (styleFocusBack.value) return handleBackAction();
      activateStyleRow(styleCursor.value);
    }
    return;
  }

  if (screen.value === "parameter") {
    if (isUp || isDown) {
      paramFocus.value = moveParameterFocus(paramFocus.value, isUp ? "up" : "down");
      playMenuCue("move");
      return;
    }
    if (isLeft || isRight) {
      const cur = paramFocus.value;
      if (cur.zone === "back") {
        if (isLeft) {
          paramFocus.value = moveParameterFocus(cur, "leftFromBack");
          playMenuCue("move");
        }
        return;
      }
      const group = cur.zone === "offense" ? "attack" : "defence";
      const part = PARAMETER_PARTS[cur.index];
      if (part) stepParam(group, part, isRight ? 1 : -1);
      return;
    }
    if (input === "a" && !repeat) {
      const cur = paramFocus.value;
      if (cur.zone === "back") return handleBackAction();
      const group = cur.zone === "offense" ? "attack" : "defence";
      const part = PARAMETER_PARTS[cur.index];
      if (part) stepParam(group, part, 1, true);
    }
    return;
  }

  if (screen.value === "allyEnemy") {
    const n = allyRows.value.length;
    if (isUp) {
      if (allyFocusBack.value) {
        allyFocusBack.value = false;
        allyCursor.value = n - 1;
      } else if (allyCursor.value === 0) {
        allyFocusBack.value = true;
      } else {
        allyCursor.value -= 1;
      }
      playMenuCue("move");
      return;
    }
    if (isDown) {
      if (allyFocusBack.value) {
        allyFocusBack.value = false;
        allyCursor.value = 0;
      } else {
        allyCursor.value = (allyCursor.value + 1) % n;
      }
      playMenuCue("move");
      return;
    }
    if (isLeft || isRight) {
      if (allyFocusBack.value) {
        if (isLeft) {
          allyFocusBack.value = false;
          playMenuCue("move");
        }
        return;
      }
      adjustAllyRow(allyCursor.value, isRight ? 1 : -1);
      return;
    }
    if (input === "a" && !repeat && allyFocusBack.value) return handleBackAction();
  }
}

function syncMovesOffset(): void {
  const n = categoryClips.value.length;
  if (moveClipCursor.value < moveClipOffset.value) {
    moveClipOffset.value = moveClipCursor.value;
  } else if (moveClipCursor.value >= moveClipOffset.value + MOVES_WINDOW) {
    moveClipOffset.value = Math.min(Math.max(0, n - MOVES_WINDOW), moveClipCursor.value - MOVES_WINDOW + 1);
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  if (typing.value) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (editingTextKey.value) cancelInlineText();
      else rosterSearchInput.value?.blur();
    } else if (event.key === "Enter" && !editingTextKey.value) {
      event.preventDefault();
      rosterSearchInput.value?.blur();
    }
    return;
  }

  if (event.key === "/" && screen.value === "roster") {
    event.preventDefault();
    rosterSearchInput.value?.focus();
    return;
  }

  const input = virtualInputFor(event);
  if (!input) return;
  event.preventDefault();
  if (CAMERA_INPUTS.has(input)) heldCamera.add(input);
  onVirtualInput(input, event.repeat);
}

function onKeyUp(event: KeyboardEvent): void {
  const input = virtualInputFor(event);
  if (input) heldCamera.delete(input);
}

function releaseCamera(): void {
  heldCamera.clear();
}

let camRaf = 0;
let lastCamTime = 0;
function tickCamera(now: number): void {
  const dt = lastCamTime ? Math.min((now - lastCamTime) / 1000, 0.1) : 0;
  lastCamTime = now;
  if (stage && heldCamera.size && dt && !typing.value) {
    const orbit =
      (heldCamera.has("stickLeft") || heldCamera.has("cLeft") ? 1 : 0) -
      (heldCamera.has("stickRight") || heldCamera.has("cRight") ? 1 : 0);
    const zoom =
      (heldCamera.has("stickDown") || heldCamera.has("cDown") ? 1 : 0) -
      (heldCamera.has("stickUp") || heldCamera.has("cUp") ? 1 : 0);
    if (orbit) stage.orbit(orbit * 2.1 * dt, 0);
    if (zoom) stage.zoom(Math.pow(1.85, zoom * dt));
  }
  camRaf = requestAnimationFrame(tickCamera);
}

// ------------------------------------------------------------------ lifecycle

let stopGamepad: (() => void) | null = null;

onMounted(async () => {
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseCamera);
  stopGamepad = pollGamepadBindings(
    (binding, repeat) => {
      const input = virtualInputForBinding(binding);
      if (!input) return;
      if (CAMERA_INPUTS.has(input)) heldCamera.add(input);
      onVirtualInput(input, repeat);
    },
    {
      onRelease(binding) {
        const input = virtualInputForBinding(binding);
        if (input) heldCamera.delete(input);
      },
      repeat(binding) {
        const input = virtualInputForBinding(binding);
        return Boolean(input && REPEATABLE.has(input));
      },
    },
  );
  camRaf = requestAnimationFrame(tickCamera);

  try {
    const [m, rosterIdx, defDoc] = await Promise.all([
      loadCreatorManifest(),
      loadCreatorRoster(),
      loadBundledWrestler("default"),
    ]);
    if (disposed) return;

    manifest.value = m;
    const lb = new CharacterLookBook(m);
    lb.nameBuilds(rosterIdx.summaries);
    lookBook.value = lb;
    bundledSummaries.value = [...rosterIdx.summaries];
    defaultTemplate.value = plainClone(defDoc);

    await nextTick();
    if (!stageCanvas.value || disposed) return;

    stage = new CharacterStage(stageCanvas.value, m, {
      onPlaybackChange(snap) {
        Object.assign(playback, snap);
      },
    });
    stage.setOption("rotate", stageState.rotate);
    stage.setOption("playing", stageState.playing);
    stage.setOption("textured", stageState.textured);
    stage.setOption("model", stageState.model);
    stage.setOption("skeleton", stageState.skeleton);

    const startId = rosterIdx.wrestlers[0] ?? "default";
    await loadAndShowWrestler(startId, 0);
    if (!disposed) {
      void stage.setAnimation(CREATOR_PREVIEW_ANIMATIONS[0].clip);
    }
  } catch (err) {
    if (!disposed) bootError.value = err instanceof Error ? err.message : String(err);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  window.clearTimeout(previewDebounce);
  window.clearTimeout(toastTimer);
  document.removeEventListener("keydown", onKeyDown);
  document.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("blur", releaseCamera);
  stopGamepad?.();
  cancelAnimationFrame(camRaf);
  stage?.dispose();
  stage = null;
});
</script>

<style scoped>
/* ----------------------------------------------------------- Booth HUD pills */

.booth-pill {
  padding: 0.14rem 0.44rem;
  background: rgba(12, 8, 30, 0.8);
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

/* ----------------------------------------------------------- Bar inner slots */

.game-bar__label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.game-bar__k {
  text-align: left;
  white-space: nowrap;
}

.game-bar__v {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.val-text {
  max-width: 11.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-slot {
  font-size: 0.85rem;
  opacity: 0.78;
}

.bar-tag {
  padding: 0.05rem 0.38rem;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  background: rgba(11, 14, 28, 0.72);
  color: var(--vpg-cfg-accent-lime);
  border: 1px solid rgba(182, 255, 116, 0.5);
}

.bar-tag--edited {
  color: var(--vpg-cfg-accent-amber);
  border-color: rgba(255, 208, 137, 0.5);
}

.arrow-btn {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.78rem;
  padding: 0.1rem 0.25rem;
  cursor: pointer;
  opacity: 0.85;
}

.arrow-btn:hover {
  opacity: 1;
}

.mini-swatch {
  width: 1rem;
  height: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.6);
  flex: none;
}

.mini-swatch--default {
  background-image: repeating-linear-gradient(135deg, transparent 0 3px, rgba(255, 255, 255, 0.35) 3px 5px);
}

.inline-text {
  width: 11.5rem;
  padding: 0.18rem 0.4rem;
  border: 2px solid var(--vpg-cfg-text-active);
  background: #ffffff;
  color: var(--vpg-cfg-text-active);
  font-family: var(--vpg-font-pixel);
  font-size: 0.92rem;
  outline: none;
}

/* ----------------------------------------------------------- split-left (Roster & Options) */

.layer-split-left {
  position: absolute;
  top: 6.2rem;
  left: 0;
  width: 58%;
  bottom: 2.6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 3.2rem 1rem;
  z-index: 6;
}

.layer-split-left--center {
  justify-content: center;
  gap: 1.25rem;
}

.options-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.options-meta__name {
  font-family: var(--vpg-font-display);
  font-size: 1.2rem;
  color: #ffffff;
  letter-spacing: 0.08em;
  text-shadow: 2px 2px 0 rgba(5, 8, 18, 0.9);
}

.options-meta__sub {
  font-family: var(--vpg-font-pixel);
  font-size: 0.88rem;
  color: #b7d2ff;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.roster-toolbar {
  width: min(100%, 27rem);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-bottom: 0.55rem;
}

.retro-search {
  flex: 1;
}

.retro-search__input {
  width: 100%;
  height: 2rem;
  padding: 0 0.65rem;
  border: 1px solid rgba(182, 210, 255, 0.45);
  background: rgba(14, 24, 52, 0.86);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.88rem;
  letter-spacing: 0.06em;
  outline: none;
}

.retro-search__input:focus {
  border-color: var(--vpg-cfg-frame-border);
  box-shadow: 0 0 0 2px rgba(204, 168, 255, 0.35);
}

.roster-count {
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  color: var(--vpg-cfg-accent-lime);
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.menu-stack {
  width: min(100%, 27rem);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.menu-stack--options {
  width: min(100%, 22.5rem);
  gap: 0.85rem;
}

.menu-stack--scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem 0.65rem;
  scrollbar-color: var(--vpg-cfg-frame-border) rgba(15, 22, 46, 0.5);
}

/* ----------------------------------------------------------- Appearance 2-column overlap */

.layer-appearance {
  position: absolute;
  top: 21%;
  bottom: 10%;
  left: 3.2%;
  right: 3.2%;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
  z-index: 8;
}

.app-col {
  width: clamp(13rem, 26vw, 22rem);
  display: flex;
  flex-direction: column;
  gap: 0.34rem;
  pointer-events: auto;
}

/* ----------------------------------------------------------- Left-rail overlap (Moves, Detail, Profile, etc.) */

.layer-left-rail {
  position: absolute;
  top: 21%;
  bottom: 10%;
  left: 3.8%;
  width: clamp(17rem, 34vw, 28rem);
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  z-index: 8;
}

.menu-stack--moves {
  width: clamp(14rem, 25vw, 21.5rem);
  gap: 0.32rem;
}

.menu-stack--moves-detail {
  width: clamp(16rem, 30vw, 25rem);
  gap: 0.32rem;
}

.menu-stack--rail {
  width: 100%;
  gap: 0.38rem;
}

.moves-counter {
  width: clamp(16rem, 30vw, 25rem);
  display: flex;
  justify-content: space-between;
  padding: 0.22rem 0.6rem;
  background: rgba(11, 16, 36, 0.86);
  border: 1px solid rgba(204, 168, 255, 0.45);
  color: #c8b6ff;
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  letter-spacing: 0.08em;
}

.retro-note {
  margin: 0.35rem 0 0;
  padding: 0.4rem 0.65rem;
  background: rgba(12, 18, 40, 0.88);
  border-left: 3px solid var(--vpg-cfg-accent-lime);
  color: #d7f8b8;
  font-family: var(--vpg-font-pixel);
  font-size: 0.84rem;
  letter-spacing: 0.04em;
}

/* ----------------------------------------------------------- Parameters 2-column overlap (OFFENSE / DEFENSE) */

.layer-parameters {
  position: absolute;
  top: 13.5%;
  bottom: 9.8%;
  left: 3.2%;
  right: 3.2%;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  pointer-events: none;
  z-index: 8;
}

.param-col {
  width: clamp(13.5rem, 26vw, 22rem);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.param-col__heading {
  margin: 0 0 1.45rem;
  text-align: center;
  font-family: var(--vpg-font-pixel);
  font-size: clamp(1.15rem, 2.15vw, 1.55rem);
  font-weight: 400;
  letter-spacing: 0.1em;
  color: #f4f7ff;
  text-shadow: 2px 2px 0 rgba(5, 8, 18, 0.92), 0 0 12px rgba(0, 0, 0, 0.65);
  -webkit-font-smoothing: none;
}

.param-col__list {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* ----------------------------------------------------------- Rig readout */

.rig-readout {
  margin-top: 0.45rem;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.35rem;
}

.rig-readout > div {
  padding: 0.35rem 0.55rem;
  background: var(--vpg-cfg-panel-bg);
  border: 1px solid rgba(204, 168, 255, 0.4);
  display: flex;
  justify-content: space-between;
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
}

.rig-readout span {
  color: #9cb2dc;
}

.rig-readout strong {
  color: var(--vpg-cfg-accent-lime);
  font-weight: 400;
}

/* ----------------------------------------------------------- Boot error panel */

.caw-error {
  position: relative;
  z-index: 20;
  margin: auto;
  max-width: 28rem;
  padding: 1.5rem;
  background: var(--vpg-cfg-modal-bg);
  border: 4px solid var(--vpg-cfg-frame-border);
  display: grid;
  gap: 0.75rem;
}

@media (max-width: 900px) {
  .layer-split-left {
    width: 50%;
    padding: 0.5rem 1rem 1rem;
  }
  .app-col,
  .param-col {
    width: 34vw;
  }
}
</style>
