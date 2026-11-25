# Configuration Menus Design Language & Component Reference

**Configuration Menus** (`src/ui/configuration-menus/`) are Virtual Pro Grappler's retro console customization and setup screens—inspired by classic N64/AKI wrestling editors. They power [CharacterEditor.vue](../../src/ui/CharacterEditor.vue) and the editing screen of [ArenaEditor.vue](../../src/ui/ArenaEditor.vue) today, and are designed for reuse across future configuration workflows such as Move Set Editor, Championship / Title Setup, Tag Teams & Stables, Match Rules, and Season / PPV Configuration.

Compare with [Main Menus](./main-menus.md), which cover top-level mode and page navigation.

---

## 1. Visual Design Language

### Atmosphere & Layer Stack
Every Configuration Menu shares a consistent z-ordered composition over a full-viewport (`position: absolute; inset: 0`) canvas:

| Layer | `z-index` | Visual Role |
|---|---|---|
| Arena Backdrop | `0` | Full-bleed blurred crowd artwork (`assets/ui/textures/artwork/arena1.png`, `blur(3.5px)`, `brightness(0.74)`). |
| Radial Vignette | `1` | Atmospheric radial dark gradient focusing eye weight toward the menu bars and preview booth. |
| Preview Booth | `2` | Persistent purple/magenta perspective wireframe corner (`PurpleGridBooth`) behind a transparent WebGL stage or 2D preview, framed in a 10px luminous lavender border on sub-screens. |
| Booth HUD Pills | `3` | Compact single-line status pills pinned clear of overlapping menu rails. |
| Menu Layers | `6–8` | Translucent cobalt-blue menu bars overlapping the booth frame; active bar lifts to `z-index: 4` within its stack and widens via `scaleX(1.045)`. |
| Breadcrumb Header & `BACK` | `12` | Top-left 3-tier breadcrumb + top-right D-Pad-reachable `BACK` bar. |
| Controller Hint Bar | `15` | Persistent dark translucent bottom strip showing N64 controller icons + contextual actions. |
| Modal Picker | `30` | Darkened scrim + lavender-bordered grid picker (`ConfigQuickPicker`). |
| Toast Banner | `40` | Centered transient confirmation/error pill (`cfg-toast`). |

### Typography
Fonts are declared in [src/ui/global.css](../../src/ui/global.css) from bundled offline assets under `public/assets/ui/fonts/`:

| Role | CSS Token | Font Face | Styling Rules |
|---|---|---|---|
| Screen breadcrumbs & modal titles | `--vpg-font-display` | `VPG XFiles` (`xfiles.ttf`) | Uppercase, `letter-spacing: 0.1em`, crisp hard drop shadow (`2px 2px 0 rgba(5, 8, 18, 0.92)`). |
| Menu bars, buttons, values, picker cells, readouts & controller bar | `--vpg-font-pixel` | `VPG Retropix` (`retropix/retropix.otf.woff2`, `.otf`, `.ttf`) | Uppercase, native pixel weight (`400`), `-webkit-font-smoothing: none`, `letter-spacing: 0.06em–0.08em`. Both `400` and `700` map to the regular face to prevent synthetic faux-bold smudging. |

### Colour Palette & CSS Tokens
All tokens live in `:root` inside [src/ui/global.css](../../src/ui/global.css):

