<!--
  Full-viewport shell for VPG Main Menus: arena backdrop image, dark fallback,
  centered vertical flex stack, and pointermove event forwarding for hover
  suppression across page transitions.
-->
<template>
  <div class="menu" :style="backgroundStyle" @pointermove="$emit('pointermove', $event)">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { resolveAsset } from "@/content/assets";

const props = withDefaults(
  defineProps<{
    /** Runtime asset path under public/ for the full-bleed arena backdrop. */
    backdropAsset?: string;
  }>(),
  {
    backdropAsset: "assets/ui/textures/artwork/arena1.png",
  },
);

defineEmits<{
  pointermove: [event: PointerEvent];
}>();

const backgroundStyle = computed((): Record<string, string> => {
  const url = resolveAsset(props.backdropAsset);
  return url ? { backgroundImage: `url(${url})` } : {};
});
</script>

<style scoped>
.menu {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  padding: 2rem 1rem;
  box-sizing: border-box;
  overflow: hidden;
  background-color: var(--vpg-main-bg);
  background-size: cover;
  background-position: center;
  color: #f2f5f8;
  font-family: var(--vpg-font-body);
}
</style>
