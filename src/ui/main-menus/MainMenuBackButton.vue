<!--
  Submenu Back button styled for VPG Main Menus: dark slate card with subtle
  border that transitions to amber border and warm halo when focused/active.
-->
<template>
  <button
    type="button"
    class="menu__back"
    :class="{ 'menu__back--active': active }"
    @focus="$emit('focus')"
    @mouseenter="$emit('hover')"
    @click="$emit('select')"
  >
    <span aria-hidden="true">&larr;</span> {{ label }}
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    active?: boolean;
    label?: string;
  }>(),
  {
    active: false,
    label: "Back",
  },
);

defineEmits<{
  select: [];
  hover: [];
  focus: [];
}>();
</script>

<style scoped>
.menu__back {
  padding: 0.55rem 1.25rem;
  border: 1px solid var(--vpg-main-border);
  border-radius: 0.3rem;
  background: var(--vpg-main-surface);
  color: var(--vpg-item-color-idle);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--vpg-state-transition),
    box-shadow var(--vpg-state-transition);
}

.menu__back--active,
.menu__back:hover,
.menu__back:focus-visible {
  border-color: var(--vpg-item-color-active);
  box-shadow: 0 0 14px rgba(242, 143, 61, 0.25);
}

.menu__back:focus-visible {
  outline: 2px solid var(--vpg-item-color-active);
  outline-offset: 3px;
}
</style>