| Token | Value | Usage |
|---|---|---|
| `--vpg-cfg-bg` | `#070914` | Root screen fallback behind the blurred arena image. |
| `--vpg-cfg-text` | `#f4f8ff` | Idle button/bar label colour. |
| `--vpg-cfg-text-active` | `#0e071a` | High-contrast dark ink on highlighted lavender bars. |
| `--vpg-cfg-crumb-primary` | `#b6ff74` | Level-1 breadcrumb (neon lime, e.g., `CHARACTER OPTIONS`). |
| `--vpg-cfg-crumb-secondary` | `#46a6ff` | Level-2 breadcrumb (electric blue, indented, e.g., `APPEARANCE`, `MOVES`). |
| `--vpg-cfg-crumb-tertiary` | `#f4f7ff` | Level-3 breadcrumb (white, e.g., `HEAD`, `GRAPPLING`). |
| `--vpg-cfg-bar-idle` | Cobalt gradient (`rgba(34, 76, 150, 0.96)` → `0.62`) | Idle menu bar fading gently on the right edge. |
| `--vpg-cfg-bar-active` | Lavender gradient (`#e0c7ff` → `#cca8ff` → `#b58bff`) | Highlighted D-Pad cursor bar. |
| `--vpg-cfg-bar-typing` | Cyan gradient (`#a8e4ff` → `#7cc8ff`) | Inline text editing highlight. |
| `--vpg-cfg-bar-danger` | Coral-red gradient (`#ffb4be` → `#ff7b8d`) | Destructive confirmation highlight (Delete / Revert). |
| `--vpg-cfg-frame-border` | `#cca8ff` | 10px preview booth frame and 4px modal border. |
| `--vpg-cfg-frame-glow` | `rgba(176, 118, 255, 0.35)` | Outer glow around framed booths. |
| `--vpg-cfg-panel-bg` | `rgba(12, 16, 38, 0.88)` | Telemetry readouts and counter bars. |
| `--vpg-cfg-modal-bg` | `#101634` | Quick Picker and error panel background. |
| `--vpg-cfg-accent-lime` | `#b6ff74` | Active markers, `+ CREATE` stripe, filled stat ticks, success toasts. |
| `--vpg-cfg-accent-amber` | `#ffd089` | `EDITED` status badges. |
| `--vpg-cfg-accent-danger` | `#ff7b8d` | Error toasts and destructive alerts. |

---

## 2. Booth Layout Modes

`ConfigPreviewBooth` repositions a **single persistent 3D/visual host** across screens with CSS transitions so WebGL contexts never reset during navigation:

```
split-right (Roster / Hub)          framed-center (2-Col Hub)          framed-moves / framed-rail
┌───────────────┬──────────┐        ┌──────────────────────────┐       ┌──────────────────────────┐
│ BREADCRUMB    │     BACK │        │ BREADCRUMB          BACK │       │ BREADCRUMB          BACK │
│               │  Purple  │        │  ┌────────────────────┐  │       │  ┌────────────────────┐  │
│  [ MENU BAR ] │  Booth   │        │[BAR]  Purple Booth  [BAR]│       │[BAR]   Purple Booth   │  │
│  [ ACTIVE   ] │  (42%)   │        │[BAR]    (center)    [BAR]│       │[ACTIVE] (viewport     │  │
│  [ MENU BAR ] │          │        │[BAR]                [BAR]│       │[BAR]    shifted right)│  │
│               │          │        │  └────────────────────┘  │       │  └────────────────────┘  │
└───────────────┴──────────┘        └──────────────────────────┘       └──────────────────────────┘
```

| `layout` prop | Host Geometry | Canvas Viewport Offset | Typical Screen |
|---|---|---|---|
| `"split-right"` | `top: 0; bottom: 0; left: 58%; right: 0` | `left: 0; width: 100%` | Roster Select, Main Hub (`CHARACTER OPTIONS`) |
| `"framed-center"` | `top: 19%; bottom: 11%; left: 8%; right: 8%` | `left: 0; width: 100%` | 2-Column Category Hub (`APPEARANCE`) |
| `"framed-moves"` | `top: 21%; bottom: 11%; left: 9%; right: 8%` | `left: 26%; width: 74%` | Narrow Left-Rail List (`MOVES` categories) |
| `"framed-moves-detail"` | `top: 21%; bottom: 11%; left: 9%; right: 8%` | `left: 33%; width: 67%` | Medium Left-Rail Scroll List (`MOVES > GRAPPLING`) |
| `"framed-rail"` | `top: 21%; bottom: 11%; left: 9%; right: 8%` | `left: 36%; width: 64%` | Key-Value / Parameter Rails (`PROFILE`, `PARAMETER`, Detail) |

---

## 3. Interaction & Controller Contract

Configuration Menus consume virtual inputs through [src/input/VirtualController.ts](../../src/input/VirtualController.ts) so keyboard bindings, user remaps, and physical gamepads work identically:

