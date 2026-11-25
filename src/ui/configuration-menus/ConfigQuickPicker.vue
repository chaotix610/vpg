<!--
  D-Pad-navigable lavender-bordered modal grid picker for styles, presets,
  and colour swatches inside Configuration Menus.
-->
<template>
  <div class="picker-backdrop" role="dialog" aria-modal="true" :aria-label="title" @click="$emit('close')">
    <div class="picker-box" @click.stop>
      <div class="picker-box__head">
        <h3>{{ title }}</h3>
        <span>{{ cursor + 1 }} / {{ totalCount }}</span>
      </div>

      <div class="picker-grid" :class="{ 'picker-grid--swatches': isColour }">
        <button
          v-for="(item, idx) in windowItems"
          :key="item.value"
          type="button"
          class="picker-cell"
          :class="{
            'picker-cell--active': cursor === offset + idx,
            'picker-cell--current': item.value === currentValue,
          }"
          @mouseenter="$emit('hover', offset + idx)"
          @click="$emit('choose', offset + idx)"
        >
          <span
            v-if="item.colour !== undefined"
            class="picker-cell__swatch"
            :class="{ 'picker-cell__swatch--default': !item.colour }"
            :style="{ backgroundColor: item.colour ?? 'transparent' }"
          />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <p class="picker-box__hint">
        <img :src="icons.dPad.src" :alt="icons.dPad.alt" /> MOVE &middot;
        <img :src="icons.a.src" :alt="icons.a.alt" /> CHOOSE &middot;
        <img :src="icons.b.src" :alt="icons.b.alt" /> CANCEL
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { loadControllerIcons } from "@/ui/controllerIcons";
import type { ConfigPickerItem } from "./types";

defineProps<{
  title: string;
  windowItems: readonly ConfigPickerItem[];
  totalCount: number;
  offset: number;
  cursor: number;
  currentValue: number | string;
  isColour?: boolean;
}>();

defineEmits<{
  hover: [index: number];
  choose: [index: number];
  close: [];
}>();

const icons = loadControllerIcons();
</script>

<style scoped>
.picker-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(6, 4, 18, 0.78);
  z-index: 30;
}

.picker-box {
  width: min(36rem, calc(100vw - 2rem));
  padding: 1rem 1.1rem;
  background: var(--vpg-cfg-modal-bg);
  border: 4px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 32px rgba(176, 118, 255, 0.45);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.picker-box__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  color: var(--vpg-cfg-accent-lime);
  font-family: var(--vpg-font-pixel);
  letter-spacing: 0.1em;
}

.picker-box__head h3 {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-size: 1.05rem;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.picker-grid--swatches {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.picker-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.42rem 0.55rem;
  border: 1px solid rgba(154, 184, 240, 0.32);
  background: rgba(33, 66, 130, 0.85);
  color: var(--vpg-cfg-text);
  font-family: var(--vpg-font-pixel);
  font-size: 0.86rem;
  font-weight: 400;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  -webkit-font-smoothing: none;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-cell--current {
  border-color: var(--vpg-cfg-accent-lime);
}

.picker-cell--active {
  background: var(--vpg-cfg-frame-border);
  color: var(--vpg-cfg-text-active);
  border-color: #ffffff;
}

.picker-cell__swatch {
  width: 0.95rem;
  height: 0.95rem;
  border: 1px solid rgba(255, 255, 255, 0.7);
  flex: none;
}

.picker-cell__swatch--default {
  background-image: repeating-linear-gradient(135deg, transparent 0 3px, rgba(255, 255, 255, 0.35) 3px 5px);
}

.picker-box__hint {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-family: var(--vpg-font-pixel);
  font-size: 0.82rem;
  color: #c2d4f6;
}

.picker-box__hint img {
  width: 1.05rem;
  height: 1.05rem;
}
</style>
