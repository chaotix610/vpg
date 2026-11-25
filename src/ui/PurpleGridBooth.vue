<!--
  Retro N64/AKI-style purple perspective wireframe corner booth rendered behind
  the transparent Babylon.js 3D wrestler canvas (matching the VPG mockups).
-->
<template>
  <svg
    class="purple-booth"
    viewBox="0 0 1000 1000"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="vpgBoothLeft" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stop-color="#19054a" />
        <stop offset="55%" stop-color="#3c065c" />
        <stop offset="100%" stop-color="#6c0b6e" />
      </linearGradient>
      <linearGradient id="vpgBoothRight" x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stop-color="#6c0b6e" />
        <stop offset="45%" stop-color="#3c065c" />
        <stop offset="100%" stop-color="#19054a" />
      </linearGradient>
      <linearGradient id="vpgBoothCenterGlow" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#9e1c9a" stop-opacity="0.32" />
        <stop offset="50%" stop-color="#b8259f" stop-opacity="0.52" />
        <stop offset="100%" stop-color="#7c127d" stop-opacity="0.3" />
      </linearGradient>
    </defs>

    <!-- Left and right angled purple corner walls meeting at x = centerX -->
    <rect x="0" y="0" :width="centerX" height="1000" fill="url(#vpgBoothLeft)" />
    <rect :x="centerX" y="0" :width="1000 - centerX" height="1000" fill="url(#vpgBoothRight)" />
    <rect :x="centerX - 38" y="0" width="76" height="1000" fill="url(#vpgBoothCenterGlow)" />

    <!-- Perspective grid lines on left wall -->
    <g stroke="#d7a7ff" stroke-opacity="0.52" stroke-width="1.6" fill="none">
      <line
        v-for="x in leftVerticals"
        :key="`lv-${x}`"
        :x1="x"
        y1="0"
        :x2="x"
        y2="1000"
      />
      <line
        v-for="(row, idx) in horizontalRows"
        :key="`lh-${idx}`"
        x1="0"
        :y1="row.outerY"
        :x2="centerX"
        :y2="row.innerY"
      />
    </g>

    <!-- Perspective grid lines on right wall -->
    <g stroke="#d7a7ff" stroke-opacity="0.52" stroke-width="1.6" fill="none">
      <line
        v-for="x in rightVerticals"
        :key="`rv-${x}`"
        :x1="x"
        y1="0"
        :x2="x"
        y2="1000"
      />
      <line
        v-for="(row, idx) in horizontalRows"
        :key="`rh-${idx}`"
        :x1="centerX"
        :y1="row.innerY"
        x2="1000"
        :y2="row.outerY"
      />
    </g>

    <!-- Subtle central corner ridge highlight -->
    <line
      :x1="centerX"
      y1="0"
      :x2="centerX"
      y2="1000"
      stroke="#e9b8ff"
      stroke-opacity="0.28"
      stroke-width="2"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    /** Horizontal position of the vertical V-corner seam in 0..1000 viewBox units. */
    centerX?: number;
  }>(),
  { centerX: 500 },
);

/** Perspective-foreshortened vertical lines getting denser toward the far center seam. */
const leftVerticals = computed(() => {
  const cx = props.centerX;
  const cols = 8;
  const out: number[] = [];
  for (let i = 1; i < cols; i += 1) {
    // Ease inward so strips narrow toward the center corner just like a 3D wall
    const t = Math.pow(i / cols, 0.78);
    out.push(Math.round(cx * t));
  }
  return out;
});

const rightVerticals = computed(() => {
  const cx = props.centerX;
  const span = 1000 - cx;
  const cols = 8;
  const out: number[] = [];
  for (let i = 1; i < cols; i += 1) {
    const t = Math.pow(i / cols, 0.78);
    out.push(Math.round(1000 - span * t));
  }
  return out;
});

/** Perspective horizontal grid lines sloping gently toward the center vertical corner. */
const horizontalRows = computed(() => {
  const count = 13;
  const out: { outerY: number; innerY: number }[] = [];
  for (let i = 0; i <= count; i += 1) {
    const frac = i / count; // 0..1
    const centered = frac - 0.5; // -0.5..0.5
    const outerY = 500 + centered * 1340;
    const innerY = 500 + centered * 860;
    out.push({ outerY, innerY });
  }
  return out;
});
</script>

<style scoped>
.purple-booth {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
  user-select: none;
}
</style>
