<!--
  Main Menu page header: renders custom logo artwork when configured, or falls
  back to an uppercase VPG Retropix display heading.
-->
<template>
  <img
    v-if="src"
    class="menu__heading"
    :src="src"
    :alt="title"
  />
  <h1 v-else class="menu__heading-text">{{ title }}</h1>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  src?: string | null;
}>();
</script>

<style scoped>
.menu__heading {
  max-width: min(80%, 26rem);
  height: auto;
  image-rendering: auto;
}

.menu__heading-text {
  margin: 0;
  font-family: var(--vpg-font-display);
  font-size: clamp(1.6rem, 5vw, 2.6rem);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
</style>
