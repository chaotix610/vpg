<!--
  Full-viewport shell for VPG Configuration Menus: blurred arena crowd
  backdrop, atmospheric vignette, persistent stage slot, foreground menu
  layers, modal overlay slot, controller bar slot, and retro toast banner.
-->
<template>
  <main
    class="cfg-screen"
    :class="screenClass"
    :aria-label="ariaLabel"
    @pointermove="$emit('pointermove', $event)"
  >
    <div class="cfg-screen__bg" :style="backdropStyle" aria-hidden="true" />
    <div class="cfg-screen__vignette" aria-hidden="true" />

    <slot name="stage" />
    <slot name="header" />
    <slot />
    <slot name="overlay" />
    <slot name="footer" />

    <div
      v-if="toastMessage"
      class="cfg-toast"
      :class="{ 'cfg-toast--error': toastError }"
      role="status"
      aria-live="polite"
    >
      {{ toastMessage }}
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { resolveAsset } from "@/content/assets";

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    screenClass?: string;
    /** Runtime asset path under public/ for the blurred arena backdrop. */
    backdropAsset?: string;
    toastMessage?: string;
    toastError?: boolean;
  }>(),
  {
    ariaLabel: "Configuration menu",
    screenClass: "",
    backdropAsset: "assets/ui/textures/artwork/arena1.png",
    toastMessage: "",
    toastError: false,
  },
);

defineEmits<{
  pointermove: [event: PointerEvent];
}>();

const backdropStyle = computed((): Record<string, string> => {
  const url = resolveAsset(props.backdropAsset);
  return url ? { backgroundImage: `url(${url})` } : {};
});
</script>

<style scoped>
.cfg-screen {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--vpg-cfg-bg);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  user-select: none;
}

.cfg-screen__bg {
  position: absolute;
  inset: -16px;
  background-size: cover;
  background-position: center;
  filter: blur(3.5px) saturate(1.15) brightness(0.74);
  z-index: 0;
}

.cfg-screen__vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 38% 45%, rgba(16, 22, 48, 0.18), rgba(6, 8, 20, 0.72));
  z-index: 1;
  pointer-events: none;
}

.cfg-toast {
  position: fixed;
  left: 50%;
  bottom: 2.6rem;
  transform: translateX(-50%);
  padding: 0.42rem 1rem;
  background: rgba(14, 18, 44, 0.94);
  border: 2px solid var(--vpg-cfg-accent-lime);
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-pixel);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  z-index: 40;
}

.cfg-toast--error {
  border-color: var(--vpg-cfg-accent-danger);
  color: #ffb4be;
}
</style>
