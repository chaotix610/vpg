<!--
  Signature Configuration Menu bar button/row: translucent cobalt-blue fading
  right when idle, expanding into bright luminous lavender with dark text when
  focused/active. Uses VPG Retropix pixel typography across all variants.
-->
<template>
  <component
    :is="as"
    :type="as === 'button' ? 'button' : undefined"
    :role="as === 'div' ? 'button' : undefined"
    :tabindex="as === 'div' ? 0 : undefined"
    class="game-bar"
    :class="[
      variantClass,
      {
        'game-bar--active': active,
        'game-bar--typing': typing,
        'game-bar--danger': danger,
        'game-bar--create': accentLeft,
        'game-bar--gap-before': gapBefore,
      },
    ]"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ConfigBarVariant } from "./types";

const props = withDefaults(
  defineProps<{
    /** Use `"div"` when the bar nests inner `<button>` arrows or `<input>` controls. */
    as?: "button" | "div";
    variant?: ConfigBarVariant;
    active?: boolean;
    typing?: boolean;
    danger?: boolean;
    accentLeft?: boolean;
    gapBefore?: boolean;
  }>(),
  {
    as: "button",
    variant: "default",
    active: false,
    typing: false,
    danger: false,
    accentLeft: false,
    gapBefore: false,
  },
);

const variantClass = computed(() => {
  switch (props.variant) {
    case "option":
      return "game-bar--option";
    case "category":
      return "game-bar--cat";
    case "roster":
      return "game-bar--roster";
    case "clip":
      return "game-bar--clip";
    case "value":
      return "game-bar--value";
    case "param":
      return "game-bar--param";
    case "back":
      return "game-bar--back";
    default:
      return "";
  }
});
</script>

<style scoped>
.game-bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 2.65rem;
  padding: 0.35rem 1rem;
  border: 0;
  border-radius: 0;
  background: var(--vpg-cfg-bar-idle);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: clamp(0.95rem, 1.5vw, 1.2rem);
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-shadow: 1px 1px 0 rgba(7, 14, 34, 0.85);
  -webkit-font-smoothing: none;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 90ms ease, background 90ms ease, color 90ms ease;
}

.game-bar:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: none;
}

.game-bar:hover:not(:disabled) {
  filter: brightness(1.08);
}

.game-bar--active,
.game-bar:focus-visible:not(:disabled) {
  outline: none;
  background: var(--vpg-cfg-bar-active);
  color: var(--vpg-cfg-text-active);
  text-shadow: none;
  transform: scaleX(1.045);
  box-shadow: 0 0 18px rgba(204, 168, 255, 0.55);
  z-index: 4;
}

.game-bar--typing {
  background: var(--vpg-cfg-bar-typing);
  color: #071324;
  text-shadow: none;
}

.game-bar--danger.game-bar--active,
.game-bar--danger:hover:not(:disabled),
.game-bar--danger:focus-visible:not(:disabled) {
  background: var(--vpg-cfg-bar-danger);
  color: #210509;
  text-shadow: none;
}

.game-bar--back {
  width: auto;
  min-width: clamp(6.4rem, 10vw, 9.2rem);
  min-height: 2.75rem;
  padding: 0.35rem 1.2rem;
  margin-top: 0.35rem;
  margin-right: 1.4rem;
  white-space: nowrap;
}

.game-bar--create {
  border-left: 4px solid var(--vpg-cfg-accent-lime);
}

.game-bar--gap-before {
  margin-top: 1.65rem;
}

.game-bar--roster {
  justify-content: space-between;
  min-height: 2.3rem;
  padding: 0.25rem 0.9rem;
  font-size: 0.98rem;
}

.game-bar--option {
  min-height: clamp(2.65rem, 6.2vh, 3.35rem);
  font-size: clamp(1.08rem, 1.8vw, 1.38rem);
}

.game-bar--cat {
  min-height: clamp(2.15rem, 4.7vh, 2.75rem);
  font-size: clamp(0.9rem, 1.4vw, 1.12rem);
}

.game-bar--clip {
  justify-content: flex-start;
  min-height: 2.3rem;
  padding: 0.25rem 0.85rem;
  font-size: 0.92rem;
}

.game-bar--value {
  justify-content: space-between;
  min-height: 2.55rem;
  padding: 0.28rem 0.85rem;
  font-size: 0.92rem;
}

.game-bar--param {
  display: grid;
  grid-template-columns: 7.8rem minmax(0, 1fr) auto;
  gap: 0.6rem;
  min-height: 2.25rem;
  padding: 0.22rem 0.75rem;
  font-size: 0.88rem;
}
</style>
