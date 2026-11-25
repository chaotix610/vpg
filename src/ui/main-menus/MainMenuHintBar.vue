<!--
  Compact inline N64 controller hint line rendered beneath Main Menu stacks.
-->
<template>
  <p class="menu__hint">
    <template v-for="(hint, idx) in resolvedHints" :key="`${idx}-${hint.label}`">
      <template v-if="idx > 0"> &middot; </template>
      <img
        v-for="iconKey in hint.icons"
        :key="iconKey"
        class="menu__hint-icon"
        :src="icons[iconKey].src"
        :alt="icons[iconKey].alt"
      />
      {{ hint.label }}
    </template>
  </p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { loadControllerIcons, type ControllerHintItem } from "@/ui/controllerIcons";

const props = withDefaults(
  defineProps<{
    hints?: readonly ControllerHintItem[];
    canGoBack?: boolean;
  }>(),
  {
    hints: undefined,
    canGoBack: false,
  },
);

const icons = loadControllerIcons();

const resolvedHints = computed<readonly ControllerHintItem[]>(() => {
  if (props.hints) return props.hints;
  const base: ControllerHintItem[] = [
    { icons: ["dPad"], label: "move" },
    { icons: ["a"], label: "select" },
    { icons: ["z"], label: "info" },
  ];
  if (props.canGoBack) base.push({ icons: ["b"], label: "back" });
  return base;
});
</script>

<style scoped>
.menu__hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.6;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}

.menu__hint-icon {
  display: inline-block;
  width: 1.3rem;
  height: 1.3rem;
  margin: 0 0.12rem;
  object-fit: contain;
  vertical-align: middle;
}
</style>
