<!--
  Three-tier console breadcrumb header (neon lime -> electric blue -> white)
  paired with a D-Pad-reachable top-right BACK bar.
-->
<template>
  <header class="cfg-header">
    <div class="cfg-breadcrumbs">
      <h1 class="cfg-crumb cfg-crumb--lime" :class="{ 'cfg-crumb--root': rootScale }">{{ top }}</h1>
      <h2 v-if="second" class="cfg-crumb cfg-crumb--blue" :class="secondClass">{{ second }}</h2>
      <h3 v-if="third" class="cfg-crumb cfg-crumb--white">{{ third }}</h3>
    </div>

    <ConfigMenuBar
      v-if="showBack"
      variant="back"
      :active="backActive"
      :disabled="backDisabled"
      data-nav-back
      @mouseenter="$emit('backHover')"
      @click="$emit('back')"
    >
      {{ backLabel }}
    </ConfigMenuBar>
  </header>
</template>

<script setup lang="ts">
import ConfigMenuBar from "./ConfigMenuBar.vue";

withDefaults(
  defineProps<{
    top: string;
    second?: string;
    secondClass?: string;
    third?: string;
    /** Enlarges the top lime breadcrumb on root / hub screens (e.g. Character Options). */
    rootScale?: boolean;
    showBack?: boolean;
    backActive?: boolean;
    backDisabled?: boolean;
    backLabel?: string;
  }>(),
  {
    second: "",
    secondClass: "",
    third: "",
    rootScale: false,
    showBack: true,
    backActive: false,
    backDisabled: false,
    backLabel: "BACK",
  },
);

defineEmits<{
  back: [];
  backHover: [];
}>();
</script>

<style scoped>
.cfg-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1.25rem 2.2rem 0;
  z-index: 12;
  pointer-events: none;
}

.cfg-breadcrumbs {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
}

.cfg-crumb {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  line-height: 1.02;
  -webkit-font-smoothing: none;
  text-shadow: 2px 2px 0 rgba(5, 8, 18, 0.92), 0 0 14px rgba(0, 0, 0, 0.65);
}

.cfg-crumb--lime {
  font-size: clamp(1.25rem, 2.5vw, 2rem);
  color: var(--vpg-cfg-crumb-primary);
}

.cfg-crumb--root {
  font-size: clamp(1.65rem, 3.3vw, 2.65rem);
}

.cfg-crumb--blue {
  margin-left: 0.85rem;
  font-size: clamp(1.55rem, 3.2vw, 2.55rem);
  color: var(--vpg-cfg-crumb-secondary);
}

.cfg-crumb--white {
  font-size: clamp(1.1rem, 2vw, 1.55rem);
  color: var(--vpg-cfg-crumb-tertiary);
}
</style>
