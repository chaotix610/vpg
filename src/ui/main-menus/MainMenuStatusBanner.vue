<!--
  Transient gold status notice rendered beneath the Main Menu hint bar.
-->
<template>
  <p v-if="message" class="menu__status" role="status" aria-live="polite">
    {{ message }}
  </p>
</template>

<script setup lang="ts">
defineProps<{
  message: string;
}>();
</script>

<style scoped>
.menu__status {
  margin: 0;
  color: var(--vpg-main-status);
  font-size: 0.85rem;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}
</style>