- **D-Pad (`up`, `down`, `left`, `right`)**: Exclusively controls menu cursor movement, 2D column switching, top-right `BACK` targeting, and inline value stepping (`◀ / ▶`).
- **Analog Stick (`stickLeft`, `stickRight`, `stickUp`, `stickDown`)**: Dedicated to smooth 60fps 3D preview manipulation—Left/Right rotates the model left/right, Up zooms in, Down zooms out. Always suspend stick camera polling while a text `<input>` is focused (`typing = true`).
- **A (`a`)**: Activates the focused bar (drills down, opens `ConfigQuickPicker`, begins inline text editing, or replays an animation).
- **B (`b`)**: Closes active modal or inline text edit first; otherwise navigates back one screen.
- **L / R (`l`, `r`)**: Context-aware secondary stepping (switch costume slots, jump ±10 styles, or page through long lists).
- **Z (`z`) / Start (`start`)**: Screen-level toggles (e.g., Ring/Entrance attire, Play/Pause preview).
- **Hover Suppression**: Set an `ignoreHover` flag on screen transitions and clear it on `@pointermove` from `ConfigScreenShell`, preventing stationary pointers from stealing the D-Pad cursor after layout changes.
- **Audio Feedback**: Play `move`, `select`, `back`, `confirm`, `toggle`, or `deny` cues via [src/audio/menuAudio.ts](../../src/audio/menuAudio.ts).

---

## 4. Reusable Component Reference

Import all components and types from `@/ui/configuration-menus`:

```ts
import {
  ConfigScreenShell,
  ConfigBreadcrumbHeader,
  ConfigMenuBar,
  ConfigParamMeter,
  ConfigPreviewBooth,
  ConfigQuickPicker,
  ConfigControllerBar,
  PurpleGridBooth,
  type ConfigBarVariant,
  type ConfigBoothLayout,
  type ConfigPickerItem,
} from "@/ui/configuration-menus";
```

### `ConfigScreenShell`
Full-viewport backdrop, vignette, layer slots, and toast notifications.

- **Props**:
  - `ariaLabel?: string` (default `"Configuration menu"`)
  - `screenClass?: string` — optional modifier class for current sub-screen
  - `backdropAsset?: string` (default `"assets/ui/textures/artwork/arena1.png"`)
  - `toastMessage?: string`
  - `toastError?: boolean`
- **Slots**: `stage`, `header`, default (foreground menu sections), `overlay`, `footer`.
- **Events**: `pointermove(event: PointerEvent)`.

### `ConfigBreadcrumbHeader`
Three-tier lime → blue → white breadcrumb header paired with the top-right `BACK` bar (`data-nav-back`).

- **Props**:
  - `top: string` — Level-1 lime heading (`<h1>`)
  - `second?: string` — Level-2 electric-blue heading (`<h2>`)
  - `secondClass?: string` — optional class attached to the Level-2 heading (e.g., `"panel__title"`)
  - `third?: string` — Level-3 white heading (`<h3>`)
  - `rootScale?: boolean` — enlarges Level-1 heading on root/hub screens
  - `showBack?: boolean` (default `true`)
  - `backActive?: boolean` — highlights the `BACK` bar in lavender when D-Pad focused
  - `backDisabled?: boolean` — disables the top-right action bar while saving
  - `backLabel?: string` (default `"BACK"`)
- **Events**: `back()`, `backHover()`.

### `ConfigMenuBar`
Core cobalt-blue → luminous-lavender bar button/row rendered in **VPG Retropix**.

- **Props**:
  - `as?: "button" | "div"` (default `"button"`; pass `"div"` when nesting inner arrow `<button>`s or `<input>`s so HTML remains valid)
  - `variant?: "default" | "option" | "category" | "roster" | "clip" | "value" | "param" | "back"`
  - `active?: boolean` — applies luminous lavender highlight, dark ink, and horizontal pop (`scaleX(1.045)`)
  - `typing?: boolean` — electric cyan highlight for active inline text entry
  - `danger?: boolean` — coral-red highlight when active for destructive confirmations
  - `accentLeft?: boolean` — 4px neon-lime left stripe (e.g., `+ CREATE NEW`)
  - `gapBefore?: boolean` — adds vertical group break above the bar
- **Slots**: default slot for label or structured key/value content.

