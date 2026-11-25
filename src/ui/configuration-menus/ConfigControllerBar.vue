<!--
  Bottom N64 controller legend bar for Configuration Menus. Renders an ordered
  list of button icons + action labels pinned to the bottom viewport edge.
-->
<template>
  <footer class="controller-bar">
    <span v-for="(hint, idx) in hints" :key="`${idx}-${hint.label}`">
      <img
        v-for="iconKey in hint.icons"
        :key="iconKey"
        :src="icons[iconKey].src"
        :alt="icons[iconKey].alt"
      />
      {{ hint.label }}
    </span>
  </footer>
</template>

<script setup lang="ts">
import { loadControllerIcons, type ControllerHintItem } from "@/ui/controllerIcons";

defineProps<{
  hints: readonly ControllerHintItem[];
}>();

const icons = loadControllerIcons();
</script>

<style scoped>
.controller-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.4rem 1rem;
  padding: 0.36rem 1rem;
  background: rgba(7, 9, 22, 0.84);
  border-top: 1px solid rgba(204, 168, 255, 0.28);
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #cedbff;
  z-index: 15;
}

.controller-bar span {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
}

.controller-bar img {
  width: 1.1rem;
  height: 1.1rem;
  object-fit: contain;
}
</style>
