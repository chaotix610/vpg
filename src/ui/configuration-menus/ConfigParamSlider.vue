<!--
  Retro console parameter row matching the VPG PARAMETERS mockup:
  a ConfigMenuBar header (cobalt-blue -> luminous lavender when active) paired
  with a crisp white horizontal slider track and a white rounded capsule thumb
  displaying the live numeric value in VPG Retropix.
-->
<template>
  <div
    class="cfg-param-slider"
    :class="{ 'cfg-param-slider--active': active }"
    @mouseenter="$emit('hover')"
  >
    <ConfigMenuBar
      variant="category"
      :active="active"
      class="cfg-param-slider__bar"
      @click="$emit('step', 1)"
    >
      {{ label }}
    </ConfigMenuBar>

    <div class="cfg-param-slider__track-wrap" @pointerdown="onTrackPointerDown">
      <div class="cfg-param-slider__rail">
        <div class="cfg-param-slider__line" />
        <span
          class="cfg-param-slider__knob"
          :style="{ left: `${knobPercent}%` }"
          aria-hidden="true"
        >
          {{ value }}
        </span>
      </div>

      <input
        type="range"
        class="cfg-param-slider__input"
        :aria-label="ariaLabel || label"
        :min="min"
        :max="max"
        :step="1"
        :value="value"
        tabindex="-1"
        @input="onRangeInput"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ConfigMenuBar from "./ConfigMenuBar.vue";

const props = withDefaults(
  defineProps<{
    label: string;
    ariaLabel?: string;
    value: number;
    min?: number;
    max?: number;
    active?: boolean;
  }>(),
  {
    ariaLabel: "",
    min: 1,
    max: 5,
    active: false,
  },
);

const emit = defineEmits<{
  hover: [];
  step: [delta: number];
  change: [value: number];
}>();

const knobPercent = computed(() => {
  const span = Math.max(1, props.max - props.min);
  const clamped = Math.min(props.max, Math.max(props.min, props.value));
  const frac = (clamped - props.min) / span;
  // Inset 12%..88% so the white line remains visible past the pill at both min and max (matching mockup).
  return 12 + frac * 76;
});

function onTrackPointerDown(): void {
  emit("hover");
}

function onRangeInput(event: Event): void {
  const next = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(next) && next !== props.value) {
    emit("change", next);
  }
}
</script>

<style scoped>
.cfg-param-slider {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.45rem;
  pointer-events: auto;
}

.cfg-param-slider__bar {
  min-height: clamp(2.1rem, 4.5vh, 2.65rem);
}

.cfg-param-slider__track-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.15rem;
  padding: 0 11%;
  cursor: pointer;
}

.cfg-param-slider__rail {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
}

.cfg-param-slider__line {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #ffffff;
  box-shadow: 0 1px 6px rgba(6, 4, 22, 0.85);
}

.cfg-param-slider__knob {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: 1.48rem;
  height: 2.02rem;
  padding: 0 0.34rem;
  border-radius: 999px;
  background: #ffffff;
  color: #0e071a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--vpg-font-pixel);
  font-size: 1.02rem;
  font-weight: 400;
  line-height: 1;
  -webkit-font-smoothing: none;
  box-shadow: 0 2px 8px rgba(6, 4, 22, 0.8);
  transition: left 90ms ease, transform 90ms ease, background 90ms ease, box-shadow 90ms ease;
}

.cfg-param-slider--active .cfg-param-slider__line {
  background: #f0e4ff;
  box-shadow: 0 0 10px rgba(204, 168, 255, 0.75);
}

.cfg-param-slider--active .cfg-param-slider__knob {
  background: #ffffff;
  transform: translate(-50%, -50%) scale(1.08);
  box-shadow: 0 0 0 2px #cca8ff, 0 0 14px rgba(204, 168, 255, 0.85);
}

.cfg-param-slider__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
