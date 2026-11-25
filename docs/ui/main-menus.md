# Main Menus Design Language & Component Reference

**Main Menus** (`src/ui/main-menus/`) define Virtual Pro Grappler's top-level arcade/console navigation aesthetic: dramatic full-bleed arena artwork, custom heading logos, tightly stacked heavy **VPG Impact** menu entries with fiery amber highlights and a pulsing neon-green halo, a slate submenu `Back` button, and a Z-button instructions overlay.

They power [src/app/MainMenu.vue](../../src/app/MainMenu.vue) and are built for reuse across title screens, mode selectors, tournament brackets, and pause/exit overlays. For deep customization editors with preview booths and D-Pad parameter rails, see [Configuration Menus](./configuration-menus.md).

---

## 1. Visual Design Language

### Composition & Spatial Rhythm
Main Menus use a centered single-column vertical flow over a full-bleed backdrop (`gap: 1.25rem`, `padding: 2rem 1rem`):

```
┌──────────────────────────────────────────┐
│            (Full-bleed Arena)            │
│                                          │
│           [ HEADING ARTWORK ]            │
│                                          │
│               MULTI PLAY                 │
│              SINGLE PLAY   ◄ amber +     │
│              COMMISSIONER    green glow  │
│                  EXIT                    │
│                                          │
│              [ ← Back ]                  │
│                                          │
│    D-Pad move · A select · Z info · B    │
│           (optional gold status)         │
└──────────────────────────────────────────┘
```

### Typography
Fonts are declared in [src/ui/global.css](../../src/ui/global.css):

| Role | CSS Token | Font Face | Styling Rules |
|---|---|---|---|
| Fallback page heading | `--vpg-font-display` | `VPG XFiles` (`xfiles.ttf`) | Uppercase, `clamp(1.6rem, 5vw, 2.6rem)`, `letter-spacing: 0.12em` (used when a page has `headingImage: null`). |
| Menu items | `--vpg-font-menu-item` | `VPG Impact` (`Impact.ttf`) | Bold (`700`), `clamp(26px, 2.65vw, 34px)`, deliberately compressed `line-height: 18px` and `letter-spacing: -2px` to create the iconic tightly stacked N64 menu silhouette. |
| Back button, hints, status & info modal | `--vpg-font-body` | `VPG Impact` (`Impact.ttf`) | Clean readable sizing (`0.75rem–1.2rem`) with dark text shadow over the arena image. |

### Colour Palette, States & Motion
All tokens and `@keyframes glowPulse` live in [src/ui/global.css](../../src/ui/global.css):

| Token | Value | Usage |
|---|---|---|
| `--vpg-main-bg` | `#0b0e14` | Fallback backdrop beneath `arena1.png`. |
| `--vpg-main-surface` | `#141a24` | Submenu `Back` button and Z-info modal card fill. |
| `--vpg-main-border` | `rgba(255, 255, 255, 0.3)` | Idle `Back` button border. |
| `--vpg-main-modal-border` | `rgba(255, 255, 255, 0.18)` | Instructions modal border. |
| `--vpg-main-modal-scrim` | `rgba(6, 8, 12, 0.82)` | Full-screen backdrop behind the instructions modal. |
| `--vpg-main-status` | `#ffc83d` | Transient status feedback beneath the hint bar. |
| `--vpg-item-color-idle` | `#ffffff` | Idle menu item fill (`0.5px` black stroke). |
| `--vpg-item-color-active` | `#f28f3d` | Active/hovered/focused menu item fill (`2px` black stroke), modal title, and focused `Back` border. |
| `--vpg-item-color-disabled` | `#888888` | Disabled menu entry colour. |
| `--vpg-item-stroke` | `#000000` | Text outline colour (`-webkit-text-stroke-color`). |
| `--vpg-state-transition` | `0.2s ease` | Fill, stroke, and border state transitions. |

**Active Halo & Reduced Motion**:
- Active menu entries play `@keyframes glowPulse` (a 1-second pulsing horizontal neon-green `#00f825` aura radiating left and right of the amber text).
- Under `@media (prefers-reduced-motion: reduce)`, `glowPulse` collapses to a calm static amber text glow.

---

## 2. Data-Driven Page Tree & App Integration

Main Menu content is authored in JSON rather than hardcoded in Vue:

- **Menu data**: [data/ui/main-menu.json](../../data/ui/main-menu.json), validated against [schemas/main-menu.schema.json](../../schemas/main-menu.schema.json).
- **Content API**: [src/content/mainMenu.ts](../../src/content/mainMenu.ts) exposes `ROOT_PAGE`, `pageByKey()`, `resolveTarget()`, and `headingUrl()`.
  - Bare camelCase `target` values (e.g., `"commissioner"`) push another page onto the stack.
  - Dotted `target` values (e.g., `"commissioner.character_editor"`, `"session.exit"`) dispatch to application routes.
- **Keep the initial bundle light**: Any 3D Babylon screen launched from a Main Menu MUST be loaded with `defineAsyncComponent` paired with [SceneLoading.vue](../../src/ui/SceneLoading.vue), so the Main Menu renders instantaneously without pulling Babylon into the entry chunk.
- **Adaptive music depth**: Call `setMenuMusicDepth(stack.length + Number(screenOpen))` from [src/audio/menuAudio.ts](../../src/audio/menuAudio.ts) as the user navigates deeper into sub-pages or full-screen tools.

