<!--
  Z-button instructions modal for VPG Main Menus: renders structured paragraph
  and definition-list blocks over a darkened translucent scrim.
-->
<template>
  <div class="modal" role="dialog" aria-modal="true" :aria-label="instructions.title" @click="$emit('close')">
    <div class="modal__box" @click.stop>
      <h2 class="modal__title">{{ instructions.title }}</h2>
      <template v-for="(block, i) in instructions.blocks" :key="i">
        <p v-if="block.type === 'paragraph'" class="modal__paragraph">
          {{ block.text }}
        </p>
        <dl v-else class="modal__list">
          <template v-for="entry in block.items" :key="entry.term">
            <dt>{{ entry.term }}</dt>
            <dd>{{ entry.definition }}</dd>
          </template>
        </dl>
      </template>
      <p class="modal__close">
        <img class="modal__icon" :src="icons.z.src" :alt="icons.z.alt" />
        or
        <img class="modal__icon" :src="icons.b.src" :alt="icons.b.alt" />
        to close
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Instructions } from "@/content/mainMenu";
import { loadControllerIcons } from "@/ui/controllerIcons";

defineProps<{
  instructions: Instructions;
}>();

defineEmits<{
  close: [];
}>();

const icons = loadControllerIcons();
</script>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vpg-main-modal-scrim);
  z-index: 20;
}

.modal__box {
  width: min(90%, 32rem);
  max-height: 80vh;
  overflow-y: auto;
  padding: 1.5rem;
  border: 1px solid var(--vpg-main-modal-border);
  border-radius: 0.5rem;
  background: var(--vpg-main-surface);
}

.modal__title {
  margin: 0 0 0.9rem;
  font-family: var(--vpg-font-body);
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  color: var(--vpg-item-color-active);
}

.modal__paragraph {
  margin: 0 0 0.8rem;
  font-size: 0.88rem;
  line-height: 1.55;
}

.modal__list {
  margin: 0 0 0.8rem;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 1rem;
  font-size: 0.88rem;
}

.modal__list dt {
  font-weight: 600;
}

.modal__list dd {
  margin: 0;
  opacity: 0.8;
}

.modal__close {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  opacity: 0.6;
}

.modal__icon {
  display: inline-block;
  width: 1.3rem;
  height: 1.3rem;
  margin: 0 0.12rem;
  object-fit: contain;
  vertical-align: middle;
}
</style>
