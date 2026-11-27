<!-- Vue presentation module. Teaching focus: how reactive screen state calls domain stores and presents results without owning gameplay rules. File: src/app/MainMenu.vue -->
<!--
  Main Menu shell composed from the reusable `src/ui/main-menus/` UI kit
  (`docs/ui/main-menus.md`). Full-screen Babylon viewers/editors remain lazy-loaded
  so Babylon never enters the initial Main Menu bundle.
-->
<template>
  <MainMenuShell @pointermove="ignoreHoverUntilMove = false">
    <ControlMapper v-if="mapperOpen" @back="closeMapper" />
    <AnimationViewer v-else-if="animationViewerOpen" @back="closeAnimationViewer" />
    <ArenaViewer v-else-if="arenaViewerOpen" @back="closeArenaScreen" />
    <ArenaEditor v-else-if="arenaEditorOpen" @back="closeArenaScreen" />
    <CharacterEditor v-else-if="characterEditorOpen" @back="closeCharacterEditor" />

    <template v-else>
      <MainMenuHeading v-if="showHeading" :title="page.displayName" :src="heading" />

      <MainMenuList
        :items="menuEntries"
        :active-index="cursor"
        @select="select"
        @hover="hover"
        @focus-item="cursor = $event"
      />

      <MainMenuBackButton
        v-if="canGoBack"
        :active="cursor === page.menuItems.length"
        @focus="cursor = page.menuItems.length"
        @hover="hover(page.menuItems.length)"
        @select="back"
      />

      <MainMenuHintBar :can-go-back="canGoBack" />

      <MainMenuStatusBanner :message="status" />

      <!-- Instructions panel, toggled with Z. -->
      <MainMenuInfoModal
        v-if="showInstructions && active"
        :instructions="active.instructions"
        @close="showInstructions = false"
      />
    </template>
  </MainMenuShell>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent, h } from "vue";
import {
  MenuItem,
  MenuPage,
  ROOT_PAGE,
  headingUrl,
  pageByKey,
  resolveTarget,
} from "@/content/mainMenu";
import {
  isInteractivePointerTarget,
  isMenuDown,
  isMenuUp,
  pollGamepadBindings,
  virtualInputFor,
  virtualInputForBinding,
} from "@/input/VirtualController";
import { playMenuCue, setMenuMusicDepth, startMenuMusic, stopMenuMusic } from "@/audio/menuAudio";
import ControlMapper from "@/ui/ControlMapper.vue";
import SceneLoading from "@/ui/SceneLoading.vue";
import {
  MainMenuBackButton,
  MainMenuHeading,
  MainMenuHintBar,
  MainMenuInfoModal,
  MainMenuList,
  MainMenuShell,
  MainMenuStatusBanner,
  type MainMenuEntry,
} from "@/ui/main-menus";

/**
 * The animation viewer is the menu's Babylon screen. Loading it on demand
 * keeps the engine out of the menu's own chunk - the menu is the first thing
 * drawn.
 */
const AnimationViewer = defineAsyncComponent({
  loader: () => import("@/ui/AnimationViewer.vue"),
  // The viewer's background colour, so the placeholder hands over to the live
  // screen without a flash. Kept as a literal rather than imported from the
  // viewer, which would drag Babylon back into this chunk.
  loadingComponent: () => h(SceneLoading, { background: "#15171c" }),
  delay: 0,
});

/** The arena screens are Babylon screens too, split out the same way. */
const ARENA_BACKGROUND = "#0b0e14";
const ArenaViewer = defineAsyncComponent({
  loader: () => import("@/ui/ArenaViewer.vue"),
  loadingComponent: () => h(SceneLoading, { background: ARENA_BACKGROUND }),
  delay: 0,
});
const ArenaEditor = defineAsyncComponent({
  loader: () => import("@/ui/ArenaEditor.vue"),
  loadingComponent: () => h(SceneLoading, { background: ARENA_BACKGROUND }),
  delay: 0,
});
const CharacterEditor = defineAsyncComponent({
  loader: () => import("@/ui/CharacterEditor.vue"),
  loadingComponent: () => h(SceneLoading, { background: "#11151d" }),
  delay: 0,
});

