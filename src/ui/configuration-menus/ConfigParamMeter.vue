<!--
  Segmented console stat/parameter meter rendered inside a ConfigMenuBar.
  Automatically switches from lime segments to cobalt segments when active.
-->
<template>
  <span class="cfg-meter" :class="{ 'cfg-meter--active': active }" aria-hidden="true">
    <span class="cfg-meter__fill" :style="{ width: `${percent}%` }" />
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    value: number;
    max: number;
    active?: boolean;
  }>(),
  { active: false },
);

const percent = computed(() => {
  if (props.max <= 0) return 0;
  return Math.min(100, Math.max(0, (props.value / props.max) * 100));
});
</script>

<style scoped>
.cfg-meter {
  display: block;
  height: 0.72rem;
  background: rgba(6, 10, 26, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.35);
  overflow: hidden;
  position: relative;
}

.cfg-meter__fill {
  display: block;
  height: 100%;
  background: repeating-linear-gradient(90deg, #b6ff74 0 8px, #58c948 8px 10px);
}

.cfg-meter--active {
  border-color: var(--vpg-cfg-text-active);
}

.cfg-meter--active .cfg-meter__fill {
  background: repeating-linear-gradient(90deg, #2758c9 0 8px, #12338a 8px 10px);
}
</style>
