<!-- Vue presentation module. Teaching focus: how reactive screen state calls domain stores and presents results without owning gameplay rules. File: src/app/App.vue -->
<!--
  Adapted from VirtualProGrappler-V2's App.vue. V2 waits for its save system
  and confirms Exit with a backup prompt; this project has neither, so Exit
  goes straight to the "Session ended" screen.
-->
<template>
  <div v-if="ended" class="session-screen"><h1>Session ended</h1><button @click="ended = false">Return to Main Menu</button></div>
  <MainMenu v-else :start-in-viewer="startInViewer" @exit="ended = true" />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import MainMenu from "./MainMenu.vue";
import { hasViewerHash } from "@/app/viewerHash";

export default defineComponent({
  name: "App",
  components: { MainMenu },
  data() {
    return {
      ended: false,
      // A viewer bookmark (#character=…&animation=…) skips the menus.
      startInViewer: hasViewerHash(),
    };
  },
});
</script>

<style>
.session-screen { position: absolute; inset: 0; display: grid; place-content: center; gap: 1rem; text-align: center; background: #0b0e14; color: #f2f5f8; }
.session-screen button { background: #202938; color: inherit; font: inherit; padding: .7rem; border: 1px solid #e4c28f; cursor: pointer; }
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: var(--vpg-font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