### `ConfigParamSlider`
Two-part retro parameter slider matching the `PARAMETERS` (`OFFENSE` / `DEFENSE`) mockup: a `ConfigMenuBar` category header paired with a white horizontal slider rail and rounded white numeric capsule thumb.

- **Props**:
  - `label: string` — displayed centered in the cobalt → lavender bar
  - `ariaLabel?: string` — accessible slider label (defaults to `label`)
  - `value: number`
  - `min?: number` (default `1`)
  - `max?: number` (default `5`)
  - `active?: boolean` — highlights the header bar in lavender and adds a lavender halo to the pill thumb
- **Events**: `hover()`, `step(delta: number)`, `change(value: number)`.

### `ConfigParamMeter`
Segmented retro progress/stat bar designed for the middle column of `<ConfigMenuBar variant="param">`.

- **Props**:
  - `value: number`
  - `max: number`
  - `active?: boolean` — flips segment colours from lime-green to cobalt-blue for contrast on lavender bars

### `ConfigPreviewBooth` & `PurpleGridBooth`
Persistent repositionable purple perspective wireframe booth hosting a transparent WebGL `<canvas class="stage-canvas">` or 2D preview.

- **Props (`ConfigPreviewBooth`)**:
  - `layout: ConfigBoothLayout` (`"split-right" | "framed-center" | "framed-moves" | "framed-moves-detail" | "framed-rail"`)
  - `centerX?: number` (default `500`) — vertical V-corner seam in `0..1000` SVG viewBox units
  - `loading?: boolean`
  - `loadingLabel?: string` (default `"LOADING…"`)
- **Slots**: default (typically `<canvas class="stage-canvas">`), `hud-bottom`, `hud-top-left`.
- **Standalone (`PurpleGridBooth`)**: accepts `centerX?: number` to render only the perspective SVG corner walls.

### `ConfigQuickPicker`
Modal D-Pad grid selector for long style lists (3 columns) or colour palettes (4 columns with swatches).

- **Props**:
  - `title: string`
  - `windowItems: readonly ConfigPickerItem[]` — visible page slice (`{ value, label, colour? }`)
  - `totalCount: number`
  - `offset: number` — slice start index
  - `cursor: number` — active global item index
  - `currentValue: number | string` — marks saved item with a lime border
  - `isColour?: boolean` — switches to 4-column swatch grid
- **Events**: `hover(index: number)`, `choose(index: number)`, `close()`.

### `ConfigControllerBar`
Bottom N64 controller legend strip backed by [src/ui/controllerIcons.ts](../../src/ui/controllerIcons.ts).

- **Props**:
  - `hints: readonly ControllerHintItem[]` — array of `{ icons: ControllerIconKey[], label: string }` where icon keys are `"dPad" | "stick" | "a" | "b" | "c" | "l" | "r" | "z" | "start"`.

---

## 5. Minimal Authoring Example

```vue
<template>
  <ConfigScreenShell aria-label="Match Rules" :toast-message="toast" @pointermove="ignoreHover = false">
    <ConfigPreviewBooth layout="framed-rail" :center-x="340">
      <canvas ref="canvas" class="stage-canvas" />
    </ConfigPreviewBooth>

    <ConfigBreadcrumbHeader
      top="EXHIBITION"
      second="MATCH RULES"
      :back-active="focusBack"
      @back="$emit('back')"
      @back-hover="focusBack = true"
    />

    <section class="rules-rail">
      <ConfigMenuBar
        v-for="(rule, idx) in rules"
        :key="rule.id"
        as="div"
        variant="param"
        :active="!focusBack && cursor === idx"
        @mouseenter="!ignoreHover && (focusBack = false, cursor = idx)"
      >
        <span>{{ rule.label }}</span>
        <ConfigParamMeter :value="rule.value" :max="rule.max" :active="!focusBack && cursor === idx" />
        <strong>{{ rule.value }}</strong>
      </ConfigMenuBar>
    </section>

    <ConfigControllerBar
      :hints="[
        { icons: ['dPad'], label: 'MOVE · ◀▶ CHANGE' },
        { icons: ['a'], label: 'CONFIRM' },
        { icons: ['b'], label: 'BACK' },
      ]"
    />
  </ConfigScreenShell>
</template>
```
