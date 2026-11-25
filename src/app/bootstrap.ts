import { createApp } from "vue";
import App from "./App.vue";
import { loadSavedBindings } from "@/input/controls";
import { loadSavedAudioSettings } from "@/audio/menuAudio";
import { loadSavedArenas } from "@/save/arenaStore";
import { loadSavedCharacters } from "@/save/characterStore";
import "@/ui/global.css";

/** Restore player preferences, saved arenas and saved characters before mounting the menus. */
export function bootstrap(): void {
  loadSavedBindings();
  loadSavedAudioSettings();
  loadSavedArenas();
  loadSavedCharacters();
  createApp(App).mount("#app");
}
