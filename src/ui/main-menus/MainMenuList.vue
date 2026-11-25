<!--
  Signature tightly stacked VPG Impact menu list used on Main Menu pages.
  Active, hovered, and keyboard-focused entries shift from white to fiery amber
  with a heavy black outline and the pulsing green horizontal glowPulse halo.
-->
<template>
  <ul class="items">
    <li v-for="(item, index) in items" :key="item.id">
      <button
        type="button"
        class="item"
        :class="{ 'item--active': index === activeIndex }"
        :disabled="item.disabled"
        @click="$emit('select', index)"
        @mouseenter="$emit('hover', index)"
        @focus="$emit('focusItem', index)"
      >
        {{ item.label }}
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
export interface MainMenuEntry {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
}

defineProps<{
  items: readonly MainMenuEntry[];
  activeIndex: number;
}>();

defineEmits<{
  select: [index: number];
  hover: [index: number];
  focusItem: [index: number];
}>();
</script>

<style scoped>
.items {
  margin: 0;
  padding: 0;
  list-style: none;
  text-align: center;
}

.item {
  display: block;
  width: calc(100% - 8px);
  color: var(--vpg-item-color-idle);
  letter-spacing: -2px;
  /* Deliberately far tighter than the type size, matching the stacked retro title menus. */
  line-height: 18px !important;
  -webkit-text-stroke-width: 0.5px;
  -webkit-text-stroke-color: var(--vpg-item-stroke);
  padding: 10px 20px;
  font-family: var(--vpg-font-menu-item);
  font-size: var(--vpg-item-size);
  font-weight: 700;
  text-decoration: none;
  position: relative;
  background: transparent;
  border: none;
  cursor: pointer;
  margin: 4px;
  transition: -webkit-text-fill-color var(--vpg-state-transition),
    -webkit-text-stroke-width var(--vpg-state-transition);
}

.item:disabled {
  color: var(--vpg-item-color-disabled);
  cursor: not-allowed;
  animation: none;
}

.item--active,
.item:hover:not(:disabled),
.item:focus-visible:not(:disabled) {
  outline: none;
  -webkit-text-fill-color: var(--vpg-item-color-active);
  -webkit-text-stroke-width: 2px;
  animation: glowPulse 1s ease-in-out infinite;
}
</style>