---

## 3. Interaction & Controller Contract

Main Menus read inputs via [src/input/VirtualController.ts](../../src/input/VirtualController.ts):

- **Up / Down (D-Pad or Control Stick)**: Wraps through all page entries plus the `Back` button (when `canGoBack` is true) and calls `.focus({ preventScroll: true })` on the active button so screen readers and keyboard focus stay aligned.
- **Left / Right**: Intentionally inert (Main Menus are a vertical stack of pages, not a horizontal carousel).
- **A**: Activates the focused item (or triggers `Back` when the cursor rests on `MainMenuBackButton`).
- **B**: Closes the instructions modal if open; otherwise pops one page from the stack (playing the `deny` cue on the root page).
- **Z**: Toggles `MainMenuInfoModal` for the currently highlighted menu item.
- **Hover Suppression on Page Change**: Pushing or popping a page shifts button positions under a stationary mouse pointer. Set `ignoreHoverUntilMove = true` and blur `document.activeElement` on every page transition, clearing the flag on `MainMenuShell`'s `@pointermove`.
- **Selector Invariants**: Keep `.item`, `.item--active`, `.menu__back`, and `.menu__back--active` intact so `isInteractivePointerTarget()` in `VirtualController.ts`, focus synchronization, and E2E navigation tests work reliably.

---

## 4. Reusable Component Reference

Import all components and types from `@/ui/main-menus`:

```ts
import {
  MainMenuShell,
  MainMenuHeading,
  MainMenuList,
  MainMenuBackButton,
  MainMenuHintBar,
  MainMenuStatusBanner,
  MainMenuInfoModal,
  type MainMenuEntry,
} from "@/ui/main-menus";
```

### `MainMenuShell`
Full-viewport arena backdrop container with centered vertical flex layout.

- **Props**:
  - `backdropAsset?: string` (default `"assets/ui/textures/artwork/arena1.png"`)
- **Events**: `pointermove(event: PointerEvent)`.
- **Slots**: default slot for menu stack or full-screen child routes.

### `MainMenuHeading`
Displays custom logo artwork when `src` is provided, falling back to an uppercase `VPG XFiles` `<h1>`.

- **Props**:
  - `title: string` — accessible `alt` text for artwork or visible `<h1>` text
  - `src?: string | null` — resolved heading artwork URL (from `headingUrl(page)`)

### `MainMenuList`
Renders the tightly stacked `VPG Impact` button list with amber/black/green-glow active styling.

- **Props**:
  - `items: readonly MainMenuEntry[]` — `{ id: string, label: string, disabled?: boolean }[]`
  - `activeIndex: number` — zero-based index highlighted with `.item--active`
- **Events**:
  - `select(index: number)` — clicked item
  - `hover(index: number)` — pointer entered item
  - `focusItem(index: number)` — keyboard/programmatic focus landed on item

### `MainMenuBackButton`
Submenu `← Back` button styled to integrate into the vertical cursor cycle.

- **Props**:
  - `active?: boolean` — applies `.menu__back--active`
  - `label?: string` (default `"Back"`)
- **Events**: `select()`, `hover()`, `focus()`.

### `MainMenuHintBar`
Inline translucent N64 controller shortcut line using [src/ui/controllerIcons.ts](../../src/ui/controllerIcons.ts).

- **Props**:
  - `canGoBack?: boolean` — appends `B back` to the default `D-Pad move · A select · Z info` sequence
  - `hints?: readonly ControllerHintItem[]` — optional full override of displayed icon/label pairs

### `MainMenuStatusBanner`
Transient gold status feedback (`role="status"`, `aria-live="polite"`).

- **Props**:
  - `message: string` — renders nothing when empty

### `MainMenuInfoModal`
Z-button modal overlay displaying structured help text (`paragraph` and `definitionList` blocks).

- **Props**:
  - `instructions: Instructions` — `{ title, blocks }` from [src/content/mainMenu.ts](../../src/content/mainMenu.ts)
- **Events**: `close()` — emitted when clicking the darkened scrim.

---

## 5. Minimal Authoring Examples

### Adding a New Page to the Existing Main Menu (Data-Only)
Add an entry to `pages` in [data/ui/main-menu.json](../../data/ui/main-menu.json) and point a parent menu item's `"target"` to its camelCase key—no UI code change is required.

### Building a Standalone Main-Menu-Styled Screen (e.g., Pause or Mode Picker)

```vue
<template>
  <MainMenuShell @pointermove="ignoreHover = false">
    <MainMenuHeading title="PAUSE" />
    <MainMenuList
      :items="entries"
      :active-index="cursor"
      @select="choose"
      @hover="!ignoreHover && (cursor = $event)"
      @focus-item="cursor = $event"
    />
    <MainMenuBackButton
      label="Resume Match"
      :active="cursor === entries.length"
      @select="$emit('resume')"
      @hover="!ignoreHover && (cursor = entries.length)"
    />
    <MainMenuHintBar
      :hints="[
        { icons: ['dPad'], label: 'move' },
        { icons: ['a'], label: 'select' },
        { icons: ['b'], label: 'resume' },
      ]"
    />
  </MainMenuShell>
</template>
```