/** Routes the menu knows how to open. Everything else is not built yet. */
const ROUTE_CONTROLS = "commissioner.controls";
const ROUTE_ANIMATION_VIEWER = "commissioner.animation_viewer";
const ROUTE_ARENA_VIEWER = "commissioner.arena_viewer";
const ROUTE_ARENA_EDITOR = "commissioner.arena_editor";
const ROUTE_CHARACTER_EDITOR = "commissioner.character_editor";
/** Sub-pages that omit the text <h1> heading and let the stacked menu stand alone. */
const PAGES_WITHOUT_HEADING = new Set(["multiPlay", "singlePlay", "commissioner"]);

/** The Commissioner page, which holds the viewer, sits under the root page. */
const VIEWER_PAGE_STACK = [ROOT_PAGE, "commissioner"];
const viewerRow = () =>
  Math.max(0, pageByKey("commissioner")?.menuItems.findIndex((item) => item.target === ROUTE_ANIMATION_VIEWER) ?? 0);

export default defineComponent({
  name: "MainMenu",

  components: {
    ControlMapper,
    AnimationViewer,
    ArenaViewer,
    ArenaEditor,
    CharacterEditor,
    MainMenuShell,
    MainMenuHeading,
    MainMenuList,
    MainMenuBackButton,
    MainMenuHintBar,
    MainMenuStatusBanner,
    MainMenuInfoModal,
  },
  props: {
    /** Open straight into the animation viewer (the page was loaded from a viewer bookmark). */
    startInViewer: { type: Boolean, default: false },
  },
  emits: ["exit"],

  data() {
    return {
      /** Page history; the last entry is what is on screen. */
      stack: (this.startInViewer ? [...VIEWER_PAGE_STACK] : [ROOT_PAGE]) as string[],
      // On a bookmark, back out of the viewer onto its own Commissioner row.
      cursor: this.startInViewer ? viewerRow() : 0,
      showInstructions: false,
      mapperOpen: false,
      animationViewerOpen: this.startInViewer,
      arenaViewerOpen: false,
      arenaEditorOpen: false,
      characterEditorOpen: false,
      ignoreHoverUntilMove: false,
      status: "",
      stopGamepadPolling: null as (() => void) | null,
    };
  },

  computed: {
    /** A full-screen tool is open and handles its own input. */
    screenOpen(): boolean {
      return (
        this.mapperOpen ||
        this.animationViewerOpen ||
        this.arenaViewerOpen ||
        this.arenaEditorOpen ||
        this.characterEditorOpen
      );
    },

    musicDepth(): number {
      return this.stack.length + Number(this.screenOpen);
    },

    pageKey(): string {
      return this.stack[this.stack.length - 1];
    },

    page(): MenuPage {
      // Every key on the stack was resolved before being pushed.
      return pageByKey(this.pageKey)!;
    },

    showHeading(): boolean {
      return Boolean(this.heading) || !PAGES_WITHOUT_HEADING.has(this.pageKey);
    },

    menuEntries(): MainMenuEntry[] {
      return this.page.menuItems.map((item) => ({ id: item.id, label: item.displayName }));
    },

    active(): MenuItem | null {
      return this.page.menuItems[this.cursor] ?? null;
    },

    heading(): string | null {
      return headingUrl(this.page);
    },

    canGoBack(): boolean {
      return this.stack.length > 1;
    },
  },

  watch: {
    musicDepth(depth: number) {
      setMenuMusicDepth(depth);
    },
  },

  mounted() {
    setMenuMusicDepth(this.musicDepth);
    window.addEventListener("keydown", this.unlockMusic);
    window.addEventListener("pointerdown", this.unlockMusic);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("pointerdown", this.onPointerDown);
    this.stopGamepadPolling = pollGamepadBindings(this.onGamepadBinding);
  },

  beforeUnmount() {
    stopMenuMusic();
    window.removeEventListener("keydown", this.unlockMusic);
    window.removeEventListener("pointerdown", this.unlockMusic);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("pointerdown", this.onPointerDown);
    this.stopGamepadPolling?.();
  },

  methods: {
    unlockMusic() {
      void startMenuMusic();
    },

    onKeyDown(event: KeyboardEvent) {
      // The mapper and the viewer/editor screens run their own handlers while open.
      if (this.screenOpen) return;
      if (event.key === " " && event.target instanceof HTMLButtonElement) return;

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

    onGamepadBinding(binding: string) {
      const input = virtualInputForBinding(binding);
      if (input) this.onMappedInput(input);
    },

    onMappedInput(input: NonNullable<ReturnType<typeof virtualInputFor>>) {
      if (this.screenOpen) return;

      if (this.showInstructions) {
        if (input === "z" || input === "b") {
          this.showInstructions = false;
          playMenuCue("toggle");
        }
        return;
      }

      if (isMenuUp(input)) return this.move(-1);
      if (isMenuDown(input)) return this.move(1);
      if (input === "a") return this.select(this.cursor);
      if (input === "b") return this.back();
      if (input === "z") return this.toggleInstructions();
      // Left and right are inert: this menu is a stack of pages, not a
      // carousel, so they must not change page.
    },

    hover(index: number) {
      if (!this.ignoreHoverUntilMove) this.cursor = index;
    },

    move(delta: number) {
      const count = this.page.menuItems.length + Number(this.canGoBack);
      this.cursor = (this.cursor + delta + count) % count;
      this.status = "";
      this.$nextTick(() => {
        const selected = (this.$el as HTMLElement).querySelector<HTMLButtonElement>(".item--active, .menu__back--active");
        selected?.focus({ preventScroll: true });
      });
      playMenuCue("move");
    },

    toggleInstructions() {
      if (!this.active) return;
      this.showInstructions = !this.showInstructions;
      playMenuCue("toggle");
    },

    select(index: number) {
      if (this.canGoBack && index === this.page.menuItems.length) return this.back();
      this.cursor = index;
      const item = this.page.menuItems[index];
      if (!item) return;

      this.status = "";
      const target = resolveTarget(item.target);

      if (target.kind === "route" && target.id === "session.exit") { this.$emit("exit"); return; }

      if (target.kind === "page") {
        this.stack.push(target.key);
        this.cursor = 0;
        this.ignoreHoverUntilMove = true;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        playMenuCue("select");
        return;
      }

      if (target.id === ROUTE_CONTROLS) {
        this.mapperOpen = true;
        playMenuCue("select");
        return;
      }

      if (target.id === ROUTE_ANIMATION_VIEWER) {
        this.animationViewerOpen = true;
        playMenuCue("select");
        return;
      }

      if (target.id === ROUTE_ARENA_VIEWER || target.id === ROUTE_ARENA_EDITOR) {
        this.arenaViewerOpen = target.id === ROUTE_ARENA_VIEWER;
        this.arenaEditorOpen = target.id === ROUTE_ARENA_EDITOR;
        playMenuCue("select");
        return;
      }

      if (target.id === ROUTE_CHARACTER_EDITOR) {
        this.characterEditorOpen = true;
        playMenuCue("select");
        return;
      }

      this.status = `${item.displayName} is not implemented yet.`;
      playMenuCue("deny");
    },

    back() {
      // The root page has nowhere to go, so the refusal is what is heard.
      if (!this.canGoBack) return playMenuCue("deny");
      this.stack.pop();
      this.cursor = 0;
      this.ignoreHoverUntilMove = true;
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.status = "";
      playMenuCue("back");
    },

    closeMapper() {
      this.mapperOpen = false;
      this.status = "";
    },

    closeAnimationViewer() {
      this.animationViewerOpen = false;
      this.status = "";
    },

    closeArenaScreen() {
      this.arenaViewerOpen = false;
      this.arenaEditorOpen = false;
      this.status = "";
    },

    closeCharacterEditor() {
      this.characterEditorOpen = false;
      this.status = "";
    },
  },
});
</script>
