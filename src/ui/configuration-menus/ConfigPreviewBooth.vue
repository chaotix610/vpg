<!--
  Persistent repositionable 3D preview container for Configuration Menus.
  Layers PurpleGridBooth behind a transparent WebGL canvas (or custom visual)
  and automatically shifts the viewport and HUD strips clear of overlapping
  menu rails across all 5 console booth layouts.
-->
<template>
  <div class="stage-host" :class="hostClasses">
    <PurpleGridBooth :center-x="centerX" />

    <slot />

    <div v-if="loading" class="stage-loading">
      {{ loadingLabel }}
    </div>

    <div v-if="$slots['hud-bottom']" class="booth-hud booth-hud--bottom">
      <slot name="hud-bottom" />
    </div>

    <div v-if="$slots['hud-top-left']" class="booth-hud booth-hud--top-left">
      <slot name="hud-top-left" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import PurpleGridBooth from "@/ui/PurpleGridBooth.vue";
import type { ConfigBoothLayout } from "./types";

const props = withDefaults(
  defineProps<{
    layout: ConfigBoothLayout;
    centerX?: number;
    loading?: boolean;
    loadingLabel?: string;
  }>(),
  {
    centerX: 500,
    loading: false,
    loadingLabel: "LOADING…",
  },
);

const hostClasses = computed(() => {
  switch (props.layout) {
    case "split-right":
      return "stage-host--split-right";
    case "framed-center":
      return "stage-host--framed-center";
    case "framed-moves":
      return "stage-host--framed-wide stage-host--framed-moves";
    case "framed-moves-detail":
      return "stage-host--framed-wide stage-host--framed-moves-detail";
    case "framed-rail":
      return "stage-host--framed-wide stage-host--framed-rail";
    case "fullscreen":
      return "stage-host--fullscreen";
  }
});
</script>

<style scoped>
.stage-host {
  position: absolute;
  overflow: hidden;
  z-index: 2;
  transition: inset 180ms ease, left 180ms ease, right 180ms ease, top 180ms ease, bottom 180ms ease;
}

.stage-host--split-right {
  top: 0;
  right: 0;
  bottom: 0;
  left: 58%;
  border-left: 2px solid rgba(206, 168, 255, 0.35);
}

.stage-host--framed-center {
  top: 19%;
  bottom: 11%;
  left: 8%;
  right: 8%;
  border: 10px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 28px var(--vpg-cfg-frame-glow), inset 0 0 24px rgba(18, 4, 42, 0.55);
}

.stage-host--framed-wide {
  top: 21%;
  bottom: 11%;
  left: 9%;
  right: 8%;
  border: 10px solid var(--vpg-cfg-frame-border);
  box-shadow: 0 0 28px var(--vpg-cfg-frame-glow), inset 0 0 24px rgba(18, 4, 42, 0.55);
}

.stage-host--fullscreen {
  inset: 0;
  border: 0;
  box-shadow: none;
}

:slotted(.stage-canvas) {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  outline: none;
  touch-action: none;
}

.stage-host--framed-moves :slotted(.stage-canvas) {
  left: 26%;
  width: 74%;
}

.stage-host--framed-moves-detail :slotted(.stage-canvas) {
  left: 33%;
  width: 67%;
}

.stage-host--framed-rail :slotted(.stage-canvas) {
  left: 36%;
  width: 64%;
}

.stage-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(18, 4, 44, 0.6);
  color: #c2ff7e;
  font-family: var(--vpg-font-pixel);
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  pointer-events: none;
}

.booth-hud {
  position: absolute;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.3rem;
  z-index: 3;
  pointer-events: none;
}

.booth-hud--top-left {
  top: 0.65rem;
  left: 1rem;
}

.stage-host--framed-moves .booth-hud--top-left {
  left: 28%;
}

.stage-host--framed-moves-detail .booth-hud--top-left {
  left: 34.5%;
}

.stage-host--framed-rail .booth-hud--top-left {
  left: 38%;
}

.booth-hud--bottom {
  left: 0.5rem;
  right: 0.5rem;
  bottom: 2.25rem;
  justify-content: center;
  flex-wrap: wrap;
}

.stage-host--framed-center .booth-hud--bottom {
  left: 24%;
  right: 24%;
  bottom: 0.45rem;
}

.stage-host--framed-moves .booth-hud--bottom {
  left: 27%;
  right: 0.6rem;
  bottom: 0.45rem;
}

.stage-host--framed-moves-detail .booth-hud--bottom {
  left: 34%;
  right: 0.6rem;
  bottom: 0.45rem;
}

.stage-host--framed-rail .booth-hud--bottom {
  left: 37%;
  right: 0.6rem;
  bottom: 0.45rem;
}

@media (max-width: 900px) {
  .stage-host--split-right {
    left: 50%;
  }
}
</style>
